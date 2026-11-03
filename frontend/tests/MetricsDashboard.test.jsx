/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'fake-token' }),
}))
vi.mock('../src/utils/api', async (importOriginal) => ({ ...(await importOriginal()), get: vi.fn() }))
// Chart.js needs a real canvas; the page's own output is what is tested
vi.mock('react-chartjs-2', () => ({
  Line: ({ 'aria-label': label }) => <canvas role="img" aria-label={label} />,
}))

import { get } from '../src/utils/api'
import MetricsDashboard from '../src/pages/MetricsDashboard'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const metrics = {
  timestamp: '2026-11-03T12:00:00Z',
  http: {
    requestsTotal: 48213,
    avgRequestDuration: 0.012345,
    responseStatus: { '2xx': 45000, '3xx': 1200, '4xx': 1800, '5xx': 213 },
  },
  system: { memoryBytes: 73400320, goroutines: 142, cpuSeconds: 312.45 },
  tls: { handshakesTotal: 9120, certificatesTotal: 7 },
}
const history = [0, 1, 2].map((i) => ({
  timestamp: new Date(Date.UTC(2026, 10, 3, 9 + i)).toISOString(),
  metrics: {
    caddy_http_requests_total: [{ value: 1000 + i * 600 }],
    process_resident_memory_bytes: [{ value: (60 + i) * 1048576 }],
  },
}))

const serve = ({ metricsReply = ok({ metrics }), historyReply = ok({ metrics: history }) } = {}) =>
  get.mockImplementation(async (path) => (path === '/metrics' ? metricsReply : historyReply))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  serve()
})

describe('MetricsDashboard', () => {
  test('answers whether anything is wrong, then shows the numbers in plain units', async () => {
    render(<MetricsDashboard />)
    expect(screen.getByText('Loading metrics…')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { level: 1, name: 'Caddy metrics' })).toBeInTheDocument()
    const health = screen.getByRole('region', { name: 'Health' })
    expect(within(health).getByText('Healthy')).toBeInTheDocument()
    expect(within(health).getByText(/0\.44% of responses were server errors/)).toBeInTheDocument()
    expect(within(health).getByText('12.3 ms')).toBeInTheDocument()
    expect(within(health).getByText('70.0 MiB')).toBeInTheDocument()
    expect(within(health).getByText('7')).toBeInTheDocument()
  })

  test('the history charts have names and show a per-minute rate', async () => {
    render(<MetricsDashboard />)
    const rate = await screen.findByRole('img', { name: /Requests per minute: latest 10 per min/ })
    expect(rate).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Process memory \(MiB\): latest 62\.0 MiB/ })).toBeInTheDocument()
  })

  test('responses by status is a table with counts and shares', async () => {
    render(<MetricsDashboard />)
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('row', { name: /5xx Server error 213 0\.44%/ })).toBeInTheDocument()
  })

  test('the refresh select has a label and the choice is remembered', async () => {
    render(<MetricsDashboard />)
    const select = await screen.findByLabelText('Auto-refresh every')
    await userEvent.selectOptions(select, '60')
    expect(localStorage.getItem('caddymanager.metrics.refresh')).toBe('60')
  })

  test('missing numbers are dashes, not zeros', async () => {
    serve({ metricsReply: ok({ metrics: { timestamp: '2026-11-03T12:00:00Z', http: { responseStatus: { '2xx': 5 } } } }) })
    render(<MetricsDashboard />)
    const health = await screen.findByRole('region', { name: 'Health' })
    expect(within(health).getByText('Average response time').nextSibling).toHaveTextContent('—')
    expect(within(health).getByText('Certificates managed').nextSibling).toHaveTextContent('—')
  })

  test('a failed first load says what to do, keeps the heading and a refresh button', async () => {
    serve({ metricsReply: { ok: false, status: 500, json: async () => ({ message: 'boom' }) } })
    render(<MetricsDashboard />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/boom/)
    expect(alert).toHaveTextContent(/Check that Caddy is running/)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh now' })).toBeInTheDocument()
  })

  test('a failed refresh keeps the old figures and says they are old', async () => {
    render(<MetricsDashboard />)
    await screen.findByText('Healthy')
    serve({ metricsReply: { ok: false, status: 502, json: async () => ({ message: 'upstream down' }) } })
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Showing the figures from/)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  test('a failed history says so instead of drawing an empty chart', async () => {
    serve({ historyReply: { ok: false, status: 500, json: async () => ({ message: 'no db' }) } })
    render(<MetricsDashboard />)
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  test('with no history it explains when charts appear', async () => {
    serve({ historyReply: ok({ metrics: [] }) })
    render(<MetricsDashboard />)
    expect(await screen.findAllByText(/sampled about once an hour/)).toHaveLength(2)
  })
})
