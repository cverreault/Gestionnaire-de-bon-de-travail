import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { optimize, type Stop } from './route-optimizer';

/**
 * B13 — Data source for the dispatcher map view.
 *
 * Two responsibilities :
 *   1. `snapshot()` — one-shot fetch of every active technician's latest
 *      known position + every in-flight WO with a geocoded address.
 *   2. `optimizeRoute()` — given a technician and a list of WO ids,
 *      return them in an order minimising travel distance.
 *
 * Everything runs in the current tenant context (via Prisma middleware).
 */
@Injectable()
export class DispatchMapService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(params?: {
    /** Filter WOs whose scheduledDate falls in [from, to]. */
    from?: Date;
    to?: Date;
    /** When a period filter is active, also include WOs with NO scheduled
     * date (they'd otherwise vanish from the map entirely). */
    includeUnscheduled?: boolean;
  }): Promise<MapSnapshot> {
    // Build the scheduled-date clause once. No params = everything active.
    const dateClause =
      params?.from && params?.to
        ? params.includeUnscheduled
          ? {
              OR: [
                { scheduledDate: { gte: params.from, lte: params.to } },
                { scheduledDate: null },
              ],
            }
          : { scheduledDate: { gte: params.from, lte: params.to } }
        : {};

    // Latest position per active technician. We can't rely on GROUP BY /
    // DISTINCT ON via Prisma's typed API, so we pull ~100 recent rows and
    // dedupe in-process — fine at our scale (< 20 techs typically).
    const [technicians, positions, workOrders] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'TECHNICIAN', isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      }),
      this.prisma.technicianLocation.findMany({
        orderBy: { recordedAt: 'desc' },
        take: 500,
        select: {
          technicianId: true,
          latitude: true,
          longitude: true,
          accuracy: true,
          recordedAt: true,
        },
      }),
      // NOTE: no geocoding filter here — WOs without coordinates are
      // returned with `location: null` so the sidebar can still list a
      // technician's assignments and flag « adresse non géocodée ».
      this.prisma.workOrder.findMany({
        where: {
          status: {
            in: [
              'CREATED',
              'ASSIGNED',
              'DISPATCHED',
              'EN_ROUTE',
              'IN_PROGRESS',
            ] as never,
          },
          ...dateClause,
        },
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          priority: true,
          status: true,
          scheduledDate: true,
          assignedToId: true,
          clientAddress_rel: {
            select: {
              latitude: true,
              longitude: true,
              street: true,
              city: true,
              postalCode: true,
            },
          },
          taskType: { select: { name: true, color: true } },
        },
      }),
    ]);

    const latestByTech = new Map<
      string,
      { latitude: number; longitude: number; accuracy: number | null; recordedAt: Date }
    >();
    for (const p of positions) {
      if (!latestByTech.has(p.technicianId)) {
        latestByTech.set(p.technicianId, {
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy,
          recordedAt: p.recordedAt,
        });
      }
    }

    return {
      technicians: technicians.map((t) => {
        const pos = latestByTech.get(t.id);
        return {
          id: t.id,
          name: `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim(),
          email: t.email,
          position: pos
            ? {
                lat: pos.latitude,
                lng: pos.longitude,
                accuracyMeters: pos.accuracy,
                recordedAt: pos.recordedAt,
              }
            : null,
        };
      }),
      workOrders: workOrders.map((w) => {
        const addr = w.clientAddress_rel;
        const geocoded =
          addr && addr.latitude !== null && addr.longitude !== null;
        return {
          id: w.id,
          referenceNumber: w.referenceNumber,
          title: w.title,
          priority: w.priority,
          status: w.status,
          scheduledDate: w.scheduledDate,
          assignedToId: w.assignedToId,
          taskTypeName: w.taskType?.name ?? null,
          taskTypeColor: w.taskType?.color ?? null,
          location: geocoded
            ? {
                lat: addr.latitude!,
                lng: addr.longitude!,
                addressLine: [addr.street, addr.city, addr.postalCode]
                  .filter(Boolean)
                  .join(', '),
              }
            : null,
          hasAddress: !!addr,
        };
      }),
    };
  }

  async optimizeRoute(
    technicianId: string,
    workOrderIds: string[],
  ): Promise<{
    orderedWorkOrderIds: string[];
    totalDistanceKm: number;
  }> {
    if (workOrderIds.length === 0) {
      return { orderedWorkOrderIds: [], totalDistanceKm: 0 };
    }
    if (workOrderIds.length > 50) {
      throw new BadRequestException(
        'Maximum 50 BT par optimisation de tournée.',
      );
    }

    const startPos = await this.prisma.technicianLocation.findFirst({
      where: { technicianId },
      orderBy: { recordedAt: 'desc' },
      select: { latitude: true, longitude: true },
    });
    if (!startPos) {
      throw new BadRequestException(
        'Ce technicien n\'a pas de position enregistrée — impossible d\'optimiser la tournée.',
      );
    }

    const wos = await this.prisma.workOrder.findMany({
      where: { id: { in: workOrderIds } },
      select: {
        id: true,
        clientAddress_rel: {
          select: { latitude: true, longitude: true },
        },
      },
    });

    const stops: Stop[] = [];
    for (const w of wos) {
      const a = w.clientAddress_rel;
      if (a && a.latitude !== null && a.longitude !== null) {
        stops.push({ id: w.id, lat: a.latitude, lng: a.longitude });
      }
    }
    if (stops.length === 0) {
      throw new BadRequestException(
        'Aucun BT sélectionné n\'a de coordonnées géocodées.',
      );
    }

    const result = optimize({
      start: { lat: startPos.latitude, lng: startPos.longitude },
      stops,
    });
    return {
      orderedWorkOrderIds: result.orderedStopIds,
      totalDistanceKm: result.totalDistanceKm,
    };
  }
}

// ─── Types ────────────────────────────────────────────────────────

export interface MapSnapshot {
  technicians: Array<{
    id: string;
    name: string;
    email: string | null;
    position:
      | {
          lat: number;
          lng: number;
          accuracyMeters: number | null;
          recordedAt: Date;
        }
      | null;
  }>;
  workOrders: Array<{
    id: string;
    referenceNumber: string;
    title: string;
    priority: number;
    status: string;
    scheduledDate: Date | null;
    assignedToId: string | null;
    taskTypeName: string | null;
    taskTypeColor: string | null;
    /** Null when the client address hasn't been geocoded yet. */
    location: {
      lat: number;
      lng: number;
      addressLine: string;
    } | null;
    hasAddress: boolean;
  }>;
}
