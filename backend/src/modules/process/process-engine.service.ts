import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Role, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WORK_ORDER_DETAIL_INCLUDE } from '../work-orders/work-order-includes';
import {
  WO_EVENT_NAMES,
  workOrderAssigned,
  workOrderDispatched,
  workOrderStatusChanged,
  workOrderCompleted,
} from '../work-orders/domain/events/work-order-events';
import { ProcessCacheService } from './process-cache.service';
import {
  AvailableTransition,
  CachedProcess,
  CachedStatus,
  CachedTransition,
  CurrentUserRef,
  TransitionPayload,
} from './types/process.types';

// ── Result shapes ─────────────────────────────────────────────────────────────

export interface AvailableTransitionsResult {
  workOrderId: string;
  currentStepId: string | null;
  /** True when the caller is ADMIN and bypass rules apply. */
  adminBypass: boolean;
  transitions: AvailableTransition[];
}

// ── Lean WorkOrder shape used during validation ───────────────────────────────

type WorkOrderForTransition = {
  id: string;
  status: WorkOrderStatus;
  currentStepId: string | null;
  processDefinitionId: string | null;
  taskTypeId: string | null;
  assignedToId: string | null;
  actualStartTime: Date | null;
  updatedAt: Date;
};

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ProcessEngineService {
  private readonly logger = new Logger(ProcessEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processCache: ProcessCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── A. executeTransition ──────────────────────────────────────────────────

  /**
   * Executes a process transition for a WorkOrder.
   *
   * Steps:
   *  1. Load workOrder (also used for optimistic-lock check)
   *  2. Validate optimistic lock via expectedUpdatedAt
   *  3. IDOR check for TECHNICIAN role
   *  4. Resolve the process from cache
   *  5. Validate targetStepId belongs to the process
   *  6. Look up the configured transition (fromStep → targetStep)
   *  7. ADMIN bypass — logs a warning when no transition is configured
   *     Non-ADMIN — the transition must exist AND the role must be allowed
   *  8. Validate required fields declared on the transition
   *  9. Build the Prisma update payload with side-effects
   * 10. Persist inside a $transaction for atomicity
   * 11. Return the enriched WorkOrder
   */
  async executeTransition(
    workOrderId: string,
    targetStepId: string,
    currentUser: CurrentUserRef,
    payload: TransitionPayload,
  ) {
    // ── 1. Load workOrder ────────────────────────────────────────────────────
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        status: true,
        currentStepId: true,
        processDefinitionId: true,
        taskTypeId: true,
        assignedToId: true,
        actualStartTime: true,
        updatedAt: true,
      },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    }

    // ── 2. Optimistic locking ────────────────────────────────────────────────
    if (payload.expectedUpdatedAt) {
      if (workOrder.updatedAt.toISOString() !== payload.expectedUpdatedAt) {
        throw new ConflictException({
          code: 'OPTIMISTIC_LOCK_CONFLICT',
          message: 'Le bon de travail a été modifié depuis votre dernière consultation.',
          currentUpdatedAt: workOrder.updatedAt.toISOString(),
          expectedUpdatedAt: payload.expectedUpdatedAt,
        });
      }
    }

    // ── 3. IDOR check ────────────────────────────────────────────────────────
    if (
      currentUser.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez transitionner que vos propres bons de travail',
      );
    }

    // ── 4. Resolve process ───────────────────────────────────────────────────
    const process = await this.resolveProcessForWorkOrder(workOrder);

    // ── 5. Validate target step belongs to this process ──────────────────────
    const targetStatus = process.statuses.get(targetStepId);
    if (!targetStatus) {
      throw new BadRequestException(
        `L'étape cible #${targetStepId} n'appartient pas au processus "${process.name}" (${process.id}).`,
      );
    }

    // ── 6. Find configured transition ────────────────────────────────────────
    const fromStepId = workOrder.currentStepId;
    const fromStepName = fromStepId
      ? (process.statuses.get(fromStepId)?.name ?? fromStepId)
      : '(aucun)';

    const configuredTransition: CachedTransition | undefined = fromStepId
      ? (process.transitions.get(fromStepId) ?? []).find(
          (t) => t.toStatusId === targetStepId,
        )
      : undefined;

    // ── 7. Admin bypass vs. role-based gate ──────────────────────────────────
    if (currentUser.role === Role.ADMIN) {
      if (!configuredTransition) {
        this.logger.warn(
          `[ADMIN BYPASS] WorkOrder ${workOrderId}: transition non configurée ` +
            `"${fromStepName}" → "${targetStatus.name}" — ` +
            `bypass autorisé pour l'admin ${currentUser.id}`,
        );
      }
    } else {
      if (!configuredTransition) {
        throw new BadRequestException(
          `Transition non configurée : "${fromStepName}" → "${targetStatus.name}"`,
        );
      }
      if (!configuredTransition.allowedRoles.includes(currentUser.role)) {
        throw new ForbiddenException(
          `Votre rôle (${currentUser.role}) n'est pas autorisé pour la transition ` +
            `"${configuredTransition.label}"`,
        );
      }
    }

    // ── 8. Validate required fields ──────────────────────────────────────────
    const requiredFields = configuredTransition?.requiredFields ?? [];
    this.validateRequiredFields(requiredFields, payload, configuredTransition?.label);

    // ── 9. Validate assignedToId is an active TECHNICIAN ────────────────────
    if (payload.assignedToId) {
      const tech = await this.prisma.user.findUnique({
        where: { id: payload.assignedToId },
        select: { role: true, isActive: true },
      });
      if (!tech || !tech.isActive || tech.role !== 'TECHNICIAN') {
        throw new BadRequestException('Technicien invalide ou inactif');
      }
    }

    // ── 10. Build update payload ─────────────────────────────────────────────
    const data = this.buildUpdateData(workOrder, targetStatus, payload);

    // ── 11. Persist atomically ───────────────────────────────────────────────
    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.workOrder.update({
        where: { id: workOrderId },
        data,
        include: WORK_ORDER_DETAIL_INCLUDE,
      });
    });

    // ── 12. Audit log ────────────────────────────────────────────────────────
    this.logger.log(
      `WorkOrder ${workOrderId}: "${fromStepName}" → "${targetStatus.name}" ` +
        `(legacy: ${workOrder.status} → ${data.status ?? 'unchanged'}) ` +
        `by ${currentUser.id} [${currentUser.role}]`,
    );

    // ── 13. Publish domain events ────────────────────────────────────────────
    // Order matters : statusChanged always, then specialized events.
    const fromStatus = fromStepId ? process.statuses.get(fromStepId) ?? null : null;
    this.eventEmitter.emit(
      WO_EVENT_NAMES.STATUS_CHANGED,
      workOrderStatusChanged(workOrderId, currentUser.id, {
        fromStatusId: fromStatus?.id ?? null,
        toStatusId: targetStatus.id,
        fromStatusCode: fromStatus?.code ?? null,
        toStatusCode: targetStatus.code,
      }),
    );

    // Assigned-specific event when assignedToId changed during the transition.
    if (payload.assignedToId && payload.assignedToId !== workOrder.assignedToId) {
      this.eventEmitter.emit(
        WO_EVENT_NAMES.ASSIGNED,
        workOrderAssigned(workOrderId, currentUser.id, {
          technicianId: payload.assignedToId,
          previousTechnicianId: workOrder.assignedToId,
        }),
      );
    }

    // Dispatched-specific event when the new status is the dispatch step.
    if (targetStatus.isDispatch && updated.assignedToId) {
      this.eventEmitter.emit(
        WO_EVENT_NAMES.DISPATCHED,
        workOrderDispatched(workOrderId, currentUser.id, {
          technicianId: updated.assignedToId,
          dispatchedStatusId: targetStatus.id,
        }),
      );
    }

    // Completed-specific event when reaching a terminal state.
    if (targetStatus.isTerminalPositive || targetStatus.isTerminalNegative) {
      this.eventEmitter.emit(
        WO_EVENT_NAMES.COMPLETED,
        workOrderCompleted(workOrderId, currentUser.id, {
          outcome: targetStatus.isTerminalPositive ? 'positive' : 'negative',
          completedStatusId: targetStatus.id,
        }),
      );
    }

    return updated;
  }

  // ── B. getAvailableTransitions ────────────────────────────────────────────

  /**
   * Returns the list of transitions the current user can trigger for a WorkOrder.
   *
   * - ADMIN: receives ALL process statuses as reachable targets (configured +
   *   unconfigured), plus adminBypass=true.
   * - Non-ADMIN: receives only configured transitions whose allowedRoles
   *   includes the user's role.
   * - TECHNICIAN: subject to the IDOR check — only their assigned work orders.
   */
  async getAvailableTransitions(
    workOrderId: string,
    currentUser: CurrentUserRef,
  ): Promise<AvailableTransitionsResult> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        status: true,
        currentStepId: true,
        processDefinitionId: true,
        taskTypeId: true,
        assignedToId: true,
      },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    }

    // IDOR check
    if (
      currentUser.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException('Accès refusé');
    }

    // No current step — cannot determine transitions
    if (!workOrder.currentStepId) {
      this.logger.warn(
        `WorkOrder ${workOrderId} n'a pas de currentStepId — aucune transition retournée`,
      );
      return {
        workOrderId: workOrder.id,
        currentStepId: null,
        adminBypass: false,
        transitions: [],
      };
    }

    // Resolve process
    const process = await this.resolveProcessForWorkOrder(workOrder as WorkOrderForTransition);

    // Configured transitions from the current step
    const rawTransitions = process.transitions.get(workOrder.currentStepId) ?? [];
    const isAdmin = currentUser.role === Role.ADMIN;

    let eligible: CachedTransition[];

    if (isAdmin) {
      // Include all configured transitions AND synthesise bypass entries for
      // any status not already reachable via a configured transition.
      const coveredTargetIds = new Set(rawTransitions.map((t) => t.toStatusId));

      const bypassTransitions: CachedTransition[] = process.allStatuses
        .filter(
          (s) => s.id !== workOrder.currentStepId && !coveredTargetIds.has(s.id),
        )
        .map((s) => ({
          id: `admin-bypass:${workOrder.currentStepId}→${s.id}`,
          fromStatusId: workOrder.currentStepId!,
          toStatusId: s.id,
          label: `[Admin] → ${s.name}`,
          allowedRoles: [Role.ADMIN],
          requiredFields: [],
          sortOrder: 9999,
        }));

      eligible = [...rawTransitions, ...bypassTransitions];
    } else {
      eligible = rawTransitions.filter((t) =>
        t.allowedRoles.includes(currentUser.role),
      );
    }

    const transitions: AvailableTransition[] = eligible
      .map((t) => {
        const toStatus = process.statuses.get(t.toStatusId);
        if (!toStatus) {
          // Defensive: transition points to a status not in the process (should never happen)
          this.logger.warn(
            `Transition ${t.id} pointe vers un statut inexistant ${t.toStatusId} — ignorée`,
          );
          return null;
        }
        return {
          id: t.id,
          toStatusId: t.toStatusId,
          toStatusCode: toStatus.code,
          toStatusName: toStatus.name,
          toStatusColor: toStatus.color,
          label: t.label,
          requiredFields: t.requiredFields,
          sortOrder: t.sortOrder,
        } satisfies AvailableTransition;
      })
      .filter((t): t is AvailableTransition => t !== null);

    return {
      workOrderId: workOrder.id,
      currentStepId: workOrder.currentStepId,
      adminBypass: isAdmin,
      transitions,
    };
  }

  // ── C. resolveInitialStep ─────────────────────────────────────────────────

  /**
   * Returns the CachedStatus flagged as isInitial for the process associated
   * with the given TaskType, or the default process when taskTypeId is absent.
   *
   * Used at WorkOrder creation to set the initial currentStepId.
   */
  async resolveInitialStep(taskTypeId?: string): Promise<CachedStatus> {
    const process = taskTypeId
      ? await this.processCache.getProcessForTaskType(taskTypeId)
      : await this.processCache.getDefaultProcess();

    return process.initialStatus;
  }

  // ── D. mapToLegacyStatus ──────────────────────────────────────────────────

  /**
   * Maps a CachedStatus to the legacy WorkOrderStatus enum value.
   *
   * Priority:
   *  1. Semantic flags (apply to all processes, custom or standard)
   *  2. Code-based fallback for the standard 7-step process
   *     (code 100 → ASSIGNED, code 300 → EN_ROUTE)
   *  3. Returns null when no mapping can be determined — the caller should
   *     keep the WorkOrder's existing status unchanged.
   */
  mapToLegacyStatus(step: CachedStatus): WorkOrderStatus | null {
    // Flag-based (canonical — works for every process)
    if (step.isRequested) return WorkOrderStatus.REQUESTED;
    if (step.isInitial) return WorkOrderStatus.CREATED;
    if (step.isDispatch) return WorkOrderStatus.DISPATCHED;
    if (step.isStart) return WorkOrderStatus.IN_PROGRESS;
    if (step.isTerminalPositive) return WorkOrderStatus.COMPLETED_POSITIVE;
    if (step.isTerminalNegative) return WorkOrderStatus.COMPLETED_NEGATIVE;

    // Code-based heuristic for the standard process
    if (step.code === 100) return WorkOrderStatus.ASSIGNED;
    if (step.code === 300) return WorkOrderStatus.EN_ROUTE;

    // Unknown mapping — caller must not change the existing status
    return null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolves the CachedProcess for a WorkOrder, using in priority:
   *  1. workOrder.processDefinitionId (already linked)
   *  2. workOrder.taskTypeId (derive from task-type → process mapping)
   *  3. Default process
   */
  private async resolveProcessForWorkOrder(
    workOrder: Pick<WorkOrderForTransition, 'processDefinitionId' | 'taskTypeId'>,
  ): Promise<CachedProcess> {
    if (workOrder.processDefinitionId) {
      return this.processCache.getProcess(workOrder.processDefinitionId);
    }
    if (workOrder.taskTypeId) {
      return this.processCache.getProcessForTaskType(workOrder.taskTypeId);
    }
    return this.processCache.getDefaultProcess();
  }

  /**
   * Throws BadRequestException for any required field that is missing or blank
   * in the provided payload.
   */
  private validateRequiredFields(
    requiredFields: string[],
    payload: TransitionPayload,
    transitionLabel?: string,
  ): void {
    const label = transitionLabel ? ` pour la transition "${transitionLabel}"` : '';

    for (const field of requiredFields) {
      switch (field) {
        case 'assignedToId':
          if (!payload.assignedToId?.trim()) {
            throw new BadRequestException(
              `Le champ "assignedToId" est obligatoire${label}`,
            );
          }
          break;

        case 'negativeReason':
          if (!payload.negativeReason?.trim()) {
            throw new BadRequestException(
              `Le champ "negativeReason" est obligatoire${label}`,
            );
          }
          break;

        case 'completionNotes':
          if (!payload.completionNotes?.trim()) {
            throw new BadRequestException(
              `Le champ "completionNotes" est obligatoire${label}`,
            );
          }
          break;

        case 'reopenReason':
          if (!payload.reopenReason?.trim()) {
            throw new BadRequestException(
              `Le champ "reopenReason" est obligatoire${label}`,
            );
          }
          break;

        default:
          this.logger.warn(
            `Champ requis inconnu : "${field}" dans la transition${label} — ignoré`,
          );
      }
    }
  }

  /**
   * Builds the Prisma WorkOrderUpdateInput for the given target status.
   *
   * Side-effects applied automatically based on status flags:
   * - isDispatch         → dispatchedAt = now
   * - isStart            → actualStartTime = now (only if not already set)
   * - isTerminalPositive | isTerminalNegative → actualEndTime = now
   * - isInitial          → reset all execution timestamps + completion data,
   *                        disconnect the technician assignment
   *
   * Payload assignments are applied AFTER flag-based side-effects so that
   * explicit caller values always win over automatic resets.
   */
  private buildUpdateData(
    workOrder: Pick<WorkOrderForTransition, 'status' | 'actualStartTime'>,
    targetStatus: CachedStatus,
    payload: TransitionPayload,
  ): Prisma.WorkOrderUpdateInput {
    const legacyStatus = this.mapToLegacyStatus(targetStatus);

    const data: Prisma.WorkOrderUpdateInput = {
      // Always advance the process step
      currentStep: { connect: { id: targetStatus.id } },
      // Update legacy status column only when a mapping exists
      ...(legacyStatus !== null && { status: legacyStatus }),
    };

    // ── Flag-based side-effects ──────────────────────────────────────────────

    if (targetStatus.isDispatch) {
      data.dispatchedAt = new Date();
    }

    if (targetStatus.isStart && !workOrder.actualStartTime) {
      data.actualStartTime = new Date();
    }

    if (targetStatus.isTerminalPositive || targetStatus.isTerminalNegative) {
      data.actualEndTime = new Date();
    }

    if (targetStatus.isInitial) {
      // Full reset when reopening a work order
      data.actualStartTime = null;
      data.actualEndTime = null;
      data.dispatchedAt = null;
      data.completionNotes = null;
      data.negativeReason = null;
      // Remove previous technician assignment on reopen
      data.assignedTo = { disconnect: true };
    }

    // ── Payload field assignments (override resets when explicitly provided) ──

    if (payload.assignedToId) {
      // connect wins over the disconnect set in the isInitial block above
      data.assignedTo = { connect: { id: payload.assignedToId } };
    }

    if (payload.negativeReason !== undefined) {
      data.negativeReason = payload.negativeReason;
    }

    if (payload.completionNotes !== undefined) {
      data.completionNotes = payload.completionNotes;
    }

    // reopenReason is intentionally NOT persisted (used only for required-field
    // validation / audit purposes consistent with the existing service).

    return data;
  }
}
