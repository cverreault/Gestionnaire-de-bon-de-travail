import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ROUTER, type IRouter, type LatLng, type RouteResult } from '../../../common/contracts/router.contract';
import { toCsv } from '../../../common/utils/csv.util';

export type TravelSource = 'ROUTER' | 'MANUAL';

/** Where the trip starts (B49.2) : the technician's last GPS fix, a predefined point, or raw coordinates (the phone). */
export type TravelOrigin =
  | { type: 'GPS' }
  | { type: 'POINT'; pointId: string }
  | { type: 'COORDS'; lat: number; lng: number; label?: string };

export interface TravelInfo {
  distanceKm: number | null;
  durationMin: number | null;
  source: TravelSource | null;
  computedAt: Date | null;
  roundTrip: boolean;
  origin: (LatLng & { label: string | null }) | null;
  /** Origin → site (→ origin), recomputed live for the map / GPX when the origin is known. */
  route: RouteResult | null;
  site: LatLng | null;
}

/**
 * B49 — mileage of a work order, computed on demand only : the dispatcher (web)
 * or the technician (app) picks the origin and one-way / round trip, the routing
 * engine gives km and minutes, stored with the origin so the trip can be redrawn.
 * An admin can overwrite the distance by hand (`MANUAL`).
 */
@Injectable()
export class TravelService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(ROUTER) private readonly router?: IRouter,
  ) {}

  private async load(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        tenantId: true,
        assignedToId: true,
        travelDistanceKm: true,
        travelDurationMin: true,
        travelSource: true,
        travelComputedAt: true,
        travelRoundTrip: true,
        travelOriginLabel: true,
        travelOriginLat: true,
        travelOriginLng: true,
        clientAddress_rel: { select: { latitude: true, longitude: true } },
      },
    });
    if (!wo) throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    const a = wo.clientAddress_rel;
    const site = a && a.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : null;
    const origin = wo.travelOriginLat != null && wo.travelOriginLng != null ? { lat: wo.travelOriginLat, lng: wo.travelOriginLng, label: wo.travelOriginLabel } : null;
    return { wo, site, origin };
  }

  private points(origin: LatLng, site: LatLng, roundTrip: boolean): LatLng[] {
    return roundTrip ? [origin, site, origin] : [origin, site];
  }

  /** Stored values + the live route for the map / GPX. */
  async info(workOrderId: string, opts: { withRoute?: boolean } = {}): Promise<TravelInfo & { assignedToId: string | null }> {
    const { wo, site, origin } = await this.load(workOrderId);
    let route: RouteResult | null = null;
    if (opts.withRoute && origin && site && this.router) {
      route = await this.router.route(this.points(origin, site, wo.travelRoundTrip), { language: 'fr' });
    }
    return {
      assignedToId: wo.assignedToId,
      distanceKm: wo.travelDistanceKm,
      durationMin: wo.travelDurationMin,
      source: (wo.travelSource as TravelSource | null) ?? null,
      computedAt: wo.travelComputedAt,
      roundTrip: wo.travelRoundTrip,
      origin,
      route,
      site,
    };
  }

  /** Resolves the chosen origin to coordinates + a label. */
  private async resolveOrigin(origin: TravelOrigin, tenantId: string, assignedToId: string | null): Promise<LatLng & { label: string }> {
    if (origin.type === 'COORDS') {
      return { lat: origin.lat, lng: origin.lng, label: origin.label?.trim() || 'Position GPS' };
    }
    if (origin.type === 'POINT') {
      const p = await this.prisma.departurePoint.findFirst({ where: { id: origin.pointId, tenantId } });
      if (!p) throw new BadRequestException('Point de départ introuvable.');
      return { lat: p.lat, lng: p.lng, label: p.label };
    }
    if (!assignedToId) throw new BadRequestException("Aucun technicien assigné : pas de position GPS à utiliser.");
    const fix = await this.prisma.technicianLocation.findFirst({
      where: { technicianId: assignedToId },
      orderBy: { recordedAt: 'desc' },
      select: { latitude: true, longitude: true, recordedAt: true },
    });
    if (!fix) throw new BadRequestException("Le technicien n'a pas de position GPS enregistrée.");
    return { lat: fix.latitude, lng: fix.longitude, label: `Position GPS du technicien (${fix.recordedAt.toLocaleString('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'short', timeStyle: 'short' })})` };
  }

  /** Computes and stores the trip from the chosen origin. */
  async compute(workOrderId: string, input: { origin: TravelOrigin; roundTrip: boolean }): Promise<{ distanceKm: number; durationMin: number; roundTrip: boolean; originLabel: string }> {
    const { wo, site } = await this.load(workOrderId);
    if (!site) throw new BadRequestException("L'adresse du bon de travail n'a pas de coordonnées.");
    if (!this.router) throw new BadRequestException('Moteur de routage indisponible.');
    const origin = await this.resolveOrigin(input.origin, wo.tenantId, wo.assignedToId);
    const route = await this.router.route(this.points(origin, site, input.roundTrip), { language: 'fr' });
    if (!route) throw new BadRequestException('Moteur de routage indisponible.');
    const distanceKm = Math.round(route.distanceKm * 10) / 10;
    const durationMin = Math.round(route.durationMin);
    await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: {
        travelDistanceKm: distanceKm,
        travelDurationMin: durationMin,
        travelSource: 'ROUTER',
        travelComputedAt: new Date(),
        travelRoundTrip: input.roundTrip,
        travelOriginLabel: origin.label,
        travelOriginLat: origin.lat,
        travelOriginLng: origin.lng,
      },
    });
    return { distanceKm, durationMin, roundTrip: input.roundTrip, originLabel: origin.label };
  }

  /** GPX 1.1 track of the stored trip. */
  async gpx(workOrderId: string, referenceNumber: string): Promise<string | null> {
    const info = await this.info(workOrderId, { withRoute: true });
    if (!info.route || info.route.shape.length === 0 || !info.origin) return null;
    const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string);
    const pts = info.route.shape.map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"></trkpt>`).join('\n');
    const wpt = (p: LatLng, name: string) => `  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><name>${esc(name)}</name></wpt>`;
    const mode = info.roundTrip ? 'aller-retour' : 'aller simple';
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gpx version="1.1" creator="Dispatch2Go" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `  <metadata><name>${esc(referenceNumber)} — ${mode}</name><desc>${info.route.distanceKm} km · ${Math.round(info.route.durationMin)} min</desc></metadata>\n` +
      wpt(info.origin, `Départ : ${info.origin.label ?? ''}`) + '\n' +
      (info.site ? wpt(info.site, `Site ${esc(referenceNumber)}`) + '\n' : '') +
      `  <trk><name>${esc(referenceNumber)}</name><trkseg>\n${pts}\n    </trkseg></trk>\n</gpx>\n`
    );
  }

  async report(from: Date, to: Date, technicianId?: string) {
    const rows = await this.prisma.workOrder.findMany({
      where: {
        status: { in: ['COMPLETED_POSITIVE', 'COMPLETED_NEGATIVE'] },
        actualEndTime: { gte: from, lte: to },
        ...(technicianId ? { assignedToId: technicianId } : {}),
      },
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        actualEndTime: true,
        travelDistanceKm: true,
        travelDurationMin: true,
        travelSource: true,
        travelRoundTrip: true,
        travelOriginLabel: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        client: { select: { firstName: true, lastName: true, companyName: true } },
        clientAddress_rel: { select: { streetNumber: true, street: true, city: true } },
      },
      orderBy: [{ assignedToId: 'asc' }, { actualEndTime: 'asc' }],
    });
    const byTech = new Map<string, { technicianId: string | null; technician: string; workOrders: number; withMileage: number; distanceKm: number; durationMin: number }>();
    for (const r of rows) {
      const key = r.assignedTo?.id ?? '—';
      const cur = byTech.get(key) ?? { technicianId: r.assignedTo?.id ?? null, technician: r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : '—', workOrders: 0, withMileage: 0, distanceKm: 0, durationMin: 0 };
      cur.workOrders += 1;
      if (r.travelDistanceKm != null) {
        cur.withMileage += 1;
        cur.distanceKm += r.travelDistanceKm;
        cur.durationMin += r.travelDurationMin ?? 0;
      }
      byTech.set(key, cur);
    }
    const technicians = [...byTech.values()].map((t) => ({ ...t, distanceKm: Math.round(t.distanceKm * 10) / 10, durationMin: Math.round(t.durationMin) }));
    const items = rows.map((r) => ({
      id: r.id,
      referenceNumber: r.referenceNumber,
      title: r.title,
      completedAt: r.actualEndTime,
      technician: r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : null,
      client: r.client ? r.client.companyName || `${r.client.firstName} ${r.client.lastName}` : null,
      address: r.clientAddress_rel ? [[r.clientAddress_rel.streetNumber, r.clientAddress_rel.street].filter(Boolean).join(' '), r.clientAddress_rel.city].filter(Boolean).join(', ') : null,
      distanceKm: r.travelDistanceKm,
      durationMin: r.travelDurationMin,
      roundTrip: r.travelRoundTrip,
      origin: r.travelOriginLabel,
      source: r.travelSource,
    }));
    return { from, to, technicians, items, totalDistanceKm: Math.round(technicians.reduce((a, t) => a + t.distanceKm, 0) * 10) / 10 };
  }

  async reportCsv(from: Date, to: Date, technicianId?: string): Promise<string> {
    const { items } = await this.report(from, to, technicianId);
    return toCsv(items as unknown as Array<Record<string, unknown>>, [
      { header: 'Référence', pick: (r) => r.referenceNumber },
      { header: 'Titre', pick: (r) => r.title },
      { header: 'Technicien', pick: (r) => r.technician ?? '' },
      { header: 'Client', pick: (r) => r.client ?? '' },
      { header: 'Adresse', pick: (r) => r.address ?? '' },
      { header: 'Terminé le', pick: (r) => (r.completedAt ? new Date(r.completedAt as Date).toISOString() : '') },
      { header: 'Départ', pick: (r) => r.origin ?? '' },
      { header: 'Trajet', pick: (r) => (r.distanceKm == null ? '' : r.roundTrip ? 'aller-retour' : 'aller simple') },
      { header: 'Km', pick: (r) => r.distanceKm ?? '' },
      { header: 'Minutes de route', pick: (r) => r.durationMin ?? '' },
      { header: 'Source', pick: (r) => r.source ?? '' },
    ]);
  }
}
