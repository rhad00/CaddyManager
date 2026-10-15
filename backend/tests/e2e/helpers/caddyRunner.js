/**
 * Starts a real Caddy for the e2e tests and stops it again.
 *
 * Resolution order for the Caddy executable (same as the contract tests):
 *   CADDY_BIN    a local caddy binary
 *   CADDY_IMAGE  a docker image with caddy (the project's ./caddy build has the rate_limit
 *                and Cloudflare modules the templates and proxies can use)
 *   `caddy` on PATH
 * Docker runs with --network host, so Caddy reaches the origin servers on 127.0.0.1 and the
 * tests reach Caddy's ports directly (Linux and CI; Docker Desktop's host mode is different).
 *
 * Without any of them the e2e suites skip; CADDY_E2E_REQUIRED=true makes that an error (CI).
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const http = require('http');

const CADDY_ENV = { CF_API_TOKEN: 'e2e-test-token-0123456789abcdefghijklmnop' };

function resolveRunner() {
  if (process.env.CADDY_BIN) return { kind: 'bin', bin: process.env.CADDY_BIN };
  if (process.env.CADDY_IMAGE) return { kind: 'docker', image: process.env.CADDY_IMAGE };
  const probe = spawnSync('caddy', ['version'], { encoding: 'utf8' });
  if (probe.status === 0) return { kind: 'bin', bin: 'caddy' };
  return null;
}

const dockerAvailable = () => spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;

function describeRunner(runner) {
  if (!runner) return 'no caddy binary or CADDY_IMAGE configured';
  if (runner.kind === 'docker' && !dockerAvailable()) return 'CADDY_IMAGE is set but docker is not available';
  return runner.kind === 'bin' ? `binary ${runner.bin}` : `image ${runner.image}`;
}

const isUsable = (runner) => Boolean(runner) && (runner.kind === 'bin' || dockerAvailable());

function listModules(runner) {
  const result = runner.kind === 'bin'
    ? spawnSync(runner.bin, ['list-modules'], { encoding: 'utf8' })
    : spawnSync('docker', ['run', '--rm', runner.image, 'caddy', 'list-modules'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`caddy list-modules failed: ${result.stderr}`);
  return new Set(result.stdout.split('\n').map((l) => l.trim().split(' ')[0]).filter(Boolean));
}

/** A free TCP port (a short race with whoever else asks, acceptable for tests) */
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
  server.on('error', reject);
});

const getJson = (port, route) => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port, path: route, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
  });
  req.on('error', reject);
  req.setTimeout(2000, () => req.destroy(new Error('timeout')));
});

/**
 * @param options.trustedProxies  trust X-Forwarded-For from 127.0.0.1 (the tests are the proxy in front)
 * @param options.tls  serve HTTPS with Caddy's internal CA (certificates for the route hosts)
 * @returns {{ adminPort, httpPort, adminUrl, stop, logs }}
 */
async function startCaddy(runner, { tls = false, trustedProxies = false } = {}) {
  const adminPort = await freePort();
  const httpPort = await freePort();
  const redirectPort = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caddy-e2e-'));
  fs.chmodSync(dir, 0o755);

  const server = { listen: [`:${httpPort}`], routes: [] };
  const http = { servers: { srv0: server } };
  if (trustedProxies) {
    server.trusted_proxies = { source: 'static', ranges: ['127.0.0.1/32'] };
    server.trusted_proxies_strict = 1; // as in the bundled Caddyfile
    server.client_ip_headers = ['X-Forwarded-For'];
  }
  const apps = { http };
  if (tls) {
    server.automatic_https = { disable_redirects: true };
    http.https_port = httpPort;
    http.http_port = redirectPort;
    apps.tls = { automation: { policies: [{ issuers: [{ module: 'internal' }] }] } };
  } else {
    server.automatic_https = { disable: true };
  }
  const initial = { admin: { listen: `127.0.0.1:${adminPort}` }, apps };
  const configPath = path.join(dir, 'init.json');
  fs.writeFileSync(configPath, JSON.stringify(initial));
  fs.chmodSync(configPath, 0o644);

  let child = null;
  let containerName = null;
  let output = '';
  if (runner.kind === 'bin') {
    child = spawn(runner.bin, ['run', '--config', configPath], { env: { ...process.env, ...CADDY_ENV, XDG_DATA_HOME: dir, XDG_CONFIG_HOME: dir } });
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
  } else {
    containerName = `cm-e2e-${process.pid}-${adminPort}`;
    const args = ['run', '-d', '--rm', '--name', containerName, '--network', 'host', '-v', `${dir}:${dir}:ro`];
    for (const [k, v] of Object.entries(CADDY_ENV)) args.push('-e', `${k}=${v}`);
    args.push(runner.image, 'caddy', 'run', '--config', configPath);
    const started = spawnSync('docker', args, { encoding: 'utf8' });
    if (started.status !== 0) throw new Error(`docker run failed: ${started.stderr}`);
  }

  const logs = () => (containerName
    ? spawnSync('docker', ['logs', '--tail', '80', containerName], { encoding: 'utf8' }).stderr
    : output);

  const stop = () => {
    if (containerName) spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8' });
    if (child) child.kill('SIGTERM');
    fs.rmSync(dir, { recursive: true, force: true });
  };

  const deadline = Date.now() + 40000;
  for (;;) {
    try {
      const res = await getJson(adminPort, '/config/');
      if (res.status === 200) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      const tail = logs();
      stop();
      throw new Error(`Caddy did not come up on admin port ${adminPort}:\n${tail}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return { adminPort, httpPort, adminUrl: `http://127.0.0.1:${adminPort}`, stop, logs, dir, tls };
}

module.exports = { resolveRunner, describeRunner, isUsable, listModules, startCaddy, freePort };
