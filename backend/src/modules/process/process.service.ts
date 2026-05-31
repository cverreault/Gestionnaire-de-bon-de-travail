import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProcessCacheService } from './process-cache.service';
import { CreateProcessDefinitionDto } from './dto/create-process-definition.dto';
import { UpdateProcessDefinitionDto } from './dto/update-process-definition.dto';
import { CreateProcessStatusDto } from './dto/create-process-status.dto';
import { UpdateProcessStatusDto } from './dto/update-process-status.dto';
import { CreateProcessTransitionDto, ALLOWED_REQUIRED_FIELDS } from './dto/create-process-transition.dto';
import { UpdateProcessTransitionDto } from './dto/update-process-transition.dto';
import { ProcessFilterDto } from './dto/process-filter.dto';

// ── Singleton flags — at most one status per process can have each flag set ──
const SINGLETON_FLAGS = [
  'isInitial',
  'isDispatch',
  'isStart',
  'isTerminalPositive',
  'isTerminalNegative',
] as const;

type SingletonFlag = (typeof SINGLETON_FLAGS)[number];

@Injectable()
export class ProcessService {
  private readonly logger = new Logger(ProcessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processCache: ProcessCacheService,
  ) {}

  // ── Shared Prisma includes ──────────────────────────────────────────────────

  /** Light include for list queries */
  private get listInclude() {
    return {
      _count: {
        select: { statuses: true, transitions: true },
      },
    };
  }

