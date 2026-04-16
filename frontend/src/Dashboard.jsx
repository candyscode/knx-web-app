import React, { useState, useEffect, useRef } from 'react';
import { triggerAction, triggerHueAction } from './configApi';
import { 
  Lightbulb, 
  Gamepad2, Blinds, 
  Lock, LockOpen
} from 'lucide-react';
const BlindsCard = ({ func, istPosition, isMoving, onAction }) => {
  const [sollPosition, setSollPosition] = useState(istPosition !== undefined ? istPosition : 0);
  const initializedRef = useRef(false);
  const softwareCommandActiveRef = useRef(false);

  // React to Ist-position updates from the bus
  useEffect(() => {
    if (istPosition === undefined) return;

    // First real value after startup: sync Soll to Ist unconditionally
    if (!initializedRef.current) {
      initializedRef.current = true;
      softwareCommandActiveRef.current = false;
      setSollPosition(istPosition);
      return;
    }

    // If a software command is in flight: keep Soll fixed, don't follow Ist
    if (softwareCommandActiveRef.current) return;

    // No software command active: this is a wall-switch or external movement → follow Ist
    setSollPosition(istPosition);
  }, [istPosition]);

  // React to the "is moving" GA: when movement stops and we had a software command, clear the lock
  useEffect(() => {
    if (isMoving === false && softwareCommandActiveRef.current) {
      softwareCommandActiveRef.current = false;
    }
  }, [isMoving]);

  const handleChange = (e) => {
    setSollPosition(parseInt(e.target.value, 10));
  };

  const handlePointerUp = () => {
    softwareCommandActiveRef.current = true;
    onAction({ ...func, value: sollPosition });

    // Fallback: if no "is moving" GA is configured, auto-release lock after 3 minutes
    // (covers the longest possible blind travel time)
    if (!func.movingGroupAddress) {
      clearTimeout(softwareCommandActiveRef._timeout);
      softwareCommandActiveRef._timeout = setTimeout(() => {
        softwareCommandActiveRef.current = false;
      }, 180000);
    }
  };

  // If no movingGroupAddress configured, fall back to simpler flag-based logic
  // (once user interacts, Soll stays fixed)
  const hasMoveGA = !!func.movingGroupAddress;

  return (
    <div className="action-btn" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Blinds size={18} color="var(--accent-color)" />
        <span style={{ fontWeight: '600' }}>{func.name}</span>
        {isMoving && hasMoveGA && (
          <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', marginLeft: '0.25rem', animation: 'pulse 1s infinite' }}>⬆⬇ fährt…</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sollPosition}%</span>
      </div>
      <div className="blinds-widget">
        <div className="blinds-window">
          <div className="blinds-glass"></div>
          <div className="blinds-curtain" style={{ height: `${sollPosition}%` }}></div>
          <input 
            type="range" 
            className="blinds-slider" 
            min="0" 
            max="100" 
            value={sollPosition} 
            onChange={handleChange}
            onPointerUp={handlePointerUp}
            onTouchEnd={handlePointerUp}
          />
        </div>
        <div className="blinds-indicator-bar" title={`Ist-Position: ${istPosition}%`}>
          <div className="blinds-indicator-fill" style={{ height: `${istPosition}%` }}></div>
        </div>
      </div>
    </div>
  );
};

export default function Dashboard({ config, deviceStates = {}, hueStates = {}, setDeviceStates, setHueStates, addToast }) {
  const { rooms } = config;

  const handleSceneAction = async (room, scene) => {
    try {
      const res = await triggerAction({
        groupAddress: room.sceneGroupAddress,
        type: 'scene',
        sceneNumber: scene.sceneNumber,
      });
      if (res.success) {
        addToast(`${scene.name}`, 'success');
      } else {
        addToast(`Failed: ${res.error}`, 'error');
      }
    } catch (e) {
      addToast('Error communicating with backend server (is it running?)', 'error');
    }
  };

  const handleAction = async (func) => {
    let { groupAddress, type, sceneNumber, value } = func;
    
    // For blind percentage control, 'actionGA' is used but type might be different in UI logic
    // For switches, we toggle the current state optimistically
    const currentState = deviceStates[func.statusGroupAddress || groupAddress];
    
    let nextState = value;
    if (type === 'switch' && nextState === undefined) {
      nextState = !currentState;
    }

    let valueToSend = nextState;
    if (type === 'switch') {
      valueToSend = !!nextState;
    }

    // OPTIMISTIC UPDATE FOR KNX
    if (type === 'switch' && setDeviceStates && nextState !== undefined) {
      setDeviceStates(prev => ({ ...prev, [func.statusGroupAddress || groupAddress]: nextState }));
    }

    try {
      const res = await triggerAction({
        groupAddress,
        type,
        sceneNumber,
        value: valueToSend
      });
      if (res.success) {
        if (type !== 'scene' && type !== 'percentage') {
          // Toast omitted so it's not spammy on switch toggle
        } else {
          addToast(`Triggered ${func.name}`, 'success');
        }
      } else {
        // Revert optimistic update on failure
        if (type === 'switch' && setDeviceStates) {
          setDeviceStates(prev => ({ ...prev, [func.statusGroupAddress || groupAddress]: currentState }));
        }
        addToast(`Failed: ${res.error}`, 'error');
      }
    } catch(e) {
      // Revert optimistic update on error
      if (type === 'switch' && setDeviceStates) {
        setDeviceStates(prev => ({ ...prev, [func.statusGroupAddress || groupAddress]: currentState }));
      }
      addToast(`Error communicating with backend server (is it running?)`, 'error');
    }
  };

  const handleHueAction = async (func) => {
    const currentOn = !!hueStates[`hue_${func.hueLightId}`];
    
    // OPTIMISTIC UPDATE FOR HUE
    if (setHueStates) {
      setHueStates(prev => ({ ...prev, [`hue_${func.hueLightId}`]: !currentOn }));
    }

    try {
      const res = await triggerHueAction(func.hueLightId, !currentOn);
      if (!res.success) {
        // Revert on failure
        if (setHueStates) setHueStates(prev => ({ ...prev, [`hue_${func.hueLightId}`]: currentOn }));
        addToast(`Hue error: ${res.error}`, 'error');
      }
    } catch (e) {
      // Revert on error
      if (setHueStates) setHueStates(prev => ({ ...prev, [`hue_${func.hueLightId}`]: currentOn }));
      addToast('Error communicating with Hue Bridge', 'error');
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
      {rooms.map((room) => {
        const roomScenes = room.scenes || [];
        const hasScenes = roomScenes.length > 0;
        const hasFunctions = room.functions && room.functions.length > 0;
        
        return (
          <div key={room.id} className="room-card">
            <div className="room-header">
              <h2>{room.name}</h2>
            </div>
            
            {/* Room scenes — categorized by light and shade */}
            {hasScenes && (
              <div className="scene-categories">
                {roomScenes.some(sc => (sc.category || 'light') === 'light') && (
                  <div className="scene-category">
                    <h4 className="scene-category-title">Lights</h4>
                    <div className="scene-pills">
                      {roomScenes.filter(sc => (sc.category || 'light') === 'light').map(sc => (
                        <button
                          key={sc.id}
                          className="scene-pill"
                          onClick={() => handleSceneAction(room, sc)}
                        >
                          {sc.name || `Scene ${sc.sceneNumber}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {roomScenes.some(sc => sc.category === 'shade') && (
                  <div className="scene-category" style={{ marginTop: '0.4rem' }}>
                    <h4 className="scene-category-title">Shades</h4>
                    <div className="scene-pills">
                      {roomScenes.filter(sc => sc.category === 'shade').map(sc => (
                        <button
                          key={sc.id}
                          className="scene-pill shade-pill"
                          onClick={() => handleSceneAction(room, sc)}
                        >
                          {sc.name || `Scene ${sc.sceneNumber}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Regular functions (switches, blinds, standalone scenes) */}
            {hasFunctions && (
              <div className="scene-category" style={{ marginTop: hasScenes ? '0.4rem' : '0' }}>
                <h4 className="scene-category-title">Functions</h4>
                <div className="functions-grid">
                  {room.functions.map((func) => {
                    const currentState = deviceStates[func.statusGroupAddress];
                    
                    if (func.type === 'percentage') {
                      const istPosition = currentState !== undefined ? currentState : 0;
                      const isMoving = func.movingGroupAddress
                        ? deviceStates[func.movingGroupAddress]
                        : undefined;
                      return (
                        <BlindsCard 
                          key={func.id} 
                          func={func} 
                          istPosition={istPosition}
                          isMoving={isMoving}
                          onAction={handleAction} 
                        />
                      );
                    }

                    // Hue lights — render like a switch with Lightbulb
                    if (func.type === 'hue') {
                      const hueOn = !!hueStates[`hue_${func.hueLightId}`];
                      return (
                        <button 
                          key={func.id} 
                          className={`action-btn ${hueOn ? 'active' : ''}`}
                          onClick={() => handleHueAction(func)}
                        >
                          <div className="action-icon-wrapper">
                            <Lightbulb size={24} fill={hueOn ? 'currentColor' : 'none'} />
                          </div>
                          <span className="action-name">{func.name}</span>
                          <div className={`toggle-switch ${hueOn ? 'active' : ''}`}>
                            <div className="toggle-knob"></div>
                          </div>
                        </button>
                      );
                    }

                    const isSwitch = func.type === 'switch';
                    const isOn = isSwitch ? !!currentState : false;
                    
                    const renderSwitchIcon = () => {
                      if (func.type === 'scene') return <Gamepad2 size={24} />;
                      
                      let effectiveIsOn = isOn;
                      if (func.invertIcon) effectiveIsOn = !effectiveIsOn;
                      
                      const iconType = func.iconType || 'lightbulb';
                      
                      if (iconType === 'lock') return effectiveIsOn ? <Lock size={24} /> : <LockOpen size={24} />;
                      
                      return <Lightbulb size={24} fill={effectiveIsOn ? 'currentColor' : 'none'} />;
                    };
                    
                    return (
                      <button 
                        key={func.id} 
                        className={`action-btn ${isSwitch && isOn ? 'active' : ''}`}
                        onClick={() => handleAction(func)}
                      >
                        <div className="action-icon-wrapper">
                          {renderSwitchIcon()}
                        </div>
                        <span className="action-name">{func.name}</span>
                        
                        {isSwitch && (
                          <div className={`toggle-switch ${isOn ? 'active' : ''}`}>
                            <div className="toggle-knob"></div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {(!hasFunctions && !hasScenes) && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No functions available
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
