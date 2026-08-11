import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CircleHelp } from 'lucide-react';
import SupportRequestDrawer from './SupportRequestDrawer';
import { API_BASE_URL } from '../../lib/utils';

export default function HelpSupport() {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const refreshUnread = useCallback(() => {
    axios.get(`${API_BASE_URL}/support/requests`)
      .then(res => setHasUnread(res.data.requests.some(t => t.hasUnread)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnread();
    // Catches a reply that arrived while the user was away from the tab —
    // without this the badge stays stale until the next full page load.
    window.addEventListener('focus', refreshUnread);
    return () => window.removeEventListener('focus', refreshUnread);
  }, [refreshUnread]);

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
        <CircleHelp size={22} />
        {hasUnread && (
          <span
            className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-status-overdue-text border-2 border-brand-primary"
            aria-label="Unread support reply"
          />
        )}
      </button>

      <SupportRequestDrawer
        open={open}
        onClose={() => { setOpen(false); refreshUnread(); }}
        onTicketsChanged={list => setHasUnread(list.some(t => t.hasUnread))}
      />
    </>
  );
}
