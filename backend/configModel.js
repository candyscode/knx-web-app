function normalizeImportedGroupAddresses(addresses) {
  if (!Array.isArray(addresses)) return [];

  return addresses
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      address: typeof entry.address === 'string' ? entry.address : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      dpt: typeof entry.dpt === 'string' ? entry.dpt : '',
      functionType: typeof entry.functionType === 'string' ? entry.functionType : '',
      supported: entry.supported !== false,
    }))
    .filter((entry) => entry.address && entry.name);
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
    dpt: typeof alarm.dpt === 'string' ? alarm.dpt : '',
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
    dpt: typeof info.dpt === 'string' ? info.dpt : '',
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
      sharedAccessApartmentId: 'apartment_1',
      sharedUsesApartmentImportedGroupAddresses: false,
      sharedInfos,
      sharedAreas: [],
      sharedImportedGroupAddresses: normalizeImportedGroupAddresses(input?.importedGroupAddresses),
      sharedImportedGroupAddressesFileName: typeof input?.importedGroupAddressesFileName === 'string'
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
        importedGroupAddresses: normalizeImportedGroupAddresses(input?.importedGroupAddresses),
        importedGroupAddressesFileName: typeof input?.importedGroupAddressesFileName === 'string'
          ? input.importedGroupAddressesFileName
          : '',
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

  const sharedAccessApartmentId = apartments.some((apartment) => apartment.id === source?.building?.sharedAccessApartmentId)
    ? source.building.sharedAccessApartmentId
    : apartments[0].id;

  return {
    version: 2,
    building: {
      sharedAccessApartmentId,
      sharedUsesApartmentImportedGroupAddresses: source?.building?.sharedUsesApartmentImportedGroupAddresses === true,
      sharedInfos: Array.isArray(source?.building?.sharedInfos)
        ? source.building.sharedInfos.map(normalizeSharedInfo).filter(Boolean)
        : [],
      sharedAreas: Array.isArray(source?.building?.sharedAreas)
        ? source.building.sharedAreas.map(normalizeArea)
        : [],
      sharedImportedGroupAddresses: normalizeImportedGroupAddresses(source?.building?.sharedImportedGroupAddresses),
      sharedImportedGroupAddressesFileName: typeof source?.building?.sharedImportedGroupAddressesFileName === 'string'
        ? source.building.sharedImportedGroupAddressesFileName
        : '',
    },
    apartments,
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

function getSharedAccessApartment(config) {
  const explicit = getApartmentById(config, config?.building?.sharedAccessApartmentId);
  return explicit || (Array.isArray(config?.apartments) ? config.apartments[0] : null);
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
  getSharedAccessApartment,
  migrateLegacyConfig,
  normalizeConfigShape,
  normalizeImportedGroupAddresses,
  normalizeArea,
  normalizeApartment,
  normalizeRoom,
  normalizeAlarm,
  normalizeSharedInfo,
  slugifyApartmentName,
};
