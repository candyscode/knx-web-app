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
    <div className="glass-panel settings-panel automation-page">
      <div className="page-hero">
        <div>
          <div className="page-eyebrow">Automation</div>
          <h2 className="page-title">Routines</h2>
          <p className="page-copy">
            Time-based routines — executed at local server time
          </p>
        </div>
        <div className="page-hero-statuses">
          <button
            className="btn-primary"
            onClick={() => setModalState({ open: true, routine: null })}
          >
            <Plus size={16} /> Add Routine
          </button>
        </div>
      </div>

      {automations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <Bot size={40} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No routines yet</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Create your first routine to automate scenes and functions on a schedule.
          </p>
          <button className="btn-primary" onClick={() => setModalState({ open: true, routine: null })}>
            <Plus size={16} /> Add Routine
          </button>
        </div>
      ) : (
        <div className="automation-list">
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
          onSave={handleSaveRoutine}
          onClose={() => setModalState({ open: false, routine: null })}
        />
      )}
    </div>
  );
}
