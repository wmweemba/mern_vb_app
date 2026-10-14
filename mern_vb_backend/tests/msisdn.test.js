const { normalizeZambianMsisdn, maskMsisdn } = require('../utils/msisdn');

describe('normalizeZambianMsisdn', () => {
  it('normalises a leading-zero MTN number', () => {
    expect(normalizeZambianMsisdn('0971234567')).toBe('260971234567');
  });

  it('normalises a number with spaces and a +260 prefix', () => {
    expect(normalizeZambianMsisdn('+260 97 123 4567')).toBe('260971234567');
  });

  it('normalises a 9-digit number with no leading zero or country code', () => {
    expect(normalizeZambianMsisdn('971234567')).toBe('260971234567');
  });

  it('normalises an already-international Airtel number', () => {
    expect(normalizeZambianMsisdn('260761234567')).toBe('260761234567');
  });

  it('rejects a landline-prefixed number', () => {
    expect(normalizeZambianMsisdn('0211234567')).toBeNull();
  });

  it('rejects a too-short number', () => {
    expect(normalizeZambianMsisdn('097123')).toBeNull();
  });

  it('rejects a number with the wrong mobile prefix digit', () => {
    expect(normalizeZambianMsisdn('0981234567')).toBeNull();
  });
});

describe('maskMsisdn', () => {
  it('shows only the last 3 digits', () => {
    expect(maskMsisdn('260971234567')).toBe('•••567');
  });

  it('returns an empty string for falsy input', () => {
    expect(maskMsisdn(null)).toBe('');
    expect(maskMsisdn('')).toBe('');
  });
});
