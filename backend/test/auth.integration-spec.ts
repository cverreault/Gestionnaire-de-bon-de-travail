/**
 * QA — auth.integration-spec.ts (C4)
 *
 * End-to-end coverage of the auth flow against a real Postgres:
 *   1. Login with correct credentials → returns {accessToken, refreshToken, user}
 *   2. Login with wrong password → 401, same message as unknown email (no enumeration)
 *   3. Login with unknown email → 401, same message
 *   4. /auth/me returns the user when called with a valid token
 *   5. /auth/me returns 401 with no/expired token
 *   6. Refresh rotates the token atomically (old one is revoked, new one works)
 *   7. Replay of a revoked refresh token → revokes the whole family
 *   8. Logout best-effort: revoking an unknown/already-revoked token → 200
 *
 * Targets the IDOR-protected, enumeration-resistant contract defined
 * by AuthService + ADR-004.
 */

import request from 'supertest';
import { Role } from '@prisma/client';
import {
  bootIntegrationApp,
  resetDb,
  createTestUser,
  IntegrationContext,
} from './integration-helpers';

describe('Auth (integration)', () => {
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

  describe('POST /auth/login', () => {
    it('returns tokens + user on correct credentials', async () => {
      const user = await createTestUser(ctx.prisma, { role: Role.ADMIN });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });

      expect([200, 201]).toContain(res.status);
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          id: user.id,
          email: user.email,
          role: Role.ADMIN,
        },
      });
      expect(res.body.user.password).toBeUndefined();
    });

    it('returns 401 on wrong password — same message as unknown email', async () => {
      const user = await createTestUser(ctx.prisma, { role: Role.TECHNICIAN });

      const wrongPw = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: 'WrongPassword!' })
        .expect(401);

      const unknownEmail = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'never-existed@test.local', password: 'whatever' })
        .expect(401);

      // The message MUST be identical — leaking "email unknown" vs
      // "wrong password" enables enumeration.
      expect(wrongPw.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user when called with a valid token', async () => {
      const user = await createTestUser(ctx.prisma, { role: Role.DISPATCHER });
      const login = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });
      const token = login.body.accessToken as string;

      const res = await request(ctx.app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: user.id,
        email: user.email,
        role: Role.DISPATCHER,
      });
    });

    it('returns 401 when called without a token', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);
    });

    it('returns 401 when the token is malformed', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token atomically', async () => {
      const user = await createTestUser(ctx.prisma, { role: Role.ADMIN });
      const login = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });
      const oldRefresh = login.body.refreshToken as string;

      // First refresh : both tokens regenerated
      const r1 = await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(200);
      const newRefresh = r1.body.refreshToken as string;
      expect(newRefresh).not.toBe(oldRefresh);
      expect(r1.body.accessToken).toBeTruthy();

      // The new refresh works
      const r2 = await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: newRefresh })
        .expect(200);
      expect(r2.body.refreshToken).toBeTruthy();
      expect(r2.body.refreshToken).not.toBe(newRefresh);
    });

    it('rejects a replayed (already-rotated) refresh token AND revokes the family', async () => {
      const user = await createTestUser(ctx.prisma, { role: Role.ADMIN });
      const login = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });
      const oldRefresh = login.body.refreshToken as string;

      const r1 = await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh });
      const newRefresh = r1.body.refreshToken as string;

      // Replay the OLD token → must fail (already rotated)
      await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(401);

      // After replay detection, the family is killed — the NEW refresh
      // should now also be rejected (defensive: prevents the legitimate
      // user from sharing access with the attacker who replayed).
      await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: newRefresh })
        .expect(401);
    });

    it('returns 401 for a refresh token that never existed', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'totally-not-a-real-token' })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the presented refresh token', async () => {
      const user = await createTestUser(ctx.prisma, { role: Role.ADMIN });
      const login = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });
      const accessToken = login.body.accessToken as string;
      const refreshToken = login.body.refreshToken as string;

      await request(ctx.app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(204);

      // The revoked token can no longer be used to refresh
      await request(ctx.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('returns 2xx for an already-revoked / unknown token (best-effort)', async () => {
      const user = await createTestUser(ctx.prisma, { role: Role.ADMIN });
      const login = await request(ctx.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password });
      const accessToken = login.body.accessToken as string;

      await request(ctx.app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken: 'never-existed' })
        .expect(204);
    });
  });
});
