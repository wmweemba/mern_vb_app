import { normaliseRef, captureRefFromUrl, getStoredRef, clearStoredRef } from '../lib/signupRef';

const KEY = 'c360_signup_ref';

beforeEach(() => {
  localStorage.clear();
});

describe('normaliseRef', () => {
  test('trims and lower-cases a valid ref', () => {
    expect(normaliseRef(' FB ')).toBe('fb');
  });

  test('accepts a hyphenated lower-case ref', () => {
    expect(normaliseRef('p-maluba')).toBe('p-maluba');
  });

  test('accepts a 40-char ref', () => {
    const ref = 'a'.repeat(40);
    expect(normaliseRef(ref)).toBe(ref);
  });

  test('rejects a 41-char ref', () => {
    expect(normaliseRef('a'.repeat(41))).toBeNull();
  });

  test('rejects a ref starting with a hyphen', () => {
    expect(normaliseRef('-bad')).toBeNull();
  });

  test('rejects a ref containing markup', () => {
    expect(normaliseRef('<script>')).toBeNull();
  });

  test('rejects a ref containing a plus sign and digits', () => {
    expect(normaliseRef('+260977')).toBeNull();
  });

  test('rejects undefined', () => {
    expect(normaliseRef(undefined)).toBeNull();
  });
});

describe('captureRefFromUrl / getStoredRef', () => {
  test('stores a normalised valid ref from the query string', () => {
    captureRefFromUrl('?ref=P-Test');
    expect(getStoredRef()).toBe('p-test');
  });

  test('stores nothing for an invalid ref', () => {
    captureRefFromUrl('?ref=%3Cscript%3E');
    expect(getStoredRef()).toBeNull();
  });

  test('stores nothing for an empty query string', () => {
    captureRefFromUrl('');
    expect(getStoredRef()).toBeNull();
  });

  test('first touch wins while the stored ref is still fresh', () => {
    captureRefFromUrl('?ref=a');
    captureRefFromUrl('?ref=b');
    expect(getStoredRef()).toBe('a');
  });

  test('a stale (>30 days) stored ref is ignored and replaced by a new capture', () => {
    const staleAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(KEY, JSON.stringify({ ref: 'old', at: staleAt }));
    expect(getStoredRef()).toBeNull();

    captureRefFromUrl('?ref=new');
    expect(getStoredRef()).toBe('new');
  });

  test('corrupt JSON in storage yields null and is overwritten by a new capture', () => {
    localStorage.setItem(KEY, 'not-json{');
    expect(getStoredRef()).toBeNull();

    captureRefFromUrl('?ref=fresh');
    expect(getStoredRef()).toBe('fresh');
  });
});

describe('clearStoredRef', () => {
  test('removes the stored key', () => {
    captureRefFromUrl('?ref=p-test');
    expect(getStoredRef()).toBe('p-test');

    clearStoredRef();
    expect(getStoredRef()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
