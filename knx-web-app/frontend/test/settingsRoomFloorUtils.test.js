import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR_OPTIONS, groupRoomsByFloor, migrateRooms, moveRoomToFloor } from '../src/settingsRoomFloorUtils.js';

test('migrateRooms assigns EG to rooms without a floor and preserves scene-ready rooms', () => {
  const migrated = migrateRooms([
    {
      id: 'living',
      name: 'Living Room',
      scenes: [],
      functions: [],
    },
  ]);

  assert.equal(migrated[0].floor, 'EG');
  assert.deepEqual(migrated[0].scenes, []);
});

test('migrateRooms converts legacy scene functions into room scenes', () => {
  const migrated = migrateRooms([
    {
      id: 'kitchen',
      name: 'Kitchen',
      functions: [
        { id: 'scene-off', type: 'scene', name: 'Off', groupAddress: '1/1/1', sceneNumber: 1 },
        { id: 'scene-bright', type: 'scene', name: 'Bright', groupAddress: '1/1/1', sceneNumber: 2 },
        { id: 'switch-main', type: 'switch', name: 'Main', groupAddress: '1/1/2' },
      ],
    },
  ]);

  assert.equal(migrated[0].floor, 'EG');
  assert.equal(migrated[0].sceneGroupAddress, '1/1/1');
  assert.deepEqual(
    migrated[0].scenes.map(scene => ({ name: scene.name, sceneNumber: scene.sceneNumber, category: scene.category })),
    [
      { name: 'Off', sceneNumber: 1, category: 'light' },
      { name: 'Bright', sceneNumber: 2, category: 'light' },
    ],
  );
  assert.deepEqual(
    migrated[0].functions.map(func => func.id),
    ['switch-main'],
  );
});

test('groupRoomsByFloor pre-seeds all supported floors and groups rooms by floor', () => {
  const grouped = groupRoomsByFloor([
    { id: 'basement', floor: 'KG', name: 'Basement' },
    { id: 'office', floor: 'OG', name: 'Office' },
    { id: 'default-floor', name: 'Default Floor' },
  ]);

  assert.deepEqual(Object.keys(grouped), FLOOR_OPTIONS.map(option => option.value));
  assert.deepEqual(grouped.KG.map(room => room.id), ['basement']);
  assert.deepEqual(grouped.OG.map(room => room.id), ['office']);
  assert.deepEqual(grouped.EG.map(room => room.id), ['default-floor']);
  assert.deepEqual(grouped.UG, []);
});

test('moveRoomToFloor only updates the targeted room floor', () => {
  const rooms = [
    { id: 'living', floor: 'EG', name: 'Living Room' },
    { id: 'attic', floor: 'OG', name: 'Attic' },
  ];

  const moved = moveRoomToFloor(rooms, 'living', 'UG');

  assert.deepEqual(
    moved.map(room => ({ id: room.id, floor: room.floor })),
    [
      { id: 'living', floor: 'UG' },
      { id: 'attic', floor: 'OG' },
    ],
  );
  assert.equal(rooms[0].floor, 'EG');
});
