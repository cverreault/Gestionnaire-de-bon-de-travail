import type { ProcessSnapshot, SyncWorkOrder } from '@taskmgr/shared';
import { projectWorkOrder, statusFromStep } from './project';
import type { QueuedOp } from './queue';

const snap: ProcessSnapshot = {
  id: 'proc', name: 'Standard', version: 1, updatedAt: '1', transitions: [],
  statuses: [
    { id: 's200', code: 200, name: 'Dispatché', nameFr: 'Dispatché', nameEn: 'Dispatched', color: '#8b5cf6', position: 2, isInitial: false, isDispatch: true, isStart: false, isTerminalPositive: false, isTerminalNegative: false, isRequested: false },
    { id: 's300', code: 300, name: 'En route', nameFr: 'En route', nameEn: 'En route', color: '#f59e0b', position: 3, isInitial: false, isDispatch: false, isStart: false, isTerminalPositive: false, isTerminalNegative: false, isRequested: false },
    { id: 's400', code: 400, name: 'En cours', nameFr: 'En cours', nameEn: 'In progress', color: '#f97316', position: 4, isInitial: false, isDispatch: false, isStart: true, isTerminalPositive: false, isTerminalNegative: false, isRequested: false },
  ],
};
const wo = { id: 'a', status: 'DISPATCHED', currentStepId: 's200', notes: [], attachments: [], updatedAt: '1' } as unknown as SyncWorkOrder;
const me = { id: 'me', firstName: 'Kevin', lastName: 'A' };
const op = (id: string, seq: number, kind: QueuedOp['kind'], payload: QueuedOp['payload'], workOrderId = 'a'): QueuedOp =>
  ({ id, seq, kind, payload, workOrderId, status: 'PENDING', attempts: 0, lastError: null, createdAt: '2026-09-18T10:00:00Z' });

describe('projectWorkOrder (ADR-016 §3)', () => {
  it('chains queued transitions, prepends notes and attachments, ignores other work orders', () => {
    const out = projectWorkOrder(wo, [
      op('t1', 1, 'transition', { targetStepId: 's300', label: 'Partir' }),
      op('n1', 2, 'note', { content: 'arrivé' }),
      op('t2', 3, 'transition', { targetStepId: 's400', label: 'Commencer' }),
      op('x', 4, 'note', { content: 'other' }, 'b'),
      op('p1', 5, 'attachment', { uri: 'file:///x.jpg', name: 'x.jpg', type: 'image/jpeg' }),
    ], snap, me);
    expect(out.currentStepId).toBe('s400');
    expect(out.status).toBe('IN_PROGRESS');
    expect(out.currentStep?.name).toBe('En cours');
    expect(out.notes.map((n) => n.content)).toEqual(['arrivé']);
    expect(out.notes[0].author?.firstName).toBe('Kevin');
    expect(out.attachments.map((a) => a.fileName)).toEqual(['x.jpg']);
    expect(out.pendingOpIds).toEqual(['t1', 'n1', 't2', 'p1']);
    // the input is untouched
    expect(wo.currentStepId).toBe('s200');
    expect(wo.notes).toEqual([]);
  });

  it('derives the legacy status from step flags and codes', () => {
    expect(statusFromStep(snap.statuses[0], 'CREATED')).toBe('DISPATCHED');
    expect(statusFromStep(snap.statuses[1], 'CREATED')).toBe('EN_ROUTE');
    expect(statusFromStep({ ...snap.statuses[1], code: 999 }, 'ASSIGNED')).toBe('ASSIGNED');
  });

  it('projects queued signatures as flags', () => {
    const out = projectWorkOrder({ ...wo, hasSignatureClient: false, hasSignatureTechnician: false, signedAt: null }, [
      op('s1', 1, 'signature', { signatureClient: 'data:image/png;base64,AAA' }),
    ], snap, me);
    expect(out.hasSignatureClient).toBe(true);
    expect(out.hasSignatureTechnician).toBe(false);
    expect(out.signedAt).toBe('2026-09-18T10:00:00Z');
  });

  it('projects part additions and removals (server rows and queued rows)', () => {
    const base = { ...wo, parts: [{ id: 'row1', partId: 'p1', quantity: 1, source: 'TECHNICIAN_STOCK' as const, sku: 'A', name: 'A', nameFr: 'A', nameEn: 'A', unit: 'un' }] };
    const out = projectWorkOrder(base, [
      op('pa1', 1, 'part_add', { partId: 'p2', quantity: 3, source: 'TECHNICIAN_STOCK', sku: 'B', name: 'B', unit: 'un' }),
      op('pr1', 2, 'part_remove', { rowId: 'row1', sku: 'A' }),
    ], snap, me);
    expect(out.parts.map((p) => [p.id, p.sku, p.quantity])).toEqual([['pa1', 'B', 3]]);
    expect(base.parts).toHaveLength(1);
  });

  it('merges queued template values over the server templateData', () => {
    const out = projectWorkOrder({ ...wo, templateData: { a: 1, b: 'x' } }, [op('t', 1, 'template', { templateData: { b: 'y', c: true } })], snap, me);
    expect(out.templateData).toEqual({ a: 1, b: 'y', c: true });
  });
});
