import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  Clock3,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { updateConfig } from './configApi';
import ConfirmDialog from './components/ConfirmDialog';

function createRoutineDraft() {
  return {
    id: `automation_${Date.now()}`,
    name: '',
    enabled: true,
    time: '07:00',
    frequency: 'daily',
    actions: [],
    lastRunAt: '',
    lastRunStatus: '',
    lastRunMessage: '',
  };
}

export function buildAutomationCatalog(floors = []) {
  return (Array.isArray(floors) ? floors : []).flatMap((floor) => {
    const scope = floor.isShared ? 'shared' : 'apartment';
    return (floor.rooms || []).flatMap((room) => {
      const sceneEntries = room.sceneGroupAddress
        ? (room.scenes || []).map((scene) => ({
          key: `scene:${scope}:${room.id}:${scene.id}`,
          kind: 'scene',
          scope,
          areaId: floor.id,
          roomId: room.id,
          targetId: scene.id,
          targetType: 'scene',
          label: scene.name || `Scene ${scene.sceneNumber}`,
          subtitle: `${floor.name} > ${room.name}`,
          searchText: `${floor.name} ${room.name} ${scene.name || ''} ${scene.category || ''}`.toLowerCase(),
        }))
        : [];

      const functionEntries = (room.functions || [])
        .filter((func) => func?.groupAddress && (func.type === 'switch' || func.type === 'percentage'))
        .map((func) => ({
          key: `function:${scope}:${room.id}:${func.id}`,
          kind: 'function',
          scope,
          areaId: floor.id,
          roomId: room.id,
          targetId: func.id,
          targetType: func.type,
          label: func.name || 'Function',
          subtitle: `${floor.name} > ${room.name}`,
          searchText: `${floor.name} ${room.name} ${func.name || ''} ${func.type || ''}`.toLowerCase(),
        }));

      return [...sceneEntries, ...functionEntries];
    });
  });
}

function getActionDescriptor(action, catalogMap) {
  const lookupKey = `${action.kind}:${action.scope === 'shared' ? 'shared' : 'apartment'}:${action.roomId}:${action.targetId}`;
  const match = catalogMap.get(lookupKey);
  if (match) {
    return {
      ...match,
      isMissing: false,
    };
  }

  return {
    key: lookupKey,
    kind: action.kind,
    scope: action.scope === 'shared' ? 'shared' : 'apartment',
    label: 'Missing target',
    subtitle: action.scope === 'shared'
      ? 'This shared scene/function no longer exists.'
      : 'This scene/function no longer exists in the apartment.',
    targetType: action.targetType || '',
    isMissing: true,
  };
}

function validateRoutine(draft, catalogMap) {
  if (!draft.name.trim()) return 'Please enter a routine name.';
  if (!/^\d{2}:\d{2}$/.test(draft.time)) return 'Please choose a valid time.';
  if (!Array.isArray(draft.actions) || draft.actions.length === 0) {
    return 'Add at least one action.';
  }

  for (const action of draft.actions) {
    const descriptor = getActionDescriptor(action, catalogMap);
    if (descriptor.isMissing) return 'One or more actions point to a missing scene or function.';
    if (action.kind === 'function' && descriptor.targetType === 'percentage') {
      const numericValue = Number(action.value);
      if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
        return 'Percentage functions need a value between 0 and 100.';
      }
    }
  }

  return '';
}

