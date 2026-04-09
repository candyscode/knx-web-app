'use strict';
/**
 * KNX telegram byte sequences for common DPTs, used to simulate inbound bus telegrams
 * from the mock KNX gateway.
 *
 * These are the raw payload bytes as delivered by the `knx` library's event handler.
 */

// DPT1 — 1-bit: ON (1) and OFF (0)
const DPT1_ON  = Buffer.from([0x01]);
const DPT1_OFF = Buffer.from([0x00]);

// DPT5.001 — 8-bit percentage: 100% (0xFF) and 50% (0x80 ≈ 50%)
const DPT5_100  = Buffer.from([0xFF]);
const DPT5_50   = Buffer.from([0x80]);
const DPT5_0    = Buffer.from([0x00]);

// DPT17.001 — scene number: scene 1 = bus value 0, scene 5 = bus value 4
// Bit 7 = recall (0) vs store (1); bits 0-5 = scene number (0-based)
const DPT17_SCENE1 = Buffer.from([0x00]); // recall scene 1
const DPT17_SCENE5 = Buffer.from([0x04]); // recall scene 5

module.exports = {
  DPT1_ON,
  DPT1_OFF,
  DPT5_100,
  DPT5_50,
  DPT5_0,
  DPT17_SCENE1,
  DPT17_SCENE5,
};
