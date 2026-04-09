'use strict';
/**
 * Mock KNX IP Gateway (mimics MDT SCN-IP000.03 / KNXnet/IP tunnelling).
 *
 * Implements enough of the KNXnet/IP protocol for the `knx` npm library to
 * establish a tunnelling connection and exchange telegrams:
 *
 *   - CONNECT_REQUEST        → CONNECT_RESPONSE (channel 1)
 *   - CONNECTIONSTATE_REQUEST→ CONNECTIONSTATE_RESPONSE
 *   - TUNNELLING_REQUEST      → TUNNELLING_ACK
 *   - DISCONNECT_REQUEST      → DISCONNECT_RESPONSE
 *
 * Additionally exposes `sendBusTelegram(ga, value)` to inject inbound
 * GroupValue_Write frames that the `knx` library will surface as 'event' callbacks.
 *
 * Usage:
 *   const gw = new MockKnxGateway();
 *   await gw.start(3672);   // use a non-standard port to avoid conflicts
 *   // ... run tests ...
 *   await gw.stop();
 *
 * References:
 *   KNX Specification 2.1 — KNXnet/IP Core (03_08_02)
 *   KNX Specification 2.1 — KNXnet/IP Tunnelling (03_08_04)
 */

const dgram = require('dgram');

// KNXnet/IP service type identifiers (little-endian in the header)
const KNXIP = {
  SEARCH_REQUEST:           0x0201,
  SEARCH_RESPONSE:          0x0202,
  CONNECT_REQUEST:          0x0205,
  CONNECT_RESPONSE:         0x0206,
  CONNECTIONSTATE_REQUEST:  0x0207,
  CONNECTIONSTATE_RESPONSE: 0x0208,
  DISCONNECT_REQUEST:       0x0209,
  DISCONNECT_RESPONSE:      0x020A,
  TUNNELLING_REQUEST:       0x0420,
  TUNNELLING_ACK:           0x0421,
};

// KNXnet/IP header: 6 bytes
function buildHeader(serviceType, totalLength) {
  const buf = Buffer.alloc(6);
  buf[0] = 0x06; // header length
  buf[1] = 0x10; // KNXIP version 1.0
  buf.writeUInt16BE(serviceType, 2);
  buf.writeUInt16BE(totalLength, 4);
  return buf;
}

// HPAI (Host Protocol Address Information): 8 bytes
function buildHPAI(ip, port) {
  const buf = Buffer.alloc(8);
  buf[0] = 0x08; // structure length
  buf[1] = 0x01; // IPv4 UDP
  ip.split('.').forEach((octet, i) => { buf[2 + i] = parseInt(octet); });
  buf.writeUInt16BE(port, 6);
  return buf;
}

// Parse HPAI from offset in buffer → { ip, port }
function parseHPAI(buf, offset) {
  const ip = `${buf[offset+2]}.${buf[offset+3]}.${buf[offset+4]}.${buf[offset+5]}`;
  const port = buf.readUInt16BE(offset + 6);
  return { ip, port };
}

// Parse KNXnet/IP header from buffer
function parseHeader(buf) {
  const serviceType = buf.readUInt16BE(2);
  const totalLength = buf.readUInt16BE(4);
  return { serviceType, totalLength };
}

// Build a CONNECT_RESPONSE for a tunnelling connection
function buildConnectResponse(channelId, dataEndpointIp, dataEndpointPort) {
  const header = buildHeader(KNXIP.CONNECT_RESPONSE, 20);
  const body = Buffer.alloc(14);
  body[0] = channelId;      // channel ID
  body[1] = 0x00;           // status: E_NO_ERROR
  // Data endpoint HPAI (8 bytes)
  buildHPAI(dataEndpointIp, dataEndpointPort).copy(body, 2);
  // Connection Response Data Block: 4 bytes (tunnel, individual address 0.0.1)
  body[10] = 0x04; // structure length
  body[11] = 0x04; // TUNNEL_CONNECTION
  body[12] = 0x00; // individual address high (0.0)
  body[13] = 0x01; // individual address low (1)
  return Buffer.concat([header, body]);
}

