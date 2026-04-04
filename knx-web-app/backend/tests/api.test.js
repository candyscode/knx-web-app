const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createBackend } = require('../app');
const MockKnxGateway = require('./mocks/knxGateway');
const MockHueBridge = require('./mocks/hueBridge');

describe('Backend API', () => {
  let tempDir;
  let configFile;
  let backend;
  let knxGateway;
  let mockHueBridge;
  let originalFetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knx-web-app-tests-'));
    configFile = path.join(tempDir, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      knxIp: '',
      knxPort: 3671,
      hue: { bridgeIp: '', apiKey: '' },
      rooms: [
        {
          id: 'room-1',
          name: 'Living Room',
          sceneGroupAddress: '1/2/3',
          hueRoomId: '1',
          scenes: [
            { id: 'scene-1', name: 'Bright', sceneNumber: 1, category: 'light', hueSceneId: 'scene-1' },
            { id: 'scene-2', name: 'Off', sceneNumber: 2, category: 'light' },
            { id: 'scene-3', name: 'Shade Down', sceneNumber: 3, category: 'shade' },
          ],
          functions: [
            { id: 'func-1', name: 'Ceiling', type: 'switch', groupAddress: '1/0/1', statusGroupAddress: '1/0/2' },
            { id: 'func-2', name: 'Blind', type: 'percentage', groupAddress: '1/0/3', statusGroupAddress: '1/0/4', movingGroupAddress: '1/0/5' },
            { id: 'func-3', name: 'Hue Desk', type: 'hue', hueLightId: '2' },
          ],
        },
      ],
    }, null, 2));

    originalFetch = global.fetch;
    mockHueBridge = new MockHueBridge();
    global.fetch = jest.fn((input, init) => mockHueBridge.handleFetch(input, init));

    backend = createBackend({
      configFile,
      createKnxService: (io) => {
        knxGateway = new MockKnxGateway(io);
        return knxGateway;
      },
      huePollingMs: 25,
    });
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    if (backend?.server.listening) {
      await backend.stop();
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('returns persisted config', async () => {
    const response = await request(backend.app).get('/api/config');

    expect(response.status).toBe(200);
    expect(response.body.rooms).toHaveLength(1);
    expect(response.body.rooms[0].name).toBe('Living Room');
  });

  test('updates KNX config and reconnects gateway', async () => {
    const response = await request(backend.app)
      .post('/api/config')
      .send({ knxIp: '192.168.1.10', knxPort: 3671 });

    expect(response.status).toBe(200);
    expect(knxGateway.connectCalls).toEqual([{ ipAddress: '192.168.1.10', port: 3671 }]);
  });

  test('writes switch and percentage actions to KNX', async () => {
    await request(backend.app).post('/api/config').send({ knxIp: '192.168.1.10', knxPort: 3671 });

    const switchResponse = await request(backend.app)
      .post('/api/action')
      .send({ groupAddress: '1/0/1', type: 'switch', value: true });

    const blindsResponse = await request(backend.app)
      .post('/api/action')
      .send({ groupAddress: '1/0/3', type: 'percentage', value: 55 });

    expect(switchResponse.body.success).toBe(true);
    expect(blindsResponse.body.success).toBe(true);
    expect(knxGateway.writeCalls).toEqual([
      { kind: 'group', groupAddress: '1/0/1', value: true, dpt: 'DPT1' },
      { kind: 'group', groupAddress: '1/0/3', value: 55, dpt: 'DPT5.001' },
    ]);
  });

  test('triggers linked Hue scene and off room from KNX scene actions', async () => {
    await request(backend.app).post('/api/config').send({ knxIp: '192.168.1.10', knxPort: 3671 });
    await request(backend.app).post('/api/hue/pair').send({ bridgeIp: mockHueBridge.bridgeIp });

    await request(backend.app)
      .post('/api/action')
      .send({ groupAddress: '1/2/3', type: 'scene', sceneNumber: 1 });

    await request(backend.app)
      .post('/api/action')
      .send({ groupAddress: '1/2/3', type: 'scene', sceneNumber: 2 });

    expect(mockHueBridge.groups['1'].action.scene).toBe('scene-1');
    expect(mockHueBridge.groups['1'].action.on).toBe(false);
  });

  test('supports Hue pairing, lookup and light actions', async () => {
    const pairResponse = await request(backend.app)
      .post('/api/hue/pair')
      .send({ bridgeIp: mockHueBridge.bridgeIp });

    const lightsResponse = await request(backend.app).get('/api/hue/lights');
    const roomsResponse = await request(backend.app).get('/api/hue/rooms');
    const scenesResponse = await request(backend.app).get('/api/hue/scenes');
    const actionResponse = await request(backend.app)
      .post('/api/hue/action')
      .send({ lightId: '2', on: true });

    expect(pairResponse.body.success).toBe(true);
    expect(lightsResponse.body.lights).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '1', name: 'Living Lamp' }),
    ]));
    expect(roomsResponse.body.rooms).toEqual([expect.objectContaining({ id: '1', name: 'Living Room' })]);
    expect(scenesResponse.body.scenes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'scene-1', name: 'Bright' }),
    ]));
    expect(actionResponse.body.success).toBe(true);
    expect(mockHueBridge.lights['2'].state.on).toBe(true);
  });

  test('links and unlinks Hue room and scenes in config', async () => {
    const linkRoomResponse = await request(backend.app)
      .post('/api/config/rooms/room-1/hue-room')
      .send({ hueRoomId: '1' });

    const unlinkRoomResponse = await request(backend.app)
      .delete('/api/config/rooms/room-1/hue-room');

    const linkSceneResponse = await request(backend.app)
      .post('/api/config/scenes/scene-1/hue-scene')
      .send({ hueSceneId: 'scene-3' });

    const unlinkSceneResponse = await request(backend.app)
      .delete('/api/config/scenes/scene-1/hue-scene');

    expect(linkRoomResponse.body.success).toBe(true);
    expect(unlinkRoomResponse.body.success).toBe(true);
    expect(linkSceneResponse.body.success).toBe(true);
    expect(unlinkSceneResponse.body.success).toBe(true);
  });

  test('returns 500 when KNX write fails', async () => {
    await request(backend.app).post('/api/config').send({ knxIp: '192.168.1.10', knxPort: 3671 });
    knxGateway.failNextWrite('Bus timeout');

    const response = await request(backend.app)
      .post('/api/action')
      .send({ groupAddress: '1/0/1', type: 'switch', value: true });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, error: 'Bus timeout' });
  });
});
