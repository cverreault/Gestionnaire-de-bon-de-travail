import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Role, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RemindersService } from '../reminders/application/reminders.service';
import { ProcessEngineService } from '../process/process-engine.service';
import { ProcessCacheService } from '../process/process-cache.service';
import { WORK_ORDER_DETAIL_INCLUDE } from './work-order-includes';
import { filterTemplateForUser } from '../templates/templates.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { WorkOrderFilterDto } from './dto/work-order-filter.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { AssignAndDispatchDto } from './dto/assign-and-dispatch.dto';
import { isValidTransition } from './types/status-transitions';
import {
  WO_EVENT_NAMES,
  workOrderCreated,
  workOrderRequested,
  workOrderAssigned,
  workOrderDispatched,
  workOrderStatusChanged,
  workOrderCompleted,
} from './domain/events/work-order-events';
import { toCsv } from '../../common/utils/csv.util';

/** Shape of the authenticated user passed from the controller */
export interface CurrentUserRef {
  id: string;
  role: Role;
}

/**
 * Apply template RBAC to a loaded work order: strip out sections/fields the
 * user isn't allowed to view. ADMIN bypasses. Returns the workOrder unchanged
 * if no template is attached.
 */
function applyTemplateRbac<T extends { taskType?: { template?: unknown | null } | null }>(
  workOrder: T,
  role: Role | undefined,
): T {
  if (!role) return workOrder;
  const tpl = workOrder.taskType?.template as
    | { sections: Array<{ viewRoles: Role[]; fields: Array<{ viewRoles: Role[] }> }> }
    | null
    | undefined;
  if (!tpl) return workOrder;
  return {
    ...workOrder,
    taskType: {
      ...workOrder.taskType,
      template: filterTemplateForUser(tpl as Parameters<typeof filterTemplateForUser>[0], role),
    },
  } as T;
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processEngine: ProcessEngineService,
    private readonly processCache: ProcessCacheService,
    private readonly eventEmitter: EventEmitter2,
    private readonly reminders: RemindersService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Generates a unique reference number in the format PREFIX-YYYYMMDD-XXXX.
   * The prefix comes from the TaskType if a taskTypeId is provided, otherwise defaults to 'BT'.
   * The sequence counter resets every day per prefix.
   */
  private async generateReferenceNumber(taskTypeId?: string): Promise<string> {
    let prefixCode = 'BT';
    if (taskTypeId) {
      const taskType = await this.prisma.taskType.findUnique({
        where: { id: taskTypeId },
        select: { prefix: true },
      });
      if (taskType?.prefix) {
        prefixCode = taskType.prefix;
      }
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const prefix = `${prefixCode}-${dateStr}-`;

    // Find the highest sequence for today to derive the next one
    const lastOrder = await this.prisma.workOrder.findFirst({
      where: { referenceNumber: { startsWith: prefix } },
      orderBy: { referenceNumber: 'desc' },
      select: { referenceNumber: true },
    });

    let sequence = 1;
    if (lastOrder) {
      const parts = lastOrder.referenceNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  /** Shared include block for list responses (lightweight). */
  private get listInclude() {
    return {
      assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      temporaryClient: true,
      client: true,
      clientAddress_rel: true,
      taskType: true,
      _count: { select: { notes: true, attachments: true } },
      // Process-engine column
      currentStep: true,
    };
  }

  // ── Work Orders CRUD ───────────────────────────────────────────────────────

  async findAll(filters: WorkOrderFilterDto, currentUser: CurrentUserRef) {
    const {
      status,
      type,
      assignedToId,
      scheduledDateFrom,
      scheduledDateTo,
      priorityMin,
      search,
      clientId,
      taskTypeId,
      excludeCompleted,
      slaBreached,
      page = 1,
      limit = 20,
    } = filters;

    const where: Prisma.WorkOrderWhereInput = {};

    // Technicians only see their own work orders
    if (currentUser.role === Role.TECHNICIAN) {
      where.assignedToId = currentUser.id;
    } else if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    if (status) {
      where.status = status;
    } else if (excludeCompleted) {
      where.status = { notIn: [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.COMPLETED_NEGATIVE] };
    }
    if (type) where.type = type;
    if (clientId) where.clientId = clientId;
    if (taskTypeId) where.taskTypeId = taskTypeId;

    if (scheduledDateFrom || scheduledDateTo) {
      where.scheduledDate = {
        ...(scheduledDateFrom ? { gte: new Date(scheduledDateFrom) } : {}),
        ...(scheduledDateTo ? { lte: new Date(scheduledDateTo) } : {}),
      };
    }

    if (priorityMin !== undefined) {
      where.priority = { gte: priorityMin };
    }

    if (slaBreached) {
      where.slaBreachedAt = { not: null };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { referenceNumber: { contains: search, mode: 'insensitive' } },
        { externalClientName: { contains: search, mode: 'insensitive' } },
        { clientAddress: { contains: search, mode: 'insensitive' } },
        {
          temporaryClient: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { scheduledDate: 'asc' },
          { createdAt: 'desc' },
        ],
        include: this.listInclude,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Build the same Prisma `where` as findAll, minus pagination.
   * Reused for CSV export so users see exactly what the list shows.
   */
  private buildWorkOrderWhere(
    filters: WorkOrderFilterDto,
    currentUser: CurrentUserRef,
  ): Prisma.WorkOrderWhereInput {
    const where: Prisma.WorkOrderWhereInput = {};

    if (currentUser.role === Role.TECHNICIAN) {
      where.assignedToId = currentUser.id;
    } else if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    if (filters.status) {
      where.status = filters.status;
    } else if (filters.excludeCompleted) {
      where.status = {
        notIn: [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.COMPLETED_NEGATIVE],
      };
    }
    if (filters.type) where.type = filters.type;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.taskTypeId) where.taskTypeId = filters.taskTypeId;

    if (filters.scheduledDateFrom || filters.scheduledDateTo) {
      where.scheduledDate = {
        ...(filters.scheduledDateFrom ? { gte: new Date(filters.scheduledDateFrom) } : {}),
        ...(filters.scheduledDateTo ? { lte: new Date(filters.scheduledDateTo) } : {}),
      };
    }

    if (filters.priorityMin !== undefined) {
      where.priority = { gte: filters.priorityMin };
    }

    if (filters.slaBreached) {
      where.slaBreachedAt = { not: null };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { referenceNumber: { contains: filters.search, mode: 'insensitive' } },
        { externalClientName: { contains: filters.search, mode: 'insensitive' } },
        { clientAddress: { contains: filters.search, mode: 'insensitive' } },
        {
          temporaryClient: {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    return where;
  }

  /**
   * Export the same list the user sees (with active filters) as a CSV string.
   * Capped at 5000 rows to avoid OOM on a runaway query.
   */
  async exportCsv(
    filters: WorkOrderFilterDto,
    currentUser: CurrentUserRef,
  ): Promise<string> {
    const MAX_ROWS = 5000;
    const where = this.buildWorkOrderWhere(filters, currentUser);

    const rows = await this.prisma.workOrder.findMany({
      where,
      take: MAX_ROWS,
      orderBy: [
        { priority: 'desc' },
        { scheduledDate: 'asc' },
        { createdAt: 'desc' },
      ],
      include: this.listInclude,
    });

    return toCsv(rows as Array<Record<string, unknown>>, [
      { header: 'Référence',     pick: (r: any) => r.referenceNumber },
      { header: 'Titre',         pick: (r: any) => r.title },
      { header: 'Statut',        pick: (r: any) => r.currentStep?.name ?? r.status },
      { header: 'Type',          pick: (r: any) => r.type },
      { header: 'Priorité',      pick: (r: any) => r.priority },
      { header: 'Client',        pick: (r: any) =>
          r.client?.name
          ?? (r.temporaryClient
              ? `${r.temporaryClient.firstName ?? ''} ${r.temporaryClient.lastName ?? ''}`.trim()
              : r.externalClientName ?? ''),
      },
      { header: 'Adresse',       pick: (r: any) =>
          r.clientAddress_rel
            ? [r.clientAddress_rel.street, r.clientAddress_rel.city, r.clientAddress_rel.postalCode]
                .filter(Boolean).join(', ')
            : r.clientAddress ?? '',
      },
      { header: 'Technicien',    pick: (r: any) => r.assignedTo
          ? `${r.assignedTo.firstName ?? ''} ${r.assignedTo.lastName ?? ''}`.trim()
          : '' },
      { header: 'Créé par',      pick: (r: any) => r.createdBy
          ? `${r.createdBy.firstName ?? ''} ${r.createdBy.lastName ?? ''}`.trim()
          : '' },
      { header: 'Date planifiée',pick: (r: any) => r.scheduledDate ?? '' },
      { header: 'Créé le',       pick: (r: any) => r.createdAt },
      { header: 'Complété le',   pick: (r: any) => r.completedAt ?? '' },
      { header: 'Notes complétion', pick: (r: any) => r.completionNotes ?? '' },
      { header: 'Raison négative',  pick: (r: any) => r.negativeReason ?? '' },
    ]);
  }

  async findOne(id: string, currentUser?: CurrentUserRef) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: WORK_ORDER_DETAIL_INCLUDE,
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${id} introuvable`);
    }

    // Technicians can only view their own work orders (IDOR protection)
    if (
      currentUser?.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que vos propres bons de travail',
      );
    }

    return applyTemplateRbac(workOrder, currentUser?.role);
  }

  async create(
    dto: CreateWorkOrderDto,
    currentUser: CurrentUserRef,
    options?: { asRequest?: boolean },
  ) {
    const asRequest = options?.asRequest === true;
    const referenceNumber = await this.generateReferenceNumber(dto.taskTypeId);

    // ── Resolve process engine initial step ──────────────────────────────────
    // Best-effort: if no process is configured, we gracefully fall back to
    // the legacy behaviour (no processDefinitionId / currentStepId set).
    let processDefinitionId: string | null = null;
    let currentStepId: string | null = null;
    let engineLegacyStatus: WorkOrderStatus | null = null;

    try {
      const resolvedProcess = dto.taskTypeId
        ? await this.processCache.getProcessForTaskType(dto.taskTypeId)
        : await this.processCache.getDefaultProcess();

      processDefinitionId = resolvedProcess.id;
      // B21 — portal work requests park at the pre-approval « Demandé »
      // step; every other creation starts at the normal initial step.
      if (asRequest) {
        if (!resolvedProcess.requestedStatus) {
          throw new ConflictException(
            'Ce processus n\'a pas de statut « Demandé » — impossible de soumettre une demande.',
          );
        }
        currentStepId = resolvedProcess.requestedStatus.id;
        engineLegacyStatus = this.processEngine.mapToLegacyStatus(resolvedProcess.requestedStatus);
      } else {
        currentStepId = resolvedProcess.initialStatus.id;
        engineLegacyStatus = this.processEngine.mapToLegacyStatus(resolvedProcess.initialStatus);
      }

      // FIX 6: When assignedToId is provided, advance currentStepId to the ASSIGNED
      // step (code=100) so that status and currentStepId stay consistent.
      if (dto.assignedToId && !asRequest) {
        const assignedStep = resolvedProcess.statusByCode.get(100);
        if (assignedStep) {
          currentStepId = assignedStep.id;
          engineLegacyStatus = this.processEngine.mapToLegacyStatus(assignedStep);
        }
      }
    } catch (err: unknown) {
      // A request without a « Demandé » step is a hard error, not a fallback.
      if (err instanceof ConflictException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Impossible de résoudre le processus à la création du BT (taskTypeId=${dto.taskTypeId ?? 'N/A'}): ${message}`,
      );
      // Fallback: no process data — columns stay null
      if (asRequest) {
        throw new ConflictException(
          'Aucun processus configuré — impossible de soumettre une demande.',
        );
      }
    }

    // Legacy status: preserve the existing "jump to ASSIGNED when a technician
    // is provided at creation" shortcut for backward compatibility.
    // NOTE: this may create a mismatch between `status` (ASSIGNED) and
    // `currentStepId` (initial step) for BTs created with an assignedToId.
    // The process engine uses `currentStepId` for routing; the `status` column
    // is kept in sync for legacy API consumers.
    const initialStatus = asRequest
      ? WorkOrderStatus.REQUESTED
      : dto.assignedToId
        ? WorkOrderStatus.ASSIGNED
        : (engineLegacyStatus ?? WorkOrderStatus.CREATED);

    // ── SLA target (B4) ─────────────────────────────────────────────────────
    // Computed once at create time from the resolved task type's slaHours.
    // Null if no task type or the type has no SLA configured. Immutable
    // after creation — re-classifying a BT to a different type doesn't
    // shift the deadline.
    let slaTargetAt: Date | null = null;
    if (dto.taskTypeId) {
      const taskType = await this.prisma.taskType.findUnique({
        where: { id: dto.taskTypeId },
        select: { slaHours: true },
      });
      if (taskType?.slaHours) {
        slaTargetAt = new Date(Date.now() + taskType.slaHours * 60 * 60 * 1000);
      }
    }

    const workOrder = await this.prisma.workOrder.create({
      data: {
        referenceNumber,
        status: initialStatus,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        priority: dto.priority ?? 0,
        slaTargetAt,
        temporaryClientId: dto.temporaryClientId ?? null,
        externalClientId: dto.externalClientId ?? null,
        externalClientName: dto.externalClientName ?? null,
        clientAddress: dto.clientAddress ?? null,
        // V3 relations
        clientId: dto.clientId ?? null,
        clientAddressId: dto.clientAddressId ?? null,
        taskTypeId: dto.taskTypeId ?? null,
        assignedToId: dto.assignedToId ?? null,
        createdById: currentUser.id,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        scheduledStartTime: dto.scheduledStartTime ? new Date(dto.scheduledStartTime) : null,
        scheduledEndTime: dto.scheduledEndTime ? new Date(dto.scheduledEndTime) : null,
        // Process-engine columns (may be null when no process is configured)
        processDefinitionId,
        currentStepId,
        // Template data (filled values for the form template fields)
        templateData: (dto.templateData ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      include: WORK_ORDER_DETAIL_INCLUDE,
    });

    this.logger.log(`WorkOrder created: ${workOrder.referenceNumber} by user ${currentUser.id}`);

    // ── Domain events ────────────────────────────────────────────────────
    const created = workOrderCreated(workOrder.id, currentUser.id, {
      referenceNumber: workOrder.referenceNumber,
      taskTypeId: workOrder.taskTypeId,
      clientId: workOrder.clientId,
      assignedToId: workOrder.assignedToId,
      processDefinitionId: workOrder.processDefinitionId,
      initialStatusId: workOrder.currentStepId,
    });
    this.eventEmitter.emit(WO_EVENT_NAMES.CREATED, created);

    // B21 — signal the pre-approval request so admins get notified.
    if (asRequest) {
      const requested = workOrderRequested(workOrder.id, currentUser.id, {
        referenceNumber: workOrder.referenceNumber,
        title: workOrder.title,
        taskTypeId: workOrder.taskTypeId,
        clientId: workOrder.clientId,
      });
      this.eventEmitter.emit(WO_EVENT_NAMES.REQUESTED, requested);
    }

    // B15 — auto-schedule reminders when the WO has a scheduled date.
    // Fire-and-forget: any error is logged, doesn't break the create call.
    if (workOrder.scheduledDate) {
      this.reminders
        .scheduleDefaultsForWorkOrder(
          workOrder.tenantId,
          workOrder.id,
          workOrder.scheduledDate,
          currentUser.id,
        )
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Failed to schedule default reminders for WO ${workOrder.id}: ${msg}`,
          );
        });
    }

    // Si le BT démarre déjà sur le statut "Assigné" (shortcut createWithAssignment),
    // on émet aussi l'event assigned pour ne pas le rater côté consommateurs.
    if (workOrder.assignedToId) {
      const assigned = workOrderAssigned(workOrder.id, currentUser.id, {
        technicianId: workOrder.assignedToId,
        previousTechnicianId: null,
      });
      this.eventEmitter.emit(WO_EVENT_NAMES.ASSIGNED, assigned);
    }

    return workOrder;
  }

  /**
   * Clone an existing work order into a brand-new one.
   *
   * Carries over: title, description, type, priority, client/address relations
   * (or temporary/external fallbacks), task type, and templateData.
   *
   * Does NOT carry over: assignedToId, scheduledDate(/Start/End), notes,
   * attachments, completionNotes, negativeReason, completedAt, history.
   *
   * The new BT gets a fresh reference number, status CREATED, and the
   * current user becomes the creator. ADMIN + DISPATCHER only at the
   * controller level.
   */
  async duplicate(id: string, currentUser: CurrentUserRef) {
    const source = await this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        temporaryClientId: true,
        externalClientId: true,
        externalClientName: true,
        clientAddress: true,
        clientId: true,
        clientAddressId: true,
        taskTypeId: true,
        templateData: true,
      },
    });

    if (!source) {
      throw new NotFoundException(`Bon de travail #${id} introuvable`);
    }

    const dto: CreateWorkOrderDto = {
      title: source.title,
      description: source.description ?? undefined,
      type: source.type,
      priority: source.priority ?? 0,
      temporaryClientId: source.temporaryClientId ?? undefined,
      externalClientId: source.externalClientId ?? undefined,
      externalClientName: source.externalClientName ?? undefined,
      clientAddress: source.clientAddress ?? undefined,
      clientId: source.clientId ?? undefined,
      clientAddressId: source.clientAddressId ?? undefined,
      taskTypeId: source.taskTypeId ?? undefined,
      templateData: (source.templateData as Record<string, unknown> | null) ?? undefined,
    };

    const clone = await this.create(dto, currentUser);
    this.logger.log(
      `WorkOrder duplicated: source=${source.id} → new=${clone.id} (${clone.referenceNumber}) by user ${currentUser.id}`,
    );
    return clone;
  }

  async update(id: string, dto: UpdateWorkOrderDto, currentUser: CurrentUserRef) {
    // Ensure the work order exists — pass currentUser to enforce the IDOR check for technicians
    const existingWo = await this.findOne(id, currentUser);

    // Technicians may only update completionNotes / negativeReason / templateData
    // (templateData entries are then validated field-by-field against the template's
    // editRoles below — a tech can submit values only for fields they may edit).
    if (currentUser.role === Role.TECHNICIAN) {
      const allowedForTechnician: (keyof UpdateWorkOrderDto)[] = [
        'completionNotes',
        'negativeReason',
        'templateData',
      ];
      const requestedFields = Object.keys(dto) as (keyof UpdateWorkOrderDto)[];
      const forbidden = requestedFields.filter(
        (f) => !allowedForTechnician.includes(f),
      );
      if (forbidden.length > 0) {
        throw new ForbiddenException(
          `Un technicien ne peut modifier que : ${allowedForTechnician.join(', ')}`,
        );
      }
    }

    // ── Template RBAC validation on templateData writes ─────────────────────
    // For non-ADMIN users, every field whose value is changing must be in
    // field.editRoles, and every field requiredRoles.includes(role) must have
    // a non-empty value.
    if (dto.templateData !== undefined && currentUser.role !== Role.ADMIN) {
      const existingData = (existingWo as { templateData?: Record<string, unknown> | null }).templateData ?? {};
      const newData = dto.templateData ?? {};
      const template = (existingWo as {
        taskType?: { template?: {
          sections?: Array<{
            fields: Array<{ id: string; label: string; editRoles: Role[]; requiredRoles: Role[] }>;
          }>;
        } | null } | null;
      }).taskType?.template;
      const fields = template?.sections?.flatMap((s) => s.fields) ?? [];
      const byId = new Map(fields.map((f) => [f.id, f] as const));

      for (const [fid, value] of Object.entries(newData)) {
        const f = byId.get(fid);
        if (!f) continue; // unknown fieldId — silently ignored, kept in JSON
        const prev = (existingData as Record<string, unknown>)[fid];
        const changed = JSON.stringify(prev ?? null) !== JSON.stringify(value ?? null);
        if (changed && !f.editRoles.includes(currentUser.role)) {
          throw new ForbiddenException(
            `Champ « ${f.label} » non modifiable pour votre rôle.`,
          );
        }
      }
      // Required check (only for fields requiredRoles for this role)
      const isEmptyValue = (v: unknown): boolean => {
        if (v === undefined || v === null || v === '') return true;
        if (Array.isArray(v) && v.length === 0) return true;
        // GPS payload: { lat, lng } — empty if both are missing
        if (typeof v === 'object' && v !== null && 'lat' in v && 'lng' in v) {
          const g = v as { lat: unknown; lng: unknown };
          const latEmpty = g.lat === null || g.lat === undefined || g.lat === '';
          const lngEmpty = g.lng === null || g.lng === undefined || g.lng === '';
          return latEmpty && lngEmpty;
        }
        return false;
      };
      for (const f of fields) {
        if (!f.requiredRoles.includes(currentUser.role)) continue;
        const v = (newData as Record<string, unknown>)[f.id];
        if (isEmptyValue(v)) {
          throw new BadRequestException(
            `Champ « ${f.label} » requis pour votre rôle.`,
          );
        }
      }
    }

    // ── Reassign logic : ADMIN/DISPATCHER can force status to ASSIGNED ────
    // When status=ASSIGNED is explicitly passed, this is a reassignment.
    // We reset execution-related fields so the new technician starts fresh.
    if (
      dto.status === WorkOrderStatus.ASSIGNED &&
      (currentUser.role === Role.ADMIN || currentUser.role === Role.DISPATCHER)
    ) {
      if (!dto.assignedToId) {
        throw new BadRequestException(
          'assignedToId est obligatoire pour réassigner un bon de travail',
        );
      }

      const updated = await this.prisma.workOrder.update({
        where: { id },
        data: {
          status: WorkOrderStatus.ASSIGNED,
          assignedTo: { connect: { id: dto.assignedToId } },
          dispatchedAt: null,
          actualStartTime: null,
          actualEndTime: null,
          completionNotes: null,
          negativeReason: null,
        },
        include: WORK_ORDER_DETAIL_INCLUDE,
      });

      this.logger.log(
        `WorkOrder ${updated.referenceNumber}: réassigné (${existingWo.status} → ASSIGNED) vers technicien ${dto.assignedToId} par user ${currentUser.id}`,
      );

      return updated;
    }

    // ── Interdire le changement de statut pour les techniciens via update ──
    if (dto.status !== undefined && currentUser.role === Role.TECHNICIAN) {
      throw new ForbiddenException(
        'Un technicien ne peut pas changer le statut via cette route. Utilisez la route de transition.',
      );
    }

    const data: Prisma.WorkOrderUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.temporaryClientId !== undefined) {
      data.temporaryClient = dto.temporaryClientId
        ? { connect: { id: dto.temporaryClientId } }
        : { disconnect: true };
    }
    if (dto.clientId !== undefined) {
      data.client = dto.clientId
        ? { connect: { id: dto.clientId } }
        : { disconnect: true };
    }
    if (dto.clientAddressId !== undefined) {
      data.clientAddress_rel = dto.clientAddressId
        ? { connect: { id: dto.clientAddressId } }
        : { disconnect: true };
    }
    if (dto.taskTypeId !== undefined) {
      data.taskType = dto.taskTypeId
        ? { connect: { id: dto.taskTypeId } }
        : { disconnect: true };
    }
    if (dto.externalClientId !== undefined) data.externalClientId = dto.externalClientId;
    if (dto.externalClientName !== undefined) data.externalClientName = dto.externalClientName;
    if (dto.clientAddress !== undefined) data.clientAddress = dto.clientAddress;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    if (dto.scheduledDate !== undefined) {
      data.scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
    }
    if (dto.scheduledStartTime !== undefined) {
      data.scheduledStartTime = dto.scheduledStartTime ? new Date(dto.scheduledStartTime) : null;
    }
    if (dto.scheduledEndTime !== undefined) {
      data.scheduledEndTime = dto.scheduledEndTime ? new Date(dto.scheduledEndTime) : null;
    }
    if (dto.completionNotes !== undefined) data.completionNotes = dto.completionNotes;
    if (dto.negativeReason !== undefined) data.negativeReason = dto.negativeReason;
    if (dto.templateData !== undefined) {
      data.templateData = (dto.templateData ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data,
      include: WORK_ORDER_DETAIL_INCLUDE,
    });
    return applyTemplateRbac(updated, currentUser.role);
  }

  // ── Status transitions ─────────────────────────────────────────────────────

  /**
   * Public entry point for status transitions.
   *
   * Routing logic:
   *  1. `targetStepId` provided  → delegate entirely to ProcessEngineService (dynamic mode).
   *  2. `status` enum provided   → resolve to the matching ProcessStatus code, then delegate
   *                                 to ProcessEngineService (legacy-enum-to-dynamic bridge).
   *  3. `status` enum provided but no process configured on this BT
   *                              → fallback to the legacy hardcoded state-machine.
   *  4. Neither provided         → BadRequestException (validated by DTO constraint, safety net).
   */
  async transition(
    id: string,
    dto: TransitionStatusDto,
    currentUser: CurrentUserRef,
  ) {
    // ── Mode dynamique : targetStepId fourni ──────────────────────────────────
    if (dto.targetStepId) {
      return this.processEngine.executeTransition(
        id,
        dto.targetStepId,
        currentUser,
        {
          assignedToId: dto.assignedToId,
          negativeReason: dto.negativeReason,
          completionNotes: dto.completionNotes,
          reopenReason: dto.reopenReason,
          expectedUpdatedAt: dto.expectedUpdatedAt,
        },
      );
    }

    // ── Mode legacy : status enum fourni ─────────────────────────────────────
    if (dto.status) {
      // Load processDefinitionId to check whether a process is configured
      const wo = await this.prisma.workOrder.findUnique({
        where: { id },
        select: { processDefinitionId: true },
      });

      if (!wo) {
        throw new NotFoundException(`Bon de travail #${id} introuvable`);
      }

      if (wo.processDefinitionId) {
        // Bridge: resolve the legacy enum → ProcessStatus code → targetStepId
        const process = await this.processCache.getProcess(wo.processDefinitionId);

        const legacyToCode: Record<string, number> = {
          CREATED: 0,
          ASSIGNED: 100,
          DISPATCHED: 200,
          EN_ROUTE: 300,
          IN_PROGRESS: 400,
          COMPLETED_POSITIVE: 500,
          COMPLETED_NEGATIVE: 600,
        };

        const code = legacyToCode[dto.status];
        const targetStep = code !== undefined ? process.statusByCode.get(code) : undefined;

        if (targetStep) {
          return this.processEngine.executeTransition(
            id,
            targetStep.id,
            currentUser,
            {
              assignedToId: dto.assignedToId,
              negativeReason: dto.negativeReason,
              completionNotes: dto.completionNotes,
              reopenReason: dto.reopenReason,
              expectedUpdatedAt: dto.expectedUpdatedAt,
            },
          );
        }

        // BT has a processDefinitionId but the requested status has no matching
        // ProcessStatus code — reject instead of silently bypassing process rules.
        throw new BadRequestException(
          `Statut "${dto.status}" non résolu dans le processus actif. Utilisez targetStepId.`,
        );
      }

      // Fallback: BT sans processus configuré → logique legacy
      return this.legacyTransition(id, dto, currentUser);
    }

    // Safety net — the DTO-level @Validate constraint should prevent reaching here
    throw new BadRequestException(
      'targetStepId ou status est requis pour déclencher une transition',
    );
  }

  /**
   * Legacy transition logic — preserved as a private fallback for WorkOrders
   * that have not yet been backfilled with a processDefinitionId.
   *
   * @deprecated Use the ProcessEngineService path (targetStepId) instead.
   */
  private async legacyTransition(
    id: string,
    dto: TransitionStatusDto,
    currentUser: CurrentUserRef,
  ) {
    // This method is only called when dto.status is defined (guaranteed by the
    // public transition() dispatcher above).
    if (!dto.status) {
      throw new BadRequestException(
        '[legacyTransition] status est requis — ceci ne devrait pas arriver.',
      );
    }
    const targetStatus = dto.status;

    // ── Optimistic locking ─────────────────────────────────────────────────
    if (dto.expectedUpdatedAt) {
      const current = await this.prisma.workOrder.findUnique({
        where: { id },
        select: { updatedAt: true },
      });
      if (current && current.updatedAt.toISOString() !== dto.expectedUpdatedAt) {
        throw new ConflictException({
          code: 'OPTIMISTIC_LOCK_CONFLICT',
          message: 'The work order was modified since you last fetched it.',
          currentUpdatedAt: current.updatedAt.toISOString(),
          expectedUpdatedAt: dto.expectedUpdatedAt,
        });
      }
    }

    // Fetch current state (lean query for validation)
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        assignedToId: true,
        actualStartTime: true,
      },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${id} introuvable`);
    }

    // Technicians can only transition their own work orders
    if (
      currentUser.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez transitionner que vos propres bons de travail',
      );
    }

    // Ré-ouverture COMPLETED_NEGATIVE : ADMIN et DISPATCHER seulement
    if (
      workOrder.status === WorkOrderStatus.COMPLETED_NEGATIVE &&
      targetStatus === WorkOrderStatus.CREATED &&
      currentUser.role === Role.TECHNICIAN
    ) {
      throw new ForbiddenException(
        'Seul un administrateur ou répartiteur peut ré-ouvrir un BT terminé négativement',
      );
    }

    // Admin can perform ANY transition — skip validation
    if (currentUser.role !== Role.ADMIN) {
      if (!isValidTransition(workOrder.status, targetStatus)) {
        throw new BadRequestException(
          `Transition invalide : ${workOrder.status} → ${targetStatus}`,
        );
      }
    }

    // ── Per-transition business rules ────────────────────────────────────────

    // CREATED → ASSIGNED requires an assignedToId
    if (targetStatus === WorkOrderStatus.ASSIGNED) {
      const resolvedAssignee = dto.assignedToId ?? workOrder.assignedToId;
      if (!resolvedAssignee) {
        throw new BadRequestException(
          'assignedToId est obligatoire pour la transition vers ASSIGNED',
        );
      }
    }

    // IN_PROGRESS → COMPLETED_NEGATIVE requires a negativeReason
    if (
      targetStatus === WorkOrderStatus.COMPLETED_NEGATIVE &&
      !dto.negativeReason?.trim()
    ) {
      throw new BadRequestException(
        'negativeReason est obligatoire pour passer en COMPLETED_NEGATIVE',
      );
    }

    // COMPLETED_POSITIVE → CREATED : admin re-open
    if (
      workOrder.status === WorkOrderStatus.COMPLETED_POSITIVE &&
      targetStatus === WorkOrderStatus.CREATED
    ) {
      // Only admins may re-open a successfully completed work order
      if (currentUser.role !== Role.ADMIN) {
        throw new ForbiddenException(
          'Seul un administrateur peut ré-ouvrir un bon de travail clôturé positivement',
        );
      }
      // A reopen reason is mandatory for audit purposes
      if (!dto.reopenReason?.trim()) {
        throw new BadRequestException(
          'reopenReason est obligatoire pour ré-ouvrir un bon de travail COMPLETED_POSITIVE',
        );
      }
    }

    // ── Build update payload ─────────────────────────────────────────────────

    const data: Prisma.WorkOrderUpdateInput = { status: targetStatus };

    switch (targetStatus) {
      case WorkOrderStatus.ASSIGNED: {
        if (dto.assignedToId) {
          data.assignedTo = { connect: { id: dto.assignedToId } };
        }
        break;
      }

      case WorkOrderStatus.CREATED: {
        // ASSIGNED → CREATED : remove assignment
        if (workOrder.status === WorkOrderStatus.ASSIGNED) {
          data.assignedTo = { disconnect: true };
        }
        // COMPLETED_NEGATIVE → CREATED : re-open a failed work order, clear completion data
        if (workOrder.status === WorkOrderStatus.COMPLETED_NEGATIVE) {
          data.negativeReason = null;
          data.completionNotes = null;
          data.actualEndTime = null;
          data.actualStartTime = null;
          data.assignedTo = { disconnect: true };
        }
        // COMPLETED_POSITIVE → CREATED : admin re-opens a successfully completed work order.
        // All execution timestamps and completion data are cleared; reopenReason is already
        // logged by the Logger above for audit purposes.
        if (workOrder.status === WorkOrderStatus.COMPLETED_POSITIVE) {
          data.completionNotes = null;
          data.actualEndTime = null;
          data.actualStartTime = null;
          data.assignedTo = { disconnect: true };
        }
        break;
      }

      case WorkOrderStatus.DISPATCHED: {
        data.dispatchedAt = new Date();
        break;
      }

      case WorkOrderStatus.EN_ROUTE: {
        // No special data to record — just a status change
        break;
      }

      case WorkOrderStatus.IN_PROGRESS: {
        // Record actual start time only if not already set
        if (!workOrder.actualStartTime) {
          data.actualStartTime = new Date();
        }
        break;
      }

      case WorkOrderStatus.COMPLETED_POSITIVE:
      case WorkOrderStatus.COMPLETED_NEGATIVE: {
        data.actualEndTime = new Date();
        if (dto.completionNotes) data.completionNotes = dto.completionNotes;
        if (dto.negativeReason) data.negativeReason = dto.negativeReason;
        break;
      }
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data,
      include: WORK_ORDER_DETAIL_INCLUDE,
    });

    this.logger.log(
      `WorkOrder ${updated.referenceNumber}: ${workOrder.status} → ${targetStatus} by user ${currentUser.id} [legacy path]`,
    );

    return updated;
  }

  // ── Assign & Dispatch ──────────────────────────────────────────────────────

  /**
   * Assigne un technicien et passe directement le BT en statut DISPATCHED,
   * en une seule opération atomique.
   * Accessible aux ADMIN et DISPATCHER.
   *
   * Maintient en double-écriture les colonnes legacy (`status`, `dispatchedAt`)
   * ET les colonnes process-engine (`currentStepId`) quand un processus est configuré.
   */
  async assignAndDispatch(
    id: string,
    dto: AssignAndDispatchDto,
    userId: string,
  ) {
    // Vérifier que le technicien existe, est actif et a le rôle TECHNICIAN
    const tech = await this.prisma.user.findUnique({
      where: { id: dto.technicianId },
    });
    if (!tech || !tech.isActive || tech.role !== 'TECHNICIAN') {
      throw new NotFoundException('Technicien introuvable ou inactif');
    }

    // Vérifier le BT existe et est dans un statut compatible
    const wo = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!wo) {
      throw new NotFoundException(`Bon de travail #${id} introuvable`);
    }
    if (!([WorkOrderStatus.CREATED, WorkOrderStatus.ASSIGNED] as WorkOrderStatus[]).includes(wo.status)) {
      throw new BadRequestException(
        `Le bon de travail doit être en statut CREATED ou ASSIGNED pour être dispatché (statut actuel : ${wo.status})`,
      );
    }

    // ── Résoudre le currentStepId du step DISPATCHED via le process engine ──
    // Double-écriture : on met à jour currentStepId en même temps que status.
    let dispatchStepId: string | null = null;
    if (wo.processDefinitionId) {
      try {
        const process = await this.processCache.getProcess(wo.processDefinitionId);
        const dispatchStep = process.allStatuses.find((s) => s.isDispatch);
        if (dispatchStep) {
          dispatchStepId = dispatchStep.id;
        } else {
          this.logger.warn(
            `WorkOrder ${id}: aucun statut isDispatch=true trouvé dans le processus ` +
              `${wo.processDefinitionId} — currentStepId non mis à jour par assignAndDispatch`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `WorkOrder ${id}: impossible de résoudre le step DISPATCHED dans le processus ` +
            `${wo.processDefinitionId}: ${message}`,
        );
      }
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: WorkOrderStatus.DISPATCHED,
        assignedToId: dto.technicianId,
        dispatchedAt: new Date(),
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        // Double-écriture process-engine : avancer currentStepId via la FK scalaire
        // (on ne mélange pas relation-style et scalar-style dans le même objet update)
        ...(dispatchStepId && { currentStepId: dispatchStepId }),
      },
      include: WORK_ORDER_DETAIL_INCLUDE,
    });

    // Ajouter une note de dispatch si une note est fournie
    if (dto.note?.trim()) {
      await this.prisma.note.create({
        data: {
          content: `[Dispatch] ${dto.note.trim()}`,
          workOrderId: id,
          authorId: userId,
        },
      });
    }

    this.logger.log(
      `WorkOrder ${updated.referenceNumber}: dispatché vers technicien ${tech.firstName} ${tech.lastName} par user ${userId}`,
    );

    return updated;
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  /**
   * B12 — Save one or both signatures on a WO. Same permission rules as
   * notes : only the assigned technician (or ADMIN/DISPATCHER) can sign.
   * Passing an explicit `null` on a field clears it. Passing `undefined`
   * (omitted) leaves the existing value alone.
   */
  async saveSignatures(
    workOrderId: string,
    dto: import('./dto/signatures.dto').SignaturesDto,
    currentUser: CurrentUserRef,
  ) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, assignedToId: true },
    });
    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    }
    if (
      currentUser.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Seul le technicien assigné peut enregistrer les signatures',
      );
    }
    const data: Record<string, unknown> = {};
    if (dto.signatureClient !== undefined) {
      data.signatureClient = dto.signatureClient;
    }
    if (dto.signatureTechnician !== undefined) {
      data.signatureTechnician = dto.signatureTechnician;
    }
    // Refresh signedAt whenever we touch at least one field with a value.
    if (dto.signatureClient || dto.signatureTechnician) {
      data.signedAt = new Date();
    } else if (
      dto.signatureClient === null &&
      dto.signatureTechnician === null
    ) {
      data.signedAt = null;
    }

    const updated = await this.prisma.workOrder.update({
      where: { id: workOrderId },
      data,
      select: {
        id: true,
        signatureClient: true,
        signatureTechnician: true,
        signedAt: true,
      },
    });
    this.eventEmitter.emit(WO_EVENT_NAMES.STATUS_CHANGED, {
      // Piggyback the existing event for audit/webhooks — receivers can
      // filter on data.signaturesUpdated=true if they care.
      eventName: 'workOrders.workOrder.signaturesUpdated',
      occurredAt: new Date(),
      aggregateId: workOrderId,
      actorUserId: currentUser.id,
      data: {
        signedAt: updated.signedAt,
        hasClientSignature: !!updated.signatureClient,
        hasTechnicianSignature: !!updated.signatureTechnician,
      },
    });
    return updated;
  }

  async createNote(
    workOrderId: string,
    dto: CreateNoteDto,
    currentUser: CurrentUserRef,
  ) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, assignedToId: true },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    }

    // Technicians can only add notes to their own work orders
    if (
      currentUser.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Seul le technicien assigné ou un administrateur peut ajouter des notes',
      );
    }

    return this.prisma.note.create({
      data: {
        content: dto.content,
        workOrderId,
        authorId: currentUser.id,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findNotes(workOrderId: string, currentUser?: CurrentUserRef) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, assignedToId: true },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${workOrderId} introuvable`);
    }

    // Technicians can only read notes on their own work orders (IDOR protection)
    if (
      currentUser?.role === Role.TECHNICIAN &&
      workOrder.assignedToId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez consulter que les notes de vos propres bons de travail',
      );
    }

    return this.prisma.note.findMany({
      where: { workOrderId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Available transitions ──────────────────────────────────────────────────

  /**
   * Returns the available transitions for a WorkOrder.
   *
   * Routing logic:
   *  - BT with processDefinitionId + currentStepId → delegate to ProcessEngineService.
   *  - BT without process data (legacy / not backfilled) → legacy hardcoded transitions.
   */
  async getAvailableTransitions(id: string, currentUser: CurrentUserRef) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { id: true, processDefinitionId: true, currentStepId: true },
    });

    if (!wo) {
      throw new NotFoundException(`Bon de travail #${id} introuvable`);
    }

    // Dynamic mode: process engine is configured and the current step is known
    if (wo.processDefinitionId && wo.currentStepId) {
      return this.processEngine.getAvailableTransitions(id, currentUser);
    }

    // Fallback: legacy hardcoded transitions
    return this.legacyGetAvailableTransitions(id, currentUser);
  }

  /**
   * Legacy available-transitions logic — preserved as a private fallback for
   * WorkOrders that have not yet been backfilled with a processDefinitionId.
   *
   * @deprecated Use the ProcessEngineService path (getAvailableTransitions) instead.
   */
  private async legacyGetAvailableTransitions(id: string, currentUser: CurrentUserRef) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { id: true, status: true, assignedToId: true },
    });

    if (!workOrder) {
      throw new NotFoundException(`Bon de travail #${id} introuvable`);
    }

    // IDOR check for technicians
    if (currentUser.role === Role.TECHNICIAN && workOrder.assignedToId !== currentUser.id) {
      throw new ForbiddenException('Accès refusé');
    }

    // Define the full transition map
    const TRANSITIONS: Record<string, Array<{
      targetStatus: WorkOrderStatus;
      label: string;
      requiresFields: string[];
      allowedRoles: Role[];
    }>> = {
      CREATED: [
        { targetStatus: WorkOrderStatus.ASSIGNED, label: 'Assigner', requiresFields: ['assignedToId'], allowedRoles: [Role.ADMIN, Role.DISPATCHER] },
      ],
      ASSIGNED: [
        { targetStatus: WorkOrderStatus.DISPATCHED, label: 'Dispatcher', requiresFields: [], allowedRoles: [Role.ADMIN, Role.DISPATCHER] },
        { targetStatus: WorkOrderStatus.CREATED, label: 'Désassigner', requiresFields: [], allowedRoles: [Role.ADMIN, Role.DISPATCHER] },
      ],
      DISPATCHED: [
        { targetStatus: WorkOrderStatus.EN_ROUTE, label: 'En route', requiresFields: [], allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN] },
      ],
      EN_ROUTE: [
        { targetStatus: WorkOrderStatus.IN_PROGRESS, label: 'Début des travaux', requiresFields: [], allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN] },
      ],
      IN_PROGRESS: [
        { targetStatus: WorkOrderStatus.COMPLETED_POSITIVE, label: 'Terminer (positif)', requiresFields: [], allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN] },
        { targetStatus: WorkOrderStatus.COMPLETED_NEGATIVE, label: 'Terminer (négatif)', requiresFields: ['negativeReason'], allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN] },
      ],
      COMPLETED_POSITIVE: [
        { targetStatus: WorkOrderStatus.CREATED, label: 'Ré-ouvrir', requiresFields: ['reopenReason'], allowedRoles: [Role.ADMIN] },
      ],
      COMPLETED_NEGATIVE: [
        { targetStatus: WorkOrderStatus.CREATED, label: 'Ré-ouvrir', requiresFields: [], allowedRoles: [Role.ADMIN, Role.DISPATCHER] },
      ],
    };

    const allTransitions = TRANSITIONS[workOrder.status] ?? [];

    // Filter by current user's role
    const transitions = allTransitions.filter(t => t.allowedRoles.includes(currentUser.role));

    return {
      workOrderId: workOrder.id,
      currentStepId: null as string | null,
      adminBypass: currentUser.role === Role.ADMIN,
      transitions: transitions.map((t, i) => ({
        id: `legacy-${workOrder.status}-${t.targetStatus}`,
        toStatusId: t.targetStatus as string,
        toStatusCode: 0,
        toStatusName: t.label,
        toStatusColor: '#64748b',
        label: t.label,
        requiredFields: t.requiresFields,
        sortOrder: i,
      })),
    };
  }
}
