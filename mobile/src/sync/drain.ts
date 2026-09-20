import { eq } from 'drizzle-orm';
import { IDEMPOTENCY_IN_PROGRESS, OPTIMISTIC_LOCK_CONFLICT } from '@taskmgr/shared';
import * as s from '../db/schema';
import type { AppDb } from '../db/types';
import { deleteOp, listOps, recoverInFlight, setOpStatus, type QueuedOp } from './queue';
import { logEvent } from '../diag/log';

const MAX_ADDITIVE_RETRIES = 3;

/** Thrown by senders ; `status` 0 = transport failure. */
export interface SendFailure {
  status: number;
  code?: string | null;
  message?: string;
}

export interface Sender {
  /** Must send `expectedUpdatedAt` and resolve with the work order's new updatedAt. */
  transition(op: QueuedOp, expectedUpdatedAt: string | null): Promise<{ updatedAt: string }>;
  note(op: QueuedOp): Promise<{ workOrderUpdatedAt?: string }>;
  attachment(op: QueuedOp): Promise<{ workOrderUpdatedAt?: string }>;
  signature(op: QueuedOp, expectedUpdatedAt: string | null): Promise<{ updatedAt: string }>;
  partAdd(op: QueuedOp): Promise<{ workOrderUpdatedAt?: string }>;
  partRemove(op: QueuedOp): Promise<{ workOrderUpdatedAt?: string }>;
  template(op: QueuedOp, expectedUpdatedAt: string | null): Promise<{ updatedAt: string }>;
}

/** Ops that must not be replayed blindly after a conflict (ADR-016 §4). */
const BLOCKING_KINDS = new Set<QueuedOp['kind']>(['transition', 'part_remove']);

export interface DrainResult {
  sent: number;
  conflicts: number;
  failed: number;
  /** True when a transport / server error stopped the drain early (retry later). */
  stopped: boolean;
}

function isFailure(err: unknown): err is SendFailure {
  return !!err && typeof err === 'object' && typeof (err as SendFailure).status === 'number';
}

async function localUpdatedAt(db: AppDb, workOrderId: string): Promise<string | null> {
  const rows = await db.select({ updatedAt: s.workOrders.updatedAt }).from(s.workOrders).where(eq(s.workOrders.id, workOrderId));
  return rows[0]?.updatedAt ?? null;
}

/** Feed-forward (ADR-016 §4) : the next op on this work order sends the fresh updatedAt. */
async function bumpLocal(db: AppDb, workOrderId: string, updatedAt: string | undefined): Promise<void> {
  if (!updatedAt) return;
  await db.update(s.workOrders).set({ updatedAt }).where(eq(s.workOrders.id, workOrderId));
}

/**
 * Drains the queue sequentially by seq (ADR-016 §3/§4).
 *  - 2xx → op deleted, local updatedAt fed forward
 *  - 409 OPTIMISTIC_LOCK_CONFLICT → pull ; additive ops retry (≤ 3), transitions and part removals stop in CONFLICT
 *  - other 4xx → FAILED
 *  - 5xx / transport / idempotency in progress → stays PENDING, drain stops
 * A CONFLICT (any kind) or a FAILED transition blocks later ops of that work order.
 */
export async function drain(db: AppDb, sender: Sender, pull: () => Promise<void>): Promise<DrainResult> {
  await recoverInFlight(db);
  const result: DrainResult = { sent: 0, conflicts: 0, failed: 0, stopped: false };
  const ops = await listOps(db);
  const blocked = new Set(ops.filter((o) => o.status === 'CONFLICT' || (o.status === 'FAILED' && BLOCKING_KINDS.has(o.kind))).map((o) => o.workOrderId));

  for (const op of ops) {
    if (op.status !== 'PENDING' || blocked.has(op.workOrderId)) continue;
    let attempts = op.attempts;
    for (;;) {
      await setOpStatus(db, op.id, 'IN_FLIGHT', { attempts });
      try {
        if (op.kind === 'transition') {
          const res = await sender.transition(op, await localUpdatedAt(db, op.workOrderId));
          await bumpLocal(db, op.workOrderId, res.updatedAt);
        } else if (op.kind === 'note') {
          const res = await sender.note(op);
          await bumpLocal(db, op.workOrderId, res.workOrderUpdatedAt);
        } else if (op.kind === 'signature') {
          const res = await sender.signature(op, await localUpdatedAt(db, op.workOrderId));
          await bumpLocal(db, op.workOrderId, res.updatedAt);
        } else if (op.kind === 'template') {
          const res = await sender.template(op, await localUpdatedAt(db, op.workOrderId));
          await bumpLocal(db, op.workOrderId, res.updatedAt);
        } else if (op.kind === 'part_add') {
          const res = await sender.partAdd(op);
          await bumpLocal(db, op.workOrderId, res.workOrderUpdatedAt);
        } else if (op.kind === 'part_remove') {
          const res = await sender.partRemove(op);
          await bumpLocal(db, op.workOrderId, res.workOrderUpdatedAt);
        } else {
          const res = await sender.attachment(op);
          await bumpLocal(db, op.workOrderId, res.workOrderUpdatedAt);
        }
        await deleteOp(db, op.id);
        result.sent += 1;
        break;
      } catch (err) {
        const f = isFailure(err) ? err : { status: 0, message: String(err) };
        const message = f.message ?? `HTTP ${f.status}`;
        logEvent('drain', `${op.kind} ${op.id} → ${f.status} ${f.code ?? ''} ${message}`.trim());
        if (f.status === 409 && f.code === OPTIMISTIC_LOCK_CONFLICT) {
          await pull();
          if (!BLOCKING_KINDS.has(op.kind) && attempts + 1 < MAX_ADDITIVE_RETRIES) {
            attempts += 1;
            continue;
          }
          await setOpStatus(db, op.id, 'CONFLICT', { attempts: attempts + 1, lastError: message });
          result.conflicts += 1;
          blocked.add(op.workOrderId);
          break;
        }
        if (f.status === 0 || f.status >= 500 || (f.status === 409 && f.code === IDEMPOTENCY_IN_PROGRESS)) {
          await setOpStatus(db, op.id, 'PENDING', { attempts: attempts + 1, lastError: message });
          result.stopped = true;
          return result;
        }
        await setOpStatus(db, op.id, 'FAILED', { attempts: attempts + 1, lastError: message });
        result.failed += 1;
        if (BLOCKING_KINDS.has(op.kind)) blocked.add(op.workOrderId);
        break;
      }
    }
  }
  return result;
}

/** Conflict / failure resolution from the sync screen. */
export async function retryOp(db: AppDb, id: string): Promise<void> {
  await setOpStatus(db, id, 'PENDING', { attempts: 0, lastError: null });
}
