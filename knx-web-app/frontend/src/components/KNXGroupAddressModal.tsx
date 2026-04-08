import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Upload, X, FileText, Trash2, Check } from 'lucide-react';
import { parseKNXGroupAddressXML } from '../knx-xml-parser';

export function KNXGroupAddressModal({
  isOpen,
  title,
  addresses,
  importedFileName,
  onClose,
  onSelect,
  onImport,
  onClear,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef(null);

  const roomOptions = useMemo(() => {
    const rooms = Array.from(new Set(addresses.map((address) => address.room).filter(Boolean)));
    return ['all', ...rooms.sort((a, b) => a.localeCompare(b))];
  }, [addresses]);

  const filteredAddresses = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return addresses.filter((address) => {
      const matchesRoom = roomFilter === 'all' || address.room === roomFilter;
      const matchesQuery = !normalizedQuery || [
        address.name,
        address.address,
        address.dpt,
        address.room,
        ...(address.rangePath || []),
      ].some((value) => (value || '').toLowerCase().includes(normalizedQuery));

      return matchesRoom && matchesQuery;
    });
  }, [addresses, roomFilter, searchQuery]);

  if (!isOpen) return null;

  const handleClose = () => {
    setSearchQuery('');
    setRoomFilter('all');
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
        setRoomFilter('all');
        setImportSuccess(`Imported ${parsedAddresses.length} group addresses from ${file.name}.`);
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
              Upload an ETS XML export or reuse the currently imported address list in this session.
            </p>
          </div>
          <button className="icon-btn" onClick={handleClose} title="Close">
            <X size={16} />
          </button>
        </div>

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
              Loaded file: <strong style={{ color: 'var(--text-primary)' }}>{importedFileName}</strong> with {addresses.length} addresses.
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: '2.5rem' }}
              type="text"
              placeholder="Search by name, address, DPT or room"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              disabled={addresses.length === 0}
            />
          </div>

          <select
            className="form-select"
            value={roomFilter}
            onChange={(event) => setRoomFilter(event.target.value)}
            disabled={addresses.length === 0}
          >
            {roomOptions.map((room) => (
              <option key={room} value={room}>
                {room === 'all' ? 'All Rooms' : room}
              </option>
            ))}
          </select>
        </div>

        {addresses.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 1rem' }}>
            No XML data loaded yet.
          </div>
        ) : filteredAddresses.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 1rem' }}>
            No group addresses match the current filters.
          </div>
        ) : (
          <div className="hue-lamp-list" style={{ maxHeight: '42vh' }}>
            {filteredAddresses.map((address) => (
              <button key={address.id} className="hue-lamp-item" onClick={() => onSelect(address)}>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          <span>
            {addresses.length > 0 ? `Showing ${filteredAddresses.length} of ${addresses.length} imported addresses.` : 'Import an ETS XML file to start.'}
          </span>
          <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.08)', fontSize: '0.85rem', padding: '0.4rem 1rem' }} onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
