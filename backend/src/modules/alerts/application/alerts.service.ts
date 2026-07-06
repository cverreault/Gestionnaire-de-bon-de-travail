import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ALERT_CHANNELS,
  isPublishableEvent,
  isValidChannel,
} from '../domain/alert-rule-engine';

/**
 * B10 — Alert rule CRUD and cache.
 *
 * Tenant-scoped by the Prisma middleware. Validates trigger + channel +
 * template inputs. Emits `apiIntegration.alertRule.{created,updated,deleted}`
 * so AuditListener records changes.
 *
 * Reads happen on the hot path (each domain event), so we keep an in-memory
 * cache keyed by tenantId — invalidated on any CRUD. The cache miss falls
 * back to a DB fetch.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  /** tenantId → array of active rules. Empty array = warm cache miss, no rules. */
  private cache = new Map<string, AlertRuleRow[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(input: CreateAlertRuleInput): Promise<AlertRuleRow> {
    this.validate(input);
    const row = await this.prisma.alertRule.create({
      data: {
        tenantId: input.tenantId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        isActive: input.isActive ?? true,
        eventName: input.eventName,
        processDefinitionId: input.processDefinitionId ?? null,
        fromStatusId: input.fromStatusId ?? null,
        toStatusId: input.toStatusId ?? null,
        taskTypeIds: input.taskTypeIds ?? [],
        templateIds: input.templateIds ?? [],
        clientTypeCodes: input.clientTypeCodes ?? [],
        addressTypeCodes: input.addressTypeCodes ?? [],
        priorityIn: input.priorityIn ?? [],
        recipientRoles: input.recipientRoles ?? [],
        recipientUserIds: input.recipientUserIds ?? [],
        recipientAssignedTechnician: input.recipientAssignedTechnician ?? false,
        recipientClient: input.recipientClient ?? false,
        channels: input.channels,
        titleTemplate: input.titleTemplate,
        bodyTemplate: input.bodyTemplate,
        clientTitleTemplate: input.clientTitleTemplate ?? null,
        clientBodyTemplate: input.clientBodyTemplate ?? null,
        createdByUserId: input.createdByUserId,
      },
      select: baseSelect,
    });
    this.cache.delete(input.tenantId);
    this.eventEmitter.emit('apiIntegration.alertRule.created', {
      eventName: 'apiIntegration.alertRule.created',
      occurredAt: new Date(),
      aggregateId: row.id,
      tenantId: input.tenantId,
      actorUserId: input.createdByUserId,
      data: { name: row.name, eventName: row.eventName },
    });
    return row;
  }

  async list(tenantId: string): Promise<AlertRuleRow[]> {
    return this.prisma.alertRule.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: baseSelect,
    });
  }

  async findOne(tenantId: string, id: string): Promise<AlertRuleRow> {
    const row = await this.prisma.alertRule.findFirst({
      where: { id, tenantId },
      select: baseSelect,
    });
    if (!row) throw new NotFoundException('Règle d\'alerte introuvable');
    return row;
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateAlertRuleInput,
  ): Promise<AlertRuleRow> {
    const existing = await this.prisma.alertRule.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Règle d\'alerte introuvable');

    // Only validate the fields being updated.
    this.validate({
      ...input,
      // Ensure required-shape fields are present for the validator when the
      // caller sends a partial. We treat unspecified as "keep existing" —
      // the validator only guards new values.
      tenantId,
      createdByUserId: 'ignored',
      name: input.name ?? '__existing__',
      eventName: input.eventName ?? 'workOrders.workOrder.created', // any valid placeholder
      channels: input.channels ?? ['inApp'],
      titleTemplate: input.titleTemplate ?? '.',
      bodyTemplate: input.bodyTemplate ?? '.',
    });

    const row = await this.prisma.alertRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description.trim(),
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.eventName !== undefined && { eventName: input.eventName }),
        ...(input.processDefinitionId !== undefined && {
          processDefinitionId: input.processDefinitionId,
        }),
        ...(input.fromStatusId !== undefined && {
          fromStatusId: input.fromStatusId,
        }),
        ...(input.toStatusId !== undefined && { toStatusId: input.toStatusId }),
        ...(input.taskTypeIds !== undefined && {
          taskTypeIds: input.taskTypeIds,
        }),
        ...(input.templateIds !== undefined && {
          templateIds: input.templateIds,
        }),
        ...(input.clientTypeCodes !== undefined && {
          clientTypeCodes: input.clientTypeCodes,
        }),
        ...(input.addressTypeCodes !== undefined && {
          addressTypeCodes: input.addressTypeCodes,
        }),
        ...(input.priorityIn !== undefined && { priorityIn: input.priorityIn }),
        ...(input.recipientRoles !== undefined && {
          recipientRoles: input.recipientRoles,
        }),
        ...(input.recipientUserIds !== undefined && {
          recipientUserIds: input.recipientUserIds,
        }),
        ...(input.recipientAssignedTechnician !== undefined && {
          recipientAssignedTechnician: input.recipientAssignedTechnician,
        }),
        ...(input.recipientClient !== undefined && {
          recipientClient: input.recipientClient,
        }),
        ...(input.channels !== undefined && { channels: input.channels }),
        ...(input.titleTemplate !== undefined && {
          titleTemplate: input.titleTemplate,
        }),
        ...(input.bodyTemplate !== undefined && {
          bodyTemplate: input.bodyTemplate,
        }),
        ...(input.clientTitleTemplate !== undefined && {
          clientTitleTemplate: input.clientTitleTemplate,
        }),
        ...(input.clientBodyTemplate !== undefined && {
          clientBodyTemplate: input.clientBodyTemplate,
        }),
      },
      select: baseSelect,
    });
    this.cache.delete(tenantId);
    this.eventEmitter.emit('apiIntegration.alertRule.updated', {
      eventName: 'apiIntegration.alertRule.updated',
      occurredAt: new Date(),
      aggregateId: row.id,
      tenantId,
      data: { name: row.name, isActive: row.isActive },
    });
    return row;
  }

  async remove(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<void> {
    const existing = await this.prisma.alertRule.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('Règle d\'alerte introuvable');
    await this.prisma.alertRule.delete({ where: { id } });
    this.cache.delete(tenantId);
    this.eventEmitter.emit('apiIntegration.alertRule.deleted', {
      eventName: 'apiIntegration.alertRule.deleted',
      occurredAt: new Date(),
      aggregateId: id,
      tenantId,
      actorUserId,
      data: { name: existing.name },
    });
  }

  /**
   * Called from AlertsListener on the hot path. Returns ACTIVE rules for
   * the tenant, cached per-tenant. Cache invalidated on any CRUD.
   */
  async getActiveForTenant(tenantId: string): Promise<AlertRuleRow[]> {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;
    const rows = await this.prisma.alertRule.findMany({
      where: { tenantId, isActive: true },
      select: baseSelect,
    });
    this.cache.set(tenantId, rows);
    return rows;
  }

  private validate(input: CreateAlertRuleInput | UpdateAlertRuleInput): void {
    if ('eventName' in input && input.eventName) {
      if (!isPublishableEvent(input.eventName)) {
        throw new BadRequestException(
          `Événement invalide : ${input.eventName}`,
        );
      }
    }
    if ('channels' in input && input.channels) {
      if (input.channels.length === 0) {
        throw new BadRequestException(
          'Au moins un canal doit être sélectionné.',
        );
      }
      for (const c of input.channels) {
        if (!isValidChannel(c)) {
          throw new BadRequestException(
            `Canal inconnu (${c}) — valeurs acceptées : ${ALERT_CHANNELS.join(', ')}`,
          );
        }
      }
    }
    if ('recipientRoles' in input && input.recipientRoles) {
      const validRoles = new Set<Role>([
        Role.ADMIN,
        Role.DISPATCHER,
        Role.TECHNICIAN,
      ]);
      for (const r of input.recipientRoles) {
        if (!validRoles.has(r as Role)) {
          throw new BadRequestException(`Rôle destinataire invalide : ${r}`);
        }
      }
    }
    if (
      'titleTemplate' in input &&
      input.titleTemplate &&
      input.titleTemplate.length > 500
    ) {
      throw new BadRequestException('Le titre est trop long (max 500 caractères).');
    }
    if (
      'bodyTemplate' in input &&
      input.bodyTemplate &&
      input.bodyTemplate.length > 5000
    ) {
      throw new BadRequestException('Le corps est trop long (max 5000 caractères).');
    }
    // Cross-check: recipientClient=true requires the client-facing template
    // pair — never leak internal state to the customer.
    if (
      'recipientClient' in input &&
      input.recipientClient === true &&
      (!input.clientTitleTemplate || !input.clientBodyTemplate)
    ) {
      throw new BadRequestException(
        'Un template client (titre + corps) est requis quand la case « Client » est cochée.',
      );
    }
  }
}

