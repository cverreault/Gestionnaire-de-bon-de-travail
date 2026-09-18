import type { ProcessSnapshot, ProcessSnapshotStatus, SyncWorkOrder, WorkOrderStatus } from '@taskmgr/shared';
import type { AttachmentPayload, NotePayload, QueuedOp, SignaturePayload, TransitionPayload } from './queue';

export interface Me {
  id: string;
  firstName: string;
  lastName: string;
}

/** Same rule as the server's ProcessEngine : flags first, then legacy codes. */
export function statusFromStep(step: ProcessSnapshotStatus, fallback: WorkOrderStatus): WorkOrderStatus {
  if (step.isRequested) return 'REQUESTED';
  if (step.isInitial) return 'CREATED';
  if (step.isDispatch) return 'DISPATCHED';
  if (step.isStart) return 'IN_PROGRESS';
  if (step.isTerminalPositive) return 'COMPLETED_POSITIVE';
  if (step.isTerminalNegative) return 'COMPLETED_NEGATIVE';
  if (step.code === 100) return 'ASSIGNED';
  if (step.code === 300) return 'EN_ROUTE';
  return fallback;
}

export interface ProjectedWorkOrder extends SyncWorkOrder {
  /** Ids of queued ops projected onto this view. */
  pendingOpIds: string[];
}

/**
 * ADR-016 §3 — pending operations are projected onto the server row so the
 * technician sees what they did and can chain transitions offline. The
 * server row itself is never mutated locally.
 */
export function projectWorkOrder(wo: SyncWorkOrder, ops: QueuedOp[], snapshot: ProcessSnapshot | null, me: Me): ProjectedWorkOrder {
  const out: ProjectedWorkOrder = { ...wo, notes: [...wo.notes], attachments: [...wo.attachments], pendingOpIds: [] };
  const statusById = new Map((snapshot?.statuses ?? []).map((st) => [st.id, st]));
  for (const op of [...ops].sort((a, b) => a.seq - b.seq)) {
    if (op.workOrderId !== wo.id) continue;
    out.pendingOpIds.push(op.id);
    if (op.kind === 'transition') {
      const p = op.payload as TransitionPayload;
      const step = statusById.get(p.targetStepId);
      out.currentStepId = p.targetStepId;
      if (step) {
        out.currentStep = { id: step.id, code: step.code, name: step.name, nameFr: step.nameFr, nameEn: step.nameEn, color: step.color, isTerminalPositive: step.isTerminalPositive, isTerminalNegative: step.isTerminalNegative };
        out.status = statusFromStep(step, out.status);
      }
      if (p.completionNotes) out.completionNotes = p.completionNotes;
      if (p.negativeReason) out.negativeReason = p.negativeReason;
    } else if (op.kind === 'note') {
      const p = op.payload as NotePayload;
      out.notes.unshift({ id: op.id, content: p.content, createdAt: op.createdAt, author: { id: me.id, firstName: me.firstName, lastName: me.lastName } });
    } else if (op.kind === 'attachment') {
      const p = op.payload as AttachmentPayload;
      out.attachments.unshift({ id: op.id, fileName: p.name, fileSize: 0, mimeType: p.type, uploadedAt: op.createdAt });
    } else if (op.kind === 'signature') {
      const p = op.payload as SignaturePayload;
      if (p.signatureClient !== undefined) out.hasSignatureClient = !!p.signatureClient;
      if (p.signatureTechnician !== undefined) out.hasSignatureTechnician = !!p.signatureTechnician;
      if (p.signatureClient || p.signatureTechnician) out.signedAt = op.createdAt;
    }
  }
  return out;
}
