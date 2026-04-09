/**
 * Mock KNX Gateway Server
 * Imitates MDT KNX IP Gateway behavior for testing
 * Implements KNXnet/IP protocol basics for UDP communication
 */

const dgram = require('dgram');
const EventEmitter = require('events');

class MockKnxGateway extends EventEmitter {
  constructor(port = 3671) {
    super();
    this.port = port;
    this.server = null;
    this.connected = false;
    this.connections = new Map(); // channelId -> connection info
    this.groupAddressValues = new Map(); // Store last written values
    this.nextChannelId = 1;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = dgram.createSocket('udp4');

      this.server.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.server.on('error', (err) => {
        console.error('Mock KNX Gateway error:', err);
        this.emit('error', err);
      });

      this.server.bind(this.port, () => {
        this.connected = true;
        console.log(`Mock KNX Gateway listening on port ${this.port}`);
        this.emit('ready');
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.connected = false;
          this.connections.clear();
          console.log('Mock KNX Gateway stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  handleMessage(msg, rinfo) {
    if (msg.length < 6) return;

    const headerLength = msg[0];
    const protocolVersion = msg[1];
    const serviceType = (msg[2] << 8) | msg[3];
    const totalLength = (msg[4] << 8) | msg[5];

    switch (serviceType) {
      case 0x0205: // CONNECTION_REQUEST
        this.handleConnectionRequest(msg, rinfo);
        break;
      case 0x0209: // DISCONNECT_REQUEST
        this.handleDisconnectRequest(msg, rinfo);
        break;
      case 0x0310: // TUNNELING_REQUEST (L_Data.req)
        this.handleTunnelingRequest(msg, rinfo);
        break;
      default:
        console.log(`Mock KNX: Unknown service type 0x${serviceType.toString(16)}`);
    }
  }

  handleConnectionRequest(msg, rinfo) {
    const channelId = this.nextChannelId++;
    
    // CONNECTION_RESPONSE (0x0206)
    const response = Buffer.alloc(20);
    response[0] = 0x06; // Header length
    response[1] = 0x10; // Protocol version 1.0
    response[2] = 0x02; // Service type: CONNECTION_RESPONSE
    response[3] = 0x06;
    response[4] = 0x00; // Total length
    response[5] = 0x14; // 20 bytes
    response[6] = channelId;
    response[7] = 0x00; // Status: OK
    
    // Individual address (1.0.0)
    response[8] = 0x01;
    response[9] = 0x00;
    response[10] = 0x00;
    
    // Connection ID
    response[11] = 0x00;
    response[12] = 0x00;
    response[13] = 0x00;
    response[14] = channelId;
    
    // CRD (Connection Response Data)
    response[15] = 0x04; // length
    response[16] = 0x04; // connection type: TUNNEL_CONNECTION
    response[17] = 0x02; // KNX individual address
    response[18] = 0x00;
    response[19] = 0x00;

    this.connections.set(channelId, {
      address: rinfo.address,
      port: rinfo.port,
      channelId: channelId
    });

    this.server.send(response, rinfo.port, rinfo.address);
    this.emit('connection', { channelId, address: rinfo.address });
  }

  handleDisconnectRequest(msg, rinfo) {
    const channelId = msg[6];
    
    // DISCONNECT_RESPONSE (0x020B)
    const response = Buffer.alloc(8);
    response[0] = 0x06; // Header length
    response[1] = 0x10; // Protocol version
    response[2] = 0x02; // Service type: DISCONNECT_RESPONSE
    response[3] = 0x0B;
    response[4] = 0x00; // Total length
    response[5] = 0x08; // 8 bytes
    response[6] = channelId;
    response[7] = 0x00; // Status: OK

    this.connections.delete(channelId);
    this.server.send(response, rinfo.port, rinfo.address);
    this.emit('disconnect', { channelId });
  }

  handleTunnelingRequest(msg, rinfo) {
    if (msg.length < 10) return;

    const channelId = msg[6];
    const seqCounter = msg[7];
    const cemiMsg = msg.slice(10);

    // Parse CEMI frame
    const msgCode = cemiMsg[0];
    
    if (msgCode === 0x11) { // L_Data.req
      const destAddrHigh = cemiMsg[8];
      const destAddrLow = cemiMsg[9];
      const groupAddress = `${(destAddrHigh >> 3)}/${(destAddrHigh & 0x07)}/${destAddrLow}`;
      
      const dataLen = cemiMsg[15] & 0x0F;
      const data = cemiMsg.slice(16, 16 + dataLen + 1);
      
      // Store the value
      this.groupAddressValues.set(groupAddress, data);
      
      // Emit event for test verification
      this.emit('groupWrite', {
        channelId,
        groupAddress,
        data,
        raw: cemiMsg
      });

      // Send TUNNELING_ACK
      const ack = Buffer.alloc(10);
      ack[0] = 0x06; // Header length
      ack[1] = 0x10; // Protocol version
      ack[2] = 0x04; // Service type: TUNNELING_ACK
      ack[3] = 0x21;
      ack[4] = 0x00; // Total length
      ack[5] = 0x0A; // 10 bytes
      ack[6] = channelId;
      ack[7] = seqCounter;
      ack[8] = 0x00; // Status: OK

      this.server.send(ack, rinfo.port, rinfo.address);

      // Send L_Data.con (confirmation)
      setTimeout(() => {
        const confirm = Buffer.alloc(msg.length);
        msg.copy(confirm);
        confirm[2] = 0x04; // TUNNELING_REQUEST
        confirm[3] = 0x20;
        confirm[10] = 0x2E; // L_Data.con
        this.server.send(confirm, rinfo.port, rinfo.address);
      }, 10);
    }
  }

  // Helper method to simulate a group value read response
  simulateGroupValueResponse(groupAddress, value) {
    this.connections.forEach((conn) => {
      const parts = groupAddress.split('/').map(Number);
      const destHigh = (parts[0] << 3) | parts[1];
      const destLow = parts[2];

      const cemiFrame = Buffer.alloc(17);
      cemiFrame[0] = 0x29; // L_Data.ind
      cemiFrame[1] = 0x00; // Additional info length
      // Control field 1
      cemiFrame[2] = 0xB8;
      // Control field 2
      cemiFrame[3] = 0x60;
      // Source address (gateway)
      cemiFrame[4] = 0x01;
      cemiFrame[5] = 0x00;
      // Destination address (group)
      cemiFrame[6] = 0x00;
      cemiFrame[7] = destHigh;
      cemiFrame[8] = destLow;
      // Length
      cemiFrame[9] = 0x01;
      cemiFrame[10] = 0x00;
      // TPCI
      cemiFrame[11] = 0x00;
      cemiFrame[12] = 0x00;
      // APCI + data
      cemiFrame[13] = 0x00;
      cemiFrame[14] = 0x40; // GroupValue_Response
      cemiFrame[15] = value;
      cemiFrame[16] = 0x00;

      const tunnelingReq = Buffer.alloc(10 + cemiFrame.length);
      tunnelingReq[0] = 0x06; // Header length
      tunnelingReq[1] = 0x10; // Protocol version
      tunnelingReq[2] = 0x04; // TUNNELING_REQUEST
      tunnelingReq[3] = 0x20;
      tunnelingReq[4] = 0x00;
      tunnelingReq[5] = 10 + cemiFrame.length;
      tunnelingReq[6] = conn.channelId;
      tunnelingReq[7] = 0x00; // seq counter
      tunnelingReq[8] = 0x00; // status
      tunnelingReq[9] = 0x00;
      cemiFrame.copy(tunnelingReq, 10);

      this.server.send(tunnelingReq, conn.port, conn.address);
    });
  }

  // Get last written value for a group address
  getGroupAddressValue(groupAddress) {
    return this.groupAddressValues.get(groupAddress);
  }

  // Check if a specific connection exists
  hasConnection(channelId) {
    return this.connections.has(channelId);
  }

  getConnectionCount() {
    return this.connections.size;
  }
}

module.exports = MockKnxGateway;
