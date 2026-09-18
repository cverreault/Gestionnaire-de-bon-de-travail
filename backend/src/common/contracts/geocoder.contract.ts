/**
 * Shared geocoding contract (B40).
 *
 * Implemented by the `geo` module (Adresses Québec first, Nominatim as a
 * fallback) and bound to the `GEOCODER` token from a `@Global()` module,
 * exactly like `SYSTEM_CONFIG_RESOLVER`. Consumers (`clients` on address
 * save, `dispatch-map` on its sweep) inject the token, never the module.
 */

/** DI token — bound in `GeoModule.providers`. */
export const GEOCODER = Symbol('GEOCODER');

export interface GeocodeInput {
  streetNumber?: string | null;
  street: string;
  apartment?: string | null;
  city: string;
  postalCode?: string | null;
  province?: string | null;
  country?: string | null;
}

export type GeocodeSource = 'adresses-quebec' | 'nominatim';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  source: GeocodeSource;
  /** Provider confidence, 0–100 when available. */
  score?: number;
  /** Postal code returned by the provider (formatted `A1A 1A1`) when the input lacked one. */
  postalCode?: string | null;
}

export interface IGeocoder {
  /** Never throws — returns null when nothing trustworthy was found. */
  geocode(input: GeocodeInput): Promise<GeocodeResult | null>;
}
