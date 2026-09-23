/**
 * Integration — Idempotency-Key replay safety (B37.5, ADR-016 §3).
 *
 * Real Nest app + real Postgres. Covers on POST /work-orders/:id/notes :
 *   1. no header → two calls create two notes (web unaffected)
 *   2. same key + same body → one note, second answer replayed with header
 *   3. same key + another body → 422 IDEMPOTENCY_KEY_REUSED
 *   4. same key by another user → independent (scope = tenant + user)
 *   5. malformed key → 400
 */
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { bootIntegrationApp, createTestUser, resetDb, type IntegrationContext } from './integration-helpers';

describe('Idempotency-Key (integration)', () => {
  let ctx: IntegrationContext;

  beforeAll(async () => {
    ctx = await bootIntegrationApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email, password });
    expect([200, 201]).toContain(res.status);
    return res.body.accessToken as string;
  }

  async function seedWorkOrder(adminToken: string, technicianId: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/work-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Idempotency WO', type: 'OTHER', clientAddress: '1 rue Test, Ville', assignedToId: technicianId });
    expect([200, 201]).toContain(res.status);
    // B57 — a technician may only act on a dispatched work order.
    await request(ctx.app.getHttpServer())
      .post(`/api/work-orders/${res.body.id}/assign-and-dispatch`).set('Authorization', `Bearer ${adminToken}`)
      .send({ technicianId }).expect(200);
    return res.body.id as string;
  }

  it('creates two notes without a key, one note with a replayed key, 422 on reuse, 400 on garbage', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = await login(admin.email, admin.password);
    const techToken = await login(tech.email, tech.password);
    const woId = await seedWorkOrder(adminToken, tech.id);
    const url = `/api/work-orders/${woId}/notes`;

    // 1. web behaviour untouched
    await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${techToken}`).send({ content: 'a' }).expect(201);
    await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${techToken}`).send({ content: 'a' }).expect(201);
    expect(await ctx.prisma.note.count({ where: { workOrderId: woId } })).toBe(2);

    // 2. replay
    const key = randomUUID();
    const first = await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${techToken}`).set('Idempotency-Key', key).send({ content: 'queued' }).expect(201);
    const second = await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${techToken}`).set('Idempotency-Key', key).send({ content: 'queued' }).expect(201);
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(first.headers['idempotency-replayed']).toBeUndefined();
    expect(second.body.id).toBe(first.body.id);
    expect(await ctx.prisma.note.count({ where: { workOrderId: woId } })).toBe(3);

    // 3. reuse with a different body
    const reused = await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${techToken}`).set('Idempotency-Key', key).send({ content: 'different' }).expect(422);
    expect(JSON.stringify(reused.body)).toContain('IDEMPOTENCY_KEY_REUSED');

    // 4. same key, another user → independent claim
    await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${adminToken}`).set('Idempotency-Key', key).send({ content: 'queued' }).expect(201);
    expect(await ctx.prisma.note.count({ where: { workOrderId: woId } })).toBe(4);
    expect(await ctx.prisma.idempotencyKey.count()).toBe(2);

    // 5. malformed key
    await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${techToken}`).set('Idempotency-Key', 'nope').send({ content: 'x' }).expect(400);
  });
});
