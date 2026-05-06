import React, { useState, useEffect } from 'react';
import { LifeBuoy } from 'lucide-react';
import SupportRequestDrawer from './SupportRequestDrawer';

export default function HelpSupport() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('openSupport', handler);
    return () => window.removeEventListener('openSupport', handler);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help and support"
        className="fixed z-40 bottom-24 right-4 md:bottom-6 md:right-6 w-12 h-12 rounded-full bg-brand-primary hover:bg-brand-hover text-white flex items-center justify-center transition-colors"
      >
        <LifeBuoy size={22} />
      </button>

      <SupportRequestDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
