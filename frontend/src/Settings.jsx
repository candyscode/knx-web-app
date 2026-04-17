import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { updateConfig, getHueLights, getHueRooms, getHueScenes, linkHueRoom, unlinkHueRoom, linkHueScene, unlinkHueScene } from './configApi';
import { KNXGroupAddressModal } from './components/KNXGroupAddressModal';
import FloorTabs from './components/FloorTabs';
import CollapsibleRoomCard from './components/CollapsibleRoomCard';
import GlobalsConfig from './components/GlobalsConfig';
import { Plus, Search, Lightbulb, Sparkles, Settings as SettingsIcon } from 'lucide-react';

// ── Migration ─────────────────────────────────────────────
function migrateRooms(inputRooms) {
  return inputRooms.map(room => {
    if (room.scenes !== undefined) return room;
    const sceneFuncs = (room.functions || []).filter(f => f.type === 'scene');
    const otherFuncs = (room.functions || []).filter(f => f.type !== 'scene');
    if (sceneFuncs.length === 0) return { ...room, sceneGroupAddress: '', scenes: [] };
    const gaCounts = {};
    sceneFuncs.forEach(f => { gaCounts[f.groupAddress] = (gaCounts[f.groupAddress] || 0) + 1; });
    const primaryGA = Object.entries(gaCounts).sort((a, b) => b[1] - a[1])[0][0];
    const roomScenes = sceneFuncs.filter(f => f.groupAddress === primaryGA)
      .map(f => ({ id: f.id, name: f.name, sceneNumber: f.sceneNumber || 1, category: 'light' }));
    const standaloneFuncs = sceneFuncs.filter(f => f.groupAddress !== primaryGA);
    return { ...room, sceneGroupAddress: primaryGA, scenes: roomScenes, functions: [...standaloneFuncs, ...otherFuncs] };
  });
}

function migrateConfig(config) {
  if (config.floors && config.floors.length > 0) return config.floors;
  return [{
    id: 'floor_default',
    name: 'Ground Floor',
    rooms: migrateRooms(config.rooms || []),
  }];
}

