/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let mockUser = { id: '1', email: 'admin@test.com', role: 'admin' }
const logout = vi.fn()

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: mockUser, logout, token: 't' }),
}))
vi.mock('../src/utils/api', () => ({
  get: vi.fn(async () => ({ ok: true, json: async () => ({ info: { version: '9.9.9' } }) })),
}))
vi.mock('../src/components/Footer', () => ({ default: () => <footer>Footer</footer> }))

import AppShell from '../src/components/layout/AppShell'
import { APP_VERSION } from '../src/utils/version'

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/proxies" element={<div>ProxiesPage</div>} />
          <Route path="/metrics" element={<div>MetricsPage</div>} />
          <Route path="/settings/users" element={<div>UsersPage</div>} />
          <Route path="/settings/account/api-keys" element={<div>KeysPage</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

const sidebar = () => screen.getByRole('navigation', { name: 'Main navigation' })

describe('AppShell navigation', () => {
  beforeEach(() => {
    mockUser = { id: '1', email: 'admin@test.com', role: 'admin' }
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  test('shows the page, the signed-in email and a skip link', () => {
    renderAt('/proxies')
    expect(screen.getByText('ProxiesPage')).toBeInTheDocument()
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
    expect(screen.getByText('Skip to content')).toBeInTheDocument()
  })

  test('names the app and its version in the sidebar and the tab title', () => {
    renderAt('/proxies')
    expect(within(screen.getByRole('complementary', { name: 'Main' })).getByText(APP_VERSION)).toBeInTheDocument()
    expect(document.title).toBe(`Proxies · CaddyManager ${APP_VERSION}`)
  })

  test('opens the submenu that holds the current page and marks the page', () => {
    renderAt('/proxies')
    const routing = within(sidebar()).getByRole('button', { name: 'Routing' })
    expect(routing).toHaveAttribute('aria-expanded', 'true')
    expect(within(sidebar()).getByRole('link', { name: 'Proxies' })).toHaveAttribute('aria-current', 'page')
    // submenus of other pages stay closed
    expect(within(sidebar()).getByRole('button', { name: 'Monitoring' })).toHaveAttribute('aria-expanded', 'false')
  })

  test('a submenu opens and closes with its button', async () => {
    renderAt('/proxies')
    const monitoring = within(sidebar()).getByRole('button', { name: 'Monitoring' })
    await userEvent.click(monitoring)
    expect(monitoring).toHaveAttribute('aria-expanded', 'true')
    expect(within(sidebar()).getByRole('link', { name: 'Metrics' })).toBeVisible()
    await userEvent.click(monitoring)
    expect(monitoring).toHaveAttribute('aria-expanded', 'false')
    expect(within(sidebar()).queryByRole('link', { name: 'Metrics' })).not.toBeInTheDocument()
  })

  test('nests My account inside Settings and opens both for a deep link', () => {
    renderAt('/settings/account/api-keys')
    expect(within(sidebar()).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(sidebar()).getByRole('button', { name: 'My account' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(sidebar()).getByRole('link', { name: 'API keys' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('KeysPage')).toBeInTheDocument()
  })

  test('the breadcrumb shows the path through the menu', () => {
    renderAt('/settings/account/api-keys')
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
    expect(crumbs.getByText('Settings')).toBeInTheDocument()
    expect(crumbs.getByText('My account')).toBeInTheDocument()
    expect(crumbs.getByText('API keys')).toHaveAttribute('aria-current', 'page')
  })

  test('the hamburger folds the menu away and brings it back, and remembers the choice', async () => {
    renderAt('/proxies')
    const hamburger = screen.getByRole('button', { name: 'Close navigation' })
    expect(hamburger).toHaveAttribute('aria-controls', 'app-sidebar')
    expect(hamburger).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(hamburger)
    const reopen = screen.getByRole('button', { name: 'Open navigation' })
    expect(reopen).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem('caddymanager.sidebarOpen')).toBe('false')

    await userEvent.click(reopen)
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument()
  })

  test('starts folded when the person folded it last time', () => {
    window.localStorage.setItem('caddymanager.sidebarOpen', 'false')
    renderAt('/proxies')
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument()
  })

  test('Users appears for admins', async () => {
    renderAt('/proxies')
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Settings' }))
    expect(within(sidebar()).getByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  test('Users is not offered to other roles, while their own settings are', async () => {
    mockUser = { id: '2', email: 'viewer@test.com', role: 'viewer' }
    renderAt('/proxies')
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Settings' }))
    expect(within(sidebar()).getByRole('button', { name: 'My account' })).toBeInTheDocument()
    expect(within(sidebar()).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  test('shows a note when the backend runs another version', async () => {
    renderAt('/proxies')
    await waitFor(() => expect(screen.getByText(/The backend runs/)).toBeInTheDocument())
    expect(screen.getByText('v9.9.9')).toBeInTheDocument()
  })

  test('signs out', async () => {
    renderAt('/proxies')
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalled()
  })
})
