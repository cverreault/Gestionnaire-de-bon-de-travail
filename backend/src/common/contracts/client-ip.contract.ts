import { isIP } from 'node:net';

/**
 * B63 — public IP of the client.
 *
 * Behind nginx (`trust proxy`), `req.ip` is the address nginx saw : the public
 * IP of a remote client, but the LAN address of a device on the company
 * network. The web app and the mobile app look up their public IP once per
 * hour and send it in this header ; it is used only when the observed address
 * is private, and the private one is kept alongside (`lanIp`).
 */
export const CLIENT_PUBLIC_IP_HEADER = 'x-client-public-ip' as const;

export interface ResolvedClientIp {
  /** Best public address : observed when public, else the client-reported one. */
  ip: string | null;
  /** Private address observed by the proxy when `ip` came from the header. */
  lanIp: string | null;
}

export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim().replace(/^::ffff:/i, '');
  return isIP(v) ? v : null;
}

export function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  const low = ip.toLowerCase();
  return low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80');
}

export function resolveClientIp(req: { ip?: string; headers?: Record<string, string | string[] | undefined> } | undefined): ResolvedClientIp {
  if (!req) return { ip: null, lanIp: null };
  const observed = normalizeIp(req.ip);
  const rawHeader = req.headers?.[CLIENT_PUBLIC_IP_HEADER];
  const reported = normalizeIp(Array.isArray(rawHeader) ? rawHeader[0] : rawHeader);
  if (observed && isPrivateIp(observed) && reported && !isPrivateIp(reported)) {
    return { ip: reported, lanIp: observed };
  }
  return { ip: observed, lanIp: null };
}
