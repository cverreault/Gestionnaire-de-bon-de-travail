import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * B9 — At-rest encryption for webhook signing secrets.
 *
 * We need the plaintext at delivery time to sign HMAC-SHA256 over the body.
 * A hash won't do — so we store the secret encrypted with AES-256-GCM and
 * decrypt it in-process when the dispatcher runs.
 *
 * ─ Key source ─
 *   Reads WEBHOOK_MASTER_KEY (env, hex-encoded 32 bytes). Falls back to
 *   SHA-256(JWT_SECRET) so a fresh dev bring-up works without adding a new
 *   env var. Production deployments MUST set WEBHOOK_MASTER_KEY explicitly
 *   — the docs / release notes call this out.
 *
 * ─ Payload format ─
 *   `<12-byte IV> | <16-byte auth-tag> | <ciphertext>`, base64-url encoded.
 *   Constant leading 28 bytes = we can slice by fixed offsets on decrypt.
 *
 * ─ Key rotation ─
 *   Not implemented in v1 — a new master key would fail to decrypt existing
 *   rows. When we need this, add a `key_version` byte prefix + a small
 *   keyring map. Deliberately out of scope for now.
 */

const ALG = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.WEBHOOK_MASTER_KEY?.trim();
  if (raw) {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error(
        'WEBHOOK_MASTER_KEY must be 64 hex chars (32 bytes). Generate with `openssl rand -hex 32`.',
      );
    }
    cachedKey = Buffer.from(raw, 'hex');
    return cachedKey;
  }
  // Fallback: derive from JWT_SECRET so a fresh dev container just works.
  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (!jwtSecret) {
    throw new Error(
      'Neither WEBHOOK_MASTER_KEY nor JWT_SECRET is set — cannot derive a webhook encryption key.',
    );
  }
  cachedKey = createHash('sha256').update(jwtSecret).digest();
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(encrypted: string): string {
  const key = getMasterKey();
  const buf = Buffer.from(encrypted, 'base64');
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Encrypted secret is too short — corrupted row?');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/**
 * Reset the cache — for tests that swap the env var between calls.
 * Not exported to the DI graph.
 */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
}
