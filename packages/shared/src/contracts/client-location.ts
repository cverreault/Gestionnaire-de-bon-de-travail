/**
 * B45 — position of the phone at the moment of an action, sent as
 * `X-Client-Location: lat,lng[,accuracyMeters][,recordedAtIso]` on every
 * mutating request. Mirror of backend/src/common/contracts/client-location.contract.ts.
 */
export const CLIENT_LOCATION_HEADER = 'X-Client-Location' as const;

export interface ClientLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  recordedAt?: string;
}

export function formatClientLocation(loc: ClientLocation): string {
  return [loc.lat, loc.lng, loc.accuracy ?? '', loc.recordedAt ?? ''].join(',').replace(/,+$/, '');
}
