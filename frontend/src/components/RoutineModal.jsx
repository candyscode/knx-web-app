import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Check, Plus, GripVertical, Trash2, HelpCircle,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ActionPickerModal from './ActionPickerModal';

function SortableActionRow({ action, floors, index, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: action.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const label = resolveActionLabel(action, floors);

  return (
    <div ref={setNodeRef} style={style} className="routine-action-row">
      <span className="drag-handle" {...attributes} {...listeners} title="Zum Sortieren ziehen">
        <GripVertical size={16} />
      </span>
      <span className="routine-action-index">{index + 1}</span>
      <span className="routine-action-label" style={{ flex: 1 }}>
        {label ?? <span style={{ color: 'var(--danger-color)' }}>⚠ Ziel gelöscht</span>}
      </span>
      <span className="routine-action-kind">{action.kind === 'scene' ? 'Szene' : 'Funktion'}</span>
      {action.kind === 'function' && (
        <span className="routine-action-value">
          {action.targetType === 'percentage' || action.targetType === 'dimmer' ? `${action.value}%` : (action.value ? 'An' : 'Aus')}
        </span>
      )}
      <button className="icon-btn btn-danger" onClick={() => onDelete(action.id)} title="Aktion entfernen">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function resolveActionLabel(action, floors) {
  if (!floors) return null;
  for (const floor of floors) {
    if (!Array.isArray(floor.rooms)) continue;
    const room = floor.rooms.find((r) => r.id === action.roomId);
    if (!room) continue;
    if (action.kind === 'scene') {
      const scene = Array.isArray(room.scenes) ? room.scenes.find((s) => s.id === action.targetId) : null;
      return scene ? `${floor.name} › ${room.name} › ${scene.name}` : null;
    } else {
      const func = Array.isArray(room.functions) ? room.functions.find((f) => f.id === action.targetId) : null;
      return func ? `${floor.name} › ${room.name} › ${func.name}` : null;
    }
  }
  return null;
}

function validate(routine) {
  if (!routine.name || !routine.name.trim()) return 'Name ist erforderlich.';
  if (!routine.time || !/^\d{2}:\d{2}$/.test(routine.time)) return 'Gültige Uhrzeit (HH:MM) erforderlich.';
  if (!routine.actions || routine.actions.length === 0) return 'Mindestens eine Aktion ist erforderlich.';
  return null;
}

export default function RoutineModal({ routine, floors, sunTriggerConfigured, onSave, onClose }) {
  const isNew = !routine;
  const [draft, setDraft] = useState(() => routine ? { ...routine, actions: [...(routine.actions || [])] } : {
    id: `automation_${Date.now()}`,
    name: '',
    enabled: true,
    time: '08:00',
    triggerType: 'time',
    frequency: 'daily',
    actions: [],
    lastRunAt: null,
    lastRunStatus: null,
  });
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [error, setError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const update = (key, val) => setDraft((prev) => ({ ...prev, [key]: val }));

  const handleActionDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = draft.actions.findIndex((a) => a.id === active.id);
    const newIndex = draft.actions.findIndex((a) => a.id === over.id);
    update('actions', arrayMove(draft.actions, oldIndex, newIndex));
  };

  const addAction = useCallback((action) => {
    setDraft((prev) => ({ ...prev, actions: [...prev.actions, action] }));
    setShowActionPicker(false);
  }, []);

  const deleteAction = useCallback((id) => {
    setDraft((prev) => ({ ...prev, actions: prev.actions.filter((a) => a.id !== id) }));
  }, []);

  const handleSave = () => {
    const err = validate(draft);
    if (err) { setError(err); return; }
    setError('');
    onSave(draft);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 'min(680px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>{isNew ? 'Neue Routine' : 'Routine bearbeiten'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Basic fields */}
        <div className="routine-modal-fields">
          <div className="routine-modal-row routine-modal-row--primary">
            <div className="settings-field routine-modal-name-field">
              <label className="settings-field-label">Name</label>
              <input
                className="form-input"
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="z.B. Morgenroutine"
                autoFocus
              />
            </div>

            <div className="settings-field routine-modal-frequency-field">
              <label className="settings-field-label">
                Häufigkeit
                <span className="ga-tooltip-wrap">
                  <HelpCircle size={11} className="ga-tooltip-icon" />
                  <span className="ga-tooltip-bubble">Aktuell ist nur „täglich“ verfügbar.</span>
                </span>
              </label>
              <input className="form-input" value="Täglich" readOnly style={{ opacity: 0.72 }} />
            </div>

            <div className="settings-field routine-modal-enabled-field">
              <label className="settings-field-label">Aktiv</label>
              <button
                className={`routine-toggle-switch ${draft.enabled ? 'enabled' : ''}`}
                onClick={() => update('enabled', !draft.enabled)}
                aria-label={draft.enabled ? 'Aktiv' : 'Inaktiv'}
                title={draft.enabled ? 'Zum Deaktivieren klicken' : 'Zum Aktivieren klicken'}
              >
                <span className="routine-toggle-knob" />
              </button>
            </div>
          </div>

          <div className="routine-modal-row routine-modal-row--secondary">
            <div className="settings-field routine-modal-trigger-field">
              <label className="settings-field-label">Auslöser</label>
              <div className="routine-trigger-selector">
                <button
                  className={`routine-trigger-btn ${draft.triggerType === 'time' ? 'active' : ''}`}
                  onClick={() => update('triggerType', 'time')}
                >
                  Zeit
                </button>
                <button
                  className={`routine-trigger-btn ${draft.triggerType === 'sunrise' ? 'active' : ''}`}
                  onClick={() => update('triggerType', 'sunrise')}
                  title={!sunTriggerConfigured ? 'Sonnen-Trigger-GA ist im Setup nicht konfiguriert' : ''}
                >
                  Sonnenaufgang
                </button>
                <button
                  className={`routine-trigger-btn ${draft.triggerType === 'sunset' ? 'active' : ''}`}
                  onClick={() => update('triggerType', 'sunset')}
                  title={!sunTriggerConfigured ? 'Sonnen-Trigger-GA ist im Setup nicht konfiguriert' : ''}
                >
                  Sonnenuntergang
                </button>
              </div>
              {!sunTriggerConfigured && draft.triggerType !== 'time' && (
                <div className="routine-trigger-note">
                  Hinweis: Der Sonnen-Trigger benötigt eine GA-Konfiguration im Gebäude-Setup.
                </div>
              )}
            </div>

            <div className={`settings-field routine-modal-time-field ${draft.triggerType === 'time' ? '' : 'routine-modal-time-field--hidden'}`}>
              <label className="settings-field-label">Uhrzeit</label>
              <input
                className="form-input routine-time-input"
                type="time"
                value={draft.time}
                onChange={(e) => update('time', e.target.value)}
                tabIndex={draft.triggerType === 'time' ? 0 : -1}
                aria-hidden={draft.triggerType === 'time' ? 'false' : 'true'}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="routine-actions-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <label className="settings-field-label" style={{ margin: 0 }}>
              Aktionen <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({draft.actions.length})</span>
            </label>
            <button className="btn-secondary" onClick={() => setShowActionPicker(true)}>
              <Plus size={14} /> Aktion hinzufügen
            </button>
          </div>

          {draft.actions.length === 0 ? (
            <div style={{ background: 'var(--glass-bg)', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Noch keine Aktionen. Klicke auf „Aktion hinzufügen", um zu starten.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActionDragEnd}>
              <SortableContext
                items={draft.actions.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {draft.actions.map((action, i) => (
                    <SortableActionRow
                      key={action.id}
                      action={action}
                      floors={floors}
                      index={i}
                      onDelete={deleteAction}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {error && (
          <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSave}>
            <Check size={16} /> {isNew ? 'Routine erstellen' : 'Änderungen speichern'}
          </button>
        </div>
      </div>

      {showActionPicker && (
        <ActionPickerModal
          floors={floors}
          onAdd={addAction}
          onClose={() => setShowActionPicker(false)}
        />
      )}
    </div>,
    document.body
  );
}
