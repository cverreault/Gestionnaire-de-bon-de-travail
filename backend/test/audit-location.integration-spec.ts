/**
 * Integration — B45 : every action of a technician lands in the work-order
 * history with the position carried by X-Client-Location.
 *   1. transition + note + signatures with the header → audit rows with location
 *   2. the same actions without the header → location null
 *   3. GET /audit/aggregate/:id exposes `location` and the new event names
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import { bootIntegrationApp, createTestUser, resetDb, type IntegrationContext } from './integration-helpers';
import { createDefaultProcess } from '../src/common/contracts/default-process.contract';

const LOC = '45.5017,-73.5673,12,2026-09-21T14:00:00.000Z';

describe('Audit location (integration)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await bootIntegrationApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await createDefaultProcess(ctx.prisma as never);
  });
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 800));
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function login(email: string, password: string): Promise<string> {
    const res = await api().post('/api/auth/login').send({ email, password });
    expect([200, 201]).toContain(res.status);
    return res.body.accessToken as string;
  }

  async function waitForAudit(workOrderId: string, eventName: string, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const row = await ctx.prisma.auditLog.findFirst({ where: { aggregateId: workOrderId, eventName } });
      if (row) return row;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`audit row ${eventName} not found`);
  }

  it('records the client position on every action and exposes it in the history', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = await login(admin.email, admin.password);
    const techToken = await login(tech.email, tech.password);

    const created = await api().post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Geo', type: 'OTHER', clientAddress: '1 rue Test', assignedToId: tech.id });
    expect(created.status).toBe(201);
    const woId = created.body.id as string;
    const createdRow = await waitForAudit(woId, 'workOrders.workOrder.created');
    expect(createdRow.location).toBeNull();

    // Note with position
    const note = await api().post(`/api/work-orders/${woId}/notes`).set('Authorization', `Bearer ${techToken}`)
      .set('X-Client-Location', LOC).send({ content: 'Arrivé sur place, compteur relevé' });
    expect(note.status).toBe(201);
    const noteRow = await waitForAudit(woId, 'workOrders.workOrder.noteAdded');
    expect(noteRow.location).toEqual({ lat: 45.5017, lng: -73.5673, accuracy: 12, recordedAt: '2026-09-21T14:00:00.000Z' });
    expect(noteRow.actorUserId).toBe(tech.id);
    expect((noteRow.data as { excerpt: string }).excerpt).toContain('Arrivé sur place');

    // Signatures with position
    const sig = await api().post(`/api/work-orders/${woId}/signatures`).set('Authorization', `Bearer ${techToken}`)
      .set('X-Client-Location', '45.5,-73.5').send({ signatureTechnician: 'data:image/png;base64,iVBORw0KGgo=' });
    expect([200, 201]).toContain(sig.status);
    const sigRow = await waitForAudit(woId, 'workOrders.workOrder.signed');
    expect(sigRow.location).toEqual({ lat: 45.5, lng: -73.5 });
    expect(sigRow.data).toEqual({ client: false, technician: true });

    // Malformed header → no position, action still recorded
    const note2 = await api().post(`/api/work-orders/${woId}/notes`).set('Authorization', `Bearer ${techToken}`)
      .set('X-Client-Location', 'nowhere').send({ content: 'Deuxième note' });
    expect(note2.status).toBe(201);
    await new Promise((r) => setTimeout(r, 300));
    const notes = await ctx.prisma.auditLog.findMany({ where: { aggregateId: woId, eventName: 'workOrders.workOrder.noteAdded' }, orderBy: { occurredAt: 'asc' } });
    expect(notes).toHaveLength(2);
    expect(notes[1].location).toBeNull();

    // History endpoint carries location + new events
    const history = await api().get(`/api/audit/aggregate/${woId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const names = history.body.map((e: { eventName: string }) => e.eventName);
    expect(names).toEqual(expect.arrayContaining(['workOrders.workOrder.created', 'workOrders.workOrder.noteAdded', 'workOrders.workOrder.signed']));
    const located = history.body.find((e: { eventName: string }) => e.eventName === 'workOrders.workOrder.signed');
    expect(located.location).toEqual({ lat: 45.5, lng: -73.5 });
  });
});
