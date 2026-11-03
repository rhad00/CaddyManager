/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jwt-token', csrfToken: 'csrf-token', currentUser: { id: 'u1' } }),
}))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../src/utils/api', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))

import { get } from '../src/utils/api'
import ProxyForm from '../src/components/ProxyForm'

const ok = (body) => ({ ok: true, json: async () => body })
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
const grafana = { id: 't-gr', name: 'Grafana', description: 'G', headers: [], middleware: [], constraints: [] }

describe('ProxyForm template constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue(ok({ features: {} }))
    get.mockImplementation(async (url) => {
      if (url === '/templates') return ok({ templates: [s3, grafana] })
      if (url === '/templates/t-s3') return ok({ template: s3 })
      if (url === '/templates/t-gr') return ok({ template: grafana })
      return ok({})
    })
  })

  test('selecting the S3 template switches compression and basic auth off and locks them', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    const compression = screen.getByLabelText(/Enable Compression/i)
    expect(compression).toBeChecked()
    expect(compression).not.toBeDisabled()

    await waitFor(() => expect(screen.getByRole('option', { name: 'Amazon S3' })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText(/Apply Template/i), 't-s3')

    await waitFor(() => expect(compression).toBeDisabled())
    expect(compression).not.toBeChecked()
    expect(screen.getByLabelText(/Enable Basic Authentication/i)).toBeDisabled()
    expect(screen.getByText(/Compression breaks ETag/)).toBeInTheDocument()
  })

  test('choosing a template without constraints, or none, unlocks the options', async () => {
    render(<ProxyForm onSave={vi.fn()} onCancel={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'Amazon S3' })).toBeInTheDocument())
    const select = screen.getByLabelText(/Apply Template/i)
    await userEvent.selectOptions(select, 't-s3')
    await waitFor(() => expect(screen.getByLabelText(/Enable Compression/i)).toBeDisabled())

    await userEvent.selectOptions(select, 't-gr')
    await waitFor(() => expect(screen.getByLabelText(/Enable Compression/i)).not.toBeDisabled())
  })
})
