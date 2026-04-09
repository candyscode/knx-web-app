/**
 * KNX Service Tests
 * Tests the KnxService class with mocked KNX library
 */

const KnxService = require('../knxService');

// Mock the knx module
jest.mock('knx', () => {
  return {
    Connection: jest.fn()
  };
});

describe('KnxService', () => {
  let knxService;
  let mockIo;
  let mockConnection;

  beforeEach(() => {
    // Enable fake timers
    jest.useFakeTimers();
    
    // Setup mock Socket.IO
    mockIo = {
      emit: jest.fn()
    };
    
    // Create a fresh mock connection for each test
    mockConnection = {
      Disconnect: jest.fn(),
      read: jest.fn(),
      write: jest.fn()
    };
    
    // Setup the Connection mock to return our mockConnection and capture handlers
    const knx = require('knx');
    knx.Connection.mockImplementation(({ handlers }) => {
      // Store handlers on the mock connection so tests can access them
      mockConnection._handlers = handlers;
      return mockConnection;
    });
    
    knxService = new KnxService(mockIo);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    test('should initialize with correct defaults', () => {
      expect(knxService.connection).toBeNull();
      expect(knxService.isConnected).toBe(false);
      expect(knxService.deviceStates).toEqual({});
      expect(knxService.gaToType).toEqual({});
    });

    test('should accept io instance', () => {
      expect(knxService.io).toBe(mockIo);
    });
  });

  describe('setGaToType', () => {
    test('should set GA to type mapping', () => {
      const mapping = {
        '1/2/3': 'switch',
        '1/2/4': 'percentage',
        '2/1/0': 'scene'
      };
      
      knxService.setGaToType(mapping);
      
      expect(knxService.gaToType).toEqual(mapping);
    });
  });

  describe('setSceneTriggerCallback', () => {
    test('should set scene trigger callback', () => {
      const callback = jest.fn();
      knxService.setSceneTriggerCallback(callback);
      expect(knxService.sceneTriggerCallback).toBe(callback);
    });
  });

  describe('connect', () => {
    test('should emit connecting status', () => {
      knxService.connect('192.168.1.50', 3671);
      
      // Fast-forward timers
      jest.advanceTimersByTime(500);
      
      expect(mockIo.emit).toHaveBeenCalledWith('knx_status', {
        connected: false,
        msg: 'Connecting to KNX gateway...'
      });
    });

    test('should handle connection with no IP', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      knxService.connect('', 3671);
      
      expect(consoleSpy).toHaveBeenCalledWith('No KNX IP address provided in config');
      consoleSpy.mockRestore();
    });

    test('should handle existing connection', () => {
      // First connect
      knxService.connection = mockConnection;
      
      // Second connect should disconnect first
      knxService.connect('192.168.1.50', 3671);
      
      // Fast-forward timers
      jest.advanceTimersByTime(500);
      
      // Should have called disconnect
      expect(mockConnection.Disconnect).toHaveBeenCalled();
    });
  });

  describe('readStatus', () => {
    test('should not read when not connected', () => {
      knxService.isConnected = false;
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      knxService.readStatus('1/2/3');
      
      expect(mockConnection.read).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should read group address when connected', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      knxService.readStatus('1/2/3');
      
      expect(mockConnection.read).toHaveBeenCalledWith('1/2/3');
    });

    test('should handle read errors gracefully', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      mockConnection.read.mockImplementation(() => {
        throw new Error('Read failed');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      expect(() => knxService.readStatus('1/2/3')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('writeGroupValue', () => {
    test('should throw when not connected', () => {
      knxService.isConnected = false;
      
      expect(() => {
        knxService.writeGroupValue('1/2/3', true, 'DPT1');
      }).toThrow('Not connected to KNX bus');
    });

    test('should write boolean value with DPT1', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      knxService.writeGroupValue('1/2/3', true, 'DPT1');
      
      expect(mockConnection.write).toHaveBeenCalledWith('1/2/3', 1, 'DPT1');
      expect(consoleSpy).toHaveBeenCalledWith('Writing switch ON to 1/2/3');
      
      consoleSpy.mockRestore();
    });

    test('should write percentage value with DPT5.001', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      knxService.writeGroupValue('1/2/4', 75, 'DPT5.001');
      
      expect(mockConnection.write).toHaveBeenCalledWith('1/2/4', 75, 'DPT5.001');
      expect(consoleSpy).toHaveBeenCalledWith('Writing percentage 75% to 1/2/4');
      
      consoleSpy.mockRestore();
    });

    test('should handle write errors', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      mockConnection.write.mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      expect(() => {
        knxService.writeGroupValue('1/2/3', true, 'DPT1');
      }).toThrow('Failed to write boolean to 1/2/3');
    });
  });

  describe('writeScene', () => {
    test('should throw when not connected', () => {
      knxService.isConnected = false;
      
      expect(() => {
        knxService.writeScene('2/1/0', 5);
      }).toThrow('Not connected to KNX bus');
    });

    test('should convert scene number to bus value (sceneNumber - 1)', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Scene 5 should write value 4 to bus
      knxService.writeScene('2/1/0', 5);
      
      expect(mockConnection.write).toHaveBeenCalledWith('2/1/0', 4, 'DPT17.001');
      expect(consoleSpy).toHaveBeenCalledWith('Writing scene 5 (bus val: 4) to 2/1/0');
      
      consoleSpy.mockRestore();
    });

    test('should handle scene number 1 (writes 0 to bus)', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      knxService.writeScene('2/1/0', 1);
      
      expect(mockConnection.write).toHaveBeenCalledWith('2/1/0', 0, 'DPT17.001');
    });

    test('should clamp scene number to valid range (1-64)', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      // Scene 65 should be clamped to 63 (value 62 on bus)
      knxService.writeScene('2/1/0', 65);
      expect(mockConnection.write).toHaveBeenCalledWith('2/1/0', 63, 'DPT17.001');
      
      // Scene 0 should default to 1 (value 0 on bus)
      mockConnection.write.mockClear();
      knxService.writeScene('2/1/0', 0);
      expect(mockConnection.write).toHaveBeenCalledWith('2/1/0', 0, 'DPT17.001');
    });

    test('should handle invalid scene number', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      // NaN should default to scene 1 (value 0 on bus)
      knxService.writeScene('2/1/0', NaN);
      expect(mockConnection.write).toHaveBeenCalledWith('2/1/0', 0, 'DPT17.001');
    });
  });

  describe('writeBit', () => {
    test('should write 1 for true', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      knxService.writeBit('1/2/3', true);
      
      expect(mockConnection.write).toHaveBeenCalledWith('1/2/3', 1, 'DPT1.001');
      expect(consoleSpy).toHaveBeenCalledWith('Writing bit 1 to 1/2/3');
      
      consoleSpy.mockRestore();
    });

    test('should write 0 for false', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      knxService.writeBit('1/2/3', false);
      
      expect(mockConnection.write).toHaveBeenCalledWith('1/2/3', 0, 'DPT1.001');
    });
  });

  describe('writeBytePercentage', () => {
    test('should write percentage value', () => {
      knxService.isConnected = true;
      knxService.connection = mockConnection;
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      knxService.writeBytePercentage('1/2/4', '75');
      
      expect(mockConnection.write).toHaveBeenCalledWith('1/2/4', 75, 'DPT5.001');
      
      consoleSpy.mockRestore();
    });

    test('should throw when not connected', () => {
      knxService.isConnected = false;
      
      expect(() => {
        knxService.writeBytePercentage('1/2/4', 50);
      }).toThrow('Not connected to KNX bus');
    });
  });

  describe('Event Handlers', () => {
    test('should emit connected status on connection', () => {
      knxService.connect('192.168.1.50', 3671);
      
      // Fast-forward past the setTimeout
      jest.advanceTimersByTime(500);
      
      // Simulate connected event
      mockConnection._handlers.connected();
      
      expect(knxService.isConnected).toBe(true);
      expect(mockIo.emit).toHaveBeenCalledWith('knx_status', {
        connected: true,
        msg: 'Connected successfully to bus'
      });
    });

    test('should emit error status on connection error', () => {
      knxService.connect('192.168.1.50', 3671);
      jest.advanceTimersByTime(500);
      
      // Simulate error event
      mockConnection._handlers.error('Connection timeout');
      
      expect(knxService.isConnected).toBe(false);
      expect(mockIo.emit).toHaveBeenCalledWith('knx_error', {
        msg: 'Bus access failed: Connection timeout. Check IP interface.'
      });
    });

    test('should emit disconnected status', () => {
      knxService.connect('192.168.1.50', 3671);
      jest.advanceTimersByTime(500);
      
      // Simulate disconnected event
      mockConnection._handlers.disconnected();
      
      expect(knxService.isConnected).toBe(false);
      expect(mockIo.emit).toHaveBeenCalledWith('knx_status', {
        connected: false,
        msg: 'Disconnected from bus'
      });
    });

    test('should handle GroupValue_Write events', () => {
      knxService.connect('192.168.1.50', 3671);
      jest.advanceTimersByTime(500);
      
      // Simulate GroupValue_Write event
      const value = Buffer.from([1]);
      mockConnection._handlers.event('GroupValue_Write', '1.1.1', '1/2/3', value);
      
      expect(knxService.deviceStates['1/2/3']).toBe(true);
      expect(mockIo.emit).toHaveBeenCalledWith('knx_state_update', {
        groupAddress: '1/2/3',
        value: true
      });
    });

    test('should handle GroupValue_Response events', () => {
      knxService.setGaToType({ '1/2/4': 'percentage' });
      knxService.connect('192.168.1.50', 3671);
      jest.advanceTimersByTime(500);
      
      // Simulate percentage response (128 = ~50%)
      const value = Buffer.from([128]);
      mockConnection._handlers.event('GroupValue_Response', '1.1.1', '1/2/4', value);
      
      expect(knxService.deviceStates['1/2/4']).toBe(50);
    });

    test('should handle scene events', () => {
      const callback = jest.fn();
      
      knxService.setSceneTriggerCallback(callback);
      knxService.setGaToType({ '2/1/0': 'scene' });
      knxService.connect('192.168.1.50', 3671);
      jest.advanceTimersByTime(500);
      
      // Simulate scene write (bus value 4 = scene 5)
      const value = Buffer.from([4]);
      mockConnection._handlers.event('GroupValue_Write', '1.1.1', '2/1/0', value);
      
      expect(callback).toHaveBeenCalledWith('2/1/0', 5);
    });

    test('should handle scene event with number', () => {
      const callback = jest.fn();
      
      knxService.setSceneTriggerCallback(callback);
      knxService.setGaToType({ '2/1/0': 'scene' });
      knxService.connect('192.168.1.50', 3671);
      jest.advanceTimersByTime(500);
      
      // Simulate scene write with parsed number (scene 3, value 2)
      mockConnection._handlers.event('GroupValue_Write', '1.1.1', '2/1/0', 2);
      
      expect(callback).toHaveBeenCalledWith('2/1/0', 3);
    });
  });

  describe('Connection State Management', () => {
    test('should suppress disconnect event during reconnection', () => {
      // First connect
      knxService.connect('192.168.1.50', 3671);
      jest.advanceTimersByTime(500);
      mockConnection._handlers.connected();
      
      // Reconnect
      knxService._reconnecting = true;
      knxService.connect('192.168.1.100', 3671);
      jest.advanceTimersByTime(500);
      
      // Clear emitted calls
      mockIo.emit.mockClear();
      
      // Old connection disconnect event should be suppressed
      mockConnection._handlers.disconnected();
      
      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });
});
