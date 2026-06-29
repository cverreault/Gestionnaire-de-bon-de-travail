/**
 * QA — user-scoped-throttler.guard.spec.ts
 *
 * Locks the tracker-selection contract:
 *   1. Authenticated request → bucket is "user:<id>"
 *   2. Anonymous request (no user) → bucket is "ip:<addr>"
 *   3. Anonymous request without an IP → bucket is "ip:unknown"
 *      (defensive: ip might be undefined behind certain proxy setups)
 *
 * The actual rate-limit math is owned by @nestjs/throttler — what we
 * care about here is the bucket KEY, which decides who shares a budget.
 */

import { UserScopedThrottlerGuard } from './user-scoped-throttler.guard';
import type { Request } from 'express';

function makeReq(overrides: Partial<Request> & { user?: { id?: string } }): Request {
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
});
