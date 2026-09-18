import { decideTracking } from './rules';

const base = { serverConsent: true, foregroundGranted: true, backgroundGranted: true, statuses: ['EN_ROUTE' as const], consentRevoked: false };

describe('decideTracking (ADR-017 §3)', () => {
  it('tracks in background only with consent, « Always » permission and an active work order', () => {
    expect(decideTracking(base)).toBe('background');
  });
  it('falls back to foreground with « While using »', () => {
    expect(decideTracking({ ...base, backgroundGranted: false })).toBe('foreground');
  });
  it('is off without server consent, OS permission, active work order, or after a 403', () => {
    expect(decideTracking({ ...base, serverConsent: false })).toBe('off');
    expect(decideTracking({ ...base, foregroundGranted: false })).toBe('off');
    expect(decideTracking({ ...base, statuses: ['ASSIGNED', 'COMPLETED_POSITIVE'] })).toBe('off');
    expect(decideTracking({ ...base, statuses: [] })).toBe('off');
    expect(decideTracking({ ...base, consentRevoked: true })).toBe('off');
  });
});
