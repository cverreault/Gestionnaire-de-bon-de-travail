import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Role, type LocationSource } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RequestContextService } from '../../../common/context/request-context.service';
import { isGpsEnabled } from '../../../common/contracts/gps-preferences.contract';
import type { LocationFixDto } from '../api/dto/location-batch.dto';

/** Client fixes ahead of the server clock by more than this are rejected. */
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;
/** Same window as LocationRetentionService — older fixes would be purged tonight anyway. */
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface LocationBatchResult {
  accepted: number;
  /** Already stored (replayed batch or overlapping buffers) — harmless. */
  duplicates: number;
  rejected: Array<{ index: number; reason: 'INVALID_TIMESTAMP' | 'IN_FUTURE' | 'TOO_OLD' | 'DUPLICATE_IN_BATCH' }>;
}

export interface RecordLocationInput {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface LatestPosition {
  technicianId: string;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: Date;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * Record a position for the calling tech.
   *
   * Defence-in-depth: even though the front-end only POSTs when the
   * toggle is on, we re-read `preferences.gps.enabled` server-side
   * and reject the insert if the user has revoked consent. This
   * ensures a stale tab or a tampered client can't keep producing
   * rows after opt-out.
   */
  async recordLocation(input: RecordLocationInput): Promise<void> {
    const user = await this.assertOptedInTechnician(input.userId);

    await this.prisma.technicianLocation.create({
      data: {
        technicianId: user.id,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
      },
    });
  }

  /**
   * B37.7 / ADR-017 §1 — buffered fixes from the mobile app (foreground or
   * background task), at most 100 per call. Same consent check as the
   * single-fix endpoint. Fixes more than 2 minutes in the future or older
   * than the 7-day retention window are rejected per index ; replays of the
   * same batch are harmless thanks to the unique (technician, recordedAt).
   */
  async recordBatch(userId: string, fixes: LocationFixDto[]): Promise<LocationBatchResult> {
    const user = await this.assertOptedInTechnician(userId);
    const now = Date.now();
    const rejected: LocationBatchResult['rejected'] = [];
    const rows: Array<{ technicianId: string; latitude: number; longitude: number; accuracy: number | null; recordedAt: Date; source: LocationSource }> = [];
    const seen = new Set<number>();

    fixes.forEach((fix, index) => {
      const t = new Date(fix.recordedAt).getTime();
      if (Number.isNaN(t)) return void rejected.push({ index, reason: 'INVALID_TIMESTAMP' });
      if (t > now + FUTURE_TOLERANCE_MS) return void rejected.push({ index, reason: 'IN_FUTURE' });
      if (t < now - RETENTION_WINDOW_MS) return void rejected.push({ index, reason: 'TOO_OLD' });
      if (seen.has(t)) return void rejected.push({ index, reason: 'DUPLICATE_IN_BATCH' });
      seen.add(t);
      rows.push({
        technicianId: user.id,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy ?? null,
        recordedAt: new Date(t),
        source: fix.source as LocationSource,
      });
    });

    let accepted = 0;
    if (rows.length > 0) {
      const r = await this.prisma.technicianLocation.createMany({ data: rows, skipDuplicates: true });
      accepted = r.count;
    }
    return { accepted, duplicates: rows.length - accepted, rejected };
  }

  /** Shared gate of the two upload endpoints (ADR-008 : consent re-checked server-side on every call). */
  private async assertOptedInTechnician(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, preferences: true },
    });
    if (!user || !user.isActive) {
      throw new ForbiddenException('Utilisateur inactif ou introuvable');
    }
    if (user.role !== Role.TECHNICIAN) {
      throw new ForbiddenException('Seuls les techniciens peuvent envoyer leur position');
    }
    if (!isGpsEnabled(user.preferences)) {
      throw new ForbiddenException('Suivi GPS non activé pour ce compte (preferences.gps.enabled)');
    }
    return user;
  }

  /**
   * Latest position per opted-in technician. Only the dispatcher view
   * uses this — no per-tech filter (the UI map shows everyone).
   *
   * Implementation: DISTINCT ON (technician_id) ordered by recordedAt
   * DESC. Uses the composite index added in B5.1, so this stays O(N
   * techs) even with millions of historic rows.
   */
  async latestPositions(): Promise<LatestPosition[]> {
    type Row = {
      technician_id: string;
      first_name: string;
      last_name: string;
      latitude: number;
      longitude: number;
      accuracy: number | null;
      recorded_at: Date;
    };

    // SECURITY (B25): raw SQL bypasses the Prisma tenant-scope middleware,
    // so the tenant filter MUST be explicit here — otherwise this leaks the
    // GPS positions of every tenant's technicians.
    const tenantId = this.requestContext.requireTenantId();
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT DISTINCT ON (tl.technician_id)
        tl.technician_id,
        u.first_name,
        u.last_name,
        tl.latitude,
        tl.longitude,
        tl.accuracy,
        tl.recorded_at
      FROM technician_locations tl
      JOIN users u ON u.id = tl.technician_id
      WHERE u.is_active = true
        AND tl.tenant_id = ${tenantId}
        AND u.tenant_id = ${tenantId}
      ORDER BY tl.technician_id, tl.recorded_at DESC
    `;

    return rows.map((r) => ({
      technicianId: r.technician_id,
      firstName: r.first_name,
      lastName: r.last_name,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy,
      recordedAt: r.recorded_at,
    }));
  }
}
