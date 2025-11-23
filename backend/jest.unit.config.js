module.exports = {
  testMatch: ['**/tests/unit/**/*.test.js'],
  testEnvironment: 'node',
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/unit/jest.setup.js'],
};
