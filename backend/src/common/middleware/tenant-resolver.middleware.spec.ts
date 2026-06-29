/**
 * QA — tenant-resolver.middleware.spec.ts (B6.2)
 *
 * Locks the tenant resolution contract :
 *   1. Real subdomain → tenant looked up, attached to request
 *   2. Localhost / IP / apex → DEFAULT tenant attached
 *   3. Reserved subdomain (auth, www, …) → DEFAULT tenant attached
 *   4. Unknown subdomain → NotFoundException (no enumeration)
 *   5. Inactive tenant → NotFoundException
 *   6. DEFAULT missing → NotFoundException + error log
 *   7. Cache: second lookup with same Host doesn't re-hit Prisma
 */

import { NotFoundException } from '@nestjs/common';
import { TenantResolverMiddleware } from './tenant-resolver.middleware';
import { TENANT_REQUEST_KEY } from '../contracts/tenant-context.contract';

function makePrisma() {
  return {
    tenant: {
      findUnique: jest.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function makeMiddleware(prisma: MockPrisma): TenantResolverMiddleware {
  return new TenantResolverMiddleware(prisma as unknown as never);
}

function makeReq(host: string | undefined) {
  return {
    headers: { host },
  } as never as Record<string, unknown>;
}

const RES = {} as never;

describe('TenantResolverMiddleware', () => {
  it('attaches the tenant when the slug matches a real row', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: 't-1',
      slug: 'myclient',
      name: 'My Client',
      isActive: true,
    });
    const mw = makeMiddleware(prisma);
    const req = makeReq('myclient.taskmgr.com');
    const next = jest.fn();

    await mw.use(req as never, RES, next);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'myclient' },
      select: { id: true, slug: true, name: true, isActive: true },
    });
    expect((req as unknown as Record<string, { slug: string }>)[TENANT_REQUEST_KEY]).toEqual({
      id: 't-1',
      slug: 'myclient',
      name: 'My Client',
      isActive: true,
    });
    expect(next).toHaveBeenCalled();
  });

  it('falls back to DEFAULT on localhost', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: 'default-id',
      slug: 'default',
      name: 'Default tenant',
      isActive: true,
    });
    const mw = makeMiddleware(prisma);
    const req = makeReq('localhost:8088');
    const next = jest.fn();

    await mw.use(req as never, RES, next);

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'default' },
      select: { id: true, slug: true, name: true, isActive: true },
    });
    expect((req as unknown as Record<string, { slug: string }>)[TENANT_REQUEST_KEY].slug).toBe('default');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to DEFAULT on reserved subdomain (auth)', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: 'default-id',
      slug: 'default',
      name: 'Default tenant',
      isActive: true,
    });
    const mw = makeMiddleware(prisma);
    const req = makeReq('auth.taskmgr.com');

    await mw.use(req as never, RES, jest.fn());

    expect((req as unknown as Record<string, { slug: string }>)[TENANT_REQUEST_KEY].slug).toBe('default');
  });

  it('throws 404 when the derived slug does not match a row', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValueOnce(null);
    const mw = makeMiddleware(prisma);
    const req = makeReq('ghost.taskmgr.com');

    await expect(mw.use(req as never, RES, jest.fn())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 when the matched tenant is inactive', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: 't-1',
      slug: 'myclient',
      name: 'My Client',
      isActive: false,
    });
    const mw = makeMiddleware(prisma);
    const req = makeReq('myclient.taskmgr.com');

    await expect(mw.use(req as never, RES, jest.fn())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 when DEFAULT is missing (Genesis not applied)', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValueOnce(null);
    const mw = makeMiddleware(prisma);
    const req = makeReq('localhost');

    await expect(mw.use(req as never, RES, jest.fn())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('caches the slug → tenant lookup (no re-fetch on subsequent calls)', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique.mockResolvedValueOnce({
      id: 't-1',
      slug: 'myclient',
      name: 'My Client',
      isActive: true,
    });
    const mw = makeMiddleware(prisma);

    await mw.use(makeReq('myclient.taskmgr.com') as never, RES, jest.fn());
    await mw.use(makeReq('myclient.taskmgr.com') as never, RES, jest.fn());
    await mw.use(makeReq('myclient.taskmgr.com') as never, RES, jest.fn());

    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
  });
});
