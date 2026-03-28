import React from 'react';
import { triggerAction } from './configApi';
import { Lightbulb, Blinds, Gamepad2, Play } from 'lucide-react';

const renderIcon = (type) => {
  switch(type) {
    case 'scene': return <Gamepad2 size={24} className="action-icon" />;
    case 'light': return <Lightbulb size={24} className="action-icon" />;
    case 'blinds': return <Blinds size={24} className="action-icon" />;
    default: return <Play size={24} className="action-icon" />;
  }
};

export default function Dashboard({ config, deviceStates = {}, addToast }) {
  const { rooms } = config;

  const handleAction = async (func) => {
    try {
      let valueToSend = true;
      if (func.type === 'switch') {
        const currentState = !!deviceStates[func.statusGroupAddress];
        valueToSend = !currentState;
      }
      
      const res = await triggerAction({
        groupAddress: func.groupAddress,
        type: func.type,
        sceneNumber: func.sceneNumber,
        value: valueToSend
      });
      if(res.success) {
        if (func.type !== 'switch') {
          addToast(`Triggered ${func.name}`, 'success');
        }
      } else {
        addToast(`Failed: ${res.error}`, 'error');
      }
    } catch(e) {
      addToast(`Error communicating with backend`, 'error');
    }
  };

  if (!rooms || rooms.length === 0) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No rooms configured</h2>
        <p>Go to settings to add your first room and KNX functions.</p>
      </div>
    );
  }

  return (
    <div className="room-grid">
      {rooms.map((room) => (
        <div key={room.id} className="room-card">
          <div className="room-header">
            <h2>{room.name}</h2>
          </div>
          
          <div className="functions-grid">
            {room.functions.map((func) => {
              const isSwitch = func.type === 'switch';
              const isOn = isSwitch ? !!deviceStates[func.statusGroupAddress] : false;
              
              return (
                <button 
                  key={func.id} 
                  className="action-btn"
                  onClick={() => handleAction(func)}
                  style={isSwitch && isOn ? { borderColor: 'var(--success-color)' } : {}}
                >
                  <div style={{ color: isSwitch && isOn ? 'var(--success-color)' : 'var(--accent-color)', background: isSwitch && isOn ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '50%', marginBottom: '0.25rem' }}>
                    {func.type === 'scene' ? <Gamepad2 size={24} /> : 
                     func.type === 'light' ? <Lightbulb size={24} /> : 
                     func.type === 'blinds' ? <Blinds size={24} /> : 
                     <Lightbulb size={24} />}
                  </div>
                  <span>{func.name}</span>
                  
                  {isSwitch && (
                    <div className={`toggle-switch ${isOn ? 'active' : ''}`}>
                      <div className="toggle-knob"></div>
                    </div>
                  )}
                </button>
              );
            })}
            {(!room.functions || room.functions.length === 0) && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No functions available
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
