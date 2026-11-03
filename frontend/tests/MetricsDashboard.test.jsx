/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'fake-token' }),
}))
vi.mock('../src/utils/api', async (importOriginal) => ({ ...(await importOriginal()), get: vi.fn() }))
// Chart.js needs a real canvas; the page's own output is what is tested
vi.mock('react-chartjs-2', () => {
  const Canvas = ({ 'aria-label': label }) => <canvas role="img" aria-label={label} />
  return { Line: Canvas, Bar: Canvas }
})

import { get } from '../src/utils/api'
import MetricsDashboard from '../src/pages/MetricsDashboard'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const fail = (status, message) => ({ ok: false, status, json: async () => ({ message }) })

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

const zeros = (n) => new Array(n).fill(0)
const summary = (requests, s5xx, extra = {}) => ({
  requests,
  status: { '2xx': requests - s5xx, '3xx': 0, '4xx': 0, '5xx': s5xx },
  bytes: requests * 1000,
  avgMs: 20,
  p50Ms: 10,
  p95Ms: 250,
  topPaths: requests ? [{ key: '/login', count: requests }] : [],
  topClients: requests ? [{ key: '198.51.100.4', count: requests }] : [],
  series: {
    requests: [...zeros(2), requests], ok: [...zeros(2), requests - s5xx], redirect: zeros(3),
    clientError: zeros(3), serverError: [0, 0, s5xx], bytes: [0, 0, requests * 1000], avgMs: [null, null, 20],
  },
  ...extra,
})
const traffic = {
  range: '24h',
  bucketSeconds: 1800,
  from: Date.UTC(2026, 10, 2, 12) / 1000,
  to: Date.UTC(2026, 10, 3, 12) / 1000,
  available: true,
  coversWindow: true,
  totals: summary(1000, 10),
  proxies: [
    { id: 'p1', name: 'Grafana', domains: ['grafana.example.com'], proxyStatus: 'active', ...summary(800, 8) },
    { id: 'p2', name: 'Nextcloud', domains: ['cloud.example.com'], proxyStatus: 'active', ...summary(150, 2) },
    { id: 'p3', name: 'Idle app', domains: ['idle.example.com'], proxyStatus: 'active', ...summary(0, 0) },
  ],
  other: { ...summary(50, 0), hosts: ['scanner.example.org'] },
}

const serve = (over = {}) => {
  const replies = {
    metrics: ok({ metrics }),
    history: ok({ metrics: history }),
    traffic: ok({ traffic }),
    ...over,
  }
  get.mockImplementation(async (path) => {
    if (path.startsWith('/metrics/traffic')) return replies.traffic
    if (path.startsWith('/metrics/historical')) return replies.history
    return replies.metrics
  })
}

const renderPage = (url = '/metrics') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <MetricsDashboard />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  serve()
})

