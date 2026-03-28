import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './Dashboard';
import Settings from './Settings';
import { Home, Settings as SettingsIcon, Wifi, WifiOff } from 'lucide-react';
import { getConfig } from './configApi';

const socket = io('http://localhost:3001');

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState({ knxIp: '', knxPort: 3671, rooms: [] });
  const [knxStatus, setKnxStatus] = useState({ connected: false, msg: 'Connecting...' });
  const [deviceStates, setDeviceStates] = useState({});
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

    socket.on('knx_status', (status) => {
      setKnxStatus(status);
      if(status.connected) addToast(status.msg, 'success');
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

    return () => {
      socket.off('knx_status');
      socket.off('knx_error');
      socket.off('knx_initial_states');
      socket.off('knx_state_update');
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
            <div className="status-dot"></div>
            {knxStatus.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            {knxStatus.connected ? 'Connected' : 'Offline'}
          </div>
          
          <nav className="nav-links glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <Home size={18} /> Dashboard
            </button>
            <button 
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <SettingsIcon size={18} /> Settings
            </button>
          </nav>
        </div>
      </header>

      <main>
        {activeTab === 'dashboard' && <Dashboard config={config} deviceStates={deviceStates} addToast={addToast} />}
        {activeTab === 'settings' && <Settings config={config} fetchConfig={fetchConfig} addToast={addToast} />}
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
