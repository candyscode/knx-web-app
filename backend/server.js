const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const KnxService = require('./knxService');
const HueService = require('./hueService');
const {
  getAllApartmentRooms,
  getAllSharedRooms,
  getApartmentById,
  getSharedAccessApartment,
  normalizeArea,
  normalizeConfigShape,
  normalizeImportedGroupAddresses,
  normalizeAlarm,
  normalizeSharedInfo,
  slugifyApartmentName,
} = require('./configModel');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

const CONFIG_FILE = path.join(__dirname, 'config.json');
const apartmentContexts = new Map();

let config = normalizeConfigShape({});

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig();
    return;
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = normalizeConfigShape(JSON.parse(data));
  } catch (error) {
    console.error('Error parsing config.json', error);
    config = normalizeConfigShape({});
  }
}

function saveConfig() {
  config = normalizeConfigShape(config);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function createApartmentEmitter(apartmentId) {
  return {
    emit(event, data) {
      const context = apartmentContexts.get(apartmentId);
      const scopeForGa = (groupAddress) => {
        if (context?.tracking?.sharedGaSet?.has(groupAddress)) return 'shared';
        return 'apartment';
      };

      if (event === 'knx_status') {
        io.emit('knx_status', { ...data, apartmentId, scope: 'apartment' });
        if (config.building.sharedAccessApartmentId === apartmentId) {
          io.emit('knx_status', { ...data, apartmentId, scope: 'shared' });
        }
        return;
      }

      if (event === 'knx_error') {
        io.emit('knx_error', { ...data, apartmentId, scope: 'apartment' });
        if (config.building.sharedAccessApartmentId === apartmentId) {
          io.emit('knx_error', { ...data, apartmentId, scope: 'shared' });
        }
        return;
      }

      if (event === 'knx_state_update') {
        io.emit('knx_state_update', {
          ...data,
          apartmentId,
          scope: scopeForGa(data.groupAddress),
        });
        return;
      }

      io.emit(event, { ...data, apartmentId });
    },
  };
}

function ensureApartmentContext(apartmentId) {
  if (apartmentContexts.has(apartmentId)) return apartmentContexts.get(apartmentId);

  const context = {
    apartmentId,
    knxService: new KnxService(createApartmentEmitter(apartmentId)),
    hueService: new HueService(),
    huePollingInterval: null,
    tracking: {
      gaToType: {},
      gaToDpt: {},
      apartmentGaSet: new Set(),
      sharedGaSet: new Set(),
      statusGAs: new Set(),
    },
  };

  apartmentContexts.set(apartmentId, context);
  return context;
}

function syncApartmentContexts() {
  const nextApartmentIds = new Set(config.apartments.map((apartment) => apartment.id));

  config.apartments.forEach((apartment) => {
    const context = ensureApartmentContext(apartment.id);
    context.hueService.init(apartment.hue);
  });

  for (const [apartmentId, context] of apartmentContexts.entries()) {
    if (nextApartmentIds.has(apartmentId)) continue;

    stopHuePolling(apartmentId);
    try {
      context.knxService.connect('', 3671);
    } catch (error) {
      console.error(`Failed to disconnect removed apartment ${apartmentId}:`, error.message);
    }
    apartmentContexts.delete(apartmentId);
  }
}

function getRoomsForApartmentScope(apartmentId) {
  const apartment = getApartmentById(config, apartmentId);
  return apartment ? getAllApartmentRooms(apartment) : [];
}

function getRoomsForSharedScope() {
  return getAllSharedRooms(config);
}

function getRoomsForHuePolling(apartmentId) {
  const rooms = [...getRoomsForApartmentScope(apartmentId)];
  if (config.building.sharedAccessApartmentId === apartmentId) {
    rooms.push(...getRoomsForSharedScope());
  }
  return rooms;
}

function buildKnxTrackingMaps(apartmentId) {
  const apartment = getApartmentById(config, apartmentId);
  const sharedAccessApartment = getSharedAccessApartment(config);
  const includeShared = sharedAccessApartment?.id === apartmentId;

  const statusGAs = new Set();
  const gaToType = {};
  const gaToDpt = {};
  const apartmentGaSet = new Set();
  const sharedGaSet = new Set();

  const registerRoomSet = (rooms, scope) => {
    const scopedSet = scope === 'shared' ? sharedGaSet : apartmentGaSet;

    rooms.forEach((room) => {
      if (room.roomTemperatureGroupAddress) {
        statusGAs.add(room.roomTemperatureGroupAddress);
        gaToType[room.roomTemperatureGroupAddress] = 'info';
        gaToDpt[room.roomTemperatureGroupAddress] = 'DPT9.001';
        scopedSet.add(room.roomTemperatureGroupAddress);
      }

      (room.functions || []).forEach((func) => {
        if (func.statusGroupAddress) {
          statusGAs.add(func.statusGroupAddress);
          gaToType[func.statusGroupAddress] = func.type;
          scopedSet.add(func.statusGroupAddress);
        }
        if (func.groupAddress) {
          gaToType[func.groupAddress] = func.type;
          scopedSet.add(func.groupAddress);
        }
        if (func.movingGroupAddress) {
          gaToType[func.movingGroupAddress] = 'moving';
          scopedSet.add(func.movingGroupAddress);
        }
      });

      if (room.sceneGroupAddress) {
        gaToType[room.sceneGroupAddress] = 'scene';
        scopedSet.add(room.sceneGroupAddress);
      }
    });
  };

  registerRoomSet(apartment ? getAllApartmentRooms(apartment) : [], 'apartment');

  (apartment?.alarms || []).forEach((alarm) => {
    if (!alarm?.statusGroupAddress) return;
    statusGAs.add(alarm.statusGroupAddress);
    gaToType[alarm.statusGroupAddress] = 'alarm';
    gaToDpt[alarm.statusGroupAddress] = alarm.dpt || 'DPT1.001';
    apartmentGaSet.add(alarm.statusGroupAddress);
  });

  if (includeShared) {
    (config.building.sharedInfos || []).forEach((info) => {
      if (!info?.statusGroupAddress) return;
      statusGAs.add(info.statusGroupAddress);
      gaToType[info.statusGroupAddress] = 'info';
      if (info.dpt) gaToDpt[info.statusGroupAddress] = info.dpt;
      sharedGaSet.add(info.statusGroupAddress);
    });

    registerRoomSet(getRoomsForSharedScope(), 'shared');
  }

  return { statusGAs, gaToType, gaToDpt, apartmentGaSet, sharedGaSet };
}

function refreshKnxSubscriptions(apartmentId, { requestReads = false } = {}) {
  const context = apartmentContexts.get(apartmentId);
  if (!context) return;

  context.tracking = buildKnxTrackingMaps(apartmentId);
  context.knxService.setGaToType(context.tracking.gaToType);
  context.knxService.setGaToDpt(context.tracking.gaToDpt);
  context.knxService.setSceneTriggerCallback((groupAddress, sceneNumber) => {
    const scope = context.tracking.sharedGaSet.has(groupAddress) ? 'shared' : 'apartment';
    handleExternalSceneTrigger(apartmentId, scope, groupAddress, sceneNumber);
  });

  if (!requestReads || !context.knxService.isConnected) return;

  let delay = 0;
  context.tracking.statusGAs.forEach((groupAddress) => {
    setTimeout(() => context.knxService.readStatus(groupAddress), delay);
    delay += 50;
  });
}

function establishConnection(apartmentId) {
  const apartment = getApartmentById(config, apartmentId);
  const context = apartmentContexts.get(apartmentId);
  if (!apartment || !context) return;

  if (!apartment.knxIp) {
    context.knxService.connect('', apartment.knxPort || 3671);
    return;
  }

  context.knxService.connect(apartment.knxIp, apartment.knxPort, () => {
    refreshKnxSubscriptions(apartmentId, { requestReads: true });
  });
}

function stopHuePolling(apartmentId) {
  const context = apartmentContexts.get(apartmentId);
  if (!context?.huePollingInterval) return;

  clearInterval(context.huePollingInterval);
  context.huePollingInterval = null;
}

function startHuePolling(apartmentId) {
  const context = apartmentContexts.get(apartmentId);
  if (!context) return;

  stopHuePolling(apartmentId);
  if (!context.hueService.isPaired) return;

  context.huePollingInterval = setInterval(async () => {
    const privateHueIds = new Set();
    const sharedHueIds = new Set();

    getRoomsForApartmentScope(apartmentId).forEach((room) => {
      (room.functions || []).forEach((func) => {
        if (func.type === 'hue' && func.hueLightId) privateHueIds.add(func.hueLightId);
      });
    });

    if (config.building.sharedAccessApartmentId === apartmentId) {
      getRoomsForSharedScope().forEach((room) => {
        (room.functions || []).forEach((func) => {
          if (func.type === 'hue' && func.hueLightId) sharedHueIds.add(func.hueLightId);
        });
      });
    }

    const apartmentStates = await context.hueService.getLightStates([...privateHueIds]);
    if (Object.keys(apartmentStates).length > 0) {
      io.emit('hue_states', { apartmentId, scope: 'apartment', states: apartmentStates });
    }

    if (sharedHueIds.size > 0) {
      const sharedStates = await context.hueService.getLightStates([...sharedHueIds]);
      if (Object.keys(sharedStates).length > 0) {
        io.emit('hue_states', { apartmentId, scope: 'shared', states: sharedStates });
      }
    }
  }, 5000);
}

function getKnxStatusPayload(apartmentId, scope = 'apartment') {
  const apartment = getApartmentById(config, apartmentId);
  const context = apartmentContexts.get(apartmentId);
  const hasKnxIp = !!apartment?.knxIp;
  const connected = !!context?.knxService?.isConnected;

  return {
    apartmentId,
    scope,
    connected,
    msg: connected ? 'Connected to bus' : (hasKnxIp ? 'Disconnected from bus' : 'No KNX IP Configured'),
  };
}

function emitAllStatuses(socket) {
  const emitter = socket || io;

  config.apartments.forEach((apartment) => {
    emitter.emit('knx_status', getKnxStatusPayload(apartment.id, 'apartment'));

    const context = apartmentContexts.get(apartment.id);
    emitter.emit('hue_status', {
      apartmentId: apartment.id,
      scope: 'apartment',
      paired: !!context?.hueService?.isPaired,
      bridgeIp: context?.hueService?.bridgeIp || '',
    });
  });

  const sharedAccessApartment = getSharedAccessApartment(config);
  if (sharedAccessApartment) {
    const context = apartmentContexts.get(sharedAccessApartment.id);
    emitter.emit('knx_status', getKnxStatusPayload(sharedAccessApartment.id, 'shared'));
    emitter.emit('hue_status', {
      apartmentId: sharedAccessApartment.id,
      scope: 'shared',
      paired: !!context?.hueService?.isPaired,
      bridgeIp: context?.hueService?.bridgeIp || '',
    });
  }
}

function buildStateSnapshot() {
  const apartments = {};

  config.apartments.forEach((apartment) => {
    const context = apartmentContexts.get(apartment.id);
    const apartmentStates = {};

    Object.entries(context?.knxService?.deviceStates || {}).forEach(([groupAddress, value]) => {
      if (context?.tracking?.sharedGaSet?.has(groupAddress)) return;
      apartmentStates[groupAddress] = value;
    });

    apartments[apartment.id] = apartmentStates;
  });

  const sharedStates = {};
  const sharedAccessApartment = getSharedAccessApartment(config);
  const sharedContext = sharedAccessApartment ? apartmentContexts.get(sharedAccessApartment.id) : null;
  Object.entries(sharedContext?.knxService?.deviceStates || {}).forEach(([groupAddress, value]) => {
    if (!sharedContext?.tracking?.sharedGaSet?.has(groupAddress)) return;
    sharedStates[groupAddress] = value;
  });

  return { apartments, shared: sharedStates };
}

function applyConfigPatch(payload) {
  if (!payload || typeof payload !== 'object') return;

  if (Array.isArray(payload.apartments) || payload.building || payload.version === 2) {
    config = normalizeConfigShape(payload);
    return;
  }

  const apartmentId = payload.apartmentId || config.apartments[0]?.id;
  const apartment = getApartmentById(config, apartmentId);
  if (!apartment) return;

  if (payload.scope === 'shared' || payload.target === 'building') {
    if (payload.sharedInfos !== undefined) {
      config.building.sharedInfos = Array.isArray(payload.sharedInfos)
        ? payload.sharedInfos.map(normalizeSharedInfo).filter(Boolean)
        : [];
    }

    if (payload.sharedAreas !== undefined || payload.floors !== undefined) {
      const areas = payload.sharedAreas !== undefined ? payload.sharedAreas : payload.floors;
      config.building.sharedAreas = Array.isArray(areas) ? areas.map(normalizeArea) : [];
    }

    if (payload.sharedImportedGroupAddresses !== undefined || payload.importedGroupAddresses !== undefined) {
      config.building.sharedImportedGroupAddresses = normalizeImportedGroupAddresses(
        payload.sharedImportedGroupAddresses !== undefined
          ? payload.sharedImportedGroupAddresses
          : payload.importedGroupAddresses
      );
    }

    if (payload.sharedImportedGroupAddressesFileName !== undefined || payload.importedGroupAddressesFileName !== undefined) {
      config.building.sharedImportedGroupAddressesFileName =
        typeof (payload.sharedImportedGroupAddressesFileName !== undefined
          ? payload.sharedImportedGroupAddressesFileName
          : payload.importedGroupAddressesFileName) === 'string'
          ? (payload.sharedImportedGroupAddressesFileName !== undefined
            ? payload.sharedImportedGroupAddressesFileName
            : payload.importedGroupAddressesFileName)
          : '';
    }

    if (payload.sharedUsesApartmentImportedGroupAddresses !== undefined) {
      config.building.sharedUsesApartmentImportedGroupAddresses = payload.sharedUsesApartmentImportedGroupAddresses === true;
      if (config.building.sharedUsesApartmentImportedGroupAddresses) {
        config.building.sharedImportedGroupAddresses = [];
        config.building.sharedImportedGroupAddressesFileName = '';
      }
    }

    if (payload.sharedAccessApartmentId !== undefined && getApartmentById(config, payload.sharedAccessApartmentId)) {
      config.building.sharedAccessApartmentId = payload.sharedAccessApartmentId;
    }

    return;
  }

  if (payload.name !== undefined && typeof payload.name === 'string' && payload.name.trim()) {
    apartment.name = payload.name.trim();
  }

  if (payload.slug !== undefined && typeof payload.slug === 'string' && payload.slug.trim()) {
    const usedSlugs = new Set(
      config.apartments
        .filter((entry) => entry.id !== apartment.id)
        .map((entry) => entry.slug)
    );
    let slug = slugifyApartmentName(payload.slug.trim());
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${slugifyApartmentName(payload.slug.trim())}-${suffix}`;
      suffix += 1;
    }
    apartment.slug = slug;
  }

  if (payload.knxIp !== undefined) apartment.knxIp = payload.knxIp;
  if (payload.knxPort !== undefined) apartment.knxPort = parseInt(payload.knxPort, 10) || 3671;
  if (payload.hue !== undefined && payload.hue && typeof payload.hue === 'object') {
    apartment.hue = {
      bridgeIp: typeof payload.hue.bridgeIp === 'string' ? payload.hue.bridgeIp : '',
      apiKey: typeof payload.hue.apiKey === 'string' ? payload.hue.apiKey : '',
    };
  }

  if (payload.floors !== undefined) {
    apartment.floors = Array.isArray(payload.floors) ? payload.floors.map(normalizeArea) : [];
    apartment.areaOrder = apartment.floors.map((floor) => floor.id);
  } else if (payload.rooms !== undefined) {
    apartment.floors = [{
      id: apartment.floors[0]?.id || 'area_default',
      name: apartment.floors[0]?.name || 'Ground Floor',
      rooms: Array.isArray(payload.rooms) ? payload.rooms : [],
    }].map(normalizeArea);
    apartment.areaOrder = apartment.floors.map((floor) => floor.id);
  }

  if (payload.areaOrder !== undefined) {
    apartment.areaOrder = Array.isArray(payload.areaOrder)
      ? payload.areaOrder.filter((entry) => typeof entry === 'string')
      : [];
  }

  if (payload.alarms !== undefined) {
    apartment.alarms = Array.isArray(payload.alarms)
      ? payload.alarms.map(normalizeAlarm).filter(Boolean)
      : [];
  }

  if (payload.globals !== undefined) {
    apartment.alarms = Array.isArray(payload.globals)
      ? payload.globals.filter((entry) => entry?.type === 'alarm').map(normalizeAlarm).filter(Boolean)
      : [];
    config.building.sharedInfos = Array.isArray(payload.globals)
      ? payload.globals.filter((entry) => entry?.type !== 'alarm').map(normalizeSharedInfo).filter(Boolean)
      : [];
  }

  if (payload.importedGroupAddresses !== undefined) {
    apartment.importedGroupAddresses = normalizeImportedGroupAddresses(payload.importedGroupAddresses);
  }

  if (payload.importedGroupAddressesFileName !== undefined) {
    apartment.importedGroupAddressesFileName =
      typeof payload.importedGroupAddressesFileName === 'string'
        ? payload.importedGroupAddressesFileName
        : '';
  }
}

function findRoom(roomId, apartmentId, scope = 'apartment') {
  if (scope === 'shared') {
    return getRoomsForSharedScope().find((room) => room.id === roomId) || null;
  }

  return getRoomsForApartmentScope(apartmentId).find((room) => room.id === roomId) || null;
}

function findScene(sceneId, apartmentId, scope = 'apartment') {
  const rooms = scope === 'shared' ? getRoomsForSharedScope() : getRoomsForApartmentScope(apartmentId);
  for (const room of rooms) {
    const scene = (room.scenes || []).find((entry) => entry.id === sceneId);
    if (scene) return scene;
  }
  return null;
}

function getActionContext(apartmentId, scope = 'apartment') {
  if (scope === 'shared') {
    const sharedAccessApartment = getSharedAccessApartment(config);
    if (!sharedAccessApartment) return null;
    return {
      apartmentId: sharedAccessApartment.id,
      scope: 'shared',
      context: apartmentContexts.get(sharedAccessApartment.id),
    };
  }

  const resolvedApartmentId = apartmentId || config.apartments[0]?.id;
  return {
    apartmentId: resolvedApartmentId,
    scope: 'apartment',
    context: apartmentContexts.get(resolvedApartmentId),
  };
}

async function triggerLinkedHueScene(apartmentId, scope, groupAddress, sceneNumber) {
  const actionContext = getActionContext(apartmentId, scope);
  if (!actionContext?.context?.hueService?.isPaired) return;

  const rooms = scope === 'shared' ? getRoomsForSharedScope() : getRoomsForApartmentScope(actionContext.apartmentId);

  for (const room of rooms) {
    if (room.sceneGroupAddress !== groupAddress) continue;

    const scene = (room.scenes || []).find(
      (entry) => entry.sceneNumber === sceneNumber && entry.category !== 'shade'
    );
    if (!scene) return;

    const isOff = scene.name && /^(aus|off)$/i.test(scene.name.trim());
    if (isOff && room.hueRoomId) {
      await actionContext.context.hueService.turnOffRoom(room.hueRoomId);
    } else if (scene.hueSceneId) {
      await actionContext.context.hueService.triggerScene(scene.hueSceneId);
    }
    return;
  }
}

async function handleExternalSceneTrigger(apartmentId, scope, groupAddress, sceneNumber) {
  await triggerLinkedHueScene(apartmentId, scope, groupAddress, sceneNumber);
}

loadConfig();
syncApartmentContexts();
config.apartments.forEach((apartment) => {
  refreshKnxSubscriptions(apartment.id);
  if (apartment.knxIp) establishConnection(apartment.id);
  startHuePolling(apartment.id);
});

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  const previousConfig = normalizeConfigShape(config);

  applyConfigPatch(req.body);
  config = normalizeConfigShape(config);
  saveConfig();
  syncApartmentContexts();

  config.apartments.forEach((apartment) => {
    const previousApartment = getApartmentById(previousConfig, apartment.id);
    const knxChanged = !previousApartment
      || previousApartment.knxIp !== apartment.knxIp
      || previousApartment.knxPort !== apartment.knxPort;

    if (knxChanged) establishConnection(apartment.id);
    else refreshKnxSubscriptions(apartment.id, { requestReads: true });

    startHuePolling(apartment.id);
  });

  emitAllStatuses();

  res.json({ success: true, config });
});

app.post('/api/dev/load-config', (req, res) => {
  const devConfigFile = path.join(__dirname, 'config.dev.json');
  if (!fs.existsSync(devConfigFile)) {
    res.status(404).json({ success: false, error: 'config.dev.json not found' });
    return;
  }

  try {
    const data = fs.readFileSync(devConfigFile, 'utf8');
    config = normalizeConfigShape(JSON.parse(data));
    saveConfig();
    syncApartmentContexts();
    config.apartments.forEach((apartment) => {
      refreshKnxSubscriptions(apartment.id);
      establishConnection(apartment.id);
      startHuePolling(apartment.id);
    });
    emitAllStatuses();
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error parsing config.dev.json', error);
    res.status(500).json({ success: false, error: 'Internal Server Error reading dev config' });
  }
});

app.post('/api/action', async (req, res) => {
  const { apartmentId, scope = 'apartment', groupAddress, type, sceneNumber, value } = req.body;
  const actionContext = getActionContext(apartmentId, scope);

  if (!actionContext?.context?.knxService) {
    res.status(400).json({ success: false, error: 'No KNX context available' });
    return;
  }

  try {
    if (type === 'scene') {
      actionContext.context.knxService.writeScene(groupAddress, sceneNumber);
      await triggerLinkedHueScene(actionContext.apartmentId, scope, groupAddress, sceneNumber);
    } else if (type === 'percentage') {
      actionContext.context.knxService.writeGroupValue(groupAddress, value, 'DPT5.001');
    } else {
      actionContext.context.knxService.writeGroupValue(
        groupAddress,
        value === true || value === 1 || value === '1',
        'DPT1'
      );
    }

    res.json({ success: true, message: 'Sent to bus' });
  } catch (error) {
    console.error('Failed to execute action:', error.message);
    io.emit('knx_error', {
      apartmentId: actionContext.apartmentId,
      scope,
      msg: `Action failed on bus: ${error.message}`,
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/hue/discover', async (req, res) => {
  const apartmentId = req.body?.apartmentId || req.query?.apartmentId || config.apartments[0]?.id;
  const context = apartmentContexts.get(apartmentId);
  if (!context) {
    res.status(404).json({ success: false, error: 'Apartment not found' });
    return;
  }

  try {
    const bridges = await context.hueService.discoverBridges();
    res.json({ success: true, bridges });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/hue/pair', async (req, res) => {
  const { apartmentId, bridgeIp } = req.body;
  const apartment = getApartmentById(config, apartmentId || config.apartments[0]?.id);
  const context = apartment ? apartmentContexts.get(apartment.id) : null;

  if (!apartment || !context) {
    res.status(404).json({ success: false, error: 'Apartment not found' });
    return;
  }

  if (!bridgeIp) {
    res.status(400).json({ success: false, error: 'bridgeIp required' });
    return;
  }

  const result = await context.hueService.pairBridge(bridgeIp);
  if (result.success) {
    apartment.hue = { bridgeIp, apiKey: result.apiKey };
    saveConfig();
    startHuePolling(apartment.id);
    io.emit('hue_status', { apartmentId: apartment.id, scope: 'apartment', paired: true, bridgeIp });
    if (config.building.sharedAccessApartmentId === apartment.id) {
      io.emit('hue_status', { apartmentId: apartment.id, scope: 'shared', paired: true, bridgeIp });
    }
  }
  res.json(result);
});

app.post('/api/hue/unpair', (req, res) => {
  const apartmentId = req.body?.apartmentId || config.apartments[0]?.id;
  const apartment = getApartmentById(config, apartmentId);
  const context = apartment ? apartmentContexts.get(apartment.id) : null;
  if (!apartment || !context) {
    res.status(404).json({ success: false, error: 'Apartment not found' });
    return;
  }

  context.hueService.unpair();
  apartment.hue = { bridgeIp: '', apiKey: '' };
  saveConfig();
  stopHuePolling(apartment.id);
  io.emit('hue_status', { apartmentId: apartment.id, scope: 'apartment', paired: false, bridgeIp: '' });
  if (config.building.sharedAccessApartmentId === apartment.id) {
    io.emit('hue_status', { apartmentId: apartment.id, scope: 'shared', paired: false, bridgeIp: '' });
  }
  res.json({ success: true });
});

function resolveHueContext(req) {
  const scope = req.query.scope || req.body?.scope || 'apartment';
  const apartmentId = req.query.apartmentId || req.body?.apartmentId || config.apartments[0]?.id;
  return getActionContext(apartmentId, scope);
}

app.get('/api/hue/lights', async (req, res) => {
  const actionContext = resolveHueContext(req);
  if (!actionContext?.context) {
    res.status(404).json({ success: false, error: 'Apartment not found', lights: [] });
    return;
  }
  const result = await actionContext.context.hueService.getLights();
  res.json(result);
});

app.get('/api/hue/rooms', async (req, res) => {
  const actionContext = resolveHueContext(req);
  if (!actionContext?.context) {
    res.status(404).json({ success: false, error: 'Apartment not found', rooms: [] });
    return;
  }
  const result = await actionContext.context.hueService.getRooms();
  res.json(result);
});

app.get('/api/hue/scenes', async (req, res) => {
  const actionContext = resolveHueContext(req);
  if (!actionContext?.context) {
    res.status(404).json({ success: false, error: 'Apartment not found', scenes: [] });
    return;
  }
  const result = await actionContext.context.hueService.getScenes();
  res.json(result);
});

app.post('/api/config/rooms/:roomId/hue-room', (req, res) => {
  const apartmentId = req.body.apartmentId || config.apartments[0]?.id;
  const scope = req.body.scope || 'apartment';
  const { hueRoomId } = req.body;
  if (!hueRoomId) {
    res.status(400).json({ success: false, error: 'hueRoomId required' });
    return;
  }

  const room = findRoom(req.params.roomId, apartmentId, scope);
  if (!room) {
    res.status(404).json({ success: false, error: 'Room not found' });
    return;
  }

  room.hueRoomId = hueRoomId;
  saveConfig();
  res.json({ success: true });
});

app.delete('/api/config/rooms/:roomId/hue-room', (req, res) => {
  const apartmentId = req.query.apartmentId || config.apartments[0]?.id;
  const scope = req.query.scope || 'apartment';
  const room = findRoom(req.params.roomId, apartmentId, scope);
  if (!room) {
    res.status(404).json({ success: false, error: 'Room not found' });
    return;
  }

  delete room.hueRoomId;
  delete room.hueRoomName;
  saveConfig();
  res.json({ success: true });
});

app.post('/api/config/scenes/:sceneId/hue-scene', (req, res) => {
  const apartmentId = req.body.apartmentId || config.apartments[0]?.id;
  const scope = req.body.scope || 'apartment';
  const { hueSceneId } = req.body;
  if (!hueSceneId) {
    res.status(400).json({ success: false, error: 'hueSceneId required' });
    return;
  }

  const scene = findScene(req.params.sceneId, apartmentId, scope);
  if (!scene) {
    res.status(404).json({ success: false, error: 'Scene not found' });
    return;
  }

  scene.hueSceneId = hueSceneId;
  saveConfig();
  res.json({ success: true });
});

app.delete('/api/config/scenes/:sceneId/hue-scene', (req, res) => {
  const apartmentId = req.query.apartmentId || config.apartments[0]?.id;
  const scope = req.query.scope || 'apartment';
  const scene = findScene(req.params.sceneId, apartmentId, scope);
  if (!scene) {
    res.status(404).json({ success: false, error: 'Scene not found' });
    return;
  }

  delete scene.hueSceneId;
  delete scene.hueSceneName;
  saveConfig();
  res.json({ success: true });
});

app.post('/api/hue/action', async (req, res) => {
  const { apartmentId, scope = 'apartment', lightId, on } = req.body;
  const actionContext = getActionContext(apartmentId, scope);

  if (!lightId) {
    res.status(400).json({ success: false, error: 'lightId required' });
    return;
  }

  if (!actionContext?.context) {
    res.status(404).json({ success: false, error: 'Apartment not found' });
    return;
  }

  const result = await actionContext.context.hueService.setLightState(lightId, on);
  if (result.success) {
    io.emit('hue_state_update', {
      apartmentId: actionContext.apartmentId,
      scope,
      lightId: `hue_${lightId}`,
      on: !!on,
    });
  }
  res.json(result);
});

io.on('connection', (socket) => {
  console.log('Client connected to UI');
  emitAllStatuses(socket);
  socket.emit('knx_initial_states', buildStateSnapshot());
});

const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  console.log(`Serving static frontend from ${distPath}`);
  app.use(express.static(distPath));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = 3001;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use.`);
    console.error('This usually means the KNX Web App is already running in the background (e.g., via systemd or another terminal).');
    console.error(`Stop the other instance (e.g., 'knx-stop' or 'pkill node') before starting a new one.\n`);
    process.exit(1);
  } else {
    console.error('\n❌ ERROR: Failed to start the server:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
});
