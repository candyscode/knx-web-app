'use strict';

const {
  executeAutomation,
  getDueAutomations,
  isAutomationDue,
  parseAutomationTime,
  resolveAutomationAction,
} = require('../../automationService');
const { normalizeConfigShape } = require('../../configModel');

function buildConfig() {
  return normalizeConfigShape({
    version: 2,
    building: {
      sharedAccessApartmentId: 'apartment_1',
      sharedInfos: [],
      sharedAreas: [
        {
          id: 'shared-garden',
          name: 'Garden',
          rooms: [
            {
              id: 'shared-room',
              name: 'Garden',
              sceneGroupAddress: '1/2/3',
              scenes: [{ id: 'shared-scene', name: 'Evening', sceneNumber: 7, category: 'light' }],
              functions: [],
            },
          ],
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
        floors: [
          {
            id: 'living',
            name: 'Living',
            rooms: [
              {
                id: 'living-room',
                name: 'Wohnzimmer',
                sceneGroupAddress: '2/3/4',
                scenes: [{ id: 'scene-1', name: 'Bright', sceneNumber: 3, category: 'light' }],
                functions: [
                  { id: 'switch-1', name: 'Shade Lock', type: 'switch', groupAddress: '2/4/1' },
                  { id: 'percent-1', name: 'Shade Position', type: 'percentage', groupAddress: '2/4/2' },
                ],
              },
            ],
          },
        ],
        automations: [
          {
            id: 'routine-1',
            name: 'Morning',
            enabled: true,
            time: '07:30',
            frequency: 'daily',
            actions: [
              {
                id: 'action-scene',
                kind: 'scene',
                scope: 'shared',
                areaId: 'shared-garden',
                roomId: 'shared-room',
                targetId: 'shared-scene',
                targetType: 'scene',
              },
              {
                id: 'action-switch',
                kind: 'function',
                scope: 'apartment',
                areaId: 'living',
                roomId: 'living-room',
                targetId: 'switch-1',
                targetType: 'switch',
                value: true,
              },
            ],
          },
        ],
        alarms: [],
      },
    ],
  });
}

describe('automationService scheduling', () => {
  it('parses valid HH:mm times and rejects invalid ones', () => {
    expect(parseAutomationTime('07:30')).toEqual({ hours: 7, minutes: 30 });
    expect(parseAutomationTime('25:00')).toBeNull();
    expect(parseAutomationTime('foo')).toBeNull();
  });

  it('marks daily routines as due only once per local day', () => {
    const automation = {
      enabled: true,
      frequency: 'daily',
      time: '07:30',
      lastRunAt: '',
    };
    const now = new Date('2026-04-22T08:00:00');

    expect(isAutomationDue(automation, now)).toBe(true);
    expect(getDueAutomations(buildConfig(), now)).toHaveLength(1);

    automation.lastRunAt = '2026-04-22T07:40:00';
    expect(isAutomationDue(automation, now)).toBe(false);
  });
});

describe('automationService action resolution', () => {
  it('resolves scene and function targets with the correct KNX payload', () => {
    const config = buildConfig();

    expect(resolveAutomationAction(config, 'apartment_1', {
      kind: 'scene',
      scope: 'shared',
      areaId: 'shared-garden',
      roomId: 'shared-room',
      targetId: 'shared-scene',
    })).toEqual(expect.objectContaining({
      success: true,
      payload: expect.objectContaining({
        apartmentId: 'apartment_1',
        scope: 'shared',
        type: 'scene',
        groupAddress: '1/2/3',
        sceneNumber: 7,
      }),
    }));

    expect(resolveAutomationAction(config, 'apartment_1', {
      kind: 'function',
      scope: 'apartment',
      areaId: 'living',
      roomId: 'living-room',
      targetId: 'percent-1',
      value: '55',
    })).toEqual(expect.objectContaining({
      success: true,
      payload: expect.objectContaining({
        scope: 'apartment',
        type: 'percentage',
        groupAddress: '2/4/2',
        value: 55,
      }),
    }));
  });
});

describe('automationService execution', () => {
  it('runs routine actions sequentially and stores the last run state', async () => {
    const config = buildConfig();
    const executeAction = jest.fn().mockResolvedValue(undefined);
    const now = new Date('2026-04-22T07:35:00');

    const result = await executeAutomation(config, 'apartment_1', 'routine-1', executeAction, now);

    expect(result.status).toBe('success');
    expect(executeAction).toHaveBeenNthCalledWith(1, expect.objectContaining({
      scope: 'shared',
      type: 'scene',
      groupAddress: '1/2/3',
    }));
    expect(executeAction).toHaveBeenNthCalledWith(2, expect.objectContaining({
      scope: 'apartment',
      type: 'switch',
      groupAddress: '2/4/1',
      value: true,
    }));
    expect(config.apartments[0].automations[0]).toEqual(expect.objectContaining({
      lastRunAt: now.toISOString(),
      lastRunStatus: 'success',
      lastRunMessage: 'Executed 2 action(s)',
    }));
  });

  it('marks the run as partial when one action fails', async () => {
    const config = buildConfig();
    const executeAction = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Bus write failed'));

    const result = await executeAutomation(
      config,
      'apartment_1',
      'routine-1',
      executeAction,
      new Date('2026-04-22T07:35:00')
    );

    expect(result.status).toBe('partial');
    expect(config.apartments[0].automations[0]).toEqual(expect.objectContaining({
      lastRunStatus: 'partial',
      lastRunMessage: 'Executed 1 action(s), 1 failed',
    }));
  });
});
