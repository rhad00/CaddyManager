// End-to-end tests: the real services drive a real Caddy in front of origin servers started by
// the tests (see tests/e2e/helpers/caddyRunner.js for what it needs). Run with `npm run test:e2e`.
// Kept out of the default run (jest.config.js ignores tests/e2e) because they need Caddy.
module.exports = {
  testMatch: ['**/tests/e2e/**/*.e2e.test.js'],
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 60000,
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.js'],
  maxWorkers: 2,
};
