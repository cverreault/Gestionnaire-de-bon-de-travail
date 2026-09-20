import * as FileSystem from 'expo-file-system/legacy';
import { ApiError, apiBase, authHeaders, errorMessageFrom, refreshTokens } from '../api/client';
import { IDEMPOTENCY_KEY_HEADER } from '@taskmgr/shared';
import { addNote, addWorkOrderPart, removeWorkOrderPart, saveSignatures, transitionWorkOrder, updateWorkOrder } from '../api/endpoints';
import type { SendFailure, Sender } from './drain';
import type { AttachmentPayload, NotePayload, PartAddPayload, PartRemovePayload, QueuedOp, SignaturePayload, TemplatePayload, TransitionPayload } from './queue';

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
  signature: (op: QueuedOp, expectedUpdatedAt) =>
    guard(async () => {
      const wo = await saveSignatures(op.workOrderId, { ...(op.payload as SignaturePayload), expectedUpdatedAt: expectedUpdatedAt ?? undefined }, op.id);
      return { updatedAt: wo.updatedAt };
    }),
  template: (op: QueuedOp, expectedUpdatedAt) =>
    guard(async () => {
      const wo = await updateWorkOrder(op.workOrderId, { templateData: (op.payload as TemplatePayload).templateData, expectedUpdatedAt: expectedUpdatedAt ?? undefined }, op.id);
      return { updatedAt: wo.updatedAt };
    }),
  partAdd: (op: QueuedOp) =>
    guard(async () => {
      const p = op.payload as PartAddPayload;
      const res = await addWorkOrderPart(op.workOrderId, { partId: p.partId, quantity: p.quantity, source: p.source }, op.id);
      return { workOrderUpdatedAt: res.workOrderUpdatedAt };
    }),
  partRemove: (op: QueuedOp) =>
    guard(async () => {
      const res = await removeWorkOrderPart(op.workOrderId, (op.payload as PartRemovePayload).rowId, op.id);
      return { workOrderUpdatedAt: res.workOrderUpdatedAt };
    }),
  attachment: (op: QueuedOp) =>
    guard(async () => {
      const p = op.payload as AttachmentPayload;
      const res = await uploadFile(op.workOrderId, p, op.id);
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

/**
 * Native multipart upload (expo-file-system) instead of RN fetch + FormData,
 * which fails silently on some Android builds. One refresh on 401, then the
 * same error shape as the JSON client.
 */
async function uploadFile(workOrderId: string, file: AttachmentPayload, idempotencyKey: string): Promise<{ id: string; workOrderUpdatedAt?: string }> {
  const url = `${apiBase()}/work-orders/${workOrderId}/attachments`;
  const send = () =>
    FileSystem.uploadAsync(url, file.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: file.type,
      parameters: {},
      headers: authHeaders({ [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }),
    });
  const info = await FileSystem.getInfoAsync(file.uri);
  if (!info.exists) throw new ApiError(400, `Fichier local introuvable : ${file.name}`);
  let res = await send();
  if (res.status === 401 && (await refreshTokens())) res = await send();
  const { message, json } = errorMessageFrom(res.body, res.status);
  if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, message, json);
  const envelope = json as { data?: { id: string; workOrderUpdatedAt?: string } } | null;
  return envelope?.data ?? (json as { id: string; workOrderUpdatedAt?: string });
}
