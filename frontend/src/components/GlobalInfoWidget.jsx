import React from 'react';
import { AlertTriangle, Thermometer, Wind, Sun, Info } from 'lucide-react';

function formatNumericValue(value, digits, unit, fallback = '--') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return `${parsed.toFixed(digits)} ${unit}`;
}

export default function GlobalInfoWidget({ globals, deviceStates }) {
  if (!globals || globals.length === 0) return null;

  const alarms = globals.filter(g => g.type === 'alarm');
  const infos = globals.filter(g => g.type === 'info');

  // Active alarms are those where deviceStates represents TRUE or 1
  const activeAlarms = alarms.filter(a => {
    const val = deviceStates[a.statusGroupAddress];
    return val === true || val === 1;
  });

  if (infos.length === 0 && activeAlarms.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      
      {/* Active Alarms */}
      {activeAlarms.length > 0 && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.15)', 
          border: '1px solid rgba(239, 68, 68, 0.3)', 
          borderRadius: '12px', 
          padding: '1rem 1.25rem',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fca5a5' }}>
            <AlertTriangle size={18} /> Active Alarms
          </h4>
          <div className="scene-pills" style={{ marginBottom: 0 }}>
            {activeAlarms.map(alarm => (
              <span key={alarm.id} className="scene-pill active-alarm-pill">
                {alarm.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Global Information / Weather */}
      {infos.length > 0 && (
        <div className="glass-panel" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '1rem 1.5rem', alignItems: 'center' }}>
          {infos.map(info => {
            let val = deviceStates[info.statusGroupAddress];
            let displayVal = val !== undefined ? val : '--';
            
            // Format display based on category
            let Icon = Info;
            if (info.category === 'temperature') {
              Icon = Thermometer;
              if (val !== undefined) displayVal = formatNumericValue(val, 1, '°C');
            } else if (info.category === 'wind') {
              Icon = Wind;
              if (val !== undefined) displayVal = formatNumericValue(val, 1, 'm/s');
            } else if (info.category === 'lux') {
              Icon = Sun;
              if (val !== undefined) {
                const parsed = Number(val);
                displayVal = Number.isFinite(parsed) ? `${Math.round(parsed)} Lux` : '--';
              }
            }

            return (
              <div key={info.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: 'rgba(255,255,255,0.1)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  <Icon size={18} style={{ color: 'var(--accent-color)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {info.name}
                  </span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {displayVal}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
    </div>
  );
}
