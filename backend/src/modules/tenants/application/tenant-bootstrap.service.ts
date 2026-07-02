import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Minimal catalog every new tenant needs to be operable right after
 * signup (B6.7 → refined B7.6 to a true blank slate).
 *
 * Seeded :
 *   1. A default process (CREATED → ASSIGNED → IN_PROGRESS → COMPLETED)
 *   2. A default WO template (1 empty "Notes" section) so the admin
 *      can create their first BT before customizing the catalog.
 *
 * NOT seeded (admin creates them on demand) :
 *   - Task types, client types, address types
 *
 * Runs inside the same transaction as Tenant + ADMIN creation — if any
 * step fails, signup rolls back cleanly with no orphans.
 */
@Injectable()
export class TenantBootstrapService {
  private readonly logger = new Logger(TenantBootstrapService.name);

  async seed(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await this.seedProcess(tx, tenantId);
    await this.seedDefaultTemplate(tx, tenantId);
    this.logger.log(`✅ Seeded minimal catalog for tenant ${tenantId}`);
  }

  private async seedProcess(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const proc = await tx.processDefinition.create({
      data: {
        tenantId,
        name: 'Standard BT',
        description: 'Processus standard pour les bons de travail',
        isDefault: true,
        isActive: true,
      },
    });

    const statuses = [
      { code: 0, name: 'Créé', color: '#6B7280', position: 1, isInitial: true },
      { code: 100, name: 'Assigné', color: '#3B82F6', position: 2 },
      { code: 200, name: 'En progrès', color: '#F59E0B', position: 3, isStart: true },
      { code: 900, name: 'Complété (+)', color: '#10B981', position: 4, isTerminalPositive: true },
    ];

    for (const s of statuses) {
      await tx.processStatus.create({
        data: { tenantId, processDefinitionId: proc.id, ...s },
      });
    }
  }

  private async seedDefaultTemplate(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const template = await tx.workOrderTemplate.create({
      data: {
        tenantId,
        name: 'Standard',
        description:
          'Template par défaut — ajoutez sections et champs personnalisés au besoin',
        isActive: true,
      },
    });

    await tx.templateSection.create({
      data: {
        tenantId,
        templateId: template.id,
        name: 'Notes',
        sortOrder: 1,
      },
    });
  }
}
