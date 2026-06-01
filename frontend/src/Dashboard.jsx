import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { triggerAction, triggerHueAction } from './configApi';
import { Lightbulb, Gamepad2, Blinds, Lock, LockOpen, Play, Plug, Power, SlidersHorizontal, Plus, Minus, X, ArrowLeftRight, Thermometer, ChevronUp, ChevronDown, Square } from 'lucide-react';
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
const GHOST_BTN = {
  padding: '12px 0', background: 'rgba(255,222,184,0.04)',
  border: '1px solid rgba(255,222,184,0.08)', borderRadius: 12,
  cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
};

const BlindsCard = ({ func, istPosition, isMoving, onAction }) => {
  const [sollPosition, setSollPosition] = useState(istPosition !== undefined ? istPosition : 0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const initializedRef = useRef(false);
  const softwareCommandActiveRef = useRef(false);
  const dragRef = useRef(null);

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
    if (isModalOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
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
    setIsDragging(true);
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
    setIsDragging(false);
  };

  const previewPos = istPosition !== undefined ? istPosition : sollPosition;

  return (
    <>
      <button
        data-testid="function-tile"
        data-active="false"
        onClick={() => setIsModalOpen(true)}
        style={{
          background: 'rgba(255,222,184,0.03)', border: '1px solid rgba(255,222,184,0.07)',
          borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', gap: 10,
          textAlign: 'left', width: '100%', fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Blinds size={14} color="#e8c39c" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{func.name}</span>
          {isMoving && !!func.movingGroupAddress && (
            <span style={{ fontSize: 10, color: '#e8c39c', marginLeft: 'auto', opacity: 0.8 }}>⬆⬇</span>
          )}
        </div>
        <div style={{
          borderRadius: 8, height: 52, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(180deg, #1b1813 0%, #14110d 100%)',
          border: '1px solid rgba(255,222,184,0.08)',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: `${previewPos}%`,
            background: 'linear-gradient(180deg, #2a2218 0%, #221b13 100%)',
            backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,222,184,0.06) 0px, rgba(255,222,184,0.06) 1px, transparent 1px, transparent 6px)',
            borderBottom: previewPos > 0 ? '1px solid rgba(255,222,184,0.15)' : 'none',
            transition: 'height 0.18s ease',
          }} />
          <div style={{
            position: 'absolute', bottom: 4, right: 8,
            fontSize: 10, fontWeight: 700, color: 'rgba(255,222,184,0.5)',
            fontFamily: 'ui-monospace, monospace',
          }}>{previewPos}%</div>
        </div>
      </button>

      {isModalOpen && createPortal(
        <div className="widget-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="widget-modal-content" onClick={e => e.stopPropagation()} style={{ padding: '22px 20px 20px' }}>
            {/* aura */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 24, background: 'radial-gradient(140% 80% at 0% 0%, rgba(216,150,100,0.12), transparent 60%)' }} />
            <button onClick={() => setIsModalOpen(false)} style={{
              position: 'absolute', top: 14, right: 14, zIndex: 5,
              width: 32, height: 32, borderRadius: 999, padding: 0,
              background: 'rgba(255,222,184,0.06)', border: '1px solid rgba(255,222,184,0.10)',
              color: '#b6a995', display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}><X size={14} /></button>

            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>Beschattung</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Blinds size={20} color="#e8c39c" />
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>{func.name}</div>
              </div>

              <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                {/* Window visualization wrapper — overflow:visible so handle isn't clipped */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <div className="blinds-widget interactive" style={{ height: 280, marginTop: 0, width: '100%' }}>
                    <div
                      className="blinds-window"
                      onPointerDown={handlePointerDownModal}
                      onPointerMove={handlePointerMoveModal}
                      onPointerUp={handlePointerUpModal}
                      onPointerCancel={handlePointerUpModal}
                      onLostPointerCapture={handlePointerUpModal}
                      style={{ cursor: 'ns-resize', touchAction: 'none', userSelect: 'none', height: '100%',
                        background: 'linear-gradient(180deg, #1b1813 0%, #14110d 100%)',
                        border: '1px solid rgba(255,222,184,0.10)', borderRadius: 16,
                        overflow: 'hidden', position: 'relative',
                      }}
                    >
                      {/* night sky */}
                      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(70% 60% at 50% 110%, rgba(255,199,138,0.10), transparent 60%)' }} />
                      {/* slats */}
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        height: `${sollPosition}%`,
                        background: 'linear-gradient(180deg, #2a2218 0%, #221b13 100%)',
                        borderBottom: sollPosition > 0 ? '1px solid rgba(255,222,184,0.18)' : 'none',
                        boxShadow: sollPosition > 0 ? '0 6px 18px -6px rgba(0,0,0,0.6)' : 'none',
                        overflow: 'hidden', transition: isDragging ? 'none' : 'height 0.18s cubic-bezier(0.22,1,0.36,1)',
                      }}>
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,222,184,0.06) 0px, rgba(255,222,184,0.06) 1px, transparent 1px, transparent 9px)', pointerEvents: 'none' }} />
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(255,199,138,0.10) 0%, transparent 35%)' }} />
                      </div>
                      {/* labels */}
                      <span style={{ position: 'absolute', top: 8, left: 12, fontSize: 10, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: 'rgba(255,222,184,0.40)', pointerEvents: 'none' }}>Geschlossen</span>
                      <span style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 10, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: 'rgba(255,222,184,0.25)', pointerEvents: 'none' }}>Offen</span>
                    </div>
                    <div className="blinds-indicator-bar" title={`Ist: ${istPosition}%`}>
                      <div className="blinds-indicator-fill" style={{ height: `${istPosition}%` }} />
                    </div>
                  </div>
                  {/* Handle rendered outside overflow:hidden, positioned relative to wrapper */}
                  <div style={{
                    position: 'absolute', left: 10, right: 22,
                    top: `clamp(18px, ${sollPosition}%, calc(100% - 18px))`,
                    transform: 'translateY(-50%)',
                    height: 34, borderRadius: 10, pointerEvents: 'none', zIndex: 5,
                    background: isDragging ? 'linear-gradient(135deg, rgba(255,199,138,0.22), rgba(198,106,53,0.22))' : 'rgba(16,13,10,0.88)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,222,184,0.25)',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px',
                    transition: isDragging ? 'none' : 'top 0.18s cubic-bezier(0.22,1,0.36,1)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width: 14, height: 1.5, borderRadius: 2, background: 'rgba(255,222,184,0.55)', display: 'block' }} />)}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFeatureSettings: '"tnum"' }}>{sollPosition}%</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width: 14, height: 1.5, borderRadius: 2, background: 'rgba(255,222,184,0.55)', display: 'block' }} />)}
                    </div>
                  </div>
                </div>

                {/* Side rail */}
                <div style={{ width: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 0' }}>
                  {[0, 25, 50, 75, 100].map(p => (
                    <button key={p} onClick={() => { setSollPosition(p); sendValue(p); }} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                      color: Math.round(sollPosition / 25) * 25 === p ? '#e8c39c' : 'rgba(255,222,184,0.25)',
                      fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
                    }}>
                      <div style={{ width: 8, height: 1.5, borderRadius: 1, background: Math.round(sollPosition / 25) * 25 === p ? '#e8c39c' : 'rgba(255,222,184,0.20)' }} />
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <button onClick={() => { setSollPosition(0); sendValue(0); }} style={GHOST_BTN}>
                  <ChevronUp size={14} color="#b6a995" />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Auf</span>
                </button>
                <button style={{ ...GHOST_BTN, opacity: func.movingGroupAddress ? 1 : 0.35, cursor: func.movingGroupAddress ? 'pointer' : 'not-allowed' }}
                  disabled={!func.movingGroupAddress}>
                  <Square size={12} color="#b6a995" />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Stopp</span>
                </button>
                <button onClick={() => { setSollPosition(100); sendValue(100); }} style={GHOST_BTN}>
                  <ChevronDown size={14} color="#b6a995" />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Zu</span>
                </button>
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
  const [isDragging, setIsDragging] = useState(false);
  const initializedRef = useRef(false);
  const lockRef = useRef(false);
  const dragRef = useRef(null);

  useEffect(() => {
    if (istPosition === undefined) return;
    if (!initializedRef.current) { initializedRef.current = true; lockRef.current = false; setSollPosition(istPosition); return; }
    if (lockRef.current) return;
    setSollPosition(istPosition);
  }, [istPosition]);

  useEffect(() => {
    if (isModalOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
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
    setIsDragging(true);
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
    setIsDragging(false);
  };

  const previewPos = istPosition !== undefined ? istPosition : sollPosition;
  const warmAlpha = (a) => `rgba(249,115,22,${a})`;

  return (
    <>
      <button
        data-testid="function-tile"
        data-active="false"
        onClick={() => setIsModalOpen(true)}
        style={{
          background: 'rgba(255,222,184,0.03)', border: '1px solid rgba(255,222,184,0.07)',
          borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', gap: 10,
          textAlign: 'left', width: '100%', fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lightbulb size={14} color={previewPos > 0 ? '#ffd089' : 'var(--text-tertiary)'} fill={previewPos > 0 ? '#ffd089' : 'none'} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{func.name}</span>
        </div>
        <div style={{
          borderRadius: 8, height: 52, position: 'relative', overflow: 'hidden',
          background: '#111827', border: '1px solid rgba(255,222,184,0.08)',
        }}>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${previewPos}%`,
            background: `linear-gradient(to top, #111827, ${warmAlpha(0.85)})`,
            transition: 'height 0.18s ease',
          }} />
          <div style={{
            position: 'absolute', bottom: 4, right: 8,
            fontSize: 10, fontWeight: 700, color: 'rgba(255,222,184,0.5)',
            fontFamily: 'ui-monospace, monospace',
          }}>{previewPos}%</div>
        </div>
      </button>

      {isModalOpen && createPortal(
        <div className="widget-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="widget-modal-content" onClick={e => e.stopPropagation()} style={{ padding: '22px 20px 20px' }}>
            {/* aura */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 24, background: 'radial-gradient(140% 80% at 0% 0%, rgba(255,184,112,0.12), transparent 60%)' }} />
            <button onClick={() => setIsModalOpen(false)} style={{
              position: 'absolute', top: 14, right: 14, zIndex: 5,
              width: 32, height: 32, borderRadius: 999, padding: 0,
              background: 'rgba(255,222,184,0.06)', border: '1px solid rgba(255,222,184,0.10)',
              color: '#b6a995', display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}><X size={14} /></button>

            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>Dimmer</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Lightbulb size={20} color="#ffc89a" fill={sollPosition > 0 ? '#ffc89a' : 'none'} />
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>{func.name}</div>
              </div>

              <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                {/* Dimmer visualization wrapper */}
                <div style={{ flex: 1, position: 'relative' }}>
                  <div className="dimmer-widget interactive" style={{ height: 280, marginTop: 0, width: '100%' }}>
                    <div
                      className="dimmer-track"
                      onPointerDown={handlePointerDownModal}
                      onPointerMove={handlePointerMoveModal}
                      onPointerUp={handlePointerUpModal}
                      onPointerCancel={handlePointerUpModal}
                      onLostPointerCapture={handlePointerUpModal}
                      style={{
                        cursor: 'ns-resize', touchAction: 'none', userSelect: 'none', height: '100%',
                        background: '#0d0b09', borderRadius: 16, overflow: 'hidden', position: 'relative',
                        border: '1px solid rgba(255,222,184,0.10)',
                      }}
                    >
                      {/* warm glow at top when bright */}
                      {sollPosition > 0 && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${warmAlpha(0.15 * sollPosition / 100)}, transparent 70%)` }} />}
                      <div className="dimmer-fill" style={{ height: `${sollPosition}%`, background: `linear-gradient(to top, #111827, ${warmAlpha(0.7)})`, borderTop: sollPosition > 0 ? `2px solid ${warmAlpha(0.9)}` : 'none', boxShadow: sollPosition > 0 ? `0 -4px 18px ${warmAlpha(0.25)}` : 'none', transition: isDragging ? 'none' : undefined }} />
                      <span style={{ position: 'absolute', top: 8, left: 12, fontSize: 10, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: 'rgba(255,222,184,0.35)', pointerEvents: 'none' }}>Hell</span>
                      <span style={{ position: 'absolute', bottom: 8, left: 12, fontSize: 10, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: 'rgba(255,222,184,0.25)', pointerEvents: 'none' }}>Aus</span>
                    </div>
                  </div>
                  {/* Draggable handle — inverted (bottom = 0%, top = 100%) */}
                  <div style={{
                    position: 'absolute', left: 10, right: 8,
                    top: `clamp(18px, ${100 - sollPosition}%, calc(100% - 18px))`,
                    transform: 'translateY(-50%)',
                    height: 34, borderRadius: 10, pointerEvents: 'none', zIndex: 5,
                    background: isDragging ? `linear-gradient(135deg, ${warmAlpha(0.25)}, rgba(249,159,22,0.18))` : 'rgba(16,13,10,0.88)',
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${isDragging ? warmAlpha(0.45) : 'rgba(255,222,184,0.20)'}`,
                    boxShadow: '0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px',
                    transition: isDragging ? 'none' : 'top 0.18s cubic-bezier(0.22,1,0.36,1)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width: 14, height: 1.5, borderRadius: 2, background: 'rgba(255,222,184,0.55)', display: 'block' }} />)}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFeatureSettings: '"tnum"' }}>{sollPosition}%</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {[0,1,2].map(i => <span key={i} style={{ width: 14, height: 1.5, borderRadius: 2, background: 'rgba(255,222,184,0.55)', display: 'block' }} />)}
                    </div>
                  </div>
                </div>

                {/* Side rail — inverted (0 at bottom = Aus, 100 at top = Hell) */}
                <div style={{ width: 36, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 0' }}>
                  {[100, 75, 50, 25, 0].map(p => (
                    <button key={p} onClick={() => { setSollPosition(p); sendValue(p); }} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                      color: Math.round(sollPosition / 25) * 25 === p ? '#ffc89a' : 'rgba(255,222,184,0.25)',
                      fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
                    }}>
                      <div style={{ width: 8, height: 1.5, borderRadius: 1, background: Math.round(sollPosition / 25) * 25 === p ? '#ffc89a' : 'rgba(255,222,184,0.20)' }} />
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick presets */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[{ label: 'Aus', v: 0 }, { label: '50%', v: 50 }, { label: 'Voll', v: 100 }].map(({ label, v }) => (
                  <button key={v} onClick={() => { setSollPosition(v); sendValue(v); }} style={GHOST_BTN}>
                    <Lightbulb size={13} color="#b6a995" fill={v > 0 ? '#b6a995' : 'none'} />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
                  </button>
                ))}
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
