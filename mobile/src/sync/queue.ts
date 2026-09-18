import { asc, eq, sql } from 'drizzle-orm';
import * as s from '../db/schema';
import type { AppDb } from '../db/types';

export type OpKind = 'transition' | 'note' | 'attachment' | 'signature' | 'part_add' | 'part_remove';
export type OpStatus = 'PENDING' | 'IN_FLIGHT' | 'FAILED' | 'CONFLICT';

export interface TransitionPayload {
  targetStepId: string;
  label: string;
  negativeReason?: string;
  completionNotes?: string;
}
export interface NotePayload {
  content: string;
}
export interface AttachmentPayload {
  uri: string;
  name: string;
  type: string;
}
export interface SignaturePayload {
  /** PNG data-URL ; null clears (ADR-016 §6 : signatures stay inline on the work order). */
  signatureClient?: string | null;
  signatureTechnician?: string | null;
}
export interface PartAddPayload {
  partId: string;
  quantity: number;
  source: 'WAREHOUSE' | 'TECHNICIAN_STOCK';
  /** Display only (catalog may change) : sku + localized name. */
  sku: string;
  name: string;
  unit: string;
}
export interface PartRemovePayload {
  /** Server row id (work_order_parts) or a queued part_add op id (removed locally, never sent). */
  rowId: string;
  sku: string;
}
export type OpPayload = TransitionPayload | NotePayload | AttachmentPayload | SignaturePayload | PartAddPayload | PartRemovePayload;

export interface QueuedOp {
  id: string;
  seq: number;
  workOrderId: string;
  kind: OpKind;
  payload: OpPayload;
  status: OpStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

function rowToOp(r: typeof s.syncQueue.$inferSelect): QueuedOp {
  return { ...r, kind: r.kind as OpKind, status: r.status as OpStatus, payload: JSON.parse(r.payload) as OpPayload };
}

export async function enqueue(db: AppDb, op: { id: string; workOrderId: string; kind: OpKind; payload: OpPayload }): Promise<QueuedOp> {
  const [{ max }] = await db.select({ max: sql<number | null>`max(${s.syncQueue.seq})` }).from(s.syncQueue);
  const row = { ...op, payload: JSON.stringify(op.payload), seq: (max ?? 0) + 1, status: 'PENDING', attempts: 0, lastError: null, createdAt: new Date().toISOString() };
  await db.insert(s.syncQueue).values(row);
  return rowToOp(row as typeof s.syncQueue.$inferSelect);
}

export async function listOps(db: AppDb): Promise<QueuedOp[]> {
  const rows = await db.select().from(s.syncQueue).orderBy(asc(s.syncQueue.seq));
  return rows.map(rowToOp);
}

export async function listOpsForWorkOrder(db: AppDb, workOrderId: string): Promise<QueuedOp[]> {
  const rows = await db.select().from(s.syncQueue).where(eq(s.syncQueue.workOrderId, workOrderId)).orderBy(asc(s.syncQueue.seq));
  return rows.map(rowToOp);
}

export async function setOpStatus(db: AppDb, id: string, status: OpStatus, patch: { attempts?: number; lastError?: string | null } = {}): Promise<void> {
  await db.update(s.syncQueue).set({ status, ...patch }).where(eq(s.syncQueue.id, id));
}

export async function deleteOp(db: AppDb, id: string): Promise<void> {
  await db.delete(s.syncQueue).where(eq(s.syncQueue.id, id));
}

/** IN_FLIGHT rows left by a killed app go back to PENDING at the next drain. */
export async function recoverInFlight(db: AppDb): Promise<void> {
  await db.update(s.syncQueue).set({ status: 'PENDING' }).where(eq(s.syncQueue.status, 'IN_FLIGHT'));
}

export interface QueueCounts {
  pending: number;
  failed: number;
  conflict: number;
}

export async function countOps(db: AppDb): Promise<QueueCounts> {
  const rows = await db.select({ status: s.syncQueue.status, n: sql<number>`count(*)` }).from(s.syncQueue).groupBy(s.syncQueue.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return { pending: (by.PENDING ?? 0) + (by.IN_FLIGHT ?? 0), failed: by.FAILED ?? 0, conflict: by.CONFLICT ?? 0 };
}
