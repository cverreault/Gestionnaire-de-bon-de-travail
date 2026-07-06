import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * B19 — Address geocoding via Nominatim (OpenStreetMap).
 *
 * Free, no API key. Usage policy constraints honoured here:
 *   - max 1 request/second (we sleep 1100 ms between calls)
 *   - descriptive User-Agent identifying the app
 *
 * `geocodeMissing()` sweeps client_addresses rows whose latitude is null,
 * builds a structured query from the address parts, and stores the first
 * hit. Addresses that genuinely can't be resolved are counted as failed
 * and retried on the next run (rare enough not to need a dead-letter
 * marker at our scale).
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  private static readonly NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  private static readonly USER_AGENT = 'Dispatch2Go/1.0 (work-order dispatch; contact: admin@dispatch2go.com)';
  private static readonly BATCH = 25;

  /** Serialise concurrent sweeps — Nominatim rate limit is global. */
  private isRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Geocode up to BATCH addresses missing coordinates. Returns counts.
   * Runs in the caller's tenant context (Prisma middleware scopes rows).
   */
  async geocodeMissing(): Promise<{
    attempted: number;
    resolved: number;
    failed: number;
  }> {
    if (this.isRunning) {
      return { attempted: 0, resolved: 0, failed: 0 };
    }
    this.isRunning = true;
    try {
      return await this.run();
    } finally {
      this.isRunning = false;
    }
  }

  private async run(): Promise<{ attempted: number; resolved: number; failed: number }> {
    const rows = await this.prisma.clientAddress.findMany({
      where: { latitude: null },
      take: GeocodingService.BATCH,
      select: {
        id: true,
        streetNumber: true,
        street: true,
        city: true,
        postalCode: true,
        province: true,
        country: true,
      },
    });

    let resolved = 0;
    let failed = 0;

    for (const addr of rows) {
      const hit = await this.geocodeOne(addr);
      if (hit) {
        await this.prisma.clientAddress.update({
          where: { id: addr.id },
          data: { latitude: hit.lat, longitude: hit.lng },
        });
        resolved++;
      } else {
        failed++;
      }
      // Nominatim policy : ≤ 1 req/s.
      await sleep(1100);
    }

    if (rows.length > 0) {
      this.logger.log(
        `Geocoding sweep: ${resolved} resolved, ${failed} failed of ${rows.length}`,
      );
    }
    return { attempted: rows.length, resolved, failed };
  }

  private async geocodeOne(addr: {
    streetNumber: string | null;
    street: string;
    city: string;
    postalCode: string;
    province: string;
    country: string | null;
  }): Promise<{ lat: number; lng: number } | null> {
    // Try the most specific form first, then degrade — Nominatim often
    // misses exact civic numbers in rural areas but knows the street.
    const attempts = [
      [addr.streetNumber, addr.street, addr.city, addr.province, addr.postalCode, addr.country ?? 'Canada'],
      [addr.street, addr.city, addr.province, addr.country ?? 'Canada'],
      [addr.city, addr.postalCode, addr.province, addr.country ?? 'Canada'],
    ];
    for (const parts of attempts) {
      const q = parts.filter(Boolean).join(', ');
      if (!q) continue;
      try {
        const url = `${GeocodingService.NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': GeocodingService.USER_AGENT },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as Array<{ lat: string; lon: string }>;
        const first = json[0];
        if (first) {
          const lat = Number(first.lat);
          const lng = Number(first.lon);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Geocode attempt failed for "${q}": ${message}`);
      }
      // Degrade to the next attempt after the polite delay.
      await sleep(1100);
    }
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
