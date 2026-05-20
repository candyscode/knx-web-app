'use strict';
/**
 * Unit tests for KnxService.
 *
 * The `knx` npm package is fully mocked — no real UDP socket is needed.
 * We verify that KnxService calls the library correctly and emits the
 * expected Socket.IO events.
 */

jest.mock('knx', () => ({
  Connection: jest.fn(),
}));

const knx = require('knx');
const KnxService = require('../../knxService');
const DPTLib = require('knx/src/dptlib');

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fake Socket.IO `io` object that records emitted events. */
function makeFakeIo() {
  const events = [];
  return {
    emit: (event, data) => events.push({ event, data }),
    _events: events,
  };
}

/**
 * Create a mock knx.Connection whose handlers can be triggered manually.
 * capturedHandlers is populated when Connection is instantiated.
 */
function setupKnxMock() {
  const capturedHandlers = {};
  const mockConn = {
    write: jest.fn(),
    read:  jest.fn(),
    Disconnect: jest.fn(),
  };

  knx.Connection.mockImplementation(({ handlers }) => {
    Object.assign(capturedHandlers, handlers);
    return mockConn;
  });

  return { mockConn, capturedHandlers };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('KnxService — unit', () => {
  let io, service;

  beforeEach(() => {
    jest.clearAllMocks();
    io = makeFakeIo();
    service = new KnxService(io);
  });

  // ── connect() ──────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('emits knx_status "Connecting" immediately', () => {
      setupKnxMock();
      service.connect('192.168.1.85', 3671);
      expect(io._events).toContainEqual(
        expect.objectContaining({ event: 'knx_status', data: expect.objectContaining({ connected: false }) })
      );
    });

    it('creates the KNX connection with loglevel=error to suppress library noise', () => {
      jest.useFakeTimers();
      setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      expect(knx.Connection).toHaveBeenCalledWith(expect.objectContaining({
        ipAddr: '192.168.1.85',
        ipPort: 3671,
        loglevel: 'error',
      }));
      jest.useRealTimers();
    });

    it('does nothing when no IP is provided', () => {
      service.connect('', 3671);
      expect(knx.Connection).not.toHaveBeenCalled();
    });

    it('sets isConnected=true when connected handler fires', () => {
      jest.useFakeTimers();
      const { capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();
      expect(service.isConnected).toBe(true);
      jest.useRealTimers();
    });

    it('emits knx_status connected:true when connected handler fires', () => {
      jest.useFakeTimers();
      const { capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();
      const connected = io._events.find(e => e.event === 'knx_status' && e.data.connected === true);
      expect(connected).toBeDefined();
      jest.useRealTimers();
    });

    it('sets isConnected=false and emits knx_error on error handler', () => {
      jest.useFakeTimers();
      const { capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.error('ECONNREFUSED');
      expect(service.isConnected).toBe(false);
      const errEvent = io._events.find(e => e.event === 'knx_error');
      expect(errEvent).toBeDefined();
      jest.useRealTimers();
    });

    it('sets isConnected=false on disconnected handler', () => {
      jest.useFakeTimers();
      const { capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();
      capturedHandlers.disconnected();
      expect(service.isConnected).toBe(false);
      jest.useRealTimers();
    });

    it('does not emit duplicate offline statuses for repeated disconnect/error callbacks', () => {
      jest.useFakeTimers();
      const { capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();

      capturedHandlers.disconnected();
      capturedHandlers.disconnected();
      capturedHandlers.error('ECONNREFUSED');
      capturedHandlers.error('ECONNREFUSED');

      const offlineStatuses = io._events.filter((entry) =>
        entry.event === 'knx_status' && entry.data.msg === 'Disconnected from bus'
      );
      const offlineErrors = io._events.filter((entry) =>
        entry.event === 'knx_error' && entry.data.msg === 'Bus access failed: ECONNREFUSED. Check IP interface.'
      );

      expect(offlineStatuses).toHaveLength(1);
      expect(offlineErrors).toHaveLength(1);
      jest.useRealTimers();
    });

    it('calls onConnectCallback when connection establishes', () => {
      jest.useFakeTimers();
      const { capturedHandlers } = setupKnxMock();
      const cb = jest.fn();
      service.connect('192.168.1.85', 3671, cb);
      jest.runAllTimers();
      capturedHandlers.connected();
      expect(cb).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('disconnects existing connection before reconnecting', () => {
      jest.useFakeTimers();
      const { mockConn } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      // Set connection manually as if connected
      service.connection = mockConn;
      service.connect('192.168.1.86', 3671);
      expect(mockConn.Disconnect).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  // ── writeGroupValue() ──────────────────────────────────────────────────────

  describe('writeGroupValue()', () => {
    function getConnectedService() {
      jest.useFakeTimers();
      const { mockConn, capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();
      jest.useRealTimers();
      return mockConn;
    }

    it('throws when not connected', () => {
      expect(() => service.writeGroupValue('1/0/0', true, 'DPT1')).toThrow('Not connected');
    });

    it('writes DPT1 ON (value=1) when value=true', () => {
      const mockConn = getConnectedService();
      service.writeGroupValue('1/0/0', true, 'DPT1');
      expect(mockConn.write).toHaveBeenCalledWith('1/0/0', 1, 'DPT1');
    });

    it('writes DPT1 OFF (value=0) when value=false', () => {
      const mockConn = getConnectedService();
      service.writeGroupValue('1/0/0', false, 'DPT1');
      expect(mockConn.write).toHaveBeenCalledWith('1/0/0', 0, 'DPT1');
    });

    it('writes DPT5.001 for percentage type', () => {
      const mockConn = getConnectedService();
      service.writeGroupValue('2/0/0', 75, 'DPT5.001');
      expect(mockConn.write).toHaveBeenCalledWith('2/0/0', 75, 'DPT5.001');
    });

    it('writes DPT9.002 correctly', () => {
      const mockConn = getConnectedService();
      service.writeGroupValue('4/1/1', -1.5, 'DPT9.002');
      expect(mockConn.write).toHaveBeenCalledWith('4/1/1', -1.5, 'DPT9.002');
    });

    it('passes arbitrary DPTs to the connection write method', () => {
      const mockConn = getConnectedService();
      service.writeGroupValue('4/1/1', 22.5, 'DPT9.001');
      expect(mockConn.write).toHaveBeenCalledWith('4/1/1', 22.5, 'DPT9.001');
    });
  });

  // ── writeScene() ───────────────────────────────────────────────────────────

  describe('writeScene()', () => {
    function getConnected() {
      jest.useFakeTimers();
      const { mockConn, capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();
      jest.useRealTimers();
      return mockConn;
    }

    it('throws when not connected', () => {
      expect(() => service.writeScene('3/5/0', 1)).toThrow('Not connected');
    });

    it('converts scene 1 → bus value 0 (DPT17.001 offset)', () => {
      const mockConn = getConnected();
      service.writeScene('3/5/0', 1);
      expect(mockConn.write).toHaveBeenCalledWith('3/5/0', 0, 'DPT17.001');
    });

    it('converts scene 5 → bus value 4', () => {
      const mockConn = getConnected();
      service.writeScene('3/5/0', 5);
      expect(mockConn.write).toHaveBeenCalledWith('3/5/0', 4, 'DPT17.001');
    });

    it('clamps scene 65 (out of range) to bus value 63', () => {
      const mockConn = getConnected();
      service.writeScene('3/5/0', 65);
      expect(mockConn.write).toHaveBeenCalledWith('3/5/0', 63, 'DPT17.001');
    });

    it('fallbacks invalid (NaN) scene number to bus value 0', () => {
      const mockConn = getConnected();
      service.writeScene('3/5/0', NaN);
      expect(mockConn.write).toHaveBeenCalledWith('3/5/0', 0, 'DPT17.001');
    });
  });

  // ── readStatus() ──────────────────────────────────────────────────────────

  describe('readStatus()', () => {
    it('does nothing when not connected', () => {
      expect(() => service.readStatus('1/0/1')).not.toThrow();
    });

    it('calls connection.read when connected', () => {
      jest.useFakeTimers();
      const { mockConn, capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();
      jest.useRealTimers();

      service.readStatus('1/0/1');
      expect(mockConn.read).toHaveBeenCalledWith('1/0/1');
    });
  });

  // ── bus event handling ─────────────────────────────────────────────────────

  describe('bus event → knx_state_update', () => {
    function connect() {
      jest.useFakeTimers();
      const { capturedHandlers } = setupKnxMock();
      service.connect('192.168.1.85', 3671);
      jest.runAllTimers();
      capturedHandlers.connected();
      jest.useRealTimers();
      return capturedHandlers;
    }

    it('emits knx_state_update for GroupValue_Write on known GA', () => {
      service.setGaToType({ '1/0/0': 'switch' });
      const handlers = connect();

      handlers.event('GroupValue_Write', null, '1/0/0', Buffer.from([0x01]));

      const update = io._events.find(e => e.event === 'knx_state_update');
      expect(update).toBeDefined();
      expect(update.data).toEqual({ groupAddress: '1/0/0', value: true });
    });

    it('parses DPT5 percentage (0xFF → 100%)', () => {
      service.setGaToType({ '2/0/0': 'percentage' });
      const handlers = connect();

      handlers.event('GroupValue_Write', null, '2/0/0', Buffer.from([0xFF]));

      const update = io._events.find(e => e.event === 'knx_state_update' && e.data.groupAddress === '2/0/0');
      expect(update.data.value).toBe(100);
    });

    it('parses DPT5 percentage (0x80 ≈ 50%)', () => {
      service.setGaToType({ '2/0/0': 'percentage' });
      const handlers = connect();

      handlers.event('GroupValue_Write', null, '2/0/0', Buffer.from([0x80]));

      const update = io._events.find(e => e.event === 'knx_state_update' && e.data.groupAddress === '2/0/0');
      expect(update.data.value).toBeCloseTo(50, 0);
    });

    it('parses DPT9 values when the configured DPT uses ETS DPST notation', () => {
      service.setGaToType({ '1/6/3': 'info' });
      service.setGaToDpt({ '1/6/3': 'DPST-9-1' });
      const handlers = connect();
      const encodedTemperature = DPTLib.resolve('DPT9.001').formatAPDU(23.8);

      handlers.event('GroupValue_Write', null, '1/6/3', encodedTemperature);

      const update = io._events.find(e => e.event === 'knx_state_update' && e.data.groupAddress === '1/6/3');
      expect(update.data.value).toBeCloseTo(23.8, 1);
      expect(service.deviceStates['1/6/3']).toBeCloseTo(23.8, 1);
    });

    it('parses DPT9 wind speed values when the configured DPT contains spaces', () => {
      service.setGaToType({ '1/6/4': 'info' });
      service.setGaToDpt({ '1/6/4': 'DPT 9.005' });
      const handlers = connect();
      const encodedWind = DPTLib.resolve('DPT9.005').formatAPDU(4.2);

      handlers.event('GroupValue_Write', null, '1/6/4', encodedWind);

      const update = io._events.find(e => e.event === 'knx_state_update' && e.data.groupAddress === '1/6/4');
      expect(update.data.value).toBeCloseTo(4.2, 1);
      expect(service.deviceStates['1/6/4']).toBeCloseTo(4.2, 1);
    });

    it('calls sceneTriggerCallback for GroupValue_Write on scene GA', () => {
      service.setGaToType({ '3/5/0': 'scene' });
      const cb = jest.fn();
      service.setSceneTriggerCallback(cb);
      const handlers = connect();

      // Bus value 0x00 = scene 1 (DPT17: scene n = bus value n-1)
      handlers.event('GroupValue_Write', null, '3/5/0', Buffer.from([0x00]));

      expect(cb).toHaveBeenCalledWith('3/5/0', 1);
    });

    it('does NOT call sceneTriggerCallback for GroupValue_Response', () => {
      service.setGaToType({ '3/5/0': 'scene' });
      const cb = jest.fn();
      service.setSceneTriggerCallback(cb);
      const handlers = connect();

      handlers.event('GroupValue_Response', null, '3/5/0', Buffer.from([0x00]));

      expect(cb).not.toHaveBeenCalled();
    });

    it('stores parsed value in deviceStates', () => {
      service.setGaToType({ '1/0/0': 'switch' });
      const handlers = connect();

      handlers.event('GroupValue_Write', null, '1/0/0', Buffer.from([0x01]));

      expect(service.deviceStates['1/0/0']).toBe(true);
    });
  });
});
