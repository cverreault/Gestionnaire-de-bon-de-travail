/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // @taskmgr/shared est un lien symbolique vers packages/shared : Jest le résout
  // hors de node_modules, donc il est transformé sans réglage supplémentaire.
};
