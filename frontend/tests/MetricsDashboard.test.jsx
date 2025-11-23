import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import MetricsDashboard from '../src/pages/MetricsDashboard'

// Mock AuthContext
jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'fake-token' })
}))

// Mock API util
jest.mock('../src/utils/api', () => ({
  get: jest.fn((path) => {
    if (path === '/api/metrics') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ metrics: { timestamp: Date.now(), http: { requestsTotal: 123 }, system: { memoryBytes: 1024 }, tls: { handshakesTotal: 5 } } })
      })
    }

    if (path.startsWith('/api/metrics/historical')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ metrics: [] })
      })
    }

    return Promise.resolve({ ok: false })
  })
}))

describe('MetricsDashboard', () => {
  test('renders and displays metrics', async () => {
    render(<MetricsDashboard />)

    // Loading text appears
    expect(screen.getByText(/Loading metrics data.../i)).toBeInTheDocument()

    // Wait for metrics to be rendered
    await waitFor(() => expect(screen.getByText(/Caddy Metrics Dashboard/i)).toBeInTheDocument())

    // Check that Total Requests value is displayed
    expect(screen.getByText(/123/)).toBeInTheDocument()
    // Memory formatted
    expect(screen.getByText(/1.00 KB|1 KB/)).toBeTruthy()
  })
})
