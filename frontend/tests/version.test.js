/* global describe, test, expect */
import { versionLabel, APP_TITLE } from '../src/utils/version'

describe('versionLabel', () => {
  test('adds a single v to a plain version', () => {
    expect(versionLabel('0.6.0')).toBe('v0.6.0')
  })

  test('never doubles the v of a tag', () => {
    expect(versionLabel('v0.6.0')).toBe('v0.6.0')
  })

  test('keeps pre-release suffixes', () => {
    expect(versionLabel('1.2.3-rc.1')).toBe('v1.2.3-rc.1')
  })

  test('leaves non-versions alone and falls back to dev', () => {
    expect(versionLabel('dev')).toBe('dev')
    expect(versionLabel('unknown')).toBe('unknown')
    expect(versionLabel('')).toBe('dev')
    expect(versionLabel(undefined)).toBe('dev')
  })
})

describe('APP_TITLE', () => {
  test('is the product name and the version, never the Vite default', () => {
    expect(APP_TITLE).toMatch(/^CaddyManager (v\d+\.\d+\.\d+\S*|dev)$/)
    expect(APP_TITLE).not.toMatch(/Vite/)
  })
})
