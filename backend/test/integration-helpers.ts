/**
 * Shared helpers for *.integration-spec.ts (C4).
 *
 * Boots a real Nest app against the dedicated `taskmgr_test` Postgres
 * database (DATABASE_URL is overridden by the `test:integration` npm
 * script). Provides truncate + seed helpers for clean per-suite state.
 *
 * The first call per process runs `prisma migrate deploy` so the
 * test DB schema is up-to-date — subsequent calls skip it.
 *
 * No mocks of Prisma or any other service — that's the entire point
 * of an integration test, per the project rules.
 */

import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * No-op throttler used in integration tests. The production tests
 * (UserScopedThrottlerGuard) bucket by user id OR by IP — both fall
 * back to the same "anonymous" bucket here (everything goes through
 * 127.0.0.1) and would trip the long-bucket cap after a few tests.
 */
class NoOpThrottlerGuard extends ThrottlerGuard {
  override async canActivate(_ctx: ExecutionContext): Promise<boolean> {
    return true;
  }
}

let migrationsApplied = false;

export interface IntegrationContext {
  app: INestApplication;
  prisma: PrismaClient;
  /** Stop the app + disconnect Prisma. Call from afterAll(). */
  close(): Promise<void>;
}

/**
 * Boots the full Nest app against taskmgr_test, with migrations
 * applied. Caller must invoke `await ctx.close()` in afterAll() so
 * Jest doesn't hang.
 */
export async function bootIntegrationApp(): Promise<IntegrationContext> {
  if (!migrationsApplied) {
    // Apply migrations once per Jest process. Stays out of beforeEach
    // because each run takes ~3s on the test DB and the schema doesn't
    // change between suites.
    execSync('npx prisma migrate deploy', {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env },
    });
    migrationsApplied = true;
  }

  // Override APP_GUARD-registered throttler. The default rate limits
  // (20/sec, 100/10s, 300/min) trip during a multi-test run because
  // every supertest hit shares the same loopback IP bucket. Replacing
  // the guard with a no-op here keeps the tests focused on auth
  // semantics rather than rate limiting (which has its own unit spec).
  const { UserScopedThrottlerGuard } = await import(
    '../src/common/guards/user-scoped-throttler.guard'
  );

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(UserScopedThrottlerGuard)
    .useClass(NoOpThrottlerGuard)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.setGlobalPrefix('api');
  await app.init();

  const prisma = app.get(PrismaService) as unknown as PrismaClient;

  return {
    app,
    prisma,
    async close() {
      await app.close();
    },
  };
}

/**
 * Wipes mutable tables. Keeps the schema and any seed data (process
 * definitions, default task types) intact unless the caller explicitly
 * asks otherwise.
 *
 * Order matters — FK dependencies first.
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs,
      notifications,
      push_subscriptions,
      refresh_tokens,
      notes,
      attachments,
      appointments,
      work_orders,
      client_addresses,
      clients,
      temporary_clients,
      users,
      system_configs
    RESTART IDENTITY CASCADE
  `);
}

export interface CreatedUser {
  id: string;
  email: string;
  role: Role;
  /** Plain password — useful for direct login in tests. */
  password: string;
}

/**
 * Inserts a user with a bcrypt-hashed password directly via Prisma.
 * Bypasses /auth/register (which would couple this helper to the API).
 */
export async function createTestUser(
  prisma: PrismaClient,
  opts: Partial<{ email: string; password: string; role: Role; firstName: string; lastName: string }>,
): Promise<CreatedUser> {
  const password = opts.password ?? 'P@ssw0rd123!';
  const email =
    opts.email ?? `${opts.role?.toLowerCase() ?? 'user'}-${randomUUID()}@test.local`;
  const hash = await bcrypt.hash(password, 4); // low cost — tests only

  const user = await prisma.user.create({
    data: {
      email,
      password: hash,
      firstName: opts.firstName ?? 'Test',
      lastName: opts.lastName ?? 'User',
      role: opts.role ?? Role.TECHNICIAN,
      isActive: true,
    },
  });

  return { id: user.id, email: user.email, role: user.role, password };
}
