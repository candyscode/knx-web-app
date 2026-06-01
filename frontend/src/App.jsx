import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import { Home, Settings as SettingsIcon, Wifi, WifiOff, Plug, Bot, ChevronDown, Check } from 'lucide-react';
import Dashboard from './Dashboard';
import Settings from './Settings';
import Connections from './Connections';
import { getConfig, refreshKnxStatuses, verifyConfigPassword } from './configApi';
import Automation from './Automation';
import { buildApartmentPath, buildApartmentView, migrateLegacyConfig, parseAppPath } from './appModel';
import PasswordDialog from './components/PasswordDialog';

const CONFIG_UNLOCK_STORAGE_KEY = 'knx-config-unlocked';

function App() {
  const [route, setRoute] = useState(() => parseAppPath(window.location.pathname));
  const [config, setConfig] = useState(() => ({ apartments: [], building: {} }));
  const [knxStatuses, setKnxStatuses] = useState({});
  const [hueStatuses, setHueStatuses] = useState({});
  const [deviceStates, setDeviceStates] = useState({ apartments: {}, shared: {} });
  const [hueStates, setHueStates] = useState({ apartments: {}, shared: {} });
  const [toasts, setToasts] = useState([]);
  const [configReady, setConfigReady] = useState(false);
  const [configUnlocked, setConfigUnlocked] = useState(() => {
    try {
      return window.sessionStorage.getItem(CONFIG_UNLOCK_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [configPasswordValue, setConfigPasswordValue] = useState('');
  const [configPasswordError, setConfigPasswordError] = useState('');
  const [aptSwitcherOpen, setAptSwitcherOpen] = useState(false);

  const normalizedConfig = useMemo(() => {
    if (!configReady && !config?.apartments?.length && !config?.building?.sharedInfos?.length) {
      return { apartments: [], building: {} };
    }
    return migrateLegacyConfig(config);
  }, [config, configReady]);
  const { apartment, apartmentConfig } = useMemo(
    () => buildApartmentView(normalizedConfig, route.apartmentSlug),
    [normalizedConfig, route.apartmentSlug]
  );
  const configProtectionEnabled = normalizedConfig.building?.configProtectionEnabled === true;
  const isProtectedSection = route.section === 'rooms' || route.section === 'connections' || route.section === 'automation';
  const isConfigLocked = configProtectionEnabled && isProtectedSection && !configUnlocked;
  const shouldMaskProtectedSection = isProtectedSection && (!configReady || isConfigLocked);
  const canRenderProtectedSection = !isProtectedSection || (configReady && (!configProtectionEnabled || configUnlocked));

  const addToast = (msg, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => removeToast(id), 7000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const fetchConfig = async () => {
    setConfigReady(false);
    try {
      const result = await getConfig();
      setConfig(migrateLegacyConfig(result));
    } catch {
      addToast('Failed to load configuration from backend', 'error');
    } finally {
      setConfigReady(true);
    }
  };

  const applyConfig = (nextConfig) => {
    setConfig(migrateLegacyConfig(nextConfig));
  };

  const persistConfigUnlocked = (value) => {
    setConfigUnlocked(value);
    try {
      if (value) window.sessionStorage.setItem(CONFIG_UNLOCK_STORAGE_KEY, 'true');
      else window.sessionStorage.removeItem(CONFIG_UNLOCK_STORAGE_KEY);
    } catch {
      // Ignore storage errors in private browsing / tests.
    }
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

  useEffect(() => {
    if (configProtectionEnabled) return;
    persistConfigUnlocked(false);
    setConfigPasswordValue('');
    setConfigPasswordError('');
  }, [configProtectionEnabled]);

  useEffect(() => {
    if (!configReady || !apartment?.id) return;
    refreshKnxStatuses(apartment.id).catch(() => {});
  }, [configReady, apartment?.id]);

  const handleUnlockProtectedConfig = async () => {
    const trimmedPassword = configPasswordValue;
    const result = await verifyConfigPassword(trimmedPassword);
    if (result?.success) {
      persistConfigUnlocked(true);
      setConfigPasswordValue('');
      setConfigPasswordError('');
      return;
    }

    setConfigPasswordError('Incorrect password. Try again.');
  };

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

  const PAGE_TITLES = {
    dashboard: 'Wohnung',
    rooms: 'Räume',
    connections: 'Setup',
    automation: 'Routinen',
  };

  const NAV_TABS = [
    { section: 'dashboard',   label: 'Dashboard',  mobileLabel: 'Home',     Icon: Home },
    { section: 'rooms',       label: 'Rooms',      mobileLabel: 'Rooms',    Icon: SettingsIcon },
    { section: 'automation',  label: 'Automation', mobileLabel: 'Routinen', Icon: Bot },
    { section: 'connections', label: 'Setup',      mobileLabel: 'Setup',    Icon: Plug },
  ];

  return (
    <div className="app-container">
      {/* ── Warm sticky header ── */}
      <header className="app-header">
        <div className="app-header-row">
          {/* Left: apartment pill switcher */}
          <button
            className="apt-switcher-pill"
            onClick={() => normalizedConfig.apartments.length > 1 && setAptSwitcherOpen(true)}
            style={{ cursor: normalizedConfig.apartments.length > 1 ? 'pointer' : 'default', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}
          >
            <div className="apt-switcher-icon">
              <Home size={12} color="#fff" />
            </div>
            <div className="apt-switcher-text">
              <span className="apt-switcher-eyebrow">Apartment</span>
              <span className="apt-switcher-name">{apartment?.name || '—'}</span>
            </div>
            {normalizedConfig.apartments.length > 1 && (
              <ChevronDown size={12} className="apt-switcher-chevron" />
            )}
          </button>
          {/* Hidden select for accessibility and tests */}
          <select
            value={apartment?.slug || ''}
            onChange={(e) => navigateTo(e.target.value, route.section)}
            aria-label="Select apartment"
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
          >
            {normalizedConfig.apartments.map((entry) => (
              <option key={entry.id} value={entry.slug}>{entry.name}</option>
            ))}
          </select>
          {/* Apartment switcher modal */}
          {aptSwitcherOpen && createPortal(
            <div
              onClick={(e) => e.target === e.currentTarget && setAptSwitcherOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(8,6,5,0.72)',
                backdropFilter: 'blur(8px) saturate(140%)',
                WebkitBackdropFilter: 'blur(8px) saturate(140%)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                zIndex: 9999, padding: '40px 12px 100px',
              }}
            >
              <div style={{
                width: 320, maxWidth: '94%',
                background: 'var(--bg-secondary)',
                border: '1px solid rgba(255,222,184,0.10)',
                borderRadius: 24,
                boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02)',
                overflow: 'hidden', padding: 20,
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>Apartment wählen</div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 14, color: 'var(--text-primary)' }}>Wohnung wechseln</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {normalizedConfig.apartments.map((apt) => {
                    const active = apt.slug === apartment?.slug;
                    return (
                      <button key={apt.id}
                        onClick={() => { navigateTo(apt.slug, route.section); setAptSwitcherOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 14px', borderRadius: 14,
                          background: active ? 'rgba(224,139,93,0.10)' : 'rgba(255,222,184,0.04)',
                          border: `1px solid ${active ? 'rgba(224,139,93,0.45)' : 'rgba(255,222,184,0.08)'}`,
                          cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', fontFamily: 'inherit',
                        }}
                      >
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: active ? 'linear-gradient(135deg,#ffc78a,#c66a35)' : 'rgba(255,222,184,0.05)',
                          display: 'grid', placeItems: 'center',
                        }}>
                          <Home size={16} color={active ? '#fff' : '#b6a995'} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{apt.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {apt.knxIp ? `${apt.knxIp} · ` : ''}{'/' + apt.slug}
                          </div>
                        </div>
                        {active && <Check size={16} color="#e8c39c" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Right: KNX status pill + desktop nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className={`knx-status-pill status-badge ${currentKnxStatus.connected ? 'connected status-connected' : 'disconnected status-disconnected'}`}>
              {currentKnxStatus.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span>{currentKnxStatus.connected ? 'Online' : 'Offline'}</span>
            </div>

            {/* Desktop horizontal nav */}
            <nav className="nav-links glass-panel" style={{ padding: '0.4rem' }}>
              {NAV_TABS.map(({ section, label, Icon }) => (
                <button
                  key={section}
                  id={`nav-${section}`}
                  className={`nav-link ${route.section === section ? 'active' : ''}`}
                  onClick={() => apartment && navigateTo(apartment.slug, section)}
                >
                  <Icon size={17} />
                  <span className="nav-link-text">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Page title — shown on mobile only (hidden on desktop via CSS) */}
        <div className="app-header-title-row">
          <h1 className="app-page-title">
            {PAGE_TITLES[route.section] || route.section}
          </h1>
          <span className="app-header-date">
            {new Date().toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
      </header>

      <main className={shouldMaskProtectedSection ? 'app-main app-main-locked' : 'app-main'}>
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

        {apartment && apartmentConfig && route.section === 'rooms' && canRenderProtectedSection && (
          <Settings
            fullConfig={normalizedConfig}
            apartment={apartment}
            config={apartmentConfig}
            fetchConfig={fetchConfig}
            applyConfig={applyConfig}
            hueStatus={currentHueStatus}
            addToast={addToast}
          />
        )}

        {apartment && apartmentConfig && route.section === 'connections' && canRenderProtectedSection && (
          <Connections
            fullConfig={normalizedConfig}
            apartment={apartment}
            config={apartmentConfig}
            fetchConfig={fetchConfig}
            applyConfig={applyConfig}
            knxStatus={currentKnxStatus}
            hueStatus={currentHueStatus}
            addToast={addToast}
            navigateToApartment={(slug) => navigateTo(slug, 'dashboard')}
            configProtectionEnabled={configProtectionEnabled}
            onConfigUnlocked={() => persistConfigUnlocked(true)}
            onConfigLockRemoved={() => persistConfigUnlocked(false)}
          />
        )}

        {apartment && apartmentConfig && route.section === 'automation' && canRenderProtectedSection && (
          <Automation
            apartment={apartment}
            config={apartmentConfig}
            fetchConfig={fetchConfig}
            applyConfig={applyConfig}
            addToast={addToast}
          />
        )}
      </main>

      {/* ── Bottom tab bar (mobile) — aria-hidden so tests find only the desktop nav buttons ── */}
      <nav className="bottom-tab-bar" aria-hidden="true">
        {NAV_TABS.map(({ section, mobileLabel, Icon }) => {
          const active = route.section === section;
          return (
            <button
              key={section}
              className={`bottom-tab ${active ? 'active' : ''}`}
              onClick={() => apartment && navigateTo(apartment.slug, section)}
            >
              {active && <span className="bottom-tab-glow" aria-hidden="true" />}
              <Icon size={20} color={active ? '#f3eadc' : '#7a6e60'} />
              <span>{mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div>{toast.msg}</div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>✕</button>
          </div>
        ))}
      </div>

      <PasswordDialog
        isOpen={isConfigLocked}
        title="Configuration Password"
        message={`Enter the house configuration password to open ${route.section === 'rooms' ? 'Rooms' : route.section === 'connections' ? 'Setup' : 'Automation'}.`}
        value={configPasswordValue}
        onChange={(nextValue) => {
          setConfigPasswordValue(nextValue);
          if (configPasswordError) setConfigPasswordError('');
        }}
        onSubmit={handleUnlockProtectedConfig}
        onCancel={() => {
          setConfigPasswordValue('');
          setConfigPasswordError('');
          if (apartment) navigateTo(apartment.slug, 'dashboard', { replace: true });
        }}
        submitLabel="Unlock"
        cancelLabel="Back to Dashboard"
        error={configPasswordError}
      />
    </div>
  );
}

export default App;
