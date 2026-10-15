/**
 * Throwaway certificates for the tests, generated with the openssl CLI the first time a test
 * asks for them (no private key is stored in the repository). Safe to call from parallel Jest
 * workers: the files are written to a scratch directory that is then renamed into place.
 *
 *   const dir = require('../fixtures/certs/generate')();   // -> directory with the three .pem files
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = 'v1'; // bump when the files below change
const FINAL_DIR = path.join(os.tmpdir(), `caddymanager-test-certs-${VERSION}`);

function openssl(args, cwd) {
  execFileSync('openssl', args, { cwd, stdio: 'ignore' });
}

module.exports = function certFixtures() {
  if (fs.existsSync(path.join(FINAL_DIR, 'other.key.pem'))) return FINAL_DIR;

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'caddymanager-test-certs-'));
  // EC P-256, CN app.example.com, SANs app.example.com and *.apps.example.com, valid until 2126
  openssl(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
    '-keyout', 'app.key.pem', '-out', 'app.cert.pem', '-days', '36500', '-subj', '/CN=app.example.com',
    '-addext', 'subjectAltName=DNS:app.example.com,DNS:*.apps.example.com'], scratch);
  // an unrelated key, for key/certificate mismatch tests
  openssl(['genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', 'other.key.pem'], scratch);

  try {
    fs.renameSync(scratch, FINAL_DIR);
  } catch {
    // another worker got there first; use theirs
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return FINAL_DIR;
};
