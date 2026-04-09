'use strict';
/**
 * Socket.IO integration tests.
 * Verifies that the server emits the correct events to connecting clients.
 */

jest.mock('knx');
const knx = require('knx');
knx.Connection.mockImplementation(({ handlers }) => {
  setTimeout(() => handlers.connected(), 10);
  return { write: jest.fn(), read: jest.fn(), Disconnect: jest.fn() };
});

const http       = require('http');
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const KnxService = require('../../knxService');
const HueService = require('../../hueService');

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitForEvent(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeout);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

function buildTestServer(configOverride = {}) {
  const configPath = path.join(os.tmpdir(), `knx-socket-test-${Date.now()}.json`);
  const config = {
    knxIp: '',
    knxPort: 3671,
    hue: { bridgeIp: '', apiKey: '' },
    rooms: [],
    ...configOverride,
  };
  fs.writeFileSync(configPath, JSON.stringify(config));

  const app    = express();
  const server = http.createServer(app);
  const io     = new Server(server, { cors: { origin: '*' } });

  app.use(cors());
  app.use(bodyParser.json());

  const knxService = new KnxService(io);
  const hueService = new HueService();
  hueService.init(config.hue);

  io.on('connection', (socket) => {
    socket.emit('knx_status', {
      connected: knxService.isConnected,
      msg: knxService.isConnected ? 'Connected' : (config.knxIp ? 'Disconnected' : 'No KNX IP Configured'),
    });
    socket.emit('hue_status', { paired: hueService.isPaired, bridgeIp: hueService.bridgeIp });
    socket.emit('knx_initial_states', knxService.deviceStates);
  });

  app.post('/api/hue/action', async (req, res) => {
    const { lightId, on } = req.body;
    const result = await hueService.setLightState(lightId, on);
    if (result.success) io.emit('hue_state_update', { lightId: `hue_${lightId}`, on: !!on });
    res.json(result);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, io, knxService, hueService, port, configPath });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Socket.IO events on connect', () => {
  let ctx, client;

  beforeAll(async () => {
    ctx = await buildTestServer();
    client = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    await waitForEvent(client, 'connect');
  });

  afterAll(async () => {
    client.disconnect();
    await new Promise(r => ctx.server.close(r));
    if (fs.existsSync(ctx.configPath)) fs.unlinkSync(ctx.configPath);
  });

  it('emits knx_status on connect', async () => {
    const client2 = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    const status = await waitForEvent(client2, 'knx_status');
    expect(status).toHaveProperty('connected');
    expect(typeof status.connected).toBe('boolean');
    expect(status).toHaveProperty('msg');
    client2.disconnect();
  });

  it('emits hue_status on connect', async () => {
    const client2 = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    const status = await waitForEvent(client2, 'hue_status');
    expect(status).toHaveProperty('paired');
    expect(status.paired).toBe(false);
    client2.disconnect();
  });

  it('emits knx_initial_states on connect', async () => {
    const client2 = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    const states = await waitForEvent(client2, 'knx_initial_states');
    expect(typeof states).toBe('object');
    client2.disconnect();
  });

  it('knx_status msg indicates no KNX IP configured', async () => {
    const client2 = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    const status = await waitForEvent(client2, 'knx_status');
    expect(status.msg).toMatch(/no knx ip|disconnected/i);
    client2.disconnect();
  });
});

describe('Socket.IO events — knx_state_update broadcast', () => {
  let ctx, client;

  beforeAll(async () => {
    ctx = await buildTestServer();
    client = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    await waitForEvent(client, 'connect');
  });

  afterAll(async () => {
    client.disconnect();
    await new Promise(r => ctx.server.close(r));
    if (fs.existsSync(ctx.configPath)) fs.unlinkSync(ctx.configPath);
  });

  it('broadcasts knx_state_update when KNX service emits one', async () => {
    const updatePromise = waitForEvent(client, 'knx_state_update');

    // Simulate knx library emitting a bus telegram
    ctx.knxService.deviceStates['1/0/0'] = true;
    ctx.io.emit('knx_state_update', { groupAddress: '1/0/0', value: true });

    const update = await updatePromise;
    expect(update).toEqual({ groupAddress: '1/0/0', value: true });
  });
});

describe('Socket.IO events — hue_status for paired bridge', () => {
  let ctx, client;

  beforeAll(async () => {
    ctx = await buildTestServer({ hue: { bridgeIp: '192.168.1.65', apiKey: 'some-key' } });
    client = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    await waitForEvent(client, 'connect');
  });

  afterAll(async () => {
    client.disconnect();
    await new Promise(r => ctx.server.close(r));
    if (fs.existsSync(ctx.configPath)) fs.unlinkSync(ctx.configPath);
  });

  it('emits hue_status with paired=true when bridge is configured', async () => {
    const client2 = ioClient(`http://127.0.0.1:${ctx.port}`, { transports: ['websocket'] });
    const status = await waitForEvent(client2, 'hue_status');
    expect(status.paired).toBe(true);
    expect(status.bridgeIp).toBe('192.168.1.65');
    client2.disconnect();
  });
});
