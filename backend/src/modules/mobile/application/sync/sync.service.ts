import { Injectable } from '@nestjs/common';
import {
  SYNC_COMPLETED_VISIBLE_DAYS,
  SYNC_CURSOR_MAX_AGE_DAYS,
  SYNC_PAGE_DEFAULT,
  SYNC_PAGE_MAX,
  decodeSyncCursor,
  encodeSyncCursor,
} from '../../../../common/contracts/sync-protocol.contract';
import { MobileRepository, type SyncWorkOrderRow } from '../../infrastructure/mobile.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delta pull (ADR-016 §1). One call = one page of changed work orders plus
 * the whole visible id set (deletions by set difference), the process
 * snapshots the page references, and the technician's parts data.
 */
@Injectable()
export class SyncService {
  constructor(private readonly repo: MobileRepository) {}

  async pull(technicianId: string, rawCursor: string | undefined, rawLimit: number | undefined, now = new Date()) {
    const limit = Math.min(Math.max(rawLimit ?? SYNC_PAGE_DEFAULT, 1), SYNC_PAGE_MAX);
    const completedSince = new Date(now.getTime() - SYNC_COMPLETED_VISIBLE_DAYS * DAY_MS);

    const decoded = decodeSyncCursor(rawCursor);
    const tooOld = decoded ? now.getTime() - new Date(decoded.t).getTime() > SYNC_CURSOR_MAX_AGE_DAYS * DAY_MS : false;
    const fullResync = !!rawCursor && (!decoded || tooOld) ? true : !rawCursor;
    const cursor = decoded && !tooOld ? { t: new Date(decoded.t), id: decoded.id } : null;

    const [visibleWorkOrderIds, rows] = await Promise.all([
      this.repo.visibleIds(technicianId, completedSince),
      this.repo.pageAfter(technicianId, completedSince, cursor, limit + 1),
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    const definitionIds = [...new Set(page.map((r) => r.processDefinitionId).filter((x): x is string => !!x))];
    const templateIds = [...new Set(page.map((r) => r.taskType?.templateId).filter((x): x is string => !!x))];
    const since = cursor?.t ?? null;
    const [snapshots, templates, partsStock, partsCatalog] = await Promise.all([
      this.repo.processSnapshots(definitionIds),
      this.repo.templates(templateIds),
      this.repo.partsStock(technicianId, since),
      this.repo.partsCatalog(since),
    ]);

    return {
      cursor: last ? encodeSyncCursor({ t: last.updatedAt, id: last.id }) : (rawCursor && !fullResync ? rawCursor : null),
      hasMore,
      fullResync,
      serverTime: now.toISOString(),
      visibleWorkOrderIds,
      workOrders: page.map(projectWorkOrder),
      processSnapshots: Object.fromEntries(snapshots.map((s) => [s.id, s])),
      templates: Object.fromEntries(templates.map((tpl) => [tpl.id, tpl])),
      partsStock,
      partsCatalog,
    };
  }
}

/** Signatures leave the payload (ADR-016 §6) ; everything else is the row as selected. */
export function projectWorkOrder(row: SyncWorkOrderRow) {
  const { signatureClient, signatureTechnician, partsUsed, tags, ...rest } = row;
  return {
    ...rest,
    // Already flat at runtime (tag-flatten middleware) ; the Prisma type still says `{ tag }`.
    tags: ((tags ?? []) as unknown as Array<{ id: string; name: string; color: string } | { tag: { id: string; name: string; color: string } }>).map(
      (t) => ('tag' in t ? t.tag : t),
    ),
    hasSignatureClient: !!signatureClient,
    hasSignatureTechnician: !!signatureTechnician,
    parts: partsUsed.map((p) => ({
      id: p.id,
      partId: p.partId,
      quantity: p.quantity,
      source: p.source,
      sku: p.part.sku,
      name: p.part.name,
      nameFr: p.part.nameFr,
      nameEn: p.part.nameEn,
      unit: p.part.unit,
    })),
  };
}
