/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jwt-token', csrfToken: 'csrf-token', currentUser: { id: 'u1' } }),
}))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../src/utils/api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, get: vi.fn(), post: vi.fn(), put: vi.fn() }
})

import { get, post } from '../src/utils/api'
import ProxyForm from '../src/components/ProxyForm'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const s3 = {
  id: 't-s3',
  name: 'Amazon S3',
  description: 'S3',
  headers: [],
  middleware: [],
  constraints: [
    { option: 'compression_enabled', value: false, reason: 'Compression breaks ETag.' },
    { option: 'basic_auth', value: false, reason: 'Basic auth eats Authorization.' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockResolvedValue(ok({ features: {} }))
  get.mockImplementation(async (url) => {
    if (url === '/templates') return ok({ templates: [s3] })
    if (url === '/templates/t-s3') return ok({ template: s3 })
    return ok({})
  })
})

const fill = async (name = 'Grafana', domains = 'grafana.example.com', upstream = 'http://grafana:3000') => {
  await userEvent.type(screen.getByLabelText('Name'), name)
  await userEvent.type(screen.getByLabelText('Domains'), domains)
  await userEvent.type(screen.getByLabelText('Upstream'), upstream)
}

describe('ProxyForm checks before saving', () => {
  test('an empty form names each missing field, focuses the first and does not call the API', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create proxy' }))

    const name = screen.getByLabelText('Name')
    expect(name).toHaveFocus()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(/Enter a name/)
    expect(screen.getByLabelText('Domains')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('3 fields need attention')
    expect(post).not.toHaveBeenCalled()
  })

  test('a field stops complaining as soon as it is fixed', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create proxy' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Grafana')
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid')
  })

  test('an error inside a closed option group opens the group', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    await fill()
    await userEvent.click(screen.getByText('Traffic and access'))
    await userEvent.click(screen.getByLabelText('Enable IP filtering'))
    await userEvent.click(screen.getByText('Traffic and access')) // close it again
    await userEvent.click(screen.getByRole('button', { name: 'Create proxy' }))

    await waitFor(() => expect(screen.getByLabelText(/IP addresses or CIDR ranges/)).toHaveFocus())
    expect(post).not.toHaveBeenCalled()
  })
})

describe('ProxyForm saving', () => {
  test('a failed save shows the reason in a focused alert and keeps the values', async () => {
    post.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Domain grafana.example.com is already used by proxy "Old"' }),
    })
    const onSave = vi.fn()
    render(<ProxyForm onSave={onSave} onCancel={vi.fn()} />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Create proxy' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already used/)
    await waitFor(() => expect(alert).toHaveFocus())
    expect(screen.getByLabelText('Name')).toHaveValue('Grafana')
    expect(onSave).not.toHaveBeenCalled()
  })

  test('a successful save sends the payload and calls onSave once', async () => {
    post.mockResolvedValue(ok({ proxy: { id: 'p1' } }))
    const onSave = vi.fn()
    render(<ProxyForm onSave={onSave} onCancel={vi.fn()} />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Create proxy' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith({ id: 'p1' })
    const [url, body] = post.mock.calls[0]
    expect(url).toBe('/proxies')
    expect(body).toMatchObject({ name: 'Grafana', domains: ['grafana.example.com'], upstream_url: 'http://grafana:3000', basic_auth: null })
  })

  test('the template is applied after the proxy is saved', async () => {
    post.mockResolvedValue(ok({ proxy: { id: 'p1' } }))
    const onSave = vi.fn()
    render(<ProxyForm onSave={onSave} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Amazon S3' })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Apply template'), 't-s3')
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Create proxy' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(post.mock.calls.map((c) => c[0])).toEqual(['/proxies', '/templates/t-s3/apply/p1'])
    expect(post.mock.calls[0][1]).toMatchObject({ compression_enabled: false, basic_auth: null })
  })
})

describe('ProxyForm template locks', () => {
  test('clearing the template gives the options back as they were', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Amazon S3' })).toBeInTheDocument())
    const select = screen.getByLabelText('Apply template')
    const compression = screen.getByLabelText('Enable compression')
    expect(compression).toBeChecked()

    await userEvent.selectOptions(select, 't-s3')
    await waitFor(() => expect(compression).toBeDisabled())
    expect(compression).not.toBeChecked()

    await userEvent.selectOptions(select, '')
    await waitFor(() => expect(compression).not.toBeDisabled())
    expect(compression).toBeChecked()
  })
})

describe('Route preview', () => {
  test('follows what is typed', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    const preview = screen.getByRole('complementary', { name: 'Route preview' })
    expect(within(preview).getByText('https://your-domain.com')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Domains'), 'a.example.com, b.example.com')
    await userEvent.type(screen.getByLabelText('Upstream'), 'app:3000')
    expect(within(preview).getByText('https://a.example.com')).toBeInTheDocument()
    expect(within(preview).getByText('https://b.example.com')).toBeInTheDocument()
    expect(within(preview).getByText('app:3000')).toBeInTheDocument()
    expect(within(preview).getByText('Creates the route in Caddy.')).toBeInTheDocument()
  })

  test('says an A record is added for the Cloudflare certificate', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText('TLS certificate'), 'cloudflare')
    const preview = screen.getByRole('complementary', { name: 'Route preview' })
    expect(within(preview).getByText(/Adds a Cloudflare A record/)).toBeInTheDocument()
  })
})
