import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Check, Plus, GripVertical, Trash2,
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
      <span className="drag-handle" {...attributes} {...listeners} title="Drag to reorder">
        <GripVertical size={16} />
      </span>
      <span className="routine-action-index">{index + 1}</span>
      <span className="routine-action-label" style={{ flex: 1 }}>
        {label ?? <span style={{ color: 'var(--danger-color)' }}>⚠ Target deleted</span>}
      </span>
      <span className="routine-action-kind">{action.kind}</span>
      {action.kind === 'function' && (
        <span className="routine-action-value">
          {action.targetType === 'percentage' ? `${action.value}%` : (action.value ? 'On' : 'Off')}
        </span>
      )}
      <button className="icon-btn btn-danger" onClick={() => onDelete(action.id)} title="Remove action">
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
  if (!routine.name || !routine.name.trim()) return 'Name is required.';
  if (!routine.time || !/^\d{2}:\d{2}$/.test(routine.time)) return 'Valid time (HH:mm) is required.';
  if (!routine.actions || routine.actions.length === 0) return 'At least one action is required.';
  return null;
}

export default function RoutineModal({ routine, floors, onSave, onClose }) {
  const isNew = !routine;
  const [draft, setDraft] = useState(() => routine ? { ...routine, actions: [...(routine.actions || [])] } : {
    id: `automation_${Date.now()}`,
    name: '',
    enabled: true,
    time: '08:00',
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
          <h3 style={{ margin: 0 }}>{isNew ? 'New Routine' : 'Edit Routine'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Basic fields */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div className="settings-field" style={{ flex: 2, minWidth: '200px' }}>
            <label className="settings-field-label">Name</label>
            <input
              className="form-input"
              value={draft.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Morning Routine"
              autoFocus
            />
          </div>
          <div className="settings-field" style={{ width: '130px' }}>
            <label className="settings-field-label">Time</label>
            <input
              className="form-input"
              type="time"
              value={draft.time}
              onChange={(e) => update('time', e.target.value)}
            />
          </div>
          <div className="settings-field" style={{ width: '120px' }}>
            <label className="settings-field-label">Frequency</label>
            <input className="form-input" value="Daily" readOnly style={{ opacity: 0.6 }} />
          </div>
          <div className="settings-field" style={{ width: '100px' }}>
            <label className="settings-field-label">Enabled</label>
            <button
              className={`routine-toggle-switch ${draft.enabled ? 'enabled' : ''}`}
              style={{ marginTop: '0.5rem' }}
              onClick={() => update('enabled', !draft.enabled)}
              aria-label={draft.enabled ? 'Enabled' : 'Disabled'}
              title={draft.enabled ? 'Click to disable' : 'Click to enable'}
            >
              <span className="routine-toggle-knob" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <label className="settings-field-label" style={{ margin: 0 }}>
              Actions <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({draft.actions.length})</span>
            </label>
            <button className="btn-secondary" onClick={() => setShowActionPicker(true)}>
              <Plus size={14} /> Add Action
            </button>
          </div>

          {draft.actions.length === 0 ? (
            <div style={{ background: 'var(--glass-bg)', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              No actions added yet. Click "Add Action" to get started.
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
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            <Check size={16} /> {isNew ? 'Create Routine' : 'Save Changes'}
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
