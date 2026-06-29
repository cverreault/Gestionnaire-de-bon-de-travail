import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isGpsEnabled } from '../../../common/contracts/gps-preferences.contract';

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

  constructor(private readonly prisma: PrismaService) {}

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
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true, isActive: true, preferences: true },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException('Utilisateur inactif ou introuvable');
    }
    if (user.role !== Role.TECHNICIAN) {
      throw new ForbiddenException(
        'Seuls les techniciens peuvent envoyer leur position',
      );
    }
    if (!isGpsEnabled(user.preferences)) {
      throw new ForbiddenException(
        'Suivi GPS non activé pour ce compte (preferences.gps.enabled)',
      );
    }

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
