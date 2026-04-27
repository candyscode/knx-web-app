import React, { useState, useEffect } from 'react';
import { Plus, Search, Check, X, AlertTriangle, Info, Thermometer, Wind, Sun } from 'lucide-react';

function ItemSection({
  title,
  items,
  type,
  setItems,
  saveItems,
  openGroupAddressModal,
  emptyText,
  resolveGroupAddressName,
  requestConfirm,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', category: 'temperature', statusGroupAddress: '' });
  // Local shadow state so edits don't trigger saves on every keystroke
  const [localItems, setLocalItems] = useState(() => items);

  // Keep local shadow in sync when parent items change (e.g. after navigation)
  useEffect(() => { setLocalItems(items); }, [items]);

  const getCategoryIcon = (category) => {
    if (type === 'alarm') return <AlertTriangle size={18} style={{ color: 'var(--danger-color)' }} />;
    if (category === 'temperature') return <Thermometer size={18} style={{ color: '#3b82f6' }} />;
    if (category === 'wind') return <Wind size={18} style={{ color: '#0ea5e9' }} />;
    if (category === 'lux') return <Sun size={18} style={{ color: '#eab308' }} />;
    return <Info size={18} />;
  };

  const handleAdd = async () => {
    if (!draft.name.trim()) return;

    const nextItems = [
      ...localItems,
      {
        id: `${type}_${Date.now()}`,
        name: draft.name.trim(),
        type,
        category: type === 'alarm' ? 'alarm' : draft.category,
        statusGroupAddress: draft.statusGroupAddress,
        dpt: '',
      },
    ];

    const success = await saveItems(nextItems);
    if (success) {
      setAdding(false);
      setDraft({ name: '', category: 'temperature', statusGroupAddress: '' });
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await requestConfirm?.({
      title: type === 'alarm' ? 'Delete Alarm' : 'Delete Central Information',
      message: 'Delete this item?',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const next = localItems.filter((item) => item.id !== id);
    setLocalItems(next);
    setItems(next);
    await saveItems(next);
  };

  // Only update local shadow — persist on blur
  const updateLocalItem = (id, key, value) => {
    setLocalItems((prev) => prev.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  // Persist after a field loses focus (silent — no toast)
  const commitItem = (id) => {
    const updated = localItems.map((item) =>
      item.id === id ? localItems.find((i) => i.id === id) : item
    );
    setItems(localItems);
    saveItems(localItems);
  };

  // For dropdowns that don't have a blur event — persist immediately but silently
  const updateAndCommitItem = (id, key, value) => {
    const next = localItems.map((item) => item.id === id ? { ...item, [key]: value } : item);
    setLocalItems(next);
    setItems(next);
    saveItems(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <button className="btn-secondary" onClick={() => setAdding(true)}>
          <Plus size={16} /> {type === 'alarm' ? 'Add Alarm' : 'Add Central Information'}
        </button>
      </div>

      {items.length === 0 && !adding && (
        <div style={{ background: 'var(--glass-bg)', padding: '1.25rem', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          {emptyText}
        </div>
      )}

      {localItems.map((item) => (
        <div key={item.id} className="function-card" style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', paddingRight: '3rem' }}>
          <button
            type="button"
            className="icon-btn btn-danger"
            onClick={() => handleDelete(item.id)}
            title="Delete item"
            style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', width: '26px', height: '26px', padding: '0', borderRadius: '50%' }}
          >
            <X size={14} />
          </button>

          <div style={{ padding: '2.05rem 0 0.5rem 0.5rem' }}>{getCategoryIcon(item.category)}</div>

          <div className="settings-field" style={{ flex: 1, minWidth: '180px' }}>
            <label className="settings-field-label">Name</label>
            <input
              className="form-input"
              value={item.name}
              onChange={(event) => updateLocalItem(item.id, 'name', event.target.value)}
              onBlur={() => commitItem(item.id)}
              placeholder={type === 'alarm' ? 'e.g. Rain Alarm' : 'e.g. Outside Temperature'}
            />
          </div>

          {type === 'info' && (
            <div className="settings-field" style={{ width: '240px', minWidth: '240px' }}>
              <label className="settings-field-label">Category</label>
              <select
                className="form-select"
                value={item.category}
                onChange={(event) => updateAndCommitItem(item.id, 'category', event.target.value)}
              >
                <option value="temperature">Temperature (°C)</option>
                <option value="wind">Wind (m/s)</option>
                <option value="lux">Brightness (Lux)</option>
              </select>
            </div>
          )}

          <div className="settings-field" style={{ flex: 1, minWidth: '180px' }}>
            <label className="settings-field-label">Group Address</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                className="form-input"
                value={item.statusGroupAddress || ''}
                onChange={(event) => updateLocalItem(item.id, 'statusGroupAddress', event.target.value)}
                onBlur={() => commitItem(item.id)}
                placeholder="e.g. 1/1/1"
              />
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => openGroupAddressModal({
                  title: type === 'alarm' ? 'Select Alarm Group Address' : 'Select Central Information Group Address',
                  mode: 'any',
                  dptFilter: type === 'alarm' ? '1.' : '9.',
                  target: { kind: type === 'alarm' ? 'alarm' : 'sharedInfo', id: item.id },
                  allowUpload: false,
                  helperText: type === 'alarm'
                    ? 'Select a compatible alarm GA matching DPT 1.x.'
                    : 'Select a compatible central information GA matching DPT 9.x.',
                  scope: type === 'alarm' ? 'apartment' : 'shared',
                })}
                title="Browse ETS addresses"
              >
                <Search size={14} />
              </button>
            </div>
            {resolveGroupAddressName?.(item.statusGroupAddress || '', type) && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                XML match: <strong style={{ color: 'var(--text-primary)' }}>{resolveGroupAddressName(item.statusGroupAddress || '', type)}</strong>
              </div>
            )}
          </div>
        </div>
      ))}

      {adding && (
        <div style={{ background: 'var(--glass-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {type === 'alarm' ? <><AlertTriangle size={16} /> New Alarm</> : <><Info size={16} /> New Central Information</>}
          </h4>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder={type === 'alarm' ? 'Name (e.g. Rain Alarm)' : 'Name (e.g. Outside Temperature)'}
              style={{ flex: 1, minWidth: '220px' }}
              autoFocus
            />
            {type === 'info' && (
              <select
                className="form-select"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                style={{ width: '240px', minWidth: '240px' }}
              >
                <option value="temperature">Temperature (°C)</option>
                <option value="wind">Wind (m/s)</option>
                <option value="lux">Brightness (Lux)</option>
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={handleAdd} disabled={!draft.name.trim()}>
              <Check size={16} /> Save Item
            </button>
            <button className="btn-secondary" onClick={() => setAdding(false)}>
              <X size={16} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GlobalsConfig({
  sharedInfos,
  apartmentAlarms,
  setSharedInfos,
  setApartmentAlarms,
  saveSharedInfos,
  saveApartmentAlarms,
  openGroupAddressModal,
  requestConfirm,
  resolveGroupAddressName,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <ItemSection
        title="Central Information"
        items={sharedInfos}
        type="info"
        setItems={setSharedInfos}
        saveItems={saveSharedInfos}
        openGroupAddressModal={openGroupAddressModal}
        emptyText="No central information configured yet."
        resolveGroupAddressName={resolveGroupAddressName}
      />

      <ItemSection
        title="Apartment Alarms"
        items={apartmentAlarms}
        type="alarm"
        setItems={setApartmentAlarms}
        saveItems={saveApartmentAlarms}
        openGroupAddressModal={openGroupAddressModal}
        emptyText="No apartment-specific alarms configured yet."
        resolveGroupAddressName={resolveGroupAddressName}
      />
    </div>
  );
}
