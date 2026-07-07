/**
 * B25 — fail-fast validation of security-critical secrets at boot.
 *
 * A missing/weak JWT secret means every access & refresh token is signed
 * with a guessable value → trivial forgery of a SUPER_ADMIN token. Rather
 * than silently fall back to a public constant, the app refuses to start.
 *
 * Called from bootstrap BEFORE NestFactory.create so the failure is loud
 * and early, with a clear remediation message.
 */

const KNOWN_WEAK = [
  'changeme-jwt-secret',
  'changeme-jwt-refresh-secret',
  'change-me-in-production',
  'changeme',
  'secret',
];

const MIN_LENGTH = 32;

function checkSecret(name: string, value: string | undefined): string[] {
  const errors: string[] = [];
  if (!value || value.trim() === '') {
    errors.push(`${name} is not set.`);
    return errors;
  }
  const v = value.trim();
  if (v.length < MIN_LENGTH) {
    errors.push(`${name} is too short (${v.length} chars, need ≥ ${MIN_LENGTH}).`);
  }
  if (KNOWN_WEAK.some((w) => v.toLowerCase().includes(w))) {
    errors.push(`${name} contains a known placeholder/default value.`);
  }
  return errors;
}

/**
 * Throws (aborting boot) when a required secret is missing or weak.
 * `env` defaults to process.env; injectable for tests.
 */
export function assertSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const errors = [
    ...checkSecret('JWT_SECRET', env.JWT_SECRET),
    ...checkSecret('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET),
  ];

  if (errors.length > 0) {
    const guidance =
      'Generate strong values, e.g.:\n' +
      '  JWT_SECRET=$(openssl rand -hex 32)\n' +
      '  JWT_REFRESH_SECRET=$(openssl rand -hex 32)\n' +
      'and set them in your .env before starting the app.';
    throw new Error(
      `\n🔒 Refusing to start — insecure secret configuration:\n` +
        errors.map((e) => `  • ${e}`).join('\n') +
        `\n\n${guidance}\n`,
    );
  }
}
