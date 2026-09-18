import { DevicePlatform } from '@prisma/client';
import { MobileConfigService, isOlder } from './mobile-config.service';

function makeService(values: Record<string, string | undefined>) {
  const resolver = { resolve: jest.fn((key: string) => Promise.resolve(values[key])) };
  return new MobileConfigService(resolver);
}

describe('MobileConfigService (B37.8)', () => {
  it('defaults the minimum versions to 0.0.0 when nothing is configured', async () => {
    const svc = makeService({});
    await expect(svc.versionPolicy()).resolves.toEqual({
      minAppVersion: { ios: '0.0.0', android: '0.0.0' },
      latestAppVersion: null,
    });
  });

  it('coerces loose values (v1.2, 1.2.3-beta) and flags older apps per platform', async () => {
    const svc = makeService({ 'mobile.min-app-version.ios': 'v1.2', 'mobile.min-app-version.android': '2.0.0', 'mobile.latest-app-version': '2.1.0' });
    await expect(svc.versionPolicy()).resolves.toMatchObject({ minAppVersion: { ios: '1.2.0', android: '2.0.0' }, latestAppVersion: '2.1.0' });
    await expect(svc.upgradeRequired(DevicePlatform.IOS, '1.1.9')).resolves.toEqual({ upgradeRequired: true, minAppVersion: '1.2.0' });
    await expect(svc.upgradeRequired(DevicePlatform.IOS, '1.2.0')).resolves.toEqual({ upgradeRequired: false, minAppVersion: '1.2.0' });
    await expect(svc.upgradeRequired(DevicePlatform.ANDROID, '1.9.0')).resolves.toMatchObject({ upgradeRequired: true });
  });

  it('never locks out an app whose version cannot be parsed', () => {
    expect(isOlder('garbage', '1.0.0')).toBe(false);
    expect(isOlder('1.0.0', '')).toBe(false);
    expect(isOlder('0.9.0', '1.0.0')).toBe(true);
  });
});
