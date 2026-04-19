import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  isOpen,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content confirm-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-dialog-header">
          <div className={`confirm-dialog-icon ${danger ? 'danger' : ''}`}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <p className="confirm-dialog-message">{message}</p>
          </div>
        </div>

        <div className="confirm-dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
