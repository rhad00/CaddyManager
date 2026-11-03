import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// A plain semantic version, optionally with a leading "v" (what a release tag looks like)
const VERSION = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/

const plainVersion = (value) => VERSION.exec(String(value ?? '').trim())?.[1]

/**
 * The version this build shows, first match wins:
 * 1. APP_VERSION: what the release job passes to the image build (the tag)
 * 2. the nearest git tag, for builds from a checkout
 * 3. the version in package.json, which the release job sets to the tag (0.0.0 on main)
 * 4. "dev"
 */
function resolveVersion() {
  const stamped = plainVersion(process.env.APP_VERSION)
  if (stamped) return stamped

  try {
    const tag = plainVersion(
      execFileSync('git', ['describe', '--tags', '--abbrev=0'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
    )
    if (tag) return tag
  } catch {
    // no git, or no tag yet (a Docker build context has no .git)
  }

  const fromPackage = plainVersion(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version)
  return fromPackage && fromPackage !== '0.0.0' ? fromPackage : 'dev'
}

const appVersion = resolveVersion()
const versionLabel = appVersion === 'dev' ? 'dev' : `v${appVersion}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // The page title before any script runs, and without JavaScript
      name: 'caddymanager-title',
      transformIndexHtml: (html) => html.replaceAll('__APP_VERSION_LABEL__', versionLabel),
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
