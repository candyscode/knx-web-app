export const FLOOR_OPTIONS = [
  { value: 'KG', label: 'KG', fullLabel: 'Keller' },
  { value: 'UG', label: 'UG', fullLabel: 'Untergeschoss' },
  { value: 'EG', label: 'EG', fullLabel: 'Erdgeschoss' },
  { value: 'OG', label: 'OG', fullLabel: 'Obergeschoss' },
];

export function migrateRooms(inputRooms) {
  return inputRooms.map(room => {
    if (!room.floor) {
      room = { ...room, floor: 'EG' };
    }
    if (room.scenes !== undefined) return room;
    const sceneFuncs = (room.functions || []).filter(f => f.type === 'scene');
    const otherFuncs = (room.functions || []).filter(f => f.type !== 'scene');
    if (sceneFuncs.length === 0) return { ...room, sceneGroupAddress: '', scenes: [] };
    const gaCounts = {};
    sceneFuncs.forEach(f => { gaCounts[f.groupAddress] = (gaCounts[f.groupAddress] || 0) + 1; });
    const primaryGA = Object.entries(gaCounts).sort((a, b) => b[1] - a[1])[0][0];
    const roomScenes = sceneFuncs
      .filter(f => f.groupAddress === primaryGA)
      .map(f => ({ id: f.id, name: f.name, sceneNumber: f.sceneNumber || 1, category: 'light' }));
    const standaloneFuncs = sceneFuncs.filter(f => f.groupAddress !== primaryGA);
    return { ...room, sceneGroupAddress: primaryGA, scenes: roomScenes, functions: [...standaloneFuncs, ...otherFuncs] };
  });
}

export function groupRoomsByFloor(rooms) {
  const grouped = {};
  FLOOR_OPTIONS.forEach(f => { grouped[f.value] = []; });
  rooms.forEach(room => {
    const floor = room.floor || 'EG';
    if (!grouped[floor]) grouped[floor] = [];
    grouped[floor].push(room);
  });
  return grouped;
}

export function moveRoomToFloor(rooms, roomId, floor) {
  return rooms.map(room => room.id !== roomId ? room : { ...room, floor });
}
