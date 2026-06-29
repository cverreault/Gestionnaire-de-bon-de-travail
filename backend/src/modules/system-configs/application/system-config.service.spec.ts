/**
 * QA — system-config.service.spec.ts
 */

import { SystemConfigService, envKeyFor } from './system-config.service';

interface ConfigRow {
  key: string;
  value: string;
  encrypted: boolean;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
}

function makeMockPrisma(seed: ConfigRow[] = []) {
  const rows: ConfigRow[] = [...seed];
  return {
    _rows: rows,
    systemConfig: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(rows.find((r) => r.key === where.key) ?? null),
      ),
      findMany: jest.fn(() =>
        Promise.resolve([...rows].sort((a, b) => a.key.localeCompare(b.key))),
      ),
      upsert: jest.fn(({ where, create, update }: any) => {
        // B6 — `where` uses the composite (tenantId, key) shape. The
        // existing spec previously read `where.key` directly; now it
        // pulls the key out of `where.tenantId_key.key`.
        const key = where?.tenantId_key?.key ?? where?.key;
        const existing = rows.find((r) => r.key === key);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return Promise.resolve(existing);
        }
        const fresh: ConfigRow = { ...create, updatedAt: new Date(), createdAt: new Date() };
        rows.push(fresh);
        return Promise.resolve(fresh);
      }),
      deleteMany: jest.fn(({ where }: any) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].key === where.key) rows.splice(i, 1);
        }
        return Promise.resolve({ count: before - rows.length });
      }),
    },
  };
}

function makeConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => env[key]),
  };
}

function buildSvc(prisma: any, env: Record<string, string | undefined> = {}) {
  const svc = new SystemConfigService(prisma as any, makeConfig(env) as any);
  // Always init — the test setup is intentionally tight.
  svc.onModuleInit();
  return svc;
}

// ── envKeyFor ────────────────────────────────────────────────────────────────

describe('envKeyFor', () => {
  it('translates dot.kebab.camelCase to ENV_NAME', () => {
    expect(envKeyFor('smtp.host')).toBe('SMTP_HOST');
    expect(envKeyFor('vapid.public-key')).toBe('VAPID_PUBLIC_KEY');
    expect(envKeyFor('audit.retentionDays')).toBe('AUDIT_RETENTION_DAYS');
    expect(envKeyFor('sentry.dsn')).toBe('SENTRY_DSN');
  });
});

// ── resolve hierarchy ───────────────────────────────────────────────────────

describe('SystemConfigService.resolve', () => {
  it('returns the DB row when present (DB wins over env)', async () => {
    const prisma = makeMockPrisma([
      {
        key: 'smtp.host',
        value: 'smtp.from.db',
        encrypted: false,
        updatedBy: 'sa-1',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const svc = buildSvc(prisma, { SMTP_HOST: 'smtp.from.env' });

    expect(await svc.resolve('smtp.host')).toBe('smtp.from.db');
  });

  it('falls back to env when no DB row exists', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma, { SMTP_HOST: 'smtp.from.env' });

    expect(await svc.resolve('smtp.host')).toBe('smtp.from.env');
  });

  it('returns undefined when neither DB nor env has the value', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);

    expect(await svc.resolve('smtp.host')).toBeUndefined();
  });

  it('honors a custom envKey override', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma, { CUSTOM_NAME: 'custom-value' });

    expect(await svc.resolve('something.else', 'CUSTOM_NAME')).toBe('custom-value');
  });
});

// ── get / set / delete ─────────────────────────────────────────────────────

