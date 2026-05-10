const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const KnxService = require('./knxService');
const HueService = require('./hueService');
const { startScheduler, reloadScheduler, triggerSunRoutines } = require('./automationScheduler');
const { mountFrontendShell } = require('./frontendFallback');
const { createLogger } = require('./logger');
const {
  getAllApartmentRooms,
  getAllSharedRooms,
  getApartmentById,
  getHouseWideInfoReadApartment,
  buildPublicConfig,
  normalizeArea,
  normalizeConfigShape,
  normalizeImportedGroupAddresses,
  normalizeAlarm,
  normalizeSharedInfo,
  normalizeAutomation,
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
const logger = createLogger('Server');

let config = normalizeConfigShape({});

function summarizeApartments(apartments = config.apartments) {
  return (apartments || [])
    .map((apartment) => `${apartment.name}:${apartment.slug}`)
    .join(',');
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig('create default config');
    return;
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = normalizeConfigShape(JSON.parse(data));
    logger.info('Loaded config', {
      file: CONFIG_FILE,
      apartmentCount: config.apartments.length,
      apartments: summarizeApartments(),
    });
  } catch (error) {
    logger.error('Failed to parse config.json', { error: error.message });
    config = normalizeConfigShape({});
  }
}

function saveConfig(reason = 'config update') {
  config = normalizeConfigShape(config);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  logger.info('Saved config', {
    reason,
    apartmentCount: config.apartments.length,
    apartments: summarizeApartments(),
  });
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
        return;
      }

      if (event === 'knx_error') {
        io.emit('knx_error', { ...data, apartmentId, scope: 'apartment' });
        return;
      }

      if (event === 'knx_state_update') {
        io.emit('knx_state_update', {
          ...data,
          apartmentId,
          scope: scopeForGa(data.groupAddress),
        });
        handleSunTrigger(apartmentId, data.groupAddress, data.value);
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
    knxService: new KnxService(createApartmentEmitter(apartmentId), { label: apartmentId }),
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
    context.knxService.setLabel(apartment.slug || apartment.name || apartment.id);
    context.hueService.init(apartment.hue);
  });

  for (const [apartmentId, context] of apartmentContexts.entries()) {
    if (nextApartmentIds.has(apartmentId)) continue;

    stopHuePolling(apartmentId);
    try {
      context.knxService.connect('', 3671);
    } catch (error) {
      logger.warn('Failed to disconnect removed apartment context', { apartmentId, error: error.message });
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
  return [
    ...getRoomsForApartmentScope(apartmentId),
    ...getRoomsForSharedScope(),
  ];
}

function buildKnxTrackingMaps(apartmentId) {
  const apartment = getApartmentById(config, apartmentId);
  const gaToType = {};
  const gaToDpt = {};
  const apartmentGaSet = new Set();
  const sharedGaSet = new Set();
  const apartmentStatusGAs = new Set();
  const sharedInfoStatusGAs = new Set();
  const sharedAreaStatusGAs = new Set();

  const actionToStatusGa = {};

  const registerRoomSet = (rooms, scope) => {
    const scopedSet = scope === 'shared' ? sharedGaSet : apartmentGaSet;
    const statusSet = scope === 'shared' ? sharedAreaStatusGAs : apartmentStatusGAs;

    rooms.forEach((room) => {
      if (room.roomTemperatureGroupAddress) {
        statusSet.add(room.roomTemperatureGroupAddress);
        gaToType[room.roomTemperatureGroupAddress] = 'info';
        gaToDpt[room.roomTemperatureGroupAddress] = 'DPT9.001';
        scopedSet.add(room.roomTemperatureGroupAddress);
      }

      (room.functions || []).forEach((func) => {
        if (func.statusGroupAddress) {
          statusSet.add(func.statusGroupAddress);
          gaToType[func.statusGroupAddress] = func.type;
          if (func.type === 'percentage' || func.type === 'dimmer') {
            gaToDpt[func.statusGroupAddress] = 'DPT5.001';
          }
          scopedSet.add(func.statusGroupAddress);
        }
        if (func.groupAddress) {
          gaToType[func.groupAddress] = func.type;
          if (func.type === 'percentage' || func.type === 'dimmer') {
            gaToDpt[func.groupAddress] = 'DPT5.001';
          }
          scopedSet.add(func.groupAddress);
          // Map action GA → status GA so button presses update the UI immediately
          if (func.statusGroupAddress && func.groupAddress !== func.statusGroupAddress) {
            actionToStatusGa[func.groupAddress] = func.statusGroupAddress;
          }
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
    apartmentStatusGAs.add(alarm.statusGroupAddress);
    gaToType[alarm.statusGroupAddress] = 'alarm';
    gaToDpt[alarm.statusGroupAddress] = alarm.dpt || 'DPT1.001';
    apartmentGaSet.add(alarm.statusGroupAddress);
  });

  if (apartment?.sunTrigger?.groupAddress) {
    apartmentStatusGAs.add(apartment.sunTrigger.groupAddress);
    gaToType[apartment.sunTrigger.groupAddress] = 'sun';
    gaToDpt[apartment.sunTrigger.groupAddress] = 'DPT1.001';
    apartmentGaSet.add(apartment.sunTrigger.groupAddress);
  }

  (config.building.sharedInfos || []).forEach((info) => {
    if (!info?.statusGroupAddress) return;
    sharedInfoStatusGAs.add(info.statusGroupAddress);
    gaToType[info.statusGroupAddress] = 'info';
    gaToDpt[info.statusGroupAddress] = info.dpt || 'DPT9.001';
    sharedGaSet.add(info.statusGroupAddress);
  });

  registerRoomSet(getRoomsForSharedScope(), 'shared');

  return {
    statusGAs: new Set([...apartmentStatusGAs, ...sharedInfoStatusGAs, ...sharedAreaStatusGAs]),
    gaToType,
    gaToDpt,
    actionToStatusGa,
    apartmentGaSet,
    sharedGaSet,
    apartmentStatusGAs,
    sharedInfoStatusGAs,
    sharedAreaStatusGAs,
  };
}

function shouldApartmentReadHouseWideInfos(apartmentId) {
  return getHouseWideInfoReadApartment(config)?.id === apartmentId;
}

function requestTrackedStatusReads(apartmentId, {
  includeApartment = true,
  includeSharedInfos = false,
  includeSharedAreas = true,
} = {}) {
  const context = apartmentContexts.get(apartmentId);
  if (!context?.knxService?.isConnected) return;

  const readOrder = [];
  if (includeApartment) readOrder.push(...context.tracking.apartmentStatusGAs);
  if (includeSharedAreas) readOrder.push(...context.tracking.sharedAreaStatusGAs);
  if (includeSharedInfos) readOrder.push(...context.tracking.sharedInfoStatusGAs);

  let delay = 0;
  [...new Set(readOrder)].forEach((groupAddress) => {
    setTimeout(() => context.knxService.readStatus(groupAddress), delay);
    delay += 50;
  });
}

function refreshKnxSubscriptions(apartmentId, { requestReads = false } = {}) {
  const context = apartmentContexts.get(apartmentId);
  if (!context) return;

  context.tracking = buildKnxTrackingMaps(apartmentId);
  context.knxService.setGaToType(context.tracking.gaToType);
  context.knxService.setGaToDpt(context.tracking.gaToDpt);
  context.knxService.setActionToStatusGaMap(context.tracking.actionToStatusGa);
  context.knxService.setSceneTriggerCallback((groupAddress, sceneNumber) => {
    const scope = context.tracking.sharedGaSet.has(groupAddress) ? 'shared' : 'apartment';
    handleExternalSceneTrigger(apartmentId, scope, groupAddress, sceneNumber);
  });

  if (!requestReads || !context.knxService.isConnected) return;
  requestTrackedStatusReads(apartmentId, {
    includeApartment: true,
    includeSharedAreas: true,
    includeSharedInfos: shouldApartmentReadHouseWideInfos(apartmentId),
  });
}

function establishConnection(apartmentId) {
  const apartment = getApartmentById(config, apartmentId);
  const context = apartmentContexts.get(apartmentId);
  if (!apartment || !context) return;

  if (!apartment.knxIp) {
    context.knxService.connect('', apartment.knxPort || 3671, null, {});
    return;
  }

  const knxOptions = apartment.knxLocalInterface ? { interface: apartment.knxLocalInterface } : {};
  context.knxService.connect(apartment.knxIp, apartment.knxPort, () => {
    refreshKnxSubscriptions(apartmentId, { requestReads: true });
  }, knxOptions);
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

    getRoomsForSharedScope().forEach((room) => {
      (room.functions || []).forEach((func) => {
        if (func.type === 'hue' && func.hueLightId) sharedHueIds.add(func.hueLightId);
      });
    });

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

}

async function handleSunTrigger(apartmentId, groupAddress, value) {
  // value is expected to be 1 or 0 for DPT1
  const numericValue = value === true || value === 1 ? 1 : 0;

  for (const apartment of config.apartments) {
    if (!apartment.sunTrigger?.groupAddress) continue;
    
    // Check if the GA matches
    if (apartment.sunTrigger.groupAddress !== groupAddress) continue;
    
    // Check if it's a sunrise or sunset
    const isDay = numericValue === apartment.sunTrigger.dayValue;
    const triggerType = isDay ? 'sunrise' : 'sunset';
    
    logger.info('Sun trigger detected', {
      apartment: apartment.name,
      trigger: triggerType,
      ga: groupAddress,
      value: numericValue,
    });
    
    // Fire the routines for THIS apartment's configuration 
    // Wait, triggerSunRoutines iterates over ALL apartments because we pass config.
    // Let's call triggerSunRoutines, it will dispatch to all apartments.
    await triggerSunRoutines(config, triggerType, apartment.id);
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
  config.apartments.forEach((apartment) => {
    const context = apartmentContexts.get(apartment.id);
    Object.entries(context?.knxService?.deviceStates || {}).forEach(([groupAddress, value]) => {
      if (!context?.tracking?.sharedGaSet?.has(groupAddress)) return;
      sharedStates[groupAddress] = value;
    });
  });

  return { apartments, shared: sharedStates };
}

function applyConfigPatch(payload) {
  if (!payload || typeof payload !== 'object') return;

  if (Array.isArray(payload.apartments) || payload.building || payload.version === 2) {
    const importedConfig = normalizeConfigShape(payload);
    logger.info('Applying full config replacement', {
      apartmentCount: importedConfig.apartments.length,
      apartments: summarizeApartments(importedConfig.apartments),
    });
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

    if (payload.importedGroupAddresses !== undefined) {
      config.building.importedGroupAddresses = normalizeImportedGroupAddresses(payload.importedGroupAddresses);
    }

    if (payload.importedGroupAddressesFileName !== undefined) {
      config.building.importedGroupAddressesFileName =
        typeof payload.importedGroupAddressesFileName === 'string'
          ? payload.importedGroupAddressesFileName
          : '';
    }

    if (payload.houseWideInfoReadApartmentId !== undefined && getApartmentById(config, payload.houseWideInfoReadApartmentId)) {
      config.building.houseWideInfoReadApartmentId = payload.houseWideInfoReadApartmentId;
    }

    return;
  }

  if (payload.name !== undefined && typeof payload.name === 'string' && payload.name.trim()) {
    apartment.name = payload.name.trim();
  }

  if (payload.slug !== undefined && typeof payload.slug === 'string' && payload.slug.trim()) {
    const previousSlug = apartment.slug;
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
    logger.info('Updated apartment slug', {
      apartmentId,
      apartmentName: apartment.name,
      previousSlug,
      requestedSlug: payload.slug.trim(),
      persistedSlug: apartment.slug,
    });
  }

  if (payload.knxIp !== undefined) apartment.knxIp = payload.knxIp;
  if (payload.knxPort !== undefined) apartment.knxPort = parseInt(payload.knxPort, 10) || 3671;
  if (payload.knxLocalInterface !== undefined) apartment.knxLocalInterface = typeof payload.knxLocalInterface === 'string' ? payload.knxLocalInterface.trim() : '';
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

  if (payload.automations !== undefined) {
    apartment.automations = Array.isArray(payload.automations)
      ? payload.automations.map(normalizeAutomation).filter(Boolean)
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
    config.building.importedGroupAddresses = normalizeImportedGroupAddresses(payload.importedGroupAddresses);
  }

  if (payload.importedGroupAddressesFileName !== undefined) {
    config.building.importedGroupAddressesFileName =
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
  const resolvedApartmentId = apartmentId || config.apartments[0]?.id;
  return {
    apartmentId: resolvedApartmentId,
    scope,
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

async function executeAutomationAction(apartment, action, allFloors) {
  const actionContext = getActionContext(apartment.id, 'apartment');
  if (!actionContext?.context?.knxService) {
    throw new Error(`No KNX context for apartment ${apartment.id}`);
  }
  const { knxService } = actionContext.context;

  if (action.kind === 'scene') {
    // Find the scene and its GA from config
    let sceneNumber = null;
    let groupAddress = null;
    for (const floor of allFloors) {
      if (!Array.isArray(floor.rooms)) continue;
      const room = floor.rooms.find((r) => r.id === action.roomId);
      if (!room) continue;
      groupAddress = room.sceneGroupAddress;
      const scene = Array.isArray(room.scenes) ? room.scenes.find((s) => s.id === action.targetId) : null;
      if (scene) sceneNumber = scene.sceneNumber;
      break;
    }
    if (!groupAddress || sceneNumber == null) throw new Error(`Scene target not found: ${action.targetId}`);
    knxService.writeScene(groupAddress, sceneNumber);
    await triggerLinkedHueScene(apartment.id, 'apartment', groupAddress, sceneNumber);

  } else if (action.kind === 'function') {
    // Find the function's GA
    let groupAddress = null;
    for (const floor of allFloors) {
      if (!Array.isArray(floor.rooms)) continue;
      const room = floor.rooms.find((r) => r.id === action.roomId);
      if (!room) continue;
      const func = Array.isArray(room.functions) ? room.functions.find((f) => f.id === action.targetId) : null;
      if (func) groupAddress = func.groupAddress;
      break;
    }
    if (!groupAddress) throw new Error(`Function target not found: ${action.targetId}`);
    if (action.targetType === 'percentage' || action.targetType === 'dimmer') {
      knxService.writeGroupValue(groupAddress, action.value, 'DPT5.001');
    } else {
      knxService.writeGroupValue(groupAddress, action.value === true || action.value === 1, 'DPT1');
    }
  } else {
    throw new Error(`Unknown action kind: ${action.kind}`);
  }
}

async function persistAutomationStatus(apartmentId, automationId, { lastRunAt, lastRunStatus }) {
  const apt = config.apartments.find((a) => a.id === apartmentId);
  if (!apt || !Array.isArray(apt.automations)) return;
  const automation = apt.automations.find((a) => a.id === automationId);
  if (!automation) return;
  automation.lastRunAt = lastRunAt;
  automation.lastRunStatus = lastRunStatus;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

loadConfig();
syncApartmentContexts();
config.apartments.forEach((apartment) => {
  refreshKnxSubscriptions(apartment.id);
  if (apartment.knxIp) establishConnection(apartment.id);
  startHuePolling(apartment.id);
});

startScheduler(
  () => config,
  executeAutomationAction,
  persistAutomationStatus
);

app.get('/api/config', (req, res) => {
  logger.debug('Serving public config', {
    apartmentCount: config.apartments.length,
    apartments: summarizeApartments(),
  });
  res.json(buildPublicConfig(config));
});

app.post('/api/config', (req, res) => {
  const previousConfig = normalizeConfigShape(config);
  const previousSummary = summarizeApartments(previousConfig.apartments);

  applyConfigPatch(req.body);
  config = normalizeConfigShape(config);
  saveConfig('api /api/config');
  syncApartmentContexts();

  config.apartments.forEach((apartment) => {
    const previousApartment = getApartmentById(previousConfig, apartment.id);
    const knxChanged = !previousApartment
      || previousApartment.knxIp !== apartment.knxIp
      || previousApartment.knxPort !== apartment.knxPort
      || previousApartment.knxLocalInterface !== apartment.knxLocalInterface;

    if (knxChanged) establishConnection(apartment.id);
    else refreshKnxSubscriptions(apartment.id, { requestReads: true });

    startHuePolling(apartment.id);
  });

  emitAllStatuses();
  reloadScheduler();

  logger.info('Applied config patch', {
    apartmentCount: config.apartments.length,
    previousApartments: previousSummary,
    currentApartments: summarizeApartments(),
    apartmentId: req.body?.apartmentId || '',
    scope: req.body?.scope || req.body?.target || 'apartment',
  });

  res.json({ success: true, config: buildPublicConfig(config) });
});

app.post('/api/config-protection/verify', (req, res) => {
  const submittedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  const currentPassword = config?.building?.configurationPassword || '';

  if (!currentPassword) {
    res.json({ success: false, enabled: false });
    return;
  }

  res.json({ success: submittedPassword === currentPassword, enabled: true });
});

app.post('/api/config-protection', (req, res) => {
  const nextPassword = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!nextPassword) {
    res.status(400).json({ success: false, error: 'password required' });
    return;
  }

  config.building.configurationPassword = nextPassword;
  saveConfig();
  res.json({ success: true, config: buildPublicConfig(config) });
});

app.delete('/api/config-protection', (req, res) => {
  const submittedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  const currentPassword = config?.building?.configurationPassword || '';

  if (!currentPassword) {
    res.json({ success: true, config: buildPublicConfig(config) });
    return;
  }

  if (submittedPassword !== currentPassword) {
    res.status(401).json({ success: false, error: 'Incorrect password' });
    return;
  }

  config.building.configurationPassword = '';
  saveConfig();
  res.json({ success: true, config: buildPublicConfig(config) });
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
    saveConfig('load dev config');
    syncApartmentContexts();
    config.apartments.forEach((apartment) => {
      refreshKnxSubscriptions(apartment.id);
      establishConnection(apartment.id);
      startHuePolling(apartment.id);
    });
    emitAllStatuses();
    res.json({ success: true, config: buildPublicConfig(config) });
  } catch (error) {
    logger.error('Failed to parse config.dev.json', { error: error.message });
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
    } else if (type === 'percentage' || type === 'dimmer') {
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
    logger.warn('Failed to execute action', {
      apartmentId: actionContext.apartmentId,
      scope,
      ga: groupAddress,
      type,
      error: error.message,
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/knx/refresh-statuses', (req, res) => {
  const apartmentId = req.body?.apartmentId || config.apartments[0]?.id;
  const context = apartmentContexts.get(apartmentId);
  if (!context) {
    res.status(404).json({ success: false, error: 'Apartment not found' });
    return;
  }

  requestTrackedStatusReads(apartmentId, {
    includeApartment: true,
    includeSharedAreas: true,
    includeSharedInfos: shouldApartmentReadHouseWideInfos(apartmentId),
  });

  res.json({ success: true });
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
  const { hueRoomId, hueRoomName } = req.body;
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
  room.hueRoomName = hueRoomName;
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
  const { hueSceneId, hueSceneName } = req.body;
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
  if (hueSceneName) scene.hueSceneName = hueSceneName;
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
  emitAllStatuses(socket);
  socket.emit('knx_initial_states', buildStateSnapshot());
});

const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  logger.info('Serving static frontend', { path: distPath });
  mountFrontendShell(app, distPath, {
    logger: logger.child('FrontendShell'),
    getApartmentSlugs: () => config.apartments.map((apartment) => apartment.slug),
  });
}

const PORT = 3001;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error('Port already in use', { port: PORT });
    logger.error('Another KNX Web App instance is likely already running');
    process.exit(1);
  } else {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info('Backend server running', { host: '0.0.0.0', port: PORT });
});
