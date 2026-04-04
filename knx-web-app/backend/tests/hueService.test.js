const HueService = require('../hueService');
const MockHueBridge = require('./mocks/hueBridge');

describe('HueService', () => {
  let hueService;
  let mockHueBridge;
  let originalFetch;

  beforeEach(() => {
    hueService = new HueService();
    mockHueBridge = new MockHueBridge();
    originalFetch = global.fetch;
    global.fetch = jest.fn((input, init) => mockHueBridge.handleFetch(input, init));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('discovers bridges via Hue discovery API', async () => {
    const bridges = await hueService.discoverBridges();

    expect(bridges).toEqual([
      expect.objectContaining({ internalipaddress: '192.168.1.20' }),
    ]);
  });

  test('pairs successfully and stores credentials', async () => {
    const result = await hueService.pairBridge(mockHueBridge.bridgeIp);

    expect(result).toEqual({ success: true, apiKey: mockHueBridge.username });
    expect(hueService.isPaired).toBe(true);
    expect(hueService.bridgeIp).toBe(mockHueBridge.bridgeIp);
  });

  test('returns mapped lights, rooms and scenes', async () => {
    hueService.init({ bridgeIp: mockHueBridge.bridgeIp, apiKey: mockHueBridge.username });

    await expect(hueService.getLights()).resolves.toEqual({
      success: true,
      lights: [
        expect.objectContaining({ id: '1', name: 'Living Lamp', on: true }),
        expect.objectContaining({ id: '2', name: 'Desk Lamp', on: false }),
      ],
    });

    await expect(hueService.getRooms()).resolves.toEqual({
      success: true,
      rooms: [expect.objectContaining({ id: '1', name: 'Living Room', lights: ['1', '2'] })],
    });

    await expect(hueService.getScenes()).resolves.toEqual({
      success: true,
      scenes: expect.arrayContaining([
        expect.objectContaining({ id: 'scene-1', name: 'Bright', group: '1' }),
      ]),
    });
  });

  test('triggers scenes and turns off rooms through bridge endpoints', async () => {
    hueService.init({ bridgeIp: mockHueBridge.bridgeIp, apiKey: mockHueBridge.username });

    const triggerResult = await hueService.triggerScene('scene-1');
    const offResult = await hueService.turnOffRoom('1');

    expect(triggerResult.success).toBe(true);
    expect(offResult.success).toBe(true);
    expect(mockHueBridge.groups['1'].action.scene).toBe('scene-1');
    expect(mockHueBridge.groups['1'].action.on).toBe(false);
  });

  test('polls mapped light states in frontend format', async () => {
    hueService.init({ bridgeIp: mockHueBridge.bridgeIp, apiKey: mockHueBridge.username });

    const states = await hueService.getLightStates(['1', '2']);

    expect(states).toEqual({ hue_1: true, hue_2: false });
  });
});
