const knx = require('knx');
const DPTLib = require('knx/src/dptlib');
const { createLogger } = require('./logger');

function normalizeDptString(dpt) {
  const raw = typeof dpt === 'string' ? dpt.trim() : '';
  if (!raw) return '';

  const compact = raw
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^DPT-?/, '')
    .replace(/^DPST-?/, 'DPST');

  const dpstMatch = compact.match(/^DPST(\d+)-(\d+)$/);
  if (dpstMatch) {
    const [, mainType, subType] = dpstMatch;
    return `DPT${mainType}.${String(Number(subType)).padStart(3, '0')}`;
  }

  const dptMatch = compact.match(/^(\d+)(?:[.-](\d+))?$/);
  if (dptMatch) {
    const [, mainType, subType] = dptMatch;
    return subType
      ? `DPT${mainType}.${String(Number(subType)).padStart(3, '0')}`
      : `DPT${mainType}`;
  }

  return raw;
}

class KnxService {
  constructor(io, options = {}) {
    this.connection = null;
    this.io = io;
    this.isConnected = false;
    this.deviceStates = {};
    this.gaToType = {};
    this.gaToDpt = {};
    this.actionToStatusGa = {}; // action GA → status GA cross-map
    this.sceneTriggerCallback = null;
    this.label = options.label || 'knx';
    this.logger = createLogger(['KNX', this.label]);
    this.connectionState = 'idle';
    this.lastStatusMessage = null;
    this.lastErrorMessage = null;
  }

  setLabel(label) {
    this.label = label || 'knx';
    this.logger = createLogger(['KNX', this.label]);
  }

  setGaToType(map) {
    this.gaToType = map;
  }

  setGaToDpt(map) {
    this.gaToDpt = map;
  }

  setActionToStatusGaMap(map) {
    this.actionToStatusGa = map;
  }

  /**
   * Register a callback for externally triggered KNX scenes (from bus, e.g. wall switches).
   * Callback signature: (groupAddress, sceneNumber) => void
   */
  setSceneTriggerCallback(callback) {
    this.sceneTriggerCallback = callback;
  }

  emitKnxStatus(connected, msg) {
    const signature = `${connected}:${msg}`;
    if (this.lastStatusMessage === signature) return;
    this.lastStatusMessage = signature;
    this.io.emit('knx_status', { connected, msg });
  }

  emitKnxError(msg) {
    if (this.lastErrorMessage === msg) return;
    this.lastErrorMessage = msg;
    this.io.emit('knx_error', { msg });
  }

  setConnectionState(nextState) {
    this.connectionState = nextState;
    if (nextState === 'connected') {
      this.lastErrorMessage = null;
    }
  }

