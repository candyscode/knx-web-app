'use strict';

const {
  getAllApartmentRooms,
  getAllSharedRooms,
  getApartmentById,
  getApartmentBySlug,
  getSharedAccessApartment,
  migrateLegacyConfig,
  normalizeDptString,
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

  it('normalizes apartment automations and supported action payloads', () => {
    const normalized = normalizeConfigShape({
      version: 2,
      building: {
        sharedAccessApartmentId: 'apartment_1',
        sharedInfos: [],
        sharedAreas: [],
        sharedImportedGroupAddresses: [],
        sharedImportedGroupAddressesFileName: '',
      },
      apartments: [{
        id: 'apartment_1',
        name: 'Wohnung Ost',
        slug: 'wohnung-ost',
        floors: [],
        alarms: [],
        automations: [{
          id: 'routine-1',
          name: 'Morning Routine',
          enabled: true,
          time: '06:45',
          frequency: 'daily',
          actions: [
            {
              id: 'action-1',
              kind: 'scene',
              scope: 'shared',
              areaId: 'shared-garden',
              roomId: 'room-1',
              targetId: 'scene-1',
            },
            {
              id: 'action-2',
              kind: 'function',
              scope: 'apartment',
              areaId: 'living',
              roomId: 'room-2',
              targetId: 'function-1',
              targetType: 'percentage',
              value: '55',
            },
          ],
        }],
      }],
    });

    expect(normalized.apartments[0].automations).toEqual([
      expect.objectContaining({
        id: 'routine-1',
        name: 'Morning Routine',
        enabled: true,
        time: '06:45',
        frequency: 'daily',
        actions: [
          expect.objectContaining({
            id: 'action-1',
            kind: 'scene',
            scope: 'shared',
            areaId: 'shared-garden',
          }),
          expect.objectContaining({
            id: 'action-2',
            kind: 'function',
            targetType: 'percentage',
            value: '55',
          }),
        ],
      }),
    ]);
  });

  it('normalizes imported and persisted ETS DPT formats into backend-safe DPT ids', () => {
    const normalized = normalizeConfigShape({
      version: 2,
      building: {
        sharedAccessApartmentId: 'apartment_1',
        sharedInfos: [{ id: 'info-1', name: 'Outside Temperature', statusGroupAddress: '1/6/3', dpt: 'DPST-9-1' }],
        sharedAreas: [],
        sharedImportedGroupAddresses: [{ address: '1/6/4', name: 'Wind', dpt: 'DPT 9.005', supported: true }],
        sharedImportedGroupAddressesFileName: 'shared.xml',
      },
      apartments: [{
        id: 'apartment_1',
        name: 'Wohnung Ost',
        slug: 'wohnung-ost',
        floors: [],
        alarms: [{ id: 'alarm-1', name: 'Rain Alarm', statusGroupAddress: '1/7/1', dpt: 'DPST-1-1' }],
      }],
    });

    expect(normalized.building.sharedInfos[0].dpt).toBe('DPT9.001');
    expect(normalized.building.sharedImportedGroupAddresses[0].dpt).toBe('DPT9.005');
    expect(normalized.apartments[0].alarms[0].dpt).toBe('DPT1.001');
  });
});

describe('normalizeDptString', () => {
  it('normalizes DPST and spaced DPT values into KNX library compatible ids', () => {
    expect(normalizeDptString('DPST-9-1')).toBe('DPT9.001');
    expect(normalizeDptString('DPT 9.005')).toBe('DPT9.005');
    expect(normalizeDptString('9.028')).toBe('DPT9.028');
    expect(normalizeDptString('DPST-1-1')).toBe('DPT1.001');
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
