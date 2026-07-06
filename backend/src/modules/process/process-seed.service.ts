import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, WorkOrderStatus } from '@prisma/client';

@Injectable()
export class ProcessSeedService implements OnModuleInit {
  private readonly logger = new Logger(ProcessSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedAndBackfill();
  }

  async seedAndBackfill() {
    // 1. Idempotence check
    const existing = await this.prisma.processDefinition.findFirst({
      where: { isDefault: true },
    });
    if (existing) {
      this.logger.log('Default process already exists — checking backfill...');
      await this.backfillWorkOrders(existing.id);
      await this.backfillRequestedStatus();
      return;
    }

    // Static definition data (no DB dependency)
    const statusDefs = [
      // B21 — client-portal work requests park here until an admin approves.
      { code: 50,  name: 'Demandé',            color: '#eab308', position: -1, isRequested: true },
      { code: 0,   name: 'Créé',              color: '#6b7280', position: 0, isInitial: true },
      { code: 100, name: 'Assigné',            color: '#3b82f6', position: 1 },
      { code: 200, name: 'Dispatché',          color: '#8b5cf6', position: 2, isDispatch: true },
      { code: 300, name: 'En route',           color: '#f59e0b', position: 3 },
      { code: 400, name: 'En cours',           color: '#f97316', position: 4, isStart: true },
      { code: 500, name: 'Complété (positif)', color: '#22c55e', position: 5, isTerminalPositive: true },
      { code: 600, name: 'Complété (négatif)', color: '#ef4444', position: 6, isTerminalNegative: true },
    ];

    const transitionDefs = [
      { fromCode: 50,  toCode: 0,   label: 'Approuver la demande', roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 0 },
      { fromCode: 50,  toCode: 600, label: 'Rejeter la demande',   roles: [Role.ADMIN, Role.DISPATCHER], required: ['negativeReason'], sort: 1 },
      { fromCode: 0,   toCode: 100, label: 'Assigner',             roles: [Role.ADMIN, Role.DISPATCHER], required: ['assignedToId'], sort: 0 },
      { fromCode: 100, toCode: 200, label: 'Dispatcher',           roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 0 },
      { fromCode: 200, toCode: 300, label: 'Partir en route',      roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: [], sort: 0 },
      { fromCode: 300, toCode: 400, label: 'Commencer le travail', roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: [], sort: 0 },
      { fromCode: 400, toCode: 500, label: 'Terminer (succès)',    roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: ['completionNotes'], sort: 0 },
      { fromCode: 400, toCode: 600, label: 'Terminer (échec)',     roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: ['negativeReason'], sort: 1 },
      { fromCode: 100, toCode: 0,   label: 'Désassigner',          roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 1 },
      { fromCode: 200, toCode: 100, label: 'Annuler dispatch',     roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 1 },
      { fromCode: 500, toCode: 0,   label: 'Réouvrir',             roles: [Role.ADMIN], required: ['reopenReason'], sort: 0 },
      { fromCode: 600, toCode: 0,   label: 'Réouvrir',             roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 0 },
    ];

    // 2-4. Create process definition, statuses, and transitions atomically.
    // A partial failure would otherwise leave the DB in an inconsistent state.
    const { process, createdStatuses } = await this.prisma.$transaction(async (tx) => {
      // 2. Create default process definition
      const process = await tx.processDefinition.create({
        data: {
          name: 'Standard BT',
          description: 'Processus de bon de travail standard (7 étapes)',
          version: 1,
          isDefault: true,
          isActive: true,
        },
      });

      // 3. Create 7 statuses (aligned with WorkOrderStatus enum values)
      const createdStatuses: Array<{ id: string; code: number }> = [];
      for (const def of statusDefs) {
        const status = await tx.processStatus.create({
          data: {
            processDefinitionId: process.id,
            code: def.code,
            name: def.name,
            color: def.color,
            position: def.position,
            isInitial: def.isInitial ?? false,
            isDispatch: def.isDispatch ?? false,
            isStart: def.isStart ?? false,
            isTerminalPositive: def.isTerminalPositive ?? false,
            isTerminalNegative: def.isTerminalNegative ?? false,
            isRequested: def.isRequested ?? false,
          },
        });
        createdStatuses.push(status);
      }

      // Map by code for transition creation
      const byCode = new Map(createdStatuses.map((s) => [s.code, s]));

      // 4. Create transitions (matching current VALID_TRANSITIONS business rules)
      for (const t of transitionDefs) {
        await tx.processTransition.create({
          data: {
            processDefinitionId: process.id,
            fromStatusId: byCode.get(t.fromCode)!.id,
            toStatusId: byCode.get(t.toCode)!.id,
            label: t.label,
            allowedRoles: t.roles,
            requiredFields: t.required,
            sortOrder: t.sort,
          },
        });
      }

      return { process, createdStatuses };
    });

    this.logger.log(`Created default process: ${process.name} (${process.id})`);
    this.logger.log(`Created ${createdStatuses.length} statuses`);
    this.logger.log(`Created ${transitionDefs.length} transitions`);

    // 5. Backfill existing work orders
    await this.backfillWorkOrders(process.id);
    await this.backfillRequestedStatus();

    // 6. Associate existing TaskTypes to default process
    const updated = await this.prisma.taskType.updateMany({
      where: { processDefinitionId: null },
      data: { processDefinitionId: process.id },
    });
    this.logger.log(`Associated ${updated.count} TaskTypes to default process`);
  }

