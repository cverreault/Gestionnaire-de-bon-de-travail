import { isGpsEnabled } from './gps-preferences.contract';

describe('isGpsEnabled', () => {
  it('returns false for null / undefined preferences (default OFF)', () => {
    expect(isGpsEnabled(null)).toBe(false);
    expect(isGpsEnabled(undefined)).toBe(false);
  });

  it('returns false when preferences is not an object', () => {
    expect(isGpsEnabled('yes')).toBe(false);
    expect(isGpsEnabled(42)).toBe(false);
  });

  it('returns false when the gps key is missing entirely', () => {
    expect(isGpsEnabled({ theme: 'dark' })).toBe(false);
  });

  it('returns false when gps is present but enabled is missing / not true', () => {
    expect(isGpsEnabled({ gps: {} })).toBe(false);
    expect(isGpsEnabled({ gps: { enabled: false } })).toBe(false);
    expect(isGpsEnabled({ gps: { enabled: 'true' } })).toBe(false); // strict bool
  });

  it('returns true only when gps.enabled === true', () => {
    expect(isGpsEnabled({ gps: { enabled: true } })).toBe(true);
    expect(isGpsEnabled({ theme: 'dark', gps: { enabled: true } })).toBe(true);
  });
});
