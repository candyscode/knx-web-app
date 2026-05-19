import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove, sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown, GripVertical, Trash2, Lightbulb, Plus,
  HelpCircle, Sparkles, Lock, LockOpen, Pencil,
  Blinds, SlidersHorizontal, Power, Plug, Play, Search, X, LayoutGrid
} from 'lucide-react';
import { getSelectOption } from '../iconSelectUtils';
import { KNXGroupAddressModal } from './KNXGroupAddressModal';

// ── Options ───────────────────────────────────────────────
export const ICON_OPTIONS = [
  { value: 'lightbulb', label: 'Lamp', Icon: Lightbulb },
  { value: 'lock', label: 'Lock', Icon: Lock },
];
export const TYPE_OPTIONS = [
  { value: 'scene',      label: 'Scene',          dpt: 'DPT 17.001' },
  { value: 'switch',     label: 'Switch',          dpt: 'DPT 1.001'  },
  { value: 'light',      label: 'Light',           dpt: 'DPT 1.001'  },
  { value: 'lock',       label: 'Lock',            dpt: 'DPT 1.001'  },
  { value: 'socket',     label: 'Socket',          dpt: 'DPT 1.001'  },
  { value: 'percentage', label: 'Blind / Shade',   dpt: 'DPT 5.001'  },
  { value: 'dimmer',     label: 'Dimmer',          dpt: 'DPT 5.001'  },
];

// Icon per type — used in card headers & dashboard
export function getTypeIcon(type, size = 16) {
  switch (type) {
    case 'dimmer':     return <SlidersHorizontal size={size} />;
    case 'percentage': return <Blinds size={size} />;
    case 'light':      return <Lightbulb size={size} />;
    case 'switch':     return <Power size={size} />;
    case 'socket':     return <Plug size={size} />;
    case 'lock':       return <Lock size={size} />;
    case 'scene':      return <Play size={size} />;
    default:           return <Power size={size} />;
  }
}

const WIDGET_CATALOG = [
  {
    type: 'dimmer',
    label: 'Dimmer',
    description: 'Controls a dimmable light or device with a percentage value.',
    dpt: 'DPT 5.001 (0–100 %)',
    icon: SlidersHorizontal,
    color: '#f97316',
  },
  {
    type: 'percentage',
    label: 'Blind / Shade',
    description: 'Controls motorised blinds or shades. Supports moving status feedback.',
    dpt: 'DPT 5.001 (0–100 %)',
    icon: Blinds,
    color: '#818cf8',
  },
  {
    type: 'light',
    label: 'Light',
    description: 'Binary on/off control for a light. Shows a bulb icon that fills when on.',
    dpt: 'DPT 1.001 (0 / 1)',
    icon: Lightbulb,
    color: '#facc15',
  },
  {
    type: 'socket',
    label: 'Switch / Socket',
    description: 'Generic binary switch or socket. Shows a plug icon. Supports state inversion.',
    dpt: 'DPT 1.001 (0 / 1)',
    icon: Plug,
    color: '#34d399',
  },
  {
    type: 'lock',
    label: 'Lock',
    description: 'Shows a padlock icon. Toggle between locked and unlocked states.',
    dpt: 'DPT 1.001 (0 / 1)',
    icon: Lock,
    color: '#f87171',
  },
  {
    type: 'scene',
    label: 'Scene',
    description: 'Triggers a KNX scene by sending a scene number on a group address.',
    dpt: 'DPT 17.001 (scene number)',
    icon: Play,
    color: '#60a5fa',
  },
  {
    type: 'hue',
    label: 'Hue Lamp',
    description: 'Adds a Philips Hue light from your linked bridge. Requires a paired Hue bridge.',
    dpt: 'Philips Hue API',
    icon: Lightbulb,
    color: '#a78bfa',
    action: 'hue',
  },
];