  connect(ipAddress, port = 3671, onConnectCallback = null, options = {}) {
    // Disconnect existing connection first, then wait for it to close
    if (this.connection) {
      this._reconnecting = true; // suppress stale 'disconnected' event
      try {
        this.connection.Disconnect();
      } catch (e) {
        this.logger.warn('Failed to disconnect previous connection', { error: e.message });
      }
      this.connection = null;
      this.isConnected = false;
    }

    if (!ipAddress) {
      this.setConnectionState('idle');
      this.logger.info('No KNX gateway configured');
      this._reconnecting = false;
      return;
    }

    this.setConnectionState('connecting');
    this.logger.info('Connecting to gateway', { ip: ipAddress, port, interface: options.interface || '(auto)' });
    this.emitKnxStatus(false, 'Connecting to KNX gateway...');

    // Give the KNX library time to fully close the previous tunnel before opening a new one
    setTimeout(() => {
      try {
        const connectionOptions = {
          ipAddr: ipAddress,
          ipPort: port,
          loglevel: 'error',
          ...(options.interface ? { interface: options.interface } : {}),
          handlers: {
            connected: () => {
              this._reconnecting = false;
              this.isConnected = true;
              this.setConnectionState('connected');
              this.logger.info('Connected', { ip: ipAddress, port, interface: options.interface || '(auto)' });
              this.emitKnxStatus(true, 'Connected successfully to bus');
              if (onConnectCallback) onConnectCallback();
            },
            event: (evt, src, dest, value) => {
              const type = this.gaToType[dest];
              const dptString = this.gaToDpt[dest];

              // If the GA is completely untracked by the app, we have no business parsing or emitting it
              if (!type && !dptString) return;

              let parsedValue = value;

              if (Buffer.isBuffer(value)) {
                if (dptString) {
                  try {
                    const normalizedDpt = normalizeDptString(dptString);
                    const dpt = DPTLib.resolve(normalizedDpt);
                    if (dpt) {
                      parsedValue = DPTLib.fromBuffer(value, dpt);
                    }
                  } catch (e) {
                    this.logger.warn('Failed to parse incoming value', {
                      ga: dest,
                      dpt: dptString,
                      error: e.message,
                    });
                  }
                } else if (value.length === 1) {
                  if (type === 'percentage') {
                    parsedValue = Math.round((value[0] / 255) * 100);
                  } else if (type === 'scene') {
                    parsedValue = value[0] & 0x3F;
                  } else {
                    if (value[0] === 1) parsedValue = true;
                    else if (value[0] === 0) parsedValue = false;
                  }
                }
              }

              if (evt === 'GroupValue_Write' || evt === 'GroupValue_Response') {
                // Skip if parsing failed and we still have a raw Buffer — sending
                // a Buffer object over socket.io produces garbage in the frontend.
                if (Buffer.isBuffer(parsedValue)) {
                  this.logger.warn('Dropping unparseable value', { ga: dest, bytes: value.length, dpt: dptString });
                  return;
                }

                this.deviceStates[dest] = parsedValue;
                this.io.emit('knx_state_update', { groupAddress: dest, value: parsedValue });

                // Cross-emit: if this is a write on an action GA, also update the
                // corresponding status GA so the frontend reflects the change immediately
                // (even when the actuator doesn't broadcast on the status GA).
                const statusGa = this.actionToStatusGa[dest];
                if (statusGa && evt === 'GroupValue_Write') {
                  this.deviceStates[statusGa] = parsedValue;
                  this.io.emit('knx_state_update', { groupAddress: statusGa, value: parsedValue });
                }

                // If this is a scene GA and we have a callback, notify server for Hue sync
                if (evt === 'GroupValue_Write' && type === 'scene' && this.sceneTriggerCallback) {
                  // DPT17.001: bus value is sceneNumber - 1 (0-based), stored as integer
                  let sceneNum = parsedValue;
                  if (Buffer.isBuffer(value)) {
                    sceneNum = (value[0] & 0x3F) + 1; // mask activation bit, convert to 1-based
                  } else if (typeof parsedValue === 'number') {
                    sceneNum = parsedValue + 1; // 0-based bus value → 1-based scene number
                  }
                  this.sceneTriggerCallback(dest, sceneNum);
                }
              }
            },
            error: (connstatus) => {
              this.isConnected = false;
              if (this.connectionState !== 'offline') {
                this.logger.warn('Connection lost', { reason: connstatus });
              }
              this.setConnectionState('offline');
              this.emitKnxError(`Bus access failed: ${connstatus}. Check IP interface.`);
              this.emitKnxStatus(false, 'Disconnected from bus');
            },
            disconnected: () => {
              this.isConnected = false;
              if (this.connectionState !== 'offline' && !this._reconnecting) {
                this.logger.warn('Disconnected from KNX gateway');
              }
              this.setConnectionState('offline');
              // Don't broadcast offline if we're intentionally reconnecting to a new IP
              if (!this._reconnecting) {
                this.emitKnxStatus(false, 'Disconnected from bus');
              }
            }
          }
        };
        this.connection = new knx.Connection(connectionOptions);
      } catch (err) {
        this.isConnected = false;
        this.setConnectionState('offline');
        this.logger.error('Failed to initialize KNX connection', { error: err.message });
        this.emitKnxError(`Invalid IP Configuration: ${err.message}`);
        this.emitKnxStatus(false, 'Disconnected (Invalid IP)');
      }
    }, 500);
  }

  readStatus(groupAddress) {
    if (!this.isConnected || !this.connection) return;
    try {
      this.connection.read(groupAddress);
    } catch(e) {
      this.logger.warn('Failed to request status read', { ga: groupAddress, error: e.message });
    }
  }

  writeGroupValue(groupAddress, value, dpt) {
    if (!this.isConnected) {
      throw new Error('Not connected to KNX bus');
    }
    
    if (dpt === 'DPT5.001') {
      try {
        this.connection.write(groupAddress, value, 'DPT5.001');
      } catch (e) {
        throw new Error(`Failed to write percentage to ${groupAddress}: ` + e.message);
      }
    } else {
      try {
        this.connection.write(groupAddress, value ? 1 : 0, 'DPT1');
      } catch (e) {
        throw new Error(`Failed to write boolean to ${groupAddress}: ` + e.message);
      }
    }
  }

  writeScene(groupAddress, sceneNumber) {
    if (!this.isConnected) {
      throw new Error('Not connected to KNX bus');
    }
    // Fallback to 1 if sceneNumber is undefined or invalid
    const parsedSceneNum = parseInt(sceneNumber, 10);
    const validSceneNum = isNaN(parsedSceneNum) ? 1 : parsedSceneNum;
    // Scene numbers 1-64 map to bus values 0-63 (offset by -1)
    const busValue = Math.max(0, Math.min(63, validSceneNum - 1));
    this.connection.write(groupAddress, busValue, 'DPT17.001');
  }

  writeBit(groupAddress, value) {
    if (!this.isConnected) {
      throw new Error('Not connected to KNX bus');
    }
    // For 1-bit values like on/off (DPT 1.001)
    const busValue = value ? 1 : 0;
    this.connection.write(groupAddress, busValue, 'DPT1.001');
  }

  writeBytePercentage(groupAddress, value) {
     if (!this.isConnected) {
       throw new Error('Not connected to KNX bus');
     }
     // For percentages 0-100% (DPT 5.001)
     this.connection.write(groupAddress, parseInt(value, 10), 'DPT5.001');
  }
}

module.exports = KnxService;
module.exports.normalizeDptString = normalizeDptString;
