import React, { useState } from 'react';
import {
  Pencil, Trash2, Clock, AlertTriangle, CheckCircle, XCircle, Repeat,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

function getNextRun(time) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function resolveActionInfo(action, floors) {
  if (!floors) return { label: action.targetId, valueStr: null };
  for (const floor of floors) {
    if (!Array.isArray(floor.rooms)) continue;
    const room = floor.rooms.find((r) => r.id === action.roomId);
    if (!room) continue;
    if (action.kind === 'scene') {
      const scene = Array.isArray(room.scenes) ? room.scenes.find((s) => s.id === action.targetId) : null;
      return scene
        ? { label: `${floor.name} › ${room.name} › ${scene.name}`, valueStr: null }
        : null;
    } else {
      const func = Array.isArray(room.functions) ? room.functions.find((f) => f.id === action.targetId) : null;
      const valueStr = action.targetType === 'percentage' ? `${action.value}%` : (action.value ? 'On' : 'Off');
      return func
        ? { label: `${floor.name} › ${room.name} › ${func.name}`, valueStr }
        : null;
    }
  }
  return null;
}

function isBroken(routine, floors) {
  if (!routine.actions || routine.actions.length === 0) return false;
  return routine.actions.some((action) => resolveActionInfo(action, floors) === null);
}

export default function RoutineCard({ routine, floors, onToggle, onEdit, onDelete }) {
  const broken = isBroken(routine, floors);
  const nextRun = getNextRun(routine.time);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className={`routine-card ${broken ? 'routine-card--broken' : ''}`}>
        {/* Header row */}
        <div className="routine-card-header">
          <div className="routine-card-title-row">
            <span className="routine-card-name">{routine.name || 'Unnamed Routine'}</span>
            {broken && (
              <span className="badge badge-broken">
                <AlertTriangle size={12} /> Broken
              </span>
            )}
            {routine.lastRunStatus === 'error' && !broken && (
              <span className="badge badge-error">
                <XCircle size={12} /> Last run failed
              </span>
            )}
            {routine.lastRunStatus === 'ok' && (
              <span className="badge badge-ok">
                <CheckCircle size={12} /> OK
              </span>
            )}
          </div>

          <div className="routine-card-actions">
            {/* Toggle switch */}
            <button
              className={`routine-toggle-switch ${routine.enabled ? 'enabled' : ''}`}
              onClick={() => onToggle(!routine.enabled)}
              title={routine.enabled ? 'Disable routine' : 'Enable routine'}
              disabled={broken && !routine.enabled}
              aria-label={routine.enabled ? 'Routine enabled' : 'Routine disabled'}
            >
              <span className="routine-toggle-knob" />
            </button>
            <button className="icon-btn" onClick={onEdit} title="Edit routine">
              <Pencil size={15} />
            </button>
            <button className="icon-btn btn-danger" onClick={() => setConfirmDelete(true)} title="Delete routine">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="routine-card-meta">
          <span className="routine-meta-tag" title="Time">
            <Clock size={12} /> {routine.time}
          </span>
          <span className="routine-meta-sep" />
          <span className="routine-meta-tag" title="Frequency">
            <Repeat size={12} /> Daily
          </span>
          {nextRun && (
            <>
              <span className="routine-meta-sep" />
              <span className="routine-meta-tag routine-meta-tag--next" title="Next run">
                Next: {nextRun}
              </span>
            </>
          )}
          {routine.lastRunAt && (
            <>
              <span className="routine-meta-sep" />
              <span className="routine-meta-tag routine-meta-tag--last" title="Last run">
                Last: {new Date(routine.lastRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>

        {/* Actions list */}
        {routine.actions && routine.actions.length > 0 && (
          <div className="routine-card-action-list">
            {routine.actions.map((action, i) => {
              const info = resolveActionInfo(action, floors);
              return (
                <div key={action.id} className={`routine-action-chip ${info === null ? 'broken' : ''}`}>
                  <span className="routine-action-index">{i + 1}</span>
                  <span className="routine-action-label">
                    {info ? info.label : <span style={{ color: 'var(--danger-color)' }}>⚠ Target deleted</span>}
                  </span>
                  {info?.valueStr && (
                    <span className="routine-action-value-badge">{info.valueStr}</span>
                  )}
                  <span className="routine-action-kind">{action.kind}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Routine löschen?"
        message={`Soll die Routine „${routine.name || 'Unnamed Routine'}" wirklich gelöscht werden?`}
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        danger
        onConfirm={() => { setConfirmDelete(false); onDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
