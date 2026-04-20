'use strict';

const {
  getAllApartmentRooms,
  getAllSharedRooms,
  getApartmentById,
  getApartmentBySlug,
  getSharedAccessApartment,
  migrateLegacyConfig,
  normalizeConfigShape,
} = require('../../configModel');

describe('configModel migration and normalization', () => {
  it('migrates legacy single-apartment configs into building + apartments', () => {
    const migrated = migrateLegacyConfig({
      knxIp: '192.168.1.10',
      knxPort: 3671,
      rooms: [{ id: 'room-1', name: 'Living Room', scenes: [], functions: [] }],
      globals: [
        { id: 'info-1', name: 'Outside Temperature', type: 'info', category: 'temperature' },
        { id: 'alarm-1', name: 'Rain Alarm', type: 'alarm', category: 'alarm' },
      ],
      importedGroupAddresses: [{ address: '1/1/1', name: 'Imported', supported: true }],
      importedGroupAddressesFileName: 'legacy.xml',
    });

    expect(migrated.version).toBe(2);
    expect(migrated.building.sharedInfos).toEqual([
      expect.objectContaining({ id: 'info-1', name: 'Outside Temperature', type: 'info' }),
    ]);
    expect(migrated.building.sharedUsesApartmentImportedGroupAddresses).toBe(false);
    expect(migrated.apartments[0]).toEqual(expect.objectContaining({
      id: 'apartment_1',
      name: 'Wohnung 1',
      slug: 'wohnung-1',
      knxIp: '192.168.1.10',
      alarms: [expect.objectContaining({ id: 'alarm-1', type: 'alarm' })],
    }));
    expect(migrated.apartments[0].areaOrder).toEqual([migrated.apartments[0].floors[0].id]);
  });

  it('normalizes duplicate apartment slugs and repairs invalid shared access ids', () => {
    const normalized = normalizeConfigShape({
      version: 2,
      building: {
        sharedAccessApartmentId: 'missing',
        sharedInfos: [],
        sharedAreas: [],
        sharedImportedGroupAddresses: [],
        sharedImportedGroupAddressesFileName: '',
      },
      apartments: [
        {
          id: 'apartment_1',
          name: 'Wohnung Ost',
          slug: 'wohnung',
          floors: [],
          alarms: [],
        },
        {
          id: 'apartment_2',
          name: 'Wohnung West',
          slug: 'wohnung',
          floors: [],
          alarms: [],
        },
      ],
    });

    expect(normalized.apartments[0].slug).toBe('wohnung');
    expect(normalized.apartments[1].slug).toBe('wohnung-2');
    expect(normalized.building.sharedAccessApartmentId).toBe('apartment_1');
  });

  it('preserves whether shared browsing should use the apartment ETS XML', () => {
    const normalized = normalizeConfigShape({
      version: 2,
      building: {
        sharedAccessApartmentId: 'apartment_1',
        sharedUsesApartmentImportedGroupAddresses: true,
        sharedInfos: [],
        sharedAreas: [],
        sharedImportedGroupAddresses: [{ address: '1/1/1', name: 'Shared', supported: true }],
        sharedImportedGroupAddressesFileName: 'shared.xml',
      },
      apartments: [{ id: 'apartment_1', name: 'Wohnung Ost', slug: 'wohnung-ost', floors: [], alarms: [] }],
    });

    expect(normalized.building.sharedUsesApartmentImportedGroupAddresses).toBe(true);
  });
});

describe('configModel selectors', () => {
  const config = normalizeConfigShape({
    version: 2,
    building: {
      sharedAccessApartmentId: 'apartment_2',
      sharedInfos: [],
      sharedAreas: [
        {
          id: 'shared-garden',
          name: 'Garden',
          rooms: [{ id: 'shared-room', name: 'Garden Lights', scenes: [], functions: [] }],
        },
      ],
      sharedImportedGroupAddresses: [],
      sharedImportedGroupAddressesFileName: '',
    },
    apartments: [
      {
        id: 'apartment_1',
        name: 'Wohnung Ost',
        slug: 'wohnung-ost',
        floors: [{ id: 'east-floor', name: 'Living', rooms: [{ id: 'east-room', name: 'Living Room', scenes: [], functions: [] }] }],
        alarms: [],
      },
      {
        id: 'apartment_2',
        name: 'Wohnung West',
        slug: 'wohnung-west',
        floors: [{ id: 'west-floor', name: 'Kitchen', rooms: [] }],
        alarms: [],
      },
    ],
  });

  it('finds apartments by id and slug', () => {
    expect(getApartmentById(config, 'apartment_2')).toEqual(expect.objectContaining({ name: 'Wohnung West' }));
    expect(getApartmentBySlug(config, 'wohnung-ost')).toEqual(expect.objectContaining({ id: 'apartment_1' }));
  });

  it('returns the configured shared access apartment', () => {
    expect(getSharedAccessApartment(config)).toEqual(expect.objectContaining({ id: 'apartment_2', name: 'Wohnung West' }));
  });

  it('collects apartment and shared rooms separately', () => {
    expect(getAllApartmentRooms(getApartmentById(config, 'apartment_1'))).toEqual([
      expect.objectContaining({ id: 'east-room', name: 'Living Room' }),
    ]);
    expect(getAllSharedRooms(config)).toEqual([
      expect.objectContaining({ id: 'shared-room', name: 'Garden Lights' }),
    ]);
  });
});
