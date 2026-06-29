import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
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
   * Hierarchical resolver. Returns the first non-empty source:
   * DB row → env var → undefined.
   *
   * The env mapping is mechanical (envKeyFor). Callers needing a custom
   * env name can pass envKey explicitly.
   */
  async resolve(key: string, envKey?: string): Promise<string | undefined> {
    const dbValue = await this.get(key);
    if (dbValue !== undefined) return dbValue;
    const fromEnv = this.config.get<string>(envKey ?? envKeyFor(key));
    return fromEnv ?? undefined;
  }

  /** DB-only read. Decrypts if needed. Returns undefined if absent. */
  async get(key: string): Promise<string | undefined> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
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

  /** Persist a config value. Encrypts before insert when `encrypted: true`. */
  async set(key: string, value: string, opts: SetOpts = {}): Promise<void> {
    const encrypted = !!opts.encrypted;

    if (encrypted && !this.masterKey) {
      throw new Error(
        'Cannot persist encrypted value: CONFIG_MASTER_KEY is unset on this deployment.',
      );
    }

    const stored = encrypted ? encrypt(value, this.masterKey!) : value;

    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value: stored, encrypted, updatedBy: opts.updatedBy ?? null },
      update: { value: stored, encrypted, updatedBy: opts.updatedBy ?? null },
    });
  }

  /** Remove a config entry. The hierarchical resolver will fall back to env. */
  async delete(key: string): Promise<void> {
    await this.prisma.systemConfig.deleteMany({ where: { key } });
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
