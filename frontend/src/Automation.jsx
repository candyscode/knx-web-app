import React, { useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { updateConfig } from './configApi';
import RoutineCard from './components/RoutineCard';
import RoutineModal from './components/RoutineModal';

export default function Automation({ apartment, config, fetchConfig, applyConfig, addToast }) {
  const automations = Array.isArray(config.automations) ? config.automations : [];

  const [modalState, setModalState] = useState({ open: false, routine: null }); // routine=null → create

  const persistAutomations = async (nextAutomations) => {
    try {
      const result = await updateConfig({
        apartmentId: apartment.id,
        automations: nextAutomations,
      });
      if (result?.config) applyConfig(result.config);
      else await fetchConfig();
      return true;
    } catch {
      addToast('Failed to save automations', 'error');
      return false;
    }
  };

  const handleToggleEnabled = async (id, enabled) => {
    const next = automations.map((a) => a.id === id ? { ...a, enabled } : a);
    await persistAutomations(next);
  };

  const handleDelete = async (id) => {
    const next = automations.filter((a) => a.id !== id);
    const ok = await persistAutomations(next);
    if (ok) addToast('Routine deleted', 'success');
  };

  const handleSaveRoutine = async (routine) => {
    let next;
    if (automations.find((a) => a.id === routine.id)) {
      next = automations.map((a) => a.id === routine.id ? routine : a);
    } else {
      next = [...automations, routine];
    }
    const ok = await persistAutomations(next);
    if (ok) {
      addToast(routine.name ? `"${routine.name}" saved` : 'Routine saved', 'success');
      setModalState({ open: false, routine: null });
    }
  };

  return (
    <div style={{ padding: '0 18px 100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>Automation</div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>Routinen</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            Zeit, Sonnenauf- und -untergang Trigger
          </p>
        </div>
        <button
          onClick={() => setModalState({ open: true, routine: null })}
          style={{
            padding: '10px 14px', borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg,#ffc78a,#c66a35)',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, color: '#fff',
          }}
        >
          <Plus size={13} color="#fff" /> Routine
        </button>
      </div>

      {automations.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          background: 'rgba(255,222,184,0.02)', borderRadius: 18,
          border: '1px dashed rgba(255,222,184,0.10)',
        }}>
          <Bot size={36} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: 16, fontWeight: 600 }}>Keine Routinen</h3>
          <p style={{ color: 'var(--text-tertiary)', marginBottom: '1.5rem', fontSize: 13 }}>
            Erstelle deine erste Routine für zeitgesteuerte Aktionen.
          </p>
          <button
            onClick={() => setModalState({ open: true, routine: null })}
            style={{
              padding: '10px 18px', borderRadius: 12,
              background: 'linear-gradient(135deg,#ffc78a,#c66a35)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, color: '#fff',
            }}
          >
            <Plus size={13} color="#fff" /> Routine hinzufügen
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {automations.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              floors={config.floors}
              onToggle={(enabled) => handleToggleEnabled(routine.id, enabled)}
              onEdit={() => setModalState({ open: true, routine })}
              onDelete={() => handleDelete(routine.id)}
            />
          ))}
        </div>
      )}

      {modalState.open && (
        <RoutineModal
          routine={modalState.routine}
          floors={config.floors}
          sunTriggerConfigured={!!config.sunTrigger?.groupAddress}
          onSave={handleSaveRoutine}
          onClose={() => setModalState({ open: false, routine: null })}
        />
      )}
    </div>
  );
}
