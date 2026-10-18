const { normaliseRef } = require('../utils/signupRef');

describe('normaliseRef', () => {
  it('normalises a trimmed, mixed-case ref to lowercase', () => {
    expect(normaliseRef(' FB ')).toBe('fb');
  });

  it('accepts a valid hyphenated ref', () => {
    expect(normaliseRef('p-maluba')).toBe('p-maluba');
  });

  it('accepts a valid 40-character ref', () => {
    const ref40 = 'a'.repeat(40);
    expect(normaliseRef(ref40)).toBe(ref40);
  });

  it('rejects a ref starting with a hyphen', () => {
    expect(normaliseRef('-bad')).toBeNull();
  });

  it('rejects a ref with spaces', () => {
    expect(normaliseRef('has space')).toBeNull();
  });

  it('rejects a ref with special characters', () => {
    expect(normaliseRef('<script>')).toBeNull();
  });

  it('rejects a ref exceeding 40 characters', () => {
    const ref41 = 'a'.repeat(41);
    expect(normaliseRef(ref41)).toBeNull();
  });

  it('rejects a ref with invalid characters like +', () => {
    expect(normaliseRef('+260977')).toBeNull();
  });

  it('rejects undefined', () => {
    expect(normaliseRef(undefined)).toBeNull();
  });

  it('rejects null', () => {
    expect(normaliseRef(null)).toBeNull();
  });

  it('rejects a number', () => {
    expect(normaliseRef(123)).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(normaliseRef('')).toBeNull();
  });
});
