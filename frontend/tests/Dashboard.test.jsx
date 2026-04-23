/* global vi, describe, test, expect */
import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock AuthContext
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: '1', email: 'admin@test.com', role: 'admin' },
    logout: vi.fn(),
  }),
}))

// Stub out all page components to isolate Dashboard rendering
vi.mock('../src/pages/ProxyManagement', () => ({ default: () => <div>ProxyManagement</div> }))
vi.mock('../src/pages/TemplateManagement', () => ({ default: () => <div>TemplateManagement</div> }))
vi.mock('../src/pages/BackupManagement', () => ({ default: () => <div>BackupManagement</div> }))
vi.mock('../src/pages/MetricsDashboard', () => ({ default: () => <div>MetricsDashboard</div> }))
vi.mock('../src/pages/AuditLogViewer', () => ({ default: () => <div>AuditLogViewer</div> }))
vi.mock('../src/pages/Users', () => ({ default: () => <div>UsersPage</div> }))
vi.mock('../src/pages/DiscoveredServicesManagement', () => ({ default: () => <div>Discovery</div> }))
vi.mock('../src/pages/GitIntegration', () => ({ default: () => <div>Git</div> }))
vi.mock('../src/components/Footer', () => ({ default: () => <footer>Footer</footer> }))

import Dashboard from '../src/pages/Dashboard'

describe('Dashboard', () => {
  test('renders nav tabs with correct ARIA roles', () => {
    render(<Dashboard />)
    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeInTheDocument()
    expect(tablist).toHaveAttribute('aria-label', 'Dashboard sections')
  })

  test('shows Proxies tab content by default', () => {
    render(<Dashboard />)
    expect(screen.getByText('ProxyManagement')).toBeInTheDocument()
  })

  test('shows Users tab for admin users', () => {
    render(<Dashboard />)
    expect(screen.getByRole('tab', { name: 'Users' })).toBeInTheDocument()
  })

  test('has skip-to-content link', () => {
    render(<Dashboard />)
    expect(screen.getByText('Skip to content')).toBeInTheDocument()
  })

  test('shows current user email', () => {
    render(<Dashboard />)
    expect(screen.getByText('admin@test.com')).toBeInTheDocument()
  })

  test('renders with initialTab', () => {
    render(<Dashboard initialTab="users" />)
    expect(screen.getByText('UsersPage')).toBeInTheDocument()
  })
})
