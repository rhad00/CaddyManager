/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/utils/api', async (importOriginal) => ({ ...(await importOriginal()), get: vi.fn() }))
vi.mock('react-chartjs-2', () => {
  const Canvas = ({ 'aria-label': label }) => <canvas role="img" aria-label={label} />
  return { Line: Canvas, Bar: Canvas }
})

import { get } from '../src/utils/api'
import HistorySection from '../src/components/metrics/HistorySection'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const DAY = 86400
const from = Date.UTC(2026, 9, 5) / 1000
const history = (over = {}) => ({
  range: '30d', bucketSeconds: DAY, from, scope: null, coveredFrom: from,
  series: {
    requests: new Array(30).fill(10), clientError: new Array(30).fill(1), serverError: new Array(30).fill(2),
    bytes: new Array(30).fill(1000), avgMs: new Array(30).fill(25),
  },
  totals: { requests: 300, serverErrors: 60, bytes: 30000, avgMs: 25 },
  ...over,
})
const renderIt = (props = {}) => render(<HistorySection token="t" proxyId={null} scopeName="All proxies" {...props} />)

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue(ok({ history: history() }))
})

describe('HistorySection', () => {
  test('shows the totals and the daily charts', async () => {
    renderIt()
    expect(await screen.findByText('300')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Requests per day/ })).toBeInTheDocument()
    expect(screen.getByText(/All proxies per day, in UTC days/)).toBeInTheDocument()
  })

  test('asks for the chosen proxy and period', async () => {
    renderIt({ proxyId: 'p 1', scopeName: 'Grafana' })
    await screen.findByText('300')
    expect(get).toHaveBeenCalledWith('/metrics/history?range=30d&proxy=p%201', 't')

    await userEvent.click(screen.getByRole('button', { name: '90 days' }))
    await screen.findByText('300')
    expect(get).toHaveBeenLastCalledWith('/metrics/history?range=90d&proxy=p%201', 't')
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('says so when little is stored yet, and when nothing is', async () => {
    get.mockResolvedValue(ok({ history: history({ coveredFrom: from + 27 * DAY }) }))
    const { unmount } = renderIt()
    expect(await screen.findByText(/reaches back 3 days/)).toBeInTheDocument()
    unmount()

    get.mockResolvedValue(ok({ history: history({ coveredFrom: null, totals: { requests: 0, serverErrors: 0, bytes: 0, avgMs: null } }) }))
    renderIt()
    expect(await screen.findByText(/Nothing is stored yet/)).toBeInTheDocument()
  })

  test('a failed load says what failed', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'db down' }) })
    renderIt()
    expect(await screen.findByRole('alert')).toHaveTextContent(/history/)
  })
})
