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

/** Facts about the assessment-roll unit matched to an address (B40.2). */
export interface PropertyFacts {
  matricule: string;
  municipality: string;
  address: string;
  landUseCode: string | null;
  landUseLabel: string | null;
  dwellings: number | null;
  storeys: number | null;
  yearBuilt: number | null;
  landAreaM2: number | null;
  floorAreaM2: number | null;
  lotNumbers: string[];
  valueLand: number | null;
  valueBuilding: number | null;
  valueTotal: number | null;
  rollYear: number;
  latitude: number;
  longitude: number;
  matchedBy: 'number+street' | 'nearest';
  distanceMeters: number | null;
}

export interface PropertyLookupInput {
  latitude?: number | null;
  longitude?: number | null;
  streetNumber?: string | null;
  street?: string | null;
  city?: string | null;
}

export interface IGeocoder {
  /** Never throws — returns null when nothing trustworthy was found. */
  geocode(input: GeocodeInput): Promise<GeocodeResult | null>;
  /** Assessment-roll unit for an address (coordinates preferred). Never throws. */
  findProperty(input: PropertyLookupInput): Promise<PropertyFacts | null>;
}

/**
 * Columns written on `client_addresses` from a property match. `null` facts
 * still stamp `propertyMatchedAt` so sweeps do not retry forever; a manual
 * refresh clears the stamp first.
 */
export function propertyFactsToAddressColumns(facts: PropertyFacts | null, now = new Date()) {
  return {
    propertyMatchedAt: now,
    propertyMatchedBy: facts?.matchedBy ?? null,
    propertyMatricule: facts?.matricule ?? null,
    propertyMunicipality: facts?.municipality ?? null,
    propertyAddress: facts?.address ?? null,
    propertyLandUseCode: facts?.landUseCode ?? null,
    propertyLandUseLabel: facts?.landUseLabel ?? null,
    propertyDwellings: facts?.dwellings ?? null,
    propertyStoreys: facts?.storeys ?? null,
    propertyYearBuilt: facts?.yearBuilt ?? null,
    propertyLandAreaM2: facts?.landAreaM2 ?? null,
    propertyFloorAreaM2: facts?.floorAreaM2 ?? null,
    propertyLotNumbers: facts && facts.lotNumbers.length ? facts.lotNumbers.join(', ') : null,
    propertyValueLand: facts?.valueLand ?? null,
    propertyValueBuilding: facts?.valueBuilding ?? null,
    propertyValueTotal: facts?.valueTotal ?? null,
    propertyRollYear: facts?.rollYear ?? null,
  };
}

/** Columns cleared when an address's postal parts change (coordinates no longer apply). */
export const ADDRESS_GEO_RESET = {
  latitude: null,
  longitude: null,
  geocodedAt: null,
  geocodeSource: null,
  ...propertyFactsToAddressColumns(null),
  propertyMatchedAt: null,
} as const;
