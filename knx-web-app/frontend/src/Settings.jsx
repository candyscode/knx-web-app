import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { updateConfig, discoverHueBridge, pairHueBridge, unpairHueBridge, getHueLights } from './configApi';
import { 
  Plus, Trash2, Save, ArrowUp, ArrowDown, ChevronDown, HelpCircle, Sparkles, GripVertical,
  Lightbulb, Lock
} from 'lucide-react';

const ICON_OPTIONS = [
  { value: 'lightbulb', label: 'Lamp', Icon: Lightbulb },
  { value: 'lock',      label: 'Lock', Icon: Lock },
];
const TYPE_OPTIONS = [
  { value: 'scene',      label: 'Scene',  dpt: 'DPT 17.001' },
  { value: 'switch',     label: 'Switch', dpt: 'DPT 1.001'  },
  { value: 'percentage', label: 'Blind',  dpt: 'DPT 5.001'  },
];

const GA_TOOLTIPS = {
  action:   'The group address this function writes to on the KNX bus. A command is sent here when the function is triggered.',
  scene:    'Scene number to activate (1–64). The bus value is automatically offset by −1 as required by KNX.',
  sceneGA:  'The group address for scene control in this room. All room scenes share this single GA (DPT 17.001).',
  feedback: 'Status group address — the actuator reports its current state here. Used to keep the UI in sync.',
  moving:   'Group address the actuator uses to signal movement (1 = moving, 0 = stopped). Enables precise wall-switch detection.',
};

