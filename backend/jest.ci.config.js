// CI run: the whole suite once, with coverage and a floor under it.
// The thresholds sit just below the measured coverage (55% statements, 52% branches,
// 58% functions, 55% lines at the time of writing) so that coverage cannot silently
// drop. Raise them when coverage grows. Not in jest.config.js: a threshold there would
// fail every run of a single test file.
const base = require('./jest.config');

module.exports = {
  ...base,
  verbose: false,
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{js,ts}', '!src/**/*.d.ts'],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 53, branches: 50, functions: 55, lines: 53 },
  },
};
