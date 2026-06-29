/**
 * QA — aes-gcm.spec.ts
 */

import { deriveKey, encrypt, decrypt } from './aes-gcm';

const MASTER = deriveKey('test-master-key-for-jest');

describe('aes-gcm', () => {
  it('round-trips a UTF-8 string', () => {
    const plaintext = 'hello @taskmgr — accents çà va — 漢字';
    const packed = encrypt(plaintext, MASTER);
    expect(decrypt(packed, MASTER)).toBe(plaintext);
  });

  it('produces a colon-separated iv:tag:ct format', () => {
    const packed = encrypt('foo', MASTER);
    const parts = packed.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // ciphertext = same length as plaintext bytes × 2 hex chars
    expect(parts[2]).toHaveLength(Buffer.byteLength('foo', 'utf8') * 2);
  });

  it('produces a different ciphertext every time (random IV)', () => {
    const a = encrypt('same input', MASTER);
    const b = encrypt('same input', MASTER);
    expect(a).not.toBe(b);
    // …but both decrypt to the same plaintext.
    expect(decrypt(a, MASTER)).toBe(decrypt(b, MASTER));
  });

  it('refuses to decrypt with the wrong key (auth tag mismatch)', () => {
    const packed = encrypt('secret', MASTER);
    const wrong = deriveKey('different-key');
    expect(() => decrypt(packed, wrong)).toThrow();
  });

  it('refuses to decrypt a tampered ciphertext', () => {
    const packed = encrypt('don\'t touch this', MASTER);
    const [iv, tag, ct] = packed.split(':');
    // Flip the last hex digit of the ciphertext.
    const lastChar = ct[ct.length - 1];
    const flipped = ct.slice(0, -1) + (lastChar === '0' ? '1' : '0');
    const tampered = `${iv}:${tag}:${flipped}`;
    expect(() => decrypt(tampered, MASTER)).toThrow();
  });

  it('throws on a malformed packed string', () => {
    expect(() => decrypt('not-a-cipher', MASTER)).toThrow(/Malformed ciphertext/);
    expect(() => decrypt('one:two', MASTER)).toThrow(/Malformed ciphertext/);
    expect(() => decrypt('a:b:c:d', MASTER)).toThrow(/Malformed ciphertext/);
  });

  it('throws on a master key of the wrong length', () => {
    const short = Buffer.alloc(16); // 128 bits — too short for AES-256
    expect(() => encrypt('x', short)).toThrow(/32 bytes/);
    expect(() => decrypt('a:b:c', short)).toThrow(/32 bytes/);
  });

  it('deriveKey() always returns 32 bytes regardless of input length', () => {
    expect(deriveKey('').length).toBe(32);
    expect(deriveKey('short').length).toBe(32);
    expect(deriveKey('a'.repeat(1000)).length).toBe(32);
  });

  it('deriveKey() is deterministic (same input → same key)', () => {
    const a = deriveKey('passphrase');
    const b = deriveKey('passphrase');
    expect(a.toString('hex')).toBe(b.toString('hex'));
  });
});