// ─── Types ─────────────────────────────────────────────────────────

const baseSelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  eventName: true,
  processDefinitionId: true,
  fromStatusId: true,
  toStatusId: true,
  taskTypeIds: true,
  templateIds: true,
  clientTypeCodes: true,
  addressTypeCodes: true,
  priorityIn: true,
  recipientRoles: true,
  recipientUserIds: true,
  recipientAssignedTechnician: true,
  recipientClient: true,
  channels: true,
  titleTemplate: true,
  bodyTemplate: true,
  clientTitleTemplate: true,
  clientBodyTemplate: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface AlertRuleRow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  eventName: string;
  processDefinitionId: string | null;
  fromStatusId: string | null;
  toStatusId: string | null;
  taskTypeIds: string[];
  templateIds: string[];
  clientTypeCodes: string[];
  addressTypeCodes: string[];
  priorityIn: string[];
  recipientRoles: Role[];
  recipientUserIds: string[];
  recipientAssignedTechnician: boolean;
  recipientClient: boolean;
  channels: string[];
  titleTemplate: string;
  bodyTemplate: string;
  clientTitleTemplate: string | null;
  clientBodyTemplate: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlertRuleInput {
  tenantId: string;
  createdByUserId: string;
  name: string;
  description?: string;
  isActive?: boolean;
  eventName: string;
  processDefinitionId?: string | null;
  fromStatusId?: string | null;
  toStatusId?: string | null;
  taskTypeIds?: string[];
  templateIds?: string[];
  clientTypeCodes?: string[];
  addressTypeCodes?: string[];
  priorityIn?: string[];
  recipientRoles?: Role[];
  recipientUserIds?: string[];
  recipientAssignedTechnician?: boolean;
  recipientClient?: boolean;
  channels: string[];
  titleTemplate: string;
  bodyTemplate: string;
  clientTitleTemplate?: string | null;
  clientBodyTemplate?: string | null;
}

export type UpdateAlertRuleInput = Partial<Omit<CreateAlertRuleInput, 'tenantId' | 'createdByUserId'>>;
