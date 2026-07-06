import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CachedProcess, CachedStatus, CachedTransition } from './types/process.types';

// ── Raw Prisma types returned by the DB query ────────────────────────────────

type RawStatus = {
  id: string;
  code: number;
  name: string;
  color: string;
  position: number;
  isInitial: boolean;
  isDispatch: boolean;
  isStart: boolean;
  isTerminalPositive: boolean;
  isTerminalNegative: boolean;
  isRequested: boolean;
};

type RawTransition = {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  label: string;
  allowedRoles: string[];
  requiredFields: string[];
  sortOrder: number;
};

type RawDefinition = {
  id: string;
  name: string;
  version: number;
  statuses: RawStatus[];
  transitions: RawTransition[];
};

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ProcessCacheService {
  private readonly logger = new Logger(ProcessCacheService.name);

  /** processDefinitionId → { data, expiresAt } */
  private readonly cache = new Map<string, { data: CachedProcess; expiresAt: number }>();

  /** taskTypeId → processDefinitionId (best-effort index, cleared on invalidateAll) */
  private readonly taskTypeIndex = new Map<string, string>();

  private readonly TTL = 5 * 60 * 1000; // 5 minutes in ms

  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Returns the CachedProcess for the given ProcessDefinition ID.
   * Loads from DB and caches when the entry is missing or expired.
   */
  async getProcess(processDefinitionId: string): Promise<CachedProcess> {
    const now = Date.now();
    const entry = this.cache.get(processDefinitionId);

    if (entry && entry.expiresAt > now) {
      return entry.data;
    }

    const definition = await this.prisma.processDefinition.findUnique({
      where: { id: processDefinitionId },
      include: {
        statuses: { orderBy: { position: 'asc' } },
        transitions: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!definition) {
      throw new NotFoundException(`Processus #${processDefinitionId} introuvable`);
    }

    const cached = this.buildCachedProcess(definition as RawDefinition);

    this.cache.set(processDefinitionId, {
      data: cached,
      expiresAt: now + this.TTL,
    });

    this.logger.debug(
      `Process "${definition.name}" v${definition.version} chargé en cache ` +
        `(${definition.statuses.length} statuts, ${definition.transitions.length} transitions)`,
    );

    return cached;
  }

  /**
   * Returns the CachedProcess associated with the given TaskType.
   * Falls back to the default process when the TaskType has no processDefinitionId.
   */
  async getProcessForTaskType(taskTypeId: string): Promise<CachedProcess> {
    // Fast path: taskTypeId already resolved
    const indexedId = this.taskTypeIndex.get(taskTypeId);
    if (indexedId) {
      return this.getProcess(indexedId);
    }

    // DB lookup
    const taskType = await this.prisma.taskType.findUnique({
      where: { id: taskTypeId },
      select: { id: true, processDefinitionId: true },
    });

    if (!taskType) {
      this.logger.warn(
        `TaskType #${taskTypeId} introuvable — utilisation du processus par défaut`,
      );
      return this.getDefaultProcess();
    }

    if (!taskType.processDefinitionId) {
      this.logger.debug(
        `TaskType #${taskTypeId} sans processDefinitionId — utilisation du processus par défaut`,
      );
      return this.getDefaultProcess();
    }

    // Store resolved ID in the index for subsequent calls
    this.taskTypeIndex.set(taskTypeId, taskType.processDefinitionId);
    return this.getProcess(taskType.processDefinitionId);
  }

  /**
   * Returns the unique active default ProcessDefinition (isDefault=true, isActive=true).
   * Throws NotFoundException when no default process exists.
   */
  async getDefaultProcess(): Promise<CachedProcess> {
    const definition = await this.prisma.processDefinition.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });

    if (!definition) {
      throw new NotFoundException(
        'Aucun processus actif par défaut (isDefault=true, isActive=true) trouvé. ' +
          'Assurez-vous que le seed a bien été exécuté.',
      );
    }

    return this.getProcess(definition.id);
  }

  /**
   * Removes a single process entry from the in-memory cache.
   * The next call to getProcess() will reload from the database.
   */
  invalidate(processDefinitionId: string): void {
    this.cache.delete(processDefinitionId);
    for (const [taskTypeId, pid] of this.taskTypeIndex.entries()) {
      if (pid === processDefinitionId) this.taskTypeIndex.delete(taskTypeId);
    }
    this.logger.debug(`Cache invalidé pour le processus ${processDefinitionId}`);
  }

  /**
   * Drops a single taskType→process mapping from the index. Use when an admin
   * changes a TaskType's processDefinitionId so the next BT creation re-resolves.
   */
  invalidateTaskType(taskTypeId: string): void {
    this.taskTypeIndex.delete(taskTypeId);
    this.logger.debug(`Index taskType invalidé pour ${taskTypeId}`);
  }

  /**
   * Clears the entire process cache and the taskType index.
   * Useful after bulk changes (migrations, seed re-runs, admin edits).
   */
  invalidateAll(): void {
    this.cache.clear();
    this.taskTypeIndex.clear();
    this.logger.debug('Cache de processus entièrement vidé (processus + index taskType)');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildCachedProcess(definition: RawDefinition): CachedProcess {
    const statuses = new Map<string, CachedStatus>();
    const statusByCode = new Map<number, CachedStatus>();
    const allStatuses: CachedStatus[] = [];
    let initialStatus: CachedStatus | undefined;
    let requestedStatus: CachedStatus | undefined;

    // Build status maps (statuses are already ordered by position from the query)
    for (const s of definition.statuses) {
      const cs: CachedStatus = {
        id: s.id,
        code: s.code,
        name: s.name,
        color: s.color,
        position: s.position,
        isInitial: s.isInitial,
        isDispatch: s.isDispatch,
        isStart: s.isStart,
        isTerminalPositive: s.isTerminalPositive,
        isTerminalNegative: s.isTerminalNegative,
        isRequested: s.isRequested,
      };
      statuses.set(cs.id, cs);
      statusByCode.set(cs.code, cs);
      allStatuses.push(cs);

      if (cs.isInitial) {
        initialStatus = cs;
      }
      if (cs.isRequested && !requestedStatus) {
        requestedStatus = cs;
      }
    }

    // Graceful fallback: use first status by position when none is flagged isInitial
    if (!initialStatus) {
      initialStatus = allStatuses[0];
      this.logger.warn(
        `Processus "${definition.name}" (${definition.id}) n'a aucun statut avec isInitial=true. ` +
          `Fallback sur le premier statut (code=${initialStatus?.code ?? 'N/A'}).`,
      );
    }

    // Build transition adjacency map: fromStatusId → CachedTransition[]
    const transitions = new Map<string, CachedTransition[]>();

    for (const t of definition.transitions) {
      const ct: CachedTransition = {
        id: t.id,
        fromStatusId: t.fromStatusId,
        toStatusId: t.toStatusId,
        label: t.label,
        allowedRoles: t.allowedRoles as Role[],
        requiredFields: t.requiredFields,
        sortOrder: t.sortOrder,
      };

      const bucket = transitions.get(t.fromStatusId) ?? [];
      bucket.push(ct);
      transitions.set(t.fromStatusId, bucket);
    }

    return {
      id: definition.id,
      name: definition.name,
      version: definition.version,
      statuses,
      statusByCode,
      transitions,
      initialStatus: initialStatus!, // safe: fallback guarantees a value (or empty process)
      requestedStatus,
      allStatuses,
    };
  }
}
