import { useState, useEffect } from 'react';

export default function TypedConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmWord,
  confirmLabel = 'Confirm',
  danger = true,
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  if (!open) return null;

  const canConfirm = value === confirmWord;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface-card rounded-xl p-6 w-full max-w-[400px] mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-text-secondary mb-4">{description}</p>
        )}
        <p className="text-sm text-text-secondary mb-2">
          Type <strong className="text-text-primary font-semibold">{confirmWord}</strong> to confirm:
        </p>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base text-text-primary bg-surface-page mb-4 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          placeholder={confirmWord}
          autoFocus
        />
        <div className="flex flex-col md:flex-row gap-2 md:gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-border-default rounded-full py-2.5 text-sm font-medium text-text-primary hover:bg-surface-page transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? 'bg-status-overdue-bg text-status-overdue-text hover:opacity-90'
                : 'bg-brand-primary text-white hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
