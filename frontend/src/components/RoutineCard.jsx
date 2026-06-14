import React, { useState } from 'react';
import {
  Pencil, Trash2, Clock, AlertTriangle, CheckCircle, XCircle, Repeat, Sunrise, Sunset
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
      const valueStr = (action.targetType === 'percentage' || action.targetType === 'dimmer') ? `${action.value}%` : (action.value ? 'An' : 'Aus');
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
  const nextRun = (!routine.triggerType || routine.triggerType === 'time') ? getNextRun(routine.time) : null;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOn = routine.enabled;
  const trigIcon = (!routine.triggerType || routine.triggerType === 'time')
    ? <Clock size={11} color="#a8c5bf" />
    : routine.triggerType === 'sunrise'
    ? <Sunrise size={11} color="#ffc89a" />
    : <Sunset size={11} color="#ffc89a" />;
  const trigLabel = (!routine.triggerType || routine.triggerType === 'time')
    ? routine.time
    : routine.triggerType === 'sunrise' ? 'Sonnenaufgang' : 'Sonnenuntergang';

  const TAG = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,222,184,0.04)', border: '1px solid rgba(255,222,184,0.08)', color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap' };

  return (
    <>
      <div style={{
        background: 'var(--bg-card)', border: `1px solid ${broken ? 'rgba(239,68,68,0.25)' : 'rgba(255,222,184,0.08)'}`,
        borderRadius: 18, padding: 14, opacity: isOn ? 1 : 0.6, transition: 'opacity 0.2s ease',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{routine.name || 'Unbenannte Routine'}</span>
              {broken && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,123,114,0.12)', border: '1px solid rgba(255,123,114,0.25)', color: '#ff9c95', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={10} /> Fehlerhaft
                </span>
              )}
              {routine.lastRunStatus === 'ok' && !broken && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(111,212,156,0.10)', color: '#9ee2bd' }}>OK</span>
              )}
              {routine.lastRunStatus === 'error' && !broken && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,123,114,0.10)', color: '#ff9c95' }}>Fehler</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={TAG}>{trigIcon} {trigLabel}</span>
              <span style={TAG}><Repeat size={11} /> Täglich</span>
              {nextRun && <span style={{ ...TAG, background: 'rgba(224,139,93,0.12)', border: '1px solid rgba(224,139,93,0.26)', color: '#e8c39c' }}>Nächste: {nextRun}</span>}
              {routine.lastRunAt && (
                <span style={{ ...TAG, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', paddingLeft: 0 }}>
                  Zuletzt: {new Date(routine.lastRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
          {/* Toggle */}
          <button
            onClick={() => onToggle(!isOn)}
            title={isOn ? 'Routine deaktivieren' : 'Routine aktivieren'}
            disabled={broken && !isOn}
            aria-label={isOn ? 'Routine aktiviert' : 'Routine deaktiviert'}
            className={`routine-toggle-switch${isOn ? ' enabled' : ''}`}
            style={{
              width: 40, height: 24, borderRadius: 999, border: 'none', cursor: broken && !isOn ? 'not-allowed' : 'pointer',
              background: isOn ? 'linear-gradient(180deg,#c47a47 0%,#ad5d2e 100%)' : 'rgba(255,222,184,0.08)',
              position: 'relative', flexShrink: 0, padding: 0,
            }}
          >
            <span className="routine-toggle-knob" style={{
              position: 'absolute', top: 3, left: 3,
              width: 18, height: 18, borderRadius: 999,
              background: isOn ? '#fff' : '#b6a995',
              transform: isOn ? 'translateX(16px)' : 'translateX(0)',
              transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              display: 'block',
            }} />
          </button>
          <button
            title="Routine bearbeiten"
            onClick={onEdit}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,222,184,0.08)', background: 'rgba(255,222,184,0.04)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}>
            <Pencil size={14} />
          </button>
          <button
            title="Routine löschen"
            onClick={() => setConfirmDelete(true)}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,123,114,0.22)', background: 'rgba(255,123,114,0.06)', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#ff9c95', flexShrink: 0 }}>
            <Trash2 size={14} />
          </button>
        </div>

        {/* Actions list */}
        {routine.actions && routine.actions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,222,184,0.06)' }}>
            {routine.actions.map((action, i) => {
              const info = resolveActionInfo(action, floors);
              return (
                <div key={action.id} className={`routine-action-chip ${info === null ? 'broken' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,222,184,0.05)', border: '1px solid rgba(255,222,184,0.08)', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>{i + 1}</div>
                  <span className="routine-action-label" style={{ flex: 1, color: info ? 'var(--text-primary)' : 'var(--danger-color)', fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {info ? info.label : '⚠ Ziel gelöscht'}
                  </span>
                  {info?.valueStr && (
                    <span className="routine-action-value-badge" style={{ padding: '2px 6px', borderRadius: 5, background: 'rgba(224,139,93,0.12)', color: '#e8c39c', fontSize: 10, fontWeight: 600 }}>{info.valueStr}</span>
                  )}
                  <span className="routine-action-kind" style={{ padding: '2px 6px', borderRadius: 5, background: 'rgba(255,222,184,0.04)', color: 'var(--text-tertiary)', fontSize: 10, fontWeight: 600 }}>{action.kind === 'scene' ? 'Szene' : 'Funktion'}</span>
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
