import React from 'react';
import { X } from 'lucide-react';
import { useDrawerLifecycle } from '../../hooks/useDrawerLifecycle';

export default function SlideoverDrawer({ open, onClose, title, children, footer }) {
  useDrawerLifecycle(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/*
        Single rendered drawer — responsive via CSS only (mobile bottom sheet,
        desktop right-side panel). Previously this mounted two separate DOM
        copies (one per breakpoint, toggled with hidden/md:hidden), which for
        any child form component with its own internal state meant two
        independent React instances with divergent state. Since the submit
        button lives in `footer` and targets its form via the cross-DOM
        `form="..."` id attribute, it always bound to the *first* copy in DOM
        order (the desktop one) regardless of which was visually shown — so
        on mobile, tapping submit posted the OTHER, still-empty copy, which
        silently failed native required-field validation. Rendering once
        removes the duplicate-ID / divergent-state issue entirely.
      */}
      <div
        className="absolute bottom-0 left-0 right-0 w-full md:relative md:bottom-auto md:left-auto md:right-auto md:ml-auto md:w-[420px]
          flex flex-col bg-surface-card h-[90vh] md:h-full rounded-t-xl md:rounded-none
          border-t md:border-t-0 md:border-l border-border-default shadow-none
          animate-in slide-in-from-bottom md:[--tw-enter-translate-y:0px] md:slide-in-from-right duration-200"
      >
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
