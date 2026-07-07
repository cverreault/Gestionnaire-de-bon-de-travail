import { assertSecrets } from './assert-secrets';

const STRONG = 'a'.repeat(48);

describe('assertSecrets (B25)', () => {
  it('passes with two strong secrets', () => {
    expect(() =>
      assertSecrets({ JWT_SECRET: STRONG, JWT_REFRESH_SECRET: STRONG } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() =>
      assertSecrets({ JWT_REFRESH_SECRET: STRONG } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET is not set/);
  });

  it('throws when a secret is too short', () => {
    expect(() =>
      assertSecrets({ JWT_SECRET: 'short', JWT_REFRESH_SECRET: STRONG } as NodeJS.ProcessEnv),
    ).toThrow(/too short/);
  });

  it('throws on the known placeholder defaults', () => {
    expect(() =>
      assertSecrets({
        JWT_SECRET: 'changeme-jwt-secret',
        JWT_REFRESH_SECRET: STRONG,
      } as NodeJS.ProcessEnv),
    ).toThrow(/placeholder|default/);
    expect(() =>
      assertSecrets({
        JWT_SECRET: STRONG,
        JWT_REFRESH_SECRET: 'change-me-in-production-xxxxxxxxxxxx',
      } as NodeJS.ProcessEnv),
    ).toThrow(/placeholder|default/);
  });

  it('reports both secrets when both are bad', () => {
    expect(() => assertSecrets({} as NodeJS.ProcessEnv)).toThrow(
      /JWT_SECRET[\s\S]*JWT_REFRESH_SECRET/,
    );
  });
});
