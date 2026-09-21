import { Injectable, Logger } from '@nestjs/common';
import type { IRouter, LatLng, MatrixResult, RouteResult, RouterStatus } from '../../../common/contracts/router.contract';

/**
 * Valhalla HTTP client (B47). One container on the internal network,
 * `VALHALLA_URL` (default http://valhalla:8002). Costing « auto » (car).
 * Timeouts are short : the dispatcher UI and the app wait on these calls.
 */
@Injectable()
export class ValhallaClient implements IRouter {
  private readonly logger = new Logger(ValhallaClient.name);
  private readonly base = (process.env.VALHALLA_URL ?? 'http://valhalla:8002').replace(/\/+$/, '');
  static readonly TIMEOUT_MS = 12_000;

  async route(points: LatLng[], opts: { language?: 'fr' | 'en' } = {}): Promise<RouteResult | null> {
    if (points.length < 2) return null;
    const body = {
      locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
      costing: 'auto',
      units: 'kilometers',
      directions_options: { language: opts.language === 'en' ? 'en-US' : 'fr-FR', units: 'kilometers' },
    };
    const json = await this.post<ValhallaTrip>('/route', body);
    if (!json?.trip) return null;
    const legs = (json.trip.legs ?? []).map((l) => ({
      distanceKm: round(l.summary?.length ?? 0, 2),
      durationMin: round((l.summary?.time ?? 0) / 60, 1),
      shape: decodePolyline6(l.shape ?? ''),
      maneuvers: (l.maneuvers ?? []).map((m) => ({
        instruction: m.instruction ?? '',
        distanceKm: round(m.length ?? 0, 2),
        durationMin: round((m.time ?? 0) / 60, 1),
        type: m.type ?? 0,
      })),
    }));
    return {
      distanceKm: round(json.trip.summary?.length ?? legs.reduce((a, l) => a + l.distanceKm, 0), 2),
      durationMin: round((json.trip.summary?.time ?? 0) / 60, 1),
      legs,
      shape: legs.flatMap((l) => l.shape),
    };
  }

  async matrix(sources: LatLng[], targets: LatLng[]): Promise<MatrixResult | null> {
    if (sources.length === 0 || targets.length === 0) return null;
    const body = {
      sources: sources.map((p) => ({ lat: p.lat, lon: p.lng })),
      targets: targets.map((p) => ({ lat: p.lat, lon: p.lng })),
      costing: 'auto',
      units: 'kilometers',
    };
    const json = await this.post<ValhallaMatrix>('/sources_to_targets', body);
    if (!json?.sources_to_targets) return null;
    const durationsMin = json.sources_to_targets.map((row) => row.map((c) => (c.time == null ? null : round(c.time / 60, 1))));
    const distancesKm = json.sources_to_targets.map((row) => row.map((c) => (c.distance == null ? null : round(c.distance, 2))));
    return { durationsMin, distancesKm };
  }

  async status(): Promise<RouterStatus> {
    try {
      const res = await fetch(`${this.base}/status?verbose=true`, { signal: AbortSignal.timeout(3_000) });
      if (!res.ok) return { available: false, engine: 'valhalla', error: `HTTP ${res.status}` };
      const json = (await res.json()) as { version?: string; tileset_last_modified?: number; has_tiles?: boolean };
      const available = json.has_tiles !== false;
      return {
        available,
        engine: 'valhalla',
        version: json.version,
        tilesetLastModified: json.tileset_last_modified ? new Date(json.tileset_last_modified * 1000).toISOString() : undefined,
        ...(available ? {} : { error: 'tiles not built yet' }),
      };
    } catch (err) {
      return { available: false, engine: 'valhalla', error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ValhallaClient.TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`Valhalla ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(`Valhalla ${path} unreachable : ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

// ── Wire types (subset) ────────────────────────────────────────────────────

interface ValhallaTrip {
  trip?: {
    summary?: { length?: number; time?: number };
    legs?: Array<{
      summary?: { length?: number; time?: number };
      shape?: string;
      maneuvers?: Array<{ instruction?: string; length?: number; time?: number; type?: number }>;
    }>;
  };
}

interface ValhallaMatrix {
  sources_to_targets?: Array<Array<{ time: number | null; distance: number | null }>>;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Google polyline decoder with Valhalla's 1e-6 precision. */
export function decodePolyline6(encoded: string): LatLng[] {
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return out;
}
