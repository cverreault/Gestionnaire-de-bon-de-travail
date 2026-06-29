import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Seeds the minimum catalog every new tenant needs to be operable
 * right after signup (B6.7).
 *
 * Run inside the same transaction as the Tenant + ADMIN user creation
 * — if any step fails, the whole signup rolls back and the user can
 * retry without orphaned rows.
 *
 * Order :
 *   1. Default process (CREATED → ASSIGNED → IN_PROGRESS → COMPLETED)
 *   2. Default task types (Installation / Réparation / Maintenance / Inspection / Autre)
 *   3. Default client types (RESIDENTIAL / COMMERCIAL)
 *   4. Default address types (RESIDENCE / OFFICE / WORKSITE)
 *
 * The defaults match what the global seed (`prisma/seed.ts`) created
 * for the DEFAULT tenant — a brand new tenant starts on the same
 * footing as the self-hosted single-tenant baseline.
 */
@Injectable()
export class TenantBootstrapService {
  private readonly logger = new Logger(TenantBootstrapService.name);

  async seed(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await this.seedProcess(tx, tenantId);
    await this.seedTaskTypes(tx, tenantId);
    await this.seedClientTypes(tx, tenantId);
    await this.seedAddressTypes(tx, tenantId);
    this.logger.log(`✅ Seeded catalog for tenant ${tenantId}`);
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

    // 4 status nodes matching the legacy WorkOrderStatus mapping.
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

  private async seedTaskTypes(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const types = [
      { name: 'Installation', prefix: 'INST', description: 'Installation de nouveaux équipements', color: '#3B82F6', icon: 'tool' },
      { name: 'Réparation',   prefix: 'REP',  description: 'Réparation d\'équipements défectueux', color: '#EF4444', icon: 'wrench' },
      { name: 'Maintenance',  prefix: 'MNT',  description: 'Entretien préventif', color: '#F59E0B', icon: 'settings' },
      { name: 'Inspection',   prefix: 'INSP', description: 'Inspection et vérification', color: '#8B5CF6', icon: 'search' },
      { name: 'Autre',        prefix: 'AUT',  description: 'Autre type de tâche', color: '#6B7280', icon: 'more-horizontal' },
    ];

    for (const t of types) {
      await tx.taskType.create({
        data: { tenantId, ...t, isActive: true },
      });
    }
  }

  private async seedClientTypes(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const types = [
      { code: 'RESIDENTIAL', name: 'Résidentiel', color: '#3B82F6', icon: 'home', sortOrder: 1 },
      { code: 'COMMERCIAL',  name: 'Commercial',  color: '#10B981', icon: 'building', sortOrder: 2 },
    ];
    for (const t of types) {
      await tx.clientTypeConfig.create({
        data: { tenantId, ...t, isActive: true },
      });
    }
  }

  private async seedAddressTypes(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const types = [
      { code: 'RESIDENCE', name: 'Résidence', color: '#3B82F6', icon: 'home', sortOrder: 1 },
      { code: 'OFFICE',    name: 'Bureau',    color: '#10B981', icon: 'building', sortOrder: 2 },
      { code: 'WORKSITE',  name: 'Chantier',  color: '#F59E0B', icon: 'hard-hat', sortOrder: 3 },
    ];
    for (const t of types) {
      await tx.addressTypeConfig.create({
        data: { tenantId, ...t, isActive: true },
      });
    }
  }
}
