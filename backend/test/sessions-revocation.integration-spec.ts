/**
 * Integration — admin « déconnecter partout » and device administration.
 *   1. POST /users/:id/revoke-sessions (ADMIN) : refresh tokens die (web + mobile), devices are revoked, counts returned
 *   2. DISPATCHER → 403 ; unknown user → 404
 *   3. GET /mobile/users/:id/devices + DELETE one device (ADMIN) : that device's refresh token dies, the other survives
 *   4. deactivating a user (PATCH isActive=false) revokes everything too
 */
import { randomUUID } from 'crypto';
import request from 'supertest';
import { Role } from '@prisma/client';
import { bootIntegrationApp, createTestUser, resetDb, type IntegrationContext } from './integration-helpers';

describe('Sessions revocation (integration)', () => {
  let ctx: IntegrationContext;
  beforeAll(async () => {
    ctx = await bootIntegrationApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 500));
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function login(email: string, password: string, deviceId?: string) {
    let req = api().post('/api/auth/login').send({ email, password });
    if (deviceId) req = req.set('X-Device-Id', deviceId);
    const res = await req;
    expect([200, 201]).toContain(res.status);
    return res.body as { accessToken: string; refreshToken: string };
  }

  async function registerDevice(token: string, deviceId: string) {
    await api()
      .put(`/api/me/devices/${deviceId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Device-Id', deviceId)
      .send({ platform: 'ANDROID', appVersion: '0.5.0', model: 'Pixel', locale: 'fr' })
      .expect(200);
  }

  it('admin revokes every session and device of a user', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const dispatcher = await createTestUser(ctx.prisma, { role: Role.DISPATCHER });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = (await login(admin.email, admin.password)).accessToken;
    const dispToken = (await login(dispatcher.email, dispatcher.password)).accessToken;

    const web = await login(tech.email, tech.password);
    const phone = randomUUID();
    const mobile = await login(tech.email, tech.password, phone);
    await registerDevice(mobile.accessToken, phone);

    await api().post(`/api/users/${tech.id}/revoke-sessions`).set('Authorization', `Bearer ${dispToken}`).expect(403);
    await api().post(`/api/users/${randomUUID()}/revoke-sessions`).set('Authorization', `Bearer ${adminToken}`).expect(404);

    const res = await api().post(`/api/users/${tech.id}/revoke-sessions`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body).toEqual({ refreshTokens: 2, devices: 1 });

    await api().post('/api/auth/refresh').send({ refreshToken: web.refreshToken }).expect(401);
    await api().post('/api/auth/refresh').send({ refreshToken: mobile.refreshToken }).expect(401);
    const devices = await api().get(`/api/mobile/users/${tech.id}/devices`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(devices.body).toEqual([]);

    // Idempotent : nothing left to revoke.
    const again = await api().post(`/api/users/${tech.id}/revoke-sessions`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(again.body).toEqual({ refreshTokens: 0, devices: 0 });
  });

  it('admin lists and revokes a single device without touching the others', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = (await login(admin.email, admin.password)).accessToken;

    const a = randomUUID();
    const b = randomUUID();
    const sessionA = await login(tech.email, tech.password, a);
    const sessionB = await login(tech.email, tech.password, b);
    await registerDevice(sessionA.accessToken, a);
    await registerDevice(sessionB.accessToken, b);

    const list = await api().get(`/api/mobile/users/${tech.id}/devices`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(list.body.map((d: { installationId: string }) => d.installationId).sort()).toEqual([a, b].sort());
    expect(list.body[0].pushToken).toBeUndefined();

    await api().delete(`/api/mobile/users/${tech.id}/devices/${a}`).set('Authorization', `Bearer ${adminToken}`).expect(204);
    await api().delete(`/api/mobile/users/${tech.id}/devices/${a}`).set('Authorization', `Bearer ${adminToken}`).expect(404);

    await api().post('/api/auth/refresh').send({ refreshToken: sessionA.refreshToken }).expect(401);
    const refreshed = await api().post('/api/auth/refresh').send({ refreshToken: sessionB.refreshToken });
    expect([200, 201]).toContain(refreshed.status);

    const after = await api().get(`/api/mobile/users/${tech.id}/devices`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(after.body.map((d: { installationId: string }) => d.installationId)).toEqual([b]);
  });

  it('deactivating a user logs them out everywhere', async () => {
    const admin = await createTestUser(ctx.prisma, { role: Role.ADMIN });
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const adminToken = (await login(admin.email, admin.password)).accessToken;
    const phone = randomUUID();
    const session = await login(tech.email, tech.password, phone);
    await registerDevice(session.accessToken, phone);

    await api().patch(`/api/users/${tech.id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false }).expect(200);

    const tokens = await ctx.prisma.refreshToken.findMany({ where: { userId: tech.id } });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
    const devices = await ctx.prisma.device.findMany({ where: { userId: tech.id } });
    expect(devices.every((d) => d.revokedAt !== null)).toBe(true);
  });
});
