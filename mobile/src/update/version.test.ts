import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
  it('compares major.minor.patch loosely', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('v0.3', '0.2.9')).toBe(true);
    expect(isNewerVersion('garbage', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.2.0', null)).toBe(false);
  });
});
