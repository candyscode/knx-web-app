/**
 * Frontend API unit tests.
 * Tests every exported function in configApi.js using fetch mocking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../configApi';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockResponse(body, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('getConfig()', () => {
  it('GETs /api/config and returns parsed JSON', async () => {
    const cfg = { knxIp: '192.168.1.85', rooms: [] };
    mockFetch.mockReturnValueOnce(mockResponse(cfg));
    const result = await api.getConfig();
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/config'));
    expect(result).toEqual(cfg);
  });
});

describe('updateConfig()', () => {
  it('POSTs to /api/config with JSON body', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    const data = { knxIp: '10.0.0.1' };
    await api.updateConfig(data);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/config');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(data);
  });
});

describe('triggerAction()', () => {
  it('POSTs to /api/action with action data', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    await api.triggerAction({ groupAddress: '1/0/0', type: 'switch', value: true });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/action');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ groupAddress: '1/0/0', type: 'switch' });
  });
});

describe('discoverHueBridge()', () => {
  it('POSTs to /api/hue/discover', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true, bridges: [] }));
    await api.discoverHueBridge();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/hue/discover');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });
});

describe('pairHueBridge()', () => {
  it('POSTs bridgeIp to /api/hue/pair', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true, apiKey: 'key' }));
    await api.pairHueBridge('192.168.1.65');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.bridgeIp).toBe('192.168.1.65');
  });
});

describe('unpairHueBridge()', () => {
  it('POSTs to /api/hue/unpair', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    await api.unpairHueBridge();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/hue/unpair');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });
});

describe('getHueLights()', () => {
  it('GETs /api/hue/lights', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true, lights: [] }));
    await api.getHueLights();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/hue/lights');
  });
});

describe('getHueRooms()', () => {
  it('GETs /api/hue/rooms', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true, rooms: [] }));
    await api.getHueRooms();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/hue/rooms');
  });
});

describe('getHueScenes()', () => {
  it('GETs /api/hue/scenes', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true, scenes: [] }));
    await api.getHueScenes();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/hue/scenes');
  });
});

describe('linkHueRoom()', () => {
  it('POSTs hueRoomId to /api/config/rooms/:id/hue-room', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    await api.linkHueRoom('room1', 'hueRoom1');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/config/rooms/room1/hue-room');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).hueRoomId).toBe('hueRoom1');
  });
});

describe('unlinkHueRoom()', () => {
  it('DELETEs /api/config/rooms/:id/hue-room', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    await api.unlinkHueRoom('room1');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/config/rooms/room1/hue-room');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('linkHueScene()', () => {
  it('POSTs hueSceneId to /api/config/scenes/:id/hue-scene', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    await api.linkHueScene('scene1', 'hueScene1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.hueSceneId).toBe('hueScene1');
  });
});

describe('unlinkHueScene()', () => {
  it('DELETEs /api/config/scenes/:id/hue-scene', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    await api.unlinkHueScene('scene1');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('triggerHueAction()', () => {
  it('POSTs lightId and on to /api/hue/action', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ success: true }));
    await api.triggerHueAction('1', true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.lightId).toBe('1');
    expect(body.on).toBe(true);
  });
});
