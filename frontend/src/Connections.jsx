import React, { useEffect, useRef, useState } from 'react';
import {
  updateConfig,
  discoverHueBridge,
  pairHueBridge,
  unpairHueBridge,
  loadDevConfig,
  setConfigPassword,
  removeConfigPassword,
  verifyConfigPassword,
} from './configApi';
import { KNXGroupAddressModal } from './components/KNXGroupAddressModal';
import { createApartmentDraft, ensureUniqueSlug, migrateLegacyConfig, slugifyApartmentName } from './appModel';
import { getImportedGroupAddressName } from './groupAddressUtils';
import {
  Plus, Lightbulb, FileText, Plug, Building2, Home as HomeIcon, Download, Upload, Settings as SettingsIcon, Sun
} from 'lucide-react';
import ConfirmDialog from './components/ConfirmDialog';
import PasswordDialog from './components/PasswordDialog';

function StatusPill({ connected, label }) {
  return (
    <div className={`status-badge ${connected ? 'status-connected' : 'status-disconnected'}`}>
      <Plug size={14} />
      <div className="status-dot" />
      <span>{label}</span>
    </div>
  );
}

function SetupCard({ icon, title, description, children, tone = 'knx-icon', className = '' }) {
  return (
    <section className={`connections-card ${className}`.trim()}>
      <div className="connections-section-header">
        <div className={`connections-section-icon ${tone}`}>
          {icon}
        </div>
        <div>
          <h3 className="connections-card-title">{title}</h3>
          <p className="connections-card-copy">{description}</p>
        </div>
      </div>
      <div className="connections-card-body">
        {children}
      </div>
    </section>
  );
}

