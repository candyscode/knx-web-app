import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, closestCenter, pointerWithin, PointerSensor, TouchSensor,
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
import ConfirmDialog from './components/ConfirmDialog';
import { Plus, Search, Lightbulb, Sparkles, Settings as SettingsIcon } from 'lucide-react';
import { getImportedGroupAddressDpt, getImportedGroupAddressName } from './groupAddressUtils';

// ── Migration ─────────────────────────────────────────────
function migrateRooms(inputRooms) {
  return inputRooms.map(room => {
    if (room.scenes !== undefined) {
      return {
        ...room,
        scenes: Array.isArray(room.scenes) ? room.scenes : [],
        functions: Array.isArray(room.functions) ? room.functions : [],
      };
    }
    const sceneFuncs = (room.functions || []).filter(f => f.type === 'scene');
    const otherFuncs = (room.functions || []).filter(f => f.type !== 'scene');
    if (sceneFuncs.length === 0) {
      return {
        ...room,
        sceneGroupAddress: '',
        scenes: [],
        functions: Array.isArray(room.functions) ? room.functions : [],
      };
    }
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
  return Array.isArray(config.floors) ? config.floors : [];
}

export function reorderRoomsWithinFloor(floors, floorId, activeRoomId, overRoomId) {
  return floors.map((floor) => {
    if (floor.id !== floorId) return floor;
    const oldIndex = floor.rooms.findIndex((room) => room.id === activeRoomId);
    const newIndex = floor.rooms.findIndex((room) => room.id === overRoomId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return floor;
    return { ...floor, rooms: arrayMove(floor.rooms, oldIndex, newIndex) };
  });
}

export function moveRoomBetweenFloors(floors, roomId, targetFloorId) {
  let movedRoom = null;
  const withoutRoom = floors.map((floor) => {
    const room = floor.rooms.find((entry) => entry.id === roomId);
    if (!room) return floor;
    movedRoom = room;
    return { ...floor, rooms: floor.rooms.filter((entry) => entry.id !== roomId) };
  });

  if (!movedRoom) return floors;

  return withoutRoom.map((floor) => (
    floor.id !== targetFloorId
      ? floor
      : { ...floor, rooms: [...floor.rooms, movedRoom] }
  ));
}

function RoomDragPreview({ room, width }) {
  if (!room) return null;

  const totalScenes = (room.scenes || []).length;
  const totalFuncs = (room.functions || []).length;

  return (
    <div className="room-drag-overlay" style={width ? { width: `${width}px` } : undefined}>
      <div className="room-settings-header room-collapse-header">
        <span className="drag-handle room-drag-handle room-drag-overlay-handle">⋮⋮</span>
        <div className="room-name-editable">
          <h3 className="room-name-heading">{room.name}</h3>
        </div>
        <div className="room-card-meta">
          {totalScenes > 0 && <span className="room-meta-badge">{totalScenes} scenes</span>}
          {totalFuncs > 0 && <span className="room-meta-badge">{totalFuncs} functions</span>}
        </div>
      </div>
    </div>
  );
}

function dragCollisionDetection(args) {
  const activeType = args.active?.data?.current?.type;

  if (activeType === 'room') {
    const allowed = args.droppableContainers.filter((container) => {
      const type = container.data?.current?.type;
      return type === 'room' || type === 'floor';
    });
    return pointerWithin({ ...args, droppableContainers: allowed })
      || closestCenter({ ...args, droppableContainers: allowed });
  }

  if (activeType === 'floor') {
    const allowed = args.droppableContainers.filter((container) => container.data?.current?.type === 'floor');
    return pointerWithin({ ...args, droppableContainers: allowed })
      || closestCenter({ ...args, droppableContainers: allowed });
  }

  return pointerWithin(args) || closestCenter(args);
}

function getEventClientPoint(event) {
  if (!event) return null;
  if ('touches' in event && event.touches?.length) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  if ('changedTouches' in event && event.changedTouches?.length) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  if ('clientX' in event && 'clientY' in event) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

// ── Main Settings ─────────────────────────────────────────
export default function Settings({ fullConfig, apartment, config, fetchConfig, applyConfig, addToast, hueStatus }) {
  const [floors, setFloors] = useState(() => migrateConfig(config));
  const floorsRef = useRef(migrateConfig(config));
  const [sharedInfos, setSharedInfos] = useState(() => Array.isArray(config.sharedInfos) ? config.sharedInfos : []);
  const [alarms, setAlarms] = useState(() => Array.isArray(config.alarms) ? config.alarms : []);
  const [houseWideInfoReadApartmentId, setHouseWideInfoReadApartmentId] = useState(() => config.houseWideInfoReadApartmentId || apartment.id);
  const [activeFloorId, setActiveFloorId] = useState(() => {
    const f = migrateConfig(config);
    return f[0]?.id || null;
  });
  const [activeTab, setActiveTab] = useState('rooms');
  const [newRoomName, setNewRoomName] = useState('');
  const [expandedRoomIds, setExpandedRoomIds] = useState(() => new Set());
  const [roomDragActive, setRoomDragActive] = useState(false);
  const [roomDropTargetFloorId, setRoomDropTargetFloorId] = useState(null);
  const [draggedRoom, setDraggedRoom] = useState(null);
  const [draggedRoomWidth, setDraggedRoomWidth] = useState(null);
  const [draggedRoomPointer, setDraggedRoomPointer] = useState(null);
  const [draggedRoomAnchorOffset, setDraggedRoomAnchorOffset] = useState({ x: 32, y: 22 });
  const draggedRoomStartPointerRef = useRef(null);

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

  const [groupAddressModal, setGroupAddressModal] = useState({
    open: false,
    roomId: null,
    floorId: null,
    title: '',
    mode: 'any',
    dptFilter: null,
    target: null,
    allowUpload: false,
    helperText: '',
    scope: 'apartment',
    onSelect: null,
  });
  const [houseGroupAddressBook, setHouseGroupAddressBook] = useState([]);
  const [houseGroupAddressFileName, setHouseGroupAddressFileName] = useState('');
  const [addAreaModalOpen, setAddAreaModalOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaIsShared, setNewAreaIsShared] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
  });
  const confirmResolverRef = useRef(null);
  const persistQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    const nextFloors = migrateConfig(config);
    floorsRef.current = nextFloors;
    setFloors(nextFloors);
    setExpandedRoomIds((prev) => {
      const validRoomIds = new Set(nextFloors.flatMap((floor) => floor.rooms.map((room) => room.id)));
      const nextExpanded = new Set();
      prev.forEach((roomId) => {
        if (validRoomIds.has(roomId)) nextExpanded.add(roomId);
      });
      return nextExpanded;
    });
    setSharedInfos(Array.isArray(config.sharedInfos) ? config.sharedInfos : []);
    setAlarms(Array.isArray(config.alarms) ? config.alarms : []);
    setHouseWideInfoReadApartmentId(config.houseWideInfoReadApartmentId || apartment.id);
    setActiveFloorId(migrateConfig(config)[0]?.id || null);
    setHouseGroupAddressBook(Array.isArray(config.importedGroupAddresses) ? config.importedGroupAddresses : []);
    setHouseGroupAddressFileName(config.importedGroupAddressesFileName || '');
  }, [apartment?.id]);


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Floor helpers ────────────────────────────────────────
  const activeFloor = floors.find(f => f.id === activeFloorId) || floors[0];
  const modalAddressBook = houseGroupAddressBook;
  const modalAddressFileName = houseGroupAddressFileName;

  const stripSharedMarker = (entries) => entries.map(({ isShared, ...floor }) => ({
    ...floor,
    rooms: Array.isArray(floor.rooms) ? floor.rooms : [],
  }));

  const commitFloorsState = (nextFloors) => {
    floorsRef.current = nextFloors;
    setFloors(nextFloors);
    return nextFloors;
  };

  const buildNextConfig = ({
    nextFloors = floors,
    nextSharedInfos = sharedInfos,
    nextAlarms = alarms,
    nextHouseGroupAddressBook = houseGroupAddressBook,
    nextHouseGroupAddressFileName = houseGroupAddressFileName,
    nextHouseWideInfoReadApartmentId = houseWideInfoReadApartmentId,
  } = {}) => {
    const privateFloors = stripSharedMarker(nextFloors.filter((floor) => !floor.isShared));
    const sharedAreas = stripSharedMarker(nextFloors.filter((floor) => floor.isShared));
    const areaOrder = nextFloors.map((floor) => floor.id);

    return {
      ...fullConfig,
      building: {
        ...fullConfig.building,
        sharedInfos: nextSharedInfos,
        sharedAreas,
        houseWideInfoReadApartmentId: nextHouseWideInfoReadApartmentId,
        importedGroupAddresses: nextHouseGroupAddressBook,
        importedGroupAddressesFileName: nextHouseGroupAddressFileName,
      },
      apartments: fullConfig.apartments.map((entry) => ({
        ...entry,
        ...(entry.id === apartment.id ? {
          floors: privateFloors,
          areaOrder,
          alarms: nextAlarms,
        } : {}),
        importedGroupAddresses: [],
        importedGroupAddressesFileName: '',
      })),
    };
  };

  const persistConfig = async (nextConfig) => {
    persistQueueRef.current = persistQueueRef.current
      .catch(() => {})
      .then(async () => {
        const result = await updateConfig(nextConfig);
        if (result?.config) applyConfig?.(result.config);
        else await fetchConfig();
        return result;
      });

    return persistQueueRef.current;
  };

  const closeConfirmDialog = (confirmed = false) => {
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    if (confirmResolverRef.current) {
      confirmResolverRef.current(confirmed);
      confirmResolverRef.current = null;
    }
  };

  const requestConfirm = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) => {
    setConfirmDialog({
      open: true,
      title,
      message,
      confirmLabel,
      cancelLabel,
      danger,
    });

    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
    });
  };

  const handleAddFloor = (name, scope = 'apartment') => {
    const newFloor = { 
      id: `floor_${Date.now()}`, 
      name, 
      rooms: [], 
      isShared: scope === 'shared',
      // If it's a shared area, link it to the currently selected apartment's Hue bridge
      ...(scope === 'shared' && { ownerApartmentId: apartment.id })
    };
    const updated = commitFloorsState([...floorsRef.current, newFloor]);
    setActiveFloorId(newFloor.id);
    saveFloors(updated);
  };

  const openAddAreaModal = () => {
    setNewAreaName('');
    setNewAreaIsShared(false);
    setAddAreaModalOpen(true);
  };

  const closeAddAreaModal = () => {
    setAddAreaModalOpen(false);
    setNewAreaName('');
    setNewAreaIsShared(false);
  };

  const handleCreateArea = () => {
    const trimmedName = newAreaName.trim();
    if (!trimmedName) return;
    handleAddFloor(trimmedName, newAreaIsShared ? 'shared' : 'apartment');
    closeAddAreaModal();
  };

  const handleDeleteFloor = async (floorId) => {
    const floor = floors.find(f => f.id === floorId);
    let msg = `Are you sure you want to delete the floor "${floor?.name || 'Unknown'}"?`;
    if (floor && floor.rooms.length > 0) {
      msg = `"${floor.name}" contains ${floor.rooms.length} room(s). Delete everything?`;
    }
    const confirmed = await requestConfirm({
      title: 'Delete Area',
      message: msg,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const updated = commitFloorsState(floorsRef.current.filter(f => f.id !== floorId));
    if (activeFloorId === floorId) setActiveFloorId(updated[0]?.id || null);
    saveFloors(updated);
  };

  const handleReorderFloors = (reordered) => { commitFloorsState(reordered); saveFloors(reordered); };

  const handleRenameFloor = (floorId, newName) => {
    const updated = commitFloorsState(floorsRef.current.map(f => f.id !== floorId ? f : { ...f, name: newName }));
    saveFloors(updated);
  };

  // ── Room helpers ─────────────────────────────────────────
  const updateFloorRooms = (floorId, updater) => {
    return commitFloorsState(
      floorsRef.current.map(f => f.id !== floorId ? f : { ...f, rooms: updater(f.rooms) })
    );
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim() || !activeFloorId) return;
    const newRoom = { id: Date.now().toString(), name: newRoomName.trim(), sceneGroupAddress: '', scenes: [], functions: [] };
    const updated = updateFloorRooms(activeFloorId, rooms => [...rooms, newRoom]);
    try { await saveFloors(updated); setNewRoomName(''); addToast('Room added', 'success'); }
    catch { addToast('Failed to add room', 'error'); }
  };

  const handleDeleteRoom = async (floorId, roomId) => {
    const floor = floorsRef.current.find(f => f.id === floorId);
    const room = floor?.rooms.find(r => r.id === roomId);
    const confirmed = await requestConfirm({
      title: 'Delete Room',
      message: `Are you sure you want to delete the room "${room?.name || 'Unknown'}"?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
      return next;
    });
    const updated = updateFloorRooms(floorId, rooms => rooms.filter(r => r.id !== roomId));
    try { await saveFloors(updated); addToast('Room deleted', 'success'); }
    catch { addToast('Failed to delete room', 'error'); }
  };

  const updateRoom = (floorId, roomId, patch) => {
    return updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : { ...r, ...patch }));
  };

  const persistRoomChanges = async () => {
    try {
      await saveFloors();
    } catch {
      addToast('Failed to save room changes', 'error');
    }
  };

  const handleRenameRoom = (floorId, roomId, newName) => {
    const updated = updateFloorRooms(floorId, rooms =>
      rooms.map(r => r.id !== roomId ? r : { ...r, name: newName })
    );
    saveFloors(updated);
  };

  // ── Scene handlers ───────────────────────────────────────
  const handleAddScene = (floorId, roomId, category = 'light') => {
    const room = floorsRef.current.find(f => f.id === floorId)?.rooms.find(r => r.id === roomId);
    if (!room) return;
    const used = (room.scenes || []).map(s => s.sceneNumber);
    let n = 1; while (used.includes(n) && n <= 64) n++;
    const updated = updateRoom(floorId, roomId, { scenes: [...(room.scenes || []), { id: Date.now().toString(), name: '', sceneNumber: n, category }] });
    saveFloors(updated).catch(() => addToast('Failed to save room scenes', 'error'));
  };

  const handleDeleteScene = (roomId, sceneId) => {
    for (const f of floorsRef.current) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) {
        const updated = updateRoom(f.id, roomId, { scenes: (room.scenes || []).filter(s => s.id !== sceneId) });
        saveFloors(updated).catch(() => addToast('Failed to save room scenes', 'error'));
        return;
      }
    }
  };

  const handleUpdateScene = (roomId, sceneId, key, val, options = {}) => {
    if (key === '_unlinkHue') { handleUnlinkHueScene(roomId, sceneId); return; }
    for (const f of floorsRef.current) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) {
        const updated = updateRoom(f.id, roomId, { scenes: (room.scenes || []).map(s => s.id !== sceneId ? s : { ...s, [key]: val }) });
        if (options.saveImmediately) saveFloors(updated).catch(() => addToast('Failed to save room scenes', 'error'));
        return;
      }
    }
  };

  const handleGenerateBaseScenes = (floorId, roomId) => {
    const room = floorsRef.current.find(f => f.id === floorId)?.rooms.find(r => r.id === roomId);
    if (!room) return;
    const existing = room.scenes || [];
    const used = existing.map(s => s.sceneNumber);
    const toAdd = [];
    if (!used.includes(1)) toAdd.push({ id: `${Date.now()}_1`, name: 'Off', sceneNumber: 1, category: 'light' });
    if (!used.includes(2)) toAdd.push({ id: `${Date.now()}_2`, name: 'Bright', sceneNumber: 2, category: 'light' });
    if (!toAdd.length) { addToast('Base scenes already exist', 'success'); return; }
    const updated = updateRoom(floorId, roomId, { scenes: [...existing, ...toAdd] });
    saveFloors(updated).catch(() => addToast('Failed to save room scenes', 'error'));
    addToast(`Added ${toAdd.map(s => s.name).join(' & ')}`, 'success');
  };

  // ── Function handlers ────────────────────────────────────
  const handleAddFunction = async (floorId, roomId) => {
    const updated = updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: [...(r.functions || []), { id: Date.now().toString(), name: '', type: 'switch', groupAddress: '' }]
    }));
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      next.add(roomId);
      return next;
    });
    try { await saveFloors(updated); } catch { addToast('Failed to add function', 'error'); }
  };

  const handleUpdateFunction = (roomId, funcId, key, val, options = {}) => {
    for (const f of floorsRef.current) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) {
        const updated = updateFloorRooms(f.id, rooms => rooms.map(r => r.id !== roomId ? r : {
          ...r, functions: (r.functions || []).map(fn => fn.id !== funcId ? fn : { ...fn, [key]: val })
        }));
        if (options.saveImmediately) saveFloors(updated).catch(() => addToast('Failed to save room functions', 'error'));
        return;
      }
    }
  };

  const handleDeleteFunction = async (roomId, funcId) => {
    let updated;
    for (const f of floorsRef.current) {
      const room = f.rooms.find(r => r.id === roomId);
      if (room) {
        updated = updateFloorRooms(f.id, rooms => rooms.map(r => r.id !== roomId ? r : {
          ...r, functions: (r.functions || []).filter(fn => fn.id !== funcId)
        }));
        break;
      }
    }
    if (updated) {
      setExpandedRoomIds((prev) => {
        const next = new Set(prev);
        next.add(roomId);
        return next;
      });
      try { await saveFloors(updated); } catch {}
    }
  };

  // ── Save ─────────────────────────────────────────────────
  const saveFloors = async (f = floorsRef.current) => {
    await persistConfig(buildNextConfig({ nextFloors: f }));
  };

  const saveSharedInfos = async (nextInfos = sharedInfos) => {
    const normalizedInfos = nextInfos.map((info) => {
      const resolvedDpt = info?.dpt || getImportedGroupAddressDpt(houseGroupAddressBook, info?.statusGroupAddress);
      return resolvedDpt ? { ...info, dpt: resolvedDpt } : info;
    });
    setSharedInfos(normalizedInfos);
    try {
      await persistConfig(buildNextConfig({ nextSharedInfos: normalizedInfos }));
      return true;
    } catch {
      addToast('Failed to save house-wide information', 'error');
      return false;
    }
  };

  const saveAlarms = async (nextAlarms = alarms) => {
    const normalizedAlarms = nextAlarms.map((alarm) => {
      const resolvedDpt = alarm?.dpt || getImportedGroupAddressDpt(houseGroupAddressBook, alarm?.statusGroupAddress);
      return resolvedDpt ? { ...alarm, dpt: resolvedDpt } : alarm;
    });
    setAlarms(normalizedAlarms);
    try {
      await persistConfig(buildNextConfig({ nextAlarms: normalizedAlarms }));
      return true;
    } catch {
      addToast('Failed to save apartment alarms', 'error');
      return false;
    }
  };

  const saveHouseWideInfoReadApartment = async (nextApartmentId) => {
    setHouseWideInfoReadApartmentId(nextApartmentId);
    try {
      await persistConfig(buildNextConfig({ nextHouseWideInfoReadApartmentId: nextApartmentId }));
      return true;
    } catch {
      addToast('Failed to save house-wide information gateway', 'error');
      return false;
    }
  };

  // ── DnD handlers ─────────────────────────────────────────
  const onRoomDragStart = ({ active, activatorEvent }) => {
    const activeType = active?.data?.current?.type;
    if (activeType === 'room') {
      const room = floorsRef.current.flatMap((floor) => floor.rooms).find((entry) => entry.id === active.id) || null;
      const initialRect = active?.rect?.current?.initial || null;
      const measuredWidth = initialRect?.width || null;
      const startPoint = getEventClientPoint(activatorEvent);
      const handleRect = active?.activatorNode?.current?.getBoundingClientRect?.() || null;
      const anchorOffset = initialRect && startPoint
        ? {
          x: startPoint.x - initialRect.left,
          y: startPoint.y - initialRect.top,
        }
        : initialRect && handleRect
          ? {
            x: (handleRect.left - initialRect.left) + (handleRect.width / 2),
            y: (handleRect.top - initialRect.top) + (handleRect.height / 2),
          }
          : { x: 32, y: 22 };

      draggedRoomStartPointerRef.current = startPoint;
      setRoomDragActive(true);
      setRoomDropTargetFloorId(null);
      setDraggedRoom(room);
      setDraggedRoomWidth(measuredWidth);
      setDraggedRoomPointer(startPoint);
      setDraggedRoomAnchorOffset(anchorOffset);
    }
  };

  const onRoomDragOver = ({ active, over }) => {
    const activeType = active?.data?.current?.type;
    const overType = over?.data?.current?.type;

    if (activeType !== 'room') {
      setRoomDropTargetFloorId(null);
      return;
    }

    setRoomDropTargetFloorId(overType === 'floor' ? over.id : null);
  };

  const onRoomDragMove = ({ active, delta }) => {
    if (active?.data?.current?.type !== 'room' || !draggedRoomStartPointerRef.current) return;
    setDraggedRoomPointer({
      x: draggedRoomStartPointerRef.current.x + delta.x,
      y: draggedRoomStartPointerRef.current.y + delta.y,
    });
  };

  const resetRoomDragState = () => {
    setRoomDragActive(false);
    setRoomDropTargetFloorId(null);
    setDraggedRoom(null);
    setDraggedRoomWidth(null);
    setDraggedRoomPointer(null);
    setDraggedRoomAnchorOffset({ x: 32, y: 22 });
    draggedRoomStartPointerRef.current = null;
  };

  const onRoomDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) {
      resetRoomDragState();
      return;
    }

    const floorIds = floorsRef.current.map((floor) => floor.id);
    const activeId = active.id;
    const overId = over.id;

    if (floorIds.includes(activeId) && floorIds.includes(overId)) {
      const oldIndex = floorsRef.current.findIndex((floor) => floor.id === activeId);
      const newIndex = floorsRef.current.findIndex((floor) => floor.id === overId);
      resetRoomDragState();
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      handleReorderFloors(arrayMove(floorsRef.current, oldIndex, newIndex));
      return;
    }

    if (floorIds.includes(overId)) {
      const sourceFloor = floorsRef.current.find((floor) => floor.rooms.some((room) => room.id === activeId));
      resetRoomDragState();
      if (!sourceFloor || sourceFloor.id === overId) return;
      const moved = moveRoomBetweenFloors(floorsRef.current, activeId, overId);
      commitFloorsState(moved);
      saveFloors(moved)
        .then(() => addToast(`Moved to ${moved.find((floor) => floor.id === overId)?.name}`, 'success'))
        .catch(() => addToast('Failed to move room', 'error'));
      return;
    }

    const sourceFloor = floorsRef.current.find((floor) => floor.rooms.some((room) => room.id === activeId));
    resetRoomDragState();
    if (!sourceFloor) return;
    const reordered = reorderRoomsWithinFloor(floorsRef.current, sourceFloor.id, activeId, overId);
    commitFloorsState(reordered);
    saveFloors(reordered).catch(() => addToast('Failed to save room order', 'error'));
  };

  const onFuncDragEnd = ({ active, over }, floorId, roomId) => {
    if (!over || active.id === over.id) return;
    const updated = floorsRef.current.map(f => {
      if (f.id !== floorId) return f;
      return { ...f, rooms: f.rooms.map(r => {
        if (r.id !== roomId) return r;
        const functions = r.functions || [];
        const oi = functions.findIndex(fn => fn.id === active.id);
        const ni = functions.findIndex(fn => fn.id === over.id);
        return { ...r, functions: arrayMove(functions, oi, ni) };
      })};
    });
    commitFloorsState(updated);
    saveFloors(updated).catch(() => addToast('Failed to save function order', 'error'));
  };

  const onSceneDragEnd = ({ active, over }, floorId, roomId) => {
    if (!over || active.id === over.id) return;
    const updated = floorsRef.current.map(f => {
      if (f.id !== floorId) return f;
      return { ...f, rooms: f.rooms.map(r => {
        if (r.id !== roomId) return r;
        const scenes = r.scenes || [];
        const oi = scenes.findIndex(s => s.id === active.id);
        const ni = scenes.findIndex(s => s.id === over.id);
        return { ...r, scenes: arrayMove(scenes, oi, ni) };
      })};
    });
    commitFloorsState(updated);
    saveFloors(updated).catch(() => addToast('Failed to save scene order', 'error'));
  };

  // ── Hue: Lamp modal ──────────────────────────────────────
  const openHueLampModal = async (roomId, floorId) => {
    const floor = floorsRef.current.find((entry) => entry.id === floorId);
    const scope = floor?.isShared ? 'shared' : 'apartment';
    setHueLampModal({ open: true, roomId, floorId, scope }); setHueLampsLoading(true);
    try {
      const res = await getHueLights({ apartmentId: apartment.id, scope });
      if (res.success) setHueLamps(res.lights);
      else addToast('Failed to load Hue lights: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueLampsLoading(false);
  };

    const selectHueLamp = (lamp) => {
      const { roomId, floorId } = hueLampModal;
      const updated = updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: [...(r.functions || []), { id: Date.now().toString(), name: lamp.name, originalHueName: lamp.name, type: 'hue', hueLightId: lamp.id, iconType: 'lightbulb' }]
    }));
    saveFloors(updated).catch(() => addToast('Failed to save Hue lamp', 'error'));
    setHueLampSearch(''); setHueLampModal({ open: false, roomId: null, floorId: null });
    addToast(`Added "${lamp.name}"`, 'success');
  };

  // ── Hue: Room modal ──────────────────────────────────────
  const openHueRoomModal = async (roomId, floorId) => {
    const floor = floorsRef.current.find((entry) => entry.id === floorId);
    const scope = floor?.isShared ? 'shared' : 'apartment';
    setHueRoomModal({ open: true, roomId, floorId, scope }); setHueRoomsLoading(true);
    try {
      const res = await getHueRooms({ apartmentId: apartment.id, scope });
      if (res.success) setHueRooms(res.rooms);
      else addToast('Failed to load Hue rooms: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueRoomsLoading(false);
  };

  const selectHueRoom = async (hueRoom) => {
    const { roomId, floorId, scope = 'apartment' } = hueRoomModal;
    try {
      const res = await linkHueRoom(roomId, hueRoom.id, { apartmentId: apartment.id, scope, hueRoomName: hueRoom.name });
      if (res.success) {
        // Also persist hueApartmentId so the backend knows which bridge owns this Hue room.
        // This is critical for shared-area rooms where multiple bridges exist.
        updateRoom(floorId, roomId, {
          hueRoomId: hueRoom.id,
          hueRoomName: hueRoom.name,
          hueApartmentId: apartment.id,
        });
        addToast(`Linked Hue room "${hueRoom.name}"`, 'success');
      } else addToast('Link failed: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach backend', 'error'); }
    setHueRoomSearch(''); setHueRoomModal({ open: false, roomId: null, floorId: null });
  };

  const handleUnlinkHueRoom = async (roomId, floorId) => {
    const floor = floorsRef.current.find((entry) => entry.id === floorId);
    const scope = floor?.isShared ? 'shared' : 'apartment';
    try {
      await unlinkHueRoom(roomId, { apartmentId: apartment.id, scope });
      updateRoom(floorId, roomId, { hueRoomId: null, hueRoomName: null, hueApartmentId: null });
      addToast('Hue room unlinked', 'success');
    } catch { addToast('Unlink failed', 'error'); }
  };

  // ── Hue: Scene modal ─────────────────────────────────────
  const openHueSceneModal = async (roomId, sceneId) => {
    const floor = floorsRef.current.find((entry) => entry.rooms.some((room) => room.id === roomId));
    const scope = floor?.isShared ? 'shared' : 'apartment';
    setHueSceneModal({ open: true, roomId, sceneId, scope }); setHueScenesLoading(true);
    try {
      await saveFloors();
      const res = await getHueScenes({ apartmentId: apartment.id, scope });
      if (res.success) setHueScenes(res.scenes);
      else addToast('Failed to load Hue scenes: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueScenesLoading(false);
  };

  const selectHueScene = async (hueScene) => {
    const { roomId, sceneId, scope = 'apartment' } = hueSceneModal;
    try {
      const res = await linkHueScene(sceneId, hueScene.id, { apartmentId: apartment.id, scope, hueSceneName: hueScene.name });
      if (res.success) {
        for (const f of floorsRef.current) {
          const room = f.rooms.find(r => r.id === roomId);
          if (room) {
            updateRoom(f.id, roomId, { scenes: (room.scenes || []).map(s => s.id !== sceneId ? s : { ...s, hueSceneId: hueScene.id, hueSceneName: hueScene.name }) });
            break;
          }
        }
        addToast(`Linked Hue scene "${hueScene.name}"`, 'success');
      } else addToast('Link failed: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach backend', 'error'); }
    setHueSceneSearch(''); setHueSceneModal({ open: false, roomId: null, sceneId: null });
  };

  const handleUnlinkHueScene = async (roomId, sceneId) => {
    const floor = floorsRef.current.find((entry) => entry.rooms.some((room) => room.id === roomId));
    const scope = floor?.isShared ? 'shared' : 'apartment';
    try {
      await unlinkHueScene(sceneId, { apartmentId: apartment.id, scope });
      for (const f of floorsRef.current) {
        const room = f.rooms.find(r => r.id === roomId);
        if (room) {
          updateRoom(f.id, roomId, { scenes: (room.scenes || []).map(s => s.id !== sceneId ? s : { ...s, hueSceneId: null, hueSceneName: null }) });
          break;
        }
      }
      addToast('Hue scene unlinked', 'success');
    } catch { addToast('Unlink failed', 'error'); }
  };

  // ── GA modal ─────────────────────────────────────────────
  const openGroupAddressModal = (options) => {
    const floorScope = options.floorId
      ? (floorsRef.current.find((floor) => floor.id === options.floorId)?.isShared ? 'shared' : 'apartment')
      : (activeFloor?.isShared ? 'shared' : 'apartment');
    setGroupAddressModal({
      open: true,
      roomId: options.roomId || null,
      floorId: options.floorId || null,
      title: options.title || 'Select Group Address',
      mode: options.mode || 'any',
      dptFilter: options.dptFilter || null,
      target: options.target || null,
      allowUpload: !!options.allowUpload,
      helperText: options.helperText || '',
      scope: options.scope || floorScope,
      onSelect: options.onSelect || null,
    });
  };
  const closeGroupAddressModal = () => setGroupAddressModal({
    open: false,
    roomId: null,
    floorId: null,
    title: '',
    mode: 'any',
    dptFilter: null,
    target: null,
    allowUpload: false,
    helperText: '',
    scope: 'apartment',
    onSelect: null,
  });

  const importGroupAddresses = async (addresses, fileName) => {
    try {
      setHouseGroupAddressBook(addresses);
      setHouseGroupAddressFileName(fileName);
      await persistConfig(buildNextConfig({
        nextHouseGroupAddressBook: addresses,
        nextHouseGroupAddressFileName: fileName,
      }));
      addToast(`Imported ${addresses.length} group addresses`, 'success'); fetchConfig();
    } catch { addToast('Failed to persist imported group addresses', 'error'); }
  };
  const clearGroupAddresses = async () => {
    try {
      setHouseGroupAddressBook([]);
      setHouseGroupAddressFileName('');
      await persistConfig(buildNextConfig({
        nextHouseGroupAddressBook: [],
        nextHouseGroupAddressFileName: '',
      }));
      addToast('Imported group addresses cleared', 'success'); fetchConfig();
    } catch { addToast('Failed to clear imported group addresses', 'error'); }
  };

  const handleSelectGroupAddress = async (groupAddress) => {
    const { roomId, floorId, target, onSelect } = groupAddressModal;
    if (onSelect) {
      onSelect(groupAddress);
      closeGroupAddressModal();
      return;
    }
    if (target?.kind === 'sharedInfo') {
      const updatedInfos = sharedInfos.map((info) => info.id === target.id
        ? { ...info, statusGroupAddress: groupAddress.address, dpt: groupAddress.dpt || '' }
        : info);
      const saved = await saveSharedInfos(updatedInfos);
      if (saved) addToast(`Selected central GA "${groupAddress.name}"`, 'success');
      closeGroupAddressModal();
      return;
    }
    if (target?.kind === 'alarm') {
      const updatedAlarms = alarms.map((alarm) => alarm.id === target.id
        ? { ...alarm, statusGroupAddress: groupAddress.address, dpt: groupAddress.dpt || '' }
        : alarm);
      const saved = await saveAlarms(updatedAlarms);
      if (saved) addToast(`Selected alarm GA "${groupAddress.name}"`, 'success');
      closeGroupAddressModal();
      return;
    }
    if (!roomId) return;
    if (target?.kind === 'field') {
      let updated = null;
      for (const f of floorsRef.current) {
        const room = f.rooms.find(r => r.id === roomId);
        if (room) {
          updated = updateFloorRooms(f.id, rooms => rooms.map(r => r.id !== roomId ? r : {
            ...r, functions: (r.functions || []).map(fn => fn.id !== target.functionId ? fn : { ...fn, [target.field]: groupAddress.address })
          }));
          break;
        }
      }
      if (updated) {
        try { await saveFloors(updated); } catch { addToast('Failed to save selected group address', 'error'); }
      }
      addToast(`Inserted "${groupAddress.name}"`, 'success'); closeGroupAddressModal(); return;
    }
    if (target?.kind === 'sceneGA') {
      const updated = updateRoom(floorId, roomId, { sceneGroupAddress: groupAddress.address });
      try { await saveFloors(updated); } catch { addToast('Failed to save selected scene GA', 'error'); }
      addToast(`Selected scene GA "${groupAddress.name}"`, 'success'); closeGroupAddressModal(); return;
    }
    if (target?.kind === 'roomTemperatureGA') {
      const updated = updateRoom(floorId, roomId, { roomTemperatureGroupAddress: groupAddress.address });
      try { await saveFloors(updated); } catch { addToast('Failed to save room temperature GA', 'error'); }
      addToast(`Selected room temperature GA "${groupAddress.name}"`, 'success'); closeGroupAddressModal(); return;
    }
    const newFunction = { id: Date.now().toString(), name: groupAddress.name, type: groupAddress.functionType || 'switch', groupAddress: groupAddress.address };
    if (newFunction.type === 'switch') newFunction.iconType = 'lightbulb';
    const updated = updateFloorRooms(floorId, rooms => rooms.map(r => r.id !== roomId ? r : { ...r, functions: [...(r.functions || []), newFunction] }));
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      next.add(roomId);
      return next;
    });
    try { await saveFloors(updated); addToast(`Added "${groupAddress.name}" from ETS`, 'success'); closeGroupAddressModal(); }
    catch { addToast('Failed to add ETS function', 'error'); }
  };

  // ── Render ───────────────────────────────────────────────
  const activeRooms = activeFloor?.rooms || [];
  const roomIds = activeRooms.map(r => r.id);
  const filteredHueLamps = hueLamps.filter(l => l.name.toLowerCase().includes(hueLampSearch.trim().toLowerCase()));
  const filteredHueRooms = hueRooms.filter(r => r.name.toLowerCase().includes(hueRoomSearch.trim().toLowerCase()));
  const filteredHueScenes = hueScenes.filter(s => s.name.toLowerCase().includes(hueSceneSearch.trim().toLowerCase()));
  const resolveApartmentGroupAddressName = (address) => getImportedGroupAddressName(houseGroupAddressBook, address);
  const resolveSharedGroupAddressName = (address) => getImportedGroupAddressName(houseGroupAddressBook, address);
  const resolveGroupAddressNameForFloor = (floorId, address) => {
    const floor = floorsRef.current.find((entry) => entry.id === floorId);
    return floor?.isShared ? resolveSharedGroupAddressName(address) : resolveApartmentGroupAddressName(address);
  };

  return (
    <div className="glass-panel settings-panel">
      <div className="page-hero">
        <div>
          <div className="page-eyebrow">Rooms</div>
          <h2 className="page-title">Apartment Rooms</h2>
          <p className="page-copy">
            Configure floors, rooms, group addresses, and Hue assignments.
          </p>
        </div>
        <div className="page-hero-statuses">
          <button 
            className={`btn-secondary-sm settings-global-toggle ${activeTab === 'globals' ? 'active' : ''}`}
            onClick={() => setActiveTab(activeTab === 'rooms' ? 'globals' : 'rooms')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: activeTab === 'globals' ? 'var(--accent-color)' : '', color: activeTab === 'globals' ? 'white' : '' }}
          >
            <SettingsIcon size={14} />
            {activeTab === 'rooms' ? 'House-wide Info & Alarms' : 'Back to Rooms'}
          </button>
        </div>
      </div>
      
      {activeTab === 'globals' ? (
        <>
          <div className="settings-floors-header">
            <div style={{ padding: '1rem 1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Configure information & alert panel
            </div>
          </div>
          <div style={{ padding: '1.5rem' }}>
            <GlobalsConfig
              apartments={fullConfig.apartments}
              sharedInfos={sharedInfos}
              apartmentAlarms={alarms}
              houseWideInfoReadApartmentId={houseWideInfoReadApartmentId}
              setSharedInfos={setSharedInfos}
              setApartmentAlarms={setAlarms}
              saveSharedInfos={saveSharedInfos}
              saveApartmentAlarms={saveAlarms}
              saveHouseWideInfoReadApartment={saveHouseWideInfoReadApartment}
              openGroupAddressModal={openGroupAddressModal}
              requestConfirm={requestConfirm}
              resolveGroupAddressName={(address, type) => type === 'alarm'
                ? resolveApartmentGroupAddressName(address)
                : resolveSharedGroupAddressName(address)}
            />
          </div>
        </>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={dragCollisionDetection}
          onDragStart={onRoomDragStart}
          onDragMove={onRoomDragMove}
          onDragOver={onRoomDragOver}
          onDragCancel={resetRoomDragState}
          onDragEnd={onRoomDragEnd}
        >
        <>
          <div className="settings-floors-header">
            <FloorTabs
              floors={floors}
              activeFloorId={activeFloor?.id}
              onSelectFloor={setActiveFloorId}
              onReorderFloors={handleReorderFloors}
              onAddButtonClick={openAddAreaModal}
              onDeleteFloor={handleDeleteFloor}
              onRenameFloor={handleRenameFloor}
              addButtonLabel="Add Area"
              roomDragActive={roomDragActive}
              roomDropTargetFloorId={roomDropTargetFloorId}
            />
          </div>
      {/* Rooms list */}
      <div className="settings-rooms-body">
        {activeRooms.length === 0 ? (
          <div className="settings-empty-floor">
            <p>No rooms on <strong>{activeFloor?.name}</strong> yet.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Use the field below to add your first room.</p>
          </div>
        ) : (
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
                  handleUnlinkHueRoom={handleUnlinkHueRoom}
                  handleGenerateBaseScenes={handleGenerateBaseScenes}
                  persistRoomChanges={persistRoomChanges}
                  openHueSceneModal={openHueSceneModal}
                  openHueRoomModal={openHueRoomModal}
                  openHueLampModal={openHueLampModal}
                  openGroupAddressModal={openGroupAddressModal}
                  hueStatus={hueStatus}
                  onFuncDragEnd={onFuncDragEnd}
                  onSceneDragEnd={onSceneDragEnd}
                  sensors={sensors}
                  resolveGroupAddressName={(address) => resolveGroupAddressNameForFloor(activeFloor.id, address)}
                  expanded={expandedRoomIds.has(room.id)}
                  onExpandedChange={(nextExpanded) => {
                    setExpandedRoomIds((prev) => {
                      const next = new Set(prev);
                      if (nextExpanded) next.add(room.id);
                      else next.delete(room.id);
                      return next;
                    });
                  }}
                />
              ))}
            </SortableContext>
        )}
      </div>
      {/* Add Room bar */}
      <div className="settings-add-room-bar">
        <div className="settings-add-room-input-wrap" style={{ flex: 1 }}>
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
      </>
      </DndContext>
      )}

      {roomDragActive && draggedRoom && draggedRoomPointer && createPortal(
        <div
          className="room-drag-overlay-portal"
          style={{
            transform: `translate3d(${draggedRoomPointer.x - draggedRoomAnchorOffset.x}px, ${draggedRoomPointer.y - draggedRoomAnchorOffset.y}px, 0)`,
          }}
        >
          <RoomDragPreview room={draggedRoom} width={draggedRoomWidth} />
        </div>,
        document.body
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
                    <button key={hr.id} className="hue-lamp-item" onClick={() => selectHueRoom(hr)} style={hr.id === '0' ? { border: '1px solid var(--accent-color)', background: 'rgba(59, 130, 246, 0.05)' } : {}}>
                      <Lightbulb size={18} style={{ color: 'var(--accent-color)' }} />
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: hr.id === '0' ? 'var(--accent-color)' : 'inherit' }}>{hr.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {hr.id === '0' ? 'Alle verknüpften Leuchten im System' : `${hr.lights.length} light${hr.lights.length !== 1 ? 's' : ''}`}
                        </div>
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
        addresses={modalAddressBook}
        importedFileName={modalAddressFileName}
        onClose={closeGroupAddressModal}
        onSelect={handleSelectGroupAddress}
        onImport={importGroupAddresses}
        onClear={clearGroupAddresses}
        mode={groupAddressModal.mode}
        dptFilter={groupAddressModal.dptFilter}
        allowUpload={groupAddressModal.allowUpload}
        helperText={groupAddressModal.helperText}
        preferredTopLevelRangeName={apartment?.name || ''}
      />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        danger={confirmDialog.danger}
        onConfirm={() => closeConfirmDialog(true)}
        onCancel={() => closeConfirmDialog(false)}
      />

      {addAreaModalOpen && createPortal(
        <div className="modal-overlay" onClick={closeAddAreaModal}>
          <div className="modal-content settings-add-area-modal" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Add Area</h3>
            <div className="settings-field" style={{ marginBottom: '1rem' }}>
              <label className="settings-field-label">Area Name</label>
              <input
                autoFocus
                className="form-input"
                value={newAreaName}
                onChange={(event) => setNewAreaName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreateArea();
                  if (event.key === 'Escape') closeAddAreaModal();
                }}
                placeholder="e.g. Garden"
              />
            </div>
            <label className="settings-add-area-checkbox">
              <input
                type="checkbox"
                checked={newAreaIsShared}
                onChange={(event) => setNewAreaIsShared(event.target.checked)}
              />
              <span>Shared area for all apartments</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button className="btn-secondary" onClick={closeAddAreaModal}>Cancel</button>
              <button className="btn-primary" onClick={handleCreateArea} disabled={!newAreaName.trim()}>
                <Plus size={16} /> Create Area
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
