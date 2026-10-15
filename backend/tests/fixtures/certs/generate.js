/**
 * Throwaway certificates for the tests, generated with the openssl CLI the first time a test
 * asks for them (no private key is stored in the repository). Safe to call from parallel Jest
 * workers and from a test that mocks child_process.
 *
 *   const dir = require('../fixtures/certs/generate')();   // -> directory with the three .pem files
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Some tests mock child_process; the fixtures must come from the real openssl regardless
const { execFileSync } = typeof jest !== 'undefined' ? jest.requireActual('child_process') : require('child_process');

const VERSION = 'v1'; // bump when the files below change
const FINAL_DIR = path.join(os.tmpdir(), `caddymanager-test-certs-${VERSION}`);
const FILES = ['app.cert.pem', 'app.key.pem', 'other.key.pem'];

const complete = (dir) => FILES.every((file) => fs.existsSync(path.join(dir, file)));

function openssl(args, cwd) {
  execFileSync('openssl', args, { cwd, stdio: 'pipe' });
}

module.exports = function certFixtures() {
  if (complete(FINAL_DIR)) return FINAL_DIR;

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'caddymanager-test-certs-'));
  try {
    // EC P-256, CN app.example.com, SANs app.example.com and *.apps.example.com, valid until 2126
    openssl(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
      '-keyout', 'app.key.pem', '-out', 'app.cert.pem', '-days', '36500', '-subj', '/CN=app.example.com',
      '-addext', 'subjectAltName=DNS:app.example.com,DNS:*.apps.example.com'], scratch);
    // an unrelated key, for key/certificate mismatch tests
    openssl(['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', 'other.key.pem'], scratch);

    if (!complete(scratch)) throw new Error(`openssl did not produce ${FILES.join(', ')}`);

    // File by file, so a directory left half-filled by an earlier failed run is completed, and a
    // worker that loses the race simply overwrites with equivalent material
    fs.mkdirSync(FINAL_DIR, { recursive: true });
    for (const file of FILES) {
      const tmp = path.join(FINAL_DIR, `.${file}.${process.pid}.tmp`);
      fs.copyFileSync(path.join(scratch, file), tmp);
      fs.renameSync(tmp, path.join(FINAL_DIR, file));
    }
  } catch (error) {
    throw new Error(`Could not generate the test certificates (is the openssl CLI installed?): ${error.message}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return FINAL_DIR;
};
