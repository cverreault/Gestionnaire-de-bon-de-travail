import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { ROUTER, type IRouter, type LatLng } from '../../../common/contracts/router.contract';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { haversineKm, optimize, type Stop, orderByMatrix } from './route-optimizer';

/**
 * B53 — a technician position farther than this from every stop is ignored
 * for the tour (stale fix, emulator default in California…). Below the
 * engine's 400 km per-pair matrix limit so the matrix still succeeds.
 */
export const MAX_START_DISTANCE_KM = 300;

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
  constructor(
    private readonly prisma: PrismaService,
    // B47 — Valhalla when available ; straight-line heuristic otherwise.
    @Optional() @Inject(ROUTER) private readonly router?: IRouter,
  ) {}

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
  ): Promise<OptimizedRoute> {
    if (workOrderIds.length === 0) {
      return { orderedWorkOrderIds: [], totalDistanceKm: 0, totalDurationMin: null, legs: [], shape: [], engine: 'haversine', reason: null, startIgnored: false, startDistanceKm: null };
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

    const start: LatLng = { lat: startPos.latitude, lng: startPos.longitude };

    // B53 — ignore a start that is nowhere near the stops : the engine refuses
    // pairs > 400 km and the tour would be meaningless anyway. The nearest stop
    // becomes the anchor (first visit) and the tour is ordered from there.
    let anchorStop: Stop = stops[0];
    let nearestStartKm = Infinity;
    for (const st of stops) {
      const d = haversineKm(start, st);
      if (d < nearestStartKm) {
        nearestStartKm = d;
        anchorStop = st;
      }
    }
    const startIgnored = nearestStartKm > MAX_START_DISTANCE_KM;
    const anchor: LatLng = startIgnored ? { lat: anchorStop.lat, lng: anchorStop.lng } : start;
    const rest: Stop[] = startIgnored ? stops.filter((st) => st.id !== anchorStop.id) : stops;
    const startNote = {
      startIgnored,
      startDistanceKm: startIgnored ? Math.round(nearestStartKm) : null,
    };
    const prefixLegs = startIgnored ? [{ workOrderId: anchorStop.id, distanceKm: 0, durationMin: 0 }] : [];
    const prefixIds = startIgnored ? [anchorStop.id] : [];

    // B47 — real driving times (Valhalla matrix + 2-opt), then the route for legs and shape.
    let reason: OptimizedRoute['reason'] = null;
    if (this.router) {
      const points: LatLng[] = [anchor, ...rest.map((st) => ({ lat: st.lat, lng: st.lng }))];
      const matrix = points.length > 1 ? await this.router.matrix(points, points) : { durationsMin: [[0]], distancesKm: [[0]] };
      if (matrix) {
        const order = orderByMatrix(matrix.durationsMin);
        const orderedRest = order.map((k) => rest[k - 1]);
        const route = orderedRest.length > 0
          ? await this.router.route([anchor, ...orderedRest.map((st) => ({ lat: st.lat, lng: st.lng }))], { language: 'fr' })
          : null;
        const legs = orderedRest.map((st, i) => {
          const from = i === 0 ? 0 : order[i - 1];
          const to = order[i];
          return {
            workOrderId: st.id,
            distanceKm: route?.legs[i]?.distanceKm ?? matrix.distancesKm[from][to] ?? 0,
            durationMin: route?.legs[i]?.durationMin ?? matrix.durationsMin[from][to] ?? 0,
          };
        });
        return {
          orderedWorkOrderIds: [...prefixIds, ...orderedRest.map((st) => st.id)],
          totalDistanceKm: Math.round((route?.distanceKm ?? legs.reduce((a, l) => a + l.distanceKm, 0)) * 10) / 10,
          totalDurationMin: Math.round(route?.durationMin ?? legs.reduce((a, l) => a + l.durationMin, 0)),
          legs: [...prefixLegs, ...legs],
          shape: route?.shape ?? [],
          engine: 'valhalla',
          reason: null,
          ...startNote,
        };
      }
      // The engine answered nothing : down / no tiles, or it refused these
      // points (pair too far apart, point outside the map).
      let available = false;
      try {
        available = (await this.router.status())?.available === true;
      } catch {
        available = false;
      }
      reason = available ? 'router_refused' : 'router_unavailable';
    } else {
      reason = 'router_unavailable';
    }

    const result = optimize({ start: anchor, stops: rest });
    return {
      orderedWorkOrderIds: [...prefixIds, ...result.orderedStopIds],
      totalDistanceKm: result.totalDistanceKm,
      totalDurationMin: null,
      legs: [],
      shape: [],
      engine: 'haversine',
      reason,
      ...startNote,
    };
  }
}

// ─── Types ────────────────────────────────────────────────────

/** B47 — tour result ; `engine` tells the UI whether times are real driving times. */
export interface OptimizedRoute {
  orderedWorkOrderIds: string[];
  totalDistanceKm: number;
  /** Null with the straight-line fallback. */
  totalDurationMin: number | null;
  legs: Array<{ workOrderId: string; distanceKm: number; durationMin: number }>;
  /** Road geometry start → last stop (empty with the fallback). */
  shape: LatLng[];
  engine: 'valhalla' | 'haversine';
  /** B53 — why the straight-line fallback was used (null with the engine). */
  reason: 'router_unavailable' | 'router_refused' | null;
  /** B53 — true when the technician position was too far from every stop and the tour starts at the nearest stop. */
  startIgnored: boolean;
  /** Distance (km) from the ignored position to the nearest stop ; null when the start was used. */
  startDistanceKm: number | null;
}

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
