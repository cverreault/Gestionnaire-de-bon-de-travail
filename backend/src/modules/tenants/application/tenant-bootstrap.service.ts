import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createDefaultProcess } from '../../../common/contracts/default-process.contract';

/**
 * Minimal catalog every new tenant needs to be operable right after
 * signup (B6.7 → refined B7.6 to a true blank slate).
 *
 * Seeded :
 *   1. The canonical « Standard BT » process (8 statuses, 12 transitions —
 *      see common/contracts/default-process.contract.ts). Before B43 the
 *      bootstrap seeded 4 statuses and no transition, leaving new tenants
 *      unable to move a work order.
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
    await createDefaultProcess(tx, {
      tenantId,
      description: 'Processus standard pour les bons de travail',
    });
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
