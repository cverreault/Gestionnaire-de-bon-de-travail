import { sign, verify, SIGNATURE_TOLERANCE_SECONDS } from './webhook-signer';

describe('webhook-signer', () => {
  const SECRET = 'whsec_test_abc123';
  const BODY = JSON.stringify({ id: 'wo_1', type: 'workOrders.workOrder.created' });
  const FIXED_MS = 1_783_000_000_000; // 2026-07-02

  it('produces a stable signature for fixed (body, secret, timestamp)', () => {
    const a = sign(BODY, SECRET, FIXED_MS);
    const b = sign(BODY, SECRET, FIXED_MS);
    expect(a.signatureHeader).toBe(b.signatureHeader);
    expect(a.signatureHeader).toMatch(/^t=1783000000,v1=[0-9a-f]{64}$/);
  });

  it('verify() accepts a fresh signature', () => {
    const { signatureHeader } = sign(BODY, SECRET, FIXED_MS);
    expect(verify(BODY, SECRET, signatureHeader, FIXED_MS)).toBe(true);
  });

  it('verify() rejects a stale signature (outside tolerance)', () => {
    const { signatureHeader } = sign(BODY, SECRET, FIXED_MS);
    const later = FIXED_MS + (SIGNATURE_TOLERANCE_SECONDS + 1) * 1000;
    expect(verify(BODY, SECRET, signatureHeader, later)).toBe(false);
  });

  it('verify() rejects a tampered body', () => {
    const { signatureHeader } = sign(BODY, SECRET, FIXED_MS);
    const tampered = BODY.replace('wo_1', 'wo_2');
    expect(verify(tampered, SECRET, signatureHeader, FIXED_MS)).toBe(false);
  });

  it('verify() rejects a wrong secret', () => {
    const { signatureHeader } = sign(BODY, SECRET, FIXED_MS);
    expect(verify(BODY, 'whsec_wrong', signatureHeader, FIXED_MS)).toBe(false);
  });

  it('verify() rejects malformed header', () => {
    expect(verify(BODY, SECRET, 'garbage', FIXED_MS)).toBe(false);
    expect(verify(BODY, SECRET, 't=123', FIXED_MS)).toBe(false);
    expect(verify(BODY, SECRET, 'v1=abc', FIXED_MS)).toBe(false);
  });
});