export default function Connections({
  fullConfig,
  apartment,
  config,
  fetchConfig,
  applyConfig,
  addToast,
  knxStatus,
  hueStatus,
  navigateToApartment,
  configProtectionEnabled = false,
  onConfigUnlocked,
  onConfigLockRemoved,
}) {
  const [apartmentName, setApartmentName] = useState(apartment.name);
  const [apartmentSlug, setApartmentSlug] = useState(apartment.slug);
  const [ip, setIp] = useState(config.knxIp || '');
  const [port, setPort] = useState(config.knxPort || 3671);
  const [knxLocalInterface, setKnxLocalInterface] = useState(config.knxLocalInterface || '');
  const [hueBridgeIp, setHueBridgeIp] = useState(config.hue?.bridgeIp || '');
  const [hueError, setHueError] = useState('');
  const [newApartmentName, setNewApartmentName] = useState('');
  const [configPasswordDraft, setConfigPasswordDraft] = useState('');
  const [configPasswordConfirmDraft, setConfigPasswordConfirmDraft] = useState('');
  const [removePasswordDialogOpen, setRemovePasswordDialogOpen] = useState(false);
  const [removePasswordValue, setRemovePasswordValue] = useState('');
  const [removePasswordError, setRemovePasswordError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
  });

  const [groupAddressModal, setGroupAddressModal] = useState({
    open: false,
    title: 'ETS XML import',
    mode: 'any',
    dptFilter: null,
    allowUpload: false,
    helperText: '',
    scope: 'apartment',
  });

  const [houseGroupAddressBook, setHouseGroupAddressBook] = useState(
    Array.isArray(config.importedGroupAddresses) ? config.importedGroupAddresses : []
  );
  const [houseGroupAddressFileName, setHouseGroupAddressFileName] = useState(
    config.importedGroupAddressesFileName || ''
  );
  
  const [sunTriggerGa, setSunTriggerGa] = useState(config.sunTrigger?.groupAddress || '');
  const [sunTriggerDayValue, setSunTriggerDayValue] = useState(config.sunTrigger?.dayValue ?? 1);
  const configImportInputRef = useRef(null);

  useEffect(() => {
    setApartmentName(apartment.name);
    setApartmentSlug(apartment.slug);
    setIp(config.knxIp || '');
    setPort(config.knxPort || 3671);
    setKnxLocalInterface(config.knxLocalInterface || '');
    setHueBridgeIp(config.hue?.bridgeIp || '');
    setHouseGroupAddressBook(Array.isArray(config.importedGroupAddresses) ? config.importedGroupAddresses : []);
    setHouseGroupAddressFileName(config.importedGroupAddressesFileName || '');
    setConfigPasswordDraft('');
    setConfigPasswordConfirmDraft('');
    setSunTriggerGa(config.sunTrigger?.groupAddress || '');
    setSunTriggerDayValue(config.sunTrigger?.dayValue ?? 1);
  }, [apartment.id, config]);

  const persistConfig = async (nextConfig) => {
    const result = await updateConfig(nextConfig);
    if (result?.config) applyConfig?.(result.config);
    else await fetchConfig();
  };

  const normalizedPort = Number(port) || 3671;
  const apartmentSettingsDirty = (
    apartmentName !== apartment.name ||
    apartmentSlug !== apartment.slug ||
    ip !== (config.knxIp || '') ||
    normalizedPort !== (config.knxPort || 3671) ||
    knxLocalInterface !== (config.knxLocalInterface || '') ||
    sunTriggerGa !== (config.sunTrigger?.groupAddress || '') ||
    sunTriggerDayValue !== (config.sunTrigger?.dayValue ?? 1)
  );

  const buildNextConfig = (overrides = {}) => ({
    ...fullConfig,
    building: {
      ...fullConfig.building,
      importedGroupAddresses: overrides.houseGroupAddressBook ?? houseGroupAddressBook,
      importedGroupAddressesFileName: overrides.houseGroupAddressFileName ?? houseGroupAddressFileName,
    },
    apartments: fullConfig.apartments.map((entry) => ({
      ...entry,
      ...(entry.id === apartment.id ? {
        name: overrides.apartmentName ?? apartmentName,
        slug: overrides.apartmentSlug ?? apartmentSlug,
        knxIp: overrides.ip ?? ip,
        knxPort: overrides.port ?? Number(port),
        knxLocalInterface: overrides.knxLocalInterface ?? knxLocalInterface,
        sunTrigger: {
          groupAddress: overrides.sunTriggerGa ?? sunTriggerGa,
          dayValue: overrides.sunTriggerDayValue ?? sunTriggerDayValue,
        },
      } : {}),
      importedGroupAddresses: [],
      importedGroupAddressesFileName: '',
    })),
  });

  const commitApartmentSettings = async (overrides = {}) => {
    const nextApartmentName = overrides.apartmentName ?? apartmentName;
    const nextApartmentSlugInput = overrides.apartmentSlug ?? apartmentSlug;
    const nextIp = overrides.ip ?? ip;
    const nextPort = overrides.port ?? normalizedPort;
    const nextSunTriggerGa = overrides.sunTriggerGa ?? sunTriggerGa;
    const nextSunTriggerDayValue = overrides.sunTriggerDayValue ?? sunTriggerDayValue;

    const hasChanges = (
      nextApartmentName !== apartment.name ||
      nextApartmentSlugInput !== apartment.slug ||
      nextIp !== (config.knxIp || '') ||
      nextPort !== (config.knxPort || 3671) ||
      (overrides.knxLocalInterface ?? knxLocalInterface) !== (config.knxLocalInterface || '') ||
      nextSunTriggerGa !== (config.sunTrigger?.groupAddress || '') ||
      nextSunTriggerDayValue !== (config.sunTrigger?.dayValue ?? 1)
    );

    if (!hasChanges && !apartmentSettingsDirty) return;

    try {
      const baseSlug = slugifyApartmentName(nextApartmentSlugInput || nextApartmentName || apartment.name);
      const uniqueSlug = ensureUniqueSlug(baseSlug, fullConfig.apartments, apartment.id);
      await persistConfig(buildNextConfig({
        apartmentName: nextApartmentName,
        apartmentSlug: uniqueSlug,
        ip: nextIp,
        port: nextPort,
        sunTriggerGa: nextSunTriggerGa,
        sunTriggerDayValue: nextSunTriggerDayValue,
      }));
      setApartmentSlug(uniqueSlug);
    } catch {
      addToast('Failed to save apartment settings', 'error');
    }
  };

  const handleLoadDevConfig = async () => {
    try {
      const result = await loadDevConfig();
      if (result.success) {
        addToast('Dev config loaded successfully', 'success');
        fetchConfig();
      } else {
        addToast(result.error || 'Failed to load dev config', 'error');
      }
    } catch {
      addToast('Failed to load dev config. Check backend connection.', 'error');
    }
  };

  const handleHueDiscover = async () => {
    setHueError('');
    try {
      const res = await discoverHueBridge(apartment.id);
      if (res.success && res.bridges.length > 0) {
        setHueBridgeIp(res.bridges[0].internalipaddress);
      } else {
        setHueError('No Hue Bridge found.');
      }
    } catch {
      setHueError('Discovery failed. Is the backend running?');
    }
  };

  const handleHuePair = async () => {
    setHueError('');
    try {
      const res = await pairHueBridge(apartment.id, hueBridgeIp);
      if (res.success) {
        addToast('Hue Bridge paired!', 'success');
        fetchConfig();
      } else {
        setHueError(res.error || 'Pairing failed.');
      }
    } catch {
      setHueError('Pairing request failed.');
    }
  };

  const handleHueUnpair = async () => {
    try {
      await unpairHueBridge(apartment.id);
      setHueBridgeIp('');
      addToast('Hue Bridge unpaired', 'success');
      fetchConfig();
    } catch {
      addToast('Failed to unpair', 'error');
    }
  };

  const importGroupAddresses = async (addresses, fileName) => {
    try {
      setHouseGroupAddressBook(addresses);
      setHouseGroupAddressFileName(fileName);
      await persistConfig(buildNextConfig({
        houseGroupAddressBook: addresses,
        houseGroupAddressFileName: fileName,
      }));
      addToast(`Imported ${addresses.length} group addresses`, 'success');
    } catch {
      addToast('Failed to persist imported group addresses', 'error');
    }
  };

  const handleSaveConfigPassword = async () => {
    if (!configPasswordDraft) return;
    if (configPasswordDraft !== configPasswordConfirmDraft) {
      addToast('Passwords do not match', 'error');
      return;
    }

    try {
      const result = await setConfigPassword(configPasswordDraft);
      if (result?.config) applyConfig?.(result.config);
      else await fetchConfig();
      setConfigPasswordDraft('');
      setConfigPasswordConfirmDraft('');
      onConfigUnlocked?.();
      addToast(configProtectionEnabled ? 'Configuration password updated' : 'Configuration password enabled', 'success');
    } catch {
      addToast('Failed to save configuration password', 'error');
    }
  };

  const closeRemovePasswordDialog = () => {
    setRemovePasswordDialogOpen(false);
    setRemovePasswordValue('');
    setRemovePasswordError('');
  };

  const handleRemoveConfigPassword = async () => {
    const verifyResult = await verifyConfigPassword(removePasswordValue);
    if (!verifyResult?.success) {
      setRemovePasswordError('Incorrect password. Try again.');
      return;
    }

    try {
      const result = await removeConfigPassword(removePasswordValue);
      if (result?.config) applyConfig?.(result.config);
      else await fetchConfig();
      closeRemovePasswordDialog();
      onConfigLockRemoved?.();
      addToast('Configuration password removed', 'success');
    } catch {
      setRemovePasswordError('Failed to remove password. Try again.');
    }
  };

  const clearGroupAddresses = async () => {
    try {
      setHouseGroupAddressBook([]);
      setHouseGroupAddressFileName('');
      await persistConfig(buildNextConfig({ houseGroupAddressBook: [], houseGroupAddressFileName: '' }));
      addToast('Imported group addresses cleared', 'success');
    } catch {
      addToast('Failed to clear imported group addresses', 'error');
    }
  };

  const requestConfirm = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) => (
    new Promise((resolve) => {
      setConfirmDialog({
        open: true,
        title,
        message,
        confirmLabel,
        cancelLabel,
        danger,
        onResolve: resolve,
      });
    })
  );

  const closeConfirmDialog = (confirmed = false) => {
    setConfirmDialog((prev) => {
      if (typeof prev.onResolve === 'function') prev.onResolve(confirmed);
      return {
        open: false,
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        danger: false,
      };
    });
  };

  const handleCreateApartment = async () => {
    if (!newApartmentName.trim()) return;

    const newApartment = createApartmentDraft(fullConfig.apartments, newApartmentName.trim());
    try {
      await persistConfig({
        ...fullConfig,
        apartments: [...fullConfig.apartments, newApartment],
      });
      addToast(`Apartment "${newApartment.name}" created`, 'success');
      setNewApartmentName('');
      navigateToApartment(newApartment.slug);
    } catch {
      addToast('Failed to create apartment', 'error');
    }
  };

  const handleExportConfig = () => {
    try {
      const blob = new Blob([JSON.stringify(fullConfig, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      const dateStamp = new Date().toISOString().slice(0, 10);

      downloadLink.href = url;
      downloadLink.download = `knx-control-config-${dateStamp}.json`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
      addToast('Config exported', 'success');
    } catch {
      addToast('Failed to export config', 'error');
    }
  };

  const handleImportConfigClick = () => {
    configImportInputRef.current?.click();
  };

  const handleImportConfigFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileText = await file.text();
      const parsed = JSON.parse(fileText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid config format');
      }

      const confirmed = await requestConfirm({
        title: 'Import Full Config',
        message: 'Importing a config replaces your current apartments, areas, rooms, addresses, slugs and connection settings. Continue?',
        confirmLabel: 'Import Config',
        danger: true,
      });

      if (!confirmed) {
        event.target.value = '';
        return;
      }

      const nextConfig = migrateLegacyConfig(parsed);
      await persistConfig(nextConfig);

      const importedApartments = Array.isArray(nextConfig?.apartments) ? nextConfig.apartments : [];
      const stillHasCurrentApartment = importedApartments.some((entry) => entry.slug === apartment.slug);
      const targetSlug = stillHasCurrentApartment ? apartment.slug : importedApartments[0]?.slug;
      if (targetSlug) navigateToApartment(targetSlug);

      addToast('Config imported successfully', 'success');
    } catch (error) {
      addToast(error?.message === 'Invalid config format' ? 'Invalid config file' : 'Failed to import config', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const houseImportedCount = houseGroupAddressBook.length;
  const modalAddressBook = houseGroupAddressBook;
  const modalFileName = houseGroupAddressFileName;
  const sunTriggerMatchedAddressName = getImportedGroupAddressName(houseGroupAddressBook, sunTriggerGa);

  return (
    <div className="glass-panel settings-panel connections-page">
      <div className="page-hero">
        <div>
          <div className="page-eyebrow">Setup</div>
          <h2 className="page-title">Building Setup</h2>
          <p className="page-copy">
            Apartment-specific connections, house-wide KNX data, backups and apartment management in one place.
          </p>
        </div>
        <div className="page-hero-statuses">
          <StatusPill connected={knxStatus.connected} label={`${apartment.name} ${knxStatus.connected ? 'connected' : 'offline'}`} />
        </div>
      </div>

      <div className="connections-group">
        <div className="connections-group-header">
          <div>
            <div className="connections-group-label">This Apartment</div>
            <h3 className="connections-group-title">{apartment.name}</h3>
            <p className="connections-group-copy">Settings here affect only this apartment: its name, URL, KNX gateway and Hue bridge.</p>
          </div>
        </div>

        <div className="connections-card-grid">
          <SetupCard
            icon={<HomeIcon size={20} />}
            title="Apartment Name, URL & KNX Gateway"
            description="Set the apartment name, bookmarkable URL, and the KNX IP gateway used for this apartment."
            tone="knx-icon"
          >
            <div className="connections-grid">
              <div className="settings-field">
                <label className="settings-field-label">Apartment Name</label>
                <input className="form-input" value={apartmentName} onChange={(event) => setApartmentName(event.target.value)} onBlur={commitApartmentSettings} />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">URL Slug</label>
                <input className="form-input" value={apartmentSlug} onChange={(event) => setApartmentSlug(event.target.value)} onBlur={commitApartmentSettings} />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">KNX IP Address</label>
                <input className="form-input" value={ip} placeholder="192.168.1.50" onChange={(event) => setIp(event.target.value)} onBlur={commitApartmentSettings} />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">KNX Port</label>
                <input className="form-input" type="number" value={port} placeholder="3671" onChange={(event) => setPort(event.target.value)} onBlur={commitApartmentSettings} />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Local Network Interface <span style={{ fontWeight: 400, opacity: 0.6, fontSize: '0.78rem' }}>(optional, e.g. eth0)</span></label>
                <input className="form-input" value={knxLocalInterface} placeholder="Leave empty for auto-detect" onChange={(event) => setKnxLocalInterface(event.target.value)} onBlur={commitApartmentSettings} />
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Set this to the interface name connected to your KNX network (e.g. <code>eth0</code>). Required on devices with multiple network interfaces (Raspberry Pi with WiFi + Ethernet) when KNX updates are not received.</p>
              </div>
            </div>
            <div className="connections-card-actions">
              <button className="btn-secondary" onClick={handleLoadDevConfig}>Load Dev Config</button>
              <StatusPill connected={knxStatus.connected} label={knxStatus.connected ? 'KNX connected' : 'KNX offline'} />
            </div>
          </SetupCard>

          <SetupCard
            icon={<Lightbulb size={20} />}
            title="Philips Hue"
            description="Connect the Hue Bridge that belongs only to this apartment."
            tone="hue-icon"
          >
            {hueStatus.paired ? (
              <div className="connections-card-actions">
                <div className="connections-inline-status">
                  <div className="connections-inline-dot" />
                  <span>Paired with {hueStatus.bridgeIp}</span>
                </div>
                <button className="btn-danger" onClick={handleHueUnpair}>Unpair</button>
              </div>
            ) : (
              <div className="connections-stack">
                <div className="connections-inline-form">
                  <button className="btn-secondary" onClick={handleHueDiscover}>Discover Bridge</button>
                  <input
                    className="form-input"
                    value={hueBridgeIp}
                    placeholder="Hue bridge IP"
                    onChange={(event) => setHueBridgeIp(event.target.value)}
                  />
                  <button className="btn-primary" onClick={handleHuePair} disabled={!hueBridgeIp}>Pair</button>
                </div>
                {hueError && <p className="connections-error">{hueError}</p>}
              </div>
            )}
          </SetupCard>

        </div>
      </div>

      <div className="connections-group">
        <div className="connections-group-header">
          <div>
            <div className="connections-group-label">Whole House</div>
            <h3 className="connections-group-title">House-Wide KNX Data</h3>
            <p className="connections-group-copy">
              Shared KNX addresses used across apartments live here, including the house ETS import and the day/night trigger for sunrise and sunset routines.
            </p>
          </div>
        </div>

        <div className="connections-card-grid connections-card-grid--shared">
          <SetupCard
            icon={<FileText size={20} />}
            title="House ETS XML"
            description="Upload one ETS export for the entire house. It is used by every XML match and Browse dialog in the app."
            tone="ets-icon"
          >
            <div className="connections-card-actions">
              <button
                className="btn-secondary"
                onClick={() => setGroupAddressModal({
                  open: true,
                  title: 'House ETS XML import',
                  allowUpload: true,
                  mode: 'any',
                  dptFilter: null,
                  helperText: 'Upload one ETS XML export that contains all KNX group addresses for this house.',
                  scope: 'building',
                })}
              >
                <FileText size={15} /> Manage House ETS XML
              </button>

              {houseGroupAddressFileName && houseGroupAddressBook.length > 0 && (
                <div className="ets-status-badge">
                  <div className="ets-status-dot" />
                  <span>
                    <strong>{houseGroupAddressFileName}</strong>
                    {' · '}
                    <span style={{ color: 'var(--text-secondary)' }}>{houseImportedCount} imported addresses</span>
                  </span>
                </div>
              )}
            </div>
          </SetupCard>

          <SetupCard
            icon={<Sun size={20} />}
            title="Sunrise / Sunset Trigger"
            description="Choose the KNX day/night status address that should trigger sunrise and sunset routines for this apartment."
            tone="knx-icon"
          >
            <div className="connections-grid">
              <div className="settings-field">
                <label className="settings-field-label">Day / Night Group Address</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    className="form-input"
                    value={sunTriggerGa}
                    placeholder="e.g. 7/0/0"
                    onChange={(event) => setSunTriggerGa(event.target.value)}
                    onBlur={(event) => void commitApartmentSettings({ sunTriggerGa: event.target.value })}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn-secondary"
                    onClick={() => setGroupAddressModal({
                      open: true,
                      title: 'Pick Sun Trigger GA',
                      allowUpload: false,
                      mode: 'any',
                      dptFilter: '1.',
                      helperText: 'Select the Day/Night status address',
                      scope: 'apartment',
                      targetField: 'sunTriggerGa'
                    })}
                  >
                    Browse
                  </button>
                </div>
                {sunTriggerMatchedAddressName && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    XML match: <strong style={{ color: 'var(--text-primary)' }}>{sunTriggerMatchedAddressName}</strong>
                  </div>
                )}
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Value for 'Day'</label>
                <select
                  className="form-input"
                  value={sunTriggerDayValue}
                  onChange={(e) => {
                    const nextDayValue = Number(e.target.value);
                    setSunTriggerDayValue(nextDayValue);
                    void commitApartmentSettings({ sunTriggerDayValue: nextDayValue });
                  }}
                >
                  <option value={1}>1 = Day, 0 = Night</option>
                  <option value={0}>0 = Day, 1 = Night</option>
                </select>
              </div>
            </div>
          </SetupCard>
        </div>
      </div>

      <div className="connections-group">
        <div className="connections-group-header">
          <div>
            <div className="connections-group-label">Protection & Backup</div>
            <h3 className="connections-group-title">Configuration Protection & Backup</h3>
            <p className="connections-group-copy">Prevent accidental changes and export or restore the complete house configuration.</p>
          </div>
        </div>

        <div className="connections-card-grid">
          <SetupCard
            icon={<SettingsIcon size={20} />}
            title="Configuration Password"
            description="One password protects Rooms, Setup and Automation for the whole house."
            tone="shared-icon"
          >
            <div className="connections-password-card">
              <div className={`status-badge ${configProtectionEnabled ? 'status-connected' : 'status-disconnected'}`}>
                <div className="status-dot" />
                <span>{configProtectionEnabled ? 'Password protection is active' : 'Password protection is inactive'}</span>
              </div>

              <div className="connections-grid">
                <div className="settings-field ga-field">
                  <label className="settings-field-label">{configProtectionEnabled ? 'New Password' : 'Password'}</label>
                  <input
                    className="form-input"
                    type="password"
                    value={configPasswordDraft}
                    onChange={(event) => setConfigPasswordDraft(event.target.value)}
                    placeholder={configProtectionEnabled ? 'Enter a new password' : 'Enter a password'}
                  />
                </div>
                <div className="settings-field ga-field">
                  <label className="settings-field-label">Repeat Password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={configPasswordConfirmDraft}
                    onChange={(event) => setConfigPasswordConfirmDraft(event.target.value)}
                    placeholder="Enter the password again"
                  />
                </div>
              </div>

              <div className="connections-password-actions">
                <button
                  className="btn-primary"
                  disabled={!configPasswordDraft || !configPasswordConfirmDraft}
                  onClick={handleSaveConfigPassword}
                >
                  {configProtectionEnabled ? 'Update Password' : 'Enable Password'}
                </button>
                {configProtectionEnabled ? (
                  <button className="btn-secondary" onClick={() => setRemovePasswordDialogOpen(true)}>
                    Remove Password
                  </button>
                ) : null}
              </div>
            </div>
          </SetupCard>

          <SetupCard
            icon={<FileText size={20} />}
            title="Full Config Backup"
            description="Export the complete house configuration or restore it on another app instance."
            tone="ets-icon"
          >
            <input
              ref={configImportInputRef}
              type="file"
              accept=".json,application/json,text/json"
              style={{ display: 'none' }}
              onChange={handleImportConfigFile}
            />
            <div className="connections-card-actions">
              <button className="btn-secondary" onClick={handleExportConfig}>
                <Download size={16} /> Export Full Config
              </button>
              <button className="btn-primary" onClick={handleImportConfigClick}>
                <Upload size={16} /> Import Full Config
              </button>
            </div>
            <p className="connections-card-copy" style={{ marginTop: '0.9rem' }}>
              Importing a config overwrites the current configuration after confirmation.
            </p>
          </SetupCard>
        </div>
      </div>

      <div className="connections-group">
        <div className="connections-group-header">
          <div>
            <div className="connections-group-label">Apartments</div>
            <h3 className="connections-group-title">Apartment List</h3>
            <p className="connections-group-copy">Jump to another apartment or add a new one to the same building.</p>
          </div>
        </div>

        <div className="connections-card-grid connections-card-grid--apartments">
          <SetupCard
            icon={<Building2 size={20} />}
            title="Existing Apartments"
            description="All apartments that are currently configured in this house."
            tone="knx-icon"
          >
            <div className="connections-apartment-list">
              {fullConfig.apartments.map((entry) => (
                <button
                  key={entry.id}
                  className={`connections-apartment-item ${entry.id === apartment.id ? 'active' : ''}`}
                  onClick={() => navigateToApartment(entry.slug)}
                >
                  <div>
                    <div className="connections-apartment-name">{entry.name}</div>
                    <div className="connections-apartment-slug">/{entry.slug}</div>
                  </div>
                  {entry.id === apartment.id && <span className="connections-apartment-current">Current</span>}
                </button>
              ))}
            </div>
          </SetupCard>

          <SetupCard
            icon={<Plus size={20} />}
            title="Add Apartment"
            description="Create another apartment with its own private areas, alarms and connections."
            tone="ets-icon"
          >
            <div className="connections-inline-form">
              <input
                className="form-input"
                value={newApartmentName}
                onChange={(event) => setNewApartmentName(event.target.value)}
                placeholder="e.g. Wohnung West"
              />
              <button className="btn-primary" onClick={handleCreateApartment} disabled={!newApartmentName.trim()}>
                <Plus size={16} /> Create Apartment
              </button>
            </div>
          </SetupCard>
        </div>
      </div>

      <KNXGroupAddressModal
        isOpen={groupAddressModal.open}
        title={groupAddressModal.title}
        addresses={modalAddressBook}
        importedFileName={modalFileName}
        onClose={() => setGroupAddressModal({ open: false, title: '', mode: 'any', dptFilter: null, allowUpload: false, helperText: '', scope: 'apartment' })}
        onSelect={(ga) => {
          if (groupAddressModal.targetField === 'sunTriggerGa') {
            setSunTriggerGa(ga.address);
            void commitApartmentSettings({ sunTriggerGa: ga.address });
            setGroupAddressModal((prev) => ({ ...prev, open: false }));
          }
        }}
        onImport={importGroupAddresses}
        onClear={clearGroupAddresses}
        mode={groupAddressModal.mode}
        dptFilter={groupAddressModal.dptFilter}
        allowUpload={groupAddressModal.allowUpload}
        helperText={groupAddressModal.helperText}
        preferredTopLevelRangeName={apartment.name}
      />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        danger={confirmDialog.danger}
        onConfirm={() => closeConfirmDialog(true)}
        onCancel={() => closeConfirmDialog(false)}
      />

      <PasswordDialog
        isOpen={removePasswordDialogOpen}
        title="Remove Configuration Password"
        message="Enter the current password once to remove the protection."
        value={removePasswordValue}
        onChange={(nextValue) => {
          setRemovePasswordValue(nextValue);
          if (removePasswordError) setRemovePasswordError('');
        }}
        onSubmit={handleRemoveConfigPassword}
        onCancel={closeRemovePasswordDialog}
        submitLabel="Remove Password"
        error={removePasswordError}
      />
    </div>
  );
}
