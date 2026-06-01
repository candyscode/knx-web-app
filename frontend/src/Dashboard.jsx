import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { triggerAction, triggerHueAction } from './configApi';
import { Lightbulb, Gamepad2, Blinds, Lock, LockOpen, Play, Plug, Power, SlidersHorizontal, Plus, Minus, X, ArrowLeftRight, Thermometer } from 'lucide-react';
import FloorTabs from './components/FloorTabs';
import GlobalInfoWidget from './components/GlobalInfoWidget';

const AURAS = {
  amber:    { c1: '#ff8a3d', c2: '#c66a35' },
  rose:     { c1: '#ff5d8f', c2: '#8a3a78' },
  sky:      { c1: '#4fa9ff', c2: '#3964c8' },
  sage:     { c1: '#6fc99c', c2: '#3f7a68' },
  sunset:   { c1: '#ff7a4d', c2: '#b34a52' },
  slate:    { c1: '#6e93b8', c2: '#3b5070' },
  lavender: { c1: '#a285ff', c2: '#5e479c' },
  aqua:     { c1: '#4dd0c5', c2: '#2a7080' },
};
const AURA_KEYS = ['amber','rose','sky','sage','sunset','slate','lavender','aqua'];

const hexAlpha = (hex, alpha) => {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

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

// ── Binary Selector Card ──────────────────────────────────
const BinarySelectorCard = ({ func, currentState, onAction }) => {
  const isOn = !!currentState;
  return (
    <div className="action-btn action-btn--widget" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', pointerEvents: 'none' }}>
        <ArrowLeftRight size={18} color="var(--accent-color)" />
        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{func.name}</span>
      </div>
      <div className="binary-selector-container">
        <button 
          className={`binary-selector-btn ${!isOn ? 'active' : ''}`} 
          onClick={() => onAction({ ...func, value: 0 })}
        >
          {func.labelOff || 'Off'}
        </button>
        <button 
          className={`binary-selector-btn ${isOn ? 'active' : ''}`} 
          onClick={() => onAction({ ...func, value: 1 })}
        >
          {func.labelOn || 'On'}
        </button>
      </div>
    </div>
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

// ── Room Temperature Modal ────────────────────────────────
const RoomTemperatureModal = ({ room, currentTemp, targetTemp, currentShift, heatingCoolingStatus, onClose, onAction }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (room.roomHeatingCoolingStatusGroupAddress && heatingCoolingStatus === undefined) {
      onAction({
        type: 'read',
        groupAddress: room.roomHeatingCoolingStatusGroupAddress
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const handleAdjust = (delta) => {
    if (targetTemp === undefined) return;
    const newShift = (currentShift || 0) + delta;
    
    // We send the absolute shift (DPT 9.002) to the shift GA
    onAction({
      type: 'temperature_shift',
      groupAddress: room.roomSetpointShiftGroupAddress,
      value: newShift
    });
  };

  let modalBg = '#1e293b'; // default background
  let modeText = null;
  if (heatingCoolingStatus === 1) {
    modalBg = '#4f2a32'; // pastel red for dark mode
    modeText = 'Heating Mode';
  } else if (heatingCoolingStatus === 0) {
    modalBg = '#1c2636'; // slight bluish
    modeText = 'Cooling Mode';
  }

  return createPortal(
    <div className="widget-modal-overlay" onClick={onClose}>
      <div className="widget-modal-content" onClick={e => e.stopPropagation()} style={{ width: '320px', height: 'auto', padding: '1.5rem', textAlign: 'center', position: 'relative', backgroundColor: modalBg }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={24} />
        </button>
        <h3 style={{ margin: '0 2rem 0.2rem 2rem', fontSize: '1.2rem', fontWeight: 500, lineHeight: '1.3' }}>{room.name} Temperature Control</h3>
        {modeText && <div style={{ fontSize: '0.8rem', color: heatingCoolingStatus === 1 ? '#ef4444' : '#3b82f6', marginBottom: '0.5rem' }}>{modeText}</div>}
        
        <div style={{ margin: '1.5rem 0' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Current Temperature</div>
          <div style={{ fontSize: '3rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {currentTemp !== undefined ? `${currentTemp.toFixed(1)}°` : '--°'}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button 
            className="btn-secondary icon-btn" 
            style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => handleAdjust(-0.5)}
            disabled={targetTemp === undefined}
          >
            <Minus size={20} />
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Target Setpoint</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 500 }}>
              {targetTemp !== undefined ? `${targetTemp.toFixed(1)}°` : '--°'}
            </span>
          </div>

          <button 
            className="btn-secondary icon-btn" 
            style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => handleAdjust(0.5)}
            disabled={targetTemp === undefined}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};


// ── Room Card ─────────────────────────────────────────────
function RoomCard({ room, roomIndex, deviceStates, hueStates, handleAction, handleHueAction, handleSceneAction, addToast }) {
  const auraKey = AURA_KEYS[roomIndex % AURA_KEYS.length];
  const aura = AURAS[auraKey];
  const roomScenes = room.scenes || [];
  const hasScenes = roomScenes.length > 0;
  const roomFunctions = room.functions || [];
  const hasFunctions = roomFunctions.length > 0;
  
  const roomTemperatureValue = room.roomTemperatureGroupAddress ? deviceStates[room.roomTemperatureGroupAddress] : undefined;
  const targetTempValue = room.roomSetpointStatusGroupAddress ? deviceStates[room.roomSetpointStatusGroupAddress] : undefined;
  const shiftStatusValue = room.roomSetpointShiftStatusGroupAddress ? deviceStates[room.roomSetpointShiftStatusGroupAddress] : undefined;
  const heatingCoolingStatusValue = room.roomHeatingCoolingStatusGroupAddress ? deviceStates[room.roomHeatingCoolingStatusGroupAddress] : undefined;
  
  const hasRoomTemperature = room.roomTemperatureGroupAddress && roomTemperatureValue !== undefined && roomTemperatureValue !== null && roomTemperatureValue !== '';
  const parsedRoomTemperature = hasRoomTemperature ? Number(roomTemperatureValue) : null;
  const showRoomTemperature = Number.isFinite(parsedRoomTemperature);
  
  const isInteractiveHeating = Boolean(
    room.roomSetpointShiftGroupAddress && 
    room.roomSetpointStatusGroupAddress && 
    room.roomSetpointShiftStatusGroupAddress
  );
  const [isHeatingModalOpen, setIsHeatingModalOpen] = useState(false);

  const renderFuncIcon = (func, isOn) => {
    const effective = func.invertIcon ? !isOn : isOn;
    switch (func.type) {
      case 'scene':  return <Play size={24} />;
      case 'light':  return <Lightbulb size={24} fill={effective ? 'currentColor' : 'none'} />;
      case 'lock':   return effective ? <Lock size={24} /> : <LockOpen size={24} />;
      case 'socket': return <Plug size={24} />;
      case 'binary_selector': return <ArrowLeftRight size={24} />;
      case 'switch': {
        if ((func.iconType || 'lightbulb') === 'lock') return effective ? <Lock size={24} /> : <LockOpen size={24} />;
        return <Lightbulb size={24} fill={effective ? 'currentColor' : 'none'} />;
      }
      default:       return <Power size={24} />;
    }
  };

  return (
    <>
      <div className="room-card" style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 18,
        padding: 'var(--pad-card, 18px)',
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 0,
        boxShadow: '0 1px 0 rgba(255,222,184,0.04) inset, 0 12px 30px -22px rgba(0,0,0,0.6)',
        cursor: 'default',
      }}>
        {/* Aura — soft bloom top-left */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 18, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(140% 80% at 0% 0%, ${hexAlpha(aura.c1, 0.23)}, transparent 65%)`,
            maskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 70%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 70%, transparent 100%)',
          }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${hexAlpha(aura.c1, 0.55)}, ${hexAlpha(aura.c1, 0.10)} 55%, transparent)`,
          }} />
        </div>

        {/* Header */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)', lineHeight: 1.1 }} title={room.name}>
              {room.name}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
              {[
                roomScenes.length ? `${roomScenes.length} Szenen` : null,
                roomFunctions.filter(f => f.type === 'percentage').length ? `${roomFunctions.filter(f => f.type === 'percentage').length} Shades` : null,
                roomFunctions.filter(f => f.type !== 'percentage').length ? `${roomFunctions.filter(f => f.type !== 'percentage').length} Funktionen` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          {showRoomTemperature && (
            <button
              className="interactive"
              onClick={() => {
                if (isInteractiveHeating) setIsHeatingModalOpen(true);
                else addToast('Temperature control not set up for this room', 'info');
              }}
              title={isInteractiveHeating ? 'Adjust Temperature' : 'Current Temperature'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 999,
                background: 'rgba(255,159,112,0.10)',
                border: '1px solid rgba(255,159,112,0.22)',
                color: '#ffc89a', fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
                cursor: isInteractiveHeating ? 'pointer' : 'default', flexShrink: 0,
              }}>
              <Thermometer size={12} color="#ffc89a" />
              {parsedRoomTemperature.toFixed(1)}°
            </button>
          )}
        </div>

        {/* Light scenes */}
        {roomScenes.filter(sc => (sc.category || 'light') === 'light').length > 0 && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Licht · Szenen
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {roomScenes.filter(sc => (sc.category || 'light') === 'light').map(sc => (
                <button key={sc.id}
                  onClick={() => handleSceneAction(room, sc)}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    background: 'rgba(255,222,184,0.06)',
                    border: '1px solid rgba(255,222,184,0.10)',
                    color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.01em',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}>
                  {sc.name || `Scene ${sc.sceneNumber}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shade scenes */}
        {roomScenes.filter(sc => sc.category === 'shade').length > 0 && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Beschattung
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {roomScenes.filter(sc => sc.category === 'shade').map(sc => (
                <button key={sc.id}
                  onClick={() => handleSceneAction(room, sc)}
                  style={{
                    padding: '7px 14px 7px 11px', borderRadius: 999,
                    background: 'rgba(216,150,100,0.08)',
                    border: '1px solid rgba(216,150,100,0.18)',
                    color: '#e8c39c', fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.01em',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                  <Blinds size={10} color="#e8c39c" />
                  {sc.name || `Scene ${sc.sceneNumber}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Functions */}
        {hasFunctions && (
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Funktionen
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {roomFunctions.map(func => {
                if (func.type === 'percentage') {
                  return (
                    <BlindsCard key={func.id} func={func}
                      istPosition={deviceStates[func.statusGroupAddress] !== undefined ? deviceStates[func.statusGroupAddress] : 0}
                      isMoving={func.movingGroupAddress ? deviceStates[func.movingGroupAddress] : undefined}
                      onAction={handleAction} />
                  );
                }
                if (func.type === 'binary_selector') {
                  return (
                    <BinarySelectorCard key={func.id} func={func}
                      currentState={deviceStates[func.statusGroupAddress]}
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
                // Binary types: hue, switch, light, lock, socket, scene
                const isBinary = ['switch', 'light', 'lock', 'socket', 'scene'].includes(func.type);
                const isHue = func.type === 'hue';
                const isOn = isHue ? !!hueStates[`hue_${func.hueLightId}`] : (isBinary ? !!deviceStates[func.statusGroupAddress] : false);
                const onToggle = () => isHue ? handleHueAction(func) : handleAction(func);
                const effective = func.invertIcon ? !isOn : isOn;
                let icon;
                switch (func.type) {
                  case 'scene': icon = <Play size={16} color="var(--accent-color)" />; break;
                  case 'light': icon = <Lightbulb size={16} color={effective ? '#ffd089' : 'var(--text-tertiary)'} fill={effective ? '#ffd089' : 'none'} />; break;
                  case 'lock': icon = effective ? <Lock size={16} color="#9ee2bd" /> : <LockOpen size={16} color="var(--text-tertiary)" />; break;
                  case 'socket': icon = <Plug size={16} color={isOn ? '#9ee2bd' : 'var(--text-tertiary)'} />; break;
                  case 'hue': icon = <Lightbulb size={16} color={isOn ? '#ffd089' : 'var(--text-tertiary)'} fill={isOn ? '#ffd089' : 'none'} />; break;
                  case 'switch': {
                    const t = func.iconType || 'lightbulb';
                    icon = t === 'lock'
                      ? (effective ? <Lock size={16} color="#9ee2bd" /> : <LockOpen size={16} color="var(--text-tertiary)" />)
                      : <Lightbulb size={16} color={effective ? '#ffd089' : 'var(--text-tertiary)'} fill={effective ? '#ffd089' : 'none'} />;
                    break;
                  }
                  default: icon = <Power size={16} color={isOn ? '#9ee2bd' : 'var(--text-tertiary)'} />;
                }
                const isScene = func.type === 'scene';
                return (
                  <button key={func.id}
                    data-testid="function-tile"
                    data-active={String(isOn)}
                    onClick={onToggle}
                    style={{
                      background: isOn ? 'rgba(111,212,156,0.06)' : 'rgba(255,222,184,0.03)',
                      border: `1px solid ${isOn ? 'rgba(111,212,156,0.20)' : 'rgba(255,222,184,0.07)'}`,
                      borderRadius: 16, padding: 12,
                      display: 'flex', flexDirection: 'column', gap: 10,
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {icon}
                      {!isScene && (
                        <div
                          data-testid="toggle-switch"
                          data-active={String(isOn)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: 36, height: 22, borderRadius: 999,
                            background: isOn ? 'linear-gradient(135deg,#ffc78a,#c66a35)' : 'rgba(255,222,184,0.08)',
                            border: isOn ? '1px solid transparent' : '1px solid rgba(255,222,184,0.10)',
                            position: 'relative', flexShrink: 0,
                            transition: 'all 0.2s ease',
                          }}>
                          <div style={{
                            position: 'absolute', top: 2, left: 2,
                            width: 16, height: 16, borderRadius: 999,
                            background: isOn ? '#fff' : '#b6a995',
                            transform: isOn ? 'translateX(14px)' : 'translateX(0)',
                            transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          }} />
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)', lineHeight: 1.25 }}>
                      {func.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!hasFunctions && !hasScenes && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>No functions available</div>
        )}
      </div>

      {isHeatingModalOpen && (
        <RoomTemperatureModal
          room={room}
          currentTemp={parsedRoomTemperature}
          targetTemp={targetTempValue !== undefined ? Number(targetTempValue) : undefined}
          currentShift={shiftStatusValue !== undefined ? Number(shiftStatusValue) : 0}
          heatingCoolingStatus={heatingCoolingStatusValue !== undefined ? Number(heatingCoolingStatusValue) : undefined}
          onClose={() => setIsHeatingModalOpen(false)}
          onAction={handleAction}
        />
      )}
    </>
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
          {activeRooms.map((room, index) => (
            <RoomCard key={room.id} room={room} roomIndex={index}
              deviceStates={deviceStates} hueStates={hueStates}
              handleAction={(func) => handleAction(func, activeFloor?.isShared ? 'shared' : 'apartment')}
              handleHueAction={(func) => handleHueAction(func, activeFloor?.isShared ? 'shared' : 'apartment')}
              handleSceneAction={(selectedRoom, scene) => handleSceneAction(selectedRoom, scene, activeFloor?.isShared ? 'shared' : 'apartment')}
              addToast={addToast} />
          ))}
        </div>
      )}
    </div>
  );
}
