import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RequestContextService } from '../../../common/context/request-context.service';
import { deriveKey, encrypt, decrypt } from '../../../common/crypto/aes-gcm';

/**
 * Platform-level configuration store (SA.1.b).
 *
 * Resolution hierarchy when a consumer asks for a value via resolve():
 *   1. system_configs row (DB)         ← runtime override, super-admin UI
 *   2. process.env[envKey]             ← bootstrap / deployment-level
 *   3. undefined                       ← caller falls back to its own default
 *
 * `envKeyFor()` derives an env var name from a config key:
 *   "smtp.host" → "SMTP_HOST"
 *   "vapid.public-key" → "VAPID_PUBLIC_KEY"
 *   "audit.retentionDays" → "AUDIT_RETENTION_DAYS"
 *
 * Secrets (anything written with `encrypted: true`) are AES-GCM encrypted
 * with the master key sourced from CONFIG_MASTER_KEY. When that env is
 * absent, the service refuses to write new secrets but still serves
 * plaintext entries — pre-existing deployments don't break, but the SA
 * can't add encrypted values without explicit setup.
 */

export interface SetOpts {
  encrypted?: boolean;
  updatedBy?: string;
}

export interface ConfigSummary {
  key: string;
  encrypted: boolean;
  updatedAt: Date;
  updatedBy: string | null;
  source: 'db' | 'env' | 'none';
}

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);
  private masterKey: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly context: RequestContextService,
  ) {}

  onModuleInit() {
    const raw = this.config.get<string>('CONFIG_MASTER_KEY');
    if (raw) {
      this.masterKey = deriveKey(raw);
      this.logger.log('🔐 SystemConfigService: master key loaded — encrypted writes enabled');
    } else {
      this.logger.warn(
        '🔓 SystemConfigService: CONFIG_MASTER_KEY unset — encrypted writes will be rejected. ' +
        'Add CONFIG_MASTER_KEY to the env and restart to enable.',
      );
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Hierarchical resolver (B6.9 dual-scope) :
   *   1. TENANT row (tenantId = active request's tenant)  ← per-customer
   *   2. GLOBAL row (tenantId = NULL)                     ← SaaS-wide
   *   3. process.env[envKey]                              ← deployment
   *   4. undefined                                        ← caller default
   *
   * The TENANT step is skipped when there's no request context (cron,
   * seed, startup) or when no tenant is active. Result : a per-tenant
   * SMTP override seamlessly takes precedence over the operator's
   * default, but background jobs still see the GLOBAL value.
   */
  async resolve(key: string, envKey?: string): Promise<string | undefined> {
    const tenantId = this.context.current()?.tenantId;

    if (tenantId) {
      const tenantValue = await this.readScopedRow(key, tenantId);
      if (tenantValue !== undefined) return tenantValue;
    }

    const globalValue = await this.readScopedRow(key, null);
    if (globalValue !== undefined) return globalValue;

    const fromEnv = this.config.get<string>(envKey ?? envKeyFor(key));
    return fromEnv ?? undefined;
  }

  /**
   * DB-only read on the GLOBAL row. Kept for the existing
   * SuperAdminController + its specs ; consumers should prefer
   * resolve() so the TENANT scope kicks in automatically.
   */
  async get(key: string): Promise<string | undefined> {
    return this.readScopedRow(key, null);
  }

  /** Read a single row scoped to (key, tenantId). Returns undefined when absent or undecryptable. */
  private async readScopedRow(
    key: string,
    tenantId: string | null,
  ): Promise<string | undefined> {
    const row = await this.prisma.systemConfig.findFirst({
      where: { key, tenantId },
    });
    if (!row) return undefined;

    if (!row.encrypted) return row.value;

    if (!this.masterKey) {
      this.logger.error(
        `Cannot decrypt key="${key}" — CONFIG_MASTER_KEY is unset. Returning undefined.`,
      );
      return undefined;
    }
    try {
      return decrypt(row.value, this.masterKey);
    } catch (err) {
      this.logger.error(
        `Decryption failed for key="${key}" — wrong master key, or tampered value: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return undefined;
    }
  }

  /**
   * Persist a config value. Encrypts before insert when `encrypted: true`.
   *
   * scope :
   *   - 'GLOBAL' (default) — operator-wide, accessible to every tenant
   *     unless they have their own TENANT override. SuperAdmin only.
   *   - 'TENANT' — pass a tenantId. ADMIN of that tenant only.
   */
  async set(
    key: string,
    value: string,
    opts: SetOpts & { scope?: 'GLOBAL' | 'TENANT'; tenantId?: string | null } = {},
  ): Promise<void> {
    const encrypted = !!opts.encrypted;
    const scope = opts.scope ?? 'GLOBAL';
    const tenantId = scope === 'TENANT' ? opts.tenantId ?? null : null;

    if (scope === 'TENANT' && !tenantId) {
      throw new Error('TENANT scope requires a tenantId');
    }
    if (encrypted && !this.masterKey) {
      throw new Error(
        'Cannot persist encrypted value: CONFIG_MASTER_KEY is unset on this deployment.',
      );
    }

    const stored = encrypted ? encrypt(value, this.masterKey!) : value;

    await this.prisma.systemConfig.upsert({
      where: { tenantId_key: { tenantId: tenantId as unknown as string, key } },
      create: {
        key,
        value: stored,
        encrypted,
        scope,
        tenantId,
        updatedBy: opts.updatedBy ?? null,
      },
      update: {
        value: stored,
        encrypted,
        updatedBy: opts.updatedBy ?? null,
      },
    });
  }

  /** Remove a config entry. The hierarchical resolver will fall back to env. */
  async delete(
    key: string,
    opts: { scope?: 'GLOBAL' | 'TENANT'; tenantId?: string | null } = {},
  ): Promise<void> {
    const scope = opts.scope ?? 'GLOBAL';
    const tenantId = scope === 'TENANT' ? opts.tenantId ?? null : null;
    await this.prisma.systemConfig.deleteMany({
      where: { key, tenantId },
    });
  }

  /**
   * Lists every config key tracked in the DB without revealing the
   * value. Useful for the super-admin index page. The "source" field
   * is descriptive: 'db' if a DB row exists, 'env' otherwise.
   */
  async list(): Promise<ConfigSummary[]> {
    const rows = await this.prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({
      key: r.key,
      encrypted: r.encrypted,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
      source: 'db' as const,
    }));
  }

  /** Sentinel that lets callers check master-key state without exposing it. */
  isEncryptionAvailable(): boolean {
    return !!this.masterKey;
  }
}

/**
 * Mechanical mapping from config-key syntax to ENV_VAR syntax.
 *   - "."         → "_"
 *   - camelCase   → CAMEL_CASE (lowercase letter before uppercase gets _)
 *   - kebab-case  → KEBAB_CASE (- → _)
 *   - all uppercase
 */
export function envKeyFor(key: string): string {
  return key
    .replace(/[.\-]/g, '_')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toUpperCase();
}