// ── Main Settings ─────────────────────────────────────────
export default function Settings({ config, fetchConfig, addToast, hueStatus, setHueStatus }) {
  const [floors, setFloors] = useState(() => migrateConfig(config));
  const [globals, setGlobals] = useState(() => Array.isArray(config.globals) ? config.globals : []);
  const [activeFloorId, setActiveFloorId] = useState(() => {
    const f = migrateConfig(config);
    return f[0]?.id || null;
  });
  const [activeTab, setActiveTab] = useState('rooms');
  const [newRoomName, setNewRoomName] = useState('');

  // Hue modals
  const [hueLampModal, setHueLampModal] = useState({ open: false, roomId: null, floorId: null });
  const [hueLamps, setHueLamps] = useState([]);
  const [hueLampsLoading, setHueLampsLoading] = useState(false);
  const [hueLampSearch, setHueLampSearch] = useState('');

  const [hueRoomModal, setHueRoomModal] = useState({ open: false, roomId: null, floorId: null });
  const [hueRoomSearch, setHueRoomSearch] = useState('');
  const [hueRooms, setHueRooms] = useState([]);
  const [hueRoomsLoading, setHueRoomsLoading] = useState(false);

  const [hueSceneModal, setHueSceneModal] = useState({ open: false, roomId: null, sceneId: null });
  const [hueSceneSearch, setHueSceneSearch] = useState('');
  const [hueScenes, setHueScenes] = useState([]);
  const [hueScenesLoading, setHueScenesLoading] = useState(false);

  const [groupAddressModal, setGroupAddressModal] = useState({ open: false, roomId: null, floorId: null, title: '', mode: 'any', target: null, allowUpload: false, helperText: '' });
  const [groupAddressBook, setGroupAddressBook] = useState([]);
  const [groupAddressFileName, setGroupAddressFileName] = useState('');

  useEffect(() => {
    // NOTE: floors are intentionally NOT reset here.
    // They are initialised once via useState(() => migrateConfig(config)) on mount.
    // Resetting floors on every config change caused a flicker/wipe bug:
    // saveFloors → fetchConfig → setConfig → this effect → setFloors(old data).
    // On next mount (navigate away + back) useState re-initialises from the latest config.
    setGroupAddressBook(Array.isArray(config.importedGroupAddresses) ? config.importedGroupAddresses : []);
    setGroupAddressFileName(config.importedGroupAddressesFileName || '');
  }, [config]);


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Floor helpers ────────────────────────────────────────
  const activeFloor = floors.find(f => f.id === activeFloorId) || floors[0];

  const handleAddFloor = (name) => {
    const newFloor = { id: `floor_${Date.now()}`, name, rooms: [] };
    const updated = [...floors, newFloor];
    setFloors(updated);
    setActiveFloorId(newFloor.id);
    saveFloors(updated);
  };

  const handleDeleteFloor = (floorId) => {
    const floor = floors.find(f => f.id === floorId);
    let msg = `Are you sure you want to delete the floor "${floor?.name || 'Unknown'}"?`;
    if (floor && floor.rooms.length > 0) {
      msg = `"${floor.name}" contains ${floor.rooms.length} room(s). Delete everything?`;
    }
    if (!window.confirm(msg)) return;
    const updated = floors.filter(f => f.id !== floorId);
    setFloors(updated);
    if (activeFloorId === floorId) setActiveFloorId(updated[0]?.id || null);
    saveFloors(updated);
  };

  const handleReorderFloors = (reordered) => { setFloors(reordered); saveFloors(reordered); };

  const handleRenameFloor = (floorId, newName) => {
    const updated = floors.map(f => f.id !== floorId ? f : { ...f, name: newName });
    setFloors(updated);
    saveFloors(updated);
  };

  // ── Room helpers ─────────────────────────────────────────
  const updateFloorRooms = (floorId, updater) => {
    const updated = floors.map(f => f.id !== floorId ? f : { ...f, rooms: updater(f.rooms) });
    setFloors(updated);
    return updated;
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim() || !activeFloorId) return;
    const newRoom = { id: Date.now().toString(), name: newRoomName.trim(), sceneGroupAddress: '', scenes: [], functions: [] };
    const updated = updateFloorRooms(activeFloorId, rooms => [...rooms, newRoom]);
    try { await saveFloors(updated); setNewRoomName(''); addToast('Room added', 'success'); }
    catch { addToast('Failed to add room', 'error'); }
  };

  const handleDeleteRoom = async (floorId, roomId) => {
    const floor = floors.find(f => f.id === floorId);
    const room = floor?.rooms.find(r => r.id === roomId);
    if (!window.confirm(`Are you sure you want to delete the room "${room?.name || 'Unknown'}"?`)) return;
    const updated = updateFloorRooms(floorId, rooms => rooms.filter(r => r.id !== roomId));
    try { await saveFloors(updated); addToast('Room deleted', 'success'); fetchConfig(); }
    catch { addToast('Failed to delete room', 'error'); }
  };

  const updateRoom = (floorId, roomId, patch) => {
    return updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : { ...r, ...patch }));
  };

  const handleRenameRoom = (floorId, roomId, newName) => {
    const updated = updateFloorRooms(floorId, rooms =>
      rooms.map(r => r.id !== roomId ? r : { ...r, name: newName })
    );
    saveFloors(updated);
  };

  const handleMoveToFloor = async (roomId, fromFloorId, toFloorId) => {
    let movedRoom = null;
    let updated = floors.map(f => {
      if (f.id === fromFloorId) {
        movedRoom = f.rooms.find(r => r.id === roomId);
        return { ...f, rooms: f.rooms.filter(r => r.id !== roomId) };
      }
      return f;
    });
    if (!movedRoom) return;
    updated = updated.map(f => f.id !== toFloorId ? f : { ...f, rooms: [...f.rooms, movedRoom] });
    setFloors(updated);
    try { await saveFloors(updated); addToast(`Moved to ${floors.find(f => f.id === toFloorId)?.name}`, 'success'); }
    catch { addToast('Failed to move room', 'error'); }
  };

  // ── Scene handlers ───────────────────────────────────────
  const handleAddScene = (floorId, roomId, category = 'light') => {
    const room = floors.find(f => f.id === floorId)?.rooms.find(r => r.id === roomId);
    if (!room) return;
    const used = (room.scenes || []).map(s => s.sceneNumber);
    let n = 1; while (used.includes(n) && n <= 64) n++;
    updateRoom(floorId, roomId, { scenes: [...(room.scenes || []), { id: Date.now().toString(), name: '', sceneNumber: n, category }] });
  };

  const handleDeleteScene = (roomId, sceneId) => {
    for (const f of floors) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) { updateRoom(f.id, roomId, { scenes: room.scenes.filter(s => s.id !== sceneId) }); return; }
    }
  };

  const handleUpdateScene = (roomId, sceneId, key, val) => {
    if (key === '_unlinkHue') { handleUnlinkHueScene(roomId, sceneId); return; }
    for (const f of floors) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) { updateRoom(f.id, roomId, { scenes: room.scenes.map(s => s.id !== sceneId ? s : { ...s, [key]: val }) }); return; }
    }
  };

  const handleGenerateBaseScenes = (floorId, roomId) => {
    const room = floors.find(f => f.id === floorId)?.rooms.find(r => r.id === roomId);
    if (!room) return;
    const existing = room.scenes || [];
    const used = existing.map(s => s.sceneNumber);
    const toAdd = [];
    if (!used.includes(1)) toAdd.push({ id: `${Date.now()}_1`, name: 'Off', sceneNumber: 1, category: 'light' });
    if (!used.includes(2)) toAdd.push({ id: `${Date.now()}_2`, name: 'Bright', sceneNumber: 2, category: 'light' });
    if (!toAdd.length) { addToast('Base scenes already exist', 'success'); return; }
    updateRoom(floorId, roomId, { scenes: [...existing, ...toAdd] });
    addToast(`Added ${toAdd.map(s => s.name).join(' & ')}`, 'success');
  };

  // ── Function handlers ────────────────────────────────────
  const handleAddFunction = async (floorId, roomId) => {
    const updated = updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: [...r.functions, { id: Date.now().toString(), name: '', type: 'switch', groupAddress: '' }]
    }));
    try { await saveFloors(updated); fetchConfig(); } catch { addToast('Failed to add function', 'error'); }
  };

  const handleUpdateFunction = (roomId, funcId, key, val) => {
    for (const f of floors) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) {
        updateFloorRooms(f.id, rooms => rooms.map(r => r.id !== roomId ? r : {
          ...r, functions: r.functions.map(fn => fn.id !== funcId ? fn : { ...fn, [key]: val })
        }));
        return;
      }
    }
  };

  const handleDeleteFunction = async (roomId, funcId) => {
    let updated;
    for (const f of floors) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) {
        updated = updateFloorRooms(f.id, rooms => rooms.map(r => r.id !== roomId ? r : {
          ...r, functions: r.functions.filter(fn => fn.id !== funcId)
        }));
        break;
      }
    }
    if (updated) { try { await saveFloors(updated); fetchConfig(); } catch {} }
  };

  // ── Save ─────────────────────────────────────────────────
  const saveFloors = async (f = floors) => {
    await updateConfig({ floors: f });
    await fetchConfig(); // awaited so App.jsx config is fresh before any navigation
  };

  const saveGlobals = async (g = globals) => {
    setGlobals(g);
    try {
      await updateConfig({ globals: g });
      addToast('Globals saved', 'success');
      fetchConfig();
    } catch {
      addToast('Failed to save globals', 'error');
    }
  };

  const handleSave = () => {
    saveFloors().then(() => addToast('Settings saved', 'success')).catch(() => addToast('Failed to save', 'error'));
  };

  // ── DnD handlers ─────────────────────────────────────────
  const onRoomDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id || !activeFloorId) return;
    setFloors(prev => prev.map(f => {
      if (f.id !== activeFloorId) return f;
      const oi = f.rooms.findIndex(r => r.id === active.id);
      const ni = f.rooms.findIndex(r => r.id === over.id);
      return { ...f, rooms: arrayMove(f.rooms, oi, ni) };
    }));
  };

  const onFuncDragEnd = ({ active, over }, floorId, roomId) => {
    if (!over || active.id === over.id) return;
    setFloors(prev => prev.map(f => {
      if (f.id !== floorId) return f;
      return { ...f, rooms: f.rooms.map(r => {
        if (r.id !== roomId) return r;
        const oi = r.functions.findIndex(fn => fn.id === active.id);
        const ni = r.functions.findIndex(fn => fn.id === over.id);
        return { ...r, functions: arrayMove(r.functions, oi, ni) };
      })};
    }));
  };

  const onSceneDragEnd = ({ active, over }, floorId, roomId) => {
    if (!over || active.id === over.id) return;
    setFloors(prev => prev.map(f => {
      if (f.id !== floorId) return f;
      return { ...f, rooms: f.rooms.map(r => {
        if (r.id !== roomId) return r;
        const oi = r.scenes.findIndex(s => s.id === active.id);
        const ni = r.scenes.findIndex(s => s.id === over.id);
        return { ...r, scenes: arrayMove(r.scenes, oi, ni) };
      })};
    }));
  };

  // ── Hue: Lamp modal ──────────────────────────────────────
  const openHueLampModal = async (roomId, floorId) => {
    setHueLampModal({ open: true, roomId, floorId }); setHueLampsLoading(true);
    try {
      const res = await getHueLights();
      if (res.success) setHueLamps(res.lights);
      else addToast('Failed to load Hue lights: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueLampsLoading(false);
  };

  const selectHueLamp = (lamp) => {
    const { roomId, floorId } = hueLampModal;
    updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: [...r.functions, { id: Date.now().toString(), name: lamp.name, originalHueName: lamp.name, type: 'hue', hueLightId: lamp.id, iconType: 'lightbulb' }]
    }));
    setHueLampSearch(''); setHueLampModal({ open: false, roomId: null, floorId: null });
    addToast(`Added "${lamp.name}"`, 'success');
  };

  // ── Hue: Room modal ──────────────────────────────────────
  const openHueRoomModal = async (roomId, floorId) => {
    setHueRoomModal({ open: true, roomId, floorId }); setHueRoomsLoading(true);
    try {
      const res = await getHueRooms();
      if (res.success) setHueRooms(res.rooms);
      else addToast('Failed to load Hue rooms: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueRoomsLoading(false);
  };

  const selectHueRoom = async (hueRoom) => {
    const { roomId, floorId } = hueRoomModal;
    try {
      const res = await linkHueRoom(roomId, hueRoom.id);
      if (res.success) {
        updateRoom(floorId, roomId, { hueRoomId: hueRoom.id, hueRoomName: hueRoom.name });
        addToast(`Linked Hue room "${hueRoom.name}"`, 'success'); fetchConfig();
      } else addToast('Link failed: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach backend', 'error'); }
    setHueRoomSearch(''); setHueRoomModal({ open: false, roomId: null, floorId: null });
  };

  const handleUnlinkHueRoom = async (roomId, floorId) => {
    try {
      await unlinkHueRoom(roomId);
      updateRoom(floorId, roomId, { hueRoomId: null, hueRoomName: null });
      addToast('Hue room unlinked', 'success'); fetchConfig();
    } catch { addToast('Unlink failed', 'error'); }
  };

  // ── Hue: Scene modal ─────────────────────────────────────
  const openHueSceneModal = async (roomId, sceneId) => {
    setHueSceneModal({ open: true, roomId, sceneId }); setHueScenesLoading(true);
    try {
      await saveFloors();
      const res = await getHueScenes();
      if (res.success) setHueScenes(res.scenes);
      else addToast('Failed to load Hue scenes: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueScenesLoading(false);
  };

  const selectHueScene = async (hueScene) => {
    const { roomId, sceneId } = hueSceneModal;
    try {
      const res = await linkHueScene(sceneId, hueScene.id);
      if (res.success) {
        for (const f of floors) {
          const room = f.rooms.find(r => r.id === roomId);
          if (room) {
            updateRoom(f.id, roomId, { scenes: room.scenes.map(s => s.id !== sceneId ? s : { ...s, hueSceneId: hueScene.id, hueSceneName: hueScene.name }) });
            break;
          }
        }
        addToast(`Linked Hue scene "${hueScene.name}"`, 'success'); fetchConfig();
      } else addToast('Link failed: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach backend', 'error'); }
    setHueSceneSearch(''); setHueSceneModal({ open: false, roomId: null, sceneId: null });
  };

  const handleUnlinkHueScene = async (roomId, sceneId) => {
    try {
      await unlinkHueScene(sceneId);
      for (const f of floors) {
        const room = f.rooms.find(r => r.id === roomId);
        if (room) {
          updateRoom(f.id, roomId, { scenes: room.scenes.map(s => s.id !== sceneId ? s : { ...s, hueSceneId: null, hueSceneName: null }) });
          break;
        }
      }
      addToast('Hue scene unlinked', 'success'); fetchConfig();
    } catch { addToast('Unlink failed', 'error'); }
  };

  // ── GA modal ─────────────────────────────────────────────
  const openGroupAddressModal = (options) => {
    setGroupAddressModal({ open: true, roomId: options.roomId || null, floorId: options.floorId || null, title: options.title || 'Select Group Address', mode: options.mode || 'any', target: options.target || null, allowUpload: !!options.allowUpload, helperText: options.helperText || '' });
  };
  const closeGroupAddressModal = () => setGroupAddressModal({ open: false, roomId: null, floorId: null, title: '', mode: 'any', target: null, allowUpload: false, helperText: '' });

  const importGroupAddresses = async (addresses, fileName) => {
    try {
      await updateConfig({ importedGroupAddresses: addresses, importedGroupAddressesFileName: fileName });
      setGroupAddressBook(addresses); setGroupAddressFileName(fileName);
      addToast(`Imported ${addresses.length} group addresses`, 'success'); fetchConfig();
    } catch { addToast('Failed to persist imported group addresses', 'error'); }
  };
  const clearGroupAddresses = async () => {
    try {
      await updateConfig({ importedGroupAddresses: [], importedGroupAddressesFileName: '' });
      setGroupAddressBook([]); setGroupAddressFileName('');
      addToast('Imported group addresses cleared', 'success'); fetchConfig();
    } catch { addToast('Failed to clear imported group addresses', 'error'); }
  };

  const handleSelectGroupAddress = async (groupAddress) => {
    const { roomId, floorId, target } = groupAddressModal;
    if (target?.kind === 'global') {
      const updatedGlobals = globals.map(g => g.id === target.id ? { ...g, statusGroupAddress: groupAddress.address, dpt: groupAddress.dpt || '' } : g);
      saveGlobals(updatedGlobals);
      addToast(`Selected global GA "${groupAddress.name}"`, 'success'); closeGroupAddressModal(); return;
    }
    if (!roomId) return;
    if (target?.kind === 'field') {
      handleUpdateFunction(roomId, target.functionId, target.field, groupAddress.address);
      addToast(`Inserted "${groupAddress.name}"`, 'success'); closeGroupAddressModal(); return;
    }
    if (target?.kind === 'sceneGA') {
      updateRoom(floorId, roomId, { sceneGroupAddress: groupAddress.address });
      addToast(`Selected scene GA "${groupAddress.name}"`, 'success'); closeGroupAddressModal(); return;
    }
    const newFunction = { id: Date.now().toString(), name: groupAddress.name, type: groupAddress.functionType || 'switch', groupAddress: groupAddress.address };
    if (newFunction.type === 'switch') newFunction.iconType = 'lightbulb';
    const updated = updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : { ...r, functions: [...r.functions, newFunction] }));
    try { await saveFloors(updated); addToast(`Added "${groupAddress.name}" from ETS`, 'success'); fetchConfig(); closeGroupAddressModal(); }
    catch { addToast('Failed to add ETS function', 'error'); }
  };

  // ── Render ───────────────────────────────────────────────
  const activeRooms = activeFloor?.rooms || [];
  const roomIds = activeRooms.map(r => r.id);
  const filteredHueLamps = hueLamps.filter(l => l.name.toLowerCase().includes(hueLampSearch.trim().toLowerCase()));
  const filteredHueRooms = hueRooms.filter(r => r.name.toLowerCase().includes(hueRoomSearch.trim().toLowerCase()));
  const filteredHueScenes = hueScenes.filter(s => s.name.toLowerCase().includes(hueSceneSearch.trim().toLowerCase()));

  return (
    <div className="glass-panel settings-panel">
      
      {/* Header bar that holds either FloorTabs or Title, and the Globals toggle button */}
      <div className="settings-floors-header">
        {activeTab === 'rooms' ? (
          <FloorTabs
            floors={floors}
            activeFloorId={activeFloor?.id}
            onSelectFloor={setActiveFloorId}
            onReorderFloors={handleReorderFloors}
            onAddFloor={handleAddFloor}
            onDeleteFloor={handleDeleteFloor}
            onRenameFloor={handleRenameFloor}
          />
        ) : (
          <div style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Global Information & Alarms
          </div>
        )}

        {/* The Toggle Button on the absolute right */}
        <button 
          className={`btn-secondary-sm settings-global-toggle ${activeTab === 'globals' ? 'active' : ''}`}
          onClick={() => setActiveTab(activeTab === 'rooms' ? 'globals' : 'rooms')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'globals' ? 'var(--accent-color)' : '', color: activeTab === 'globals' ? 'white' : '' }}
        >
          <SettingsIcon size={14} />
          {activeTab === 'rooms' ? 'Global Info & Alarms' : 'Back to Rooms'}
        </button>
      </div>

      {activeTab === 'globals' ? (
        <div style={{ padding: '1.5rem' }}>
          <GlobalsConfig
            globals={globals}
            saveGlobals={saveGlobals}
            openGroupAddressModal={openGroupAddressModal}
          />
        </div>
      ) : (
        <>
          {/* Add Room bar */}
          <div className="settings-add-room-bar">
        <div className="settings-field" style={{ flex: 1 }}>
          <input
            className="form-input"
            placeholder={`Add room to ${activeFloor?.name || 'floor'}…`}
            value={newRoomName}
            onChange={e => setNewRoomName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
          />
        </div>
        <button className="btn-primary" onClick={handleCreateRoom} disabled={!activeFloor}>
          <Plus size={16} /> Add Room
        </button>
      </div>

      {/* Rooms list */}
      <div className="settings-rooms-body">
        {activeRooms.length === 0 ? (
          <div className="settings-empty-floor">
            <p>No rooms on <strong>{activeFloor?.name}</strong> yet.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Use the field above to add your first room.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onRoomDragEnd}>
            <SortableContext items={roomIds} strategy={verticalListSortingStrategy}>
              {activeRooms.map(room => (
                <CollapsibleRoomCard
                  key={room.id}
                  room={room}
                  floors={floors}
                  floorId={activeFloor.id}
                  handleDeleteRoom={handleDeleteRoom}
                  updateRoom={updateRoom}
                  onRenameRoom={handleRenameRoom}
                  handleAddScene={handleAddScene}
                  handleDeleteScene={handleDeleteScene}
                  handleUpdateScene={handleUpdateScene}
                  handleAddFunction={handleAddFunction}
                  handleDeleteFunction={handleDeleteFunction}
                  handleUpdateFunction={handleUpdateFunction}
                  handleGenerateBaseScenes={handleGenerateBaseScenes}
                  handleSave={handleSave}
                  openHueSceneModal={openHueSceneModal}
                  openHueRoomModal={openHueRoomModal}
                  openHueLampModal={openHueLampModal}
                  openGroupAddressModal={openGroupAddressModal}
                  hueStatus={hueStatus}
                  onFuncDragEnd={onFuncDragEnd}
                  onSceneDragEnd={onSceneDragEnd}
                  sensors={sensors}
                  onMoveToFloor={handleMoveToFloor}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      </>
      )}

      {/* ── Hue Lamp Modal ── */}
      {hueLampModal.open && createPortal(
        <div className="modal-overlay" onClick={() => { setHueLampModal({ open: false, roomId: null, floorId: null }); setHueLampSearch(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Select Hue Lamp</h3>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input className="form-input" style={{ paddingLeft: '2.5rem' }} type="text" placeholder="Search Hue lamps" value={hueLampSearch} onChange={e => setHueLampSearch(e.target.value)} />
            </div>
            {hueLampsLoading ? <p style={{ color: 'var(--text-secondary)' }}>Loading lamps…</p> :
              filteredHueLamps.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>{hueLampSearch ? 'No match.' : 'No Hue lights found.'}</p> : (
                <div className="hue-lamp-list">
                  {filteredHueLamps.map(lamp => (
                    <button key={lamp.id} className="hue-lamp-item" onClick={() => selectHueLamp(lamp)}>
                      <Lightbulb size={18} style={{ color: lamp.on ? 'var(--success-color)' : 'var(--text-secondary)' }} fill={lamp.on ? 'currentColor' : 'none'} />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lamp.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{lamp.type} · {lamp.reachable ? 'Reachable' : 'Unreachable'}</div>
                      </div>
                      <Plus size={16} style={{ color: 'var(--accent-color)' }} />
                    </button>
                  ))}
                </div>
              )}
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => { setHueLampModal({ open: false, roomId: null, floorId: null }); setHueLampSearch(''); }}>Cancel</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* ── Hue Room Modal ── */}
      {hueRoomModal.open && createPortal(
        <div className="modal-overlay" onClick={() => { setHueRoomModal({ open: false, roomId: null, floorId: null }); setHueRoomSearch(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Select Hue Room</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>When a KNX scene named "Aus" or "Off" is triggered, the linked Hue room will be turned off.</p>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input className="form-input" style={{ paddingLeft: '2.5rem' }} type="text" placeholder="Search Hue rooms" value={hueRoomSearch} onChange={e => setHueRoomSearch(e.target.value)} />
            </div>
            {hueRoomsLoading ? <p style={{ color: 'var(--text-secondary)' }}>Loading rooms…</p> :
              filteredHueRooms.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No Hue rooms found.</p> : (
                <div className="hue-lamp-list">
                  {filteredHueRooms.map(hr => (
                    <button key={hr.id} className="hue-lamp-item" onClick={() => selectHueRoom(hr)}>
                      <Lightbulb size={18} style={{ color: 'var(--accent-color)' }} />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{hr.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{hr.lights.length} light{hr.lights.length !== 1 ? 's' : ''}</div>
                      </div>
                      <Plus size={16} style={{ color: 'var(--accent-color)' }} />
                    </button>
                  ))}
                </div>
              )}
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => { setHueRoomModal({ open: false, roomId: null, floorId: null }); setHueRoomSearch(''); }}>Cancel</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* ── Hue Scene Modal ── */}
      {hueSceneModal.open && createPortal(
        <div className="modal-overlay" onClick={() => { setHueSceneModal({ open: false, roomId: null, sceneId: null }); setHueSceneSearch(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Select Hue Scene</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>This scene will be activated on the Hue Bridge when the KNX scene is triggered.</p>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input className="form-input" style={{ paddingLeft: '2.5rem' }} type="text" placeholder="Search Hue scenes" value={hueSceneSearch} onChange={e => setHueSceneSearch(e.target.value)} />
            </div>
            {hueScenesLoading ? <p style={{ color: 'var(--text-secondary)' }}>Loading scenes…</p> :
              filteredHueScenes.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No Hue scenes found.</p> : (
                <div className="hue-lamp-list">
                  {filteredHueScenes.map(hs => (
                    <button key={hs.id} className="hue-lamp-item" onClick={() => selectHueScene(hs)}>
                      <Sparkles size={18} style={{ color: 'var(--accent-color)' }} />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{hs.name}</div>
                        {hs.group && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Group {hs.group}</div>}
                      </div>
                      <Plus size={16} style={{ color: 'var(--accent-color)' }} />
                    </button>
                  ))}
                </div>
              )}
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => { setHueSceneModal({ open: false, roomId: null, sceneId: null }); setHueSceneSearch(''); }}>Cancel</button>
            </div>
          </div>
        </div>, document.body
      )}

      <KNXGroupAddressModal
        isOpen={groupAddressModal.open}
        title={groupAddressModal.title}
        addresses={groupAddressBook}
        importedFileName={groupAddressFileName}
        onClose={closeGroupAddressModal}
        onSelect={handleSelectGroupAddress}
        onImport={importGroupAddresses}
        onClear={clearGroupAddresses}
        mode={groupAddressModal.mode}
        allowUpload={groupAddressModal.allowUpload}
        helperText={groupAddressModal.helperText}
      />
    </div>
  );
}
