// Signup source tracking. Same rule as the frontend capture and as
// BazaBooks PLAN-17. The server never trusts the client's value.
const REF_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

function normaliseRef(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return REF_RE.test(v) ? v : null;
}

module.exports = { normaliseRef };
