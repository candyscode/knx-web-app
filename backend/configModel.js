function normalizeDptString(dpt) {
  const raw = typeof dpt === 'string' ? dpt.trim() : '';
  if (!raw) return '';

  const compact = raw
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^DPT-?/, '')
    .replace(/^DPST-?/, 'DPST');

  const dpstMatch = compact.match(/^DPST(\d+)-(\d+)$/);
  if (dpstMatch) {
    const [, mainType, subType] = dpstMatch;
    return `DPT${mainType}.${String(Number(subType)).padStart(3, '0')}`;
  }

  const dptMatch = compact.match(/^(\d+)(?:[.-](\d+))?$/);
  if (dptMatch) {
    const [, mainType, subType] = dptMatch;
    return subType
      ? `DPT${mainType}.${String(Number(subType)).padStart(3, '0')}`
      : `DPT${mainType}`;
  }

  return raw;
}

function normalizeImportedGroupAddresses(addresses) {
  if (!Array.isArray(addresses)) return [];

  return addresses
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      address: typeof entry.address === 'string' ? entry.address : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      dpt: normalizeDptString(entry.dpt),
      room: typeof entry.room === 'string' ? entry.room : '',
      rangePath: Array.isArray(entry.rangePath)
        ? entry.rangePath.filter((part) => typeof part === 'string' && part.trim())
        : [],
      topLevelRange: typeof entry.topLevelRange === 'string' ? entry.topLevelRange : '',
      functionType: typeof entry.functionType === 'string' ? entry.functionType : '',
      supported: entry.supported !== false,
    }))
    .map((entry) => ({
      ...entry,
      topLevelRange: entry.topLevelRange || entry.rangePath[0] || '',
    }))
    .filter((entry) => entry.address && entry.name);
}

function mergeImportedGroupAddresses(...addressLists) {
  const merged = [];
  const seen = new Set();

  addressLists.flat().forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const normalized = normalizeImportedGroupAddresses([entry])[0];
    if (!normalized) return;
    const key = normalized.address;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  });

  return merged;
}

function normalizeRoom(room) {
  if (!room || typeof room !== 'object') {
    return {
      id: `room_${Date.now()}`,
      name: 'New Room',
      sceneGroupAddress: '',
      scenes: [],
      functions: [],
      roomTemperatureGroupAddress: '',
    };
  }

  return {
    ...room,
    id: typeof room.id === 'string' ? room.id : `room_${Date.now()}`,
    name: typeof room.name === 'string' ? room.name : 'New Room',
    sceneGroupAddress: typeof room.sceneGroupAddress === 'string' ? room.sceneGroupAddress : '',
    scenes: Array.isArray(room.scenes) ? room.scenes : [],
    functions: Array.isArray(room.functions) ? room.functions : [],
    roomTemperatureGroupAddress: typeof room.roomTemperatureGroupAddress === 'string'
      ? room.roomTemperatureGroupAddress
      : '',
  };
}

function normalizeArea(area, index = 0) {
  if (!area || typeof area !== 'object') {
    return {
      id: `area_${Date.now()}_${index}`,
      name: `Area ${index + 1}`,
      rooms: [],
    };
  }

  return {
    ...area,
    id: typeof area.id === 'string' ? area.id : `area_${Date.now()}_${index}`,
    name: typeof area.name === 'string' ? area.name : `Area ${index + 1}`,
    rooms: Array.isArray(area.rooms) ? area.rooms.map(normalizeRoom) : [],
  };
}

function normalizeAlarm(alarm) {
  if (!alarm || typeof alarm !== 'object') return null;

  return {
    ...alarm,
    id: typeof alarm.id === 'string' ? alarm.id : `alarm_${Date.now()}`,
    name: typeof alarm.name === 'string' ? alarm.name : 'Alarm',
    type: 'alarm',
    category: 'alarm',
    statusGroupAddress: typeof alarm.statusGroupAddress === 'string' ? alarm.statusGroupAddress : '',
    dpt: normalizeDptString(alarm.dpt),
  };
}

function normalizeSharedInfo(info) {
  if (!info || typeof info !== 'object') return null;

  return {
    ...info,
    id: typeof info.id === 'string' ? info.id : `shared_info_${Date.now()}`,
    name: typeof info.name === 'string' ? info.name : 'Information',
    type: 'info',
    category: typeof info.category === 'string' ? info.category : 'temperature',
    statusGroupAddress: typeof info.statusGroupAddress === 'string' ? info.statusGroupAddress : '',
    dpt: normalizeDptString(info.dpt),
  };
}

function slugifyApartmentName(name, fallbackIndex = 1) {
  const base = String(name || `Wohnung ${fallbackIndex}`)
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || `wohnung-${fallbackIndex}`;
}

