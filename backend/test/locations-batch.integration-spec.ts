/**
 * Integration — GPS batch upload (B37.7, ADR-017 §1).
 *   1. opted-out technician → 403
 *   2. valid batch stored with source ; replay of the same batch (same
 *      Idempotency-Key) answers the stored result ; a new key with the same
 *      fixes inserts nothing (unique technician + recordedAt)
 *   3. per-index rejections for future / too old fixes
 */
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { bootIntegrationApp, createTestUser, resetDb, type IntegrationContext } from './integration-helpers';

describe('GPS batch (integration)', () => {
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

  it('enforces consent, stores fixes with their source, dedups replays and rejects out-of-window fixes', async () => {
    const tech = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });
    const token = await login(tech.email, tech.password);
    const url = '/api/me/locations/batch';
    const t0 = Date.now();
    const fixes = [
      { latitude: 45.5, longitude: -73.5, accuracy: 6, recordedAt: new Date(t0 - 20_000).toISOString(), source: 'MOBILE_BACKGROUND' },
      { latitude: 45.51, longitude: -73.51, recordedAt: new Date(t0 - 10_000).toISOString(), source: 'MOBILE_FOREGROUND' },
    ];

    // 1. consent off (default)
    await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ fixes }).expect(403);

    await ctx.prisma.user.update({ where: { id: tech.id }, data: { preferences: { gps: { enabled: true } } } });

    // 2. stored + replayed + deduped
    const key = randomUUID();
    const first = await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ fixes }).expect(200);
    expect(first.body).toEqual({ accepted: 2, duplicates: 0, rejected: [] });
    const rows = await ctx.prisma.technicianLocation.findMany({ where: { technicianId: tech.id }, orderBy: { recordedAt: 'asc' } });
    expect(rows.map((r) => r.source)).toEqual(['MOBILE_BACKGROUND', 'MOBILE_FOREGROUND']);
    expect(rows[0].accuracy).toBe(6);

    const replay = await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ fixes }).expect(200);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body).toEqual({ accepted: 2, duplicates: 0, rejected: [] });

    const again = await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({ fixes }).expect(200);
    expect(again.body).toEqual({ accepted: 0, duplicates: 2, rejected: [] });
    expect(await ctx.prisma.technicianLocation.count({ where: { technicianId: tech.id } })).toBe(2);

    // 3. per-index rejections
    const mixed = await request(ctx.app.getHttpServer())
      .post(url).set('Authorization', `Bearer ${token}`)
      .send({ fixes: [
        { latitude: 45.6, longitude: -73.6, recordedAt: new Date(t0 + 10 * 60_000).toISOString(), source: 'MOBILE_FOREGROUND' },
        { latitude: 45.7, longitude: -73.7, recordedAt: new Date(t0 - 8 * 24 * 3600_000).toISOString(), source: 'MOBILE_FOREGROUND' },
        { latitude: 45.8, longitude: -73.8, recordedAt: new Date(t0 - 5_000).toISOString(), source: 'MOBILE_FOREGROUND' },
      ] })
      .expect(200);
    expect(mixed.body).toEqual({ accepted: 1, duplicates: 0, rejected: [{ index: 0, reason: 'IN_FUTURE' }, { index: 1, reason: 'TOO_OLD' }] });

    // DTO limits : > 100 fixes or a WEB source is refused
    await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ fixes: new Array(101).fill(fixes[0]) }).expect(400);
    await request(ctx.app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send({ fixes: [{ ...fixes[0], source: 'WEB' }] }).expect(400);
  });
});
