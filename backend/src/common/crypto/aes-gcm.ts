import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';

/**
 * AES-256-GCM encryption helper (SA.1.b).
 *
 * Output format
 *   `${ivHex}:${authTagHex}:${ciphertextHex}`
 *
 * The format is colon-separated so it's grep-friendly in a DB dump
 * (you can spot encrypted vs plain values at a glance) and never
 * conflates with the raw value (env-style values don't contain raw
 * colons in our usage; if they ever do, the `encrypted` flag in
 * `system_configs` tells us which path to take).
 *
 * Master-key sourcing
 *   The caller passes a 32-byte key. The most natural input is a hex
 *   string from CONFIG_MASTER_KEY (64 hex chars). To survive a user
 *   pasting a non-hex passphrase by mistake, `deriveKey()` hashes
 *   whatever it gets with SHA-256 to produce a stable 32-byte buffer.
 *
 * No KDF iteration — this is NOT a password derivation. The "master"
 * is already a secret the operator controls. If you want PBKDF2 down
 * the line, swap deriveKey().
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — standard for GCM
const KEY_LENGTH = 32; // 256 bits

export function deriveKey(rawMasterKey: string): Buffer {
  // SHA-256 always yields 32 bytes — perfect for AES-256.
  return createHash('sha256').update(rawMasterKey).digest();
}

export function encrypt(plaintext: string, masterKey: Buffer): string {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes (got ${masterKey.length})`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decrypt(packed: string, masterKey: Buffer): string {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be ${KEY_LENGTH} bytes (got ${masterKey.length})`);
  }
  const parts = packed.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext (expected iv:tag:ct)');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ctHex, 'hex');
  const decipher = createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
