// Zambian mobile numbers: MTN 096/076, Airtel 097/077, Zamtel 095/075.
// Lipila expects 2609XXXXXXXX / 2607XXXXXXXX — 12 digits, no '+'.
// Ported verbatim from BazaBooks (client/src/lib/billing/msisdn.js), ESM -> CommonJS.
function normalizeZambianMsisdn(input) {
  const digits = String(input || '').replace(/[\s\-()+]/g, '');
  let n = digits;
  if (/^0[79]\d{8}$/.test(n)) n = `260${n.slice(1)}`;
  else if (/^[79]\d{8}$/.test(n)) n = `260${n}`;
  return /^260[79][5-7]\d{7}$/.test(n) ? n : null;
}

function maskMsisdn(msisdn) {
  return msisdn ? `•••${String(msisdn).slice(-3)}` : '';
}

module.exports = { normalizeZambianMsisdn, maskMsisdn };