describe('traffic, per proxy', () => {
  test('lists every proxy with its traffic, busiest first, and the unmatched hosts', async () => {
    renderPage()
    const proxies = await screen.findByRole('region', { name: 'Proxies' })
    const names = within(proxies).getAllByRole('link').map((a) => a.textContent)
    expect(names).toEqual(['Grafana', 'Nextcloud', 'Other hosts', 'Idle app'])
    expect(within(proxies).getByText('grafana.example.com')).toBeInTheDocument()
  })

  test('the figures and the requests chart cover all proxies by default', async () => {
    renderPage()
    const figures = await screen.findByRole('region', { name: 'Figures' })
    expect(within(figures).getByText('1,000')).toBeInTheDocument()
    expect(within(figures).getByText('1.00%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Requests over time, in 30 min steps: 1,000 in total/ })).toBeInTheDocument()
  })

  test('choosing a proxy scopes the page to it and can be undone', async () => {
    renderPage()
    await userEvent.selectOptions(await screen.findByLabelText('Proxy'), 'p2')

    expect(await screen.findByRole('heading', { level: 2, name: 'Nextcloud' })).toBeInTheDocument()
    const figures = screen.getByRole('region', { name: 'Figures' })
    expect(within(figures).getByText('150')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Proxies' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Back to all proxies' }))
    expect(await screen.findByRole('region', { name: 'Proxies' })).toBeInTheDocument()
  })

  test('a link with the proxy in the URL opens that proxy, with its paths and clients', async () => {
    renderPage('/metrics?proxy=p1')
    expect(await screen.findByRole('heading', { level: 2, name: 'Grafana' })).toBeInTheDocument()
    expect(screen.getByText('/login')).toBeInTheDocument()
    expect(screen.getByText('198.51.100.4')).toBeInTheDocument()
  })

  test('a removed proxy in the URL falls back to all proxies and says so', async () => {
    renderPage('/metrics?proxy=gone')
    expect(await screen.findByText(/That proxy no longer exists/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Proxies' })).toBeInTheDocument()
  })

  test('the period asks the backend for that range, and 24 hours is the default', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Figures' })
    expect(get.mock.calls.map((c) => c[0])).toContain('/metrics/traffic?range=24h')

    await userEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(get.mock.calls.map((c) => c[0])).toContain('/metrics/traffic?range=7d'))
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a proxy with no traffic says so instead of drawing empty charts', async () => {
    renderPage('/metrics?proxy=p3')
    const requests = await screen.findByRole('region', { name: 'Requests' })
    expect(within(requests).getByText('No requests in this period.')).toBeInTheDocument()
    expect(within(requests).queryByRole('img')).not.toBeInTheDocument()
  })

  test('without an access log it says where the charts come from', async () => {
    serve({ traffic: ok({ traffic: { ...traffic, available: false, coversWindow: false } }) })
    renderPage()
    expect(await screen.findByText(/There is no access log yet/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Figures' })).not.toBeInTheDocument()
  })

  test('a log that starts late is flagged', async () => {
    serve({ traffic: ok({ traffic: { ...traffic, coversWindow: false } }) })
    renderPage()
    expect(await screen.findByText(/does not reach back this far/)).toBeInTheDocument()
  })

  test('a failed traffic request is explained and the Caddy section still shows', async () => {
    serve({ traffic: fail(500, 'log unreadable') })
    renderPage()
    expect(await screen.findByText(/log unreadable/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Health' })).toBeInTheDocument()
  })
})

describe('Caddy server', () => {
  test('answers whether anything is wrong, then shows the numbers in plain units', async () => {
    renderPage()
    expect(screen.getByText('Loading metrics…')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { level: 1, name: 'Caddy metrics' })).toBeInTheDocument()
    const health = await screen.findByRole('region', { name: 'Health' })
    expect(within(health).getByText('Healthy')).toBeInTheDocument()
    expect(within(health).getByText(/0\.44% of responses were server errors/)).toBeInTheDocument()
    expect(within(health).getByText('12.3 ms')).toBeInTheDocument()
    expect(within(health).getByText('70.0 MiB')).toBeInTheDocument()
  })

  test('the history charts have names and show a per-minute rate', async () => {
    renderPage()
    expect(await screen.findByRole('img', { name: /Requests per minute: latest 10 per min/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Process memory \(MiB\): latest 62\.0 MiB/ })).toBeInTheDocument()
  })

  test('missing numbers are dashes, not zeros', async () => {
    serve({ metrics: ok({ metrics: { timestamp: '2026-11-03T12:00:00Z', http: { responseStatus: { '2xx': 5 } } } }) })
    renderPage()
    const health = await screen.findByRole('region', { name: 'Health' })
    expect(within(health).getByText('Average response time').nextSibling).toHaveTextContent('—')
    expect(within(health).getByText('Certificates managed').nextSibling).toHaveTextContent('—')
  })

  test('a failed history says so instead of drawing an empty chart', async () => {
    serve({ history: fail(500, 'no db') })
    renderPage()
    const memory = await screen.findByRole('region', { name: 'Process memory (MiB)' })
    expect(within(memory).getByRole('alert')).toHaveTextContent(/no db/)
  })
})

describe('page states', () => {
  test('the refresh select has a label and the choice is remembered', async () => {
    renderPage()
    const select = await screen.findByLabelText('Auto-refresh every')
    await userEvent.selectOptions(select, '60')
    expect(localStorage.getItem('caddymanager.metrics.refresh')).toBe('60')
  })

  test('when nothing loads it says what to do and keeps the controls', async () => {
    serve({ metrics: fail(500, 'boom'), traffic: fail(500, 'boom') })
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/boom/)
    expect(alert).toHaveTextContent(/Check that the CaddyManager backend and Caddy are running/)
    expect(screen.getByRole('button', { name: 'Refresh now' })).toBeInTheDocument()
  })

  test('a failed refresh keeps the old figures and says they are old', async () => {
    renderPage()
    await screen.findByRole('region', { name: 'Figures' })
    serve({ metrics: fail(502, 'upstream down'), traffic: fail(502, 'upstream down') })
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }))

    expect(await screen.findByText(/Some figures are from/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Figures' })).toBeInTheDocument()
  })
})
