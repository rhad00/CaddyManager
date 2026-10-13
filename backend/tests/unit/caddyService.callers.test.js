/**
 * Every `caddyService.<method>(` call in src must name a method that exists.
 * GitOps sync and Docker discovery called a non-existent updateCaddyConfig() for a long
 * time without anyone noticing (MODERNIZATION.md 0.18).
 */
const fs = require('fs');
const path = require('path');

jest.mock('../../src/models', () => ({
  Proxy: {}, Header: {}, Middleware: {}, Certificate: {}, sequelize: {},
}));

const caddyService = require('../../src/services/caddyService');

const SRC = path.join(__dirname, '../../src');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const calls = jsFiles(SRC).flatMap((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/caddyService\.(\w+)\(/g)].map((m) => [path.relative(SRC, file), m[1]]);
});

test('the scan finds the known callers', () => {
  expect(calls.length).toBeGreaterThan(5);
});

test.each(calls)('%s calls caddyService.%s, which exists', (_file, method) => {
  expect(typeof caddyService[method]).toBe('function');
});
