/**
 * Routing contract (B47, ADR-019) — driving routes, time/distance matrices
 * and tour ordering on the self-hosted Valhalla (OpenStreetMap Québec).
 *
 * Implemented by `geo` (`ValhallaClient`) and bound to `ROUTER` by the
 * `@Global()` GeoModule ; consumed by `dispatch-map` (tour optimisation)
 * without cross-module imports. Every method degrades to `null` when the
 * engine is unreachable or still building its tiles : callers fall back
 * (straight-line heuristics) rather than fail.
 */
export const ROUTER = Symbol('ROUTER');

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteManeuver {
  instruction: string;
  /** Kilometres. */
  distanceKm: number;
  /** Minutes. */
  durationMin: number;
  type: number;
}

export interface RouteLeg {
  distanceKm: number;
  durationMin: number;
  /** Decoded shape (lat/lng), start → end of the leg. */
  shape: LatLng[];
  maneuvers: RouteManeuver[];
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  legs: RouteLeg[];
  /** Whole-trip shape, legs concatenated. */
  shape: LatLng[];
}

export interface MatrixResult {
  /** durations[i][j] in minutes from sources[i] to targets[j] ; null when unreachable. */
  durationsMin: (number | null)[][];
  distancesKm: (number | null)[][];
}

export interface RouterStatus {
  available: boolean;
  engine: 'valhalla';
  version?: string;
  tilesetLastModified?: string;
  error?: string;
}

export interface IRouter {
  /** Driving route through the given points (≥ 2), in order. */
  route(points: LatLng[], opts?: { language?: 'fr' | 'en' }): Promise<RouteResult | null>;
  /** Driving time / distance from every source to every target. */
  matrix(sources: LatLng[], targets: LatLng[]): Promise<MatrixResult | null>;
  status(): Promise<RouterStatus>;
}
