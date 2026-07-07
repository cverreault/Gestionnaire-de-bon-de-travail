import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'node:crypto';
import { assertPublicWebhookUrl, WebhookUrlError } from './webhook-url-guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { validateSubscribedEvents } from '../domain/webhook-events';
import { encryptSecret } from './secret-crypto';

/**
 * B9 — Webhook endpoint management.
 *
 * ─ Secret format ─
 *   `whsec_<32-b64url>` — ~190 bits entropy, format familiar to Stripe /
 *   GitHub integrators. Shown ONCE at creation and on regenerate; only
 *   SHA-256 hex lives in the DB (same shape as api-keys).
 *
 * ─ Tenant isolation ─
 *   Every method filters by `tenantId` — the tenant-scope middleware would
 *   catch a mistake here, but explicit is safer than implicit.
 *
 * ─ SSRF guard ─
 *   On create/update we resolve the URL's hostname via `dns.lookup` and
 *   reject any answer in a private / loopback / link-local range. This
 *   blocks the classic « point the webhook at the metadata IP » attack.
 *   http:// is rejected in production (NODE_ENV === 'production').
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /** Auto-disable after this many consecutive failed deliveries. */
  static readonly CONSECUTIVE_FAILURE_LIMIT = 15;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(input: CreateWebhookInput): Promise<CreateWebhookResult> {
    await this.validateUrl(input.url);
    const { ok, invalid } = validateSubscribedEvents(input.subscribedEvents);
    if (!ok) {
      throw new BadRequestException(
        `Événements invalides : ${invalid.join(', ')}`,
      );
    }
    const plaintext = generateSecret();
    const secretEncrypted = encryptSecret(plaintext);
    const secretPrefix = plaintext.slice(0, 8); // "whsec_ab"

    const row = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId: input.tenantId,
        name: input.name.trim(),
        url: input.url.trim(),
        secretEncrypted,
        secretPrefix,
        subscribedEvents: input.subscribedEvents,
        createdByUserId: input.createdByUserId,
        isActive: true,
      },
      select: baseSelect,
    });

    this.eventEmitter.emit('apiIntegration.webhook.endpoint.created', {
      eventName: 'apiIntegration.webhook.endpoint.created',
      occurredAt: new Date(),
      aggregateId: row.id,
      actorUserId: input.createdByUserId,
      tenantId: input.tenantId,
      data: { name: row.name, url: row.url, events: row.subscribedEvents },
    });

    return { ...toRow(row), plaintext };
  }

  async list(tenantId: string): Promise<WebhookRow[]> {
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select: baseSelect,
    });
    return rows.map(toRow);
  }

  async findOne(tenantId: string, id: string): Promise<WebhookRow> {
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
      select: baseSelect,
    });
    if (!row) throw new NotFoundException('Webhook introuvable');
    return toRow(row);
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateWebhookInput,
  ): Promise<WebhookRow> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
      select: { id: true, consecutiveFailures: true, disabledReason: true },
    });
    if (!existing) throw new NotFoundException('Webhook introuvable');

    if (input.url !== undefined) await this.validateUrl(input.url);
    if (input.subscribedEvents !== undefined) {
      const { ok, invalid } = validateSubscribedEvents(input.subscribedEvents);
      if (!ok) {
        throw new BadRequestException(
          `Événements invalides : ${invalid.join(', ')}`,
        );
      }
    }

    // Re-enabling a webhook clears its failure counter — the admin
    // implicitly confirms the receiver is fixed.
    const clearFailureState =
      input.isActive === true && existing.consecutiveFailures > 0;

    const row = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.url !== undefined && { url: input.url.trim() }),
        ...(input.subscribedEvents !== undefined && {
          subscribedEvents: input.subscribedEvents,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(clearFailureState && {
          consecutiveFailures: 0,
          disabledReason: null,
        }),
      },
      select: baseSelect,
    });

    this.eventEmitter.emit('apiIntegration.webhook.endpoint.updated', {
      eventName: 'apiIntegration.webhook.endpoint.updated',
      occurredAt: new Date(),
      aggregateId: row.id,
      tenantId,
      data: { name: row.name, isActive: row.isActive },
    });

    return toRow(row);
  }

  async regenerateSecret(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<CreateWebhookResult> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('Webhook introuvable');

    const plaintext = generateSecret();
    const secretEncrypted = encryptSecret(plaintext);
    const secretPrefix = plaintext.slice(0, 8);

    const row = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secretEncrypted, secretPrefix },
      select: baseSelect,
    });

    this.eventEmitter.emit('apiIntegration.webhook.secret.regenerated', {
      eventName: 'apiIntegration.webhook.secret.regenerated',
      occurredAt: new Date(),
      aggregateId: id,
      actorUserId,
      tenantId,
      data: { name: existing.name },
    });

    return { ...toRow(row), plaintext };
  }

  async remove(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<void> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('Webhook introuvable');
    // Soft-delete via isActive; keep the row for audit + delivery log
    // ownership. A real DELETE would cascade to `webhook_deliveries`.
    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        isActive: false,
        disabledReason: 'Supprimé par l\'administrateur',
      },
    });
    this.eventEmitter.emit('apiIntegration.webhook.endpoint.deleted', {
      eventName: 'apiIntegration.webhook.endpoint.deleted',
      occurredAt: new Date(),
      aggregateId: id,
      actorUserId,
      tenantId,
      data: { name: existing.name },
    });
  }

  /**
   * Recent delivery attempts for a given endpoint. Descending by createdAt.
   */
  async listDeliveries(
    tenantId: string,
    endpointId: string,
    limit = 50,
  ): Promise<DeliveryRow[]> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
      select: { id: true },
    });
    if (!endpoint) throw new NotFoundException('Webhook introuvable');

    const rows = await this.prisma.webhookDelivery.findMany({
      where: { tenantId, endpointId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      select: {
        id: true,
        eventId: true,
        eventName: true,
        status: true,
        attemptCount: true,
        lastResponseStatus: true,
        lastResponseBodyExcerpt: true,
        lastError: true,
        firstAttemptedAt: true,
        lastAttemptedAt: true,
        succeededAt: true,
        nextRetryAt: true,
        createdAt: true,
      },
    });
    return rows;
  }

  async retryDelivery(tenantId: string, deliveryId: string): Promise<void> {
    const existing = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Livraison introuvable');
    if (existing.status === 'succeeded') {
      throw new BadRequestException(
        'Cette livraison a déjà réussi — rien à retry.',
      );
    }
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'pending', nextRetryAt: new Date() },
    });
  }

  /**
   * Insert a synthetic `webhook.test` delivery for a given endpoint.
   * The dispatcher picks it up on its next tick like any other delivery.
   */
  async triggerTestDelivery(
    tenantId: string,
    endpointId: string,
  ): Promise<{ deliveryId: string }> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!endpoint) {
      throw new NotFoundException('Webhook introuvable ou désactivé');
    }
    const eventId = randomBytes(16).toString('hex');
    const payload = {
      id: eventId,
      type: 'webhook.test',
      createdAt: new Date().toISOString(),
      tenantId,
      data: {
        message:
          'Ceci est une livraison de test — reçue signifie que la signature et le réseau fonctionnent.',
      },
    };
    const created = await this.prisma.webhookDelivery.create({
      data: {
        tenantId,
        endpointId,
        eventId,
        eventName: 'webhook.test',
        payload,
        status: 'pending',
        nextRetryAt: new Date(),
      },
      select: { id: true },
    });
    return { deliveryId: created.id };
  }

  // ─── SSRF guard ────────────────────────────────────────────────────

  /**
   * Reject webhook URLs that would let a tenant point at TaskMgr's own
   * infra or a cloud metadata endpoint.
   */
  private async validateUrl(rawUrl: string): Promise<void> {
    // B26 — delegate to the shared SSRF guard (also used at delivery time).
    try {
      await assertPublicWebhookUrl(rawUrl);
    } catch (err) {
      if (err instanceof WebhookUrlError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}

// ─── Types ─────────────────────────────────────────────────────────

const baseSelect = {
  id: true,
  name: true,
  url: true,
  secretPrefix: true,
  subscribedEvents: true,
  isActive: true,
  disabledReason: true,
  consecutiveFailures: true,
  lastSuccessAt: true,
  lastFailureAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface RawRow {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  subscribedEvents: string[];
  isActive: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRow(row: RawRow): WebhookRow {
  return { ...row };
}

export interface CreateWebhookInput {
  tenantId: string;
  createdByUserId: string;
  name: string;
  url: string;
  subscribedEvents: string[];
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  subscribedEvents?: string[];
  isActive?: boolean;
}

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  subscribedEvents: string[];
  isActive: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookResult extends WebhookRow {
  /** ⚠️ Shown once — the caller must present it to the admin then discard. */
  plaintext: string;
}

export interface DeliveryRow {
  id: string;
  eventId: string;
  eventName: string;
  status: string;
  attemptCount: number;
  lastResponseStatus: number | null;
  lastResponseBodyExcerpt: string | null;
  lastError: string | null;
  firstAttemptedAt: Date | null;
  lastAttemptedAt: Date | null;
  succeededAt: Date | null;
  nextRetryAt: Date | null;
  createdAt: Date;
}

// ─── Helpers ───────────────────────────────────────────────────────

function generateSecret(): string {
  const random = randomBytes(32).toString('base64url').replace(/=+$/, '');
  return `whsec_${random}`;
}

// isReservedAddress lives in webhook-url-guard.ts (shared with delivery).
export { isReservedAddress } from './webhook-url-guard';
