import React, { useEffect, useState } from 'react';
import {
  updateConfig,
  discoverHueBridge,
  pairHueBridge,
  unpairHueBridge,
  loadDevConfig
} from './configApi';
import { KNXGroupAddressModal } from './components/KNXGroupAddressModal';
import { createApartmentDraft, ensureUniqueSlug, slugifyApartmentName } from './appModel';
import {
  Save, Plus, Lightbulb, FileText, Plug, Building2, Home as HomeIcon
} from 'lucide-react';

function StatusPill({ connected, label }) {
  return (
    <div className={`status-badge ${connected ? 'status-connected' : 'status-disconnected'}`}>
      <Plug size={14} />
      <div className="status-dot" />
      <span>{label}</span>
    </div>
  );
}

function SetupCard({ icon, title, description, children, tone = 'knx-icon' }) {
  return (
    <section className="connections-card">
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
  const [newApartmentName, setNewApartmentName] = useState('');

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

  useEffect(() => {
    setApartmentName(apartment.name);
    setApartmentSlug(apartment.slug);
    setIp(config.knxIp || '');
    setPort(config.knxPort || 3671);
    setHueBridgeIp(config.hue?.bridgeIp || '');
    setSharedAccessApartmentId(config.sharedAccessApartmentId || apartment.id);
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

  const buildNextConfig = (overrides = {}) => ({
    ...fullConfig,
    building: {
      ...fullConfig.building,
      sharedAccessApartmentId: overrides.sharedAccessApartmentId ?? sharedAccessApartmentId,
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

  const handleSaveApartment = async () => {
    try {
      const baseSlug = slugifyApartmentName(apartmentSlug || apartmentName || apartment.name);
      const uniqueSlug = ensureUniqueSlug(baseSlug, fullConfig.apartments, apartment.id);
      await persistConfig(buildNextConfig({
        apartmentName,
        apartmentSlug: uniqueSlug,
        ip,
        port: Number(port),
      }));
      setApartmentSlug(uniqueSlug);
      addToast('Apartment settings saved', 'success');
    } catch {
      addToast('Failed to save apartment settings', 'error');
    }
  };

  const handleSaveSharedSettings = async () => {
    try {
      await persistConfig(buildNextConfig({ sharedAccessApartmentId }));
      addToast('Shared building settings saved', 'success');
    } catch {
      addToast('Failed to save shared building settings', 'error');
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

  const apartmentSupportedCount = apartmentGroupAddressBook.filter((entry) => entry.supported).length;
  const sharedSupportedCount = sharedGroupAddressBook.filter((entry) => entry.supported).length;
  const modalAddressBook = groupAddressModal.scope === 'shared' ? sharedGroupAddressBook : apartmentGroupAddressBook;
  const modalFileName = groupAddressModal.scope === 'shared' ? sharedGroupAddressFileName : apartmentGroupAddressFileName;
  const sharedAccessApartmentName = fullConfig.apartments.find((entry) => entry.id === sharedAccessApartmentId)?.name || apartment.name;

  return (
    <div className="glass-panel settings-panel connections-page">
      <div className="connections-hero">
        <div>
          <div className="connections-eyebrow">Setup</div>
          <h2 className="connections-page-title">Building Setup</h2>
          <p className="connections-page-copy">
            Everything for the current apartment, the shared building scope and apartment management in one place.
          </p>
        </div>
        <div className="connections-hero-statuses">
          <StatusPill connected={knxStatus.connected} label={`${apartment.name} ${knxStatus.connected ? 'connected' : 'offline'}`} />
          <StatusPill connected={sharedKnxStatus.connected} label={`Shared KNX line via ${sharedAccessApartmentName} ${sharedKnxStatus.connected ? 'connected' : 'offline'}`} />
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
                <input className="form-input" value={apartmentName} onChange={(event) => setApartmentName(event.target.value)} />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">URL Slug</label>
                <input className="form-input" value={apartmentSlug} onChange={(event) => setApartmentSlug(event.target.value)} />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">KNX IP Address</label>
                <input className="form-input" value={ip} placeholder="192.168.1.50" onChange={(event) => setIp(event.target.value)} />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">KNX Port</label>
                <input className="form-input" type="number" value={port} placeholder="3671" onChange={(event) => setPort(event.target.value)} />
              </div>
            </div>
            <div className="connections-card-actions">
              <button className="btn-primary" onClick={handleSaveApartment}>
                <Save size={16} /> Save Apartment
              </button>
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
            <div className="connections-group-label">Shared Building Setup</div>
            <h3 className="connections-group-title">Shared Areas & Shared Information</h3>
            <p className="connections-group-copy">
              Use this for KNX group addresses that are not on the current apartment's own line, for example central house values like outside temperature, wind or shared spaces such as garden and garage.
            </p>
          </div>
        </div>

        <div className="connections-card-grid connections-card-grid--shared">
          <SetupCard
            icon={<Building2 size={20} />}
            title="Shared KNX Access"
            description="Choose which apartment gateway can listen to KNX telegrams from the other/shared line, for example the main line with central building values."
            tone="knx-icon"
          >
            <div className="connections-grid">
              <div className="settings-field">
                <label className="settings-field-label">Shared Access via Apartment</label>
                <select className="form-select" value={sharedAccessApartmentId} onChange={(event) => setSharedAccessApartmentId(event.target.value)}>
                  {fullConfig.apartments.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="connections-card-actions">
              <button className="btn-primary" onClick={handleSaveSharedSettings}>
                <Save size={16} /> Save Shared Setup
              </button>
              <StatusPill connected={sharedKnxStatus.connected} label={sharedKnxStatus.connected ? 'Shared KNX connected' : 'Shared KNX offline'} />
            </div>
          </SetupCard>

          <SetupCard
            icon={<FileText size={20} />}
            title="Shared ETS XML"
            description="Import the ETS export that contains the group addresses from the other/shared KNX line, for example outside temperature, wind, garden or garage."
            tone="ets-icon"
          >
            <div className="connections-card-actions">
              <button
                className="btn-secondary"
                onClick={() => setGroupAddressModal({
                  open: true,
                  title: 'Shared ETS XML import',
                  allowUpload: true,
                  mode: 'any',
                  helperText: 'Upload the ETS XML for shared areas and shared information.',
                  scope: 'shared',
                })}
              >
                <FileText size={15} /> Manage Shared ETS XML
              </button>

              {sharedGroupAddressFileName && sharedGroupAddressBook.length > 0 && (
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
    </div>
  );
}