// Build CONNECTIONSTATE_RESPONSE
function buildConnectionStateResponse(channelId) {
  const header = buildHeader(KNXIP.CONNECTIONSTATE_RESPONSE, 8);
  const body = Buffer.alloc(2);
  body[0] = channelId;
  body[1] = 0x00; // E_NO_ERROR
  return Buffer.concat([header, body]);
}

// Build DISCONNECT_RESPONSE
function buildDisconnectResponse(channelId) {
  const header = buildHeader(KNXIP.DISCONNECT_RESPONSE, 8);
  const body = Buffer.alloc(2);
  body[0] = channelId;
  body[1] = 0x00;
  return Buffer.concat([header, body]);
}

// Build TUNNELLING_ACK
function buildTunnellingAck(channelId, seqCounter) {
  const header = buildHeader(KNXIP.TUNNELLING_ACK, 10);
  const body = Buffer.alloc(4);
  body[0] = 0x04; // structure length
  body[1] = channelId;
  body[2] = seqCounter;
  body[3] = 0x00; // status ok
  return Buffer.concat([header, body]);
}

/**
 * Encode a group address string "x/y/z" to 2-byte KNX representation.
 * Main/Middle/Sub: x=5bits, y=3bits, z=8bits
 */
function encodeGA(gaStr) {
  const parts = gaStr.split('/').map(Number);
  const [main, middle, sub] = parts;
  const high = ((main & 0x1F) << 3) | (middle & 0x07);
  const low  = sub & 0xFF;
  return Buffer.from([high, low]);
}

/**
 * Build a TUNNELLING_REQUEST carrying a GroupValue_Write APDU.
 *  channelId   — channel established during CONNECT
 *  seqCounter  — incrementing sequence counter
 *  gaStr       — group address "x/y/z"
 *  valueBuffer — 1–6 byte Buffer (the raw DPT value)
 */
function buildTunnellingRequest(channelId, seqCounter, gaStr, valueBuffer) {
  // cEMI frame: MC=0x29 (L_Data.ind), flags, source addr, dest addr (GA), APDU
  const gaBuf = encodeGA(gaStr);

  // APDU for GroupValue_Write (short if value fits in 6 bits, else standard)
  // We always use the "standard" APDU length form for simplicity
  const apduLen = 1 + valueBuffer.length; // TPCI/APCI byte + data bytes
  const cemi = Buffer.alloc(10 + valueBuffer.length);
  cemi[0] = 0x29;       // MC: L_Data.ind
  cemi[1] = 0x00;       // add info length
  cemi[2] = 0xBC;       // ctrl1: standard frame, request, prio normal
  cemi[3] = 0xE0;       // ctrl2: group addr, hop count 6
  cemi[4] = 0xFF;       // source addr high (FF.FF = router)
  cemi[5] = 0xFF;       // source addr low
  gaBuf.copy(cemi, 6);  // dest addr (GA)
  cemi[8] = apduLen;    // data length
  cemi[9] = 0x00;       // TPCI + APCI high (GroupValue_Write = 0x0080 >> 2)
                         // Actually APCI for GV_Write is 0b0000_00xx for short form
                         // We use 0x00 (TPCI) + 0x80 (APCI GroupValue_Write)
  // For simplicity, use: byte9 = 0x00, byte10 = 0x80 (GroupValue_Write), then value
  // Re-layout:
  cemi[9] = 0x00; // TPCI
  // APCI: GroupValue_Write = 0x0040 in 2-byte APCI when using long APDU
  // Actually per spec: first 2 APDU bytes = TPCI(6) + APCI(10-bit)
  // For GV_Write: APCI bits = 0000000010, so byte[APDU0]=0x00 byte[APDU1]=0x80
  // But we set cemi[9] already. Let's use the correct encoding:
  // APDU[0] = 0x00 (no TPCI bits set = group data = data group), 
  // APDU[1] = 0x80 = GroupValue_Write, then data bytes follow
  cemi[9] = 0x00;
  // Overwrite from index 9:
  const apdu = Buffer.alloc(2 + valueBuffer.length);
  apdu[0] = 0x00; // TPCI
  apdu[1] = 0x80; // APCI: GroupValue_Write
  valueBuffer.copy(apdu, 2);

  // Rebuild cemi properly:
  const cemiProper = Buffer.alloc(9 + apdu.length);
  cemiProper[0] = 0x29;   // MC
  cemiProper[1] = 0x00;   // add info len
  cemiProper[2] = 0xBC;   // ctrl1
  cemiProper[3] = 0xE0;   // ctrl2
  cemiProper[4] = 0xFF;   // src high
  cemiProper[5] = 0xFF;   // src low
  gaBuf.copy(cemiProper, 6); // dst
  cemiProper[8] = apdu.length - 1; // data length = APDU bytes after TPCI
  apdu.copy(cemiProper, 9);

  // Tunnelling structure header: 4 bytes
  const tunHdr = Buffer.alloc(4);
  tunHdr[0] = 0x04;       // structure length
  tunHdr[1] = channelId;
  tunHdr[2] = seqCounter;
  tunHdr[3] = 0x00;

  const body = Buffer.concat([tunHdr, cemiProper]);
  const header = buildHeader(KNXIP.TUNNELLING_REQUEST, 6 + body.length);
  return Buffer.concat([header, body]);
}

