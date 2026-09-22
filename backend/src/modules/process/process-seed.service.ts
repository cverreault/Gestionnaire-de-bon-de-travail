import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, WorkOrderStatus } from '@prisma/client';
import {
  DEFAULT_PROCESS_STATUSES,
  DEFAULT_PROCESS_TRANSITIONS,
  createDefaultProcess,
  toStatusCreateData,
  toTransitionCreateData,
} from '../../common/contracts/default-process.contract';

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
      await this.backfillCancelledStatus();
      await this.repairDefaultProcesses();
      return;
    }

    // 2-4. Create process definition, statuses, and transitions atomically
    // (canonical definition shared with the tenant bootstrap).
    const { processId, statusIdsByCode } = await this.prisma.$transaction((tx) =>
      createDefaultProcess(tx),
    );
    const process = { id: processId, name: 'Standard BT' };

    this.logger.log(`Created default process: ${process.name} (${process.id})`);
    this.logger.log(`Created ${statusIdsByCode.size} statuses`);
    this.logger.log(`Created ${DEFAULT_PROCESS_TRANSITIONS.length} transitions`);

    // 5. Backfill existing work orders
    await this.backfillWorkOrders(process.id);
    await this.backfillRequestedStatus();
    await this.backfillCancelledStatus();
    await this.repairDefaultProcesses();

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
      700: WorkOrderStatus.CANCELLED,
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

  /**
   * B54 — every process definition (default or custom) gets an « Annulé »
   * status once: cancel from any open step (reason required, admin or
   * dispatcher), reopen back to the initial step. Idempotent; runs at boot.
   */
  private async backfillCancelledStatus(): Promise<void> {
    const definitions = await this.prisma.processDefinition.findMany({
      include: { statuses: true },
    });

    let patched = 0;
    for (const def of definitions) {
      if (def.statuses.some((st) => st.isCancelled)) continue;
      const initial = def.statuses.find((st) => st.isInitial);
      if (!initial) {
        this.logger.warn(`Process "${def.name}" (${def.id}) has no initial status — skipping « Annulé » backfill.`);
        continue;
      }
      const code = def.statuses.some((st) => st.code === 700)
        ? Math.max(...def.statuses.map((st) => st.code)) + 100
        : 700;
      const position = Math.max(...def.statuses.map((st) => st.position)) + 1;
      const openStatuses = def.statuses.filter(
        (st) => !st.isTerminalPositive && !st.isTerminalNegative && !st.isRequested && !st.isCancelled,
      );

      await this.prisma.$transaction(async (tx) => {
        const cancelled = await tx.processStatus.create({
          data: {
            processDefinitionId: def.id,
            tenantId: def.tenantId,
            code,
            name: 'Annulé',
            nameFr: 'Annulé',
            nameEn: 'Cancelled',
            color: '#9ca3af',
            position,
            isCancelled: true,
          },
        });
        for (const from of openStatuses) {
          await tx.processTransition.create({
            data: {
              processDefinitionId: def.id,
              tenantId: def.tenantId,
              fromStatusId: from.id,
              toStatusId: cancelled.id,
              label: 'Annuler',
              labelFr: 'Annuler',
              labelEn: 'Cancel',
              allowedRoles: [Role.ADMIN, Role.DISPATCHER],
              requiredFields: ['negativeReason'],
              sortOrder: 9,
            },
          });
        }
        await tx.processTransition.create({
          data: {
            processDefinitionId: def.id,
            tenantId: def.tenantId,
            fromStatusId: cancelled.id,
            toStatusId: initial.id,
            label: 'Réouvrir',
            labelFr: 'Réouvrir',
            labelEn: 'Reopen',
            allowedRoles: [Role.ADMIN, Role.DISPATCHER],
            requiredFields: [],
            sortOrder: 0,
          },
        });
      });
      patched += 1;
    }

    if (patched > 0) {
      this.logger.log(`B54 — added « Annulé » status + cancel/reopen transitions to ${patched} process definition(s).`);
    }
  }

  /**
   * B43 — tenants created by the old TenantBootstrapService got a default
   * process with 4 statuses (0, 100, 200 « En progrès », 900) and no
   * transition at all, so nobody could move a work order. Bring every
   * default process up to the canonical definition: add missing statuses
   * (matched by code), fix the mis-seeded code 200 (only when no work order
   * sits on it), drop the orphan 900 when unused, and add missing
   * transitions (matched by from/to code). Idempotent; runs at every boot.
   */
  private async repairDefaultProcesses(): Promise<void> {
    const definitions = await this.prisma.processDefinition.findMany({
      where: { isDefault: true },
      include: { statuses: true, transitions: true },
    });

    let repaired = 0;
    for (const def of definitions) {
      if (def.transitions.length >= DEFAULT_PROCESS_TRANSITIONS.length) continue;

      const byCode = new Map(def.statuses.map((st) => [st.code, st]));
      const legacyDispatch = byCode.get(200);
      if (legacyDispatch && !legacyDispatch.isDispatch) {
        const inUse = await this.prisma.workOrder.count({
          where: { currentStepId: legacyDispatch.id },
        });
        if (inUse > 0) {
          this.logger.warn(
            `Process "${def.name}" (${def.id}) : status 200 « ${legacyDispatch.name} » is not the dispatch step but ${inUse} work order(s) use it — skipping automatic repair, fix it in the process editor.`,
          );
          continue;
        }
      }

      await this.prisma.$transaction(async (tx) => {
        for (const canon of DEFAULT_PROCESS_STATUSES) {
          const data = toStatusCreateData(canon);
          const current = byCode.get(canon.code);
          if (!current) {
            const created = await tx.processStatus.create({
              data: { tenantId: def.tenantId, processDefinitionId: def.id, ...data },
            });
            byCode.set(canon.code, created);
          } else if (canon.code === 200 && !current.isDispatch) {
            const updated = await tx.processStatus.update({
              where: { id: current.id },
              data,
            });
            byCode.set(canon.code, updated);
          } else if (current.position !== canon.position) {
            await tx.processStatus.update({
              where: { id: current.id },
              data: { position: canon.position },
            });
          }
        }

        const orphan = byCode.get(900);
        if (orphan) {
          const referenced =
            (await tx.workOrder.count({ where: { currentStepId: orphan.id } })) +
            def.transitions.filter((t) => t.fromStatusId === orphan.id || t.toStatusId === orphan.id).length;
          if (referenced === 0) {
            await tx.processStatus.delete({ where: { id: orphan.id } });
            byCode.delete(900);
          }
        }

        const existingPairs = new Set(def.transitions.map((t) => `${t.fromStatusId}→${t.toStatusId}`));
        for (const canon of DEFAULT_PROCESS_TRANSITIONS) {
          const from = byCode.get(canon.fromCode);
          const to = byCode.get(canon.toCode);
          if (!from || !to || existingPairs.has(`${from.id}→${to.id}`)) continue;
          await tx.processTransition.create({
            data: {
              tenantId: def.tenantId,
              processDefinitionId: def.id,
              fromStatusId: from.id,
              toStatusId: to.id,
              ...toTransitionCreateData(canon),
            },
          });
        }
      });
      repaired += 1;
    }

    if (repaired > 0) {
      this.logger.log(`B43 — repaired ${repaired} default process definition(s) missing statuses/transitions.`);
    }
  }
}