describe('SystemConfigService get/set/delete', () => {
  it('round-trips a plain (non-encrypted) value', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma);

    await svc.set('app.tagline', 'Hello world', { updatedBy: 'sa-1' });
    expect(await svc.get('app.tagline')).toBe('Hello world');

    const row = prisma._rows[0];
    expect(row.encrypted).toBe(false);
    expect(row.value).toBe('Hello world');
    expect(row.updatedBy).toBe('sa-1');
  });

  it('round-trips an encrypted value (CONFIG_MASTER_KEY set)', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma, { CONFIG_MASTER_KEY: 'test-master' });

    await svc.set('smtp.pass', 's3cr3t', { encrypted: true, updatedBy: 'sa-1' });
    expect(await svc.get('smtp.pass')).toBe('s3cr3t');

    // The stored value is NOT the plaintext.
    expect(prisma._rows[0].encrypted).toBe(true);
    expect(prisma._rows[0].value).not.toBe('s3cr3t');
    expect(prisma._rows[0].value).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it('rejects encrypted writes when CONFIG_MASTER_KEY is unset', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma); // no env

    await expect(
      svc.set('smtp.pass', 's3cr3t', { encrypted: true }),
    ).rejects.toThrow(/CONFIG_MASTER_KEY is unset/);
  });

  it('still serves plain rows when CONFIG_MASTER_KEY is unset', async () => {
    const prisma = makeMockPrisma([
      {
        key: 'app.tagline',
        value: 'public-info',
        encrypted: false,
        updatedBy: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    const svc = buildSvc(prisma); // no master key

    expect(await svc.get('app.tagline')).toBe('public-info');
  });

  it('returns undefined when an encrypted row cannot be decrypted (no key)', async () => {
    const prisma = makeMockPrisma();
    // Seed a row encrypted with a different master, then read it without one.
    const seeder = buildSvc(prisma, { CONFIG_MASTER_KEY: 'seeder-master' });
    await seeder.set('smtp.pass', 's3cr3t', { encrypted: true });

    const reader = buildSvc(prisma); // no master key
    expect(await reader.get('smtp.pass')).toBeUndefined();
  });

  it('returns undefined when the master key changed (decryption failure)', async () => {
    const prisma = makeMockPrisma();
    const writer = buildSvc(prisma, { CONFIG_MASTER_KEY: 'original' });
    await writer.set('smtp.pass', 's3cr3t', { encrypted: true });

    const reader = buildSvc(prisma, { CONFIG_MASTER_KEY: 'rotated-by-mistake' });
    expect(await reader.get('smtp.pass')).toBeUndefined();
  });

  it('delete() removes a row and resolve() then falls back to env', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma, { SMTP_HOST: 'smtp.env.io' });

    await svc.set('smtp.host', 'smtp.db.io');
    expect(await svc.resolve('smtp.host')).toBe('smtp.db.io');

    await svc.delete('smtp.host');
    expect(await svc.resolve('smtp.host')).toBe('smtp.env.io');
  });

  it('list() returns every key with its metadata, never the value', async () => {
    const prisma = makeMockPrisma();
    const svc = buildSvc(prisma, { CONFIG_MASTER_KEY: 'm' });
    await svc.set('smtp.pass', 's', { encrypted: true, updatedBy: 'sa-1' });
    await svc.set('app.tagline', 't', { updatedBy: 'sa-1' });

    const items = await svc.list();
    expect(items).toHaveLength(2);
    // Sorted by key.
    expect(items.map((i) => i.key)).toEqual(['app.tagline', 'smtp.pass']);
    // No `value` exposed.
    for (const item of items) {
      expect(item).not.toHaveProperty('value');
    }
    // Encrypted flag preserved.
    expect(items.find((i) => i.key === 'smtp.pass')!.encrypted).toBe(true);
    expect(items.find((i) => i.key === 'app.tagline')!.encrypted).toBe(false);
  });
});

// ── isEncryptionAvailable ──────────────────────────────────────────────────

describe('SystemConfigService.isEncryptionAvailable', () => {
  it('reflects whether the master key was loaded', () => {
    const withKey = buildSvc(makeMockPrisma(), { CONFIG_MASTER_KEY: 'x' });
    expect(withKey.isEncryptionAvailable()).toBe(true);

    const withoutKey = buildSvc(makeMockPrisma());
    expect(withoutKey.isEncryptionAvailable()).toBe(false);
  });
});
