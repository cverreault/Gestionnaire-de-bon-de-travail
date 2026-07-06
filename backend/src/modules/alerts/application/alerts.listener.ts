import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  isPublishableEvent,
  match,
  type AlertRule as EngineRule,
  type MatchContext,
} from '../domain/alert-rule-engine';
import { AlertsService, type AlertRuleRow } from './alerts.service';
import { RecipientResolverService } from './recipient-resolver.service';
import { AlertDispatcherService, type DispatchContext } from './alert-dispatcher.service';

/**
 * B10 — Turns a domain event into alert dispatches.
 *
 * 1. Filter to the publishable whitelist (skip internal-only events).
 * 2. Extract a MatchContext from the event payload (see hydrateContext).
 * 3. Fetch active rules for the tenant (cached by AlertsService).
 * 4. Match. For each hit: resolve recipients, build a DispatchContext by
 *    reading the WO with its relations, delegate to AlertDispatcherService.
 *
 * All errors are logged and swallowed — a broken alert must never fail the
 * business transition that fired the event.
 */
@Injectable()
export class AlertsListener {
  private readonly logger = new Logger(AlertsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly recipients: RecipientResolverService,
    private readonly dispatcher: AlertDispatcherService,
  ) {}

  @OnEvent('workOrders.**', { async: true, promisify: true })
  async onWorkOrderEvent(event: unknown): Promise<void> {
    try {
      await this.handle(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Alerts fanout swallowed an error: ${message}`);
    }
  }

  @OnEvent('clients.**', { async: true, promisify: true })
  async onClientEvent(event: unknown): Promise<void> {
    try {
      await this.handle(event);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Alerts fanout swallowed a client-event error: ${message}`);
    }
  }

