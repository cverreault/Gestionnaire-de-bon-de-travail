/**
 * Integration — delta pull GET /api/me/sync (B37.6, ADR-016 §1/§2).
 *   1. first pull : fullResync, the visible set, bodies, snapshot of the process
 *   2. second pull with the cursor : nothing changed → empty page, same cursor
 *   3. a dispatcher note bumps updatedAt → the BT comes back with the note
 *   4. reassignment → id leaves visibleWorkOrderIds
 *   5. completed > 14 days ago → not visible ; completed recently → visible
 *   6. pagination limit=1 → hasMore, then the rest
 *   7. another tenant's technician sees nothing of ours
 */
import request from 'supertest';
import { Role, WorkOrderStatus } from '@prisma/client';
import { bootIntegrationApp, createTestTenant, createTestUser, resetDb, type IntegrationContext } from './integration-helpers';
import { createDefaultProcess } from '../src/common/contracts/default-process.contract';

describe('Mobile sync (integration)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await bootIntegrationApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    // resetDb cascades from `tenants` and wipes the process seed : work orders
    // need a default process for the snapshot part of the pull.
    await createDefaultProcess(ctx.prisma as never);
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email, password });
    expect([200, 201]).toContain(res.status);
    return res.body.accessToken as string;
  }

  async function createWo(adminToken: string, title: string, assignedToId: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`)
      .send({ title, type: 'OTHER', clientAddress: '1 rue Test, Ville', assignedToId });
    expect([200, 201]).toContain(res.status);
    // B57 — the phone only receives dispatched work orders.
    await request(ctx.app.getHttpServer())
      .post(`/api/work-orders/${res.body.id}/assign-and-dispatch`).set('Authorization', `Bearer ${adminToken}`)
      .send({ technicianId: assignedToId }).expect(200);
    return res.body.id as string;
  }

  function pull(token: string, query: Record<string, string | number> = {}) {
    return request(ctx.app.getHttpServer()).get('/api/me/sync').set('Authorization', `Bearer ${token}`).query(query);
  }

  it('pulls the visible set, follows the cursor, sees child mutations and reassignments', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const other = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = await login(admin.email, admin.password);
    const techToken = await login(tech.email, tech.password);

    const a = await createWo(adminToken, 'A', tech.id);
    const b = await createWo(adminToken, 'B', tech.id);
    await createWo(adminToken, 'C (other tech)', other.id);

    // 1. first pull
    const first = await pull(techToken).expect(200);
    expect(first.body.fullResync).toBe(true);
    expect(first.body.hasMore).toBe(false);
    expect([...first.body.visibleWorkOrderIds].sort()).toEqual([a, b].sort());
    expect(first.body.workOrders.map((w: { id: string }) => w.id).sort()).toEqual([a, b].sort());
    const woA = first.body.workOrders.find((w: { id: string }) => w.id === a);
    expect(woA).toMatchObject({ referenceNumber: expect.any(String), hasSignatureClient: false, notes: [], parts: [] });
    expect(woA.signatureClient).toBeUndefined();
    const procId = woA.processDefinitionId as string;
    expect(first.body.processSnapshots[procId].transitions.length).toBeGreaterThan(0);
    expect(typeof first.body.cursor).toBe('string');

    // 2. nothing changed
    const second = await pull(techToken, { cursor: first.body.cursor }).expect(200);
    expect(second.body.fullResync).toBe(false);
    expect(second.body.workOrders).toEqual([]);
    expect(second.body.cursor).toBe(first.body.cursor);
    expect([...second.body.visibleWorkOrderIds].sort()).toEqual([a, b].sort());

    // 3. dispatcher note → aggregate bumped (ADR-016 §2)
    const note = await request(ctx.app.getHttpServer())
      .post(`/api/work-orders/${a}/notes`).set('Authorization', `Bearer ${adminToken}`).send({ content: 'from dispatch' }).expect(201);
    expect(typeof note.body.workOrderUpdatedAt).toBe('string');
    const third = await pull(techToken, { cursor: second.body.cursor }).expect(200);
    expect(third.body.workOrders.map((w: { id: string }) => w.id)).toEqual([a]);
    expect(third.body.workOrders[0].notes[0].content).toBe('from dispatch');
    expect(third.body.workOrders[0].updatedAt).toBe(note.body.workOrderUpdatedAt);

    // 4. reassignment → out of the visible set (no tombstone needed)
    await request(ctx.app.getHttpServer())
      .patch(`/api/work-orders/${b}`).set('Authorization', `Bearer ${adminToken}`).send({ assignedToId: other.id }).expect(200);
    const fourth = await pull(techToken, { cursor: third.body.cursor }).expect(200);
    expect(fourth.body.visibleWorkOrderIds).toEqual([a]);
    expect(fourth.body.workOrders).toEqual([]);

    // 5. B57 — completed work orders leave the phone right away (no history on mobile)
    const oldDone = await createWo(adminToken, 'old done', tech.id);
    const freshDone = await createWo(adminToken, 'fresh done', tech.id);
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE work_orders SET status = '${WorkOrderStatus.COMPLETED_POSITIVE}', updated_at = NOW() - interval '20 days' WHERE id = '${oldDone}'`,
    );
    await ctx.prisma.workOrder.update({ where: { id: freshDone }, data: { status: WorkOrderStatus.COMPLETED_POSITIVE } });
    const fifth = await pull(techToken).expect(200);
    expect(fifth.body.visibleWorkOrderIds).toEqual([a]);

    // 6. pagination (two dispatched work orders visible)
    await createWo(adminToken, 'D', tech.id);
    const p1 = await pull(techToken, { limit: 1 }).expect(200);
    expect(p1.body.hasMore).toBe(true);
    expect(p1.body.workOrders).toHaveLength(1);
    const p2 = await pull(techToken, { cursor: p1.body.cursor, limit: 1 }).expect(200);
    expect(p2.body.hasMore).toBe(false);
    expect(p2.body.workOrders).toHaveLength(1);
    expect(p2.body.workOrders[0].id).not.toBe(p1.body.workOrders[0].id);
    await pull(techToken, { limit: 500 }).expect(400);
  });

  it('isolates tenants', async () => {
    const t2 = await createTestTenant(ctx.prisma);
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const foreignTech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN, tenantId: t2.id });
    const adminToken = await login(admin.email, admin.password);
    await createWo(adminToken, 'ours', tech.id);

    // Same user id space is impossible, but a cross-tenant technician must see an empty set even if
    // rows were assigned to them by mistake at the DB level.
    const ours = await ctx.prisma.workOrder.findFirstOrThrow();
    await ctx.prisma.$executeRawUnsafe(`UPDATE work_orders SET assigned_to_id = '${foreignTech.id}' WHERE id = '${ours.id}'`);
    const foreignToken = await login(foreignTech.email, foreignTech.password);
    const res = await pull(foreignToken).expect(200);
    expect(res.body.visibleWorkOrderIds).toEqual([]);
    expect(res.body.workOrders).toEqual([]);
  });
});
