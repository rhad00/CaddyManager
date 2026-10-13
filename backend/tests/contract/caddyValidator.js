/**
 * Runs generated Caddy JSON configs through a real `caddy validate`.
 *
 * Resolution order for the Caddy executable:
 *   1. CADDY_BIN    — path to a local caddy binary
 *   2. CADDY_IMAGE  — docker image containing caddy (e.g. the project's ./caddy build)
 *   3. `caddy` on PATH
 *
 * When none is available the contract suite is skipped, unless
 * CADDY_CONTRACT_REQUIRED=true, in which case it fails loudly (used in CI).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SPAWN_TIMEOUT_MS = 60000;

// Environment the Caddy process sees. Generated configs reference {env.CF_API_TOKEN},
// which caddy-dns/cloudflare checks for a plausible shape at provision time.
const CADDY_ENV = {
  CF_API_TOKEN: 'contract-test-token-0123456789abcdefghijkl',
};

function commandExists(cmd) {
  const result = spawnSync(cmd, ['version'], { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  return result.status === 0;
}

function resolveRunner() {
  if (process.env.CADDY_BIN) {
    return { kind: 'bin', bin: process.env.CADDY_BIN };
  }
  if (process.env.CADDY_IMAGE) {
    return { kind: 'docker', image: process.env.CADDY_IMAGE };
  }
  if (commandExists('caddy')) {
    return { kind: 'bin', bin: 'caddy' };
  }
  return null;
}

function runCaddy(runner, args, mountDir) {
  if (runner.kind === 'bin') {
    return spawnSync(runner.bin, args, {
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
      env: { ...process.env, ...CADDY_ENV },
    });
  }
  const dockerArgs = ['run', '--rm'];
  for (const [key, value] of Object.entries(CADDY_ENV)) dockerArgs.push('-e', `${key}=${value}`);
  if (mountDir) dockerArgs.push('-v', `${mountDir}:${mountDir}:ro`);
  dockerArgs.push(runner.image, 'caddy', ...args);
  return spawnSync('docker', dockerArgs, { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
}

function createValidator() {
  const runner = resolveRunner();
  if (!runner) {
    // describe.skip still evaluates its body, so keep the same shape as a real validator
    return {
      available: false,
      describeLabel: 'no caddy binary or CADDY_IMAGE configured',
      hasModules: () => false,
      validate: () => ({ valid: false, output: 'caddy unavailable' }),
      cleanup: () => {},
    };
  }

  const listing = runCaddy(runner, ['list-modules']);
  if (listing.status !== 0) {
    throw new Error(`caddy list-modules failed: ${listing.stderr || listing.error}`);
  }
  const modules = new Set(
    listing.stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  );

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caddy-contract-'));

  /**
   * @param {object} config - full Caddy JSON config
   * @returns {{ valid: boolean, output: string }}
   */
  function validate(config) {
    const file = path.join(workDir, `config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify(config));
    const result = runCaddy(runner, ['validate', '--config', file], workDir);
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    return { valid: result.status === 0, output };
  }

  return {
    available: true,
    describeLabel: runner.kind === 'bin' ? runner.bin : runner.image,
    hasModules: (ids) => ids.every((id) => modules.has(id)),
    validate,
    cleanup: () => fs.rmSync(workDir, { recursive: true, force: true }),
  };
}

module.exports = { createValidator };
