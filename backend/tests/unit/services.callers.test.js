/**
 * Every `<name>Service.<method>(` call in src must name a method that exists on
 * src/services/<name>Service.js. GitOps sync and Docker discovery called a non-existent
 * caddyService.updateCaddyConfig() (MODERNIZATION.md 0.18) and discovery a non-existent
 * templateService.applyTemplateToProxy() (0.24) for a long time without anyone noticing.
 */
const fs = require('fs');
const path = require('path');

// Any model the services pick up at require time is a stub
jest.mock('../../src/models', () => new Proxy({}, { get: (_t, key) => (key === '__esModule' ? false : {}) }));

const SRC = path.join(__dirname, '../../src');
const SERVICES = path.join(SRC, 'services');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const serviceExists = (name) => fs.existsSync(path.join(SERVICES, `${name}.js`));

const calls = jsFiles(SRC).flatMap((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/\b(\w+Service)\.(\w+)\(/g)]
    .filter((m) => serviceExists(m[1]))
    .map((m) => [path.relative(SRC, file), m[1], m[2]]);
});

const unique = [...new Map(calls.map((c) => [c.join(':'), c])).values()];

test('the scan finds the known callers', () => {
  const services = new Set(unique.map(([, service]) => service));
  expect(services.has('caddyService')).toBe(true);
  expect(services.size).toBeGreaterThan(5);
});

test.each(unique)('%s calls %s.%s, which exists', (_file, service, method) => {
  const mod = require(path.join(SERVICES, service));
  expect(typeof mod[method]).toBe('function');
});
