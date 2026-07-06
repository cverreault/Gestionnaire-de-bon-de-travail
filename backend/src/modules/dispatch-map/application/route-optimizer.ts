/**
 * B13 — Nearest-Neighbor route optimizer.
 *
 * Given a start point (the technician's current location) and a set of
 * unordered stops (work-order coordinates), returns them in an order
 * that minimises the total driven distance.
 *
 * TSP is NP-hard; Nearest-Neighbor is a greedy heuristic that runs in
 * O(n²) and typically gets within 25 % of optimal for real-world stop
 * counts (≤50). Perfectly good for a dispatcher UI where the tech has
 * final say — this is a suggestion, not a mandate.
 *
 * Pure function, no I/O.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Stop extends GeoPoint {
  id: string;
}

export interface OptimizeInput {
  start: GeoPoint;
  stops: readonly Stop[];
}

export interface OptimizeResult {
  /** IDs in the order the technician should visit them. */
  orderedStopIds: string[];
  /** Total distance in kilometres (Haversine, start→…→last). */
  totalDistanceKm: number;
}

export function optimize(input: OptimizeInput): OptimizeResult {
  const remaining = new Map<string, Stop>();
  for (const s of input.stops) remaining.set(s.id, s);

  const order: string[] = [];
  let cursor: GeoPoint = input.start;
  let total = 0;

  while (remaining.size > 0) {
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const [id, stop] of remaining) {
      const d = haversineKm(cursor, stop);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    if (bestId === null) break; // defensive — shouldn't happen
    const bestStop = remaining.get(bestId)!;
    order.push(bestId);
    total += bestDist;
    cursor = bestStop;
    remaining.delete(bestId);
  }

  return {
    orderedStopIds: order,
    totalDistanceKm: Math.round(total * 10) / 10,
  };
}

/**
 * Great-circle distance between two lat/lng points, in kilometres.
 * Precision is plenty for route ordering — we're not doing turn-by-turn.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
