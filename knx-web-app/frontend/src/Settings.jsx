import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  TouchSensor, useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { updateConfig, discoverHueBridge, pairHueBridge, unpairHueBridge, getHueLights, getHueRooms, getHueScenes, linkHueRoom, unlinkHueRoom, linkHueScene, unlinkHueScene, loadDevConfig } from './configApi';
import { KNXGroupAddressModal } from './components/KNXGroupAddressModal';
import { getDropdownPosition, getSelectOption } from './iconSelectUtils';
import {
  Plus, Trash2, Save, ChevronDown, HelpCircle, Sparkles,
  Lightbulb, Lock, GripVertical, Search, FileText
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
  action:   'The group address this function writes to on the KNX bus.',
  scene:    'Scene number to activate (1–64). The bus value is automatically offset by −1.',
  sceneGA:  'The group address for scene control. All room scenes share this single GA (DPT 17.001).',
  feedback: 'Status group address — the actuator reports its current state here.',
  moving:   'Group address the actuator uses to signal movement (1 = moving, 0 = stopped).',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function TypeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = TYPE_OPTIONS.find(o => o.value === value) || TYPE_OPTIONS[0];
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
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
            <div key={opt.value} className={`type-select-option ${opt.value === value ? 'active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}>
              <span className="type-select-name">{opt.label}</span>
              <span className="type-select-dpt">{opt.dpt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const current = getSelectOption(ICON_OPTIONS, value);
  const CurrentIcon = current.Icon;

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setDropdownStyle(null);
  }, []);

  const updateDropdownStyle = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${Math.max(rect.width, 168)}px`,
      zIndex: 2000
    });
  }, []);

  useEffect(() => {
    const h = (e) => { 
      // Close if click is outside both the button AND the portal dropdown
      const isOutsideTrigger = ref.current && !ref.current.contains(e.target);
      const isOutsideDropdown = !dropdownRef.current || !dropdownRef.current.contains(e.target);
      
      if (isOutsideTrigger && isOutsideDropdown) {
        closeDropdown(); 
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [closeDropdown]);

  useLayoutEffect(() => {
    if (open) updateDropdownStyle();
  }, [open, updateDropdownStyle]);

  useEffect(() => {
    if (!open) return undefined;
    const handleViewportChange = () => updateDropdownStyle();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updateDropdownStyle]);

  return (
    <div className="type-select icon-select" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className="type-select-trigger icon-select-trigger"
        onClick={() => {
          if (open) closeDropdown();
          else setOpen(true);
        }}
      >
        <CurrentIcon size={18} className="icon-select-icon" />
        <span className="type-select-name icon-select-name">{current.label}</span>
        <ChevronDown size={14} className={`type-select-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="type-select-dropdown"
          style={dropdownStyle || { display: 'none' }}
        >
          {ICON_OPTIONS.map(opt => {
            const OptIcon = opt.Icon;
            return (
              <button
                type="button"
                key={opt.value}
                className={`type-select-option icon-select-option ${opt.value === value ? 'active' : ''}`}
                onClick={() => { onChange(opt.value); closeDropdown(); }}
              >
                <OptIcon size={18} className="icon-select-icon" />
                <span className="type-select-name icon-select-name">{opt.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

function GAField({ label, tooltipKey, optional, value, onChange, placeholder, type = 'text', min, max, onBrowse, browseLabel = 'Search imported addresses' }) {
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
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          className="form-input"
          value={value || ''}
          onChange={e => onChange(type === 'number' ? parseInt(e.target.value) : e.target.value)}
          placeholder={placeholder}
          type={type}
          min={min}
          max={max}
        />
        {onBrowse && type !== 'number' && (
          <button
            type="button"
            className="btn-secondary-sm"
            onClick={onBrowse}
            aria-label={browseLabel}
            title={browseLabel}
          >
            <Search size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sortable Scene Row ────────────────────────────────────────────────────────

function SortableSceneRow({ sc, roomId, handleUpdateScene, handleDeleteScene, hueStatus, openHueSceneModal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sc.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const isLight = (sc.category || 'light') === 'light';
  const sceneName = (sc.name || '').trim();
  const isHueOffScene = /^(aus|off)$/i.test(sceneName);

  return (
    <div ref={setNodeRef} style={style} className="scene-row">
      <span className="drag-handle scene-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
        <GripVertical size={16} />
      </span>
      <div className="scene-row-fields">
        <div className="scene-field">
          <label className="scene-field-label">Name</label>
          <input
            className="form-input"
            value={sc.name}
            onChange={e => handleUpdateScene(roomId, sc.id, 'name', e.target.value)}
            placeholder="e.g. Off"
          />
        </div>
        <div className="scene-field">
          <label className="scene-field-label">Scene #</label>
          <input
            className="form-input scene-number-input"
            type="number" min="1" max="64"
            value={sc.sceneNumber === undefined ? '' : sc.sceneNumber}
            onChange={e => handleUpdateScene(roomId, sc.id, 'sceneNumber', e.target.value === '' ? undefined : parseInt(e.target.value))}
            placeholder="1–64"
          />
        </div>
      </div>
      {/* Hue scene link — only for light scenes when bridge is paired */}
      {hueStatus && hueStatus.paired && isLight ? (
        <div className="scene-field scene-field--hue">
          {sc.hueSceneId ? (
            <div className="hue-linked-badge" title={`Linked: ${sc.hueSceneId}`}>
              <Lightbulb size={12} />
              <span className="hue-linked-label">{sc.hueSceneName || sc.hueSceneId}</span>
              <button
                className="hue-unlink-btn"
                title="Unlink Hue scene"
                onClick={() => handleUpdateScene(roomId, sc.id, '_unlinkHue', true)}
              >×</button>
            </div>
          ) : isHueOffScene ? (
            <span className="hue-off-label">This scene will turn off the hue room.</span>
          ) : (
            <button
              className="btn-secondary-sm btn-purple-sm scene-hue-link-btn"
              onClick={() => openHueSceneModal(roomId, sc.id)}
              title="Link a Hue scene"
            >
              <Lightbulb size={11} /> Link Hue
            </button>
          )}
        </div>
      ) : null}
      <button className="btn-danger icon-btn scene-delete-btn" onClick={() => handleDeleteScene(roomId, sc.id)} title="Delete scene">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── Sortable Function Card ────────────────────────────────────────────────────

function SortableFunctionCard({ func, room, handleUpdateFunction, handleDeleteFunction, hueStatus, openGroupAddressModal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: func.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const isHue = func.type === 'hue';
  const upd = (key) => (val) => handleUpdateFunction(room.id, func.id, key, val);

  return (
    <div ref={setNodeRef} style={style} className={`function-card ${isHue ? 'hue-card' : ''}`}>
      {/* Card header: drag handle + title/badge + delete */}
      <div className="func-card-header">
        <span className="drag-handle" {...attributes} {...listeners} title="Drag to reorder">
          <GripVertical size={18} />
        </span>

        {isHue ? (
          <div className="func-card-title">
            <span className="hue-badge">HUE</span>
            <span className="func-original-name">{func.originalHueName || func.name}</span>
          </div>
        ) : (
          <div className="func-card-title">
            <span className="func-type-badge">{TYPE_OPTIONS.find(o => o.value === func.type)?.label || func.type}</span>
            <span className="func-name-preview">{func.name || <em style={{ opacity: 0.4 }}>Unnamed</em>}</span>
          </div>
        )}

        <button className="func-delete-btn" onClick={() => handleDeleteFunction(room.id, func.id)} title="Delete">
          <Trash2 size={15} />
        </button>
      </div>

      {/* Card body */}
      <div className="func-card-body">
        {isHue ? (
          <div className="settings-field">
            <label className="settings-field-label">Display Name</label>
            <input className="form-input" value={func.name}
              onChange={e => handleUpdateFunction(room.id, func.id, 'name', e.target.value)}
              placeholder="e.g. Living Room Spot" />
          </div>
        ) : (
          <>
            <div className="func-fields-row">
              <div className="settings-field func-field-name">
                <label className="settings-field-label">Name</label>
                <input className="form-input" value={func.name}
                  onChange={e => handleUpdateFunction(room.id, func.id, 'name', e.target.value)}
                  placeholder="e.g. Lock Door" />
              </div>
              <div className="settings-field func-field-type">
                <label className="settings-field-label">Type</label>
                <TypeSelect value={func.type} onChange={upd('type')} />
              </div>
            </div>

            <div className="func-ga-fields">
              <GAField label="Action GA" tooltipKey="action"
                value={func.groupAddress} onChange={upd('groupAddress')} placeholder="e.g. 1/5/0"
                browseLabel="Search ETS addresses for action GA"
                onBrowse={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: func.type === 'scene' ? 'scene' : func.type, target: { kind: 'field', functionId: func.id, field: 'groupAddress' }, helperText: 'Select a compatible ETS group address for this field.' })} />

              {func.type === 'scene' && (
                <GAField label="Scene Number" tooltipKey="scene"
                  value={func.sceneNumber} onChange={upd('sceneNumber')} placeholder="1–64" type="number" min={1} max={64} />
              )}

              {(func.type === 'switch' || func.type === 'percentage') && (
                <GAField label="Feedback GA" tooltipKey="feedback"
                  value={func.statusGroupAddress} onChange={upd('statusGroupAddress')} placeholder="e.g. 1/5/1"
                  browseLabel="Search ETS addresses for feedback GA"
                  onBrowse={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: func.type, target: { kind: 'field', functionId: func.id, field: 'statusGroupAddress' }, helperText: 'Select a compatible feedback/status GA.' })} />
              )}

              {func.type === 'switch' && (
                <div className="settings-field">
                  <label className="settings-field-label">Icon</label>
                  <div className="icon-select-stack">
                    <IconSelect value={func.iconType || 'lightbulb'} onChange={upd('iconType')} />
                    <label className="icon-invert-card">
                      <input type="checkbox" checked={!!func.invertIcon}
                        onChange={(e) => upd('invertIcon')(e.target.checked)} />
                      <div className="icon-invert-copy">
                        <span className="icon-invert-title">Invert icon state</span>
                        <span className="icon-invert-hint">Swap which icon is shown for OFF / 0 versus ON / 1.</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {func.type === 'percentage' && (
                <GAField label="Moving GA" tooltipKey="moving" optional
                  value={func.movingGroupAddress} onChange={upd('movingGroupAddress')} placeholder="e.g. 1/5/2"
                  browseLabel="Search ETS addresses for moving GA"
                  onBrowse={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: 'percentage', target: { kind: 'field', functionId: func.id, field: 'movingGroupAddress' }, helperText: 'Select a compatible moving/status GA for blinds.' })} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sortable Room Card ────────────────────────────────────────────────────────

function SortableRoomCard({
  room, rooms,
  handleDeleteRoom, updateRoom,
  handleAddScene, handleDeleteScene, handleUpdateScene,
  handleAddFunction, handleDeleteFunction, handleUpdateFunction,
  handleGenerateBaseScenes, handleSaveRooms,
  openHueSceneModal, openHueRoomModal,
  openHueLampModal, openGroupAddressModal, hueStatus,
  onFuncDragEnd, onSceneDragEnd,
  sensors,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: room.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const lightScenes = (room.scenes || []).filter(s => (s.category || 'light') === 'light');
  const shadeScenes = (room.scenes || []).filter(s => s.category === 'shade');
  const allSceneIds = (room.scenes || []).map(s => s.id);
  const funcIds = room.functions.map(f => f.id);

  return (
    <div ref={setNodeRef} style={style} className="room-settings-card">
      {/* Room header */}
      <div className="room-settings-header">
        <span className="drag-handle room-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
          <GripVertical size={20} />
        </span>
        <h3 style={{ margin: 0, flex: 1 }}>{room.name}</h3>
        <button className="btn-danger icon-btn" onClick={() => handleDeleteRoom(room.id)} title="Delete Room">
          <Trash2 size={15} />
        </button>
      </div>

      {/* ═══ ROOM SCENES ═══ */}
      <div className="room-section">
        <h4 className="section-label">Room Scenes</h4>
        <p className="section-subtitle">
          All scenes in this room share a single group address.
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <GAField label="Scene GA" tooltipKey="sceneGA"
            value={room.sceneGroupAddress}
            onChange={(val) => updateRoom(room.id, { sceneGroupAddress: val })}
            placeholder="e.g. 2/5/0"
            browseLabel="Search ETS addresses for scene GA"
            onBrowse={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: 'scene', target: { kind: 'sceneGA' }, helperText: 'Select a compatible scene group address.' })} />
        </div>

        {/* Hue room link */}
        {hueStatus && hueStatus.paired && (
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', minWidth: '90px' }}>Hue Room:</span>
            {room.hueRoomId ? (
              <div className="hue-linked-badge">
                <Lightbulb size={12} />
                <span className="hue-linked-label">{room.hueRoomName || room.hueRoomId}</span>
                <button
                  className="hue-unlink-btn"
                  title="Unlink Hue room"
                  onClick={() => updateRoom(room.id, { hueRoomId: null, hueRoomName: null })}
                >×</button>
              </div>
            ) : (
              <button
                className="btn-secondary-sm btn-purple-sm scene-hue-link-btn"
                onClick={() => openHueRoomModal(room.id)}
              >
                <Lightbulb size={12} /> Link Hue Room
              </button>
            )}
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragEnd={(e) => onSceneDragEnd(e, room.id)}>
          <SortableContext items={allSceneIds} strategy={verticalListSortingStrategy}>

            {/* ── Light Scenes ── */}
            <div className="scene-category-block scene-category-block--light">
              <div className="scene-category-header">
                <h5 className="scene-category-title">Light Scenes</h5>
              </div>
              <div className="scene-list">
                {lightScenes.map(sc => (
                  <SortableSceneRow key={sc.id} sc={sc} roomId={room.id}
                    handleUpdateScene={handleUpdateScene}
                    handleDeleteScene={handleDeleteScene}
                    hueStatus={hueStatus}
                    openHueSceneModal={openHueSceneModal} />
                ))}
              </div>
              <div className="scene-actions-row">
                <button
                  className="btn-secondary-sm scene-add-btn scene-actions-row__add"
                  onClick={() => handleAddScene(room.id, 'light')}
                >
                  <Plus size={13} /> Add Light Scene
                </button>
                <button
                  className="btn-secondary-sm btn-purple-sm scene-actions-row__generate"
                  onClick={() => handleGenerateBaseScenes(room.id)}
                >
                  <Sparkles size={13} /> Generate Base Scenes
                </button>
              </div>
            </div>

            {/* ── Shade Scenes ── */}
            <div className="scene-category-block scene-category-block--shade">
              <div className="scene-category-header">
                <h5 className="scene-category-title">Shade Scenes</h5>
              </div>
              <div className="scene-list">
                {shadeScenes.map(sc => (
                  <SortableSceneRow key={sc.id} sc={sc} roomId={room.id}
                    handleUpdateScene={handleUpdateScene}
                    handleDeleteScene={handleDeleteScene}
                    hueStatus={hueStatus}
                    openHueSceneModal={openHueSceneModal} />
                ))}
              </div>
              <button className="btn-secondary-sm scene-add-btn" onClick={() => handleAddScene(room.id, 'shade')}>
                <Plus size={13} /> Add Shade Scene
              </button>
            </div>

          </SortableContext>
        </DndContext>
      </div>

      {/* ═══ ADDITIONAL FUNCTIONS ═══ */}
      <div className="room-section">
        <h4 className="section-label">Additional Functions</h4>
        <p className="section-subtitle">Switches, blinds, scenes and Hue lamps.</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragEnd={(e) => onFuncDragEnd(e, room.id)}>
          <SortableContext items={funcIds} strategy={verticalListSortingStrategy}>
            {room.functions.map(func => (
              <SortableFunctionCard
                key={func.id}
                func={func}
                room={room}
                handleUpdateFunction={handleUpdateFunction}
                handleDeleteFunction={handleDeleteFunction}
                hueStatus={hueStatus}
                openGroupAddressModal={openGroupAddressModal}
              />
            ))}
          </SortableContext>
        </DndContext>

        {room.functions.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.5rem' }}>
            No additional functions configured.
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn-secondary-sm" onClick={() => handleAddFunction(room.id)}>
            <Plus size={13} /> Add Function
          </button>
          <button className="btn-secondary-sm" onClick={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: 'any', target: { kind: 'addFunction' }, helperText: 'Select a compatible imported ETS group address to create a new function.' })}>
            <FileText size={13} /> Select group address
          </button>
          {hueStatus.paired && (
            <button className="btn-secondary-sm btn-purple-sm" onClick={() => openHueLampModal(room.id)}>
              <Lightbulb size={13} /> Add Hue Lamp
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button className="btn-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem', background: 'var(--success-color)' }}
          onClick={handleSaveRooms}>
          <Save size={14} /> Save All Changes
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Settings({ config, fetchConfig, addToast, hueStatus, setHueStatus }) {
  const [ip, setIp] = useState(config.knxIp || '');
  const [port, setPort] = useState(config.knxPort || 3671);
  const [rooms, setRooms] = useState(() => migrateRooms(config.rooms || []));
  const [newRoomName, setNewRoomName] = useState('');

  const [hueStep, setHueStep] = useState('idle');
  const [hueBridgeIp, setHueBridgeIp] = useState(config.hue?.bridgeIp || '');
  const [hueError, setHueError] = useState('');

  const [hueLampModal, setHueLampModal] = useState({ open: false, roomId: null });
  const [hueLamps, setHueLamps] = useState([]);
  const [hueLampsLoading, setHueLampsLoading] = useState(false);
  const [hueLampSearch, setHueLampSearch] = useState('');

  // Hue room linking modal
  const [hueRoomModal, setHueRoomModal] = useState({ open: false, roomId: null });
  const [hueRoomSearch, setHueRoomSearch] = useState('');
  const [hueRooms, setHueRooms] = useState([]);
  const [hueRoomsLoading, setHueRoomsLoading] = useState(false);

  useEffect(() => {
    setIp(config.knxIp || '');
    setPort(config.knxPort || 3671);
    setRooms(migrateRooms(config.rooms || []));
    setHueBridgeIp(config.hue?.bridgeIp || '');
  }, [config]);
  // Hue scene linking modal
  const [hueSceneModal, setHueSceneModal] = useState({ open: false, roomId: null, sceneId: null });
  const [hueSceneSearch, setHueSceneSearch] = useState('');
  const [hueScenes, setHueScenes] = useState([]);
  const [hueScenesLoading, setHueScenesLoading] = useState(false);
  const [groupAddressModal, setGroupAddressModal] = useState({ open: false, roomId: null, title: 'Select Group Address', mode: 'any', target: null, allowUpload: false, helperText: '' });
  const [groupAddressBook, setGroupAddressBook] = useState([]);
  const [groupAddressFileName, setGroupAddressFileName] = useState('');

  // DnD sensors — touch + pointer + keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // One-time migration
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

  // Hue handlers
  const handleHueDiscover = async () => {
    setHueStep('discovering'); setHueError('');
    try {
      const res = await discoverHueBridge();
      if (res.success && res.bridges.length > 0) { setHueBridgeIp(res.bridges[0].internalipaddress); setHueStep('found'); }
      else { setHueError('No Hue Bridge found.'); setHueStep('idle'); }
    } catch { setHueError('Discovery failed. Is the backend running?'); setHueStep('idle'); }
  };

  const handleHuePair = async () => {
    setHueStep('pairing'); setHueError('');
    try {
      const res = await pairHueBridge(hueBridgeIp);
      if (res.success) { setHueStep('paired'); setHueStatus({ paired: true, bridgeIp: hueBridgeIp }); addToast('Hue Bridge paired!', 'success'); fetchConfig(); }
      else { setHueError(res.error || 'Pairing failed.'); setHueStep('found'); }
    } catch { setHueError('Pairing request failed.'); setHueStep('found'); }
  };

  const handleHueUnpair = async () => {
    try { await unpairHueBridge(); setHueStatus({ paired: false, bridgeIp: '' }); setHueBridgeIp(''); setHueStep('idle'); addToast('Hue Bridge unpaired', 'success'); fetchConfig(); }
    catch { addToast('Failed to unpair', 'error'); }
  };

  const openHueLampModal = async (roomId) => {
    setHueLampModal({ open: true, roomId }); setHueLampsLoading(true);
    try {
      const res = await getHueLights();
      if (res.success) setHueLamps(res.lights);
      else addToast('Failed to load Hue lights: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueLampsLoading(false);
  };

  const selectHueLamp = (lamp) => {
    const roomId = hueLampModal.roomId;
    const updated = rooms.map(r => r.id !== roomId ? r : {
      ...r, functions: [...r.functions, { id: Date.now().toString(), name: lamp.name, originalHueName: lamp.name, type: 'hue', hueLightId: lamp.id, iconType: 'lightbulb' }]
    });
    setRooms(updated);
    setHueLampSearch('');
    setHueLampModal({ open: false, roomId: null });
    addToast(`Added "${lamp.name}"`, 'success');
  };

  // Hue room linking
  const openHueRoomModal = async (roomId) => {
    setHueRoomModal({ open: true, roomId }); setHueRoomsLoading(true);
    try {
      const res = await getHueRooms();
      if (res.success) setHueRooms(res.rooms);
      else addToast('Failed to load Hue rooms: ' + (res.error || ''), 'error');
    } catch { addToast('Could not reach Hue Bridge', 'error'); }
    setHueRoomsLoading(false);
  };

  const selectHueRoom = async (hueRoom) => {
    const roomId = hueRoomModal.roomId;
    try {
      const res = await linkHueRoom(roomId, hueRoom.id);
      if (res.success) {
        updateRoom(roomId, { hueRoomId: hueRoom.id, hueRoomName: hueRoom.name });
        addToast(`Linked Hue room "${hueRoom.name}"`, 'success');
        fetchConfig();
      } else {
        addToast('Link failed: ' + (res.error || ''), 'error');
      }
    } catch { addToast('Could not reach backend', 'error'); }
    setHueRoomSearch('');
    setHueRoomModal({ open: false, roomId: null });
  };

  const handleUnlinkHueRoom = async (roomId) => {
    try {
      await unlinkHueRoom(roomId);
      updateRoom(roomId, { hueRoomId: null, hueRoomName: null });
      addToast('Hue room unlinked', 'success');
      fetchConfig();
    } catch { addToast('Unlink failed', 'error'); }
  };

  // Hue scene linking
  const openHueSceneModal = async (roomId, sceneId) => {
    setHueSceneModal({ open: true, roomId, sceneId }); setHueScenesLoading(true);
    try {
      await updateConfig({ rooms });
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
        setRooms(prev => prev.map(r => r.id !== roomId ? r : {
          ...r,
          scenes: r.scenes.map(s => s.id !== sceneId ? s : { ...s, hueSceneId: hueScene.id, hueSceneName: hueScene.name })
        }));
        addToast(`Linked Hue scene "${hueScene.name}"`, 'success');
        fetchConfig();
      } else {
        addToast('Link failed: ' + (res.error || ''), 'error');
      }
    } catch { addToast('Could not reach backend', 'error'); }
    setHueSceneSearch('');
    setHueSceneModal({ open: false, roomId: null, sceneId: null });
  };

  const handleUnlinkHueScene = async (roomId, sceneId) => {
    try {
      await unlinkHueScene(sceneId);
      setRooms(prev => prev.map(r => r.id !== roomId ? r : {
        ...r,
        scenes: r.scenes.map(s => s.id !== sceneId ? s : { ...s, hueSceneId: null, hueSceneName: null })
      }));
      addToast('Hue scene unlinked', 'success');
      fetchConfig();
    } catch { addToast('Unlink failed', 'error'); }
  };

  // Room handlers
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

  const updateRoom = (roomId, patch) => setRooms(rooms.map(r => r.id !== roomId ? r : { ...r, ...patch }));

  const handleAddScene = (roomId, category = 'light') => {
    const room = rooms.find(r => r.id === roomId);
    const used = (room.scenes || []).map(s => s.sceneNumber);
    let n = 1; while (used.includes(n) && n <= 64) n++;
    updateRoom(roomId, { scenes: [...(room.scenes || []), { id: Date.now().toString(), name: '', sceneNumber: n, category }] });
  };

  const handleDeleteScene = (roomId, sceneId) => {
    const room = rooms.find(r => r.id === roomId);
    updateRoom(roomId, { scenes: room.scenes.filter(s => s.id !== sceneId) });
  };

  const handleUpdateScene = (roomId, sceneId, key, val) => {
    if (key === '_unlinkHue') {
      handleUnlinkHueScene(roomId, sceneId);
      return;
    }
    const room = rooms.find(r => r.id === roomId);
    updateRoom(roomId, { scenes: room.scenes.map(s => s.id !== sceneId ? s : { ...s, [key]: val }) });
  };

  const handleGenerateBaseScenes = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    const existing = room.scenes || [];
    const used = existing.map(s => s.sceneNumber);
    const toAdd = [];
    if (!used.includes(1)) toAdd.push({ id: Date.now() + '_1', name: 'Off', sceneNumber: 1, category: 'light' });
    if (!used.includes(2)) toAdd.push({ id: Date.now() + '_2', name: 'Bright', sceneNumber: 2, category: 'light' });
    if (!toAdd.length) { addToast('Base scenes Off and Bright already exist', 'success'); return; }
    updateRoom(roomId, { scenes: [...existing, ...toAdd] });
    addToast(`Added ${toAdd.map(s => s.name).join(' & ')}`, 'success');
  };

  const openGroupAddressModal = (options) => {
    setGroupAddressModal({
      open: true,
      roomId: options.roomId || null,
      title: options.title || 'Select Group Address',
      mode: options.mode || 'any',
      target: options.target || null,
      allowUpload: !!options.allowUpload,
      helperText: options.helperText || '',
    });
  };

  const closeGroupAddressModal = () => {
    setGroupAddressModal({ open: false, roomId: null, title: 'Select Group Address', mode: 'any', target: null, allowUpload: false, helperText: '' });
  };

  const importGroupAddresses = (addresses, fileName) => {
    setGroupAddressBook(addresses);
    setGroupAddressFileName(fileName);
    addToast(`Imported ${addresses.length} group addresses`, 'success');
  };

  const clearGroupAddresses = () => {
    setGroupAddressBook([]);
    setGroupAddressFileName('');
    addToast('Imported group addresses cleared', 'success');
  };

  const handleSelectGroupAddress = async (groupAddress) => {
    const roomId = groupAddressModal.roomId;
    if (!roomId) return;

    if (groupAddressModal.target?.kind === 'field') {
      const { functionId, field } = groupAddressModal.target;
      await handleUpdateFunction(roomId, functionId, field, groupAddress.address);
      addToast(`Inserted "${groupAddress.name}"`, 'success');
      closeGroupAddressModal();
      return;
    }

    if (groupAddressModal.target?.kind === 'sceneGA') {
      updateRoom(roomId, { sceneGroupAddress: groupAddress.address });
      addToast(`Selected scene GA "${groupAddress.name}"`, 'success');
      closeGroupAddressModal();
      return;
    }

    const newFunction = {
      id: Date.now().toString(),
      name: groupAddress.name,
      type: groupAddress.functionType || 'switch',
      groupAddress: groupAddress.address,
    };

    if (newFunction.type === 'switch') {
      newFunction.iconType = 'lightbulb';
    }

    const updated = rooms.map((room) => room.id !== roomId ? room : {
      ...room,
      functions: [...room.functions, newFunction],
    });

    try {
      await updateConfig({ rooms: updated });
      setRooms(updated);
      addToast(`Added "${groupAddress.name}" from ETS`, 'success');
      fetchConfig();
      closeGroupAddressModal();
    } catch {
      addToast('Failed to add ETS function', 'error');
    }
  };

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

  const handleDeleteFunction = async (roomId, funcId) => {
    const updated = rooms.map(r => r.id !== roomId ? r : { ...r, functions: r.functions.filter(f => f.id !== funcId) });
    setRooms(updated);
    try { await updateConfig({ rooms: updated }); fetchConfig(); } catch {}
  };

  const handleSaveRooms = async () => {
    try { await updateConfig({ rooms }); addToast('Settings saved', 'success'); fetchConfig(); }
    catch { addToast('Failed to save', 'error'); }
  };

  // DnD handlers
  const onRoomDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setRooms(prev => {
      const oi = prev.findIndex(r => r.id === active.id);
      const ni = prev.findIndex(r => r.id === over.id);
      return arrayMove(prev, oi, ni);
    });
  };

  const onFuncDragEnd = ({ active, over }, roomId) => {
    if (!over || active.id === over.id) return;
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const oi = r.functions.findIndex(f => f.id === active.id);
      const ni = r.functions.findIndex(f => f.id === over.id);
      return { ...r, functions: arrayMove(r.functions, oi, ni) };
    }));
  };

  const onSceneDragEnd = ({ active, over }, roomId) => {
    if (!over || active.id === over.id) return;
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const oi = r.scenes.findIndex(s => s.id === active.id);
      const ni = r.scenes.findIndex(s => s.id === over.id);
      return { ...r, scenes: arrayMove(r.scenes, oi, ni) };
    }));
  };

  const handleLoadDevConfig = async () => {
    try {
      const result = await loadDevConfig();
      if (result.success && result.config) {
        addToast("Dev Config loaded successfully", "success");
        fetchConfig();
      } else {
        addToast(result.error || "Failed to load dev config", "error");
      }
    } catch (e) {
      addToast("Failed to load dev config. Check backend connection.", "error");
    }
  };

  const roomIds = rooms.map(r => r.id);
  const filteredHueLamps = hueLamps.filter(lamp => lamp.name.toLowerCase().includes(hueLampSearch.trim().toLowerCase()));
  const filteredHueRooms = hueRooms.filter(room => room.name.toLowerCase().includes(hueRoomSearch.trim().toLowerCase()));
  const filteredHueScenes = hueScenes.filter(scene => scene.name.toLowerCase().includes(hueSceneSearch.trim().toLowerCase()));

  return (
    <div className="glass-panel settings-panel">

      {/* KNX Interface */}
      <div className="settings-section" style={{ borderTop: 'none', marginTop: 0, paddingTop: '1.5rem' }}>
        <h2>KNX Interface</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          IP address and port of your KNX IP interface.
        </p>
        <div className="knx-ip-row">
          <div className="settings-field">
            <label className="settings-field-label">IP Address</label>
            <input className="form-input" placeholder="192.168.1.50" value={ip} onChange={e => setIp(e.target.value)} />
          </div>
          <div className="settings-field knx-port-field">
            <label className="settings-field-label">Port</label>
            <input className="form-input" type="number" placeholder="3671" value={port} onChange={e => setPort(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={handleSaveIp}>
            <Save size={16} /> Save
          </button>
          <button className="btn-secondary" onClick={handleLoadDevConfig} title="Load local dev config (config.dev.json)">
            Load Dev Config
          </button>
        </div>
   

        <div style={{ marginTop: '1rem', marginBottom: '1rem', padding: '0.9rem', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <FileText size={16} style={{ color: 'var(--accent-color)' }} />
            <strong style={{ fontSize: '0.9rem' }}>ETS XML Group Address Import</strong>
          </div>
          <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Upload the ETS XML once here. Afterwards you can browse compatible group addresses from the room and field-level Browse buttons below.
          </p>
          <button className="btn-secondary-sm" onClick={() => openGroupAddressModal({ title: 'ETS XML import', allowUpload: true, mode: 'any', helperText: 'Upload an ETS XML export and review the imported supported addresses.' })}>
            <FileText size={14} /> Manage imported ETS XML
          </button>
          {groupAddressFileName && groupAddressBook.length > 0 && (
            <div style={{ marginTop: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              Loaded: <strong style={{ color: 'var(--text-primary)' }}>{groupAddressFileName}</strong> · {groupAddressBook.filter(address => address.supported).length} supported addresses
            </div>
          )}
        </div>
      </div>

      {/* Philips Hue */}
      <div className="settings-section">
        <h2>Philips Hue</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Connect your Hue Bridge to control Hue lights alongside KNX.
        </p>

        {hueStatus.paired ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success-color)' }} />
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
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input className="form-input" style={{ width: '180px' }} placeholder="e.g. 192.168.1.100"
                      value={hueBridgeIp} onChange={e => setHueBridgeIp(e.target.value)} />
                    <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.1)' }}
                      onClick={() => { if (hueBridgeIp) { setHueError(''); setHueStep('found'); } }}>
                      Use IP
                    </button>
                  </div>
                </div>
              </div>
            )}
            {hueStep === 'discovering' && <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Searching for Hue Bridges…</div>}
            {hueStep === 'found' && (
              <div>
                <p style={{ color: 'var(--text-primary)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>Bridge found at <strong>{hueBridgeIp}</strong></p>
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
            {hueStep === 'pairing' && <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Pairing…</div>}
            {hueError && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.75rem' }}>{hueError}</div>}
          </div>
        )}
      </div>

      {/* Rooms */}
      <div className="settings-section">
        <h2>Rooms &amp; Functions</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Group your KNX devices into rooms and configure their functions.
        </p>

        <div className="knx-ip-row" style={{ marginBottom: '2rem' }}>
          <div className="settings-field" style={{ flex: 1 }}>
            <label className="settings-field-label">New Room</label>
            <input className="form-input" placeholder="e.g. Living Room" value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateRoom()} />
          </div>
          <button className="btn-primary" onClick={handleCreateRoom}>
            <Plus size={16} /> Add Room
          </button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onRoomDragEnd}>
          <SortableContext items={roomIds} strategy={verticalListSortingStrategy}>
            {rooms.map(room => (
              <SortableRoomCard
                key={room.id}
                room={room}
                rooms={rooms}
                handleDeleteRoom={handleDeleteRoom}
                updateRoom={updateRoom}
                handleAddScene={handleAddScene}
                handleDeleteScene={handleDeleteScene}
                handleUpdateScene={handleUpdateScene}
                handleAddFunction={handleAddFunction}
                handleDeleteFunction={handleDeleteFunction}
                handleUpdateFunction={handleUpdateFunction}
                handleGenerateBaseScenes={handleGenerateBaseScenes}
                handleSaveRooms={handleSaveRooms}
                openHueLampModal={openHueLampModal}
                openHueRoomModal={openHueRoomModal}
                openHueSceneModal={openHueSceneModal}
                openGroupAddressModal={openGroupAddressModal}
                hueStatus={hueStatus}
                onFuncDragEnd={onFuncDragEnd}
                onSceneDragEnd={onSceneDragEnd}
                sensors={sensors}
              />
            ))}
          </SortableContext>
        </DndContext>

        {rooms.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No rooms added yet.</p>
        )}
      </div>

      {/* Hue Lamp Selection Modal */}
      {hueLampModal.open && createPortal(
        <div className="modal-overlay" onClick={() => { setHueLampModal({ open: false, roomId: null }); setHueLampSearch(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Select Hue Lamp</h3>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                type="text"
                placeholder="Search Hue lamps"
                value={hueLampSearch}
                onChange={e => setHueLampSearch(e.target.value)}
              />
            </div>
            {hueLampsLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading lamps…</p>
            ) : filteredHueLamps.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>
                {hueLampSearch ? 'No Hue lights match your search.' : 'No Hue lights found.'}
              </p>
            ) : (
              <div className="hue-lamp-list">
                {filteredHueLamps.map(lamp => (
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
                onClick={() => { setHueLampModal({ open: false, roomId: null }); setHueLampSearch(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
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

      {/* Hue Room Linking Modal */}
      {hueRoomModal.open && createPortal(
        <div className="modal-overlay" onClick={() => { setHueRoomModal({ open: false, roomId: null }); setHueRoomSearch(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Select Hue Room</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              When a KNX scene named "Aus" or "Off" is triggered, the linked Hue room will be turned off.
            </p>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                type="text"
                placeholder="Search Hue rooms"
                value={hueRoomSearch}
                onChange={e => setHueRoomSearch(e.target.value)}
              />
            </div>
            {hueRoomsLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading rooms…</p>
            ) : filteredHueRooms.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No Hue rooms found.</p>
            ) : (
              <div className="hue-lamp-list">
                {filteredHueRooms.map(hr => (
                  <button key={hr.id} className="hue-lamp-item" onClick={() => selectHueRoom(hr)}>
                    <Lightbulb size={18} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{hr.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {hr.lights.length} light{hr.lights.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <Plus size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => { setHueRoomModal({ open: false, roomId: null }); setHueRoomSearch(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Hue Scene Linking Modal */}
      {hueSceneModal.open && createPortal(
        <div className="modal-overlay" onClick={() => { setHueSceneModal({ open: false, roomId: null, sceneId: null }); setHueSceneSearch(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Select Hue Scene</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              This scene will be activated on the Hue Bridge when the KNX scene is triggered.
            </p>
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                type="text"
                placeholder="Search Hue scenes"
                value={hueSceneSearch}
                onChange={e => setHueSceneSearch(e.target.value)}
              />
            </div>
            {hueScenesLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Loading scenes…</p>
            ) : filteredHueScenes.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No Hue scenes found.</p>
            ) : (
              <div className="hue-lamp-list">
                {filteredHueScenes.map(hs => (
                  <button key={hs.id} className="hue-lamp-item" onClick={() => selectHueScene(hs)}>
                    <Sparkles size={18} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{hs.name}</div>
                      {hs.group && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Group {hs.group}</div>
                      )}
                    </div>
                    <Plus size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                onClick={() => { setHueSceneModal({ open: false, roomId: null, sceneId: null }); setHueSceneSearch(''); }}>
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
