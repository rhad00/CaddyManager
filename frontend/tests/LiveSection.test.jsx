/* global vi, describe, test, expect, beforeEach, afterEach */
import React from 'react'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/utils/api', async (importOriginal) => ({ ...(await importOriginal()), get: vi.fn() }))
vi.mock('react-chartjs-2', () => {
  const Canvas = ({ 'aria-label': label }) => <canvas role="img" aria-label={label} />
  return { Line: Canvas, Bar: Canvas }
})

import { get } from '../src/utils/api'
import LiveSection from '../src/components/metrics/LiveSection'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const NOW = Math.floor(Date.UTC(2026, 10, 3, 12) / 1000)
const live = (over = {}) => ({
  from: NOW - 300,
  to: NOW,
  stepSeconds: 5,
  available: true,
  coversWindow: true,
  total: 30,
  rate: 2.5,
  series: { requests: [...new Array(59).fill(0), 30], serverErrors: [...new Array(59).fill(0), 3] },
  recent: [
    { ts: NOW - 2, host: 'cloud.example.com', method: 'POST', path: '/api', status: 502, ms: 500 },
    { ts: NOW - 9, host: 'cloud.example.com', method: 'GET', path: '/', status: 200, ms: null },
  ],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue(ok({ live: live() }))
})
afterEach(() => vi.useRealTimers())

describe('LiveSection', () => {
  test('shows the rate, the totals and the latest requests', async () => {
    render(<LiveSection token="t" />)
    expect(await screen.findByText('2.5/s')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('POST /api')).toBeInTheDocument()
    expect(within(table).getByText('502')).toBeInTheDocument()
    expect(within(table).getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Requests per second/ })).toBeInTheDocument()
  })

  test('says so when there is no access log', async () => {
    get.mockResolvedValue(ok({ live: live({ available: false }) }))
    render(<LiveSection token="t" />)
    expect(await screen.findByText(/no access log to read yet/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('warns when the log is too busy to reach back five minutes', async () => {
    get.mockResolvedValue(ok({ live: live({ coversWindow: false }) }))
    render(<LiveSection token="t" />)
    expect(await screen.findByText(/does not reach back 5 minutes/)).toBeInTheDocument()
  })

  test('a failed load says what failed', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'log unreadable' }) })
    render(<LiveSection token="t" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/live traffic/)
  })

  test('refreshes every five seconds until paused', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<LiveSection token="t" />)
    await screen.findByText('2.5/s')
    expect(get).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    expect(get).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getByRole('button', { name: 'Pause updates' }))
    expect(screen.getByRole('button', { name: 'Resume updates' })).toHaveAttribute('aria-pressed', 'true')
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(get).toHaveBeenCalledTimes(2)
  })
})
