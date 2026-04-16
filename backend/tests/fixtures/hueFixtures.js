'use strict';
/**
 * Hue Bridge fixture data — mirrors the real Philips Hue Bridge v1 API response shapes.
 */

const HUE_LIGHTS = {
  '1': {
    name: 'Leselampe',
    state: { on: false, reachable: true, bri: 200 },
    type: 'Extended color light',
    modelid: 'LCA001',
  },
  '2': {
    name: 'Küche Ambientelicht',
    state: { on: true, reachable: true, bri: 150 },
    type: 'Color temperature light',
    modelid: 'LTA001',
  },
};

const HUE_GROUPS = {
  '1': {
    name: 'Wohnzimmer',
    type: 'Room',
    lights: ['1', '2'],
    action: { on: false },
  },
  '2': {
    name: 'Küche',
    type: 'Room',
    lights: ['2'],
    action: { on: true },
  },
  '10': {
    // Entertainment zone — should be filtered out by getRooms
    name: 'TV Zone',
    type: 'Entertainment',
    lights: ['1'],
    action: { on: false },
  },
};

const HUE_SCENES = {
  'abc123': {
    name: 'Relax',
    group: '1',
    type: 'GroupScene',
    lights: ['1', '2'],
  },
  'def456': {
    name: 'Bright',
    group: '1',
    type: 'GroupScene',
    lights: ['1', '2'],
  },
};

module.exports = { HUE_LIGHTS, HUE_GROUPS, HUE_SCENES };
