import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './Dashboard';
import Settings from './Settings';
import Connections from './Connections';
import { Home, Settings as SettingsIcon, Wifi, WifiOff, Plug } from 'lucide-react';
import { getConfig } from './configApi';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState({ knxIp: '', knxPort: 3671, hue: { bridgeIp: '', apiKey: '' }, rooms: [], floors: [] });
  const [knxStatus, setKnxStatus] = useState({ connected: false, msg: 'Connecting...' });
  const [hueStatus, setHueStatus] = useState({ paired: false, bridgeIp: '' });
  const [deviceStates, setDeviceStates] = useState({});
  const [hueStates, setHueStates] = useState({});
  const [toasts, setToasts] = useState([]);

  const addToast = (msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => removeToast(id), 7000);
  };
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const fetchConfig = async () => {
    try { setConfig(await getConfig()); }
    catch { addToast('Failed to load configuration from backend', 'error'); }
  };

  useEffect(() => {
    fetchConfig();
    let socketUrl = 'http://localhost:3001';
    if (import.meta.env.VITE_BACKEND_URL) socketUrl = import.meta.env.VITE_BACKEND_URL;
    else if (!import.meta.env.DEV) socketUrl = '/';
    const socket = io(socketUrl);
    socket.on('knx_status', setKnxStatus);
    socket.on('knx_error', e => addToast(e.msg, 'error'));
    socket.on('knx_initial_states', setDeviceStates);
    socket.on('knx_state_update', u => setDeviceStates(prev => ({ ...prev, [u.groupAddress]: u.value })));
    socket.on('hue_status', setHueStatus);
    socket.on('hue_states', s => setHueStates(prev => ({ ...prev, ...s })));
    socket.on('hue_state_update', u => setHueStates(prev => ({ ...prev, [`hue_${u.lightId}`]: u.on })));
    return () => socket.disconnect();
  }, []);

  return (
    <div className="app-container">
      <header className="header">
        <h1>KNX Control</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className={`status-badge ${knxStatus.connected ? 'status-connected' : 'status-disconnected'}`}>
            {knxStatus.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <div className="status-dot" />
            <span className="nav-link-text">{knxStatus.connected ? 'Connected' : 'Offline'}</span>
          </div>
          <nav className="nav-links glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button id="nav-dashboard" className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}>
              <Home size={18} /><span className="nav-link-text"> Dashboard</span>
            </button>
            <button id="nav-settings" className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}>
              <SettingsIcon size={18} /><span className="nav-link-text"> Rooms</span>
            </button>
            <button id="nav-connections" className={`nav-link ${activeTab === 'connections' ? 'active' : ''}`}
              onClick={() => setActiveTab('connections')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}>
              <Plug size={18} /><span className="nav-link-text"> Connections</span>
            </button>
          </nav>
        </div>
      </header>

      <main>
        {activeTab === 'dashboard' && (
          <Dashboard config={config} fetchConfig={fetchConfig} deviceStates={deviceStates} setDeviceStates={setDeviceStates}
            hueStates={hueStates} setHueStates={setHueStates} addToast={addToast} />
        )}
        {activeTab === 'settings' && (
          <Settings config={config} fetchConfig={fetchConfig} hueStatus={hueStatus}
            setHueStatus={setHueStatus} addToast={addToast} />
        )}
        {activeTab === 'connections' && (
          <Connections config={config} fetchConfig={fetchConfig} hueStatus={hueStatus}
            setHueStatus={setHueStatus} addToast={addToast} />
        )}
      </main>

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
