import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function SlideoverDrawer({ open, onClose, title, children, footer }) {
  // ESC key closes drawer
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Desktop: right-side drawer */}
      <div className="hidden md:flex ml-auto relative flex-col w-[420px] h-full bg-surface-card border-l border-border-default shadow-none animate-in slide-in-from-right duration-200">
        <DrawerContent title={title} onClose={onClose} footer={footer}>
          {children}
        </DrawerContent>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 flex flex-col bg-surface-card rounded-t-xl h-[90vh] animate-in slide-in-from-bottom duration-200">
        <DrawerContent title={title} onClose={onClose} footer={footer}>
          {children}
        </DrawerContent>
      </div>
    </div>
  );
}

function DrawerContent({ title, onClose, footer, children }) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border-default flex-shrink-0">
        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-page transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="flex-shrink-0 border-t border-border-default p-4 bg-surface-card">
          {footer}
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-xs text-text-secondary mt-3 hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