function formatTimestamp(value) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function getNextRunLabel(routine) {
  if (routine.enabled === false) return 'Disabled';
  const now = new Date();
  const [hours, minutes] = String(routine.time || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 'Invalid time';

  const nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(nextRun);
}

function RoutineCard({ routine, catalogMap, onToggleEnabled, onEdit, onDelete }) {
  const actionDescriptors = routine.actions.map((action) => getActionDescriptor(action, catalogMap));

  return (
    <article className="automation-card">
      <div className="automation-card-header">
        <div>
          <div className="automation-card-topline">
            <h3>{routine.name}</h3>
            <span className={`automation-status-pill status-${routine.lastRunStatus || 'idle'}`}>
              {routine.enabled === false ? 'Disabled' : (routine.lastRunStatus || 'Ready')}
            </span>
          </div>
          <div className="automation-card-meta">
            <span><Clock3 size={14} /> {routine.time}</span>
            <span><AlarmClock size={14} /> Daily</span>
            <span><WandSparkles size={14} /> {routine.actions.length} action{routine.actions.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        <label className="automation-toggle">
          <span className="settings-toggle-switch">
            <input
              type="checkbox"
              checked={routine.enabled !== false}
              onChange={(event) => onToggleEnabled(event.target.checked)}
              aria-label={`Enable ${routine.name}`}
            />
            <span className="settings-toggle-slider" />
          </span>
        </label>
      </div>

      <div className="automation-card-timestamps">
        <span>Next run: <strong>{getNextRunLabel(routine)}</strong></span>
        <span>Last run: <strong>{formatTimestamp(routine.lastRunAt)}</strong></span>
      </div>

      {routine.lastRunMessage && (
        <p className="automation-last-message">{routine.lastRunMessage}</p>
      )}

      <div className="automation-action-pills">
        {actionDescriptors.map((descriptor, index) => (
          <span
            key={`${descriptor.key}-${index}`}
            className={`automation-action-pill ${descriptor.isMissing ? 'automation-action-pill-missing' : ''}`}
          >
            {descriptor.label}
          </span>
        ))}
      </div>

      <div className="automation-card-actions">
        <button className="btn-secondary" onClick={onEdit}>
          <Pencil size={16} /> Edit
        </button>
        <button className="btn-danger" onClick={onDelete}>
          <Trash2 size={16} /> Delete
        </button>
      </div>
    </article>
  );
}

function ActionPickerModal({ open, query, setQuery, options, onSelect, onClose }) {
  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content automation-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="automation-modal-header">
          <div>
            <h2>Add Action</h2>
            <p>Search scenes and KNX functions from this apartment and its shared areas.</p>
          </div>
        </div>

        <div className="automation-search-row">
          <Search size={18} />
          <input
            className="form-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a room, scene or function..."
            autoFocus
          />
        </div>

        <div className="automation-picker-list">
          {options.length === 0 ? (
            <div className="automation-picker-empty">No configured scene or KNX function matches this search.</div>
          ) : options.map((option) => (
            <button
              key={option.key}
              className="automation-picker-item"
              onClick={() => onSelect(option)}
            >
              <div>
                <div className="automation-picker-item-title">{option.label}</div>
                <div className="automation-picker-item-copy">{option.subtitle}</div>
              </div>
              <span className="automation-picker-type">{option.kind === 'scene' ? 'Scene' : option.targetType}</span>
            </button>
          ))}
        </div>

        <div className="confirm-dialog-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Automation({
  fullConfig,
  apartment,
  config,
  fetchConfig,
  applyConfig,
  addToast,
}) {
  const [routines, setRoutines] = useState(Array.isArray(config.automations) ? config.automations : []);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState(createRoutineDraft());
  const [editorMode, setEditorMode] = useState('create');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    danger: true,
    onConfirm: null,
  });

  useEffect(() => {
    setRoutines(Array.isArray(config.automations) ? config.automations : []);
  }, [config.automations, apartment.id]);

  const catalog = useMemo(() => buildAutomationCatalog(config.floors), [config.floors]);
  const catalogMap = useMemo(() => new Map(catalog.map((entry) => [entry.key, entry])), [catalog]);
  const filteredCatalog = useMemo(() => {
    const normalizedQuery = pickerQuery.trim().toLowerCase();
    if (!normalizedQuery) return catalog;
    return catalog.filter((entry) => entry.searchText.includes(normalizedQuery));
  }, [catalog, pickerQuery]);

  const persistAutomations = async (nextAutomations, { successMessage = '', silent = false } = {}) => {
    setSaving(true);
    try {
      const nextConfig = {
        ...fullConfig,
        apartments: fullConfig.apartments.map((entry) => (
          entry.id === apartment.id
            ? { ...entry, automations: nextAutomations }
            : entry
        )),
      };
      const result = await updateConfig(nextConfig);
      setRoutines(nextAutomations);
      if (result?.config) applyConfig?.(result.config);
      else await fetchConfig();
      if (!silent && successMessage) addToast(successMessage, 'success');
      return true;
    } catch {
      addToast('Failed to save automation settings', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openCreateEditor = () => {
    setEditorMode('create');
    setEditorDraft(createRoutineDraft());
    setValidationError('');
    setEditorOpen(true);
  };

  const openEditEditor = (routine) => {
    setEditorMode('edit');
    setEditorDraft({
      ...routine,
      actions: Array.isArray(routine.actions) ? [...routine.actions] : [],
    });
    setValidationError('');
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setPickerOpen(false);
    setPickerQuery('');
    setValidationError('');
  };

  const handleAddAction = (option) => {
    setEditorDraft((prev) => ({
      ...prev,
      actions: [
        ...prev.actions,
        {
          id: `automation_action_${Date.now()}`,
          kind: option.kind,
          scope: option.scope,
          areaId: option.areaId,
          roomId: option.roomId,
          targetId: option.targetId,
          targetType: option.targetType,
          ...(option.kind === 'function'
            ? { value: option.targetType === 'switch' ? true : 50 }
            : {}),
        },
      ],
    }));
    setPickerQuery('');
    setPickerOpen(false);
  };

  const handleSaveRoutine = async () => {
    const error = validateRoutine(editorDraft, catalogMap);
    if (error) {
      setValidationError(error);
      return;
    }

    const nextRoutines = editorMode === 'edit'
      ? routines.map((routine) => routine.id === editorDraft.id ? editorDraft : routine)
      : [...routines, editorDraft];

    const success = await persistAutomations(nextRoutines, {
      successMessage: editorMode === 'edit' ? 'Routine updated' : 'Routine created',
    });
    if (success) closeEditor();
  };

  const handleToggleEnabled = async (routine, enabled) => {
    const nextRoutines = routines.map((entry) => (
      entry.id === routine.id ? { ...entry, enabled } : entry
    ));
    await persistAutomations(nextRoutines, { silent: true });
  };

  const handleDeleteRoutine = (routine) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Routine',
      message: `Delete "${routine.name}"? This removes the routine and all of its actions.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirm: async () => {
        const nextRoutines = routines.filter((entry) => entry.id !== routine.id);
        const success = await persistAutomations(nextRoutines, { successMessage: 'Routine deleted' });
        if (success) {
          setConfirmDialog((prev) => ({ ...prev, open: false, onConfirm: null }));
        }
      },
    });
  };

  const updateAction = (index, updater) => {
    setEditorDraft((prev) => ({
      ...prev,
      actions: prev.actions.map((action, actionIndex) => (
        actionIndex === index ? updater(action) : action
      )),
    }));
  };

  return (
    <div className="automation-page glass-panel">
      <div className="automation-hero">
        <div>
          <div className="connections-group-label">Automation</div>
          <h2 className="connections-page-title">Routines</h2>
          <p className="connections-page-copy">
            Run daily scenes and KNX functions for {apartment.name}. Shared areas of this apartment can be used too.
          </p>
        </div>

        <button className="btn-primary" onClick={openCreateEditor}>
          <Plus size={18} /> Add Routine
        </button>
      </div>

      {routines.length === 0 ? (
        <div className="automation-empty-state">
          <AlarmClock size={28} />
          <div>
            <h3>No routines yet</h3>
            <p>Create the first routine to run scenes or KNX functions every day.</p>
          </div>
        </div>
      ) : (
        <div className="automation-grid">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              catalogMap={catalogMap}
              onToggleEnabled={(enabled) => handleToggleEnabled(routine, enabled)}
              onEdit={() => openEditEditor(routine)}
              onDelete={() => handleDeleteRoutine(routine)}
            />
          ))}
        </div>
      )}

      {editorOpen && createPortal(
        <div className="modal-overlay" onClick={closeEditor}>
          <div className="modal-content automation-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="automation-modal-header">
              <div>
                <h2>{editorMode === 'edit' ? 'Edit Routine' : 'Add Routine'}</h2>
                <p>Choose the time and actions this apartment should run every day.</p>
              </div>
            </div>

            <div className="automation-editor-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="automation-name">Name</label>
                <input
                  id="automation-name"
                  className="form-input"
                  value={editorDraft.name}
                  onChange={(event) => setEditorDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Morning Routine"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="automation-time">Time</label>
                <input
                  id="automation-time"
                  type="time"
                  className="form-input"
                  value={editorDraft.time}
                  onChange={(event) => setEditorDraft((prev) => ({ ...prev, time: event.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="automation-frequency">Frequency</label>
                <select
                  id="automation-frequency"
                  className="form-select"
                  value={editorDraft.frequency}
                  onChange={(event) => setEditorDraft((prev) => ({ ...prev, frequency: event.target.value }))}
                >
                  <option value="daily">Daily</option>
                </select>
              </div>

              <div className="form-group automation-enabled-field">
                <label className="form-label">Enabled</label>
                <label className="automation-enabled-toggle">
                  <span>{editorDraft.enabled !== false ? 'Active' : 'Disabled'}</span>
                  <span className="settings-toggle-switch">
                    <input
                      type="checkbox"
                      checked={editorDraft.enabled !== false}
                      onChange={(event) => setEditorDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
                    />
                    <span className="settings-toggle-slider" />
                  </span>
                </label>
              </div>
            </div>

            <div className="automation-editor-section">
              <div className="automation-editor-section-header">
                <div>
                  <h3>Actions</h3>
                  <p>Actions run in the order shown below.</p>
                </div>
                <button className="btn-secondary" onClick={() => setPickerOpen(true)}>
                  <Search size={16} /> Add Action
                </button>
              </div>

              <div className="automation-editor-actions">
                {editorDraft.actions.length === 0 ? (
                  <div className="automation-editor-empty">
                    Add at least one scene or KNX function.
                  </div>
                ) : editorDraft.actions.map((action, index) => {
                  const descriptor = getActionDescriptor(action, catalogMap);
                  return (
                    <div key={action.id} className={`automation-editor-action ${descriptor.isMissing ? 'is-missing' : ''}`}>
                      <div className="automation-editor-action-main">
                        <div className="automation-editor-action-copy">
                          <strong>{descriptor.label}</strong>
                          <span>{descriptor.subtitle}</span>
                        </div>

                        {action.kind === 'function' && descriptor.targetType === 'switch' && (
                          <select
                            className="form-select automation-action-value"
                            value={action.value === true || action.value === 'true' || action.value === 1 || action.value === '1' ? 'true' : 'false'}
                            onChange={(event) => updateAction(index, (current) => ({ ...current, value: event.target.value === 'true' }))}
                          >
                            <option value="true">On / 1</option>
                            <option value="false">Off / 0</option>
                          </select>
                        )}

                        {action.kind === 'function' && descriptor.targetType === 'percentage' && (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="form-input automation-action-value"
                            value={action.value}
                            onChange={(event) => updateAction(index, (current) => ({ ...current, value: event.target.value }))}
                            aria-label={`Value for ${descriptor.label}`}
                          />
                        )}
                      </div>

                      <div className="automation-editor-action-tools">
                        <button
                          className="btn-secondary-sm"
                          onClick={() => {
                            if (index === 0) return;
                            setEditorDraft((prev) => {
                              const nextActions = [...prev.actions];
                              [nextActions[index - 1], nextActions[index]] = [nextActions[index], nextActions[index - 1]];
                              return { ...prev, actions: nextActions };
                            });
                          }}
                          aria-label={`Move ${descriptor.label} up`}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="btn-secondary-sm"
                          onClick={() => {
                            if (index === editorDraft.actions.length - 1) return;
                            setEditorDraft((prev) => {
                              const nextActions = [...prev.actions];
                              [nextActions[index], nextActions[index + 1]] = [nextActions[index + 1], nextActions[index]];
                              return { ...prev, actions: nextActions };
                            });
                          }}
                          aria-label={`Move ${descriptor.label} down`}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => setEditorDraft((prev) => ({
                            ...prev,
                            actions: prev.actions.filter((_, actionIndex) => actionIndex !== index),
                          }))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {validationError && <p className="connections-error automation-validation-error">{validationError}</p>}

            <div className="confirm-dialog-actions">
              <button className="btn-secondary" onClick={closeEditor} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveRoutine} disabled={saving}>
                <Power size={16} /> {editorMode === 'edit' ? 'Save Routine' : 'Create Routine'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ActionPickerModal
        open={pickerOpen}
        query={pickerQuery}
        setQuery={setPickerQuery}
        options={filteredCatalog}
        onSelect={handleAddAction}
        onClose={() => {
          setPickerOpen(false);
          setPickerQuery('');
        }}
      />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        danger={confirmDialog.danger}
        onConfirm={() => confirmDialog.onConfirm?.()}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false, onConfirm: null }))}
      />
    </div>
  );
}
