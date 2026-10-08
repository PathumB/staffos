/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'cjs', 'json'],
  testRegex: String.raw`.*\.spec\.ts$`,
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  transform: {
    [String.raw`^.+\.ts$`]: ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    // Run tests against the shared package's source so `pnpm test` needs no prior build.
    '^@staffos/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // packages/shared uses ESM-style `./x.js` specifiers; resolve them to the .ts sources.
    [String.raw`^(\.{1,2}/.+)\.js$`]: '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts'],
  coverageDirectory: './coverage',
  // On GitHub Actions, failing tests also appear as annotations on the run page.
  reporters: process.env.GITHUB_ACTIONS
    ? ['default', ['github-actions', { silent: false }], 'summary']
    : ['default'],
};
