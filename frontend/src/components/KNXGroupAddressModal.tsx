import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Upload, X, FileText, Trash2, Check } from 'lucide-react';
import { parseKNXGroupAddressXML } from '../knx-xml-parser';

function normalizeDptPrefix(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^DPT\s*/i, '');
}

function isAddressAllowedForMode(address, mode, dptFilter) {
  if (!address.supported) return false;
  if (dptFilter) {
    const normalizedFilter = normalizeDptPrefix(dptFilter);
    const normalizedAddressDpt = normalizeDptPrefix(address.dpt);
    if (!normalizedAddressDpt || !normalizedAddressDpt.startsWith(normalizedFilter)) return false;
  }
  if (mode === 'any') return true;
  if (mode === 'scene') return address.functionType === 'scene';
  if (mode === 'switch') return address.functionType === 'switch';
  if (mode === 'percentage') return address.functionType === 'percentage';
  return true;
}

function getModeBadgeLabel(mode, dptFilter) {
  let lbl = '';
  if (mode === 'scene') lbl = 'Filtered list: scene group addresses only';
  else if (mode === 'switch') lbl = 'Filtered list: switch/status group addresses only';
  else if (mode === 'percentage') lbl = 'Filtered list: blind/percentage group addresses only';
  
  if (dptFilter) {
    const dptStr = `DPT ${dptFilter}x`;
    if (lbl) lbl += ` (matching ${dptStr})`;
    else lbl = `Filtered list: matching DPT ${dptFilter}x only`;
  }
  return lbl;
}

export function KNXGroupAddressModal({
  isOpen,
  title,
  addresses,
  importedFileName,
  onClose,
  onSelect,
  onImport,
  onClear,
  mode = 'any',
  dptFilter = null,
  allowUpload = false,
  helperText,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef(null);

  const supportedAddresses = useMemo(
    () => addresses.filter((address) => address.supported),
    [addresses]
  );
  const unsupportedCount = addresses.length - supportedAddresses.length;

  const visibleAddresses = useMemo(
    () => supportedAddresses.filter((address) => isAddressAllowedForMode(address, mode, dptFilter)),
    [supportedAddresses, mode, dptFilter]
  );

  const filteredAddresses = visibleAddresses.filter((address) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return !normalizedQuery || [
      address.name,
      address.address,
      address.dpt,
      address.room,
      ...(address.rangePath || []),
    ].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
  });

  if (!isOpen) return null;

  const modeBadgeLabel = getModeBadgeLabel(mode, dptFilter);

  const handleClose = () => {
    setSearchQuery('');
    setImportError('');
    setImportSuccess('');
    onClose();
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportSuccess('');

    if (!file.name.toLowerCase().endsWith('.xml')) {
      setImportError('Please choose an ETS XML export file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const xmlContent = loadEvent.target?.result;
        if (typeof xmlContent !== 'string' || !xmlContent.trim()) {
          throw new Error('The selected file is empty.');
        }

        const parsedAddresses = parseKNXGroupAddressXML(xmlContent);
        onImport(parsedAddresses, file.name);
            const supportedCount = parsedAddresses.filter((address) => address.supported).length;
        const droppedCount = parsedAddresses.length - supportedCount;
        setImportSuccess(`Imported ${supportedCount} supported group addresses from ${file.name}${droppedCount ? ` (${droppedCount} unsupported filtered out)` : ''}.`);
      } catch (error) {
        setImportError(error.message || 'Failed to parse XML file.');
      }
    };

    reader.onerror = () => setImportError('Failed to read XML file.');
    reader.readAsText(file);
  };

  return createPortal(
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" style={{ width: 'min(720px, 94vw)' }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {helperText || 'Browse imported ETS group addresses and select one for this field.'}
            </p>
          </div>
          <button className="icon-btn" onClick={handleClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {allowUpload && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.9rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <FileText size={16} style={{ color: 'var(--accent-color)' }} />
              <strong style={{ fontSize: '0.9rem' }}>ETS Group Address Import</strong>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn-secondary-sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Upload XML File
              </button>
              {addresses.length > 0 && (
                <button className="btn-secondary-sm" onClick={onClear}>
                  <Trash2 size={14} /> Forget Addresses
                </button>
              )}
            </div>

            {importedFileName && addresses.length > 0 && (
              <p style={{ margin: '0.75rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                Loaded file: <strong style={{ color: 'var(--text-primary)' }}>{importedFileName}</strong> with {supportedAddresses.length} supported addresses.
              </p>
            )}

            {importError && (
              <div style={{ marginTop: '0.75rem', color: '#fca5a5', fontSize: '0.82rem' }}>
                {importError}
              </div>
            )}

            {importSuccess && (
              <div style={{ marginTop: '0.75rem', color: '#86efac', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={14} /> {importSuccess}
              </div>
            )}
          </div>
        )}

        {unsupportedCount > 0 && (
          <div style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            {unsupportedCount} unsupported group address{unsupportedCount === 1 ? '' : 'es'} hidden because their DPT/DPST is not supported yet.
          </div>
        )}

        {modeBadgeLabel && (
          <div style={{ marginBottom: '0.75rem', color: 'var(--accent-color)', fontSize: '0.8rem', fontWeight: 600 }}>
            {modeBadgeLabel}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: '2.5rem' }}
              type="text"
              placeholder="Search by name, address, DPT or room"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              disabled={visibleAddresses.length === 0}
            />
          </div>
        </div>

        {visibleAddresses.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 1rem' }}>
            {addresses.length === 0
              ? (allowUpload ? 'No XML data loaded yet.' : 'No imported ETS group addresses available yet.')
              : 'No supported group addresses available for this selection.'}
          </div>
        ) : filteredAddresses.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 1rem' }}>
            No group addresses match the current filters.
          </div>
        ) : (
          <div className="hue-lamp-list" style={{ maxHeight: '42vh' }}>
            {filteredAddresses.map((address) => (
              <button key={address.id || address.address} className="hue-lamp-item" onClick={() => onSelect(address)}>
                <FileText size={18} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{address.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {address.address}{address.dpt ? ` · ${address.dpt}` : ''}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    {address.room || 'Unknown room'}{address.rangePath?.length ? ` · ${address.rangePath.join(' / ')}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          {visibleAddresses.length > 0
            ? `Showing ${filteredAddresses.length} of ${visibleAddresses.length} supported addresses.`
            : (allowUpload ? 'Import an ETS XML file to start.' : 'Import ETS group addresses in Connections to use this picker.')}
        </div>
      </div>
    </div>,
    document.body
  );
}