  private async backfillWorkOrders(processId: string): Promise<void> {
    // Load all statuses for this process
    const statuses = await this.prisma.processStatus.findMany({
      where: { processDefinitionId: processId },
    });

    // Map legacy WorkOrderStatus enum values → ProcessStatus.id
    const codeToLegacy: Record<number, WorkOrderStatus> = {
      0:   WorkOrderStatus.CREATED,
      100: WorkOrderStatus.ASSIGNED,
      200: WorkOrderStatus.DISPATCHED,
      300: WorkOrderStatus.EN_ROUTE,
      400: WorkOrderStatus.IN_PROGRESS,
      500: WorkOrderStatus.COMPLETED_POSITIVE,
      600: WorkOrderStatus.COMPLETED_NEGATIVE,
    };

    const legacyToStepId: Record<string, string> = {};
    for (const s of statuses) {
      const legacy = codeToLegacy[s.code];
      if (legacy) {
        legacyToStepId[legacy] = s.id;
      }
    }

    // Batch update per legacy status — only rows not yet migrated
    let totalBackfilled = 0;
    for (const [legacyStatus, stepId] of Object.entries(legacyToStepId)) {
      const result = await this.prisma.workOrder.updateMany({
        where: {
          status: legacyStatus as WorkOrderStatus,
          currentStepId: null,
        },
        data: {
          currentStepId: stepId,
          processDefinitionId: processId,
        },
      });
      if (result.count > 0) {
        this.logger.log(
          `Backfilled ${result.count} WorkOrders (${legacyStatus} → step ${stepId})`,
        );
        totalBackfilled += result.count;
      }
    }

    if (totalBackfilled === 0) {
      this.logger.log('No WorkOrders to backfill.');
    } else {
      this.logger.log(`Backfill complete: ${totalBackfilled} WorkOrders migrated.`);
    }
  }

  /**
   * B21 — every process definition (all tenants) must expose a
   * pre-approval « Demandé » step so client-portal work requests have
   * somewhere to land. Idempotent: definitions that already have an
   * isRequested status are skipped. Runs at boot with no request
   * context, so the tenant-scope middleware is a no-op here (wanted:
   * this is a cross-tenant maintenance pass, like backfillWorkOrders).
   */
  private async backfillRequestedStatus(): Promise<void> {
    const definitions = await this.prisma.processDefinition.findMany({
      include: { statuses: true },
    });

    let patched = 0;
    for (const def of definitions) {
      if (def.statuses.some((st) => st.isRequested)) continue;

      const initial =
        def.statuses.find((st) => st.isInitial) ??
        [...def.statuses].sort((a, b) => a.position - b.position)[0];
      const terminalNegative = def.statuses.find((st) => st.isTerminalNegative);
      if (!initial) {
        this.logger.warn(
          `Process "${def.name}" (${def.id}) has no statuses — skipping Requested backfill.`,
        );
        continue;
      }

      const minPosition = Math.min(...def.statuses.map((st) => st.position));
      // Code 50 unless taken by a custom status — then fall below the minimum.
      const code = def.statuses.some((st) => st.code === 50)
        ? Math.min(...def.statuses.map((st) => st.code)) - 1
        : 50;

      await this.prisma.$transaction(async (tx) => {
        const requested = await tx.processStatus.create({
          data: {
            processDefinitionId: def.id,
            tenantId: def.tenantId,
            code,
            name: 'Demandé',
            nameFr: 'Demandé',
            nameEn: 'Requested',
            color: '#eab308',
            position: minPosition - 1,
            isRequested: true,
          },
        });
        await tx.processTransition.create({
          data: {
            processDefinitionId: def.id,
            tenantId: def.tenantId,
            fromStatusId: requested.id,
            toStatusId: initial.id,
            label: 'Approuver la demande',
            allowedRoles: [Role.ADMIN, Role.DISPATCHER],
            requiredFields: [],
            sortOrder: 0,
          },
        });
        if (terminalNegative) {
          await tx.processTransition.create({
            data: {
              processDefinitionId: def.id,
              tenantId: def.tenantId,
              fromStatusId: requested.id,
              toStatusId: terminalNegative.id,
              label: 'Rejeter la demande',
              allowedRoles: [Role.ADMIN, Role.DISPATCHER],
              requiredFields: ['negativeReason'],
              sortOrder: 1,
            },
          });
        }
      });
      patched += 1;
    }

    if (patched > 0) {
      this.logger.log(
        `B21 — added « Demandé » status + approval transitions to ${patched} process definition(s).`,
      );
    }
  }
}
