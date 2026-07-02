/**
 * QA — user-scoped-throttler.guard.spec.ts
 *
 * Locks the tracker-selection contract:
 *   1. Public API request (has req.apiKey) → bucket is "apiKey:<id>"
 *      — takes priority over any user/ip
 *   2. Internal UI request (has req.user)  → bucket is "user:<id>"
 *   3. Anonymous request (no user, no key) → bucket is "ip:<addr>"
 *   4. Anonymous without IP → bucket is "ip:unknown"
 *
 * The actual rate-limit math is owned by @nestjs/throttler — what we
 * care about here is the bucket KEY, which decides who shares a budget.
 */

import { UserScopedThrottlerGuard } from './user-scoped-throttler.guard';
import type { Request } from 'express';

function makeReq(
  overrides: Partial<Request> & {
    user?: { id?: string };
    apiKey?: { id?: string };
  },
): Request {
  return {
    ip: '203.0.113.42',
    ...overrides,
  } as unknown as Request;
}

describe('UserScopedThrottlerGuard.getTracker', () => {
  /**
   * The guard extends ThrottlerGuard whose constructor needs DI metadata
   * we don't want to wire here. getTracker doesn't depend on any of that
   * state, so we expose it via Object.getPrototypeOf to invoke it raw.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getTracker = (UserScopedThrottlerGuard.prototype as any).getTracker;

  it('buckets authenticated requests by user id', async () => {
    const req = makeReq({ user: { id: 'u-123' } });
    await expect(getTracker(req)).resolves.toBe('user:u-123');
  });

  it('falls back to IP when req.user is absent', async () => {
    const req = makeReq({});
    await expect(getTracker(req)).resolves.toBe('ip:203.0.113.42');
  });

  it('falls back to IP when req.user has no id (defensive)', async () => {
    const req = makeReq({ user: {} });
    await expect(getTracker(req)).resolves.toBe('ip:203.0.113.42');
  });

  it('uses "unknown" when ip is undefined (no over-share of one bucket)', async () => {
    const req = makeReq({ ip: undefined });
    await expect(getTracker(req)).resolves.toBe('ip:unknown');
  });

  it('user bucket and ip bucket are NEVER the same key (no collision)', async () => {
    const a = await getTracker(makeReq({ user: { id: '203.0.113.42' } }));
    const b = await getTracker(makeReq({ ip: '203.0.113.42' }));
    expect(a).not.toBe(b);
    expect(a).toBe('user:203.0.113.42');
    expect(b).toBe('ip:203.0.113.42');
  });

  it('buckets public API requests by apiKey id (highest priority)', async () => {
    const req = makeReq({ apiKey: { id: 'k-1' } });
    await expect(getTracker(req)).resolves.toBe('apiKey:k-1');
  });

  it('apiKey wins over user + ip when all are present', async () => {
    const req = makeReq({
      apiKey: { id: 'k-1' },
      user: { id: 'u-1' },
      ip: '203.0.113.42',
    });
    await expect(getTracker(req)).resolves.toBe('apiKey:k-1');
  });

  it('apiKey vs user vs ip buckets are all distinct even for identical values', async () => {
    const a = await getTracker(makeReq({ apiKey: { id: 'x' } }));
    const b = await getTracker(makeReq({ user: { id: 'x' } }));
    const c = await getTracker(makeReq({ ip: 'x' }));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