  private async handle(rawEvent: unknown): Promise<void> {
    const event = coerceEvent(rawEvent);
    if (!event) return;
    if (!isPublishableEvent(event.name)) return;

    // The event object doesn't carry `tenantId` for WO events — we read it
    // off the WO row. Client events already carry tenantId in their data.
    const tenantId = await this.resolveTenantId(event);
    if (!tenantId) return;

    const activeRules = await this.alerts.getActiveForTenant(tenantId);
    if (activeRules.length === 0) return;

    // For work-order events we hydrate the WO ONCE, with all fields both
    // the match phase and the dispatch phase need — templateId, clientType
    // and addressType aren't on the event payload, they live on the WO
    // itself and on its client + clientAddress relations.
    let hydratedWO: HydratedWO | null = null;
    if (event.name.startsWith('workOrders.') && event.aggregateId) {
      hydratedWO = await this.fetchWorkOrder(event.aggregateId);
      if (!hydratedWO) return;
    }

    const matchCtx = this.buildMatchContext(event, hydratedWO);
    // `AlertRuleRow` is a superset of the engine's `AlertRule` shape — the
    // engine matches on a narrow subset of fields, and `match()` returns
    // the same objects it was handed. Cast back to the full row so we can
    // dispatch with all the template + recipient fields.
    const hits = match(matchCtx, activeRules as unknown as EngineRule[]) as unknown as AlertRuleRow[];
    if (hits.length === 0) return;

    const dispatchCtx = await this.buildDispatchContext(event, tenantId, hydratedWO);
    if (!dispatchCtx) return;

    for (const rule of hits) {
      try {
        const targets = await this.recipients.resolve(rule, {
          tenantId,
          workOrderId: dispatchCtx.workOrder?.id,
          assignedTechnicianUserId: dispatchCtx.technician?.id ?? null,
          clientId: dispatchCtx.client?.id ?? null,
        });
        await this.dispatcher.dispatch(rule, targets, dispatchCtx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Alert rule ${rule.id} dispatch failed: ${message}`,
        );
      }
    }
  }

  /**
   * One-shot fetch of the WO with every field the match phase or the
   * dispatch phase may read — templateId + client.clientType +
   * clientAddress_rel.addressType are all pulled here to power the new
   * B10.1 filters (see ADR-013).
   */
  private async fetchWorkOrder(id: string): Promise<HydratedWO | null> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        referenceNumber: true,
        title: true,
        priority: true,
        negativeReason: true,
        clientId: true,
        assignedToId: true,
        taskTypeId: true,
        clientAddressId: true,
        // Template is attached to TaskType, not directly to the WO.
        taskType: {
          select: { templateId: true },
        },
        client: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
            clientType: true,
          },
        },
        clientAddress_rel: {
          select: { addressType: true },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
    if (!wo) return null;
    return {
      ...wo,
      // Flatten the derived template id so downstream code doesn't have to
      // know it came through TaskType.
      templateId: wo.taskType?.templateId ?? null,
    };
  }

  private async resolveTenantId(event: NormalizedEvent): Promise<string | null> {
    if (event.tenantId) return event.tenantId;
    if (event.name.startsWith('workOrders.') && event.aggregateId) {
      const wo = await this.prisma.workOrder.findUnique({
        where: { id: event.aggregateId },
        select: { tenantId: true },
      });
      return wo?.tenantId ?? null;
    }
    return null;
  }

  private buildMatchContext(
    event: NormalizedEvent,
    wo: HydratedWO | null,
  ): MatchContext {
    const data = (event.data ?? {}) as Record<string, unknown>;
    return {
      eventName: event.name,
      workOrderId: event.aggregateId ?? undefined,
      processDefinitionId: (data.processDefinitionId as string | undefined) ?? null,
      fromStatusId: (data.fromStatusId as string | undefined) ?? null,
      toStatusId: (data.toStatusId as string | undefined) ?? null,
      // Prefer the WO row (source of truth). Fall back to what's on the
      // event payload for non-WO events that don't have a WO to hydrate.
      taskTypeId: wo?.taskTypeId ?? (data.taskTypeId as string | undefined) ?? null,
      templateId: wo?.templateId ?? (data.templateId as string | undefined) ?? null,
      clientTypeCode: wo?.client?.clientType ?? (data.clientType as string | undefined) ?? null,
      addressTypeCode:
        wo?.clientAddress_rel?.addressType ??
        (data.addressType as string | undefined) ??
        null,
      // `priority` on the WO is an Int (see schema); the rule filter is a
      // string whitelist. Coerce to string so the equality check works —
      // the UI stores '0'/'1'/'2' too.
      priority:
        wo?.priority !== undefined && wo?.priority !== null
          ? String(wo.priority)
          : (data.priority as string | undefined) ?? null,
    };
  }

  private async buildDispatchContext(
    event: NormalizedEvent,
    tenantId: string,
    wo: HydratedWO | null,
  ): Promise<DispatchContext | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    // WO events → wo is pre-hydrated in handle().
    if (event.name.startsWith('workOrders.') && wo) {
      const data = (event.data ?? {}) as Record<string, unknown>;
      const [fromLabel, toLabel] = await this.resolveTransitionLabels(
        (data.fromStatusId as string | undefined) ?? null,
        (data.toStatusId as string | undefined) ?? null,
      );

      return {
        workOrder: {
          id: wo.id,
          referenceNumber: wo.referenceNumber,
          title: wo.title,
          priority: wo.priority,
          negativeReason: (wo as unknown as { negativeReason: string | null }).negativeReason ?? null,
        },
        transition: {
          from: (data.fromStatusId as string | undefined) ?? null,
          to: (data.toStatusId as string | undefined) ?? null,
          fromLabel,
          toLabel,
        },
        technician: wo.assignedTo
          ? {
              id: wo.assignedTo.id,
              name: `${wo.assignedTo.firstName ?? ''} ${wo.assignedTo.lastName ?? ''}`.trim(),
              email: wo.assignedTo.email ?? null,
            }
          : { id: null, name: null, email: null },
        client: wo.client
          ? {
              id: wo.client.id,
              name:
                wo.client.companyName ??
                `${wo.client.firstName ?? ''} ${wo.client.lastName ?? ''}`.trim(),
              email: wo.client.email ?? null,
            }
          : { id: null, name: null, email: null },
        tenant: tenant
          ? { id: tenant.id, name: tenant.name }
          : { id: tenantId },
      };
    }

    // Client events — minimal context; alerts on clients are useful for
    // syncing external systems (e.g. « nouveau client → CRM externe ») but
    // rarely for admin notifications.
    if (event.name.startsWith('clients.')) {
      const clientId = event.aggregateId;
      return {
        client: clientId ? { id: clientId } : undefined,
        tenant: tenant ? { id: tenant.id, name: tenant.name } : { id: tenantId },
      };
    }

    return { tenant: tenant ? { id: tenant.id, name: tenant.name } : { id: tenantId } };
  }

  private async resolveTransitionLabels(
    fromId: string | null,
    toId: string | null,
  ): Promise<[string | null, string | null]> {
    const ids = [fromId, toId].filter((x): x is string => !!x);
    if (ids.length === 0) return [null, null];
    const statuses = await this.prisma.processStatus.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const byId = new Map(statuses.map((s) => [s.id, s.name]));
    return [
      fromId ? byId.get(fromId) ?? null : null,
      toId ? byId.get(toId) ?? null : null,
    ];
  }
}

// ─── Types ────────────────────────────────────────────────────────

interface HydratedWO {
  id: string;
  tenantId: string;
  referenceNumber: string;
  title: string;
  priority: number | null;
  negativeReason: string | null;
  clientId: string | null;
  assignedToId: string | null;
  taskTypeId: string | null;
  templateId: string | null;
  clientAddressId: string | null;
  client: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    clientType: string | null;
  } | null;
  clientAddress_rel: { addressType: string | null } | null;
  assignedTo: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

interface NormalizedEvent {
  name: string;
  eventId?: string;
  aggregateId?: string;
  tenantId?: string;
  actorUserId?: string | null;
  data?: unknown;
}

function coerceEvent(x: unknown): NormalizedEvent | null {
  if (!x || typeof x !== 'object') return null;
  const obj = x as Record<string, unknown>;
  // Support both { name } (from work-order-events.ts makeEvent) and
  // { eventName } (from the ad-hoc emits in clients.service.ts).
  const name = (obj.name as string | undefined) ?? (obj.eventName as string | undefined);
  if (!name) return null;
  return {
    name,
    eventId: obj.eventId as string | undefined,
    aggregateId: obj.aggregateId as string | undefined,
    tenantId: obj.tenantId as string | undefined,
    actorUserId: (obj.actorUserId as string | null | undefined) ?? null,
    data: obj.data,
  };
}
