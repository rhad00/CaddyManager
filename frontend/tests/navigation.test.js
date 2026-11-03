/* global describe, test, expect */
import { NAV, visibleNav, pagesOf, trailFor, HOME_PATH } from '../src/navigation'

describe('navigation tree', () => {
  test('every page has a unique path and the home path is a page', () => {
    const paths = pagesOf().map((p) => p.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toContain(HOME_PATH)
  })

  test('nests the account settings two levels deep', () => {
    const settings = NAV.find((n) => n.id === 'settings')
    const account = settings.children.find((n) => n.id === 'account')
    expect(account.children.map((n) => n.id)).toEqual(['two-factor', 'api-keys'])
  })

  test('admins see Users, everyone else does not', () => {
    const labels = (role) => pagesOf(visibleNav(role)).map((p) => p.label)
    expect(labels('admin')).toContain('Users')
    expect(labels('viewer')).not.toContain('Users')
    expect(labels(undefined)).not.toContain('Users')
  })

  test('a submenu left empty is dropped', () => {
    const tree = visibleNav('viewer', [
      { id: 'g', label: 'G', children: [{ id: 'u', label: 'U', path: '/u', adminOnly: true }] },
      { id: 'p', label: 'P', path: '/p' },
    ])
    expect(tree.map((n) => n.id)).toEqual(['p'])
  })
})

describe('trailFor', () => {
  test('returns the menu path to a nested page', () => {
    expect(trailFor('/settings/account/api-keys').map((n) => n.label)).toEqual(['Settings', 'My account', 'API keys'])
  })

  test('a path inside a page belongs to the page', () => {
    expect(trailFor('/proxies/abc').map((n) => n.id)).toEqual(['routing', 'proxies'])
  })

  test('does not match a path that only shares a prefix of letters', () => {
    expect(trailFor('/proxiesx')).toEqual([])
  })

  test('is empty for an unknown path', () => {
    expect(trailFor('/nope')).toEqual([])
  })
})
