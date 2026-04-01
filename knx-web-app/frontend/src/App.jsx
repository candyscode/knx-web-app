import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './Dashboard';
import Settings from './Settings';
import { Home, Settings as SettingsIcon, Wifi, WifiOff } from 'lucide-react';
import { getConfig } from './configApi';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState({ knxIp: '', knxPort: 3671, hue: { bridgeIp: '', apiKey: '' }, rooms: [] });
  const [knxStatus, setKnxStatus] = useState({ connected: false, msg: 'Connecting...' });
  const [hueStatus, setHueStatus] = useState({ paired: false, bridgeIp: '' });
  const [deviceStates, setDeviceStates] = useState({});
  const [hueStates, setHueStates] = useState({});
  const [toasts, setToasts] = useState([]);

  const addToast = (msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 7000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const fetchConfig = async () => {
    try {
      const data = await getConfig();
      setConfig(data);
    } catch (err) {
      addToast('Failed to load configuration from backend', 'error');
    }
  };

  useEffect(() => {
    fetchConfig();
    
    // Initialize socket inside effect to prevent missing early "initial_states" events
    const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

    socket.on('knx_status', (status) => {
      setKnxStatus(status);
    });

    socket.on('knx_error', (error) => {
      addToast(error.msg, 'error');
    });

    socket.on('knx_initial_states', (states) => {
      setDeviceStates(states);
    });

    socket.on('knx_state_update', (update) => {
      setDeviceStates(prev => ({ ...prev, [update.groupAddress]: update.value }));
    });

    // Hue events
    socket.on('hue_status', (status) => {
      setHueStatus(status);
    });

    socket.on('hue_states', (states) => {
      setHueStates(prev => ({ ...prev, ...states }));
    });

    socket.on('hue_state_update', (update) => {
      setHueStates(prev => ({ ...prev, [update.lightId]: update.on }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          KNX Control
        </h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div className={`status-badge ${knxStatus.connected ? 'status-connected' : 'status-disconnected'}`}>
            {knxStatus.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <div className="status-dot"></div>
            <span className="nav-link-text">{knxStatus.connected ? 'Connected' : 'Offline'}</span>
          </div>
          
          <nav className="nav-links glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <Home size={18} /><span className="nav-link-text"> Dashboard</span>
            </button>
            <button 
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <SettingsIcon size={18} /><span className="nav-link-text"> Settings</span>
            </button>
          </nav>
        </div>
      </header>

      <main>
        {activeTab === 'dashboard' && <Dashboard config={config} deviceStates={deviceStates} setDeviceStates={setDeviceStates} hueStates={hueStates} setHueStates={setHueStates} addToast={addToast} />}
        {activeTab === 'settings' && <Settings config={config} fetchConfig={fetchConfig} hueStatus={hueStatus} setHueStatus={setHueStatus} addToast={addToast} />}
      </main>

      {/* Toasts overlay */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div>{toast.msg}</div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
