import { encodeSyncCursor } from '../../../../common/contracts/sync-protocol.contract';
import { SyncService, projectWorkOrder } from './sync.service';

const NOW = new Date('2026-09-18T12:00:00Z');

function row(id: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id, referenceNumber: `R-${id}`, status: 'ASSIGNED', title: id, processDefinitionId: 'proc-1', updatedAt: new Date(updatedAt), taskType: { id: 'tt', templateId: 'tpl-1' },
    signatureClient: null, signatureTechnician: null, partsUsed: [], notes: [], attachments: [], tags: [], ...extra,
  };
}

function make(rows: ReturnType<typeof row>[], visible = rows.map((r) => r.id)) {
  const repo = {
    visibleIds: jest.fn().mockResolvedValue(visible),
    pageAfter: jest.fn().mockResolvedValue(rows),
    processSnapshots: jest.fn().mockResolvedValue([{ id: 'proc-1', name: 'Standard BT', statuses: [], transitions: [] }]),
    templates: jest.fn().mockResolvedValue([{ id: 'tpl-1', name: 'Standard', sections: [] }]),
    partsStock: jest.fn().mockResolvedValue([]),
    partsCatalog: jest.fn().mockResolvedValue([]),
    locateRequested: jest.fn().mockResolvedValue(false),
  };
  return { svc: new SyncService(repo as never), repo };
}

describe('SyncService.pull (ADR-016 §1)', () => {
  it('first pull: fullResync, whole visible set, page + cursor on the last row, snapshots keyed by id', async () => {
    const { svc, repo } = make([row('a', '2026-09-18T10:00:00Z'), row('b', '2026-09-18T11:00:00Z')]);
    const out = await svc.pull('tech-1', undefined, undefined, NOW);
    expect(out.fullResync).toBe(true);
    expect(out.hasMore).toBe(false);
    expect(out.visibleWorkOrderIds).toEqual(['a', 'b']);
    expect(out.workOrders.map((w) => w.id)).toEqual(['a', 'b']);
    expect(out.cursor).toBe(encodeSyncCursor({ t: new Date('2026-09-18T11:00:00Z'), id: 'b' }));
    expect(out.processSnapshots).toHaveProperty('proc-1');
    expect(out.templates).toHaveProperty('tpl-1');
    expect(repo.templates).toHaveBeenCalledWith(['tpl-1']);
    expect(repo.pageAfter).toHaveBeenCalledWith('tech-1', expect.any(Date), null, 51);
    // completed rows are visible 14 days
    const since: Date = repo.pageAfter.mock.calls[0][1];
    expect(NOW.getTime() - since.getTime()).toBe(14 * 24 * 3600 * 1000);
    // parts data is full (no since) on a first pull
    expect(repo.partsCatalog).toHaveBeenCalledWith(null);
  });

  it('paginates with limit + 1 and clamps the limit to 200', async () => {
    const rows = [row('a', '2026-09-18T10:00:00Z'), row('b', '2026-09-18T10:00:00Z'), row('c', '2026-09-18T10:00:01Z')];
    const { svc, repo } = make(rows);
    const out = await svc.pull('tech-1', undefined, 2, NOW);
    expect(out.hasMore).toBe(true);
    expect(out.workOrders.map((w) => w.id)).toEqual(['a', 'b']);
    expect(out.cursor).toBe(encodeSyncCursor({ t: new Date('2026-09-18T10:00:00Z'), id: 'b' }));
    await svc.pull('tech-1', undefined, 9999, NOW);
    expect(repo.pageAfter).toHaveBeenLastCalledWith('tech-1', expect.any(Date), null, 201);
  });

  it('continues from a valid cursor without fullResync and keeps the cursor when the page is empty', async () => {
    const cursor = encodeSyncCursor({ t: new Date('2026-09-18T11:00:00Z'), id: 'b' });
    const { svc, repo } = make([], ['a', 'b']);
    const out = await svc.pull('tech-1', cursor, undefined, NOW);
    expect(out.fullResync).toBe(false);
    expect(out.workOrders).toEqual([]);
    expect(out.cursor).toBe(cursor);
    expect(repo.pageAfter).toHaveBeenCalledWith('tech-1', expect.any(Date), { t: new Date('2026-09-18T11:00:00Z'), id: 'b' }, 51);
    expect(repo.partsCatalog).toHaveBeenCalledWith(new Date('2026-09-18T11:00:00Z'));
  });

  it('forces a full resync on a tampered or > 30-day-old cursor', async () => {
    const { svc, repo } = make([row('a', '2026-09-18T10:00:00Z')]);
    const stale = encodeSyncCursor({ t: new Date('2026-07-01T00:00:00Z'), id: 'x' });
    expect((await svc.pull('tech-1', stale, undefined, NOW)).fullResync).toBe(true);
    expect((await svc.pull('tech-1', 'garbage', undefined, NOW)).fullResync).toBe(true);
    expect(repo.pageAfter).toHaveBeenLastCalledWith('tech-1', expect.any(Date), null, 51);
  });
});

describe('projectWorkOrder', () => {
  it('replaces signatures by flags and flattens parts', () => {
    const out = projectWorkOrder(row('a', '2026-09-18T10:00:00Z', {
      signatureClient: 'data:image/png;base64,xxx',
      partsUsed: [{ id: 'wp', partId: 'p', quantity: 2, source: 'TECHNICIAN_STOCK', part: { sku: 'SKU', name: 'N', nameFr: 'N', nameEn: 'N', unit: 'un' } }],
    }) as never);
    expect(out).not.toHaveProperty('signatureClient');
    expect(out).toMatchObject({ hasSignatureClient: true, hasSignatureTechnician: false });
    expect(out.parts).toEqual([{ id: 'wp', partId: 'p', quantity: 2, source: 'TECHNICIAN_STOCK', sku: 'SKU', name: 'N', nameFr: 'N', nameEn: 'N', unit: 'un' }]);
  });

  it('B44 — exposes tags flat, whether the middleware already flattened them or not', () => {
    const tag = { id: 't', name: 'Lumii', color: '#2563eb' };
    expect(projectWorkOrder(row('a', '2026-09-18T10:00:00Z', { tags: [{ tag }] }) as never).tags).toEqual([tag]);
    expect(projectWorkOrder(row('b', '2026-09-18T10:00:00Z', { tags: [tag] }) as never).tags).toEqual([tag]);
  });
});
