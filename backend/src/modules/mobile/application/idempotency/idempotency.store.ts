import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  IDEMPOTENCY_STALE_MS,
  IDEMPOTENCY_TTL_MS,
  type IIdempotencyStore,
  type IdempotencyBegin,
  type IdempotencyRequest,
  type IdempotencyScope,
} from '../../../../common/contracts/idempotency.contract';

/**
 * Prisma-backed store for `@Idempotent()` handlers (ADR-016 §3). Owned by
 * `mobile`, bound to `IDEMPOTENCY_STORE` in the (global) MobileModule.
 * The claim is an INSERT on the unique `(tenant, user, key)`: two concurrent
 * identical requests race on the constraint, the loser sees IN_PROGRESS.
 */
@Injectable()
export class IdempotencyStore implements IIdempotencyStore {
  private readonly logger = new Logger(IdempotencyStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async begin(scope: IdempotencyScope, req: IdempotencyRequest): Promise<IdempotencyBegin> {
    try {
      await this.prisma.idempotencyKey.create({
        data: { tenantId: scope.tenantId, userId: scope.userId, key: req.key, method: req.method, path: req.path, requestHash: req.requestHash, status: 'IN_PROGRESS' },
      });
      return { state: 'NEW' };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }

    const row = await this.prisma.idempotencyKey.findUnique({
      where: { tenantId_userId_key: { tenantId: scope.tenantId, userId: scope.userId, key: req.key } },
    });
    if (!row) return { state: 'IN_PROGRESS' };
    if (row.requestHash !== req.requestHash) return { state: 'MISMATCH' };
    if (row.status === 'DONE') return { state: 'DONE', statusCode: row.statusCode ?? 200, body: row.responseBody ?? null };

    // Crashed mid-flight (no complete/release) : hand the key back to this request.
    if (Date.now() - row.createdAt.getTime() > IDEMPOTENCY_STALE_MS) {
      await this.prisma.idempotencyKey.update({ where: { id: row.id }, data: { createdAt: new Date() } });
      return { state: 'NEW' };
    }
    return { state: 'IN_PROGRESS' };
  }

  async complete(scope: IdempotencyScope, key: string, statusCode: number, body: unknown): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { tenantId_userId_key: { tenantId: scope.tenantId, userId: scope.userId, key } },
      data: { status: 'DONE', statusCode, responseBody: (body ?? Prisma.JsonNull) as Prisma.InputJsonValue },
    });
  }

  async release(scope: IdempotencyScope, key: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({ where: { tenantId: scope.tenantId, userId: scope.userId, key } });
  }

  /** Nightly purge (48 h TTL). Runs outside a request: all tenants. */
  @Cron('20 4 * * *', { name: 'idempotency-cleanup' })
  async cleanup(): Promise<number> {
    const r = await this.prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } } });
    if (r.count > 0) this.logger.log(`Purged ${r.count} idempotency key(s) older than 48 h`);
    return r.count;
  }
}
