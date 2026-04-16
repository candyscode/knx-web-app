'use strict';
/**
 * Unit tests for HueService.
 * All HTTP calls are intercepted via jest-fetch-mock; no real bridge needed.
 */

const fetchMock = require('jest-fetch-mock');
fetchMock.enableFetchMocks();

const HueService = require('../../hueService');
const { HUE_LIGHTS, HUE_GROUPS, HUE_SCENES } = require('../fixtures/hueFixtures');

const BRIDGE_IP = '192.168.1.65';
const API_KEY   = 'test-api-key';

function makePairedService() {
  const svc = new HueService();
  svc.init({ bridgeIp: BRIDGE_IP, apiKey: API_KEY });
  return svc;
}

beforeEach(() => {
  fetchMock.resetMocks();
});

// ── isPaired ─────────────────────────────────────────────────────────────────

describe('isPaired', () => {
  it('returns false when unconfigured', () => {
    expect(new HueService().isPaired).toBe(false);
  });

  it('returns true when bridgeIp and apiKey are set', () => {
    expect(makePairedService().isPaired).toBe(true);
  });

  it('returns false after unpair()', () => {
    const svc = makePairedService();
    svc.unpair();
    expect(svc.isPaired).toBe(false);
  });
});

// ── discoverBridges ───────────────────────────────────────────────────────────

describe('discoverBridges()', () => {
  it('returns bridge list from meethue.com', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ id: 'abc', internalipaddress: '192.168.1.65' }]));
    const svc = new HueService();
    const result = await svc.discoverBridges();
    expect(result).toHaveLength(1);
    expect(result[0].internalipaddress).toBe('192.168.1.65');
  });

  it('returns [] when discovery endpoint fails', async () => {
    fetchMock.mockRejectOnce(new Error('Network error'));
    const result = await new HueService().discoverBridges();
    expect(result).toEqual([]);
  });
});

// ── pairBridge ────────────────────────────────────────────────────────────────

describe('pairBridge()', () => {
  it('returns success and sets credentials when link button pressed', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ success: { username: 'new-key', clientkey: 'ck' } }]));
    const svc = new HueService();
    const result = await svc.pairBridge(BRIDGE_IP);
    expect(result.success).toBe(true);
    expect(result.apiKey).toBe('new-key');
    expect(svc.bridgeIp).toBe(BRIDGE_IP);
    expect(svc.apiKey).toBe('new-key');
  });

  it('returns error when link button not pressed', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ error: { type: 101, description: 'link button not pressed' } }]));
    const result = await new HueService().pairBridge(BRIDGE_IP);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/link button/i);
  });

  it('returns error on network failure', async () => {
    fetchMock.mockRejectOnce(new Error('ECONNREFUSED'));
    const result = await new HueService().pairBridge(BRIDGE_IP);
    expect(result.success).toBe(false);
  });
});

// ── getLights ──────────────────────────────────────────────────────────────────

describe('getLights()', () => {
  it('returns error when not paired', async () => {
    const result = await new HueService().getLights();
    expect(result.success).toBe(false);
    expect(result.lights).toEqual([]);
  });

  it('maps bridge response to correct shape', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(HUE_LIGHTS));
    const result = await makePairedService().getLights();
    expect(result.success).toBe(true);
    expect(result.lights).toHaveLength(2);
    expect(result.lights[0]).toMatchObject({ id: '1', name: 'Leselampe', on: false, reachable: true });
    expect(result.lights[1]).toMatchObject({ id: '2', name: 'Küche Ambientelicht', on: true });
  });

  it('returns error when bridge is unreachable', async () => {
    fetchMock.mockRejectOnce(new Error('timeout'));
    const result = await makePairedService().getLights();
    expect(result.success).toBe(false);
  });
});

// ── getRooms ──────────────────────────────────────────────────────────────────

describe('getRooms()', () => {
  it('returns error when not paired', async () => {
    const result = await new HueService().getRooms();
    expect(result.success).toBe(false);
  });

  it('filters to type=Room only (excludes Entertainment etc.)', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(HUE_GROUPS));
    const result = await makePairedService().getRooms();
    expect(result.success).toBe(true);
    // HUE_GROUPS has 2 rooms + 1 entertainment zone
    expect(result.rooms).toHaveLength(2);
    result.rooms.forEach(r => expect(HUE_GROUPS[r.id].type).toBe('Room'));
  });
});

// ── getScenes ─────────────────────────────────────────────────────────────────

describe('getScenes()', () => {
  it('returns error when not paired', async () => {
    const result = await new HueService().getScenes();
    expect(result.success).toBe(false);
  });

  it('maps scenes to correct shape', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(HUE_SCENES));
    const result = await makePairedService().getScenes();
    expect(result.success).toBe(true);
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0]).toMatchObject({ id: 'abc123', name: 'Relax', group: '1' });
  });
});

// ── setLightState ─────────────────────────────────────────────────────────────

describe('setLightState()', () => {
  it('returns error when not paired', async () => {
    const result = await new HueService().setLightState('1', true);
    expect(result.success).toBe(false);
  });

  it('sends PUT with { on: true } to correct endpoint', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ success: {} }]));
    const svc = makePairedService();
    await svc.setLightState('1', true);

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toContain(`/lights/1/state`);
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ on: true });
  });

  it('sends PUT with { on: false } when turning off', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ success: {} }]));
    await makePairedService().setLightState('2', false);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.on).toBe(false);
  });
});

// ── getLightStates ────────────────────────────────────────────────────────────

describe('getLightStates()', () => {
  it('returns empty map when not paired', async () => {
    const result = await new HueService().getLightStates(['1']);
    expect(result).toEqual({});
  });

  it('returns map of hue_id => boolean', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(HUE_LIGHTS));
    const result = await makePairedService().getLightStates(['1', '2']);
    expect(result).toEqual({ hue_1: false, hue_2: true });
  });
});

// ── triggerScene ──────────────────────────────────────────────────────────────

describe('triggerScene()', () => {
  it('returns error when not paired', async () => {
    const result = await new HueService().triggerScene('abc123');
    expect(result.success).toBe(false);
  });

  it('fetches scene to get group, then PUTs to group action', async () => {
    // First call: GET /scenes/:id
    fetchMock.mockResponseOnce(JSON.stringify(HUE_SCENES['abc123']));
    // Second call: PUT /groups/1/action
    fetchMock.mockResponseOnce(JSON.stringify([{ success: {} }]));

    const result = await makePairedService().triggerScene('abc123');
    expect(result.success).toBe(true);

    const putCall = fetchMock.mock.calls[1];
    expect(putCall[0]).toContain('/groups/1/action');
    expect(JSON.parse(putCall[1].body)).toEqual({ scene: 'abc123' });
  });
});

// ── turnOffRoom ───────────────────────────────────────────────────────────────

describe('turnOffRoom()', () => {
  it('returns error when not paired', async () => {
    const result = await new HueService().turnOffRoom('1');
    expect(result.success).toBe(false);
  });

  it('PUTs { on: false } to group action endpoint', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ success: {} }]));
    const result = await makePairedService().turnOffRoom('1');
    expect(result.success).toBe(true);

    const putCall = fetchMock.mock.calls[0];
    expect(putCall[0]).toContain('/groups/1/action');
    expect(JSON.parse(putCall[1].body)).toEqual({ on: false });
  });
});
