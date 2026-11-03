/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../src/utils/api', async (importOriginal) => ({ ...(await importOriginal()), get: vi.fn() }))

import { get } from '../src/utils/api'
import UpstreamsSection from '../src/components/metrics/UpstreamsSection'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const row = (over) => ({ proxyId: 'p1', proxyName: 'Grafana', dial: 'grafana:3000', reachable: true, probeMs: 4, inFlight: 2, fails: 0, state: 'up', ...over })
const report = (rows, over = {}) => ({ checkedAt: new Date().toISOString(), caddyAvailable: true, rows, ...over })
const renderIt = () => render(<MemoryRouter><UpstreamsSection token="t" /></MemoryRouter>)

beforeEach(() => vi.clearAllMocks())

describe('UpstreamsSection', () => {
  test('lists upstreams with their state in words and Caddy counters', async () => {
    get.mockResolvedValue(ok({ upstreams: report([
      row({ proxyId: 'p2', proxyName: 'Nextcloud', dial: 'cloud:80', reachable: false, probeMs: null, inFlight: null, fails: null, state: 'down' }),
      row(),
    ]) }))
    renderIt()
    const table = await screen.findByRole('table')
    const down = within(table).getByText('cloud:80').closest('tr')
    expect(within(down).getByText('Not reachable')).toBeInTheDocument()
    expect(within(down).getAllByText('—')).toHaveLength(3)
    const up = within(table).getByText('grafana:3000').closest('tr')
    expect(within(up).getByText('Reachable')).toBeInTheDocument()
    expect(within(up).getByText('4 ms')).toBeInTheDocument()
    expect(screen.getByText(/1 does not\./)).toBeInTheDocument()
  })

  test('says so when Caddy could not be read, and when there is nothing to check', async () => {
    get.mockResolvedValue(ok({ upstreams: report([row({ inFlight: null, fails: null })], { caddyAvailable: false }) }))
    const { unmount } = renderIt()
    expect(await screen.findByText(/admin API could not be read/)).toBeInTheDocument()
    unmount()

    get.mockResolvedValue(ok({ upstreams: report([]) }))
    renderIt()
    expect(await screen.findByText(/No active proxy has an upstream/)).toBeInTheDocument()
  })

  test('Check again asks the server once more; a failure says what failed', async () => {
    get.mockResolvedValue(ok({ upstreams: report([row()]) }))
    renderIt()
    await screen.findByRole('table')
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'db down' }) })
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/upstreams/)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
