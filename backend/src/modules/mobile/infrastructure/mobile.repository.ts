import { Injectable } from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Read-only access of the `mobile` module to work orders, processes and
 * parts (documented exception, same as dashboard / search / reports — see
 * docs/modules/mobile.md). Own `select`, no import of work-order-includes.
 * Never writes to these tables.
 */

export const SYNC_WORK_ORDER_SELECT = {
  id: true,
  referenceNumber: true,
  status: true,
  type: true,
  title: true,
  description: true,
  priority: true,
  clientAddress: true,
  externalClientName: true,
  processDefinitionId: true,
  currentStepId: true,
  assignedToId: true,
  scheduledDate: true,
  scheduledStartTime: true,
  scheduledEndTime: true,
  actualStartTime: true,
  actualEndTime: true,
  completionNotes: true,
  negativeReason: true,
  signatureClient: true,
  signatureTechnician: true,
  signedAt: true,
  templateData: true,
  dispatchedAt: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, firstName: true, lastName: true, companyName: true, clientType: true, phone: true, email: true } },
  principalClient: { select: { id: true, firstName: true, lastName: true, companyName: true, clientType: true, phone: true, email: true } },
  clientAddress_rel: {
    select: {
      id: true, streetNumber: true, street: true, apartment: true, city: true, postalCode: true, province: true, label: true,
      latitude: true, longitude: true,
      propertyLandUseLabel: true, propertyYearBuilt: true, propertyDwellings: true, propertyStoreys: true,
    },
  },
  taskType: { select: { id: true, name: true, nameFr: true, nameEn: true, icon: true, color: true, templateId: true } },
  currentStep: {
    select: { id: true, code: true, name: true, nameFr: true, nameEn: true, color: true, isTerminalPositive: true, isTerminalNegative: true },
  },
  notes: {
    select: { id: true, content: true, createdAt: true, author: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
  attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true, uploadedAt: true }, orderBy: { uploadedAt: 'desc' as const } },
  partsUsed: {
    select: {
      id: true, partId: true, quantity: true, source: true,
      part: { select: { sku: true, name: true, nameFr: true, nameEn: true, unit: true } },
    },
  },
  // B44 — the tag-flatten middleware turns this into `tags: [{ id, name, color }]`.
  tags: { select: { tag: { select: { id: true, name: true, color: true } } }, orderBy: { tag: { name: 'asc' as const } } },
} satisfies Prisma.WorkOrderSelect;

export type SyncWorkOrderRow = Prisma.WorkOrderGetPayload<{ select: typeof SYNC_WORK_ORDER_SELECT }>;

const COMPLETED: WorkOrderStatus[] = [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.COMPLETED_NEGATIVE, WorkOrderStatus.CANCELLED];

@Injectable()
export class MobileRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** ADR-016 §1 : assigned to me AND (not completed OR changed within the window). */
  private visibleWhere(technicianId: string, completedSince: Date): Prisma.WorkOrderWhereInput {
    return {
      assignedToId: technicianId,
      OR: [{ status: { notIn: COMPLETED } }, { updatedAt: { gt: completedSince } }],
    };
  }

  async visibleIds(technicianId: string, completedSince: Date): Promise<string[]> {
    const rows = await this.prisma.workOrder.findMany({
      where: this.visibleWhere(technicianId, completedSince),
      select: { id: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => r.id);
  }

  /** Keyset page ordered by (updatedAt, id) ; `limit + 1` rows so the caller can compute hasMore. */
  async pageAfter(technicianId: string, completedSince: Date, cursor: { t: Date; id: string } | null, take: number): Promise<SyncWorkOrderRow[]> {
    const base = this.visibleWhere(technicianId, completedSince);
    const where: Prisma.WorkOrderWhereInput = cursor
      ? { AND: [base, { OR: [{ updatedAt: { gt: cursor.t } }, { updatedAt: cursor.t, id: { gt: cursor.id } }] }] }
      : base;
    return this.prisma.workOrder.findMany({
      where,
      select: SYNC_WORK_ORDER_SELECT,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  async processSnapshots(definitionIds: string[]) {
    if (definitionIds.length === 0) return [];
    return this.prisma.processDefinition.findMany({
      where: { id: { in: definitionIds } },
      select: {
        id: true, name: true, version: true, updatedAt: true,
        statuses: {
          select: {
            id: true, code: true, name: true, nameFr: true, nameEn: true, color: true, position: true,
            isInitial: true, isDispatch: true, isStart: true, isTerminalPositive: true, isTerminalNegative: true, isRequested: true, isCancelled: true,
          },
          orderBy: { position: 'asc' },
        },
        transitions: {
          select: { id: true, fromStatusId: true, toStatusId: true, label: true, labelFr: true, labelEn: true, allowedRoles: true, requiredFields: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  /** Form templates referenced by the page (sections + fields, with their role lists). */
  async templates(templateIds: string[]) {
    if (templateIds.length === 0) return [];
    return this.prisma.workOrderTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true, name: true, nameFr: true, nameEn: true, updatedAt: true,
        sections: {
          select: {
            id: true, name: true, nameFr: true, nameEn: true, sortOrder: true, viewRoles: true, editRoles: true,
            fields: {
              select: { id: true, label: true, labelFr: true, labelEn: true, fieldType: true, placeholder: true, helpText: true, options: true, sortOrder: true, viewRoles: true, editRoles: true, requiredRoles: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async partsStock(technicianId: string, since: Date | null) {
    return this.prisma.technicianPartStock.findMany({
      where: { technicianId, ...(since ? { updatedAt: { gt: since } } : {}) },
      select: { id: true, partId: true, quantity: true, updatedAt: true },
    });
  }

  async partsCatalog(since: Date | null) {
    return this.prisma.part.findMany({
      where: since ? { updatedAt: { gt: since } } : { isActive: true },
      select: { id: true, sku: true, name: true, nameFr: true, nameEn: true, unit: true, isActive: true, updatedAt: true },
      orderBy: { sku: 'asc' },
    });
  }
}
