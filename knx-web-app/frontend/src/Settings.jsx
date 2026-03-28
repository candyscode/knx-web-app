import React, { useState } from 'react';
import { updateConfig } from './configApi';
import { Plus, Trash2, Save, ArrowUp, ArrowDown } from 'lucide-react';

export default function Settings({ config, fetchConfig, addToast }) {
  const [ip, setIp] = useState(config.knxIp || '');
  const [port, setPort] = useState(config.knxPort || 3671);
  const [rooms, setRooms] = useState(config.rooms || []);
  const [newRoomName, setNewRoomName] = useState('');

  const handleSaveIp = async () => {
    try {
      await updateConfig({ knxIp: ip, knxPort: port });
      addToast('IP Address saved', 'success');
      fetchConfig();
    } catch(err) {
      addToast('Failed to save IP', 'error');
    }
  };

  const handleCreateRoom = async () => {
    if(!newRoomName.trim()) return;
    const newRoom = { id: Date.now().toString(), name: newRoomName, functions: [] };
    const updatedRooms = [...rooms, newRoom];
    
    try {
      await updateConfig({ rooms: updatedRooms });
      setRooms(updatedRooms);
      setNewRoomName('');
      addToast('Room added', 'success');
      fetchConfig();
    } catch(err) {
      addToast('Failed to add room', 'error');
    }
  };

  const handleDeleteRoom = async (roomId) => {
    const updatedRooms = rooms.filter(r => r.id !== roomId);
    try {
      await updateConfig({ rooms: updatedRooms });
      setRooms(updatedRooms);
      addToast('Room deleted', 'success');
      fetchConfig();
    } catch(err) {
      addToast('Failed to delete room', 'error');
    }
  };

  const handleAddFunction = async (roomId) => {
    const updatedRooms = rooms.map(room => {
      if(room.id === roomId) {
        return {
          ...room,
          functions: [...room.functions, {
            id: Date.now().toString(),
            name: 'New Function',
            type: 'scene',
            groupAddress: '1/1/1',
            sceneNumber: 1
          }]
        };
      }
      return room;
    });
    
    try {
      await updateConfig({ rooms: updatedRooms });
      setRooms(updatedRooms);
      fetchConfig();
    } catch(err) {
      addToast('Failed to add function', 'error');
    }
  };

  const handleUpdateFunction = (roomId, funcId, key, value) => {
    const updatedRooms = rooms.map(room => {
      if(room.id === roomId) {
        return {
          ...room,
          functions: room.functions.map(f => f.id === funcId ? { ...f, [key]: value } : f)
        };
      }
      return room;
    });
    setRooms(updatedRooms);
  };

  const handleSaveRooms = async () => {
    try {
      await updateConfig({ rooms });
      addToast('Raum-Funktionen gespeichert', 'success');
      fetchConfig();
    } catch(err) {
      addToast('Fehler beim Speichern', 'error');
    }
  };

  const handleDeleteFunction = async (roomId, funcId) => {
    const updatedRooms = rooms.map(room => {
      if(room.id === roomId) {
        return {
          ...room,
          functions: room.functions.filter(f => f.id !== funcId)
        };
      }
      return room;
    });
    
    setRooms(updatedRooms);
    try {
      await updateConfig({ rooms: updatedRooms });
      fetchConfig();
    } catch(err) { }
  };

  const moveRoom = (index, direction) => {
    const newRooms = [...rooms];
    if (direction === 'up' && index > 0) {
      [newRooms[index - 1], newRooms[index]] = [newRooms[index], newRooms[index - 1]];
    } else if (direction === 'down' && index < newRooms.length - 1) {
      [newRooms[index + 1], newRooms[index]] = [newRooms[index], newRooms[index + 1]];
    }
    setRooms(newRooms);
  };

  const moveFunction = (roomId, funcIndex, direction) => {
    const newRooms = rooms.map(room => {
      if (room.id === roomId) {
        const newFuncs = [...room.functions];
        if (direction === 'up' && funcIndex > 0) {
          [newFuncs[funcIndex - 1], newFuncs[funcIndex]] = [newFuncs[funcIndex], newFuncs[funcIndex - 1]];
        } else if (direction === 'down' && funcIndex < newFuncs.length - 1) {
          [newFuncs[funcIndex + 1], newFuncs[funcIndex]] = [newFuncs[funcIndex], newFuncs[funcIndex + 1]];
        }
        return { ...room, functions: newFuncs };
      }
      return room;
    });
    setRooms(newRooms);
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      <div className="settings-section" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
        <h2>KNX Interface Connection</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Configure the IP address of your MDT SCN-IP000.03 Interface.
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">IP Address</label>
            <input 
              className="form-input" 
              placeholder="e.g. 192.168.1.50" 
              value={ip} 
              onChange={e => setIp(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ width: '120px', marginBottom: 0 }}>
            <label className="form-label">Port</label>
            <input 
              className="form-input" 
              type="number"
              placeholder="3671" 
              value={port} 
              onChange={e => setPort(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={handleSaveIp}>
            <Save size={18} /> Save Config
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h2>Rooms & Functions</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Organize your KNX groups into rooms and assign functions.
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem' }}>
          <input 
            className="form-input" 
            placeholder="New Room Name (e.g. Wohnzimmer)..." 
            value={newRoomName} 
            onChange={e => setNewRoomName(e.target.value)}
          />
          <button className="btn-primary" onClick={handleCreateRoom}>
            <Plus size={18} /> Add
          </button>
        </div>

        <div className="item-list">
          {rooms.map((room, roomIndex) => (
            <div key={room.id} className="room-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h3 style={{ margin: 0 }}>{room.name}</h3>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn-primary" style={{ padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.1)' }} onClick={() => moveRoom(roomIndex, 'up')} disabled={roomIndex === 0}><ArrowUp size={16} /></button>
                    <button className="btn-primary" style={{ padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.1)' }} onClick={() => moveRoom(roomIndex, 'down')} disabled={roomIndex === rooms.length - 1}><ArrowDown size={16} /></button>
                  </div>
                </div>
                <button className="btn-danger" onClick={() => handleDeleteRoom(room.id)}>
                  <Trash2 size={16} /> Delete Room
                </button>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Functions</h4>
                
                {room.functions.map((func, funcIndex) => (
                  <div key={func.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn-primary" style={{ padding: '0.25rem', background: 'rgba(255,255,255,0.1)' }} onClick={() => moveFunction(room.id, funcIndex, 'up')} disabled={funcIndex === 0}><ArrowUp size={14} /></button>
                      <button className="btn-primary" style={{ padding: '0.25rem', background: 'rgba(255,255,255,0.1)' }} onClick={() => moveFunction(room.id, funcIndex, 'down')} disabled={funcIndex === room.functions.length - 1}><ArrowDown size={14} /></button>
                    </div>
                    <input 
                      className="form-input" 
                      style={{ flex: 1, minWidth: '150px' }} 
                      value={func.name} 
                      onChange={e => handleUpdateFunction(room.id, func.id, 'name', e.target.value)}
                      placeholder="Name (e.g. Szene Hell)"
                    />
                    
                    <select 
                      className="form-select" 
                      style={{ width: '120px' }}
                      value={func.type}
                      onChange={e => handleUpdateFunction(room.id, func.id, 'type', e.target.value)}
                    >
                      <option value="scene">Scene</option>
                      <option value="switch">Switch (1-bit)</option>
                      <option value="percentage">Percent (0-100)</option>
                    </select>
                    
                    <input 
                      className="form-input" 
                      style={{ width: '120px' }} 
                      value={func.groupAddress} 
                      onChange={e => handleUpdateFunction(room.id, func.id, 'groupAddress', e.target.value)}
                      placeholder="GA (e.g. 1/5/0)"
                    />
                    
                    {func.type === 'scene' && (
                      <input 
                        className="form-input" 
                        type="number"
                        style={{ width: '120px' }} 
                        value={func.sceneNumber || 1} 
                        onChange={e => handleUpdateFunction(room.id, func.id, 'sceneNumber', parseInt(e.target.value))}
                        placeholder="Scene No."
                        min="1"
                        max="64"
                      />
                    )}
                    
                    {func.type === 'switch' && (
                      <input 
                        className="form-input" 
                        style={{ width: '120px' }} 
                        value={func.statusGroupAddress || ''} 
                        onChange={e => handleUpdateFunction(room.id, func.id, 'statusGroupAddress', e.target.value)}
                        placeholder="Status GA (Rückmeldung)"
                      />
                    )}
                    
                    <button className="btn-danger" onClick={() => handleDeleteFunction(room.id, func.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button 
                    className="btn-primary" 
                    style={{ background: 'rgba(255,255,255,0.1)', fontSize: '0.85rem', padding: '0.5rem 1rem' }} 
                    onClick={() => handleAddFunction(room.id)}
                  >
                    <Plus size={16} /> Add Function
                  </button>
                  <button 
                    className="btn-primary" 
                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', background: 'var(--success-color)' }} 
                    onClick={handleSaveRooms}
                  >
                    <Save size={16} /> Save Functions
                  </button>
                </div>
              </div>
            </div>
          ))}
          {rooms.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No rooms added yet.</p>
          )}
        </div>
      </div>
      
    </div>
  );
}
