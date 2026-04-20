export function buildApartmentPath(slug, section = 'dashboard') {
  if (!slug) return '/';
  if (section === 'dashboard') return `/${slug}`;
  return `/${slug}/${section}`;
}

export function parseAppPath(pathname, apartments = []) {
  const segments = String(pathname || '/')
    .split('/')
    .filter(Boolean);

  const fallbackApartment = apartments[0] || null;
  const apartmentSlug = segments[0] || fallbackApartment?.slug || null;
  const section = segments[1] === 'rooms' || segments[1] === 'connections'
    ? segments[1]
    : 'dashboard';

  return { apartmentSlug, section };
}

export function migrateLegacyConfig(config) {
  if (config?.apartments || config?.building) return config;

  return {
    version: 2,
    building: {
      sharedAccessApartmentId: 'apartment_1',
      sharedUsesApartmentImportedGroupAddresses: false,
      sharedInfos: Array.isArray(config?.globals)
        ? config.globals.filter((item) => item?.type !== 'alarm')
        : [],
      sharedAreas: [],
      sharedImportedGroupAddresses: Array.isArray(config?.importedGroupAddresses)
        ? config.importedGroupAddresses
        : [],
      sharedImportedGroupAddressesFileName: config?.importedGroupAddressesFileName || '',
    },
    apartments: [
      {
        id: 'apartment_1',
        name: 'Wohnung 1',
        slug: 'wohnung-1',
        knxIp: config?.knxIp || '',
        knxPort: config?.knxPort || 3671,
        hue: config?.hue || { bridgeIp: '', apiKey: '' },
        floors: Array.isArray(config?.floors) && config.floors.length > 0
          ? config.floors
          : [{
            id: 'area_default',
            name: 'Ground Floor',
            rooms: Array.isArray(config?.rooms) ? config.rooms : [],
          }],
        alarms: Array.isArray(config?.globals)
          ? config.globals.filter((item) => item?.type === 'alarm')
          : [],
        importedGroupAddresses: Array.isArray(config?.importedGroupAddresses)
          ? config.importedGroupAddresses
          : [],
        importedGroupAddressesFileName: config?.importedGroupAddressesFileName || '',
      },
    ],
  };
}

export function slugifyApartmentName(name, index = 1) {
  const base = String(name || `Wohnung ${index}`)
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || `wohnung-${index}`;
}

export function ensureUniqueSlug(baseSlug, apartments, currentApartmentId = null) {
  const usedSlugs = new Set(
    (apartments || [])
      .filter((apartment) => apartment.id !== currentApartmentId)
      .map((apartment) => apartment.slug)
  );

  let candidate = baseSlug;
  let suffix = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function buildApartmentView(config, apartmentSlug) {
  const normalized = migrateLegacyConfig(config);
  const apartment = normalized.apartments.find((entry) => entry.slug === apartmentSlug) || normalized.apartments[0] || null;
  const sharedAreas = Array.isArray(normalized.building?.sharedAreas) ? normalized.building.sharedAreas : [];

  if (!apartment) {
    return {
      apartment: null,
      apartmentConfig: null,
      sharedAreas: [],
      sharedInfos: [],
      apartments: [],
    };
  }

  const mergedFloors = [
    ...(Array.isArray(apartment.floors) ? apartment.floors : []).map((floor) => ({ ...floor, isShared: false })),
    ...sharedAreas.map((area) => ({ ...area, isShared: true })),
  ];
  const areaOrder = Array.isArray(apartment.areaOrder) ? apartment.areaOrder : [];
  const orderedFloors = [
    ...mergedFloors
      .slice()
      .sort((left, right) => {
        const leftIndex = areaOrder.indexOf(left.id);
        const rightIndex = areaOrder.indexOf(right.id);
        const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const safeRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        if (safeLeftIndex === safeRightIndex) return 0;
        return safeLeftIndex - safeRightIndex;
      }),
  ];

  return {
    apartments: normalized.apartments,
    apartment,
    apartmentConfig: {
      apartmentId: apartment.id,
      apartmentSlug: apartment.slug,
      apartmentName: apartment.name,
      knxIp: apartment.knxIp,
      knxPort: apartment.knxPort,
      hue: apartment.hue || { bridgeIp: '', apiKey: '' },
      floors: orderedFloors,
      areaOrder,
      sharedInfos: Array.isArray(normalized.building?.sharedInfos) ? normalized.building.sharedInfos : [],
      alarms: Array.isArray(apartment.alarms) ? apartment.alarms : [],
      importedGroupAddresses: Array.isArray(apartment.importedGroupAddresses) ? apartment.importedGroupAddresses : [],
      importedGroupAddressesFileName: apartment.importedGroupAddressesFileName || '',
      sharedImportedGroupAddresses: Array.isArray(normalized.building?.sharedImportedGroupAddresses)
        ? normalized.building.sharedImportedGroupAddresses
        : [],
      sharedImportedGroupAddressesFileName: normalized.building?.sharedImportedGroupAddressesFileName || '',
      sharedAccessApartmentId: normalized.building?.sharedAccessApartmentId || apartment.id,
      sharedUsesApartmentImportedGroupAddresses: normalized.building?.sharedUsesApartmentImportedGroupAddresses === true,
    },
    sharedAreas,
    sharedInfos: Array.isArray(normalized.building?.sharedInfos) ? normalized.building.sharedInfos : [],
    building: normalized.building,
  };
}

export function createApartmentDraft(apartments, name) {
  const trimmedName = String(name || '').trim() || `Wohnung ${(apartments?.length || 0) + 1}`;
  const baseSlug = slugifyApartmentName(trimmedName, (apartments?.length || 0) + 1);
  const slug = ensureUniqueSlug(baseSlug, apartments || []);
  const index = (apartments?.length || 0) + 1;
  const firstAreaId = `area_${Date.now()}_${index}`;

  return {
    id: `apartment_${Date.now()}`,
    name: trimmedName,
    slug,
    knxIp: '',
    knxPort: 3671,
    hue: { bridgeIp: '', apiKey: '' },
    floors: [{ id: firstAreaId, name: 'Ground Floor', rooms: [] }],
    areaOrder: [firstAreaId],
    alarms: [],
    importedGroupAddresses: [],
    importedGroupAddressesFileName: '',
  };
}
