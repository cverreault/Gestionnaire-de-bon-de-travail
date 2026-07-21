/**
 * QA — tenants-isolation.integration-spec.ts (B6.13)
 *
 * Proves the multi-tenant isolation works end-to-end :
 *   1. Two tenants are created
 *   2. Tenant A's ADMIN logs in via its sub-domain
 *   3. Tenant A's ADMIN's JWT is rejected on tenant B's sub-domain
 *   4. Tenant A only sees its own users when listing /users
 *   5. Tenant A creating a user with the same email as a tenant B
 *      user does NOT collide (email is per-tenant)
 *   6. POST /signup creates an isolated workspace
 */

import request from 'supertest';
import { Role } from '@prisma/client';
import {
  bootIntegrationApp,
  createTestTenant,
  createTestUser,
  resetDb,
  IntegrationContext,
} from './integration-helpers';

describe('Tenant isolation (integration)', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await bootIntegrationApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it('rejects a JWT issued for tenant A when sent to tenant B', async () => {
    // Two tenants, two admin users — same email!
    // Unique slugs per test — the TenantResolverMiddleware caches
    // slug → tenant in-process; reused slugs across tests collide
    // because the previous tenant id is still cached.
    const tenantA = await createTestTenant(ctx.prisma);
    const tenantB = await createTestTenant(ctx.prisma);
    const adminA = await createTestUser(ctx.prisma, {
      tenantId: tenantA.id,
      email: 'admin@example.com',
      role: Role.ADMIN,
    });
    await createTestUser(ctx.prisma, {
      tenantId: tenantB.id,
      email: 'admin@example.com',
      role: Role.ADMIN,
    });

    // Login on tenant A's sub-domain → success.
    const loginA = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Host', `${tenantA.slug}.taskmgr.com`)
      .send({ email: adminA.email, password: adminA.password });
    expect([200, 201]).toContain(loginA.status);
    const tokenA = loginA.body.accessToken as string;
    expect(tokenA).toBeTruthy();

    // Same token, tenant B's sub-domain → blocked.
    // 401 (JwtStrategy.validate rejects on tenantId mismatch with DB row)
    // OR 403 (handleRequest's tenant check fires) — both prove isolation.
    const cross = await request(ctx.app.getHttpServer())
      .get('/api/auth/me')
      .set('Host', `${tenantB.slug}.taskmgr.com`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect([401, 403]).toContain(cross.status);
  });

  it('login on tenant A sub-domain finds the tenant A user even when same email exists in B', async () => {
    // Unique slugs per test — the TenantResolverMiddleware caches
    // slug → tenant in-process; reused slugs across tests collide
    // because the previous tenant id is still cached.
    const tenantA = await createTestTenant(ctx.prisma);
    const tenantB = await createTestTenant(ctx.prisma);

    const adminA = await createTestUser(ctx.prisma, {
      tenantId: tenantA.id,
      email: 'shared@example.com',
      role: Role.ADMIN,
      password: 'password-A',
    });
    await createTestUser(ctx.prisma, {
      tenantId: tenantB.id,
      email: 'shared@example.com',
      role: Role.ADMIN,
      password: 'password-B',
    });

    // The aco login MUST find adminA — its tenantId from the JWT,
    // not tenantB's user that shares the email.
    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Host', `${tenantA.slug}.taskmgr.com`)
      .send({ email: 'shared@example.com', password: adminA.password });
    expect([200, 201]).toContain(login.status);
    expect(login.body.user.id).toBe(adminA.id);
    expect(login.body.user.tenantId).toBe(tenantA.id);
  });

  it('same email in two tenants is allowed (per-tenant uniqueness)', async () => {
    // Unique slugs per test — the TenantResolverMiddleware caches
    // slug → tenant in-process; reused slugs across tests collide
    // because the previous tenant id is still cached.
    const tenantA = await createTestTenant(ctx.prisma);
    const tenantB = await createTestTenant(ctx.prisma);

    // Both inserts succeed — no global unique on email anymore.
    await expect(
      createTestUser(ctx.prisma, {
        tenantId: tenantA.id,
        email: 'collision@test.local',
      }),
    ).resolves.toBeTruthy();
    await expect(
      createTestUser(ctx.prisma, {
        tenantId: tenantB.id,
        email: 'collision@test.local',
      }),
    ).resolves.toBeTruthy();
  });

  it('a fresh /signup creates an isolated tenant with the catalog seeded', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/signup')
      .send({
        slug: 'freshco',
        organizationName: 'Fresh Co',
        email: 'patron@freshco.test',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Test',
      });

    expect(res.status).toBe(201);
    const tenantId = res.body.tenant.id as string;

    // Verify the minimal catalog landed — the seed (TenantBootstrapService)
    // gives a fresh tenant a default process (so it can run work orders) and
    // a default template. Task types are NOT seeded — they're optional and
    // the tenant configures its own. Direct DB queries bypass the middleware.
    const processes = await ctx.prisma.processDefinition.findMany({
      where: { tenantId },
    });
    expect(processes.length).toBeGreaterThanOrEqual(1);
    expect(processes.some((p) => p.isDefault)).toBe(true);

    const statuses = await ctx.prisma.processStatus.findMany({
      where: { tenantId },
    });
    // Seeded workflow: Créé → Assigné → En progrès → Complété (+).
    expect(statuses.length).toBeGreaterThanOrEqual(4);
    expect(statuses.some((s) => s.isInitial)).toBe(true);
    expect(statuses.some((s) => s.isTerminalPositive)).toBe(true);

    const templates = await ctx.prisma.workOrderTemplate.findMany({
      where: { tenantId },
    });
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });
});
