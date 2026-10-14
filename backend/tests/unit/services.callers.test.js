/**
 * Every `<name>Service.<method>(` call in src must name a method that exists on
 * src/services/<name>Service.{js,ts}. GitOps sync and Docker discovery called a non-existent
 * caddyService.updateCaddyConfig() (MODERNIZATION.md 0.18) and discovery a non-existent
 * templateService.applyTemplateToProxy() (0.24) for a long time without anyone noticing.
 */
const fs = require('fs');
const path = require('path');

// Any model the services pick up at require time is a stub
jest.mock('../../src/models', () => new Proxy({}, { get: (_t, key) => (key === '__esModule' ? false : {}) }));

const SRC = path.join(__dirname, '../../src');
const SERVICES = path.join(SRC, 'services');

const SOURCE_EXTENSIONS = ['.js', '.ts'];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

const serviceExists = (name) => SOURCE_EXTENSIONS.some((ext) => fs.existsSync(path.join(SERVICES, `${name}${ext}`)));

const calls = sourceFiles(SRC).flatMap((file) => {
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
  // A service is either the module itself (functions exported by name) or an instance
  // exported under the service's own name (`{ caddyService }`)
  const target = mod[service] && typeof mod[service] === 'object' ? mod[service] : mod;
  expect(typeof target[method]).toBe('function');
});
