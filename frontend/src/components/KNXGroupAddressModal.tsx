import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Upload, X, FileText, Trash2, Check } from 'lucide-react';
import { parseKNXGroupAddressXML } from '../knx-xml-parser';

function normalizeDptPrefix(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^DPST\s*[- ]*/i, '')
    .replace(/^DPT\s*[- ]*/i, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '.');

  const match = normalized.match(/^(\d+)(?:\.(\d+))?/);
  if (!match) return normalized;

  const [, mainType, subType] = match;
  return subType ? `${mainType}.${subType}` : `${mainType}.`;
}

function inferFunctionTypeFromAddress(address) {
  const normalizedDpt = normalizeDptPrefix(address?.dpt);
  if (address?.functionType) return address.functionType;
  if (normalizedDpt.startsWith('17.')) return 'scene';
  if (normalizedDpt.startsWith('1.')) return 'switch';
  if (normalizedDpt.startsWith('5.')) return 'percentage';
  if (normalizedDpt.startsWith('9.')) return 'temperature';
  return null;
}

function isAddressAllowedForMode(address, mode, dptFilter) {
  const functionType = inferFunctionTypeFromAddress(address);
  if (dptFilter) {
    const normalizedFilter = normalizeDptPrefix(dptFilter);
    const normalizedAddressDpt = normalizeDptPrefix(address.dpt);
    if (!normalizedAddressDpt || !normalizedAddressDpt.startsWith(normalizedFilter)) return false;
  }
  if (mode === 'any') return true;
  if (mode === 'scene') return functionType === 'scene';
  if (mode === 'switch') return functionType === 'switch';
  if (mode === 'percentage') return functionType === 'percentage';
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

function formatImportSummary(fileName, count) {
  return `Imported ${count} group addresses from ${fileName}.`;
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
  preferredTopLevelRangeName = '',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [topLevelRangeFilter, setTopLevelRangeFilter] = useState('all');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef(null);
  const filterSelectableOnly = !allowUpload;

  const visibleAddresses = useMemo(
    () => (
      filterSelectableOnly
        ? addresses.filter((address) => isAddressAllowedForMode(address, mode, dptFilter))
        : addresses
    ),
    [addresses, mode, dptFilter, filterSelectableOnly]
  );

  const topLevelRangeOptions = useMemo(() => {
    const names = new Set(
      visibleAddresses
        .map((address) => (address.topLevelRange || address.rangePath?.[0] || '').trim())
        .filter(Boolean)
    );
    return ['all', ...Array.from(names)];
  }, [visibleAddresses]);

  useEffect(() => {
    if (!isOpen) return;
    if (allowUpload) {
      setTopLevelRangeFilter('all');
      return;
    }

    const normalizedPreferredName = String(preferredTopLevelRangeName || '').trim().toLowerCase();
    const matchingOption = topLevelRangeOptions.find((option) => (
      option !== 'all' && option.trim().toLowerCase() === normalizedPreferredName
    ));

    setTopLevelRangeFilter(matchingOption || 'all');
  }, [isOpen, allowUpload, preferredTopLevelRangeName, topLevelRangeOptions]);

  const filteredAddresses = visibleAddresses.filter((address) => {
    const addressTopLevelRange = (address.topLevelRange || address.rangePath?.[0] || '').trim();
    if (topLevelRangeFilter !== 'all' && addressTopLevelRange !== topLevelRangeFilter) {
      return false;
    }

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
    setTopLevelRangeFilter('all');
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
        setImportSuccess(formatImportSummary(file.name, parsedAddresses.length));
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

            {importedFileName && addresses.length > 0 && !importSuccess && (
              <p style={{ margin: '0.75rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {formatImportSummary(importedFileName, addresses.length)}
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

        {modeBadgeLabel && (
          <div style={{ marginBottom: '0.75rem', color: 'var(--accent-color)', fontSize: '0.8rem', fontWeight: 600 }}>
            {modeBadgeLabel}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: topLevelRangeOptions.length > 1 ? 'minmax(180px, 220px) minmax(0, 1fr)' : '1fr', gap: '0.75rem', marginBottom: '1rem', alignItems: 'end' }}>
          {topLevelRangeOptions.length > 1 && (
            <div>
              <label className="settings-field-label" style={{ marginBottom: '0.35rem', display: 'block' }}>
                Top-Level Group Range
              </label>
              <select
                className="form-input"
                aria-label="Top-Level Group Range"
                value={topLevelRangeFilter}
                onChange={(event) => setTopLevelRangeFilter(event.target.value)}
              >
                <option value="all">Alle</option>
                {topLevelRangeOptions.filter((option) => option !== 'all').map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          )}
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
                    {address.rangePath?.length ? address.rangePath.join(' / ') : (address.room || 'Unknown room')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {visibleAddresses.length === 0 && (
          <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {allowUpload ? 'Import an ETS XML file to start.' : 'Import ETS group addresses in Setup to use this picker.'}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
