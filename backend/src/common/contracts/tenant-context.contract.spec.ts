import {
  extractTenantSlug,
  TENANT_RESERVED_SUBDOMAINS,
} from './tenant-context.contract';

describe('extractTenantSlug', () => {
  it('returns null for undefined / empty host', () => {
    expect(extractTenantSlug(undefined)).toBeNull();
    expect(extractTenantSlug('')).toBeNull();
  });

  it('returns null for loopback addresses (dev without /etc/hosts)', () => {
    expect(extractTenantSlug('localhost')).toBeNull();
    expect(extractTenantSlug('localhost:8088')).toBeNull();
    expect(extractTenantSlug('127.0.0.1')).toBeNull();
    expect(extractTenantSlug('127.0.0.1:3000')).toBeNull();
    expect(extractTenantSlug('::1')).toBeNull();
  });

  it('returns null for bare IPv4', () => {
    expect(extractTenantSlug('203.0.113.42')).toBeNull();
    expect(extractTenantSlug('10.0.0.5:80')).toBeNull();
  });

  it('returns null for the apex domain (no subdomain)', () => {
    expect(extractTenantSlug('taskmgr.com')).toBeNull();
    expect(extractTenantSlug('taskmgr.local:8088')).toBeNull();
  });

  it('returns null for reserved subdomains (auth, www, api, …)', () => {
    for (const reserved of TENANT_RESERVED_SUBDOMAINS) {
      expect(extractTenantSlug(`${reserved}.taskmgr.com`)).toBeNull();
    }
  });

  it('extracts the slug from a real tenant subdomain', () => {
    expect(extractTenantSlug('123.taskmgr.com')).toBe('123');
    expect(extractTenantSlug('myclient.taskmgr.com')).toBe('myclient');
    expect(extractTenantSlug('myclient.taskmgr.local:8088')).toBe('myclient');
  });

  it('lowercases the slug (matches the DB column casing)', () => {
    expect(extractTenantSlug('MyClient.taskmgr.com')).toBe('myclient');
  });

  it('handles ports and trailing whitespace cleanly', () => {
    expect(extractTenantSlug('myclient.taskmgr.com:443')).toBe('myclient');
  });
});