function normalizeAutomationAction(action) {
  if (!action || typeof action !== 'object') return null;
  return {
    id: typeof action.id === 'string' ? action.id : `action_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    kind: action.kind === 'scene' || action.kind === 'function' ? action.kind : 'function',
    areaId: typeof action.areaId === 'string' ? action.areaId : '',
    roomId: typeof action.roomId === 'string' ? action.roomId : '',
    targetId: typeof action.targetId === 'string' ? action.targetId : '',
    targetType: typeof action.targetType === 'string' ? action.targetType : '',
    value: action.value !== undefined ? action.value : null,
  };
}

function normalizeAutomation(automation) {
  if (!automation || typeof automation !== 'object') return null;
  const validTriggers = ['time', 'sunrise', 'sunset'];
  const triggerType = validTriggers.includes(automation.triggerType)
    ? automation.triggerType
    : 'time';
  return {
    id: typeof automation.id === 'string' ? automation.id : `automation_${Date.now()}`,
    name: typeof automation.name === 'string' ? automation.name : 'New Routine',
    enabled: automation.enabled !== false,
    triggerType,
    time: typeof automation.time === 'string' ? automation.time : '08:00',
    frequency: 'daily',
    actions: Array.isArray(automation.actions)
      ? automation.actions.map(normalizeAutomationAction).filter(Boolean)
      : [],
    lastRunAt: automation.lastRunAt || null,
    lastRunStatus: automation.lastRunStatus || null,
  };
}

function ensureUniqueSlug(slug, usedSlugs) {
  let candidate = slug || 'wohnung';
  let counter = 2;

  while (usedSlugs.has(candidate)) {
    candidate = `${slug}-${counter}`;
    counter += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

function normalizeApartment(apartment, index = 0, usedSlugs = new Set()) {
  const safeName = typeof apartment?.name === 'string' && apartment.name.trim()
    ? apartment.name.trim()
    : `Wohnung ${index + 1}`;
  const safeSlug = ensureUniqueSlug(
    slugifyApartmentName(typeof apartment?.slug === 'string' ? apartment.slug : safeName, index + 1),
    usedSlugs
  );

  return {
    id: typeof apartment?.id === 'string' ? apartment.id : `apartment_${Date.now()}_${index}`,
    name: safeName,
    slug: safeSlug,
    knxIp: typeof apartment?.knxIp === 'string' ? apartment.knxIp : '',
    knxPort: Number.isFinite(Number(apartment?.knxPort)) ? Number(apartment.knxPort) : 3671,
    knxLocalInterface: typeof apartment?.knxLocalInterface === 'string' ? apartment.knxLocalInterface : '',
    hue: {
      bridgeIp: typeof apartment?.hue?.bridgeIp === 'string' ? apartment.hue.bridgeIp : '',
      apiKey: typeof apartment?.hue?.apiKey === 'string' ? apartment.hue.apiKey : '',
    },
    floors: Array.isArray(apartment?.floors)
      ? apartment.floors.map(normalizeArea)
      : [],
    areaOrder: Array.isArray(apartment?.areaOrder)
      ? apartment.areaOrder.filter((entry) => typeof entry === 'string')
      : [],
    alarms: Array.isArray(apartment?.alarms)
      ? apartment.alarms.map(normalizeAlarm).filter(Boolean)
      : [],
    automations: Array.isArray(apartment?.automations)
      ? apartment.automations.map(normalizeAutomation).filter(Boolean)
      : [],
    sunTrigger: apartment?.sunTrigger && typeof apartment.sunTrigger === 'object' ? {
      groupAddress: typeof apartment.sunTrigger.groupAddress === 'string' ? apartment.sunTrigger.groupAddress : '',
      dayValue: apartment.sunTrigger.dayValue === 0 ? 0 : 1,
    } : null,
    importedGroupAddresses: normalizeImportedGroupAddresses(apartment?.importedGroupAddresses),
    importedGroupAddressesFileName: typeof apartment?.importedGroupAddressesFileName === 'string'
      ? apartment.importedGroupAddressesFileName
      : '',
  };
}

function migrateLegacyConfig(input) {
  const legacyGlobals = Array.isArray(input?.globals) ? input.globals : [];
  const sharedInfos = legacyGlobals
    .filter((item) => item?.type !== 'alarm')
    .map(normalizeSharedInfo)
    .filter(Boolean);
  const alarms = legacyGlobals
    .filter((item) => item?.type === 'alarm')
    .map(normalizeAlarm)
    .filter(Boolean);

  const floors = Array.isArray(input?.floors) && input.floors.length > 0
    ? input.floors.map(normalizeArea)
    : [{
      id: 'area_default',
      name: 'Ground Floor',
      rooms: Array.isArray(input?.rooms) ? input.rooms.map(normalizeRoom) : [],
    }];

  return {
    version: 2,
    building: {
      houseWideInfoReadApartmentId: 'apartment_1',
      configurationPassword: '',
      sharedInfos,
      sharedAreas: [],
      importedGroupAddresses: normalizeImportedGroupAddresses(input?.importedGroupAddresses),
      importedGroupAddressesFileName: typeof input?.importedGroupAddressesFileName === 'string'
        ? input.importedGroupAddressesFileName
        : '',
    },
    apartments: [
      {
        id: 'apartment_1',
        name: 'Wohnung 1',
        slug: 'wohnung-1',
        knxIp: typeof input?.knxIp === 'string' ? input.knxIp : '',
        knxPort: Number.isFinite(Number(input?.knxPort)) ? Number(input.knxPort) : 3671,
        hue: {
          bridgeIp: typeof input?.hue?.bridgeIp === 'string' ? input.hue.bridgeIp : '',
          apiKey: typeof input?.hue?.apiKey === 'string' ? input.hue.apiKey : '',
        },
        floors,
        areaOrder: floors.map((area) => area.id),
        alarms,
        automations: [],
        importedGroupAddresses: [],
        importedGroupAddressesFileName: '',
      },
    ],
  };
}

function normalizeConfigShape(input) {
  const source = (!input || typeof input !== 'object')
    ? {}
    : (Array.isArray(input.apartments) || input.building ? input : migrateLegacyConfig(input));

  const usedSlugs = new Set();
  const apartments = Array.isArray(source.apartments) && source.apartments.length > 0
    ? source.apartments.map((apartment, index) => normalizeApartment(apartment, index, usedSlugs))
    : [normalizeApartment({}, 0, usedSlugs)];

  const houseWideInfoReadApartmentId = apartments.some((apartment) => apartment.id === source?.building?.houseWideInfoReadApartmentId)
    ? source.building.houseWideInfoReadApartmentId
    : apartments.some((apartment) => apartment.id === source?.building?.sharedAccessApartmentId)
      ? source.building.sharedAccessApartmentId
    : apartments[0].id;

  const hasExplicitHouseImport = Array.isArray(source?.building?.importedGroupAddresses);
  const hasExplicitHouseImportFileName = typeof source?.building?.importedGroupAddressesFileName === 'string';
  const buildingImportedGroupAddresses = normalizeImportedGroupAddresses(source?.building?.importedGroupAddresses);
  const fallbackImportedGroupAddresses = mergeImportedGroupAddresses(
    source?.building?.sharedImportedGroupAddresses,
    ...apartments.map((apartment) => apartment.importedGroupAddresses)
  );
  const importedGroupAddresses = hasExplicitHouseImport
    ? buildingImportedGroupAddresses
    : fallbackImportedGroupAddresses;
  const importedGroupAddressesFileName =
    hasExplicitHouseImportFileName
      ? source.building.importedGroupAddressesFileName
      : (typeof source?.building?.sharedImportedGroupAddressesFileName === 'string' && source.building.sharedImportedGroupAddressesFileName
        ? source.building.sharedImportedGroupAddressesFileName
        : (apartments.find((apartment) => apartment.importedGroupAddressesFileName)?.importedGroupAddressesFileName || ''));

  return {
    version: 2,
    building: {
      houseWideInfoReadApartmentId,
      configurationPassword: typeof source?.building?.configurationPassword === 'string'
        ? source.building.configurationPassword
        : '',
      sharedInfos: Array.isArray(source?.building?.sharedInfos)
        ? source.building.sharedInfos.map(normalizeSharedInfo).filter(Boolean)
        : [],
      sharedAreas: Array.isArray(source?.building?.sharedAreas)
        ? source.building.sharedAreas.map(normalizeArea)
        : [],
      importedGroupAddresses,
      importedGroupAddressesFileName,
    },
    apartments,
  };
}

function buildPublicConfig(input) {
  const normalized = normalizeConfigShape(input);
  return {
    ...normalized,
    building: {
      ...normalized.building,
      configProtectionEnabled: !!normalized.building.configurationPassword,
      configurationPassword: undefined,
    },
  };
}

function getApartmentById(config, apartmentId) {
  return Array.isArray(config?.apartments)
    ? config.apartments.find((apartment) => apartment.id === apartmentId)
    : null;
}

function getApartmentBySlug(config, slug) {
  return Array.isArray(config?.apartments)
    ? config.apartments.find((apartment) => apartment.slug === slug)
    : null;
}

function getHouseWideInfoReadApartment(config) {
  const explicit = getApartmentById(config, config?.building?.houseWideInfoReadApartmentId);
  if (explicit) return explicit;
  const legacy = getApartmentById(config, config?.building?.sharedAccessApartmentId);
  if (legacy) return legacy;
  return Array.isArray(config?.apartments) ? config.apartments[0] : null;
}

function getAllRoomsForAreas(areas) {
  return Array.isArray(areas)
    ? areas.flatMap((area) => Array.isArray(area.rooms) ? area.rooms : [])
    : [];
}

function getAllApartmentRooms(apartment) {
  return getAllRoomsForAreas(apartment?.floors);
}

function getAllSharedRooms(config) {
  return getAllRoomsForAreas(config?.building?.sharedAreas);
}

module.exports = {
  getAllApartmentRooms,
  getAllRoomsForAreas,
  getAllSharedRooms,
  getApartmentById,
  getApartmentBySlug,
  getHouseWideInfoReadApartment,
  migrateLegacyConfig,
  buildPublicConfig,
  normalizeConfigShape,
  normalizeImportedGroupAddresses,
  normalizeDptString,
  normalizeArea,
  normalizeApartment,
  normalizeRoom,
  normalizeAlarm,
  normalizeSharedInfo,
  normalizeAutomation,
  mergeImportedGroupAddresses,
  slugifyApartmentName,
};
