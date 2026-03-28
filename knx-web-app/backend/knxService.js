const knx = require('knx');

class KnxService {
  constructor(io) {
    this.connection = null;
    this.io = io;
    this.isConnected = false;
    this.deviceStates = {};
  }

  connect(ipAddress, port = 3671, onConnectCallback = null) {
    if (this.connection) {
      try {
        this.connection.Disconnect();
      } catch (e) {
        console.error("Error disconnecting previous connection:", e);
      }
    }

    if (!ipAddress) {
      console.log('No KNX IP address provided in config');
      return;
    }

    console.log(`Attempting to connect to KNX interface at ${ipAddress}:${port}...`);
    
    this.connection = new knx.Connection({
      ipAddr: ipAddress,
      ipPort: port,
      // unsecure tunneling
      handlers: {
        connected: () => {
          console.log('Connected to KNX system at', ipAddress);
          this.isConnected = true;
          this.io.emit('knx_status', { connected: true, msg: 'Connected successfully to bus' });
          if (onConnectCallback) onConnectCallback();
        },
        event: (evt, src, dest, value) => {
          let parsedValue = value;
          if (Buffer.isBuffer(value) && value.length === 1) {
            // Assume 1-bit boolean if value is a 1-byte buffer with 0/1 content
            if (value[0] === 1) parsedValue = true;
            else if (value[0] === 0) parsedValue = false;
          }
          
          if (evt === 'GroupValue_Write' || evt === 'GroupValue_Response') {
            this.deviceStates[dest] = parsedValue;
            this.io.emit('knx_state_update', { groupAddress: dest, value: parsedValue });
          }
        },
        error: (connstatus) => {
          console.error('KNX Connection Error:', connstatus);
          this.isConnected = false;
          // emit human-friendly message
          this.io.emit('knx_error', { msg: `Bus access failed: ${connstatus}. Check IP interface.` });
          this.io.emit('knx_status', { connected: false, msg: 'Disconnected from bus' });
        },
        disconnected: () => {
          console.log('KNX Disconnected');
          this.isConnected = false;
          this.io.emit('knx_status', { connected: false, msg: 'Disconnected from bus' });
        }
      }
    });
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

  writeScene(groupAddress, sceneNumber) {
    if (!this.isConnected) {
      throw new Error('Not connected to KNX bus');
    }
    // As per user requirement, mathematically subtract 1 to get the actual bus value.
    const busValue = Math.max(0, parseInt(sceneNumber, 10) - 1);
    
    console.log(`Writing scene ${sceneNumber} (bus val: ${busValue}) to ${groupAddress}`);
    // KNX lib uses DPT17.001 typically for scene number, which is 1-byte unsigned
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
