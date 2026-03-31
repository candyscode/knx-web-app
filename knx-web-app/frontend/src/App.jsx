import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './Dashboard';
import Settings from './Settings';
import { Home, Settings as SettingsIcon, Wifi, WifiOff } from 'lucide-react';
import { getConfig } from './configApi';

const SOCKET_OPTIONS = {
  path: '/socket.io'
};

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
    const socket = io(SOCKET_OPTIONS);

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
        <div className="header-main">
          <h1>
            KNX Control
          </h1>
          <div className={`status-badge ${knxStatus.connected ? 'status-connected' : 'status-disconnected'}`}>
            <div className="status-dot"></div>
            {knxStatus.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            {knxStatus.connected ? 'Connected' : 'Offline'}
          </div>
        </div>

        <div className="header-actions">
          <nav className="nav-links glass-panel">
            <button 
              className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              type="button"
              aria-label="Dashboard"
            >
              <Home size={18} />
              <span className="nav-label">Dashboard</span>
            </button>
            <button 
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              type="button"
              aria-label="Settings"
            >
              <SettingsIcon size={18} />
              <span className="nav-label">Settings</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
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
