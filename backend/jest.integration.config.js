/**
 * Integration test config (C4).
 *
 * - Picks up *.integration-spec.ts files under src/ and test/.
 * - Runs serially (--runInBand) by default to avoid cross-test
 *   database contention without going as far as per-test schemas.
 * - Loads test/setup-integration.ts before each suite — it boots
 *   the Nest app against the dedicated `taskmgr_test` database and
 *   resets tables between tests.
 *
 * Run via: `npm run test:integration`.
 *
 * Never run against the live `taskmgr` DB — the env var override
 * in package.json points DATABASE_URL at `taskmgr_test`.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.integration-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  setupFilesAfterEach: [],
  testTimeout: 30000,
  maxWorkers: 1,
};
