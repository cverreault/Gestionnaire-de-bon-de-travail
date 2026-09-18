import { Injectable, Logger } from '@nestjs/common';

/**
 * Nominatim (OpenStreetMap) — fallback geocoder for addresses outside
 * Québec or unknown to Adresses Québec. Usage policy honoured: ≤ 1 req/s
 * (callers pace themselves via `sleep`) and an identifying User-Agent.
 */
@Injectable()
export class NominatimClient {
  private readonly logger = new Logger(NominatimClient.name);

  private static readonly SEARCH = 'https://nominatim.openstreetmap.org/search';
  private static readonly USER_AGENT =
    'Dispatch2Go/1.0 (work-order dispatch; contact: admin@dispatch2go.com)';
  private static readonly TIMEOUT_MS = 8000;

  /** First hit for a free-text query, or null. Never throws. */
  async search(q: string): Promise<{ latitude: number; longitude: number } | null> {
    if (!q.trim()) return null;
    try {
      const url = `${NominatimClient.SEARCH}?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': NominatimClient.USER_AGENT },
        signal: AbortSignal.timeout(NominatimClient.TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as Array<{ lat: string; lon: string }>;
      const first = json[0];
      if (!first) return null;
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    } catch (err) {
      this.logger.warn(`Nominatim failed for "${q}": ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
