import { toTelUrl } from './phone';

describe('toTelUrl', () => {
  it('adds +1 to a 10-digit North American number', () => {
    expect(toTelUrl('(514) 555-0199')).toBe('tel:+15145550199');
    expect(toTelUrl('514.555.0199')).toBe('tel:+15145550199');
  });

  it('keeps an explicit international prefix', () => {
    expect(toTelUrl('+33 1 23 45 67 89')).toBe('tel:+33123456789');
  });

  it('accepts an 11-digit number starting with 1', () => {
    expect(toTelUrl('1 514 555 0199')).toBe('tel:+15145550199');
  });

  it('returns null for empty or too-short input', () => {
    expect(toTelUrl(null)).toBeNull();
    expect(toTelUrl('')).toBeNull();
    expect(toTelUrl('poste 12')).toBeNull();
  });
});
