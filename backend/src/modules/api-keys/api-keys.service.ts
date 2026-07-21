import type { ResolvedApiKey } from '../../common/contracts/api-key.contract';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Public API key management (B8).
 *
 * ─ Key format ─
 *   `tkm_<env>_<32-b64url>` — the prefix is scannable at a glance (secret
 *   scanners can flag leaked keys), the entropy sits in 32 base64-url
 *   bytes ≈ 190 bits. `<env>` is `live` in production, `dev` elsewhere.
 *
 * ─ Storage ─
 *   Only the SHA-256 hex of the full plaintext is stored (`keyHash`).
 *   The plaintext is returned to the caller of `mint()` exactly once —
 *   the UI surfaces it in a "copy now, never again" modal. Recovery is
 *   deliberately impossible ; a lost key must be revoked and reissued.
 *
 * ─ Scope model ─
 *   Coarse bundles : `read-only` ⊂ `read-write` ⊂ `admin`. Fine-grained
 *   permissions are a v2 concern — the DB column stores the bundle name
 *   as a plain string so evolving to a JSON scope list is a no-op
 *   migration.
 *
 * ─ Cross-tenant reads ─
 *   `resolveByPlaintext` uses `$queryRawUnsafe` because the auth-time
 *   lookup runs BEFORE the tenant context is set (no `tenantId` in the
 *   request yet). Raw SQL sidesteps the Prisma tenant-scope middleware.
 */
@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async mint(input: MintInput): Promise<MintResult> {
    if (!isValidScope(input.scope)) {
      throw new BadRequestException(
        `Scope invalide (${input.scope}) — valeurs acceptées : ${VALID_SCOPES.join(', ')}`,
      );
    }
    const plaintext = generatePlaintext();
    const keyHash = hashPlaintext(plaintext);
    const keyPrefix = plaintext.slice(0, 16); // "tkm_dev_abcd1234" style

    const created = await this.prisma.apiKey.create({
      data: {
        tenantId: input.tenantId,
        name: input.name.trim(),
        keyHash,
        keyPrefix,
        scope: input.scope,
        expiresAt: input.expiresAt ?? null,
        createdByUserId: input.createdByUserId,
      },
      select: {
        id: true,
        name: true,
        scope: true,
        keyPrefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    this.eventEmitter.emit('apiIntegration.key.created', {
      eventName: 'apiIntegration.key.created',
      occurredAt: new Date(),
      aggregateId: created.id,
      actorUserId: input.createdByUserId,
      tenantId: input.tenantId,
      data: { name: created.name, scope: created.scope, prefix: keyPrefix },
    });

    return {
      id: created.id,
      name: created.name,
      scope: created.scope,
      keyPrefix: created.keyPrefix,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
      plaintext,
    };
  }

  async list(tenantId: string): Promise<ApiKeyListRow[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scope: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return rows;
  }

  async revoke(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<void> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, revokedAt: true },
    });
    if (!existing) {
      throw new NotFoundException('Clé API introuvable');
    }
    if (existing.revokedAt) {
      throw new BadRequestException('Cette clé est déjà révoquée');
    }
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    this.eventEmitter.emit('apiIntegration.key.revoked', {
      eventName: 'apiIntegration.key.revoked',
      occurredAt: new Date(),
      aggregateId: id,
      actorUserId,
      tenantId,
      data: { name: existing.name },
    });
  }

  /**
   * Auth-time lookup. Runs BEFORE the tenant scope is set — must use raw
   * SQL to sidestep the Prisma tenant-scope middleware that would
   * otherwise inject the wrong `tenantId`.
   *
   * Returns null for : missing key, unknown hash, revoked, expired. Never
   * throws — the caller (Passport strategy) translates the null into a
   * 401.
   */
  async resolveByPlaintext(plaintext: string): Promise<ResolvedApiKey | null> {
    if (!plaintext || !plaintext.startsWith('tkm_')) return null;
    const keyHash = hashPlaintext(plaintext);

    type Row = {
      id: string;
      tenant_id: string;
      name: string;
      scope: string;
      expires_at: Date | null;
      revoked_at: Date | null;
      created_by_user_id: string;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, tenant_id, name, scope, expires_at, revoked_at, created_by_user_id
       FROM api_keys WHERE key_hash = $1 LIMIT 1`,
      keyHash,
    );
    const row = rows[0];
    if (!row) return null;
    if (row.revoked_at) return null;
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      scope: row.scope,
      createdByUserId: row.created_by_user_id,
    };
  }

  /**
   * Fire-and-forget bump of `last_used_at`. Errors are swallowed —
   * bookkeeping mustn't fail the request. Raw SQL to skip the middleware.
   */
  async touch(id: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
        id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to touch api_key ${id}: ${message}`);
    }
  }

  /**
   * Coarse hierarchy check. `admin ⊇ read-write ⊇ read-only`.
   * Throws Forbidden when the actual scope is too weak.
   */
  assertScopeSatisfies(actual: string, required: ApiKeyScope): void {
    const rank: Record<ApiKeyScope, number> = {
      'read-only': 1,
      'read-write': 2,
      admin: 3,
    };
    const actualRank = rank[actual as ApiKeyScope] ?? 0;
    if (actualRank === 0) {
      throw new ForbiddenException('Scope de clé API invalide');
    }
    if (actualRank < rank[required]) {
      throw new ForbiddenException(
        `Scope insuffisant : cette opération requiert « ${required} », la clé a « ${actual} »`,
      );
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export type ApiKeyScope = 'read-only' | 'read-write' | 'admin';
export const VALID_SCOPES: ApiKeyScope[] = ['read-only', 'read-write', 'admin'];
export function isValidScope(s: string): s is ApiKeyScope {
  return VALID_SCOPES.includes(s as ApiKeyScope);
}

export interface MintInput {
  tenantId: string;
  createdByUserId: string;
  name: string;
  scope: ApiKeyScope;
  expiresAt?: Date | null;
}

export interface MintResult {
  id: string;
  name: string;
  scope: string;
  keyPrefix: string;
  expiresAt: Date | null;
  createdAt: Date;
  /** ⚠️ Shown once — the caller must present it to the admin and then discard. */
  plaintext: string;
}

export interface ApiKeyListRow {
  id: string;
  name: string;
  keyPrefix: string;
  scope: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}


// ─── Helpers ────────────────────────────────────────────────────────

function generatePlaintext(): string {
  const env = process.env.NODE_ENV === 'production' ? 'live' : 'dev';
  // 32 random bytes → 43 chars base64-url, plenty of entropy for auth.
  const random = randomBytes(32).toString('base64url').replace(/=+$/, '');
  return `tkm_${env}_${random}`;
}

function hashPlaintext(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
