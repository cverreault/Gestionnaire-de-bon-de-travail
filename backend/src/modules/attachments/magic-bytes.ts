/**
 * B27 — content-type sniffing (defence-in-depth for uploads).
 *
 * The declared multipart `Content-Type` is attacker-controlled. Before
 * trusting it we confirm the file's leading bytes actually match the
 * declared MIME family, so an HTML/script payload can't be stored
 * labelled `image/png`.
 */

type Sig = { offset: number; bytes: number[] };

// Each MIME maps to the signatures that count as a match (any one).
const SIGNATURES: Record<string, Sig[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }], // "RIFF" (WEBP checked below)
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  // OLE Compound File (legacy .doc / .xls)
  'application/msword': [
    { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  ],
  'application/vnd.ms-excel': [
    { offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  ],
  // OOXML (.docx / .xlsx) are ZIP archives → "PK\x03\x04"
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  ],
};

function matches(buffer: Buffer, sig: Sig): boolean {
  if (buffer.length < sig.offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buffer[sig.offset + i] !== sig.bytes[i]) return false;
  }
  return true;
}

/**
 * Returns true when `buffer`'s magic bytes are consistent with
 * `declaredMime`. Unknown MIME (not in the table) returns true — the
 * caller has already checked the allowlist, this only guards the types
 * we have signatures for.
 */
export function magicBytesMatch(buffer: Buffer, declaredMime: string): boolean {
  const sigs = SIGNATURES[declaredMime];
  if (!sigs) return true;
  const ok = sigs.some((s) => matches(buffer, s));
  if (!ok) return false;
  // WEBP: "RIFF" also fronts WAV/AVI — confirm the "WEBP" fourcc at 8.
  if (declaredMime === 'image/webp') {
    const webp = [0x57, 0x45, 0x42, 0x50];
    return matches(buffer, { offset: 8, bytes: webp });
  }
  return true;
}
