// Signup source tracking. Captured once at boot (main.jsx), before the router
// redirects drop the query string, and read at group creation (Onboarding).
const KEY = 'c360_signup_ref';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REF_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function normaliseRef(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return REF_RE.test(v) ? v : null;
}

function readStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { ref, at } = JSON.parse(raw);
    const t = Date.parse(at);
    if (!normaliseRef(ref) || Number.isNaN(t) || Date.now() - t >= TTL_MS) return null;
    return ref;
  } catch {
    return null;
  }
}

export function captureRefFromUrl(search) {
  try {
    const ref = normaliseRef(new URLSearchParams(search).get('ref'));
    if (!ref || readStored()) return;
    localStorage.setItem(KEY, JSON.stringify({ ref, at: new Date().toISOString() }));
  } catch {
    /* storage unavailable: no ref */
  }
}

export function getStoredRef() {
  return readStored();
}

export function clearStoredRef() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