// ── Widget Catalog Modal ──────────────────────────────────
function WidgetCatalogModal({ onClose, onSelect, onHue, huePaired }) {
  const [query, setQuery] = useState('');
  const visible = WIDGET_CATALOG.filter(w => w.action !== 'hue' || huePaired);
  const filtered = visible.filter(w =>
    w.label.toLowerCase().includes(query.toLowerCase()) ||
    w.description.toLowerCase().includes(query.toLowerCase())
  );
  return createPortal(
    <div className="widget-modal-overlay" onClick={onClose}>
      <div className="catalog-modal" onClick={e => e.stopPropagation()}>
        <div className="catalog-modal-header">
          <div className="catalog-modal-title">
            <LayoutGrid size={20} />
            Widget Catalog
          </div>
          <button className="widget-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="catalog-search-wrap">
          <Search size={15} className="catalog-search-icon" />
          <input
            className="catalog-search-input"
            placeholder="Search widgets…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="catalog-grid">
          {filtered.map(w => {
            const Icon = w.icon;
            const handleClick = () => {
              if (w.action === 'hue') { onHue?.(); }
              else { onSelect(w.type); }
              onClose();
            };
            return (
              <button key={w.type} className="catalog-tile" onClick={handleClick}>
                <div className="catalog-tile-icon" style={{ color: w.color, background: `${w.color}1a` }}>
                  <Icon size={28} />
                </div>
                <div className="catalog-tile-body">
                  <div className="catalog-tile-label">{w.label}</div>
                  <div className="catalog-tile-desc">{w.description}</div>
                  <div className="catalog-tile-dpt">{w.dpt}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', gridColumn: '1/-1', textAlign: 'center', padding: '2rem 0' }}>No widgets match your search.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
const GA_TOOLTIPS = {
  action: 'The group address this function writes to on the KNX bus.',
  scene: 'Scene number to activate (1–64). The bus value is automatically offset by −1.',
  sceneGA: 'The group address for scene control. All room scenes share this single GA (DPT 17.001).',
  roomTemperature: 'Status group address for the measured room temperature (DPT 9.001).',
  feedback: 'Status group address — the actuator reports its current state here.',
  moving: 'Group address the actuator uses to signal movement (1 = moving, 0 = stopped).',
};

// ── TypeSelect ────────────────────────────────────────────

export function TypeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = TYPE_OPTIONS.find(o => o.value === value) || TYPE_OPTIONS[0];
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
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

// ── IconSelect ────────────────────────────────────────────
export function IconSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const current = getSelectOption(ICON_OPTIONS, value);
  const CurrentIcon = current.Icon;

  const closeDropdown = useCallback(() => { setOpen(false); setDropdownStyle(null); }, []);
  const updateStyle = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({ position: 'fixed', top: `${rect.bottom + 4}px`, left: `${rect.left}px`, width: `${Math.max(rect.width, 168)}px`, zIndex: 2000 });
  }, []);

  useEffect(() => {
    const h = e => {
      if (ref.current && !ref.current.contains(e.target) && (!dropdownRef.current || !dropdownRef.current.contains(e.target))) closeDropdown();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [closeDropdown]);
  useLayoutEffect(() => { if (open) updateStyle(); }, [open, updateStyle]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', updateStyle);
    window.addEventListener('scroll', updateStyle, true);
    return () => { window.removeEventListener('resize', updateStyle); window.removeEventListener('scroll', updateStyle, true); };
  }, [open, updateStyle]);

  return (
    <div className="type-select icon-select" ref={ref}>
      <button type="button" ref={triggerRef} className="type-select-trigger icon-select-trigger"
        onClick={() => open ? closeDropdown() : setOpen(true)}>
        <CurrentIcon size={18} className="icon-select-icon" />
        <span className="type-select-name icon-select-name">{current.label}</span>
        <ChevronDown size={14} className={`type-select-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && createPortal(
        <div ref={dropdownRef} className="type-select-dropdown" style={dropdownStyle || { display: 'none' }}>
          {ICON_OPTIONS.map(opt => {
            const OptIcon = opt.Icon;
            return (
              <button type="button" key={opt.value} className={`type-select-option icon-select-option ${opt.value === value ? 'active' : ''}`}
                onClick={() => { onChange(opt.value); closeDropdown(); }}>
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

// ── GAField ───────────────────────────────────────────────
export function GAField({
  label,
  tooltipKey,
  optional,
  value,
  onChange,
  onCommit,
  placeholder,
  type = 'text',
  min,
  max,
  onBrowse,
  browseLabel = 'Browse ETS addresses',
  matchedAddressName = '',
}) {
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
      <div className="ga-field-input-row">
        <input className="form-input" value={value || ''}
          onChange={e => onChange(type === 'number' ? parseInt(e.target.value) : e.target.value)}
          onBlur={onCommit}
          placeholder={placeholder} type={type} min={min} max={max} />
        {onBrowse && type !== 'number' && (
          <button type="button" className="btn-secondary-sm ga-browse-btn" onClick={onBrowse} title={browseLabel}>
            Browse
          </button>
        )}
      </div>
      {matchedAddressName && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          XML match: <strong style={{ color: 'var(--text-primary)' }}>{matchedAddressName}</strong>
        </div>
      )}
    </div>
  );
}

// ── SortableSceneRow ──────────────────────────────────────
function SortableSceneRow({ sc, roomId, handleUpdateScene, handleDeleteScene, hueStatus, openHueSceneModal, persistRoomChanges }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sc.id });
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
          <input className="form-input" value={sc.name}
            onChange={e => handleUpdateScene(roomId, sc.id, 'name', e.target.value)} onBlur={persistRoomChanges} placeholder="e.g. Off" />
        </div>
        <div className="scene-field">
          <label className="scene-field-label">Scene #</label>
          <input className="form-input scene-number-input" type="number" min="1" max="64"
            value={sc.sceneNumber === undefined ? '' : sc.sceneNumber}
            onChange={e => handleUpdateScene(roomId, sc.id, 'sceneNumber', e.target.value === '' ? undefined : parseInt(e.target.value))}
            onBlur={persistRoomChanges}
            placeholder="1–64" />
        </div>
      </div>
      {hueStatus && hueStatus.paired && isLight ? (
        <div className="scene-field scene-field--hue">
          {sc.hueSceneId ? (
            <div className="hue-linked-badge" title={`Linked: ${sc.hueSceneId}`}>
              <Lightbulb size={12} />
              <span className="hue-linked-label">{sc.hueSceneName || sc.hueSceneId}</span>
              <button className="hue-unlink-btn" title="Unlink" onClick={() => handleUpdateScene(roomId, sc.id, '_unlinkHue', true)}>×</button>
            </div>
          ) : isHueOffScene ? (
            <span className="hue-off-label">Turns off Hue room.</span>
          ) : (
            <button className="btn-secondary-sm btn-purple-sm scene-hue-link-btn" onClick={() => openHueSceneModal(roomId, sc.id)}>
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

// ── SortableFunctionCard ──────────────────────────────────
function SortableFunctionCard({ func, room, handleUpdateFunction, handleDeleteFunction, hueStatus, openGroupAddressModal, persistRoomChanges, resolveGroupAddressName }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: func.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const isHue = func.type === 'hue';
  const upd = key => val => handleUpdateFunction(room.id, func.id, key, val);
  // Which types have a binary (on/off) toggle + status GA
  const isBinary = ['switch', 'light', 'lock', 'socket'].includes(func.type);
  const typeLabel = TYPE_OPTIONS.find(o => o.value === func.type)?.label || func.type;
  return (
    <div ref={setNodeRef} style={style} className={`function-card ${isHue ? 'hue-card' : ''}`}>
      <div className="func-card-header">
        <span className="drag-handle" {...attributes} {...listeners} title="Drag to reorder"><GripVertical size={18} /></span>
        {isHue ? (
          <div className="func-card-title">
            <span className="hue-badge">HUE</span>
            <span className="func-original-name">{func.originalHueName || func.name}</span>
          </div>
        ) : (
          <div className="func-card-title">
            <span className="func-type-badge func-type-badge--icon">
              {getTypeIcon(func.type, 13)}
              {typeLabel}
            </span>
            <span className="func-name-preview">{func.name || <em style={{ opacity: 0.4 }}>Unnamed</em>}</span>
          </div>
        )}
        <button className="func-delete-btn" onClick={() => handleDeleteFunction(room.id, func.id)} title="Delete function"><Trash2 size={15} /></button>
      </div>
      <div className="func-card-body">
        {isHue ? (
            <div className="settings-field">
              <label className="settings-field-label">Display Name</label>
              <input className="form-input" value={func.name}
                onChange={e => handleUpdateFunction(room.id, func.id, 'name', e.target.value)} onBlur={persistRoomChanges} placeholder="e.g. Living Room Spot" />
            </div>
        ) : (
          <>
            <div className="func-fields-row">
              <div className="settings-field func-field-name">
                <label className="settings-field-label">Name</label>
                <input className="form-input" value={func.name}
                  onChange={e => handleUpdateFunction(room.id, func.id, 'name', e.target.value)} onBlur={persistRoomChanges} placeholder="e.g. Ceiling Light" />
              </div>
            </div>
            <div className="func-ga-fields">
              <GAField label="Action GA" tooltipKey="action" value={func.groupAddress} onChange={upd('groupAddress')} onCommit={persistRoomChanges} placeholder="e.g. 1/5/0" browseLabel="Search ETS addresses for action GA"
                matchedAddressName={resolveGroupAddressName?.(func.groupAddress)}
                onBrowse={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: func.type === 'scene' ? 'scene' : func.type, target: { kind: 'field', functionId: func.id, field: 'groupAddress' }, helperText: 'Select a compatible ETS group address.' })} />
              {func.type === 'scene' && (
                <GAField label="Scene Number" tooltipKey="scene" value={func.sceneNumber} onChange={upd('sceneNumber')} onCommit={persistRoomChanges} placeholder="1–64" type="number" min={1} max={64} />
              )}
              {(isBinary || func.type === 'percentage' || func.type === 'dimmer') && (
                <GAField label="Feedback GA" tooltipKey="feedback" value={func.statusGroupAddress} onChange={upd('statusGroupAddress')} onCommit={persistRoomChanges} placeholder="e.g. 1/5/1" browseLabel="Search ETS addresses for feedback GA"
                  matchedAddressName={resolveGroupAddressName?.(func.statusGroupAddress)}
                  onBrowse={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: func.type, target: { kind: 'field', functionId: func.id, field: 'statusGroupAddress' }, helperText: 'Select a compatible feedback GA.' })} />
              )}
              {isBinary && (
                <div className="settings-field">
                  <label className="settings-field-label">Icon behaviour</label>
                  <label className="icon-invert-card" style={{ marginTop: '0.25rem' }}>
                    <input type="checkbox" checked={!!func.invertIcon} onChange={e => handleUpdateFunction(room.id, func.id, 'invertIcon', e.target.checked, { saveImmediately: true })} />
                    <div className="icon-invert-copy">
                      <span className="icon-invert-title">Invert icon state</span>
                      <span className="icon-invert-hint">Swap which icon is shown for OFF / ON.</span>
                    </div>
                  </label>
                </div>
              )}
              {func.type === 'percentage' && (
                <GAField label="Moving GA" tooltipKey="moving" optional value={func.movingGroupAddress} onChange={upd('movingGroupAddress')} onCommit={persistRoomChanges} placeholder="e.g. 1/5/2" browseLabel="Search ETS addresses for moving GA"
                  matchedAddressName={resolveGroupAddressName?.(func.movingGroupAddress)}
                  onBrowse={() => openGroupAddressModal({ roomId: room.id, title: 'Select group address', mode: 'percentage', target: { kind: 'field', functionId: func.id, field: 'movingGroupAddress' }, helperText: 'Select a compatible moving GA.' })} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── CollapsibleRoomCard ───────────────────────────────────
function CollapsibleRoomCard({
  room, floors, floorId,
  handleDeleteRoom, updateRoom, onRenameRoom,
  handleAddScene, handleDeleteScene, handleUpdateScene,
  handleAddFunction, handleDeleteFunction, handleUpdateFunction,
  handleUnlinkHueRoom,
  handleGenerateBaseScenes, persistRoomChanges,
  openHueSceneModal, openHueRoomModal, openHueLampModal, openGroupAddressModal,
  hueStatus, onFuncDragEnd, onSceneDragEnd, sensors,
  resolveGroupAddressName,
  expanded,
  onExpandedChange,
}) {
  const [internalExpanded, setInternalExpanded] = useState(import.meta.env.MODE === 'test');
  const [renamingRoom, setRenamingRoom] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(room.name);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const roomNameInputRef = useRef(null);
  const isExpandedControlled = expanded !== undefined;
  const isExpanded = isExpandedControlled ? expanded : internalExpanded;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: room.id,
    data: { type: 'room', roomId: room.id, floorId }
  });
  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    visibility: isDragging ? 'hidden' : 'visible',
    pointerEvents: isDragging ? 'none' : undefined,
  };

  const totalFuncs = (room.functions || []).length;
  const totalScenes = (room.scenes || []).length;

  const setExpandedState = (next) => {
    const resolvedNext = typeof next === 'function' ? next(isExpanded) : next;
    if (!isExpandedControlled) setInternalExpanded(resolvedNext);
    onExpandedChange?.(resolvedNext);
  };

  const startRoomRename = (e) => {
    e.stopPropagation();
    setRoomNameDraft(room.name);
    setRenamingRoom(true);
    setTimeout(() => roomNameInputRef.current?.select(), 0);
  };

  const commitRoomRename = () => {
    const name = roomNameDraft.trim();
    if (name && name !== room.name) onRenameRoom?.(floorId, room.id, name);
    setRenamingRoom(false);
  };

  const cancelRoomRename = () => { setRoomNameDraft(room.name); setRenamingRoom(false); };

  const lightScenes = (room.scenes || []).filter(s => (s.category || 'light') === 'light');
  const shadeScenes = (room.scenes || []).filter(s => s.category === 'shade');
  const allSceneIds = (room.scenes || []).map(s => s.id);
  const funcIds = (room.functions || []).map(f => f.id);

  return (
    <div ref={setNodeRef} style={style} className={`room-settings-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="room-settings-header room-collapse-header" onClick={() => setExpandedState(prev => !prev)}>
        <span className="drag-handle room-drag-handle" {...attributes} {...listeners}
          title="Drag to reorder" onClick={e => e.stopPropagation()}>
          <GripVertical size={20} />
        </span>
        <ChevronDown size={16} className={`room-collapse-chevron ${isExpanded ? 'open' : ''}`} />
        <div className="room-name-editable" onClick={e => e.stopPropagation()}>
          {renamingRoom ? (
            <input
              ref={roomNameInputRef}
              className="room-name-input"
              value={roomNameDraft}
              onChange={e => setRoomNameDraft(e.target.value)}
              onBlur={commitRoomRename}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitRoomRename(); }
                if (e.key === 'Escape') cancelRoomRename();
              }}
            />
          ) : (
            <>
              <h3 className="room-name-heading">{room.name}</h3>
              <button
                className="room-rename-btn"
                title="Rename room"
                onClick={startRoomRename}
              >
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>
        <div className="room-card-meta" onClick={e => e.stopPropagation()}>
          {totalScenes > 0 && <span className="room-meta-badge">{totalScenes} scenes</span>}
          {totalFuncs > 0 && <span className="room-meta-badge">{totalFuncs} functions</span>}
          <button className="btn-danger icon-btn" onClick={e => { e.stopPropagation(); handleDeleteRoom(floorId, room.id); }} title="Delete Room">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="room-card-body" onClick={e => e.stopPropagation()}>
          {/* Room Scenes */}
          <div className="room-section">
            <h4 className="section-label">Room Scenes</h4>
            <p className="section-subtitle">All scenes in this room share a single group address.</p>
            <div style={{ marginBottom: '1rem' }}>
              <GAField label="Scene GA" tooltipKey="sceneGA"
                value={room.sceneGroupAddress || ''}
                matchedAddressName={resolveGroupAddressName?.(room.sceneGroupAddress)}
                browseLabel="Search ETS addresses for scene GA"
                onCommit={persistRoomChanges}
                onChange={(val) => updateRoom(floorId, room.id, { sceneGroupAddress: val })} placeholder="e.g. 3/5/0"
                onBrowse={() => openGroupAddressModal({ roomId: room.id, floorId, title: 'Select Scene Group Address', mode: 'scene', target: { kind: 'sceneGA' }, helperText: 'Select a scene or 1-byte value ETS group address.' })} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <GAField
                label="Room Temperature GA"
                tooltipKey="roomTemperature"
                value={room.roomTemperatureGroupAddress || ''}
                matchedAddressName={resolveGroupAddressName?.(room.roomTemperatureGroupAddress)}
                browseLabel="Search ETS addresses for room temperature GA"
                onCommit={persistRoomChanges}
                onChange={(val) => updateRoom(floorId, room.id, { roomTemperatureGroupAddress: val })}
                placeholder="e.g. 4/1/7"
                onBrowse={() => openGroupAddressModal({
                  roomId: room.id,
                  floorId,
                  title: 'Select Room Temperature Group Address',
                  mode: 'any',
                  dptFilter: '9.',
                  target: { kind: 'roomTemperatureGA' },
                  helperText: 'Select a compatible room temperature ETS group address.',
                })}
              />
            </div>
            {hueStatus && hueStatus.paired && (
              <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', minWidth: '90px' }}>Hue Room:</span>
                {room.hueRoomId ? (
                  <div className="hue-linked-badge">
                    <Lightbulb size={12} />
                    <span className="hue-linked-label">{room.hueRoomName || room.hueRoomId}</span>
                    <button className="hue-unlink-btn" title="Unlink" onClick={() => handleUnlinkHueRoom(room.id, floorId)}>×</button>
                  </div>
                ) : (
                  <button className="btn-secondary-sm btn-purple-sm" onClick={() => openHueRoomModal(room.id, floorId)}>
                    <Lightbulb size={12} /> Link Hue Room
                  </button>
                )}
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => onSceneDragEnd(e, floorId, room.id)}>
              <SortableContext items={allSceneIds} strategy={verticalListSortingStrategy}>
                <div className="scene-category-block scene-category-block--light">
                  <div className="scene-category-header"><h5 className="scene-category-title">Light Scenes</h5></div>
                  <div className="scene-list">
                    {lightScenes.map(sc => (
                    <SortableSceneRow key={sc.id} sc={sc} roomId={room.id}
                        handleUpdateScene={handleUpdateScene} handleDeleteScene={handleDeleteScene}
                        hueStatus={hueStatus} openHueSceneModal={openHueSceneModal} persistRoomChanges={persistRoomChanges} />
                    ))}
                  </div>
                  <div className="scene-actions-row">
                    <button className="btn-secondary-sm scene-add-btn scene-actions-row__add" onClick={(e) => { e.stopPropagation(); handleAddScene(floorId, room.id, 'light'); }}>
                      <Plus size={13} /> Add Light Scene
                    </button>
                    <button className="btn-secondary-sm btn-purple-sm scene-actions-row__generate" onClick={(e) => { e.stopPropagation(); handleGenerateBaseScenes(floorId, room.id); }}>
                      <Sparkles size={13} /> Generate Base Scenes
                    </button>
                  </div>
                </div>
                <div className="scene-category-block scene-category-block--shade">
                  <div className="scene-category-header"><h5 className="scene-category-title">Shade Scenes</h5></div>
                  <div className="scene-list">
                    {shadeScenes.map(sc => (
                      <SortableSceneRow key={sc.id} sc={sc} roomId={room.id}
                        handleUpdateScene={handleUpdateScene} handleDeleteScene={handleDeleteScene}
                        hueStatus={hueStatus} openHueSceneModal={openHueSceneModal} persistRoomChanges={persistRoomChanges} />
                    ))}
                  </div>
                  <button className="btn-secondary-sm scene-add-btn" onClick={(e) => { e.stopPropagation(); handleAddScene(floorId, room.id, 'shade'); }}>
                    <Plus size={13} /> Add Shade Scene
                  </button>
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Additional Functions */}
          <div className="room-section">
            <h4 className="section-label">Additional Functions</h4>
            <p className="section-subtitle">Switches, blinds, scenes and Hue lamps.</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => onFuncDragEnd(e, floorId, room.id)}>
              <SortableContext items={funcIds} strategy={verticalListSortingStrategy}>
                {(room.functions || []).map(func => (
                  <SortableFunctionCard key={func.id} func={func} room={room}
                    handleUpdateFunction={handleUpdateFunction}
                    handleDeleteFunction={handleDeleteFunction}
                    hueStatus={hueStatus}
                    openGroupAddressModal={openGroupAddressModal}
                    persistRoomChanges={persistRoomChanges}
                    resolveGroupAddressName={resolveGroupAddressName} />
                ))}
              </SortableContext>
            </DndContext>
            {(!room.functions || room.functions.length === 0) && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.5rem' }}>No additional functions configured.</p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn-secondary-sm" type="button"
                onClick={(e) => { e.stopPropagation(); setCatalogOpen(true); }}>
                <LayoutGrid size={13} /> Add from widget catalog
              </button>
            </div>
            {catalogOpen && (
              <WidgetCatalogModal
                onClose={() => setCatalogOpen(false)}
                onSelect={(type) => handleAddFunction(floorId, room.id, type)}
                onHue={() => openHueLampModal(room.id, floorId)}
                huePaired={!!(hueStatus && hueStatus.paired)}
              />
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default CollapsibleRoomCard;
