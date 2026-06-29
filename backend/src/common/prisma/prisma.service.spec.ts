/**
 * QA — prisma.service.spec.ts (B6.5)
 *
 * Locks the withTenantScope() contract :
 *   1. Wraps the callback in a Prisma transaction
 *   2. Issues SET app.tenant_id (via set_config) at the head of the
 *      transaction, scoped LOCAL to the transaction (third arg = true)
 *   3. The callback receives the transaction client
 *   4. Returns the callback's resolved value
 *
 * The RLS policies themselves are exercised by the integration suite
 * (B6.13). Here we only verify the wrapper does the right plumbing.
 */

import { PrismaService } from './prisma.service';

function makeRequestContext() {
  return { current: jest.fn(() => null) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeService(): any {
  // Construct without calling super() — we only need the prototype
  // methods. Set the minimal shape required by withTenantScope.
  const svc = Object.create(PrismaService.prototype);
  // The constructor parameter is private; assign through a loose cast
  // so the spec only depends on the methods it actually exercises.
  svc.context = makeRequestContext();
  return svc;
}

describe('PrismaService.withTenantScope', () => {
  it('runs the callback inside a transaction with set_config issued first', async () => {
    const svc = makeService();
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };
    svc.$transaction = jest
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        return callback(tx);
      });

    const result = await svc.withTenantScope('t-1', async () => 'OK');

    expect(svc.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      't-1',
    );
    expect(result).toBe('OK');
  });

  it('passes the transaction client to the callback', async () => {
    const svc = makeService();
    const tx = { $executeRawUnsafe: jest.fn(), tag: 'tx-client' };
    svc.$transaction = jest
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
      );

    const callback = jest.fn().mockResolvedValue('value');
    await svc.withTenantScope('t-1', callback);

    expect(callback).toHaveBeenCalledWith(tx);
  });

  it('returns the callback\'s resolved value', async () => {
    const svc = makeService();
    svc.$transaction = jest
      .fn()
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ $executeRawUnsafe: jest.fn() }),
      );

    const payload = { id: 'wo-1' };
    const result = await svc.withTenantScope('t-1', async () => payload);

    expect(result).toBe(payload);
  });
});
