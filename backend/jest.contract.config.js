module.exports = {
  testMatch: ['**/tests/contract/**/*.test.js'],
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 120000,
  setupFilesAfterEnv: ['<rootDir>/tests/unit/jest.setup.js'],
};
