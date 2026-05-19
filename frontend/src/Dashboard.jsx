import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { triggerAction, triggerHueAction } from './configApi';
import { Lightbulb, Gamepad2, Blinds, Lock, LockOpen } from 'lucide-react';
import FloorTabs from './components/FloorTabs';
import GlobalInfoWidget from './components/GlobalInfoWidget';

// ── Blinds Card ───────────────────────────────────────────
const BlindsCard = ({ func, istPosition, isMoving, onAction }) => {
  const [sollPosition, setSollPosition] = useState(istPosition !== undefined ? istPosition : 0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const initializedRef = useRef(false);
  const softwareCommandActiveRef = useRef(false);
  const dragRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    if (istPosition === undefined) return;
    if (!initializedRef.current) { initializedRef.current = true; softwareCommandActiveRef.current = false; setSollPosition(istPosition); return; }
    if (softwareCommandActiveRef.current) return;
    setSollPosition(istPosition);
  }, [istPosition]);

  useEffect(() => {
    if (isMoving === false && softwareCommandActiveRef.current) softwareCommandActiveRef.current = false;
  }, [isMoving]);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isModalOpen]);

  const sendValue = (value) => {
    softwareCommandActiveRef.current = true;
    onAction({ ...func, value });
    if (!func.movingGroupAddress) {
      clearTimeout(softwareCommandActiveRef._timeout);
      softwareCommandActiveRef._timeout = setTimeout(() => { softwareCommandActiveRef.current = false; }, 180000);
    }
  };



  const handlePointerDownModal = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startY: e.clientY, startValue: sollPosition, moved: false, rect };
  };

  const handlePointerMoveModal = (e) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dy) > 5) dragRef.current.moved = true;
    const next = Math.max(0, Math.min(100, Math.round(dragRef.current.startValue + (dy / dragRef.current.rect.height) * 100)));
    setSollPosition(next);
  };

  const handlePointerUpModal = (e) => {
    if (e && e.pointerId && e.currentTarget && e.currentTarget.hasPointerCapture && e.currentTarget.hasPointerCapture(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    if (!dragRef.current) return;
    if (dragRef.current.moved) sendValue(sollPosition);
    dragRef.current = null;
  };

  return (
    <>
      <div
        className="action-btn action-btn--widget"
        style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }}
        onClick={() => setIsModalOpen(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', pointerEvents: 'none' }}>
          <Blinds size={18} color="var(--accent-color)" />
          <span style={{ fontWeight: '600' }}>{func.name}</span>
          {isMoving && !!func.movingGroupAddress && (
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', marginLeft: 'auto', animation: 'pulse 1s infinite' }}>⬆⬇ fährt…</span>
          )}
        </div>
        <div className="blinds-widget" style={{ pointerEvents: 'none' }}>
          <div className="blinds-window">
            <div className="blinds-glass" />
            <div className="blinds-curtain" style={{ height: `${istPosition !== undefined ? istPosition : sollPosition}%` }} />
            <div className="dimmer-label">{istPosition !== undefined ? istPosition : sollPosition}%</div>
          </div>
        </div>
      </div>

      {isModalOpen && createPortal(
        <div className="widget-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="widget-modal-content" onClick={e => e.stopPropagation()}>
            <div className="widget-modal-header">
              <div className="widget-modal-title">
                <Blinds size={24} color="var(--accent-color)" />
                {func.name}
              </div>
              <button className="widget-modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <div className="widget-modal-body">
              <div className="blinds-widget interactive" style={{ marginTop: 0, width: '100%', height: '100%', maxWidth: '300px' }}>
                <div
                  ref={trackRef}
                  className="blinds-window"
                  onPointerDown={handlePointerDownModal}
                  onPointerMove={handlePointerMoveModal}
                  onPointerUp={handlePointerUpModal}
                  onPointerCancel={handlePointerUpModal}
                  onLostPointerCapture={handlePointerUpModal}
                  style={{ cursor: 'ns-resize', touchAction: 'none', userSelect: 'none' }}
                >
                  <div className="blinds-glass" />
                  <div className="blinds-curtain" style={{ height: `${sollPosition}%` }} />
                  <div className="dimmer-label">{sollPosition}%</div>
                </div>
                <div className="blinds-indicator-bar" title={`Ist-Position: ${istPosition}%`}>
                  <div className="blinds-indicator-fill" style={{ height: `${istPosition}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// ── Dimmer Card ───────────────────────────────────────────
const DimmerCard = ({ func, istPosition, onAction }) => {
  const [sollPosition, setSollPosition] = useState(istPosition !== undefined ? istPosition : 0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const initializedRef = useRef(false);
  const lockRef = useRef(false);
  const dragRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    if (istPosition === undefined) return;
    if (!initializedRef.current) { initializedRef.current = true; lockRef.current = false; setSollPosition(istPosition); return; }
    if (lockRef.current) return;
    setSollPosition(istPosition);
  }, [istPosition]);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isModalOpen]);

  const sendValue = (value) => {
    lockRef.current = true;
    onAction({ ...func, value });
    clearTimeout(lockRef._timeout);
    lockRef._timeout = setTimeout(() => { lockRef.current = false; }, 5000);
  };



  const handlePointerDownModal = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startY: e.clientY, startValue: sollPosition, moved: false, rect };
  };

  const handlePointerMoveModal = (e) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dy) > 5) dragRef.current.moved = true;
    const next = Math.max(0, Math.min(100, Math.round(dragRef.current.startValue - (dy / dragRef.current.rect.height) * 100)));
    setSollPosition(next);
  };

  const handlePointerUpModal = (e) => {
    if (e && e.pointerId && e.currentTarget && e.currentTarget.hasPointerCapture && e.currentTarget.hasPointerCapture(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    if (!dragRef.current) return;
    if (dragRef.current.moved) sendValue(sollPosition);
    dragRef.current = null;
  };

  return (
    <>
      <div
        className="action-btn action-btn--widget"
        style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }}
        onClick={() => setIsModalOpen(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', pointerEvents: 'none' }}>
          <Lightbulb size={18} color="var(--accent-color)" />
          <span style={{ fontWeight: '600' }}>{func.name}</span>
        </div>
        <div className="dimmer-widget" style={{ pointerEvents: 'none' }}>
          <div className="dimmer-track">
            <div className="dimmer-fill" style={{ height: `${istPosition !== undefined ? istPosition : sollPosition}%` }} />
            <div className="dimmer-label">{istPosition !== undefined ? istPosition : sollPosition}%</div>
          </div>
        </div>
      </div>

      {isModalOpen && createPortal(
        <div className="widget-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="widget-modal-content" onClick={e => e.stopPropagation()}>
            <div className="widget-modal-header">
              <div className="widget-modal-title">
                <Lightbulb size={24} color="var(--accent-color)" />
                {func.name}
              </div>
              <button className="widget-modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <div className="widget-modal-body">
              <div className="dimmer-widget interactive" style={{ marginTop: 0, width: '100%', height: '100%', maxWidth: '300px' }}>
                <div
                  ref={trackRef}
                  className="dimmer-track"
                  onPointerDown={handlePointerDownModal}
                  onPointerMove={handlePointerMoveModal}
                  onPointerUp={handlePointerUpModal}
                  onPointerCancel={handlePointerUpModal}
                  onLostPointerCapture={handlePointerUpModal}
                  style={{ cursor: 'ns-resize', touchAction: 'none', userSelect: 'none' }}
                >
                  <div className="dimmer-fill" style={{ height: `${sollPosition}%` }} />
                  <div className="dimmer-label">{sollPosition}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};


// ── Room Card ─────────────────────────────────────────────
function RoomCard({ room, deviceStates, hueStates, handleAction, handleHueAction, handleSceneAction }) {
  const roomScenes = room.scenes || [];
  const hasScenes = roomScenes.length > 0;
  const roomFunctions = room.functions || [];
  const hasFunctions = roomFunctions.length > 0;
  const roomTemperatureValue = room.roomTemperatureGroupAddress ? deviceStates[room.roomTemperatureGroupAddress] : undefined;
  const hasRoomTemperature = room.roomTemperatureGroupAddress && roomTemperatureValue !== undefined && roomTemperatureValue !== null && roomTemperatureValue !== '';
  const parsedRoomTemperature = hasRoomTemperature ? Number(roomTemperatureValue) : null;
  const showRoomTemperature = Number.isFinite(parsedRoomTemperature);

  const renderSwitchIcon = (func, isOn) => {
    if (func.type === 'scene') return <Gamepad2 size={24} />;
    let effectiveIsOn = func.invertIcon ? !isOn : isOn;
    if ((func.iconType || 'lightbulb') === 'lock') return effectiveIsOn ? <Lock size={24} /> : <LockOpen size={24} />;
    return <Lightbulb size={24} fill={effectiveIsOn ? 'currentColor' : 'none'} />;
  };

  return (
    <div className="room-card">
      <div className="room-header">
        <h2 title={room.name}>{room.name}</h2>
        {showRoomTemperature && (
          <span className="room-temperature-badge">{parsedRoomTemperature.toFixed(1)} °C</span>
        )}
      </div>

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
            {roomFunctions.map(func => {
              if (func.type === 'percentage') {
                return (
                  <BlindsCard key={func.id} func={func}
                    istPosition={deviceStates[func.statusGroupAddress] !== undefined ? deviceStates[func.statusGroupAddress] : 0}
                    isMoving={func.movingGroupAddress ? deviceStates[func.movingGroupAddress] : undefined}
                    onAction={handleAction} />
                );
              }
              if (func.type === 'dimmer') {
                return (
                  <DimmerCard key={func.id} func={func}
                    istPosition={deviceStates[func.statusGroupAddress] !== undefined ? deviceStates[func.statusGroupAddress] : 0}
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
export default function Dashboard({
  apartment,
  config,
  fetchConfig,
  deviceStates = {},
  hueStates = {},
  setDeviceStates,
  setHueStates,
  setSharedDeviceStates,
  setSharedHueStates,
  addToast
}) {
  const floors = React.useMemo(() => Array.isArray(config.floors) ? config.floors : [], [config]);

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

  const handleSceneAction = async (room, scene, scope = 'apartment') => {
    try {
      const res = await triggerAction({
        apartmentId: apartment.id,
        scope,
        groupAddress: room.sceneGroupAddress,
        type: 'scene',
        sceneNumber: scene.sceneNumber
      });
      if (!res.success) addToast(`Failed: ${res.error}`, 'error');
    } catch { addToast('Error communicating with backend server (is it running?)', 'error'); }
  };

  const handleAction = async (func, scope = 'apartment') => {
    const { groupAddress, type, sceneNumber, value } = func;
    const currentState = deviceStates[func.statusGroupAddress || groupAddress];
    let nextState = value;
    if (type === 'switch' && nextState === undefined) nextState = !currentState;
    const applyStateUpdate = scope === 'shared' ? setSharedDeviceStates : setDeviceStates;

    if (type === 'switch' && applyStateUpdate && nextState !== undefined) {
      applyStateUpdate((prev) => ({ ...prev, [func.statusGroupAddress || groupAddress]: nextState }));
    }
    try {
      const res = await triggerAction({
        apartmentId: apartment.id,
        scope,
        groupAddress,
        type,
        sceneNumber,
        value: type === 'switch' ? !!nextState : nextState
      });
      if (!res.success) {
        if (type === 'switch' && applyStateUpdate) {
          applyStateUpdate((prev) => ({ ...prev, [func.statusGroupAddress || groupAddress]: currentState }));
        }
        addToast(`Failed: ${res.error}`, 'error');
      }
    } catch {
      if (type === 'switch' && applyStateUpdate) {
        applyStateUpdate((prev) => ({ ...prev, [func.statusGroupAddress || groupAddress]: currentState }));
      }
      addToast('Error communicating with backend server (is it running?)', 'error');
    }
  };

  const handleHueAction = async (func, scope = 'apartment') => {
    const currentOn = !!hueStates[`hue_${func.hueLightId}`];
    const applyHueUpdate = scope === 'shared' ? setSharedHueStates : setHueStates;
    if (applyHueUpdate) applyHueUpdate((prev) => ({ ...prev, [`hue_${func.hueLightId}`]: !currentOn }));
    try {
      const res = await triggerHueAction(func.hueLightId, !currentOn, { apartmentId: apartment.id, scope });
      if (!res.success) {
        if (applyHueUpdate) applyHueUpdate((prev) => ({ ...prev, [`hue_${func.hueLightId}`]: currentOn }));
        addToast(`Hue error: ${res.error}`, 'error');
      }
    } catch {
      if (applyHueUpdate) applyHueUpdate((prev) => ({ ...prev, [`hue_${func.hueLightId}`]: currentOn }));
      addToast('Error communicating with Hue Bridge', 'error');
    }
  };

  if (floors.length === 0) {
    return (
      <div>
        <GlobalInfoWidget globals={[...(config.sharedInfos || []), ...(config.alarms || [])]} deviceStates={deviceStates} />
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No rooms configured</h2>
          <p>Go to <strong>Rooms</strong> to add your first area and rooms.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <GlobalInfoWidget globals={[...(config.sharedInfos || []), ...(config.alarms || [])]} deviceStates={deviceStates} />

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
              handleAction={(func) => handleAction(func, activeFloor?.isShared ? 'shared' : 'apartment')}
              handleHueAction={(func) => handleHueAction(func, activeFloor?.isShared ? 'shared' : 'apartment')}
              handleSceneAction={(selectedRoom, scene) => handleSceneAction(selectedRoom, scene, activeFloor?.isShared ? 'shared' : 'apartment')} />
          ))}
        </div>
      )}
    </div>
  );
}
