import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Clapperboard, Zap } from 'lucide-react';

const VALID_FUNCTION_TYPES = new Set(['switch', 'percentage']);

function buildSearchItems(floors) {
  const items = [];
  for (const floor of (floors || [])) {
    if (!Array.isArray(floor.rooms)) continue;
    for (const room of floor.rooms) {
      // Scenes
      if (room.sceneGroupAddress && Array.isArray(room.scenes)) {
        for (const scene of room.scenes) {
          items.push({
            id: `scene_${scene.id}`,
            kind: 'scene',
            label: `${floor.name} › ${room.name} › ${scene.name}`,
            floorName: floor.name,
            roomName: room.name,
            targetName: scene.name,
            areaId: floor.id,
            roomId: room.id,
            targetId: scene.id,
            targetType: 'scene',
          });
        }
      }
      // Functions (switch / percentage only)
      if (Array.isArray(room.functions)) {
        for (const func of room.functions) {
          if (!VALID_FUNCTION_TYPES.has(func.type)) continue;
          items.push({
            id: `func_${func.id}`,
            kind: 'function',
            label: `${floor.name} › ${room.name} › ${func.name}`,
            floorName: floor.name,
            roomName: room.name,
            targetName: func.name,
            areaId: floor.id,
            roomId: room.id,
            targetId: func.id,
            targetType: func.type,
          });
        }
      }
    }
  }
  return items;
}

export default function ActionPickerModal({ floors, onAdd, onClose }) {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null); // step 1 → 2
  const [value, setValue] = useState(null); // for function value config

  const allItems = useMemo(() => buildSearchItems(floors), [floors]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [allItems, search]);

  const handleSelect = (item) => {
    if (item.kind === 'scene') {
      // No extra config needed → add immediately
      onAdd({
        id: `action_${Date.now()}`,
        kind: 'scene',
        areaId: item.areaId,
        roomId: item.roomId,
        targetId: item.targetId,
        targetType: 'scene',
        value: null,
      });
    } else {
      // Need value config
      setSelectedItem(item);
      setValue(item.targetType === 'percentage' ? 50 : false);
    }
  };

  const handleAddFunction = () => {
    onAdd({
      id: `action_${Date.now()}`,
      kind: 'function',
      areaId: selectedItem.areaId,
      roomId: selectedItem.roomId,
      targetId: selectedItem.targetId,
      targetType: selectedItem.targetType,
      value,
    });
  };

  return createPortal(
    <div className="modal-overlay" onClick={selectedItem ? undefined : onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        style={{ width: 'min(580px, 96vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>
            {selectedItem ? 'Configure Action Value' : 'Add Action'}
          </h3>
          <button className="icon-btn" onClick={selectedItem ? () => setSelectedItem(null) : onClose}>
            <X size={16} />
          </button>
        </div>

        {!selectedItem ? (
          /* Step 1: Pick scene or function */
          <>
            <div className="action-picker-search">
              <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <input
                className="action-picker-search-input"
                placeholder="Search areas, rooms, scenes, functions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredItems.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                  No matching scenes or functions found.
                </div>
              )}
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.75rem 0.5rem',
                    borderRadius: '8px', color: 'var(--text-primary)', textAlign: 'left',
                    fontFamily: 'inherit', fontSize: '0.9rem',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                >
                  {item.kind === 'scene'
                    ? <Clapperboard size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                    : <Zap size={16} style={{ color: '#eab308', flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{item.targetName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.floorName} › {item.roomName}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0, background: 'rgba(255,255,255,0.07)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                    {item.kind === 'scene' ? 'Scene' : item.targetType === 'percentage' ? 'Percentage' : 'Switch'}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Step 2: Configure value for function */
          <>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                {selectedItem.floorName} › {selectedItem.roomName}
              </div>
              <div style={{ fontWeight: 600 }}>{selectedItem.targetName}</div>
            </div>

            <div className="settings-field" style={{ marginBottom: '1.5rem' }}>
              <label className="settings-field-label">
                {selectedItem.targetType === 'percentage' ? 'Target Value (0–100%)' : 'Target State'}
              </label>
              {selectedItem.targetType === 'percentage' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={value}
                    onChange={(e) => setValue(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ minWidth: '3rem', textAlign: 'right', fontWeight: 600 }}>{value}%</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    className={`btn-secondary ${value === false ? 'active' : ''}`}
                    onClick={() => setValue(false)}
                    style={{ flex: 1, background: value === false ? 'rgba(239,68,68,0.2)' : '' }}
                  >
                    Off
                  </button>
                  <button
                    className={`btn-secondary ${value === true ? 'active' : ''}`}
                    onClick={() => setValue(true)}
                    style={{ flex: 1, background: value === true ? 'rgba(34,197,94,0.2)' : '' }}
                  >
                    On
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setSelectedItem(null)}>← Back</button>
              <button className="btn-primary" onClick={handleAddFunction}>
                Add Action
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
