import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkOrdersService, type CurrentUserRef } from '../work-orders.service';
import { BatchAction, type BatchResult, type BatchWorkOrdersDto } from '../dto/batch-work-orders.dto';

/**
 * B55 — batch actions on a selection of work orders.
 *
 * Every work order goes through the SAME code path as the single-item
 * actions (process engine transitions, assign-and-dispatch, update), so
 * events, audit history, notifications and permission rules are untouched.
 * One failure never blocks the others : the result lists successes and
 * failures with their reason.
 */
@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async run(dto: BatchWorkOrdersDto, currentUser: CurrentUserRef): Promise<BatchResult> {
    this.assertParams(dto);
    const ids = [...new Set(dto.ids)];
    const result: BatchResult = { action: dto.action, ok: [], failed: [] };

    for (const id of ids) {
      try {
        const updated = await this.runOne(id, dto, currentUser);
        result.ok.push({ id, referenceNumber: updated.referenceNumber });
      } catch (err) {
        const error = extractMessage(err);
        const ref = await this.prisma.workOrder
          .findUnique({ where: { id }, select: { referenceNumber: true } })
          .then((w) => w?.referenceNumber ?? null)
          .catch(() => null);
        result.failed.push({ id, referenceNumber: ref, error });
      }
    }

    this.logger.log(
      `Batch ${dto.action} by user ${currentUser.id}: ${result.ok.length} ok, ${result.failed.length} failed`,
    );
    return result;
  }

  private assertParams(dto: BatchWorkOrdersDto): void {
    switch (dto.action) {
      case BatchAction.ASSIGN:
      case BatchAction.DISPATCH:
        if (!dto.technicianId) throw new BadRequestException('technicianId est obligatoire pour cette action.');
        break;
      case BatchAction.CANCEL:
        if (!dto.reason?.trim()) throw new BadRequestException("La raison d'annulation est obligatoire.");
        break;
      case BatchAction.SCHEDULE:
        if (!dto.scheduledDate && !dto.scheduledStartTime && !dto.scheduledEndTime) {
          throw new BadRequestException('Une date planifiée est obligatoire pour cette action.');
        }
        break;
      case BatchAction.ADD_TAGS:
      case BatchAction.REMOVE_TAGS:
        if (!dto.tagIds?.length) throw new BadRequestException('Au moins un tag est requis pour cette action.');
        break;
      default:
        break;
    }
  }

  private async runOne(
    id: string,
    dto: BatchWorkOrdersDto,
    currentUser: CurrentUserRef,
  ): Promise<{ referenceNumber: string }> {
    switch (dto.action) {
      case BatchAction.ASSIGN:
        return this.assign(id, dto.technicianId!, currentUser);
      case BatchAction.DISPATCH:
        return this.workOrders.assignAndDispatch(
          id,
          { technicianId: dto.technicianId!, scheduledDate: dto.scheduledDate, note: dto.note },
          currentUser.id,
        );
      case BatchAction.UNASSIGN:
        return this.unassign(id, currentUser);
      case BatchAction.CANCEL:
        return this.cancel(id, dto.reason!.trim(), currentUser);
      case BatchAction.SCHEDULE:
        return this.workOrders.update(
          id,
          {
            ...(dto.scheduledDate !== undefined && { scheduledDate: dto.scheduledDate }),
            ...(dto.scheduledStartTime !== undefined && { scheduledStartTime: dto.scheduledStartTime }),
            ...(dto.scheduledEndTime !== undefined && { scheduledEndTime: dto.scheduledEndTime }),
          },
          currentUser,
        );
      case BatchAction.ADD_TAGS:
        return this.tags(id, dto.tagIds!, 'add', currentUser);
      case BatchAction.REMOVE_TAGS:
        return this.tags(id, dto.tagIds!, 'remove', currentUser);
      default:
        throw new BadRequestException(`Action inconnue : ${String(dto.action)}`);
    }
  }

  /** Merge / subtract on the current tag set, then the regular update (validates the ids, emits the events). */
  private async tags(id: string, tagIds: string[], mode: 'add' | 'remove', currentUser: CurrentUserRef) {
    const rows = await this.prisma.workOrderTag.findMany({ where: { workOrderId: id }, select: { tagId: true } });
    const current = new Set(rows.map((r) => r.tagId));
    for (const tagId of tagIds) {
      if (mode === 'add') current.add(tagId);
      else current.delete(tagId);
    }
    return this.workOrders.update(id, { tagIds: [...current] }, currentUser);
  }

  /** Initial step → assign step through the process ; any other open step → reassign. */
  private async assign(id: string, technicianId: string, currentUser: CurrentUserRef) {
    const avail = await this.workOrders.getAvailableTransitions(id, currentUser);
    const toAssign = avail.transitions.find(
      (tr) => tr.requiredFields.includes('assignedToId') || tr.toStatusCode === 100,
    );
    if (toAssign) {
      return this.workOrders.transition(
        id,
        { targetStepId: toAssign.toStatusId, assignedToId: technicianId },
        currentUser,
      );
    }
    return this.workOrders.update(id, { assignedToId: technicianId, status: 'ASSIGNED' }, currentUser);
  }

  /** Same rule as the web « Non assigné » column : back to the initial step (code 0). */
  private async unassign(id: string, currentUser: CurrentUserRef) {
    const avail = await this.workOrders.getAvailableTransitions(id, currentUser);
    const back = avail.transitions.find((tr) => tr.toStatusCode === 0);
    if (!back) {
      throw new BadRequestException('Ce BT ne peut pas être désassigné depuis son statut actuel.');
    }
    return this.workOrders.transition(id, { targetStepId: back.toStatusId }, currentUser);
  }

  /** Transition to the process « Annulé » status (B54) with the reason. */
  private async cancel(id: string, reason: string, currentUser: CurrentUserRef) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { processDefinitionId: true, status: true },
    });
    if (!wo) throw new BadRequestException('Bon de travail introuvable.');
    if (wo.status === 'CANCELLED') throw new BadRequestException('Déjà annulé.');
    if (!wo.processDefinitionId) throw new BadRequestException('Aucun processus rattaché à ce BT.');
    const cancelled = await this.prisma.processStatus.findFirst({
      where: { processDefinitionId: wo.processDefinitionId, isCancelled: true },
      select: { id: true },
    });
    if (!cancelled) {
      throw new BadRequestException("Le processus de ce BT n'a pas de statut « Annulé ».");
    }
    return this.workOrders.transition(
      id,
      { targetStepId: cancelled.id, negativeReason: reason },
      currentUser,
    );
  }
}

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'getResponse' in err && typeof (err as { getResponse: () => unknown }).getResponse === 'function') {
    const res = (err as { getResponse: () => unknown }).getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object' && 'message' in res) {
      const m = (res as { message: unknown }).message;
      return Array.isArray(m) ? m.join(', ') : String(m);
    }
  }
  return err instanceof Error ? err.message : String(err);
}
