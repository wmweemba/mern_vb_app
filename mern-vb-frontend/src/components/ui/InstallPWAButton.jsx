import React, { useEffect, useState } from 'react';

const InstallPWAButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!dismissed) setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
    // eslint-disable-next-line
  }, [dismissed]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleClose = () => {
    setShowBanner(false);
    setDismissed(true);
  };

  // Show nothing if not installable or dismissed
  if (!showBanner) return null;

  // Banner/snackbar UI
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-[95vw] max-w-md bg-blue-600 text-white rounded-lg shadow-lg flex items-center justify-between px-4 py-3 animate-fade-in">
      <span className="font-medium">Install this app for a better experience!</span>
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={handleInstallClick}
          className="bg-white text-blue-700 font-semibold px-3 py-1 rounded shadow hover:bg-blue-100 transition"
        >
          Install
        </button>
        <button
          onClick={handleClose}
          className="text-white hover:text-blue-200 text-lg px-2"
          aria-label="Dismiss install banner"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

export default InstallPWAButton; 