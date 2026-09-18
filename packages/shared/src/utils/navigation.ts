/**
 * Turn-by-turn navigation deep links (B38). Pure: the platform is passed in
 * so the helper is testable without React Native.
 */
export interface NavTarget {
  latitude?: number | null;
  longitude?: number | null;
  /** Free-text fallback when coordinates are missing: "451 Rue Principale, Sainte-Marthe J0P 1W0". */
  address?: string | null;
}

export function navigationUrl(target: NavTarget, platform: 'ios' | 'android' | 'web'): string | null {
  const hasCoords =
    typeof target.latitude === 'number' && Number.isFinite(target.latitude) &&
    typeof target.longitude === 'number' && Number.isFinite(target.longitude);
  const dest = hasCoords ? `${target.latitude},${target.longitude}` : (target.address ?? '').trim();
  if (!dest) return null;
  const encoded = encodeURIComponent(dest);
  if (platform === 'ios') return `maps://?daddr=${encoded}&dirflg=d`;
  if (platform === 'android') return `google.navigation:q=${encoded}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

/** One-line postal address from the parts the API returns. */
export function formatAddressLine(a: {
  streetNumber?: string | null;
  street: string;
  apartment?: string | null;
  city: string;
  postalCode?: string | null;
}): string {
  const street = [a.streetNumber, a.street].filter(Boolean).join(' ');
  const apt = a.apartment ? `, app. ${a.apartment}` : '';
  return `${street}${apt}, ${a.city}${a.postalCode ? ` ${a.postalCode}` : ''}`;
}
