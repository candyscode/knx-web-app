import React, { useState } from 'react';
import { Plus, Search, Check, X, AlertTriangle, Info, Thermometer, Wind, Sun } from 'lucide-react';

export default function GlobalsConfig({ globals, setGlobals, saveGlobals, openGroupAddressModal }) {
  const [addingType, setAddingType] = useState(null); // 'info' or 'alarm' or null
  const [draft, setDraft] = useState({ name: '', category: 'temperature', statusGroupAddress: '' });

  const getCategoryIcon = (type, category) => {
    if (type === 'alarm') return <AlertTriangle size={18} style={{ color: 'var(--danger-color)' }} />;
    if (category === 'temperature') return <Thermometer size={18} style={{ color: '#3b82f6' }} />;
    if (category === 'wind') return <Wind size={18} style={{ color: '#0ea5e9' }} />;
    if (category === 'lux') return <Sun size={18} style={{ color: '#eab308' }} />;
    return <Info size={18} />;
  };

  const handleAdd = () => {
    if (!draft.name) return;
    const newGlobal = { 
      id: `global_${Date.now()}`, 
      name: draft.name,
      type: addingType,
      category: addingType === 'alarm' ? 'alarm' : draft.category,
      statusGroupAddress: draft.statusGroupAddress,
      dpt: '' // will be populated from XML import
    };
    saveGlobals([...globals, newGlobal]);
    setAddingType(null);
    setDraft({ name: '', category: 'temperature', statusGroupAddress: '' });
  };

  const handleDelete = (id) => {
    if (!window.confirm("Are you sure you want to delete this global item?")) return;
    saveGlobals(globals.filter(g => g.id !== id));
  };

  const updateItem = (id, key, val) => {
    setGlobals(globals.map(g => g.id === id ? { ...g, [key]: val } : g));
  };

  const openGAModal = (id, currentType) => {
    const dptFilter = currentType === 'alarm' ? '1.' : '9.';
    openGroupAddressModal({
      title: 'Select Group Address for Global Item',
      mode: 'any',
      dptFilter: dptFilter,
      target: { kind: 'global', id },
      allowUpload: false,
      helperText: `Select a compatible imported ETS group address matching DPT ${dptFilter}x.`
    });
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      {globals.length === 0 && !addingType && (
        <div style={{ background: 'var(--glass-bg)', padding: '1.5rem', borderRadius: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p>No global values or alarms configured yet.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {globals.map(g => (
          <div key={g.id} className="function-card" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingRight: '3rem' }}>
            
            {/* Absolute close button in top right */}
            <button 
              type="button" 
              className="icon-btn btn-danger" 
              onClick={() => handleDelete(g.id)} 
              title="Delete item"
              style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', width: '26px', height: '26px', padding: '0', borderRadius: '50%' }}
            >
              <X size={14} />
            </button>
            
            <div style={{ padding: '1rem 0 0.5rem 0.5rem' }} title={g.type === 'alarm' ? 'Alarm' : g.category}>
              {getCategoryIcon(g.type, g.category)}
            </div>

            <div className="settings-field" style={{ flex: 1, minWidth: '150px' }}>
              <label className="settings-field-label">Name</label>
              <input
                className="form-input"
                value={g.name}
                onChange={e => updateItem(g.id, 'name', e.target.value)}
                onBlur={() => saveGlobals(globals)}
                placeholder={g.type === 'alarm' ? 'e.g. Rain Alarm' : 'e.g. Outside Temperature'}
              />
            </div>

            {g.type === 'info' && (
              <div className="settings-field" style={{ width: '220px' }}>
                <label className="settings-field-label">Category</label>
                <select className="form-select" value={g.category} onChange={e => saveGlobals(globals.map(item => item.id === g.id ? { ...item, category: e.target.value } : item))}>
                  <option value="temperature">Temperature (°C)</option>
                  <option value="wind">Wind (m/s)</option>
                  <option value="lux">Brightness (Lux)</option>
                </select>
              </div>
            )}

            <div className="settings-field" style={{ flex: 1, minWidth: '150px' }}>
              <label className="settings-field-label">Group Address</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  className="form-input"
                  value={g.statusGroupAddress || ''}
                  onChange={e => updateItem(g.id, 'statusGroupAddress', e.target.value)}
                  onBlur={() => saveGlobals(globals)}
                  placeholder="e.g. 1/1/1"
                />
                <button
                  type="button"
                  className="btn-secondary-sm"
                  onClick={() => openGAModal(g.id, g.type)}
                  title="Browse ETS addresses"
                >
                  <Search size={14} />
                </button>
              </div>
            </div>

            {/* Hidden DPT field in UI, but it exists in the data model. */}

          </div>
        ))}
      </div>

      {!addingType ? (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button className="btn-secondary" onClick={() => setAddingType('info')}>
            <Plus size={16} /> Add Information
          </button>
          <button className="btn-secondary" onClick={() => setAddingType('alarm')} style={{ color: 'var(--danger-color)' }}>
            <AlertTriangle size={16} /> Add Alarm
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '1rem', background: 'var(--glass-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {addingType === 'alarm' ? <><AlertTriangle size={16} /> New Alarm</> : <><Info size={16} /> New Global Information</>}
          </h4>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder={addingType === 'alarm' ? "Name (e.g. Rain Alarm)" : "Name (e.g. Outside Temperature)"}
              style={{ flex: 1, minWidth: '200px' }}
              autoFocus
            />
            {addingType === 'info' && (
              <select
                className="form-select"
                value={draft.category}
                onChange={e => setDraft({ ...draft, category: e.target.value })}
                style={{ width: '220px', minWidth: '220px' }}
              >
                <option value="temperature">Temperature (°C)</option>
                <option value="wind">Wind (m/s)</option>
                <option value="lux">Brightness (Lux)</option>
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={handleAdd} disabled={!draft.name}>
              <Check size={16} /> Save Item
            </button>
            <button className="btn-secondary" onClick={() => { setAddingType(null); setDraft({ name: '', category: 'temperature', statusGroupAddress: '' });}}>
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
