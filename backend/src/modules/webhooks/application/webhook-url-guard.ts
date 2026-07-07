import { promises as dnsPromises } from 'node:dns';
import { isIP } from 'node:net';

/**
 * B26 — shared SSRF guard for outbound webhook URLs.
 *
 * Two call sites:
 *   1. create/update time (WebhooksService) — reject a URL that resolves
 *      to a private/reserved address.
 *   2. delivery time (WebhookDispatcherService) — RE-resolve just before
 *      the request (DNS-rebinding defence: the address may have flipped
 *      since creation) and PIN the connection to the validated public IP
 *      so undici can't be redirected to an internal host between our
 *      lookup and its own.
 */

export class WebhookUrlError extends Error {}

/**
 * True when `addr` is a private / loopback / link-local / metadata
 * address — the ranges an SSRF attacker would use to reach internal
 * infra or cloud metadata endpoints.
 */
export function isReservedAddress(addr: string): boolean {
  const family = isIP(addr);
  if (family === 4) {
    if (addr.startsWith('127.')) return true; // loopback 127/8
    if (addr.startsWith('10.')) return true; // private 10/8
    if (addr.startsWith('169.254.')) return true; // link-local + metadata
    if (addr.startsWith('192.168.')) return true; // private 192.168/16
    const parts = addr.split('.').map(Number);
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16/12
    if (parts[0] === 0) return true; // 0/8
    return false;
  }
  if (family === 6) {
    const lower = addr.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
    if (
      lower.startsWith('fe80:') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true; // link-local fe80::/10
    }
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isReservedAddress(mapped[1]); // IPv4-mapped
    return false;
  }
  return false;
}

export interface ValidatedWebhookTarget {
  /** The single public IP the caller must pin the connection to. */
  address: string;
  family: 4 | 6;
  hostname: string;
  port: number;
}

/**
 * Parse + resolve `rawUrl`, throwing WebhookUrlError on anything unsafe.
 * Returns the resolved public address so the delivery path can pin it.
 *
 * `requireHttps` forces https:// (used in production).
 */
export async function assertPublicWebhookUrl(
  rawUrl: string,
  requireHttps = process.env.NODE_ENV === 'production',
): Promise<ValidatedWebhookTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new WebhookUrlError('URL invalide');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new WebhookUrlError('Seul http:// et https:// sont autorisés');
  }
  if (requireHttps && parsed.protocol === 'http:') {
    throw new WebhookUrlError('https:// est obligatoire en production');
  }
  const host = parsed.hostname;
  if (!host) throw new WebhookUrlError("Hostname manquant dans l'URL");

  let addresses: Array<{ address: string; family: number }>;
  if (isIP(host)) {
    addresses = [{ address: host, family: isIP(host) }];
  } else {
    try {
      addresses = await dnsPromises.lookup(host, { all: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new WebhookUrlError(`Impossible de résoudre le hostname : ${message}`);
    }
  }
  if (addresses.length === 0) {
    throw new WebhookUrlError('Hostname non résolu');
  }
  // EVERY resolved address must be public — a hostname that returns one
  // public and one reserved answer is rejected (round-robin evasion).
  for (const a of addresses) {
    if (isReservedAddress(a.address)) {
      throw new WebhookUrlError(
        `L'URL pointe vers une adresse privée/réservée (${a.address}) — refusée (SSRF).`,
      );
    }
  }

  const chosen = addresses[0];
  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80;
  return {
    address: chosen.address,
    family: (isIP(chosen.address) as 4 | 6) || 4,
    hostname: host,
    port,
  };
}
