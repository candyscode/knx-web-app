const knx = require('knx');
const DPTLib = require('knx/src/dptlib');

class KnxService {
  constructor(io) {
    this.connection = null;
    this.io = io;
    this.isConnected = false;
    this.deviceStates = {};
    this.gaToType = {};
    this.gaToDpt = {};
    this.sceneTriggerCallback = null;
  }

  setGaToType(map) {
    this.gaToType = map;
  }

  setGaToDpt(map) {
    this.gaToDpt = map;
  }

  /**
   * Register a callback for externally triggered KNX scenes (from bus, e.g. wall switches).
   * Callback signature: (groupAddress, sceneNumber) => void
   */
  setSceneTriggerCallback(callback) {
    this.sceneTriggerCallback = callback;
  }

  connect(ipAddress, port = 3671, onConnectCallback = null) {
    // Disconnect existing connection first, then wait for it to close
    if (this.connection) {
      this._reconnecting = true; // suppress stale 'disconnected' event
      try {
        this.connection.Disconnect();
      } catch (e) {
        console.error('Error disconnecting previous connection:', e);
      }
      this.connection = null;
      this.isConnected = false;
    }

    if (!ipAddress) {
      console.log('No KNX IP address provided in config');
      this._reconnecting = false;
      return;
    }

    console.log(`Connecting to KNX interface at ${ipAddress}:${port}...`);
    this.io.emit('knx_status', { connected: false, msg: 'Connecting to KNX gateway...' });

    // Give the KNX library time to fully close the previous tunnel before opening a new one
    setTimeout(() => {
      try {
        this.connection = new knx.Connection({
          ipAddr: ipAddress,
          ipPort: port,
          handlers: {
            connected: () => {
              console.log('Connected to KNX system at', ipAddress);
              this._reconnecting = false;
              this.isConnected = true;
              this.io.emit('knx_status', { connected: true, msg: 'Connected successfully to bus' });
              if (onConnectCallback) onConnectCallback();
            },
            event: (evt, src, dest, value) => {
              let parsedValue = value;
              const type = this.gaToType[dest];
              const dptString = this.gaToDpt[dest];

              if (Buffer.isBuffer(value)) {
                if (dptString) {
                  try {
                    const dpt = DPTLib.resolve(dptString);
                    if (dpt) {
                      parsedValue = DPTLib.fromBuffer(value, dpt);
                    }
                  } catch (e) {
                    console.error(`Failed to parse DPT ${dptString} for ${dest}:`, e.message);
                  }
                } else if (value.length === 1) {
                  if (type === 'percentage') {
                    parsedValue = Math.round((value[0] / 255) * 100);
                  } else {
                    if (value[0] === 1) parsedValue = true;
                    else if (value[0] === 0) parsedValue = false;
                  }
                }
              }

              if (evt === 'GroupValue_Write' || evt === 'GroupValue_Response') {
                this.deviceStates[dest] = parsedValue;
                this.io.emit('knx_state_update', { groupAddress: dest, value: parsedValue });

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
              console.error('KNX Connection Error:', connstatus);
              this.isConnected = false;
              this.io.emit('knx_error', { msg: `Bus access failed: ${connstatus}. Check IP interface.` });
              this.io.emit('knx_status', { connected: false, msg: 'Disconnected from bus' });
            },
            disconnected: () => {
              console.log('KNX Disconnected');
              this.isConnected = false;
              // Don't broadcast offline if we're intentionally reconnecting to a new IP
              if (!this._reconnecting) {
                this.io.emit('knx_status', { connected: false, msg: 'Disconnected from bus' });
              }
            }
          }
        });
      } catch (err) {
        console.error('Failed to initialize KNX connection:', err.message);
        this.isConnected = false;
        this.io.emit('knx_error', { msg: `Invalid IP Configuration: ${err.message}` });
        this.io.emit('knx_status', { connected: false, msg: 'Disconnected (Invalid IP)' });
      }
    }, 500);
  }

  readStatus(groupAddress) {
    if (!this.isConnected || !this.connection) return;
    try {
      this.connection.read(groupAddress);
      console.log(`Requested status read for ${groupAddress}`);
    } catch(e) {
      console.error(`Error requesting status read for ${groupAddress}:`, e.message);
    }
  }

  writeGroupValue(groupAddress, value, dpt) {
    if (!this.isConnected) {
      throw new Error('Not connected to KNX bus');
    }
    
    if (dpt === 'DPT5.001') {
      try {
        this.connection.write(groupAddress, value, 'DPT5.001');
        console.log(`Writing percentage ${value}% to ${groupAddress}`);
      } catch (e) {
        throw new Error(`Failed to write percentage to ${groupAddress}: ` + e.message);
      }
    } else {
      try {
        this.connection.write(groupAddress, value ? 1 : 0, 'DPT1');
        console.log(`Writing switch ${value ? 'ON' : 'OFF'} to ${groupAddress}`);
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
    
    console.log(`Writing scene ${validSceneNum} (bus val: ${busValue}) to ${groupAddress}`);
    this.connection.write(groupAddress, busValue, 'DPT17.001');
  }

  writeBit(groupAddress, value) {
    if (!this.isConnected) {
      throw new Error('Not connected to KNX bus');
    }
    // For 1-bit values like on/off (DPT 1.001)
    const busValue = value ? 1 : 0;
    console.log(`Writing bit ${busValue} to ${groupAddress}`);
    this.connection.write(groupAddress, busValue, 'DPT1.001');
  }

  writeBytePercentage(groupAddress, value) {
     if (!this.isConnected) {
       throw new Error('Not connected to KNX bus');
     }
     // For percentages 0-100% (DPT 5.001)
     console.log(`Writing percentage ${value}% to ${groupAddress}`);
     this.connection.write(groupAddress, parseInt(value, 10), 'DPT5.001');
  }
}

module.exports = KnxService;
