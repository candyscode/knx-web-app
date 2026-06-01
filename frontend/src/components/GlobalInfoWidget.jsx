import React from 'react';
import { Thermometer, Wind, Sun, AlertTriangle } from 'lucide-react';

export default function GlobalInfoWidget({ globals, deviceStates }) {
  if (!globals || globals.length === 0) return null;

  const alarms = globals.filter(g => g.type === 'alarm');
  const infos = globals.filter(g => g.type === 'info');

  const activeAlarms = alarms.filter(a => {
    const val = deviceStates[a.statusGroupAddress];
    return val === true || val === 1;
  });

  if (infos.length === 0 && activeAlarms.length === 0) return null;

  const iconFor = (info) => {
    if (info.category === 'temperature') return <Thermometer size={16} color="#ff9f70" />;
    if (info.category === 'wind') return <Wind size={16} color="#b9b09c" />;
    if (info.category === 'lux') return <Sun size={16} color="#ffd089" />;
    return <Sun size={16} color="#b9b09c" />;
  };

  const formatVal = (info) => {
    const val = deviceStates[info.statusGroupAddress];
    if (val === undefined || val === null) return '--';
    const n = Number(val);
    if (!Number.isFinite(n)) return '--';
    if (info.category === 'temperature') return `${n.toFixed(1)} °C`;
    if (info.category === 'wind') return `${n.toFixed(1)} m/s`;
    if (info.category === 'lux') return `${Math.round(n)} Lux`;
    return String(val);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {activeAlarms.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 18, padding: '12px 16px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#fca5a5', fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={16} /> Aktive Alarme
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {activeAlarms.map(alarm => (
              <span key={alarm.id} className="active-alarm-pill" style={{
                padding: '4px 10px', borderRadius: 999,
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)',
                color: '#fca5a5', fontSize: 12, fontWeight: 600,
              }}>{alarm.name}</span>
            ))}
          </div>
        </div>
      )}

      {infos.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(255,222,184,0.06)',
          borderRadius: 18,
          padding: '14px 16px',
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(infos.length, 3)}, 1fr)`,
          gap: 4,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.22, pointerEvents: 'none',
            background: 'radial-gradient(140% 90% at 0% 0%, rgba(255,184,112,0.18), transparent 60%), radial-gradient(120% 80% at 100% 100%, rgba(198,106,53,0.12), transparent 60%)',
          }} />
          {infos.map((info, i) => (
            <div key={info.id} style={{
              display: 'flex', gap: 10, alignItems: 'center', position: 'relative',
              paddingLeft: i > 0 ? 12 : 0,
              borderLeft: i > 0 ? '1px solid rgba(255,222,184,0.06)' : 'none',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'rgba(255,222,184,0.05)',
                border: '1px solid rgba(255,222,184,0.07)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                {iconFor(info)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--text-tertiary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{info.name}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {formatVal(info)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
