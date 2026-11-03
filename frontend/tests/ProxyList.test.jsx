/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jwt-token', csrfToken: 'csrf-token' }),
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

const proxy = {
  id: 'p1',
  name: 'rados',
  domains: ['s3.example.com'],
  upstream_url: 'https://10.0.0.5',
  ssl_type: 'cloudflare',
  status: 'active',
}
const ok = (body) => ({ ok: true, json: async () => body })

vi.mock('../src/utils/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}))

import { get, post } from '../src/utils/api'
import ProxyList from '../src/components/ProxyList'

describe('ProxyList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue(ok({ proxies: [proxy] }))
    post.mockResolvedValue(ok({ success: true }))
  })

  // The API rejects POSTs without the CSRF token (403 "Invalid CSRF token")
  test('Recheck TLS sends the auth and CSRF tokens through the shared API helper', async () => {
    render(<ProxyList onEdit={vi.fn()} onCreate={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: /recheck tls/i }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/proxies/p1/recheck-tls', {}, 'jwt-token', 'csrf-token')
  })

  test('labels a Cloudflare DNS-01 proxy as such instead of "None"', async () => {
    render(<ProxyList onEdit={vi.fn()} onCreate={vi.fn()} />)

    expect(await screen.findByText(/cloudflare/i)).toBeInTheDocument()
    expect(screen.queryByText('None')).not.toBeInTheDocument()
  })

  test('refreshes the list after a successful recheck', async () => {
    render(<ProxyList onEdit={vi.fn()} onCreate={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: /recheck tls/i }))

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  })
})
