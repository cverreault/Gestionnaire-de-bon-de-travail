import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * B9 — Stripe-style HMAC signing for outbound webhooks.
 *
 * Signature header format :
 *   X-TaskMgr-Signature: t=<unix-seconds>,v1=<hex>
 * where v1 = HMAC_SHA256(secret, "<t>.<rawBody>").
 *
 * Signing the timestamp INSIDE the MAC input (not just as a header) means
 * an attacker who captured a payload cannot replay it with a fresh
 * timestamp — the receiver's verification recomputes with the header's `t`.
 * Combined with a ±5-min freshness window on the receiver side, this closes
 * the replay window in practice.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface SignedRequest {
  timestamp: number;
  signatureHeader: string;
}

/**
 * Produce the signature header value for a raw body + secret.
 * `timestampMs` defaults to `Date.now()` — pass an explicit value in tests
 * so the output is deterministic.
 */
export function sign(
  rawBody: string,
  secret: string,
  timestampMs: number = Date.now(),
): SignedRequest {
  const t = Math.floor(timestampMs / 1000);
  const digest = createHmac('sha256', secret)
    .update(`${t}.${rawBody}`, 'utf8')
    .digest('hex');
  return {
    timestamp: t,
    signatureHeader: `t=${t},v1=${digest}`,
  };
}

/**
 * Verify an inbound signature header. Used ONLY in tests today (receivers
 * live outside TaskMgr and implement this themselves in their own stack),
 * but shipped as a reference implementation.
 *
 * Returns true on match AND freshness. Uses timingSafeEqual to avoid a
 * timing side-channel on the HMAC comparison.
 */
export function verify(
  rawBody: string,
  secret: string,
  signatureHeader: string,
  nowMs: number = Date.now(),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;
  const nowSec = Math.floor(nowMs / 1000);
  if (Math.abs(nowSec - parsed.timestamp) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret)
    .update(`${parsed.timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parsed.v1, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseSignatureHeader(
  header: string,
): { timestamp: number; v1: string } | null {
  const parts = header.split(',').map((s) => s.trim());
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const [k, v] = part.split('=', 2);
    if (k === 't' && v) t = Number(v);
    else if (k === 'v1' && v) v1 = v;
  }
  if (t === null || Number.isNaN(t) || v1 === null) return null;
  return { timestamp: t, v1 };
}
