import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ROUTER, type IRouter, type LatLng, type RouteResult } from '../../../common/contracts/router.contract';
import { toCsv } from '../../../common/utils/csv.util';

export type TravelSource = 'ROUTER' | 'MANUAL';

export interface TravelInfo {
  distanceKm: number | null;
  durationMin: number | null;
  source: TravelSource | null;
  computedAt: Date | null;
  /** Base → site → base, when both points are known and the engine answered. */
  route: RouteResult | null;
  base: (LatLng & { address: string | null }) | null;
  site: LatLng | null;
}

/**
 * B49 — round-trip mileage of a work order : company base (Paramètres →
 * Entreprise) → site → base, from the routing engine. Stored on the work
 * order at completion (or on demand) ; an admin can overwrite the distance
 * by hand (`MANUAL`), which the automatic computation then leaves alone.
 */
@Injectable()
export class TravelService {
  private readonly logger = new Logger(TravelService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(ROUTER) private readonly router?: IRouter,
  ) {}

  private async points(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        assignedToId: true,
        travelDistanceKm: true,
        travelDurationMin: true,
        travelSource: true,
        travelComputedAt: true,
        clientAddress_rel: { select: { latitude: true, longitude: true } },
        tenant: { select: { baseAddress: true, baseLat: true, baseLng: true } },
      },
    });
    if (!wo) throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    const base = wo.tenant.baseLat != null && wo.tenant.baseLng != null ? { lat: wo.tenant.baseLat, lng: wo.tenant.baseLng, address: wo.tenant.baseAddress } : null;
    const a = wo.clientAddress_rel;
    const site = a && a.latitude != null && a.longitude != null ? { lat: a.latitude, lng: a.longitude } : null;
    return { wo, base, site };
  }

  /** Current stored values + the live round-trip route (for the map / GPX). */
  async info(workOrderId: string, opts: { withRoute?: boolean } = {}): Promise<TravelInfo & { assignedToId: string | null }> {
    const { wo, base, site } = await this.points(workOrderId);
    let route: RouteResult | null = null;
    if (opts.withRoute && base && site && this.router) {
      route = await this.router.route([base, site, base], { language: 'fr' });
    }
    return {
      assignedToId: wo.assignedToId,
      distanceKm: wo.travelDistanceKm,
      durationMin: wo.travelDurationMin,
      source: (wo.travelSource as TravelSource | null) ?? null,
      computedAt: wo.travelComputedAt,
      route,
      base,
      site,
    };
  }

  /**
   * Computes and stores the round trip. `force` overrides a MANUAL value ;
   * otherwise a manual entry is preserved. Returns null when the base
   * address, the site coordinates or the engine are missing.
   */
  async compute(workOrderId: string, opts: { force?: boolean } = {}): Promise<{ distanceKm: number; durationMin: number } | null> {
    const { wo, base, site } = await this.points(workOrderId);
    if (wo.travelSource === 'MANUAL' && !opts.force) return wo.travelDistanceKm != null ? { distanceKm: wo.travelDistanceKm, durationMin: wo.travelDurationMin ?? 0 } : null;
    if (!base) throw new BadRequestException("Adresse de départ de l'entreprise non définie (Paramètres → Entreprise).");
    if (!site) throw new BadRequestException("L'adresse du bon de travail n'a pas de coordonnées.");
    if (!this.router) throw new BadRequestException('Moteur de routage indisponible.');
    const route = await this.router.route([base, site, base], { language: 'fr' });
    if (!route) throw new BadRequestException('Moteur de routage indisponible.');
    const distanceKm = Math.round(route.distanceKm * 10) / 10;
    const durationMin = Math.round(route.durationMin);
    await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data: { travelDistanceKm: distanceKm, travelDurationMin: durationMin, travelSource: 'ROUTER', travelComputedAt: new Date() },
    });
    return { distanceKm, durationMin };
  }

  /** Best-effort variant for the completion listener : never throws. */
  async computeSilently(workOrderId: string): Promise<void> {
    try {
      await this.compute(workOrderId);
    } catch (err) {
      this.logger.debug(`Mileage not computed for ${workOrderId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async setManual(workOrderId: string, distanceKm: number | null): Promise<void> {
    await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data:
        distanceKm == null
          ? { travelDistanceKm: null, travelDurationMin: null, travelSource: null, travelComputedAt: null }
          : { travelDistanceKm: Math.round(distanceKm * 10) / 10, travelSource: 'MANUAL', travelComputedAt: new Date() },
    });
  }

  /** GPX 1.1 track of the round trip (for GPS apps and spreadsheets). */
  async gpx(workOrderId: string, referenceNumber: string): Promise<string | null> {
    const info = await this.info(workOrderId, { withRoute: true });
    if (!info.route || info.route.shape.length === 0) return null;
    const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string);
    const pts = info.route.shape.map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"></trkpt>`).join('\n');
    const wpt = (p: LatLng, name: string) => `  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><name>${esc(name)}</name></wpt>`;
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gpx version="1.1" creator="Dispatch2Go" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `  <metadata><name>${esc(referenceNumber)} — aller-retour</name><desc>${info.route.distanceKm} km · ${Math.round(info.route.durationMin)} min</desc></metadata>\n` +
      (info.base ? wpt(info.base, info.base.address ? `Départ : ${info.base.address}` : 'Départ') + '\n' : '') +
      (info.site ? wpt(info.site, `Site ${esc(referenceNumber)}`) + '\n' : '') +
      `  <trk><name>${esc(referenceNumber)}</name><trkseg>\n${pts}\n    </trkseg></trk>\n</gpx>\n`
    );
  }

  /** Mileage of the completed work orders in a period, per technician, plus the rows. */
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
      { header: 'Km aller-retour', pick: (r) => r.distanceKm ?? '' },
      { header: 'Minutes de route', pick: (r) => r.durationMin ?? '' },
      { header: 'Source', pick: (r) => r.source ?? '' },
    ]);
  }
}
