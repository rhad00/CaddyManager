const caddyService = require('../../src/services/caddyService');

describe('ensureAccessLogging', () => {
  test('routes the server access logger into the file log (names must match)', () => {
    const config = caddyService.ensureAccessLogging({});
    const server = config.apps.http.servers[caddyService.serverName];
    const log = config.logging.logs.access;

    // Caddy emits server access logs as http.log.access.<default_logger_name>
    expect(log.include).toEqual([`http.log.access.${server.logs.default_logger_name}`]);
  });

  test('writes a world-readable JSON file so the backend can read it via a shared volume', () => {
    const { writer, encoder } = caddyService.ensureAccessLogging({}).logging.logs.access;
    expect(writer).toMatchObject({ output: 'file', mode: '0644' });
    expect(encoder).toEqual({ format: 'json' });
  });
});