class MockKnxGateway {
  constructor() {
    this._socket = null;
    this._channelId = 0x01;
    this._seqCounter = 0;
    this._clientEndpoint = null; // { address, port } of the knx library
    this.receivedTelegrams = [];
    this._port = 0;
  }

  get port() { return this._port; }

  start(port = 0) {
    return new Promise((resolve, reject) => {
      this._socket = dgram.createSocket('udp4');

      this._socket.on('error', (err) => {
        console.error('MockKnxGateway error:', err);
      });

      this._socket.on('message', (msg, rinfo) => {
        this._handleMessage(msg, rinfo);
      });

      this._socket.bind(port, '127.0.0.1', () => {
        this._port = this._socket.address().port;
        resolve(this._port);
      });
    });
  }

  _handleMessage(msg, rinfo) {
    if (msg.length < 6) return;
    const { serviceType } = parseHeader(msg);

    switch (serviceType) {
      case KNXIP.CONNECT_REQUEST: {
        // Parse data endpoint HPAI (after header + control HPAI 8 bytes)
        const dataHPAI = parseHPAI(msg, 6 + 8);
        this._clientEndpoint = { address: rinfo.address, port: dataHPAI.port || rinfo.port };
        const resp = buildConnectResponse(this._channelId, '127.0.0.1', this._port);
        this._send(resp, rinfo.port, rinfo.address);
        break;
      }
      case KNXIP.CONNECTIONSTATE_REQUEST: {
        const resp = buildConnectionStateResponse(this._channelId);
        this._send(resp, rinfo.port, rinfo.address);
        break;
      }
      case KNXIP.TUNNELLING_REQUEST: {
        const seq = msg[8]; // seqCounter at offset 8 (after 6-byte header + 2 bytes channel+len)
        const ack = buildTunnellingAck(this._channelId, seq);
        this._send(ack, rinfo.port, rinfo.address);
        // Record the telegram for assertions
        this.receivedTelegrams.push({ timestamp: Date.now(), raw: msg });
        break;
      }
      case KNXIP.DISCONNECT_REQUEST: {
        const resp = buildDisconnectResponse(this._channelId);
        this._send(resp, rinfo.port, rinfo.address);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Inject a GroupValue_Write inbound telegram (from "the bus") to the connected KNX library.
   * @param {string} ga  - group address "x/y/z"
   * @param {Buffer} valueBuffer - raw DPT value bytes (e.g. Buffer.from([0x01]) for DPT1 ON)
   */
  sendBusTelegram(ga, valueBuffer) {
    if (!this._clientEndpoint) {
      throw new Error('No client connected to MockKnxGateway');
    }
    const frame = buildTunnellingRequest(
      this._channelId,
      this._seqCounter++ & 0xFF,
      ga,
      valueBuffer
    );
    this._send(frame, this._clientEndpoint.port, this._clientEndpoint.address);
  }

  _send(buf, port, address) {
    this._socket.send(buf, port, address, (err) => {
      if (err) console.error('MockKnxGateway send error:', err);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this._socket) return resolve();
      this._socket.close(resolve);
      this._socket = null;
    });
  }
}

module.exports = MockKnxGateway;
