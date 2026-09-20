/** Loose semver compare : returns true when `candidate` is strictly newer than `current`. Unparsable → false. */
export function isNewerVersion(candidate: string | null | undefined, current: string | null | undefined): boolean {
  const parse = (v: string | null | undefined) => {
    const m = String(v ?? '').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
  };
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export interface ApkManifest {
  android?: { version: string; url: string; file?: string; size?: number; sha256?: string; publishedAt?: string; notes?: string };
}
