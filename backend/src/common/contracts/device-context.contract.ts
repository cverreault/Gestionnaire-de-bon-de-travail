/**
 * Device identity of the mobile app (ADR-014 §4).
 *
 * The app generates a UUID at first launch (`installationId`) and sends it as
 * `X-Device-Id` on every request. It scopes revocation and telemetry only —
 * never authorization. Lives in `common/` so `auth` (refresh-token rows),
 * the tenant middleware (request context) and `mobile` (device registry) share
 * it without cross-module imports.
 */
export const DEVICE_ID_HEADER = 'x-device-id' as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns the normalized (lower-case) device id, or null when absent / malformed. */
export function extractDeviceId(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return UUID_RE.test(value) ? value : null;
}
