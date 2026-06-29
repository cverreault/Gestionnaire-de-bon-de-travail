import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  it('returns null outside a run() scope', () => {
    const svc = new RequestContextService();
    expect(svc.current()).toBeNull();
  });

  it('exposes the context inside the callback', () => {
    const svc = new RequestContextService();
    svc.run({ tenantId: 't-1', userId: 'u-1' }, () => {
      expect(svc.current()).toEqual({ tenantId: 't-1', userId: 'u-1' });
    });
  });

  it('isolates contexts across nested run() invocations', async () => {
    const svc = new RequestContextService();
    await svc.run({ tenantId: 't-outer', userId: null }, async () => {
      svc.run({ tenantId: 't-inner', userId: 'u-2' }, () => {
        expect(svc.current()?.tenantId).toBe('t-inner');
      });
      // Outer scope is restored after the inner block returns.
      expect(svc.current()?.tenantId).toBe('t-outer');
    });
  });

  it('keeps the context alive across awaited boundaries', async () => {
    const svc = new RequestContextService();
    await svc.run({ tenantId: 't-1', userId: 'u-1' }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(svc.current()?.tenantId).toBe('t-1');
    });
  });

  it('requireTenantId throws when called outside a context', () => {
    const svc = new RequestContextService();
    expect(() => svc.requireTenantId()).toThrow(/outside a request context/);
  });

  it('requireTenantId returns the active tenantId inside a context', () => {
    const svc = new RequestContextService();
    svc.run({ tenantId: 't-42', userId: null }, () => {
      expect(svc.requireTenantId()).toBe('t-42');
    });
  });
});
