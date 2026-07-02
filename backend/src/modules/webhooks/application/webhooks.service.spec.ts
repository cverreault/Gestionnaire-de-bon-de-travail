import { isReservedAddress } from './webhooks.service';
import { encryptSecret, decryptSecret, _resetKeyCacheForTests } from './secret-crypto';

describe('isReservedAddress', () => {
  it('rejects IPv4 loopback', () => {
    expect(isReservedAddress('127.0.0.1')).toBe(true);
    expect(isReservedAddress('127.9.9.9')).toBe(true);
  });

  it('rejects RFC1918 ranges', () => {
    expect(isReservedAddress('10.0.0.5')).toBe(true);
    expect(isReservedAddress('192.168.1.1')).toBe(true);
    expect(isReservedAddress('172.16.0.1')).toBe(true);
    expect(isReservedAddress('172.31.255.255')).toBe(true);
  });

  it('rejects link-local + AWS/GCE metadata range', () => {
    expect(isReservedAddress('169.254.169.254')).toBe(true);
    expect(isReservedAddress('169.254.0.1')).toBe(true);
  });

  it('rejects IPv6 loopback + ULA + link-local', () => {
    expect(isReservedAddress('::1')).toBe(true);
    expect(isReservedAddress('fc00::1')).toBe(true);
    expect(isReservedAddress('fd12:3456::abcd')).toBe(true);
    expect(isReservedAddress('fe80::1')).toBe(true);
  });

  it('rejects IPv4-mapped IPv6 loopback', () => {
    expect(isReservedAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('does NOT reject a public IPv4', () => {
    expect(isReservedAddress('8.8.8.8')).toBe(false);
    expect(isReservedAddress('1.1.1.1')).toBe(false);
  });

  it('does NOT reject a public IPv6', () => {
    expect(isReservedAddress('2001:db8::1')).toBe(false);
  });

  it('does NOT reject junk (unclassifiable)', () => {
    // Intentionally: caller resolves via DNS first — this helper only
    // classifies known IPs. Junk input can't be a real IP anyway.
    expect(isReservedAddress('not-an-ip')).toBe(false);
  });
});

describe('secret-crypto', () => {
  const ORIGINAL_KEY = process.env.WEBHOOK_MASTER_KEY;
  const ORIGINAL_JWT = process.env.JWT_SECRET;

  beforeEach(() => {
    _resetKeyCacheForTests();
    process.env.WEBHOOK_MASTER_KEY =
      '0000000000000000000000000000000000000000000000000000000000000001';
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.WEBHOOK_MASTER_KEY;
    else process.env.WEBHOOK_MASTER_KEY = ORIGINAL_KEY;
    if (ORIGINAL_JWT === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT;
    _resetKeyCacheForTests();
  });

  it('encrypt → decrypt round-trips the plaintext', () => {
    const plaintext = 'whsec_abcdefg1234';
    const enc = encryptSecret(plaintext);
    expect(enc).not.toContain(plaintext); // opaque
    expect(decryptSecret(enc)).toBe(plaintext);
  });

  it('different IVs → different ciphertexts for the same plaintext', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });

  it('rejects a truncated payload', () => {
    expect(() => decryptSecret('YWJj')).toThrow(/too short/i);
  });

  it('rejects a malformed master key', () => {
    process.env.WEBHOOK_MASTER_KEY = 'not-hex';
    _resetKeyCacheForTests();
    expect(() => encryptSecret('anything')).toThrow(/64 hex/);
  });

  it('falls back to JWT_SECRET when no master key is set', () => {
    delete process.env.WEBHOOK_MASTER_KEY;
    process.env.JWT_SECRET = 'dev-jwt-secret';
    _resetKeyCacheForTests();
    const enc = encryptSecret('via-jwt');
    expect(decryptSecret(enc)).toBe('via-jwt');
  });
});
