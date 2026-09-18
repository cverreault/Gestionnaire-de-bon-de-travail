import * as FileSystem from 'expo-file-system/legacy';
import { ApiError } from '../api/client';
import { addNote, transitionWorkOrder, uploadAttachment } from '../api/endpoints';
import type { SendFailure, Sender } from './drain';
import type { AttachmentPayload, NotePayload, QueuedOp, TransitionPayload } from './queue';

function toFailure(err: unknown): SendFailure {
  if (err instanceof ApiError) {
    const code = err.body && typeof err.body === 'object' ? (err.body as { code?: string }).code ?? null : null;
    return { status: err.status, code, message: err.message };
  }
  return { status: 0, message: err instanceof Error ? err.message : String(err) };
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toFailure(err);
  }
}

/** Real HTTP sender for the drain : op.id is the Idempotency-Key (ADR-016 §3). */
export const httpSender: Sender = {
  transition: (op: QueuedOp, expectedUpdatedAt) =>
    guard(async () => {
      const p = op.payload as TransitionPayload;
      const wo = await transitionWorkOrder(
        op.workOrderId,
        { targetStepId: p.targetStepId, negativeReason: p.negativeReason, completionNotes: p.completionNotes, expectedUpdatedAt: expectedUpdatedAt ?? undefined },
        op.id,
      );
      return { updatedAt: wo.updatedAt };
    }),
  note: (op: QueuedOp) =>
    guard(async () => {
      const res = (await addNote(op.workOrderId, (op.payload as NotePayload).content, op.id)) as { workOrderUpdatedAt?: string };
      return { workOrderUpdatedAt: res.workOrderUpdatedAt };
    }),
  attachment: (op: QueuedOp) =>
    guard(async () => {
      const p = op.payload as AttachmentPayload;
      const res = (await uploadAttachment(op.workOrderId, { uri: p.uri, name: p.name, type: p.type }, op.id)) as { workOrderUpdatedAt?: string };
      // Best effort : the local copy is no longer needed.
      void FileSystem.deleteAsync(p.uri, { idempotent: true }).catch(() => undefined);
      return { workOrderUpdatedAt: res.workOrderUpdatedAt };
    }),
};

/** Copies a picked / captured file into the app sandbox so it survives until the drain sends it. */
export async function persistForQueue(opId: string, uri: string, ext: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory ?? ''}queue/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const target = `${dir}${opId}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}
