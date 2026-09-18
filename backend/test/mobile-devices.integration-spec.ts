/**
 * Integration — mobile device registry (B37.3, ADR-015).
 *
 * Real Nest app + real Postgres (taskmgr_test). Covers :
 *   1. login with X-Device-Id binds the refresh token row to the device
 *   2. PUT /me/devices/:id registers the phone ; header mismatch → 400
 *   3. DELETE revokes : the device's refresh token can no longer rotate (401),
 *      while a web session (no device) of the same user still can
 *   4. a second user on the same phone re-links the installation
 *   5. someone else's installation → 404 on heartbeat
 */
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { bootIntegrationApp, createTestUser, resetDb, type IntegrationContext } from './integration-helpers';

describe('Mobile devices (integration)', () => {
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

  async function login(email: string, password: string, deviceId?: string) {
    let req = request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email, password });
    if (deviceId) req = req.set('X-Device-Id', deviceId);
    const res = await req;
    expect([200, 201]).toContain(res.status);
    // No TransformInterceptor in the integration app: bodies are not enveloped.
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('binds the refresh token to the device and registers it', async () => {
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const deviceId = randomUUID();
    const session = await login(tech.email, tech.password, deviceId);

    const row = await ctx.prisma.refreshToken.findFirst({ where: { userId: tech.id } });
    expect(row?.deviceId).toBe(deviceId);

    const reg = await request(ctx.app.getHttpServer())
      .put(`/api/me/devices/${deviceId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('X-Device-Id', deviceId)
      .send({ platform: 'IOS', appVersion: '0.1.0', osVersion: '27.0', model: 'iPhone 18 Pro', locale: 'fr' })
      .expect(200);
    expect(reg.body).toMatchObject({ installationId: deviceId, platform: 'IOS', appVersion: '0.1.0', hasPushToken: false });
    expect(reg.body.pushToken).toBeUndefined();

    const list = await request(ctx.app.getHttpServer())
      .get('/api/me/devices')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    // Header must match the path — a token cannot register a phone it is not on.
    await request(ctx.app.getHttpServer())
      .put(`/api/me/devices/${randomUUID()}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('X-Device-Id', deviceId)
      .send({ platform: 'IOS', appVersion: '0.1.0' })
      .expect(400);
  });

  it('heartbeat returns the version gate and revocation kills the device sessions only', async () => {
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const deviceId = randomUUID();
    const phone = await login(tech.email, tech.password, deviceId);
    const web = await login(tech.email, tech.password);

    await request(ctx.app.getHttpServer())
      .put(`/api/me/devices/${deviceId}`)
      .set('Authorization', `Bearer ${phone.accessToken}`)
      .set('X-Device-Id', deviceId)
      .send({ platform: 'ANDROID', appVersion: '0.1.0' })
      .expect(200);

    const hb = await request(ctx.app.getHttpServer())
      .post(`/api/me/devices/${deviceId}/heartbeat`)
      .set('Authorization', `Bearer ${phone.accessToken}`)
      .set('X-Device-Id', deviceId)
      .send({ appVersion: '0.1.1' })
      .expect(200);
    expect(hb.body).toMatchObject({ upgradeRequired: false, minAppVersion: '0.0.0' });

    await request(ctx.app.getHttpServer())
      .delete(`/api/me/devices/${deviceId}`)
      .set('Authorization', `Bearer ${phone.accessToken}`)
      .expect(204);

    // Phone refresh token is dead …
    await request(ctx.app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: phone.refreshToken }).expect(401);
    // … the web session of the same user still rotates.
    await request(ctx.app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: web.refreshToken }).expect(200);

    // Revoked device is gone from the list and from heartbeat.
    const list = await request(ctx.app.getHttpServer()).get('/api/me/devices').set('Authorization', `Bearer ${phone.accessToken}`).expect(200);
    expect(list.body).toHaveLength(0);
    await request(ctx.app.getHttpServer())
      .post(`/api/me/devices/${deviceId}/heartbeat`)
      .set('Authorization', `Bearer ${phone.accessToken}`)
      .set('X-Device-Id', deviceId)
      .send({})
      .expect(404);
  });

  it('re-links a shared phone to the next user and hides it from the previous one', async () => {
    const a = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const b = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const deviceId = randomUUID();
    const sa = await login(a.email, a.password, deviceId);
    await request(ctx.app.getHttpServer())
      .put(`/api/me/devices/${deviceId}`).set('Authorization', `Bearer ${sa.accessToken}`).set('X-Device-Id', deviceId)
      .send({ platform: 'IOS', appVersion: '0.1.0', pushToken: 'ExponentPushToken[shared]' }).expect(200);

    const sb = await login(b.email, b.password, deviceId);
    const reg = await request(ctx.app.getHttpServer())
      .put(`/api/me/devices/${deviceId}`).set('Authorization', `Bearer ${sb.accessToken}`).set('X-Device-Id', deviceId)
      .send({ platform: 'IOS', appVersion: '0.1.0' }).expect(200);
    // The previous user's push token is not reused for B.
    expect(reg.body.hasPushToken).toBe(false);

    const row = await ctx.prisma.device.findFirst({ where: { installationId: deviceId } });
    expect(row?.userId).toBe(b.id);

    // A no longer sees or controls the phone.
    const listA = await request(ctx.app.getHttpServer()).get('/api/me/devices').set('Authorization', `Bearer ${sa.accessToken}`).expect(200);
    expect(listA.body).toHaveLength(0);
    await request(ctx.app.getHttpServer())
      .post(`/api/me/devices/${deviceId}/heartbeat`).set('Authorization', `Bearer ${sa.accessToken}`).set('X-Device-Id', deviceId)
      .send({}).expect(404);
  });

  it('exposes the public config without a token', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/mobile/config').expect(200);
    expect(res.body).toMatchObject({ minAppVersion: { ios: '0.0.0', android: '0.0.0' }, push: { provider: 'EXPO' } });
    expect(res.body.tenant).toBeNull();
  });
});
