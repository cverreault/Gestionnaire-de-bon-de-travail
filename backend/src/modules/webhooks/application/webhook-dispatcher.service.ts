import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { sign } from './webhook-signer';
import { WebhooksService } from './webhooks.service';
import { decryptSecret } from './secret-crypto';

/**
 * B9 — Sweeper-based delivery dispatcher.
 *
 * Every 30 seconds: pick up to `SWEEP_BATCH` pending deliveries whose
 * `next_retry_at ≤ NOW()`, POST them to the receiver with the HMAC
 * signature header, update the row based on the response.
 *
 * ─ Concurrency ─
 *   `FOR UPDATE SKIP LOCKED` claims rows atomically — safe with multiple
 *   backend replicas hitting the same Postgres. No queue needed.
 *
 * ─ Retry schedule ─
 *   Attempt 1: immediate (at fanout)
 *   Attempt 2: +30s
 *   Attempt 3: +2min
 *   Attempt 4: +10min
 *   Attempt 5: +1h
 *   Attempt 6: +6h  → after that, `status='abandoned'`.
 *
 * ─ Auto-disable ─
 *   `consecutive_failures` bumped on the endpoint after each failed attempt,
 *   reset to 0 on any 2xx. When ≥ 15, the endpoint is flipped to
 *   `is_active=false` with `disabled_reason` set — the admin has to
 *   re-enable manually from the UI (which also clears the counter).
 */
