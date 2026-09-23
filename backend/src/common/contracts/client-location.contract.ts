/**
 * Position of the client at the moment of an action (B45).
 *
 * The mobile app sends `X-Client-Location: <lat>,<lng>[,<accuracyMeters>][,<recordedAtIso>]`
 * on every mutating request, captured when the technician performed the
 * action (not when the offline queue drained). The tenant middleware parses it
 * into the request context ; the `audit` module stores it on every event
 * recorded during the request, so the work-order history shows where each
 * action was done. Never used for authorization.
 */
export const CLIENT_LOCATION_HEADER = 'x-client-location' as const;

export interface ClientLocation {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres, when the device reports it. */
  accuracy?: number;
  /** When the fix was taken (ISO 8601) ; absent = at request time. */
  recordedAt?: string;
}

function finite(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Returns the parsed location, or null when the header is absent or malformed. */
export function parseClientLocation(header: string | string[] | undefined): ClientLocation | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const parts = raw.split(',').map((p) => p.trim());
  const lat = finite(parts[0]);
  const lng = finite(parts[1]);
  if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const accuracy = finite(parts[2]);
  const recordedAtRaw = parts[3];
  const recordedAt = recordedAtRaw && !Number.isNaN(Date.parse(recordedAtRaw)) ? new Date(recordedAtRaw).toISOString() : undefined;
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    ...(accuracy !== undefined && accuracy >= 0 ? { accuracy: Math.round(accuracy) } : {}),
    ...(recordedAt ? { recordedAt } : {}),
  };
}

/** Serializes a location for the header (used by tests and the mobile contract mirror). */
/**
 * B57 — emitted (fire-and-forget) by the auth guard when an authenticated
 * request carries `X-Client-Location`, at most once per user per minute.
 * The locations module turns it into a technician position row, so the
 * dispatcher map follows the phone even between GPS batches.
 */
export const CLIENT_FIX_REPORTED_EVENT = 'locations.clientFix.reported' as const;

export interface ClientFixReportedPayload {
  userId: string;
  location: ClientLocation;
}

export function formatClientLocation(loc: ClientLocation): string {
  return [loc.lat, loc.lng, loc.accuracy ?? '', loc.recordedAt ?? ''].join(',').replace(/,+$/, '');
}
