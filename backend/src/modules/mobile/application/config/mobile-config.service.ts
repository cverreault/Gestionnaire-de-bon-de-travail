import { Inject, Injectable } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import * as semver from 'semver';
import {
  SYSTEM_CONFIG_RESOLVER,
  type ISystemConfigResolver,
} from '../../../../common/contracts/system-config-resolver.contract';

export interface MobileVersionPolicy {
  minAppVersion: { ios: string; android: string };
  latestAppVersion: string | null;
}

/**
 * B37.8 — version gate and public app configuration (ADR-015 §5).
 *
 * Keys are platform-wide system configs with env fallbacks
 * (`mobile.min-app-version.ios` → `MOBILE_MIN_APP_VERSION_IOS`, …). An
 * unparsable version on either side never locks the user out.
 */
@Injectable()
export class MobileConfigService {
  constructor(
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
  ) {}

  async versionPolicy(): Promise<MobileVersionPolicy> {
    const [ios, android, latest] = await Promise.all([
      this.configs.resolve('mobile.min-app-version.ios'),
      this.configs.resolve('mobile.min-app-version.android'),
      this.configs.resolve('mobile.latest-app-version'),
    ]);
    return {
      minAppVersion: { ios: normalize(ios) ?? '0.0.0', android: normalize(android) ?? '0.0.0' },
      latestAppVersion: normalize(latest),
    };
  }

  /** True when `appVersion` is strictly older than the platform's minimum. */
  async upgradeRequired(platform: DevicePlatform, appVersion: string): Promise<{ upgradeRequired: boolean; minAppVersion: string }> {
    const policy = await this.versionPolicy();
    const minAppVersion = platform === DevicePlatform.IOS ? policy.minAppVersion.ios : policy.minAppVersion.android;
    return { upgradeRequired: isOlder(appVersion, minAppVersion), minAppVersion };
  }
}

function normalize(v: string | undefined): string | null {
  if (!v) return null;
  const clean = semver.valid(semver.coerce(v.trim()) ?? '');
  return clean;
}

export function isOlder(appVersion: string, minVersion: string): boolean {
  const app = semver.coerce(appVersion);
  const min = semver.coerce(minVersion);
  if (!app || !min) return false;
  return semver.lt(app, min);
}
