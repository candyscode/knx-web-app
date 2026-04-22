import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { Home, Settings as SettingsIcon, Wifi, WifiOff, Plug, Clock3 } from 'lucide-react';
import Dashboard from './Dashboard';
import Settings from './Settings';
import Connections from './Connections';
import Automation from './Automation';
import { getConfig } from './configApi';
import { buildApartmentPath, buildApartmentView, migrateLegacyConfig, parseAppPath } from './appModel';

function App() {
  const [route, setRoute] = useState(() => parseAppPath(window.location.pathname));
  const [config, setConfig] = useState(() => migrateLegacyConfig({}));
  const [knxStatuses, setKnxStatuses] = useState({});
  const [sharedKnxStatus, setSharedKnxStatus] = useState({ connected: false, msg: 'Connecting...' });
  const [hueStatuses, setHueStatuses] = useState({});
  const [sharedHueStatus, setSharedHueStatus] = useState({ paired: false, bridgeIp: '' });
  const [deviceStates, setDeviceStates] = useState({ apartments: {}, shared: {} });
  const [hueStates, setHueStates] = useState({ apartments: {}, shared: {} });
  const [toasts, setToasts] = useState([]);

  const normalizedConfig = useMemo(() => migrateLegacyConfig(config), [config]);
  const { apartment, apartmentConfig } = useMemo(
    () => buildApartmentView(normalizedConfig, route.apartmentSlug),
    [normalizedConfig, route.apartmentSlug]
  );

  const addToast = (msg, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => removeToast(id), 7000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const fetchConfig = async () => {
    try {
      const result = await getConfig();
      setConfig(migrateLegacyConfig(result));
    } catch {
      addToast('Failed to load configuration from backend', 'error');
    }
  };

  const applyConfig = (nextConfig) => {
    setConfig(migrateLegacyConfig(nextConfig));
  };

  const navigateTo = (slug, section = 'dashboard', { replace = false } = {}) => {
    const nextPath = buildApartmentPath(slug, section);
    if (replace) window.history.replaceState({}, '', nextPath);
    else window.history.pushState({}, '', nextPath);
    setRoute({ apartmentSlug: slug, section });
  };

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseAppPath(window.location.pathname, normalizedConfig.apartments));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [normalizedConfig.apartments]);

  useEffect(() => {
    fetchConfig();

    let socketUrl = 'http://localhost:3001';
    if (import.meta.env.VITE_BACKEND_URL) socketUrl = import.meta.env.VITE_BACKEND_URL;
    else if (!import.meta.env.DEV) socketUrl = '/';

    const socket = io(socketUrl);

    socket.on('knx_status', (status) => {
      if (status.scope === 'shared') {
        setSharedKnxStatus(status);
        return;
      }
      setKnxStatuses((prev) => ({ ...prev, [status.apartmentId]: status }));
    });

    socket.on('knx_error', (error) => addToast(error.msg, 'error'));

    socket.on('knx_initial_states', (snapshot) => {
      if (snapshot?.apartments || snapshot?.shared) {
        setDeviceStates({
          apartments: snapshot.apartments || {},
          shared: snapshot.shared || {},
        });
        return;
      }

      setDeviceStates({
        apartments: apartment?.id ? { [apartment.id]: snapshot || {} } : {},
        shared: {},
      });
    });

    socket.on('knx_state_update', (update) => {
      if (update.scope === 'shared') {
        setDeviceStates((prev) => ({
          ...prev,
          shared: {
            ...prev.shared,
            [update.groupAddress]: update.value,
          },
        }));
        return;
      }

      setDeviceStates((prev) => ({
        ...prev,
        apartments: {
          ...prev.apartments,
          [update.apartmentId]: {
            ...(prev.apartments[update.apartmentId] || {}),
            [update.groupAddress]: update.value,
          },
        },
      }));
    });

    socket.on('hue_status', (status) => {
      if (status.scope === 'shared') {
        setSharedHueStatus(status);
        return;
      }
      setHueStatuses((prev) => ({ ...prev, [status.apartmentId]: status }));
    });

    socket.on('hue_states', (payload) => {
      if (payload.scope === 'shared') {
        setHueStates((prev) => ({
          ...prev,
          shared: { ...prev.shared, ...(payload.states || {}) },
        }));
        return;
      }

      setHueStates((prev) => ({
        ...prev,
        apartments: {
          ...prev.apartments,
          [payload.apartmentId]: {
            ...(prev.apartments[payload.apartmentId] || {}),
            ...(payload.states || {}),
          },
        },
      }));
    });

    socket.on('hue_state_update', (update) => {
      if (update.scope === 'shared') {
        setHueStates((prev) => ({
          ...prev,
          shared: { ...prev.shared, [update.lightId]: update.on },
        }));
        return;
      }

      setHueStates((prev) => ({
        ...prev,
        apartments: {
          ...prev.apartments,
          [update.apartmentId]: {
            ...(prev.apartments[update.apartmentId] || {}),
            [update.lightId]: update.on,
          },
        },
      }));
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (!normalizedConfig.apartments.length) return;

    if (!apartment) {
      navigateTo(normalizedConfig.apartments[0].slug, route.section, { replace: true });
      return;
    }

    if (window.location.pathname === '/') {
      navigateTo(apartment.slug, 'dashboard', { replace: true });
    }
  }, [normalizedConfig.apartments, apartment, route.section]);

  const currentKnxStatus = apartment ? (knxStatuses[apartment.id] || { connected: false, msg: 'Connecting...' }) : { connected: false, msg: 'Connecting...' };
  const currentHueStatus = apartment ? (hueStatuses[apartment.id] || { paired: false, bridgeIp: '' }) : { paired: false, bridgeIp: '' };
  const apartmentDeviceStates = apartment ? (deviceStates.apartments[apartment.id] || {}) : {};
  const apartmentHueStates = apartment ? (hueStates.apartments[apartment.id] || {}) : {};

  const mergedDeviceStates = useMemo(
    () => ({ ...apartmentDeviceStates, ...deviceStates.shared }),
    [apartmentDeviceStates, deviceStates.shared]
  );
  const mergedHueStates = useMemo(
    () => ({ ...apartmentHueStates, ...hueStates.shared }),
    [apartmentHueStates, hueStates.shared]
  );

  const setCurrentApartmentDeviceStates = (updater) => {
    if (!apartment) return;
    setDeviceStates((prev) => {
      const previousApartmentState = prev.apartments[apartment.id] || {};
      const nextApartmentState = typeof updater === 'function'
        ? updater(previousApartmentState)
        : updater;

      return {
        ...prev,
        apartments: {
          ...prev.apartments,
          [apartment.id]: nextApartmentState,
        },
      };
    });
  };

  const setCurrentHueStates = (updater) => {
    if (!apartment) return;
    setHueStates((prev) => {
      const previousApartmentState = prev.apartments[apartment.id] || {};
      const nextApartmentState = typeof updater === 'function'
        ? updater(previousApartmentState)
        : updater;

      return {
        ...prev,
        apartments: {
          ...prev.apartments,
          [apartment.id]: nextApartmentState,
        },
      };
    });
  };

  const setSharedDeviceStateMap = (updater) => {
    setDeviceStates((prev) => ({
      ...prev,
      shared: typeof updater === 'function' ? updater(prev.shared || {}) : updater,
    }));
  };

  const setSharedHueStateMap = (updater) => {
    setHueStates((prev) => ({
      ...prev,
      shared: typeof updater === 'function' ? updater(prev.shared || {}) : updater,
    }));
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-brand">
          <h1>KNX Control</h1>
          {normalizedConfig.apartments.length > 0 && (
            <select
              className="app-apartment-switcher"
              value={apartment?.slug || ''}
              onChange={(event) => navigateTo(event.target.value, route.section)}
            >
              {normalizedConfig.apartments.map((entry) => (
                <option key={entry.id} value={entry.slug}>{entry.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="header-controls">
          <div className={`status-badge ${currentKnxStatus.connected ? 'status-connected' : 'status-disconnected'}`}>
            {currentKnxStatus.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <div className="status-dot" />
            <span className="nav-link-text">{apartment?.name || 'Apartment'} {currentKnxStatus.connected ? 'Connected' : 'Offline'}</span>
          </div>

          <nav className="nav-links glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button
              id="nav-dashboard"
              className={`nav-link ${route.section === 'dashboard' ? 'active' : ''}`}
              onClick={() => apartment && navigateTo(apartment.slug, 'dashboard')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <Home size={18} /><span className="nav-link-text"> Dashboard</span>
            </button>
            <button
              id="nav-settings"
              className={`nav-link ${route.section === 'rooms' ? 'active' : ''}`}
              onClick={() => apartment && navigateTo(apartment.slug, 'rooms')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <SettingsIcon size={18} /><span className="nav-link-text"> Rooms</span>
            </button>
            <button
              id="nav-connections"
              className={`nav-link ${route.section === 'connections' ? 'active' : ''}`}
              onClick={() => apartment && navigateTo(apartment.slug, 'connections')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <Plug size={18} /><span className="nav-link-text"> Setup</span>
            </button>
            <button
              id="nav-automation"
              className={`nav-link ${route.section === 'automation' ? 'active' : ''}`}
              onClick={() => apartment && navigateTo(apartment.slug, 'automation')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem' }}
            >
              <Clock3 size={18} /><span className="nav-link-text"> Automation</span>
            </button>
          </nav>
        </div>
      </header>

      <main>
        {apartment && apartmentConfig && route.section === 'dashboard' && (
          <Dashboard
            apartment={apartment}
            config={apartmentConfig}
            fetchConfig={fetchConfig}
            deviceStates={mergedDeviceStates}
            setDeviceStates={setCurrentApartmentDeviceStates}
            hueStates={mergedHueStates}
            setHueStates={setCurrentHueStates}
            setSharedDeviceStates={setSharedDeviceStateMap}
            setSharedHueStates={setSharedHueStateMap}
            addToast={addToast}
          />
        )}

        {apartment && apartmentConfig && route.section === 'rooms' && (
          <Settings
            fullConfig={normalizedConfig}
            apartment={apartment}
            config={apartmentConfig}
            fetchConfig={fetchConfig}
            applyConfig={applyConfig}
            hueStatus={currentHueStatus}
            sharedHueStatus={sharedHueStatus}
            addToast={addToast}
          />
        )}

        {apartment && apartmentConfig && route.section === 'connections' && (
          <Connections
            fullConfig={normalizedConfig}
            apartment={apartment}
            config={apartmentConfig}
            fetchConfig={fetchConfig}
            applyConfig={applyConfig}
            knxStatus={currentKnxStatus}
            sharedKnxStatus={sharedKnxStatus}
            hueStatus={currentHueStatus}
            addToast={addToast}
            navigateToApartment={(slug) => navigateTo(slug, 'dashboard')}
          />
        )}

        {apartment && apartmentConfig && route.section === 'automation' && (
          <Automation
            fullConfig={normalizedConfig}
            apartment={apartment}
            config={apartmentConfig}
            fetchConfig={fetchConfig}
            applyConfig={applyConfig}
            addToast={addToast}
          />
        )}
      </main>

      <div className="toast-container">
        {toasts.map((toast) => (
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
