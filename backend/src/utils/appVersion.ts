import fs from 'fs';
import path from 'path';

// A plain semantic version, optionally with a leading "v" (what a release tag looks like)
const VERSION = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;

let packageVersion: string | undefined;

function versionFromPackageJson(): string {
  if (packageVersion === undefined) {
    // Same relative path from src/utils (ts) and dist/utils (compiled)
    const file = path.resolve(__dirname, '../../package.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: unknown };
      packageVersion = typeof parsed.version === 'string' ? parsed.version : 'unknown';
    } catch {
      packageVersion = 'unknown';
    }
  }
  return packageVersion;
}

/**
 * The running CaddyManager version: `APP_VERSION` when it is a plain version (a build can stamp its
 * own), otherwise the version in package.json, which the release job sets to the release version.
 */
export function appVersion(): string {
  const stamped = VERSION.exec((process.env.APP_VERSION || '').trim());
  return stamped ? stamped[1] : versionFromPackageJson();
}
