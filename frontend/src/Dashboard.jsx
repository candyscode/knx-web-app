import React, { useState, useEffect, useRef } from 'react';
import { triggerAction, triggerHueAction, updateConfig } from './configApi';
import { Lightbulb, Gamepad2, Blinds, Lock, LockOpen } from 'lucide-react';
import FloorTabs from './components/FloorTabs';
import GlobalInfoWidget from './components/GlobalInfoWidget';

// ── Blinds Card ───────────────────────────────────────────
const BlindsCard = ({ func, istPosition, isMoving, onAction }) => {
  const [sollPosition, setSollPosition] = useState(istPosition !== undefined ? istPosition : 0);
  const initializedRef = useRef(false);
  const softwareCommandActiveRef = useRef(false);

  useEffect(() => {
    if (istPosition === undefined) return;
    if (!initializedRef.current) { initializedRef.current = true; softwareCommandActiveRef.current = false; setSollPosition(istPosition); return; }
    if (softwareCommandActiveRef.current) return;
    setSollPosition(istPosition);
  }, [istPosition]);

  useEffect(() => {
    if (isMoving === false && softwareCommandActiveRef.current) softwareCommandActiveRef.current = false;
  }, [isMoving]);

  const handlePointerUp = () => {
    softwareCommandActiveRef.current = true;
    onAction({ ...func, value: sollPosition });
    if (!func.movingGroupAddress) {
      clearTimeout(softwareCommandActiveRef._timeout);
      softwareCommandActiveRef._timeout = setTimeout(() => { softwareCommandActiveRef.current = false; }, 180000);
    }
  };

  return (
    <div className="action-btn" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Blinds size={18} color="var(--accent-color)" />
        <span style={{ fontWeight: '600' }}>{func.name}</span>
        {isMoving && !!func.movingGroupAddress && (
          <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', marginLeft: '0.25rem', animation: 'pulse 1s infinite' }}>⬆⬇ fährt…</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{sollPosition}%</span>
      </div>
      <div className="blinds-widget">
        <div className="blinds-window">
          <div className="blinds-glass" />
          <div className="blinds-curtain" style={{ height: `${sollPosition}%` }} />
          <input type="range" className="blinds-slider" min="0" max="100" value={sollPosition}
            onChange={e => setSollPosition(parseInt(e.target.value, 10))}
            onPointerUp={handlePointerUp} onTouchEnd={handlePointerUp} />
        </div>
        <div className="blinds-indicator-bar" title={`Ist-Position: ${istPosition}%`}>
          <div className="blinds-indicator-fill" style={{ height: `${istPosition}%` }} />
        </div>
      </div>
    </div>
  );
};

// ── Room Card ─────────────────────────────────────────────
function RoomCard({ room, deviceStates, hueStates, setDeviceStates, setHueStates, handleAction, handleHueAction, handleSceneAction }) {
  const roomScenes = room.scenes || [];
  const hasScenes = roomScenes.length > 0;
  const hasFunctions = room.functions && room.functions.length > 0;

  const renderSwitchIcon = (func, isOn) => {
    if (func.type === 'scene') return <Gamepad2 size={24} />;
    let effectiveIsOn = func.invertIcon ? !isOn : isOn;
    if ((func.iconType || 'lightbulb') === 'lock') return effectiveIsOn ? <Lock size={24} /> : <LockOpen size={24} />;
    return <Lightbulb size={24} fill={effectiveIsOn ? 'currentColor' : 'none'} />;
  };

  return (
    <div className="room-card">
      <div className="room-header"><h2>{room.name}</h2></div>

      {hasScenes && (
        <div className="scene-categories">
          {roomScenes.some(sc => (sc.category || 'light') === 'light') && (
            <div className="scene-category">
              <h4 className="scene-category-title">Lights</h4>
              <div className="scene-pills">
                {roomScenes.filter(sc => (sc.category || 'light') === 'light').map(sc => (
                  <button key={sc.id} className="scene-pill" onClick={() => handleSceneAction(room, sc)}>
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
                  <button key={sc.id} className="scene-pill shade-pill" onClick={() => handleSceneAction(room, sc)}>
                    {sc.name || `Scene ${sc.sceneNumber}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasFunctions && (
        <div className="scene-category" style={{ marginTop: hasScenes ? '0.4rem' : '0' }}>
          <h4 className="scene-category-title">Functions</h4>
          <div className="functions-grid">
            {room.functions.map(func => {
              if (func.type === 'percentage') {
                return (
                  <BlindsCard key={func.id} func={func}
                    istPosition={deviceStates[func.statusGroupAddress] !== undefined ? deviceStates[func.statusGroupAddress] : 0}
                    isMoving={func.movingGroupAddress ? deviceStates[func.movingGroupAddress] : undefined}
                    onAction={handleAction} />
                );
              }
              if (func.type === 'hue') {
                const hueOn = !!hueStates[`hue_${func.hueLightId}`];
                return (
                  <button key={func.id} className={`action-btn ${hueOn ? 'active' : ''}`} onClick={() => handleHueAction(func)}>
                    <div className="action-icon-wrapper"><Lightbulb size={24} fill={hueOn ? 'currentColor' : 'none'} /></div>
                    <span className="action-name">{func.name}</span>
                    <div className={`toggle-switch ${hueOn ? 'active' : ''}`}><div className="toggle-knob" /></div>
                  </button>
                );
              }
              const isSwitch = func.type === 'switch';
              const isOn = isSwitch ? !!deviceStates[func.statusGroupAddress] : false;
              return (
                <button key={func.id} className={`action-btn ${isSwitch && isOn ? 'active' : ''}`} onClick={() => handleAction(func)}>
                  <div className="action-icon-wrapper">{renderSwitchIcon(func, isOn)}</div>
                  <span className="action-name">{func.name}</span>
                  {isSwitch && <div className={`toggle-switch ${isOn ? 'active' : ''}`}><div className="toggle-knob" /></div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!hasFunctions && !hasScenes && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No functions available</div>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────
export default function Dashboard({ config, fetchConfig, deviceStates = {}, hueStates = {}, setDeviceStates, setHueStates, addToast }) {
  // Derive floors from config — support both legacy rooms[] and new floors[]
  const floors = React.useMemo(() => {
    if (config.floors && config.floors.length > 0) return config.floors;
    if (config.rooms && config.rooms.length > 0) return [{ id: 'default', name: 'Ground Floor', rooms: config.rooms }];
    return [];
  }, [config]);

  const multiFloor = floors.length > 1;
  const [localFloors, setLocalFloors] = useState(floors);
  const [activeFloorId, setActiveFloorId] = useState(floors[0]?.id || null);

  // Keep local floors in sync when config prop changes
  useEffect(() => { setLocalFloors(floors); }, [floors]);

  // Keep activeFloorId valid when floors change
  useEffect(() => {
    if (localFloors.length > 0 && !localFloors.find(f => f.id === activeFloorId)) {
      setActiveFloorId(localFloors[0].id);
    }
  }, [localFloors]);

  const activeFloor = localFloors.find(f => f.id === activeFloorId) || localFloors[0];
  const activeRooms = activeFloor?.rooms || [];

  const handleSceneAction = async (room, scene) => {
    try {
      const res = await triggerAction({ groupAddress: room.sceneGroupAddress, type: 'scene', sceneNumber: scene.sceneNumber });
      if (res.success) addToast(`${scene.name}`, 'success');
      else addToast(`Failed: ${res.error}`, 'error');
    } catch { addToast('Error communicating with backend server (is it running?)', 'error'); }
  };

  const handleAction = async (func) => {
    const { groupAddress, type, sceneNumber, value } = func;
    const currentState = deviceStates[func.statusGroupAddress || groupAddress];
    let nextState = value;
    if (type === 'switch' && nextState === undefined) nextState = !currentState;
    if (type === 'switch' && setDeviceStates && nextState !== undefined) {
      setDeviceStates(prev => ({ ...prev, [func.statusGroupAddress || groupAddress]: nextState }));
    }
    try {
      const res = await triggerAction({ groupAddress, type, sceneNumber, value: type === 'switch' ? !!nextState : nextState });
      if (!res.success) {
        if (type === 'switch' && setDeviceStates) setDeviceStates(prev => ({ ...prev, [func.statusGroupAddress || groupAddress]: currentState }));
        addToast(`Failed: ${res.error}`, 'error');
      } else if (type === 'scene' || type === 'percentage') addToast(`Triggered ${func.name}`, 'success');
    } catch {
      if (type === 'switch' && setDeviceStates) setDeviceStates(prev => ({ ...prev, [func.statusGroupAddress || groupAddress]: currentState }));
      addToast('Error communicating with backend server (is it running?)', 'error');
    }
  };

  const handleHueAction = async (func) => {
    const currentOn = !!hueStates[`hue_${func.hueLightId}`];
    if (setHueStates) setHueStates(prev => ({ ...prev, [`hue_${func.hueLightId}`]: !currentOn }));
    try {
      const res = await triggerHueAction(func.hueLightId, !currentOn);
      if (!res.success) {
        if (setHueStates) setHueStates(prev => ({ ...prev, [`hue_${func.hueLightId}`]: currentOn }));
        addToast(`Hue error: ${res.error}`, 'error');
      }
    } catch {
      if (setHueStates) setHueStates(prev => ({ ...prev, [`hue_${func.hueLightId}`]: currentOn }));
      addToast('Error communicating with Hue Bridge', 'error');
    }
  };

  if (floors.length === 0) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No rooms configured</h2>
        <p>Go to <strong>Rooms</strong> to add your first floor and rooms.</p>
      </div>
    );
  }

  return (
    <div>
      <GlobalInfoWidget globals={config.globals} deviceStates={deviceStates} />

      {multiFloor && (
        <FloorTabs
          floors={localFloors}
          activeFloorId={activeFloor?.id}
          onSelectFloor={setActiveFloorId}
          showAddButton={false}
          showRoomCount={false}
          largeTabs={true}
        />
      )}

      {activeRooms.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem', marginTop: multiFloor ? '1rem' : 0 }}>
          <p style={{ color: 'var(--text-secondary)' }}>No rooms on <strong>{activeFloor?.name}</strong>.</p>
        </div>
      ) : (
        <div className={`room-grid ${multiFloor ? 'room-grid--with-tabs' : ''}`}>
          {activeRooms.map(room => (
            <RoomCard key={room.id} room={room}
              deviceStates={deviceStates} hueStates={hueStates}
              setDeviceStates={setDeviceStates} setHueStates={setHueStates}
              handleAction={handleAction} handleHueAction={handleHueAction}
              handleSceneAction={handleSceneAction} />
          ))}
        </div>
      )}
    </div>
  );
}
