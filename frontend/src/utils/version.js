/* global __APP_VERSION__ */
/**
 * The version of this frontend build: the release tag the image was built from (see vite.config.js).
 * Tests and tools that do not run through Vite have no stamped value and show "dev".
 */
const stamped = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__

/** "0.6.0" and "v0.6.0" both become "v0.6.0"; anything else ("dev", "unknown") stays as it is */
export const versionLabel = (version) => {
  const text = String(version ?? '').trim()
  if (/^v?\d+\.\d+\.\d+/.test(text)) return `v${text.replace(/^v/, '')}`
  return text || 'dev'
}

export const APP_VERSION = versionLabel(stamped)

/** The title of the browser tab, for example "CaddyManager v0.6.0" */
export const APP_TITLE = `CaddyManager ${APP_VERSION}`