  /** Full include for detail / snapshot queries */
  private get detailInclude() {
    return {
      statuses: {
        orderBy: { position: 'asc' as const },
      },
      transitions: {
        include: {
          fromStatus: true,
          toStatus: true,
        },
        orderBy: [
          { sortOrder: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ProcessDefinition
  // ─────────────────────────────────────────────────────────────────────────────

  async findAll(filter: ProcessFilterDto) {
    const { search, isActive, page = 1, limit = 20 } = filter;

    const where: Prisma.ProcessDefinitionWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.processDefinition.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: this.listInclude,
      }),
      this.prisma.processDefinition.count({ where }),
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

  async findOne(id: string) {
    const process = await this.prisma.processDefinition.findUnique({
      where: { id },
      include: this.detailInclude,
    });

    if (!process) {
      throw new NotFoundException(`Processus #${id} introuvable`);
    }

    return process;
  }

  async create(dto: CreateProcessDefinitionDto) {
    // Friendly check for unique name (otherwise the unique constraint fires a 500)
    const existingByName = await this.prisma.processDefinition.findUnique({
      where: { name: dto.name },
      select: { id: true },
    });
    if (existingByName) {
      throw new ConflictException(
        `Un processus nommé « ${dto.name} » existe déjà. Choisissez un autre nom.`,
      );
    }

    // If isDefault requested, check that no other process is already default
    if (dto.isDefault) {
      const existingDefault = await this.prisma.processDefinition.findFirst({
        where: { isDefault: true, isActive: true },
        select: { id: true, name: true },
      });
      if (existingDefault) {
        throw new ConflictException(
          `Un processus par défaut existe déjà : "${existingDefault.name}" (${existingDefault.id}). ` +
            'Désactivez-le d\'abord ou ne marquez pas ce processus comme défaut.',
        );
      }
    }

    // Load the current default process (if any) to clone its statuses + transitions.
    // A fresh process should not start empty — the user picks the default workflow
    // (typically "Standard BT") then customizes from there.
    const defaultProcess = await this.prisma.processDefinition.findFirst({
      where: { isDefault: true, isActive: true },
      include: {
        statuses: { orderBy: { position: 'asc' } },
        transitions: true,
      },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const newProc = await tx.processDefinition.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          isDefault: dto.isDefault ?? false,
        },
      });

      if (defaultProcess && defaultProcess.id !== newProc.id) {
        // Map old status id → new status id so transitions can reconnect properly
        const statusIdMap = new Map<string, string>();
        for (const s of defaultProcess.statuses) {
          const newStatus = await tx.processStatus.create({
            data: {
              processDefinitionId: newProc.id,
              code: s.code,
              name: s.name,
              color: s.color,
              position: s.position,
              isInitial: s.isInitial,
              isDispatch: s.isDispatch,
              isStart: s.isStart,
              isTerminalPositive: s.isTerminalPositive,
              isTerminalNegative: s.isTerminalNegative,
            },
          });
          statusIdMap.set(s.id, newStatus.id);
        }

        for (const t of defaultProcess.transitions) {
          const fromNew = statusIdMap.get(t.fromStatusId);
          const toNew = statusIdMap.get(t.toStatusId);
          if (!fromNew || !toNew) continue;
          await tx.processTransition.create({
            data: {
              processDefinitionId: newProc.id,
              fromStatusId: fromNew,
              toStatusId: toNew,
              label: t.label,
              allowedRoles: t.allowedRoles,
              requiredFields: t.requiredFields,
              sortOrder: t.sortOrder,
            },
          });
        }
      }

      return newProc;
    });

    const process = await this.prisma.processDefinition.findUniqueOrThrow({
      where: { id: created.id },
      include: this.detailInclude,
    });

    this.logger.log(
      `ProcessDefinition created: "${process.name}" (${process.id})` +
        (defaultProcess
          ? ` — cloned ${defaultProcess.statuses.length} statuses + ${defaultProcess.transitions.length} transitions from "${defaultProcess.name}"`
          : ' (no default to clone from)'),
    );
    return process;
  }

  async update(id: string, dto: UpdateProcessDefinitionDto) {
    const process = await this.assertProcessExists(id);

    // If switching isDefault to true, ensure no other active default exists
    if (dto.isDefault === true) {
      const existingDefault = await this.prisma.processDefinition.findFirst({
        where: { isDefault: true, isActive: true, NOT: { id } },
        select: { id: true, name: true },
      });
      if (existingDefault) {
        throw new ConflictException(
          `Un processus par défaut existe déjà : "${existingDefault.name}" (${existingDefault.id}). ` +
            'Désactivez-le ou retirez son flag isDefault avant de le transférer.',
        );
      }
    }

    // If deactivating, guard against removing the only active default process
    if (dto.isActive === false && process.isDefault && process.isActive) {
      const otherActiveDefault = await this.prisma.processDefinition.findFirst({
        where: { isDefault: true, isActive: true, NOT: { id } },
        select: { id: true },
      });
      if (!otherActiveDefault) {
        throw new BadRequestException(
          'Impossible de désactiver le seul processus actif par défaut. ' +
            "Assignez d'abord un autre processus par défaut.",
        );
      }
    }

    const updated = await this.prisma.processDefinition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        version: { increment: 1 },
      },
      include: this.detailInclude,
    });

    this.processCache.invalidate(id);
    this.logger.log(`ProcessDefinition updated: "${updated.name}" v${updated.version} (${id})`);
    return updated;
  }

  async remove(id: string) {
    const process = await this.assertProcessExists(id);

    // Block deletion if this is the only active default process
    if (process.isDefault && process.isActive) {
      const otherActiveDefault = await this.prisma.processDefinition.findFirst({
        where: { isDefault: true, isActive: true, NOT: { id } },
        select: { id: true },
      });
      if (!otherActiveDefault) {
        throw new BadRequestException(
          'Impossible de désactiver le seul processus actif par défaut. ' +
            'Assignez d\'abord un autre processus par défaut.',
        );
      }
    }

    const updated = await this.prisma.processDefinition.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, name: true, isActive: true },
    });

    this.processCache.invalidate(id);
    this.logger.log(`ProcessDefinition soft-deleted: "${updated.name}" (${id})`);
    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ProcessStatus
  // ─────────────────────────────────────────────────────────────────────────────

  async addStatus(processId: string, dto: CreateProcessStatusDto) {
    await this.assertProcessExists(processId);

    // Check code uniqueness within the process
    const duplicateCode = await this.prisma.processStatus.findFirst({
      where: { processDefinitionId: processId, code: dto.code },
      select: { id: true },
    });
    if (duplicateCode) {
      throw new ConflictException(
        `Un statut avec le code ${dto.code} existe déjà dans ce processus.`,
      );
    }

    // Check singleton flag uniqueness
    await this.assertSingletonFlags(processId, dto);

    const status = await this.prisma.processStatus.create({
      data: {
        processDefinitionId: processId,
        code: dto.code,
        name: dto.name,
        color: dto.color,
        position: dto.position,
        isInitial: dto.isInitial ?? false,
        isDispatch: dto.isDispatch ?? false,
        isStart: dto.isStart ?? false,
        isTerminalPositive: dto.isTerminalPositive ?? false,
        isTerminalNegative: dto.isTerminalNegative ?? false,
      },
    });

    // Bump process version
    await this.bumpVersion(processId);

    this.logger.log(
      `ProcessStatus added: code=${status.code} "${status.name}" to process ${processId}`,
    );
    return status;
  }

  async updateStatus(
    processId: string,
    statusId: string,
    dto: UpdateProcessStatusDto,
  ) {
    await this.assertStatusBelongsToProcess(processId, statusId);

    // Check singleton flag uniqueness (exclude current status from check)
    await this.assertSingletonFlags(processId, dto, statusId);

    const updated = await this.prisma.processStatus.update({
      where: { id: statusId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.isInitial !== undefined && { isInitial: dto.isInitial }),
        ...(dto.isDispatch !== undefined && { isDispatch: dto.isDispatch }),
        ...(dto.isStart !== undefined && { isStart: dto.isStart }),
        ...(dto.isTerminalPositive !== undefined && {
          isTerminalPositive: dto.isTerminalPositive,
        }),
        ...(dto.isTerminalNegative !== undefined && {
          isTerminalNegative: dto.isTerminalNegative,
        }),
      },
    });

    await this.bumpVersion(processId);
    return updated;
  }

  async removeStatus(processId: string, statusId: string) {
    await this.assertStatusBelongsToProcess(processId, statusId);

    // Check that no active work order currently sits on this status
    const activeWorkOrderCount = await this.prisma.workOrder.count({
      where: { currentStepId: statusId },
    });
    if (activeWorkOrderCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer ce statut : ${activeWorkOrderCount} bon(s) de travail actif(s) l'utilisent actuellement.`,
      );
    }

    // Check that no transition references this status
    const referencingTransitionCount = await this.prisma.processTransition.count({
      where: {
        OR: [{ fromStatusId: statusId }, { toStatusId: statusId }],
      },
    });
    if (referencingTransitionCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer ce statut : ${referencingTransitionCount} transition(s) le référencent. ` +
          'Supprimez d\'abord les transitions concernées.',
      );
    }

    await this.prisma.processStatus.delete({ where: { id: statusId } });
    await this.bumpVersion(processId);

    this.logger.log(`ProcessStatus deleted: ${statusId} from process ${processId}`);
    return { id: statusId, deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ProcessTransition
  // ─────────────────────────────────────────────────────────────────────────────

  async addTransition(processId: string, dto: CreateProcessTransitionDto) {
    await this.assertProcessExists(processId);

    // fromStatusId !== toStatusId
    if (dto.fromStatusId === dto.toStatusId) {
      throw new BadRequestException(
        'fromStatusId et toStatusId doivent être différents.',
      );
    }

    // Both statuses must belong to this process
    await this.assertStatusBelongsToProcess(processId, dto.fromStatusId);
    await this.assertStatusBelongsToProcess(processId, dto.toStatusId);

    // requiredFields values must be within the allowed set
    if (dto.requiredFields?.length) {
      const invalidFields = dto.requiredFields.filter(
        (f) => !(ALLOWED_REQUIRED_FIELDS as readonly string[]).includes(f),
      );
      if (invalidFields.length > 0) {
        throw new BadRequestException(
          `Champs requis invalides : ${invalidFields.join(', ')}. ` +
            `Valeurs autorisées : ${ALLOWED_REQUIRED_FIELDS.join(', ')}.`,
        );
      }
    }

    // Uniqueness check (processId, fromStatusId, toStatusId)
    const duplicate = await this.prisma.processTransition.findFirst({
      where: {
        processDefinitionId: processId,
        fromStatusId: dto.fromStatusId,
        toStatusId: dto.toStatusId,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'Une transition entre ces deux statuts existe déjà dans ce processus.',
      );
    }

    const transition = await this.prisma.processTransition.create({
      data: {
        processDefinitionId: processId,
        fromStatusId: dto.fromStatusId,
        toStatusId: dto.toStatusId,
        label: dto.label,
        allowedRoles: dto.allowedRoles,
        requiredFields: dto.requiredFields ?? [],
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { fromStatus: true, toStatus: true },
    });

    await this.bumpVersion(processId);

    this.logger.log(
      `ProcessTransition added: "${transition.label}" (${transition.fromStatusId} → ${transition.toStatusId}) in process ${processId}`,
    );
    return transition;
  }

  async updateTransition(
    processId: string,
    transitionId: string,
    dto: UpdateProcessTransitionDto,
  ) {
    await this.assertTransitionBelongsToProcess(processId, transitionId);

    // Validate requiredFields if provided
    if (dto.requiredFields?.length) {
      const invalidFields = dto.requiredFields.filter(
        (f) => !(ALLOWED_REQUIRED_FIELDS as readonly string[]).includes(f),
      );
      if (invalidFields.length > 0) {
        throw new BadRequestException(
          `Champs requis invalides : ${invalidFields.join(', ')}. ` +
            `Valeurs autorisées : ${ALLOWED_REQUIRED_FIELDS.join(', ')}.`,
        );
      }
    }

    const updated = await this.prisma.processTransition.update({
      where: { id: transitionId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.allowedRoles !== undefined && { allowedRoles: dto.allowedRoles }),
        ...(dto.requiredFields !== undefined && { requiredFields: dto.requiredFields }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
      include: { fromStatus: true, toStatus: true },
    });

    await this.bumpVersion(processId);
    return updated;
  }

  async removeTransition(processId: string, transitionId: string) {
    await this.assertTransitionBelongsToProcess(processId, transitionId);

    await this.prisma.processTransition.delete({ where: { id: transitionId } });
    await this.bumpVersion(processId);

    this.logger.log(`ProcessTransition deleted: ${transitionId} from process ${processId}`);
    return { id: transitionId, deleted: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Snapshot
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the full denormalized process definition:
   * - statuses sorted by position
   * - transitions with hydrated from/to statuses
   * - adjacencyMap: { [fromStatusId]: toStatusId[] } for quick graph traversal
   */
  async getSnapshot(processId: string) {
    const process = await this.prisma.processDefinition.findUnique({
      where: { id: processId },
      include: {
        statuses: {
          orderBy: { position: 'asc' as const },
        },
        transitions: {
          include: {
            fromStatus: true,
            toStatus: true,
          },
          orderBy: [
            { sortOrder: 'asc' as const },
            { createdAt: 'asc' as const },
          ],
        },
      },
    });

    if (!process) {
      throw new NotFoundException(`Processus #${processId} introuvable`);
    }

    if (!process.isActive) {
      throw new NotFoundException(
        `Processus #${processId} est inactif et son snapshot n'est pas accessible.`,
      );
    }

    // Build adjacency map: fromStatusId → array of toStatusIds
    const adjacencyMap: Record<string, string[]> = {};
    for (const t of process.transitions) {
      if (!adjacencyMap[t.fromStatusId]) {
        adjacencyMap[t.fromStatusId] = [];
      }
      adjacencyMap[t.fromStatusId].push(t.toStatusId);
    }

    return {
      ...process,
      adjacencyMap,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /** Asserts a ProcessDefinition exists and returns it. Throws NotFoundException otherwise. */
  private async assertProcessExists(id: string) {
    const process = await this.prisma.processDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isActive: true,
        version: true,
      },
    });
    if (!process) {
      throw new NotFoundException(`Processus #${id} introuvable`);
    }
    return process;
  }

  /** Asserts a ProcessStatus exists and belongs to the given process. */
  private async assertStatusBelongsToProcess(
    processId: string,
    statusId: string,
  ) {
    const status = await this.prisma.processStatus.findUnique({
      where: { id: statusId },
      select: { id: true, processDefinitionId: true },
    });
    if (!status) {
      throw new NotFoundException(`Statut #${statusId} introuvable`);
    }
    if (status.processDefinitionId !== processId) {
      throw new BadRequestException(
        `Le statut #${statusId} n'appartient pas au processus #${processId}.`,
      );
    }
    return status;
  }

  /** Asserts a ProcessTransition exists and belongs to the given process. */
  private async assertTransitionBelongsToProcess(
    processId: string,
    transitionId: string,
  ) {
    const transition = await this.prisma.processTransition.findUnique({
      where: { id: transitionId },
      select: { id: true, processDefinitionId: true },
    });
    if (!transition) {
      throw new NotFoundException(`Transition #${transitionId} introuvable`);
    }
    if (transition.processDefinitionId !== processId) {
      throw new BadRequestException(
        `La transition #${transitionId} n'appartient pas au processus #${processId}.`,
      );
    }
    return transition;
  }

  /**
   * Checks that no other status in the same process already has one of the
   * singleton flags set to `true` when the DTO also requests it as `true`.
   *
   * @param processId  — The process to scope the check to
   * @param dto        — Partial or full status DTO
   * @param excludeId  — ID of the status being updated (excluded from the check)
   */
  private async assertSingletonFlags(
    processId: string,
    dto: Partial<CreateProcessStatusDto>,
    excludeId?: string,
  ) {
    for (const flag of SINGLETON_FLAGS) {
      if (dto[flag] !== true) continue;

      const existing = await this.prisma.processStatus.findFirst({
        where: {
          processDefinitionId: processId,
          [flag]: true,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true, name: true },
      });

      if (existing) {
        throw new ConflictException(
          `Le flag "${flag}" est déjà attribué au statut "${existing.name}" (${existing.id}) dans ce processus. ` +
            'Ce flag est unique par processus. Retirez-le d\'abord de l\'autre statut.',
        );
      }
    }
  }

  /** Increments the version counter of a ProcessDefinition and invalidates the cache. */
  private async bumpVersion(processId: string) {
    await this.prisma.processDefinition.update({
      where: { id: processId },
      data: { version: { increment: 1 } },
    });
    this.processCache.invalidate(processId);
  }
}
