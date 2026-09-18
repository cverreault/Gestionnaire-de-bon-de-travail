/**
 * Domain events of the `mobile` module (ADR-015). Constants live here so
 * `auth` (refresh-token revocation) and `audit` subscribe without importing
 * the publisher.
 */
export const MOBILE_DEVICE_REGISTERED_EVENT = 'mobile.device.registered' as const;
export const MOBILE_DEVICE_REVOKED_EVENT = 'mobile.device.revoked' as const;

export interface MobileDeviceRegisteredPayload {
  tenantId: string;
  installationId: string;
  userId: string;
  platform: 'IOS' | 'ANDROID';
  appVersion: string;
  /** True when the installation was previously linked to another user. */
  relinked: boolean;
}

export interface MobileDeviceRevokedPayload {
  tenantId: string;
  installationId: string;
  userId: string;
  reason: 'user' | 'admin';
}