// Custom Type dropdown with DPT shown inside each option
function TypeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = TYPE_OPTIONS.find(o => o.value === value) || TYPE_OPTIONS[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="type-select" ref={ref}>
      <div className="type-select-trigger" onClick={() => setOpen(o => !o)}>
        <div className="type-select-info">
          <span className="type-select-name">{current.label}</span>
          <span className="type-select-dpt">{current.dpt}</span>
        </div>
        <ChevronDown size={14} className={`type-select-chevron ${open ? 'open' : ''}`} />
      </div>
      {open && (
        <div className="type-select-dropdown">
          {TYPE_OPTIONS.map(opt => (
            <div
              key={opt.value}
              className={`type-select-option ${opt.value === value ? 'active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span className="type-select-name">{opt.label}</span>
              <span className="type-select-dpt">{opt.dpt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Custom Icon dropdown showing exactly how icons will look
function IconSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = ICON_OPTIONS.find(o => o.value === value) || ICON_OPTIONS[0];
  const CurrentIcon = current.Icon;

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="type-select" ref={ref} style={{ flex: 1, minWidth: '120px' }}>
      <div className="type-select-trigger" onClick={() => setOpen(o => !o)} style={{ padding: '0.4rem 0.6rem', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
        <CurrentIcon size={18} color="var(--accent-color)" />
        <span className="type-select-name" style={{ flex: 1 }}>{current.label}</span>
        <ChevronDown size={14} className={`type-select-chevron ${open ? 'open' : ''}`} style={{ marginLeft: 'auto' }} />
      </div>
      {open && (
        <div className="type-select-dropdown" style={{ zIndex: 100 }}>
          {ICON_OPTIONS.map(opt => {
            const OptIcon = opt.Icon;
            return (
              <div
                key={opt.value}
                className={`type-select-option ${opt.value === value ? 'active' : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{ padding: '0.5rem 0.6rem', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}
              >
                <OptIcon size={18} color={opt.value === value ? '#fff' : 'var(--accent-color)'} />
                <span className="type-select-name">{opt.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Labeled input with optional badge + ? tooltip
function GAField({ label, tooltipKey, optional, value, onChange, placeholder, type = 'text', min, max }) {
  return (
    <div className="settings-field ga-field">
      <label className="settings-field-label">
        {label}
        {optional && <span className="badge-optional">Optional</span>}
        {tooltipKey && GA_TOOLTIPS[tooltipKey] && (
          <span className="ga-tooltip-wrap">
            <HelpCircle size={11} className="ga-tooltip-icon" />
            <span className="ga-tooltip-bubble">{GA_TOOLTIPS[tooltipKey]}</span>
          </span>
        )}
      </label>
      <input
        className="form-input"
        value={value || ''}
        onChange={e => onChange(type === 'number' ? parseInt(e.target.value) : e.target.value)}
        placeholder={placeholder}
        type={type}
        min={min}
        max={max}
      />
    </div>
  );
}

export default function Settings({ config, fetchConfig, addToast, hueStatus, setHueStatus }) {
  const [ip, setIp] = useState(config.knxIp || '');
  const [port, setPort] = useState(config.knxPort || 3671);
  const [rooms, setRooms] = useState(() => migrateRooms(config.rooms || []));
  const [newRoomName, setNewRoomName] = useState('');

  // Hue wizard state
  const [hueStep, setHueStep] = useState('idle'); // idle | discovering | found | waiting | pairing | paired
  const [hueBridgeIp, setHueBridgeIp] = useState(config.hue?.bridgeIp || '');
  const [hueError, setHueError] = useState('');

  // Hue lamp selection modal
  const [hueLampModal, setHueLampModal] = useState({ open: false, roomId: null });
  const [hueLamps, setHueLamps] = useState([]);
  const [hueLampsLoading, setHueLampsLoading] = useState(false);
  const [dragState, setDragState] = useState(null);

  useEffect(() => {
    const clearDragState = () => setDragState(null);
    window.addEventListener('pointerup', clearDragState);
    window.addEventListener('pointercancel', clearDragState);
    return () => {
      window.removeEventListener('pointerup', clearDragState);
      window.removeEventListener('pointercancel', clearDragState);
    };
  }, []);

  // Hue wizard handlers
  const handleHueDiscover = async () => {
    setHueStep('discovering');
    setHueError('');
    try {
      const res = await discoverHueBridge();
      if (res.success && res.bridges.length > 0) {
        setHueBridgeIp(res.bridges[0].internalipaddress);
        setHueStep('found');
      } else {
        setHueError('No Hue Bridge found on your network.');
        setHueStep('idle');
      }
    } catch {
      setHueError('Discovery failed. Is the backend running?');
      setHueStep('idle');
    }
  };

  const handleHuePair = async () => {
    setHueStep('pairing');
    setHueError('');
    try {
      const res = await pairHueBridge(hueBridgeIp);
      if (res.success) {
        setHueStep('paired');
        setHueStatus({ paired: true, bridgeIp: hueBridgeIp });
        addToast('Hue Bridge paired successfully!', 'success');
        fetchConfig();
      } else {
        setHueError(res.error || 'Pairing failed.');
        setHueStep('found');
      }
    } catch {
      setHueError('Pairing request failed.');
      setHueStep('found');
    }
  };

  const handleHueUnpair = async () => {
    try {
      await unpairHueBridge();
      setHueStatus({ paired: false, bridgeIp: '' });
      setHueBridgeIp('');
      setHueStep('idle');
      addToast('Hue Bridge unpaired', 'success');
      fetchConfig();
    } catch {
      addToast('Failed to unpair', 'error');
    }
  };

  // Hue lamp modal handlers
  const openHueLampModal = async (roomId) => {
    setHueLampModal({ open: true, roomId });
    setHueLampsLoading(true);
    try {
      const res = await getHueLights();
      if (res.success) {
        setHueLamps(res.lights);
      } else {
        addToast('Failed to load Hue lights: ' + (res.error || ''), 'error');
      }
    } catch {
      addToast('Could not reach Hue Bridge', 'error');
    }
    setHueLampsLoading(false);
  };

  const selectHueLamp = (lamp) => {
    const roomId = hueLampModal.roomId;
    const updated = rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: [...r.functions, {
        id: Date.now().toString(),
        name: lamp.name,
        originalHueName: lamp.name,
        type: 'hue',
        hueLightId: lamp.id,
        iconType: 'lightbulb',
      }]
    });
    setRooms(updated);
    setHueLampModal({ open: false, roomId: null });
    addToast(`Added "${lamp.name}"`, 'success');
  };

  // One-time migration: move scene-type functions into room.scenes[]
  function migrateRooms(inputRooms) {
    return inputRooms.map(room => {
      // Already migrated or no functions
      if (room.scenes !== undefined) return room;

      const sceneFuncs = (room.functions || []).filter(f => f.type === 'scene');
      const otherFuncs = (room.functions || []).filter(f => f.type !== 'scene');

      if (sceneFuncs.length === 0) {
        return { ...room, sceneGroupAddress: '', scenes: [] };
      }

      // Find the most commonly used GA among scene functions
      const gaCounts = {};
      sceneFuncs.forEach(f => { gaCounts[f.groupAddress] = (gaCounts[f.groupAddress] || 0) + 1; });
      const primaryGA = Object.entries(gaCounts).sort((a, b) => b[1] - a[1])[0][0];

      // Scenes with the primary GA become room scenes
      const roomScenes = sceneFuncs
        .filter(f => f.groupAddress === primaryGA)
        .map(f => ({ id: f.id, name: f.name, sceneNumber: f.sceneNumber || 1, category: 'light' }));

      // Scenes with a different GA stay as standalone functions
      const standaloneFuncs = sceneFuncs.filter(f => f.groupAddress !== primaryGA);

      return {
        ...room,
        sceneGroupAddress: primaryGA,
        scenes: roomScenes,
        functions: [...standaloneFuncs, ...otherFuncs],
      };
    });
  }

  const handleSaveIp = async () => {
    try { await updateConfig({ knxIp: ip, knxPort: port }); addToast('Connection settings saved', 'success'); fetchConfig(); }
    catch { addToast('Failed to save settings', 'error'); }
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    const newRoom = { id: Date.now().toString(), name: newRoomName, sceneGroupAddress: '', scenes: [], functions: [] };
    const updated = [...rooms, newRoom];
    try { await updateConfig({ rooms: updated }); setRooms(updated); setNewRoomName(''); addToast('Room added', 'success'); fetchConfig(); }
    catch { addToast('Failed to add room', 'error'); }
  };

  const handleDeleteRoom = async (id) => {
    const updated = rooms.filter(r => r.id !== id);
    try { await updateConfig({ rooms: updated }); setRooms(updated); addToast('Room deleted', 'success'); fetchConfig(); }
    catch { addToast('Failed to delete room', 'error'); }
  };

  // --- Room scenes ---
  const moveItem = (items, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
    const nextItems = [...items];
    const [movedItem] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedItem);
    return nextItems;
  };

  const reorderCategoryItems = (items, category, draggedId, targetId) => {
    const categoryItems = items.filter(item => (item.category || 'light') === category);
    const fromIndex = categoryItems.findIndex(item => item.id === draggedId);
    const toIndex = categoryItems.findIndex(item => item.id === targetId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;

    const reorderedCategoryItems = moveItem(categoryItems, fromIndex, toIndex);
    let categoryIndex = 0;

    return items.map(item => (
      (item.category || 'light') === category ? reorderedCategoryItems[categoryIndex++] : item
    ));
  };

  const updateRoom = (roomId, patch) => {
    setRooms(prevRooms => prevRooms.map(r => r.id !== roomId ? r : { ...r, ...patch }));
  };

  const handleAddScene = (roomId, category = 'light') => {
    const room = rooms.find(r => r.id === roomId);
    const usedNumbers = (room.scenes || []).map(s => s.sceneNumber);
    let nextNum = 1;
    while (usedNumbers.includes(nextNum) && nextNum <= 64) nextNum++;
    updateRoom(roomId, {
      scenes: [...(room.scenes || []), { id: Date.now().toString(), name: '', sceneNumber: nextNum, category }]
    });
  };

  const handleDeleteScene = (roomId, sceneId) => {
    const room = rooms.find(r => r.id === roomId);
    updateRoom(roomId, { scenes: room.scenes.filter(s => s.id !== sceneId) });
  };

  const handleUpdateScene = (roomId, sceneId, key, val) => {
    const room = rooms.find(r => r.id === roomId);
    updateRoom(roomId, {
      scenes: room.scenes.map(s => s.id !== sceneId ? s : { ...s, [key]: val })
    });
  };

  const startSceneDrag = (roomId, category, sceneId) => {
    setDragState({ type: 'scene', roomId, category, itemId: sceneId });
  };

  const handleSceneDragEnter = (roomId, category, targetSceneId) => {
    if (!dragState || dragState.type !== 'scene') return;
    if (dragState.roomId !== roomId || dragState.category !== category || dragState.itemId === targetSceneId) return;

    setRooms(prevRooms => prevRooms.map(room => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        scenes: reorderCategoryItems(room.scenes || [], category, dragState.itemId, targetSceneId),
      };
    }));

    setDragState(prev => prev ? { ...prev, itemId: targetSceneId } : prev);
  };

  const handleGenerateBaseScenes = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    const existing = room.scenes || [];
    const usedNumbers = existing.map(s => s.sceneNumber);
    const toAdd = [];
    if (!usedNumbers.includes(1)) toAdd.push({ id: Date.now().toString() + '_1', name: 'Off', sceneNumber: 1, category: 'light' });
    if (!usedNumbers.includes(2)) toAdd.push({ id: Date.now().toString() + '_2', name: 'Bright', sceneNumber: 2, category: 'light' });
    if (!usedNumbers.includes(3)) toAdd.push({ id: Date.now().toString() + '_3', name: 'Shades Up', sceneNumber: 3, category: 'shade' });
    if (!usedNumbers.includes(4)) toAdd.push({ id: Date.now().toString() + '_4', name: 'Shades Down', sceneNumber: 4, category: 'shade' });
    if (toAdd.length === 0) {
      addToast('Base scene numbers 1-4 already exist', 'success');
      return;
    }
    updateRoom(roomId, { scenes: [...existing, ...toAdd] });
    addToast(`Added ${toAdd.map(s => s.name).join(' & ')}`, 'success');
  };

  // --- Functions ---
  const handleAddFunction = async (roomId) => {
    const updated = rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: [...r.functions, { id: Date.now().toString(), name: '', type: 'switch', groupAddress: '' }]
    });
    try { await updateConfig({ rooms: updated }); setRooms(updated); fetchConfig(); }
    catch { addToast('Failed to add function', 'error'); }
  };

  const handleUpdateFunction = (roomId, funcId, key, val) => {
    setRooms(rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: r.functions.map(f => f.id !== funcId ? f : { ...f, [key]: val })
    }));
  };

  const handleSaveRooms = async () => {
    try { await updateConfig({ rooms }); addToast('Settings saved', 'success'); fetchConfig(); }
    catch { addToast('Failed to save', 'error'); }
  };

  const handleDeleteFunction = async (roomId, funcId) => {
    const updated = rooms.map(r => r.id !== roomId ? r : { ...r, functions: r.functions.filter(f => f.id !== funcId) });
    setRooms(updated);
    try { await updateConfig({ rooms: updated }); fetchConfig(); }
    catch { addToast('Failed to delete function', 'error'); }
  };

  const moveRoom = (i, dir) => {
    const r = [...rooms];
    if (dir === 'up' && i > 0) [r[i-1], r[i]] = [r[i], r[i-1]];
    if (dir === 'down' && i < r.length-1) [r[i+1], r[i]] = [r[i], r[i+1]];
    setRooms(r);
  };

  const startFunctionDrag = (roomId, funcId) => {
    setDragState({ type: 'function', roomId, itemId: funcId });
  };

  const handleFunctionDragEnter = (roomId, targetFuncId) => {
    if (!dragState || dragState.type !== 'function') return;
    if (dragState.roomId !== roomId || dragState.itemId === targetFuncId) return;

    setRooms(prevRooms => prevRooms.map(room => {
      if (room.id !== roomId) return room;
      const fromIndex = room.functions.findIndex(func => func.id === dragState.itemId);
      const toIndex = room.functions.findIndex(func => func.id === targetFuncId);
      return {
        ...room,
        functions: moveItem(room.functions, fromIndex, toIndex),
      };
    }));

    setDragState(prev => prev ? { ...prev, itemId: targetFuncId } : prev);
  };

  const upd = (roomId, funcId, key) => (val) => handleUpdateFunction(roomId, funcId, key, val);

  return (
    <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* Connection */}
      <div className="settings-section" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
        <h2>KNX Interface</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          IP address and port of your KNX IP interface.
        </p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="settings-field" style={{ width: '220px' }}>
            <label className="settings-field-label">IP Address</label>
            <input className="form-input" placeholder="192.168.1.50" value={ip} onChange={e => setIp(e.target.value)} />
          </div>
          <div className="settings-field" style={{ width: '100px' }}>
            <label className="settings-field-label">Port</label>
            <input className="form-input" type="number" placeholder="3671" value={port} onChange={e => setPort(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={handleSaveIp} style={{ marginBottom: '1px' }}>
            <Save size={16} /> Save
          </button>
        </div>
      </div>

      {/* Philips Hue */}
      <div className="settings-section">
        <h2>Philips Hue</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Connect your Hue Bridge to control Hue lights alongside KNX.
        </p>

        {hueStatus.paired ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success-color)' }}></div>
              <span style={{ color: 'var(--success-color)', fontWeight: 600, fontSize: '0.85rem' }}>Paired</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>({hueStatus.bridgeIp})</span>
            </div>
            <button className="btn-danger" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} onClick={handleHueUnpair}>Unpair</button>
          </div>
        ) : (
          <div>
            {hueStep === 'idle' && (
              <div>
                <button className="btn-primary" onClick={handleHueDiscover}>
                  <Sparkles size={14} /> Discover Bridge
                </button>
                
                <div style={{ marginTop: '1.25rem' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    Or enter IP manually if discovery fails:
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      className="form-input" 
                      style={{ width: '180px' }}
                      placeholder="e.g. 192.168.1.100" 
                      value={hueBridgeIp} 
                      onChange={e => setHueBridgeIp(e.target.value)}
                    />
                    <button 
                      className="btn-primary" 
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                      onClick={() => {
                        if(hueBridgeIp) { 
                          setHueError(''); 
                          setHueStep('found'); 
                        }
                      }}
                    >
                      Use IP
                    </button>
                  </div>
                </div>
              </div>
            )}

            {hueStep === 'discovering' && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Searching for Hue Bridges on your network…</div>
            )}

            {hueStep === 'found' && (
              <div>
                <p style={{ color: 'var(--text-primary)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  Bridge found at <strong>{hueBridgeIp}</strong>
                </p>
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
                    👉 Press the <strong>Link button</strong> on your Hue Bridge, then click <strong>Pair</strong> within 30 seconds.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn-primary" onClick={handleHuePair} style={{ background: 'var(--success-color)' }}>Pair</button>
                  <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)' }} onClick={() => setHueStep('idle')}>Cancel</button>
                </div>
              </div>
            )}

            {hueStep === 'pairing' && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Pairing…</div>
            )}

            {hueError && (
              <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.75rem' }}>{hueError}</div>
            )}
          </div>
        )}
      </div>

      {/* Rooms */}
      <div className="settings-section">
        <h2>Rooms &amp; Functions</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Group your KNX devices into rooms and configure their functions.
        </p>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div className="settings-field" style={{ width: '260px' }}>
            <label className="settings-field-label">New Room</label>
            <input className="form-input" placeholder="e.g. Living Room" value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateRoom()} />
          </div>
          <button className="btn-primary" onClick={handleCreateRoom} style={{ marginBottom: '1px' }}>
            <Plus size={16} /> Add Room
          </button>
        </div>

        <div className="item-list">
          {rooms.map((room, ri) => (
            <div key={room.id} className="room-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>

              {/* Room header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <h3 style={{ margin: 0 }}>{room.name}</h3>
                  <button className="sort-btn" onClick={() => moveRoom(ri, 'up')} disabled={ri === 0} title="Move up"><ArrowUp size={13}/></button>
                  <button className="sort-btn" onClick={() => moveRoom(ri, 'down')} disabled={ri === rooms.length-1} title="Move down"><ArrowDown size={13}/></button>
                </div>
                <button className="icon-btn danger compact" onClick={() => handleDeleteRoom(room.id)} title="Delete room" aria-label={`Delete room ${room.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>

              {/* ═══ ROOM SCENES ═══ */}
              <div className="room-scenes-settings">
                <h4 className="section-label">Room Scenes</h4>
                <p className="section-subtitle">
                  Define lighting scenes for this room. All scenes share a single group address.
                </p>

                {/* Scene GA */}
                <div style={{ marginBottom: '1rem', maxWidth: '260px' }}>
                  <GAField label="Scene GA" tooltipKey="sceneGA"
                    value={room.sceneGroupAddress}
                    onChange={(val) => updateRoom(room.id, { sceneGroupAddress: val })}
                    placeholder="e.g. 2/5/0" />
                </div>

                {/* Scene list */}
                {(() => {
                  const lightScenes = (room.scenes || []).filter(s => (s.category || 'light') === 'light');
                  const shadeScenes = (room.scenes || []).filter(s => s.category === 'shade');
                  
                  const renderSceneRow = (sc, categoryStr) => (
                    <div
                      key={sc.id}
                      className={`scene-row ${dragState?.type === 'scene' && dragState.itemId === sc.id ? 'is-dragging' : ''}`}
                      onPointerEnter={() => handleSceneDragEnter(room.id, categoryStr, sc.id)}
                      onPointerUp={() => setDragState(null)}
                    >
                      <button
                        className="drag-handle"
                        type="button"
                        onPointerDown={() => startSceneDrag(room.id, categoryStr, sc.id)}
                        title="Drag to reorder scene"
                        aria-label={`Reorder scene ${sc.name || sc.sceneNumber || ''}`}
                      >
                        <GripVertical size={14} />
                      </button>
                      <span className="scene-number-label">#</span>
                      <input
                        className="form-input scene-number-input"
                        type="number"
                        min="1"
                        max="64"
                        value={sc.sceneNumber === undefined ? '' : sc.sceneNumber}
                        onChange={e => handleUpdateScene(room.id, sc.id, 'sceneNumber', e.target.value === '' ? undefined : parseInt(e.target.value))}
                        title="Scene number (1–64)"
                      />
                      <input
                        className="form-input"
                        value={sc.name}
                        onChange={e => handleUpdateScene(room.id, sc.id, 'name', e.target.value)}
                        placeholder="Scene name"
                      />
                      <button className="icon-btn danger compact"
                        onClick={() => handleDeleteScene(room.id, sc.id)} title="Delete scene">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                  
                  return (
                    <>
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div className="scene-section-header">
                          <h5 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Light Scenes</h5>
                          <button className="btn-primary compact-secondary-btn" onClick={() => handleAddScene(room.id, 'light')}>
                            <Plus size={13} /> Add Light Scene
                          </button>
                        </div>
                        {lightScenes.length > 0 ? (
                          <div className="scene-list">
                            {lightScenes.map((sc) => renderSceneRow(sc, 'light'))}
                          </div>
                        ) : (
                          <p className="empty-inline-hint">No light scenes configured.</p>
                        )}
                      </div>

                      <div style={{ marginBottom: '1.5rem' }}>
                        <div className="scene-section-header">
                          <h5 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Shade Scenes</h5>
                          <button className="btn-primary compact-secondary-btn" onClick={() => handleAddScene(room.id, 'shade')}>
                            <Plus size={13} /> Add Shade Scene
                          </button>
                        </div>
                        {shadeScenes.length > 0 ? (
                          <div className="scene-list">
                            {shadeScenes.map((sc) => renderSceneRow(sc, 'shade'))}
                          </div>
                        ) : (
                          <p className="empty-inline-hint">No shade scenes configured.</p>
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Scene actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', background: 'rgba(124, 58, 237, 0.3)', borderColor: 'rgba(124, 58, 237, 0.5)' }}
                    onClick={() => handleGenerateBaseScenes(room.id)}>
                    <Sparkles size={13} /> Generate Base Scenes
                  </button>
                </div>
              </div>

              {/* ═══ ADDITIONAL FUNCTIONS ═══ */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.25rem', borderRadius: '10px', marginTop: '1rem' }}>
                <h4 className="section-label">Additional Functions</h4>
                <p className="section-subtitle">
                  Standalone scenes, switches, blinds, and other KNX functions.
                </p>

                {room.functions.map((func) => {
                  const info = TYPE_OPTIONS.find(o => o.value === func.type) || TYPE_OPTIONS[0];
                  const isHue = func.type === 'hue';
                  return (
                    <div
                      key={func.id}
                      className={`function-card ${isHue ? 'hue-card' : ''} ${dragState?.type === 'function' && dragState.itemId === func.id ? 'is-dragging' : ''}`}
                      onPointerEnter={() => handleFunctionDragEnter(room.id, func.id)}
                      onPointerUp={() => setDragState(null)}
                    >
                      <div className="function-layout" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>

                        <div className="func-sort">
                          <button
                            className="drag-handle"
                            type="button"
                            onPointerDown={() => startFunctionDrag(room.id, func.id)}
                            title="Drag to reorder function"
                            aria-label={`Reorder function ${func.name || info.label}`}
                          >
                            <GripVertical size={14} />
                          </button>
                        </div>
                        
                        {isHue ? (
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(167, 139, 250, 0.2)', color: '#c4b5fd', padding: '0.15rem 0.4rem', borderRadius: '4px', letterSpacing: '0.05em' }}>HUE</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Original: <strong>{func.originalHueName || func.name}</strong>
                              </span>
                            </div>
                            <div className="settings-field" style={{ marginBottom: 0 }}>
                              <input className="form-input" style={{ width: 'min(100%, 300px)' }} value={func.name}
                                onChange={e => handleUpdateFunction(room.id, func.id, 'name', e.target.value)}
                                placeholder="e.g. Living Room Spot" />
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* LEFT: Name + Type for KNX */}
                            <div className="func-left-col">
                              <div className="settings-field">
                                <label className="settings-field-label">Name</label>
                                <input className="form-input" value={func.name}
                                  onChange={e => handleUpdateFunction(room.id, func.id, 'name', e.target.value)}
                                  placeholder="e.g. Lock Door" />
                              </div>
                              <div className="settings-field" style={{ marginTop: '0.6rem' }}>
                                <label className="settings-field-label">Type</label>
                                <TypeSelect value={func.type} onChange={upd(room.id, func.id, 'type')} />
                              </div>
                            </div>

                            {/* RIGHT: KNX Group Addresses */}
                            <div className="func-right-col">
                              <GAField label="Action GA" tooltipKey="action"
                                value={func.groupAddress}
                                onChange={upd(room.id, func.id, 'groupAddress')}
                                placeholder="e.g. 1/5/0" />

                              {func.type === 'scene' && (
                                <GAField label="Scene Number" tooltipKey="scene"
                                  value={func.sceneNumber}
                                  onChange={upd(room.id, func.id, 'sceneNumber')}
                                  placeholder="1–64" type="number" min={1} max={64} />
                              )}

                              {(func.type === 'switch' || func.type === 'percentage') && (
                                <GAField label="Feedback GA" tooltipKey="feedback"
                                  value={func.statusGroupAddress}
                                  onChange={upd(room.id, func.id, 'statusGroupAddress')}
                                  placeholder="e.g. 1/5/1" />
                              )}

                              {func.type === 'switch' && (
                                <div className="settings-field" style={{ marginTop: '0.6rem' }}>
                                  <label className="settings-field-label" style={{ display: 'block', marginBottom: '0.2rem' }}>Icon</label>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <IconSelect value={func.iconType || 'lightbulb'} onChange={upd(room.id, func.id, 'iconType')} />
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      <input 
                                        type="checkbox" 
                                        checked={!!func.invertIcon} 
                                        onChange={(e) => upd(room.id, func.id, 'invertIcon')(e.target.checked)} 
                                      />
                                      Invert Icons
                                    </label>
                                  </div>
                                </div>
                              )}

                              {func.type === 'percentage' && (
                                <GAField label="Moving GA" tooltipKey="moving" optional
                                  value={func.movingGroupAddress}
                                  onChange={upd(room.id, func.id, 'movingGroupAddress')}
                                  placeholder="e.g. 1/5/2" />
                              )}
                            </div>
                          </>
                        )}

                        {/* Delete button (for ALL types, including Hue) - vertically centered and pushed to the right */}
                        <div className="func-delete" style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', alignSelf: 'stretch', paddingLeft: '1rem' }}>
                          <button className="icon-btn danger compact"
                            onClick={() => handleDeleteFunction(room.id, func.id)} title="Delete function">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {room.functions.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                    No additional functions configured.
                  </p>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                    onClick={() => handleAddFunction(room.id)}>
                    <Plus size={14} /> Add Function
                  </button>
                  {hueStatus.paired && (
                    <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                      onClick={() => openHueLampModal(room.id)}>
                      <Lightbulb size={14} /> Add Hue Lamp
                    </button>
                  )}
                </div>
              </div>

              {/* Save button for the whole room */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button className="btn-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem', background: 'var(--success-color)' }}
                  onClick={handleSaveRooms}>
                  <Save size={14} /> Save All Changes
                </button>
              </div>

            </div>
          ))}
          {rooms.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No rooms added yet.</p>
          )}
        </div>
      </div>

      {/* Hue Lamp Selection Modal */}
      {hueLampModal.open && createPortal(
        <div className="modal-overlay" onClick={() => setHueLampModal({ open: false, roomId: null })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Select Hue Lamp</h3>

            {hueLampsLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading lamps…</p>
            ) : hueLamps.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No Hue lights found.</p>
            ) : (
              <div className="hue-lamp-list">
                {hueLamps.map(lamp => (
                  <button key={lamp.id} className="hue-lamp-item" onClick={() => selectHueLamp(lamp)}>
                    <Lightbulb size={18} style={{ color: lamp.on ? 'var(--success-color)' : 'var(--text-secondary)', flexShrink: 0 }} fill={lamp.on ? 'currentColor' : 'none'} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{lamp.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {lamp.type} · {lamp.reachable ? 'Reachable' : 'Unreachable'}
                      </div>
                    </div>
                    <Plus size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}

            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => setHueLampModal({ open: false, roomId: null })}>
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