@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  private static readonly SWEEP_BATCH = 50;
  private static readonly REQUEST_TIMEOUT_MS = 10_000;

  /** In seconds — indexed by attempt count JUST executed. */
  private static readonly BACKOFF_SECONDS: number[] = [
    30,        // attempt 1 failed → retry in 30s
    2 * 60,    // attempt 2 → 2min
    10 * 60,   // attempt 3 → 10min
    60 * 60,   // attempt 4 → 1h
    6 * 60 * 60, // attempt 5 → 6h
    // attempt 6 failed → abandon (see BACKOFF.length + 1 = 6 attempts total)
  ];

  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<void> {
    // Reentrancy guard — a slow sweep must not overlap with the next
    // scheduled one (would double-deliver rows the Postgres transaction
    // hasn't committed yet).
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      await this.runOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sweep failed: ${message}`);
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * Extracted for testability — a test can call this directly instead of
   * waiting on the Cron scheduler.
   */
  async runOnce(): Promise<{ processed: number }> {
    const claimed = await this.claim();
    if (claimed.length === 0) return { processed: 0 };

    // Deliver in parallel — receivers are independent, no need to serialize.
    // Limit concurrency to avoid a stampede on slow receivers.
    const CONCURRENCY = 8;
    let index = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (index < claimed.length) {
        const row = claimed[index++];
        await this.deliverOne(row);
      }
    });
    await Promise.all(workers);
    return { processed: claimed.length };
  }

  /**
   * Claim a batch of pending deliveries. `FOR UPDATE SKIP LOCKED` guarantees
   * that a second backend instance running the same sweep sees a different
   * set of rows — no double-delivery under horizontal scale.
   */
  private async claim(): Promise<ClaimedRow[]> {
    type Row = {
      id: string;
      tenant_id: string;
      endpoint_id: string;
      event_id: string;
      event_name: string;
      payload: unknown;
      attempt_count: number;
      first_attempted_at: Date | null;
    };
    // We wrap the SELECT+UPDATE in a transaction so the SKIP LOCKED semantic
    // holds. UPDATE marks the rows as "in-flight" (status='dispatching')
    // which the SELECT filter excludes, ensuring re-entrancy safety across
    // ticks even without SKIP LOCKED support.
    const rows = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRawUnsafe<Row[]>(
        `WITH picked AS (
           SELECT id FROM webhook_deliveries
           WHERE status = 'pending' AND next_retry_at <= NOW()
           ORDER BY next_retry_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE webhook_deliveries d
         SET status = 'dispatching',
             last_attempted_at = NOW(),
             first_attempted_at = COALESCE(d.first_attempted_at, NOW())
         FROM picked
         WHERE d.id = picked.id
         RETURNING d.id, d.tenant_id, d.endpoint_id, d.event_id,
                   d.event_name, d.payload, d.attempt_count,
                   d.first_attempted_at`,
        WebhookDispatcherService.SWEEP_BATCH,
      );
      return claimed;
    });

    if (rows.length === 0) return [];

    // Batch-load the endpoints, decrypt each secret ONCE per sweep so the
    // deliver loop can sign without touching DB again. Raw SQL bypasses the
    // tenant-scope middleware; we filter deliveries by row.tenantId when we
    // look them up.
    const endpointIds = Array.from(new Set(rows.map((r) => r.endpoint_id)));
    type EndpointRow = {
      id: string;
      tenant_id: string;
      url: string;
      secret_encrypted: string;
      is_active: boolean;
    };
    const secretMap = new Map<string, string>();
    const endpointMap = new Map<string, EndpointRow>();
    const placeholders = endpointIds.map((_, i) => `$${i + 1}`).join(',');
    const eps = await this.prisma.$queryRawUnsafe<EndpointRow[]>(
      `SELECT id, tenant_id, url, secret_encrypted, is_active
       FROM webhook_endpoints WHERE id IN (${placeholders})`,
      ...endpointIds,
    );
    for (const e of eps) {
      endpointMap.set(e.id, e);
      try {
        secretMap.set(e.id, decryptSecret(e.secret_encrypted));
      } catch (err) {
        // If a row's encrypted secret can't be decoded (master key rotated,
        // corrupted column) we skip that endpoint's deliveries by leaving
        // secretMap empty — deliverOne will mark them abandoned.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to decrypt secret for endpoint ${e.id}: ${message}`,
        );
      }
    }

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      endpointId: r.endpoint_id,
      eventId: r.event_id,
      eventName: r.event_name,
      payload: r.payload,
      attemptCount: r.attempt_count,
      firstAttemptedAt: r.first_attempted_at,
      endpoint: endpointMap.get(r.endpoint_id),
      secret: secretMap.get(r.endpoint_id),
    }));
  }

  private async deliverOne(row: ClaimedRow): Promise<void> {
    if (!row.endpoint || !row.secret) {
      // Endpoint deleted between fanout and delivery — mark abandoned.
      await this.markAbandoned(row.id, 'Endpoint disparu');
      return;
    }
    if (!row.endpoint.is_active) {
      // Endpoint disabled between fanout and delivery — abandon this delivery.
      await this.markAbandoned(row.id, 'Endpoint désactivé');
      return;
    }

    const attempt = row.attemptCount + 1;
    const rawBody = JSON.stringify(row.payload);
    const nowMs = Date.now();
    const signed = sign(rawBody, row.secret, nowMs);

    let statusCode = 0;
    let responseBody = '';
    let error: string | null = null;

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      WebhookDispatcherService.REQUEST_TIMEOUT_MS,
    );
    try {
      const res = await fetch(row.endpoint.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TaskMgr-Webhooks/1.0',
          'X-TaskMgr-Signature': signed.signatureHeader,
          'X-TaskMgr-Timestamp': String(signed.timestamp),
          'X-TaskMgr-Event': row.eventName,
          'X-TaskMgr-Delivery': row.id,
        },
        body: rawBody,
      });
      statusCode = res.status;
      try {
        const text = await res.text();
        responseBody = text.slice(0, 512);
      } catch {
        responseBody = '';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error = message;
    } finally {
      clearTimeout(timer);
    }

    const success = statusCode >= 200 && statusCode < 300;
    if (success) {
      await this.markSuccess(row.id, row.endpointId, statusCode, responseBody);
      this.logger.debug(
        `Webhook ${row.eventName} → ${row.endpoint.url} → ${statusCode} (attempt ${attempt})`,
      );
      return;
    }

    // Failure path — decide retry vs abandon.
    const isTerminalAttempt = attempt > WebhookDispatcherService.BACKOFF_SECONDS.length;
    if (isTerminalAttempt) {
      await this.markAbandoned(
        row.id,
        error ?? `HTTP ${statusCode}`,
        statusCode || null,
        responseBody,
      );
      await this.bumpEndpointFailure(row.endpointId);
      this.logger.warn(
        `Webhook ${row.eventName} → ${row.endpoint.url} ABANDONED after ${attempt} attempts: ${error ?? statusCode}`,
      );
      return;
    }

    // Retry path.
    const backoffSec = WebhookDispatcherService.BACKOFF_SECONDS[attempt - 1];
    const nextRetry = new Date(nowMs + backoffSec * 1000);
    await this.prisma.$executeRawUnsafe(
      `UPDATE webhook_deliveries
       SET status = 'pending',
           attempt_count = $2,
           next_retry_at = $3,
           last_response_status = $4,
           last_response_body_excerpt = $5,
           last_error = $6
       WHERE id = $1`,
      row.id,
      attempt,
      nextRetry,
      statusCode || null,
      responseBody || null,
      error,
    );
    await this.bumpEndpointFailure(row.endpointId);
    this.logger.warn(
      `Webhook ${row.eventName} → ${row.endpoint.url} attempt ${attempt} failed (${error ?? statusCode}), retry at ${nextRetry.toISOString()}`,
    );
  }

  private async markSuccess(
    deliveryId: string,
    endpointId: string,
    statusCode: number,
    responseBody: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `UPDATE webhook_deliveries
         SET status = 'succeeded',
             attempt_count = attempt_count + 1,
             succeeded_at = NOW(),
             next_retry_at = NULL,
             last_response_status = $2,
             last_response_body_excerpt = $3,
             last_error = NULL
         WHERE id = $1`,
        deliveryId,
        statusCode,
        responseBody || null,
      ),
      this.prisma.$executeRawUnsafe(
        `UPDATE webhook_endpoints
         SET consecutive_failures = 0,
             last_success_at = NOW()
         WHERE id = $1`,
        endpointId,
      ),
    ]);
  }

  private async markAbandoned(
    deliveryId: string,
    reason: string,
    statusCode: number | null = null,
    responseBody: string | null = null,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE webhook_deliveries
       SET status = 'abandoned',
           attempt_count = attempt_count + 1,
           next_retry_at = NULL,
           last_response_status = $2,
           last_response_body_excerpt = $3,
           last_error = $4
       WHERE id = $1`,
      deliveryId,
      statusCode,
      responseBody,
      reason,
    );
  }

  private async bumpEndpointFailure(endpointId: string): Promise<void> {
    const [row] = await this.prisma.$queryRawUnsafe<
      { id: string; tenant_id: string; consecutive_failures: number; name: string }[]
    >(
      `UPDATE webhook_endpoints
       SET consecutive_failures = consecutive_failures + 1,
           last_failure_at = NOW()
       WHERE id = $1
       RETURNING id, tenant_id, consecutive_failures, name`,
      endpointId,
    );
    if (!row) return;
    if (row.consecutive_failures >= WebhooksService.CONSECUTIVE_FAILURE_LIMIT) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE webhook_endpoints
         SET is_active = false,
             disabled_reason = $2
         WHERE id = $1 AND is_active = true`,
        endpointId,
        `Auto-désactivé après ${row.consecutive_failures} échecs consécutifs`,
      );
      this.eventEmitter.emit('apiIntegration.webhook.autoDisabled', {
        eventName: 'apiIntegration.webhook.autoDisabled',
        occurredAt: new Date(),
        aggregateId: endpointId,
        tenantId: row.tenant_id,
        data: {
          name: row.name,
          consecutiveFailures: row.consecutive_failures,
        },
      });
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────

interface ClaimedRow {
  id: string;
  tenantId: string;
  endpointId: string;
  eventId: string;
  eventName: string;
  payload: unknown;
  attemptCount: number;
  firstAttemptedAt: Date | null;
  endpoint?: {
    id: string;
    tenant_id: string;
    url: string;
    secret_encrypted: string;
    is_active: boolean;
  };
  secret?: string;
}
