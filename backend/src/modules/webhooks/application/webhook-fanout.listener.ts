import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  eventMatchesAny,
  isPublishableEvent,
} from '../domain/webhook-events';
import { WebhookPayloadBuilderService } from './webhook-payload-builder.service';

/**
 * B9 — Domain-event → delivery-row fanout.
 *
 * Subscribes to `**` (like AuditListener), filters to the publishable
 * whitelist, then INSERTs one `webhook_deliveries` row per matching
 * endpoint. The Cron dispatcher picks them up on its next tick.
 *
 * The listener is fire-and-forget from the emitter's perspective (any
 * error is logged, not thrown) — a webhook failure must never block the
 * business flow that triggered the event.
 */
@Injectable()
export class WebhookFanoutListener {
  private readonly logger = new Logger(WebhookFanoutListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: WebhookPayloadBuilderService,
  ) {}

  @OnEvent('**', { async: true, promisify: true })
  async onDomainEvent(payload: unknown): Promise<void> {
    try {
      await this.handle(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Webhook fanout skipped an event: ${message}`);
    }
  }

  private async handle(payload: unknown): Promise<void> {
    if (!isDomainEvent(payload)) return;
    if (!isPublishableEvent(payload.eventName)) return;
    if (!payload.tenantId) return;

    // Raw SQL to sidestep the tenant-scope middleware — cross-tenant lookup
    // safe because we explicitly filter to `payload.tenantId`.
    type EndpointRow = { id: string; subscribed_events: string[] };
    const endpoints = await this.prisma.$queryRawUnsafe<EndpointRow[]>(
      `SELECT id, subscribed_events FROM webhook_endpoints
       WHERE tenant_id = $1 AND is_active = true`,
      payload.tenantId,
    );
    if (endpoints.length === 0) return;

    const matched = endpoints.filter((e) =>
      eventMatchesAny(payload.eventName, e.subscribed_events),
    );
    if (matched.length === 0) return;

    const body = this.builder.build({
      eventName: payload.eventName,
      tenantId: payload.tenantId,
      occurredAt: payload.occurredAt instanceof Date ? payload.occurredAt : new Date(),
      data: payload.data,
      changes: (payload as { changes?: Record<string, { from: unknown; to: unknown }> }).changes,
    });
    const eventId = payload.eventId ?? body.id;
    const now = new Date();

    // Same event → N endpoints → N delivery rows. All start `pending` with
    // `next_retry_at=NOW()` so the dispatcher picks them up immediately.
    await this.prisma.webhookDelivery.createMany({
      data: matched.map((endpoint) => ({
        tenantId: payload.tenantId!,
        endpointId: endpoint.id,
        eventId,
        eventName: payload.eventName,
        // Cast to Prisma's InputJsonValue — payload has already been
        // sanitized upstream so we know it's JSON-safe.
        payload: { ...body, id: eventId } as unknown as Prisma.InputJsonValue,
        status: 'pending',
        nextRetryAt: now,
      })),
      skipDuplicates: false,
    });

    this.logger.debug(
      `Fanned out ${payload.eventName} to ${matched.length} endpoint(s) for tenant ${payload.tenantId}`,
    );
  }
}

// ─── Types ────────────────────────────────────────────────────────

interface DomainEventShape {
  eventName: string;
  tenantId?: string;
  occurredAt?: Date;
  eventId?: string;
  data?: unknown;
}

function isDomainEvent(x: unknown): x is DomainEventShape {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { eventName?: unknown }).eventName === 'string'
  );
}
