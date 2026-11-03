/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../src/utils/api', async (importOriginal) => ({ ...(await importOriginal()), get: vi.fn() }))

import { get } from '../src/utils/api'
import CertificatesSection from '../src/components/metrics/CertificatesSection'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const days = (n) => new Date(Date.now() + n * 86_400_000).toISOString()
const row = (over) => ({
  proxyId: 'p1', proxyName: 'Grafana', domain: 'grafana.example.com', state: 'valid', issuer: "Let's Encrypt",
  validFrom: days(-60), validTo: days(10), daysLeft: 10, error: null, checkedAt: new Date(Date.now() - 3600_000).toISOString(),
  ...over,
})
const renderIt = () => render(<MemoryRouter><CertificatesSection token="t" /></MemoryRouter>)

beforeEach(() => vi.clearAllMocks())

describe('CertificatesSection', () => {
  test('lists each domain with its days left, expiry date and issuer, and counts what needs attention', async () => {
    get.mockResolvedValue(ok({ certificates: [
      row(),
      row({ proxyId: 'p2', proxyName: 'Nextcloud', domain: 'cloud.example.com', daysLeft: 70, validTo: days(70) }),
    ] }))
    renderIt()
    const first = (await screen.findByText('grafana.example.com')).closest('li')
    expect(within(first).getByText('10 days left')).toBeInTheDocument()
    expect(within(first).getByRole('link', { name: 'Grafana' })).toHaveAttribute('href', '/metrics?proxy=p1')
    expect(screen.getByText('70 days left')).toBeInTheDocument()
    expect(screen.getByText(/1 needs attention/)).toBeInTheDocument()
    expect(screen.getByText(/Last checked 1 h ago/)).toBeInTheDocument()
  })

  test('failed, expired and unchecked rows say so', async () => {
    get.mockResolvedValue(ok({ certificates: [
      row({ domain: 'a.example.com', state: 'expired', daysLeft: -2, validTo: days(-2) }),
      row({ domain: 'b.example.com', state: 'failed', error: 'handshake timeout', daysLeft: null, validTo: null }),
      row({ domain: 'c.example.com', state: 'unchecked', daysLeft: null, validTo: null, issuer: null, checkedAt: null }),
    ] }))
    renderIt()
    expect(await screen.findByText('Expired 2 days ago')).toBeInTheDocument()
    expect(screen.getByText('Check failed: handshake timeout')).toBeInTheDocument()
    expect(screen.getByText('Not checked yet')).toBeInTheDocument()
    expect(screen.getByText(/have not been checked yet/)).toBeInTheDocument()
  })

  test('no domains and a failed load each have their own message', async () => {
    get.mockResolvedValue(ok({ certificates: [] }))
    const { unmount } = renderIt()
    expect(await screen.findByText(/no certificates to show/)).toBeInTheDocument()
    unmount()

    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'db down' }) })
    renderIt()
    expect(await screen.findByRole('alert')).toHaveTextContent(/certificates/)
  })
})
