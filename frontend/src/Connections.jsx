import React, { useEffect, useRef, useState } from 'react';
import {
  updateConfig,
  discoverHueBridge,
  pairHueBridge,
  unpairHueBridge,
  loadDevConfig
} from './configApi';
import { KNXGroupAddressModal } from './components/KNXGroupAddressModal';
import { createApartmentDraft, ensureUniqueSlug, migrateLegacyConfig, slugifyApartmentName } from './appModel';
import {
  Plus, Lightbulb, FileText, Plug, Building2, Home as HomeIcon, Download, Upload
} from 'lucide-react';
import ConfirmDialog from './components/ConfirmDialog';

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
  sharedKnxStatus,
  hueStatus,
  navigateToApartment,
}) {
  const [apartmentName, setApartmentName] = useState(apartment.name);
  const [apartmentSlug, setApartmentSlug] = useState(apartment.slug);
  const [ip, setIp] = useState(config.knxIp || '');
  const [port, setPort] = useState(config.knxPort || 3671);
  const [hueBridgeIp, setHueBridgeIp] = useState(config.hue?.bridgeIp || '');
  const [hueError, setHueError] = useState('');
  const [sharedAccessApartmentId, setSharedAccessApartmentId] = useState(config.sharedAccessApartmentId || apartment.id);
  const [sharedUsesApartmentImportedGroupAddresses, setSharedUsesApartmentImportedGroupAddresses] = useState(
    config.sharedUsesApartmentImportedGroupAddresses === true
  );
  const [newApartmentName, setNewApartmentName] = useState('');
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
    allowUpload: false,
    helperText: '',
    scope: 'apartment',
  });

  const [apartmentGroupAddressBook, setApartmentGroupAddressBook] = useState(
    Array.isArray(config.importedGroupAddresses) ? config.importedGroupAddresses : []
  );
  const [apartmentGroupAddressFileName, setApartmentGroupAddressFileName] = useState(
    config.importedGroupAddressesFileName || ''
  );
  const [sharedGroupAddressBook, setSharedGroupAddressBook] = useState(
    Array.isArray(config.sharedImportedGroupAddresses) ? config.sharedImportedGroupAddresses : []
  );
  const [sharedGroupAddressFileName, setSharedGroupAddressFileName] = useState(
    config.sharedImportedGroupAddressesFileName || ''
  );
  const configImportInputRef = useRef(null);

  useEffect(() => {
    setApartmentName(apartment.name);
    setApartmentSlug(apartment.slug);
    setIp(config.knxIp || '');
    setPort(config.knxPort || 3671);
    setHueBridgeIp(config.hue?.bridgeIp || '');
    setSharedAccessApartmentId(config.sharedAccessApartmentId || apartment.id);
    setSharedUsesApartmentImportedGroupAddresses(config.sharedUsesApartmentImportedGroupAddresses === true);
    setApartmentGroupAddressBook(Array.isArray(config.importedGroupAddresses) ? config.importedGroupAddresses : []);
    setApartmentGroupAddressFileName(config.importedGroupAddressesFileName || '');
    setSharedGroupAddressBook(Array.isArray(config.sharedImportedGroupAddresses) ? config.sharedImportedGroupAddresses : []);
    setSharedGroupAddressFileName(config.sharedImportedGroupAddressesFileName || '');
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
    normalizedPort !== (config.knxPort || 3671)
  );
  const sharedSettingsDirty = (
    sharedAccessApartmentId !== (config.sharedAccessApartmentId || apartment.id) ||
    sharedUsesApartmentImportedGroupAddresses !== (config.sharedUsesApartmentImportedGroupAddresses === true)
  );

  const buildNextConfig = (overrides = {}) => ({
    ...fullConfig,
    building: {
      ...fullConfig.building,
      sharedAccessApartmentId: overrides.sharedAccessApartmentId ?? sharedAccessApartmentId,
      sharedUsesApartmentImportedGroupAddresses: overrides.sharedUsesApartmentImportedGroupAddresses
        ?? sharedUsesApartmentImportedGroupAddresses,
      sharedImportedGroupAddresses: overrides.sharedGroupAddressBook ?? sharedGroupAddressBook,
      sharedImportedGroupAddressesFileName: overrides.sharedGroupAddressFileName ?? sharedGroupAddressFileName,
    },
    apartments: fullConfig.apartments.map((entry) => entry.id !== apartment.id ? entry : ({
      ...entry,
      name: overrides.apartmentName ?? apartmentName,
      slug: overrides.apartmentSlug ?? apartmentSlug,
      knxIp: overrides.ip ?? ip,
      knxPort: overrides.port ?? Number(port),
      importedGroupAddresses: overrides.apartmentGroupAddressBook ?? apartmentGroupAddressBook,
      importedGroupAddressesFileName: overrides.apartmentGroupAddressFileName ?? apartmentGroupAddressFileName,
    })),
  });

  const commitApartmentSettings = async () => {
    if (!apartmentSettingsDirty) return;
    try {
      const baseSlug = slugifyApartmentName(apartmentSlug || apartmentName || apartment.name);
      const uniqueSlug = ensureUniqueSlug(baseSlug, fullConfig.apartments, apartment.id);
      await persistConfig(buildNextConfig({
        apartmentName,
        apartmentSlug: uniqueSlug,
        ip,
        port: normalizedPort,
      }));
      setApartmentSlug(uniqueSlug);
    } catch {
      addToast('Failed to save apartment settings', 'error');
    }
  };

  const persistSharedSettings = async (overrides = {}) => {
    const nextSharedAccessApartmentId = overrides.sharedAccessApartmentId ?? sharedAccessApartmentId;
    const nextSharedUsesApartmentImportedGroupAddresses = overrides.sharedUsesApartmentImportedGroupAddresses
      ?? sharedUsesApartmentImportedGroupAddresses;
    const nextSharedGroupAddressBook = nextSharedUsesApartmentImportedGroupAddresses
      ? []
      : (overrides.sharedGroupAddressBook ?? sharedGroupAddressBook);
    const nextSharedGroupAddressFileName = nextSharedUsesApartmentImportedGroupAddresses
      ? ''
      : (overrides.sharedGroupAddressFileName ?? sharedGroupAddressFileName);

    if (
      !sharedSettingsDirty &&
      nextSharedAccessApartmentId === sharedAccessApartmentId &&
      nextSharedUsesApartmentImportedGroupAddresses === sharedUsesApartmentImportedGroupAddresses &&
      nextSharedGroupAddressBook === sharedGroupAddressBook &&
      nextSharedGroupAddressFileName === sharedGroupAddressFileName
    ) {
      return;
    }

    try {
      await persistConfig(buildNextConfig({
        sharedAccessApartmentId: nextSharedAccessApartmentId,
        sharedUsesApartmentImportedGroupAddresses: nextSharedUsesApartmentImportedGroupAddresses,
        sharedGroupAddressBook: nextSharedGroupAddressBook,
        sharedGroupAddressFileName: nextSharedGroupAddressFileName,
      }));
    } catch {
      addToast('Failed to save main line settings', 'error');
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
      if (groupAddressModal.scope === 'shared') {
        setSharedGroupAddressBook(addresses);
        setSharedGroupAddressFileName(fileName);
        await persistConfig(buildNextConfig({
          sharedGroupAddressBook: addresses,
          sharedGroupAddressFileName: fileName,
        }));
      } else {
        setApartmentGroupAddressBook(addresses);
        setApartmentGroupAddressFileName(fileName);
        await persistConfig(buildNextConfig({
          apartmentGroupAddressBook: addresses,
          apartmentGroupAddressFileName: fileName,
        }));
      }
      addToast(`Imported ${addresses.length} group addresses`, 'success');
    } catch {
      addToast('Failed to persist imported group addresses', 'error');
    }
  };

  const clearGroupAddresses = async () => {
    try {
      if (groupAddressModal.scope === 'shared') {
        setSharedGroupAddressBook([]);
        setSharedGroupAddressFileName('');
        await persistConfig(buildNextConfig({ sharedGroupAddressBook: [], sharedGroupAddressFileName: '' }));
      } else {
        setApartmentGroupAddressBook([]);
        setApartmentGroupAddressFileName('');
        await persistConfig(buildNextConfig({ apartmentGroupAddressBook: [], apartmentGroupAddressFileName: '' }));
      }
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

  const handleSharedApartmentXmlToggle = async (nextValue) => {
    if (!nextValue) {
      setSharedUsesApartmentImportedGroupAddresses(false);
      await persistSharedSettings({ sharedUsesApartmentImportedGroupAddresses: false });
      return;
    }

    if (sharedGroupAddressBook.length === 0 && !sharedGroupAddressFileName) {
      setSharedUsesApartmentImportedGroupAddresses(true);
      await persistSharedSettings({
        sharedUsesApartmentImportedGroupAddresses: true,
        sharedGroupAddressBook: [],
        sharedGroupAddressFileName: '',
      });
      return;
    }

    const confirmed = await requestConfirm({
      title: 'Use Main Line Apartment ETS XML',
      message: 'Switching this on removes the dedicated main line ETS XML. Continue?',
      confirmLabel: 'Use Main Line XML',
      danger: true,
    });

    if (!confirmed) return;

    setSharedUsesApartmentImportedGroupAddresses(true);
    setSharedGroupAddressBook([]);
    setSharedGroupAddressFileName('');
    await persistSharedSettings({
      sharedUsesApartmentImportedGroupAddresses: true,
      sharedGroupAddressBook: [],
      sharedGroupAddressFileName: '',
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

  const apartmentSupportedCount = apartmentGroupAddressBook.filter((entry) => entry.supported).length;
  const sharedSupportedCount = sharedGroupAddressBook.filter((entry) => entry.supported).length;
  const modalAddressBook = groupAddressModal.scope === 'shared' ? sharedGroupAddressBook : apartmentGroupAddressBook;
  const modalFileName = groupAddressModal.scope === 'shared' ? sharedGroupAddressFileName : apartmentGroupAddressFileName;
  const sharedAccessApartmentName = fullConfig.apartments.find((entry) => entry.id === sharedAccessApartmentId)?.name || apartment.name;
  const isCurrentApartmentSharedAccessSource = apartment.id === sharedAccessApartmentId;
  const sharedScopeContextCopy = isCurrentApartmentSharedAccessSource
    ? `Main Line access uses ${sharedAccessApartmentName}.`
    : `Main Line access uses ${sharedAccessApartmentName}, not this apartment.`;
  const sharedXmlToggleCopy = isCurrentApartmentSharedAccessSource
    ? 'Use this apartment XML for Main Line browsing.'
    : `Use ${sharedAccessApartmentName}'s apartment XML for Main Line browsing.`;
  const sharedXmlActiveCopy = isCurrentApartmentSharedAccessSource
    ? `Using ${sharedAccessApartmentName}'s apartment XML for Main Line browsing.`
    : `Using ${sharedAccessApartmentName}'s apartment XML for Main Line browsing.`;
  const sharedXmlEditable = isCurrentApartmentSharedAccessSource;

  return (
    <div className="glass-panel settings-panel connections-page">
      <div className="page-hero">
        <div>
          <div className="page-eyebrow">Setup</div>
          <h2 className="page-title">Building Setup</h2>
          <p className="page-copy">
            Everything for the current apartment, the Main Line setup and apartment management in one place.
          </p>
        </div>
        <div className="page-hero-statuses">
          <StatusPill connected={knxStatus.connected} label={`${apartment.name} ${knxStatus.connected ? 'connected' : 'offline'}`} />
          <StatusPill connected={sharedKnxStatus.connected} label={`Main Line via ${sharedAccessApartmentName} ${sharedKnxStatus.connected ? 'connected' : 'offline'}`} />
        </div>
      </div>

      <div className="connections-group">
        <div className="connections-group-header">
          <div>
            <div className="connections-group-label">Current Apartment</div>
            <h3 className="connections-group-title">{apartment.name}</h3>
            <p className="connections-group-copy">Everything that belongs only to this apartment stays together here.</p>
          </div>
        </div>

        <div className="connections-card-grid">
          <SetupCard
            icon={<HomeIcon size={20} />}
            title="Identity & KNX Gateway"
            description="Name, bookmarkable URL and the KNX gateway for this apartment."
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
            </div>
            <div className="connections-card-actions">
              <button className="btn-secondary" onClick={handleLoadDevConfig}>Load Dev Config</button>
              <StatusPill connected={knxStatus.connected} label={knxStatus.connected ? 'KNX connected' : 'KNX offline'} />
            </div>
          </SetupCard>

          <SetupCard
            icon={<FileText size={20} />}
            title="Apartment ETS XML"
            description="Import the ETS XML for the apartment's own KNX line."
            tone="ets-icon"
          >
            <div className="connections-card-actions">
              <button
                className="btn-secondary"
                onClick={() => setGroupAddressModal({
                  open: true,
                  title: 'Apartment ETS XML import',
                  allowUpload: true,
                  mode: 'any',
                  helperText: 'Upload the ETS XML for this apartment.',
                  scope: 'apartment',
                })}
              >
                <FileText size={15} /> Manage Apartment ETS XML
              </button>

              {apartmentGroupAddressFileName && apartmentGroupAddressBook.length > 0 && (
                <div className="ets-status-badge">
                  <div className="ets-status-dot" />
                  <span>
                    <strong>{apartmentGroupAddressFileName}</strong>
                    {' · '}
                    <span style={{ color: 'var(--text-secondary)' }}>{apartmentSupportedCount} supported addresses</span>
                  </span>
                </div>
              )}
            </div>
          </SetupCard>

          <SetupCard
            icon={<Lightbulb size={20} />}
            title="Philips Hue"
            description="Connect only the Hue Bridge that belongs to this apartment."
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
            <div className="connections-group-label">Main Line Setup</div>
            <h3 className="connections-group-title">Main Line Areas & Central Information</h3>
            <p className="connections-group-copy">
              This is the building-wide KNX setup for the Main Line, central functions and areas such as garden or garage.
            </p>
          </div>
        </div>

        <div className="connections-card-grid connections-card-grid--shared">
          <SetupCard
            icon={<Building2 size={20} />}
            title="Main Line Access"
            description="Choose which apartment gateway can listen to KNX telegrams from the Main Line and central KNX functions."
            tone="knx-icon"
          >
            <div className="connections-grid">
              <div className="settings-field">
                <label className="settings-field-label">Main Line Access via Apartment</label>
                <select
                  className="form-select"
                  value={sharedAccessApartmentId}
                  onChange={async (event) => {
                    const nextValue = event.target.value;
                    setSharedAccessApartmentId(nextValue);
                    await persistSharedSettings({ sharedAccessApartmentId: nextValue });
                  }}
                >
                  {fullConfig.apartments.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="connections-card-copy" style={{ marginTop: '0.9rem' }}>
              {sharedScopeContextCopy}
            </p>
            <div className="connections-card-actions">
              <StatusPill
                connected={sharedKnxStatus.connected}
                label={sharedKnxStatus.connected ? `Main Line via ${sharedAccessApartmentName} connected` : `Main Line via ${sharedAccessApartmentName} offline`}
              />
            </div>
          </SetupCard>

          <SetupCard
            icon={<FileText size={20} />}
            title="Main Line ETS XML"
            description="ETS XML for Main Line and central KNX group addresses."
            tone="ets-icon"
            className={!sharedXmlEditable ? 'connections-card--locked' : ''}
          >
            <p className="connections-card-copy" style={{ marginBottom: '1rem' }}>
              {sharedScopeContextCopy}
            </p>
            {sharedXmlEditable ? (
              <>
                <div className="settings-field" style={{ marginBottom: '1rem' }}>
                  <label
                    className="settings-toggle-row"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', cursor: 'pointer' }}
                  >
                    <div>
                      <div className="settings-field-label" style={{ marginBottom: '0.2rem' }}>Use Main Line apartment's ETS XML</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {sharedXmlToggleCopy}
                      </div>
                    </div>
                    <span className="settings-toggle-switch">
                      <input
                        type="checkbox"
                        checked={sharedUsesApartmentImportedGroupAddresses}
                        onChange={(event) => handleSharedApartmentXmlToggle(event.target.checked)}
                        aria-label="Use Main Line apartment's ETS XML"
                      />
                      <span className="settings-toggle-slider" />
                    </span>
                  </label>
                </div>
                <div className="connections-card-actions">
                  {sharedUsesApartmentImportedGroupAddresses ? (
                    <div className="ets-status-badge">
                      <div className="ets-status-dot" />
                      <span>
                        {sharedXmlActiveCopy}
                      </span>
                    </div>
                  ) : (
                    <button
                      className="btn-secondary"
                      onClick={() => setGroupAddressModal({
                        open: true,
                        title: 'Main Line ETS XML import',
                        allowUpload: true,
                        mode: 'any',
                        helperText: `Upload the ETS XML for the Main Line and central functions. Main Line access currently uses ${sharedAccessApartmentName}.`,
                        scope: 'shared',
                      })}
                    >
                      <FileText size={15} /> Manage Main Line ETS XML
                    </button>
                  )}

                  {!sharedUsesApartmentImportedGroupAddresses && sharedGroupAddressFileName && sharedGroupAddressBook.length > 0 && (
                    <div className="ets-status-badge">
                      <div className="ets-status-dot" />
                      <span>
                        <strong>{sharedGroupAddressFileName}</strong>
                        {' · '}
                        <span style={{ color: 'var(--text-secondary)' }}>{sharedSupportedCount} supported addresses</span>
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="connections-stack">
                <div className="connections-readonly-note">
                  Edit this in <strong>{sharedAccessApartmentName}</strong> only.
                </div>
                {sharedUsesApartmentImportedGroupAddresses ? (
                  <div className="ets-status-badge">
                    <div className="ets-status-dot" />
                    <span>{sharedXmlActiveCopy}</span>
                  </div>
                ) : sharedGroupAddressFileName && sharedGroupAddressBook.length > 0 ? (
                  <div className="ets-status-badge">
                    <div className="ets-status-dot" />
                    <span>
                      <strong>{sharedGroupAddressFileName}</strong>
                      {' · '}
                      <span style={{ color: 'var(--text-secondary)' }}>{sharedSupportedCount} supported addresses</span>
                    </span>
                  </div>
                ) : (
                  <div className="ets-status-badge">
                    <div className="ets-status-dot" />
                    <span>No dedicated Main Line ETS XML configured.</span>
                  </div>
                )}
              </div>
            )}
          </SetupCard>
        </div>
      </div>

      <div className="connections-group">
        <div className="connections-group-header">
          <div>
            <div className="connections-group-label">Apartments</div>
            <h3 className="connections-group-title">Manage Apartments</h3>
            <p className="connections-group-copy">Switch quickly or add another apartment to the same building.</p>
          </div>
        </div>

        <div className="connections-card-grid connections-card-grid--apartments">
          <SetupCard
            icon={<Building2 size={20} />}
            title="Existing Apartments"
            description="These apartments are currently configured in the app."
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

          <SetupCard
            icon={<FileText size={20} />}
            title="Full Config Backup"
            description="Export the complete app state or import it into another instance, including apartments, slugs, KNX, Hue, areas, rooms, scenes and ETS settings."
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

      <KNXGroupAddressModal
        isOpen={groupAddressModal.open}
        title={groupAddressModal.title}
        addresses={modalAddressBook}
        importedFileName={modalFileName}
        onClose={() => setGroupAddressModal({ open: false, title: '', mode: 'any', allowUpload: false, helperText: '', scope: 'apartment' })}
        onSelect={() => {}}
        onImport={importGroupAddresses}
        onClear={clearGroupAddresses}
        mode={groupAddressModal.mode}
        allowUpload={groupAddressModal.allowUpload}
        helperText={groupAddressModal.helperText}
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
    </div>
  );
}
