const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caddymanager-logs-'));
const logFile = path.join(dir, 'access.log');
process.env.CADDY_ACCESS_LOG = logFile;

const entry = (ts, host, status, method = 'GET', uri = '/') => JSON.stringify({
  ts,
  level: 'info',
  logger: 'http.log.access',
  status,
  duration: 0.01,
  size: 12,
  request: { method, host, uri, remote_ip: '203.0.113.7', headers: { 'User-Agent': ['jest'] } },
});

fs.writeFileSync(logFile, [
  entry(1000, 'a.example.com', 200),
  'not json',
  '',
  JSON.stringify({ level: 'info', msg: 'no ts' }),
  entry(1001, 'b.example.com', 502, 'POST', '/api'),
  entry(1002, 'a.example.com', 404, 'GET', '/missing'),
].join('\n'));

jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

const { parseLine, getLogs, getLogStats, LOG_FILE } = require('../../src/services/logService');
const logsRouter = require('../../src/api/logs/routes');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('parseLine', () => {
  it('maps a Caddy access log entry', () => {
    expect(parseLine(entry(1000, 'a.example.com', 200))).toMatchObject({
      ts: 1000,
      timestamp: '1970-01-01T00:16:40.000Z',
      status: 200,
      method: 'GET',
      host: 'a.example.com',
      uri: '/',
      remote_ip: '203.0.113.7',
      user_agent: 'jest',
    });
  });

  it.each(['', '   ', 'not json', '{"msg":"no ts"}'])('ignores %j', (line) => {
    expect(parseLine(line)).toBeNull();
  });
});

describe('getLogs', () => {
  it('reads from CADDY_ACCESS_LOG, newest first, skipping lines that are not entries', async () => {
    expect(LOG_FILE).toBe(logFile);
    const logs = await getLogs();
    expect(logs.map((l) => l.ts)).toEqual([1002, 1001, 1000]);
  });

  it('filters by status, method, host, search and time', async () => {
    expect((await getLogs({ status: '502' })).map((l) => l.ts)).toEqual([1001]);
    expect((await getLogs({ method: 'post' })).map((l) => l.ts)).toEqual([1001]);
    expect((await getLogs({ host: 'a.example' })).map((l) => l.ts)).toEqual([1002, 1000]);
    expect((await getLogs({ search: 'MISSING' })).map((l) => l.ts)).toEqual([1002]);
    expect((await getLogs({ from: new Date(1001 * 1000).toISOString() })).map((l) => l.ts)).toEqual([1002, 1001]);
  });

  it('limits the result', async () => {
    expect((await getLogs({ limit: 2 })).map((l) => l.ts)).toEqual([1002, 1001]);
  });
});

describe('getLogStats', () => {
  it('reports the file', () => {
    expect(getLogStats()).toMatchObject({ exists: true, path: logFile });
  });
});

describe('GET /logs', () => {
  const app = express().use('/logs', logsRouter);

  it('applies the query filters', async () => {
    const res = await request(app).get('/logs?host=b.example.com');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.logs[0].status).toBe(502);
  });

  it('uses the first value of a repeated parameter instead of failing', async () => {
    const res = await request(app).get('/logs?method=post&method=get');
    expect(res.status).toBe(200);
    expect(res.body.logs.map((l) => l.ts)).toEqual([1001]);
  });
});
