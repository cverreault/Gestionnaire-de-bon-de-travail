import { isPrivateIp, normalizeIp, resolveClientIp } from './client-ip.contract';

describe('client IP resolution (B63)', () => {
  it('detects private ranges', () => {
    for (const ip of ['10.0.0.1', '172.16.45.136', '172.31.255.1', '192.168.1.10', '127.0.0.1', '::1', 'fd00::1']) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ['74.114.16.228', '172.32.0.1', '8.8.8.8', '2001:db8::1']) expect(isPrivateIp(ip)).toBe(false);
  });

  it('normalizes IPv4-mapped addresses and rejects garbage', () => {
    expect(normalizeIp('::ffff:172.16.45.136')).toBe('172.16.45.136');
    expect(normalizeIp('not-an-ip')).toBeNull();
  });

  it('uses the reported public IP only when the observed one is private', () => {
    expect(resolveClientIp({ ip: '172.16.45.136', headers: { 'x-client-public-ip': '74.114.16.228' } })).toEqual({ ip: '74.114.16.228', lanIp: '172.16.45.136' });
    expect(resolveClientIp({ ip: '99.1.2.3', headers: { 'x-client-public-ip': '74.114.16.228' } })).toEqual({ ip: '99.1.2.3', lanIp: null });
    expect(resolveClientIp({ ip: '172.16.45.136', headers: { 'x-client-public-ip': '192.168.0.9' } })).toEqual({ ip: '172.16.45.136', lanIp: null });
    expect(resolveClientIp({ ip: '172.16.45.136', headers: {} })).toEqual({ ip: '172.16.45.136', lanIp: null });
    expect(resolveClientIp(undefined)).toEqual({ ip: null, lanIp: null });
  });
});
