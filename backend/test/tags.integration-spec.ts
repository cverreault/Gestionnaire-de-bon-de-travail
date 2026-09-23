/**
 * Integration — B44 tags.
 *   1. catalogue : ADMIN creates / DISPATCHER cannot / TECHNICIAN reads ; unique name ; colour format
 *   2. work orders : create with tagIds → flat `tags`, list filter `?tagIds=`, PATCH replaces, [] clears
 *   3. clients + addresses : tags on create, list filter
 *   4. tenant isolation : another tenant's tag is unknown here (400) and invisible in the catalogue
 *   5. deleting a tag removes it from the work order
 *   6. mobile sync payload carries the tags
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import { bootIntegrationApp, createTestTenant, createTestUser, resetDb, type IntegrationContext } from './integration-helpers';
import { createDefaultProcess } from '../src/common/contracts/default-process.contract';

describe('Tags (integration)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await bootIntegrationApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await createDefaultProcess(ctx.prisma as never);
  });
  afterAll(async () => {
    // Creating work orders fires fire-and-forget listeners (notifications, reminders) ;
    // let them settle before the app closes, otherwise their late Prisma calls reopen a
    // pool after Jest is done and the process exits 1 in CI.
    await new Promise((r) => setTimeout(r, 1500));
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function login(email: string, password: string, host?: string): Promise<string> {
    let req = api().post('/api/auth/login');
    if (host) req = req.set('Host', host);
    const res = await req.send({ email, password });
    expect([200, 201]).toContain(res.status);
    return res.body.accessToken as string;
  }

  async function createTag(token: string, name: string, color = '#2563eb', host?: string) {
    let req = api().post('/api/settings/tags').set('Authorization', `Bearer ${token}`);
    if (host) req = req.set('Host', host);
    const res = await req.send({ name, color });
    expect(res.status).toBe(201);
    return res.body as { id: string; name: string; color: string };
  }

  it('manages the catalogue with the expected roles and validation', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const dispatcher = await createTestUser(ctx.prisma, { role: Role.DISPATCHER });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = await login(admin.email, admin.password);
    const dispToken = await login(dispatcher.email, dispatcher.password);
    const techToken = await login(tech.email, tech.password);

    const lumii = await createTag(adminToken, 'Lumii');
    expect(lumii).toMatchObject({ name: 'Lumii', color: '#2563eb', isActive: true });

    // Dispatcher cannot write
    await api().post('/api/settings/tags').set('Authorization', `Bearer ${dispToken}`).send({ name: 'X' }).expect(403);
    // Technician can read
    const list = await api().get('/api/settings/tags').set('Authorization', `Bearer ${techToken}`).expect(200);
    expect(list.body.map((t: { name: string }) => t.name)).toEqual(['Lumii']);

    // Unique, case-insensitive
    await api().post('/api/settings/tags').set('Authorization', `Bearer ${adminToken}`).send({ name: 'lumii' }).expect(409);
    // Colour format
    await api().post('/api/settings/tags').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Bad', color: 'blue' }).expect(400);

    // Update + usage counts
    const upd = await api().patch(`/api/settings/tags/${lumii.id}`).set('Authorization', `Bearer ${adminToken}`).send({ color: '#FF0000', isActive: false }).expect(200);
    expect(upd.body).toMatchObject({ color: '#ff0000', isActive: false, _count: { workOrders: 0, clients: 0, addresses: 0 } });
  });

  it('attaches tags to work orders, filters the list, replaces and clears', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const adminToken = await login(admin.email, admin.password);
    const lumii = await createTag(adminToken, 'Lumii');
    const urgent = await createTag(adminToken, 'Urgent', '#dc2626');

    const created = await api().post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Tagged', type: 'OTHER', clientAddress: '1 rue Test', tagIds: [lumii.id, lumii.id] });
    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual([{ id: lumii.id, name: 'Lumii', color: '#2563eb' }]);

    const plain = await api().post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Plain', type: 'OTHER', clientAddress: '2 rue Test' });
    expect(plain.status).toBe(201);
    expect(plain.body.tags).toEqual([]);

    // Unknown tag → 400
    await api().post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bad', type: 'OTHER', clientAddress: '3 rue Test', tagIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(400);

    // List filter (any-of), list rows carry flat tags
    const filtered = await api().get('/api/work-orders').set('Authorization', `Bearer ${adminToken}`)
      .query({ tagIds: `${lumii.id},${urgent.id}` }).expect(200);
    expect(filtered.body.data.map((w: { id: string }) => w.id)).toEqual([created.body.id]);
    expect(filtered.body.data[0].tags).toEqual([{ id: lumii.id, name: 'Lumii', color: '#2563eb' }]);
    const all = await api().get('/api/work-orders').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(all.body.data).toHaveLength(2);

    // PATCH replaces the set ; detail is flat too
    const replaced = await api().patch(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ tagIds: [urgent.id] }).expect(200);
    expect(replaced.body.tags).toEqual([{ id: urgent.id, name: 'Urgent', color: '#dc2626' }]);
    const detail = await api().get(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(detail.body.tags.map((t: { id: string }) => t.id)).toEqual([urgent.id]);

    // [] clears, a PATCH without tagIds leaves them alone
    await api().patch(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ title: 'Renamed' }).expect(200);
    const kept = await api().get(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(kept.body.tags).toHaveLength(1);
    const cleared = await api().patch(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ tagIds: [] }).expect(200);
    expect(cleared.body.tags).toEqual([]);

    // Deleting a tag removes it everywhere
    const again = await api().patch(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ tagIds: [lumii.id] }).expect(200);
    expect(again.body.tags).toHaveLength(1);
    await api().delete(`/api/settings/tags/${lumii.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const after = await api().get(`/api/work-orders/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(after.body.tags).toEqual([]);
  });

  it('attaches tags to clients and addresses and filters both lists', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const adminToken = await login(admin.email, admin.password);
    const lumii = await createTag(adminToken, 'Lumii');
    const site = await createTag(adminToken, 'Site', '#16a34a');

    const created = await api().post('/api/clients').set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Jean', lastName: 'Test', clientType: 'COMMERCIAL', tagIds: [lumii.id],
        // Coordinates given so no background geocoding outlives the suite.
        addresses: [{ street: 'rue A', city: 'Québec', postalCode: 'G1A 1A1', latitude: 46.81, longitude: -71.21, tagIds: [site.id] }],
      });
    expect(created.status).toBe(201);
    expect(created.body.tags).toEqual([{ id: lumii.id, name: 'Lumii', color: '#2563eb' }]);
    expect(created.body.addresses[0].tags).toEqual([{ id: site.id, name: 'Site', color: '#16a34a' }]);

    await api().post('/api/clients').set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Marie', lastName: 'Sans', clientType: 'RESIDENTIAL' }).expect(201);

    const list = await api().get('/api/clients').set('Authorization', `Bearer ${adminToken}`).query({ tagIds: lumii.id }).expect(200);
    expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([created.body.id]);
    expect(list.body.data[0].tags).toHaveLength(1);

    // Client update replaces ; address update (generic route) replaces
    const upd = await api().patch(`/api/clients/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`).send({ tagIds: [] }).expect(200);
    expect(upd.body.tags).toEqual([]);
    const addrId = created.body.addresses[0].id as string;
    const addrUpd = await api().patch(`/api/clients/addresses/${addrId}`).set('Authorization', `Bearer ${adminToken}`).send({ tagIds: [lumii.id, site.id] }).expect(200);
    expect(addrUpd.body.tags.map((t: { name: string }) => t.name)).toEqual(['Lumii', 'Site']);

    const addresses = await api().get('/api/clients/addresses/all').set('Authorization', `Bearer ${adminToken}`).query({ tagIds: lumii.id }).expect(200);
    expect(addresses.body.map((a: { id: string }) => a.id)).toEqual([addrId]);
    const none = await api().get('/api/clients/addresses/all').set('Authorization', `Bearer ${adminToken}`)
      .query({ tagIds: '00000000-0000-4000-8000-000000000000' }).expect(200);
    expect(none.body).toEqual([]);
  });

  it('keeps tags private to their tenant', async () => {
    const tenantA = await createTestTenant(ctx.prisma);
    const tenantB = await createTestTenant(ctx.prisma);
    const adminA = await createTestUser(ctx.prisma, { role: Role.ADMIN, tenantId: tenantA.id });
    const adminB = await createTestUser(ctx.prisma, { role: Role.ADMIN, tenantId: tenantB.id });
    const hostA = `${tenantA.slug}.taskmgr.com`;
    const hostB = `${tenantB.slug}.taskmgr.com`;
    const tokenA = await login(adminA.email, adminA.password, hostA);
    const tokenB = await login(adminB.email, adminB.password, hostB);

    const tagA = await createTag(tokenA, 'Privé A', '#2563eb', hostA);
    const listB = await api().get('/api/settings/tags').set('Authorization', `Bearer ${tokenB}`).set('Host', hostB).expect(200);
    expect(listB.body).toEqual([]);

    // Tenant B cannot link A's tag
    await api().post('/api/work-orders').set('Authorization', `Bearer ${tokenB}`).set('Host', hostB)
      .send({ title: 'Cross', type: 'OTHER', clientAddress: '1 rue B', tagIds: [tagA.id] }).expect(400);
    // …nor delete it
    await api().delete(`/api/settings/tags/${tagA.id}`).set('Authorization', `Bearer ${tokenB}`).set('Host', hostB).expect(404);
  });

  it('carries the tags in the mobile sync payload', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = await login(admin.email, admin.password);
    const techToken = await login(tech.email, tech.password);
    const lumii = await createTag(adminToken, 'Lumii');
    const mine = await api().post('/api/work-orders').set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Mine', type: 'OTHER', clientAddress: '1 rue Test', assignedToId: tech.id, tagIds: [lumii.id] }).expect(201);
    // B57 — the phone only receives dispatched work orders.
    await api().post(`/api/work-orders/${mine.body.id}/assign-and-dispatch`).set('Authorization', `Bearer ${adminToken}`)
      .send({ technicianId: tech.id }).expect(200);

    const pull = await api().get('/api/me/sync').set('Authorization', `Bearer ${techToken}`).expect(200);
    expect(pull.body.workOrders).toHaveLength(1);
    expect(pull.body.workOrders[0].tags).toEqual([{ id: lumii.id, name: 'Lumii', color: '#2563eb' }]);
  });
});
