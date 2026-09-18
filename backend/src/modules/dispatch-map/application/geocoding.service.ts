import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GEOCODER, type IGeocoder } from '../../../common/contracts/geocoder.contract';

/**
 * B19 / B40 — Sweep of client addresses missing coordinates.
 *
 * The provider lives behind the `GEOCODER` contract (Adresses Québec first,
 * Nominatim fallback — see the `geo` module). `geocodeMissing()` is called
 * by the dispatcher's map button (tenant-scoped by the request context) and
 * every 10 minutes by the cron below (no context → all tenants). Addresses
 * that genuinely can't be resolved are counted as failed and retried on the
 * next run (rare enough not to need a dead-letter marker at our scale).
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  private static readonly BATCH = 25;
  /** Nominatim policy is ≤ 1 req/s; Adresses Québec has no published limit. Stay polite. */
  private static readonly PAUSE_MS = 1100;

  /** Serialise concurrent sweeps — provider rate limits are global. */
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(GEOCODER) private readonly geocoder?: IGeocoder,
  ) {}

  @Cron('*/10 * * * *', { name: 'geocode-missing-sweep' })
  async sweep(): Promise<void> {
    const r = await this.geocodeMissing();
    if (r.attempted > 0) {
      this.logger.log(`Scheduled geocoding sweep: ${r.resolved}/${r.attempted} resolved`);
    }
  }

  /**
   * Geocode up to BATCH addresses missing coordinates. Returns counts.
   * Runs in the caller's tenant context (Prisma middleware scopes rows).
   */
  async geocodeMissing(): Promise<{
    attempted: number;
    resolved: number;
    failed: number;
  }> {
    if (this.isRunning || !this.geocoder) {
      return { attempted: 0, resolved: 0, failed: 0 };
    }
    this.isRunning = true;
    try {
      return await this.run(this.geocoder);
    } finally {
      this.isRunning = false;
    }
  }

  private async run(geocoder: IGeocoder): Promise<{ attempted: number; resolved: number; failed: number }> {
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
      const hit = await geocoder.geocode(addr);
      if (hit) {
        await this.prisma.clientAddress.update({
          where: { id: addr.id },
          data: {
            latitude: hit.latitude,
            longitude: hit.longitude,
            ...(hit.postalCode && !addr.postalCode ? { postalCode: hit.postalCode } : {}),
          },
        });
        resolved++;
      } else {
        failed++;
      }
      await sleep(GeocodingService.PAUSE_MS);
    }

    if (rows.length > 0) {
      this.logger.log(
        `Geocoding sweep: ${resolved} resolved, ${failed} failed of ${rows.length}`,
      );
    }
    return { attempted: rows.length, resolved, failed };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
