/* global vi, describe, test, expect, beforeEach, afterEach */
import { apiError, apiRequest, ApiError, describeError } from '../src/utils/api'

const response = (status, body, headers = {}) => ({
  ok: status < 400,
  status,
  headers: { get: (name) => headers[name] ?? headers[name.toLowerCase()] ?? null },
  json: async () => {
    if (body === undefined) throw new SyntaxError('Unexpected token <')
    return body
  },
})

describe('apiError', () => {
  test('keeps the message of the server and names what failed', async () => {
    const err = await apiError(response(400, { message: 'Invalid domain: "exa mple"' }), 'save the proxy')
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe('Couldn\'t save the proxy. Invalid domain: "exa mple"')
    expect(err.status).toBe(400)
  })

  test('401 says the session expired and what to do', async () => {
    const err = await apiError(response(401, { message: 'Unauthorized' }), 'load proxies')
    expect(err.message).toMatch(/session has expired/i)
    expect(err.message).toMatch(/sign in again/i)
  })

  test('403 with a CSRF message asks for a reload instead of blaming the role', async () => {
    const err = await apiError(response(403, { message: 'Invalid CSRF token' }), 'delete the proxy')
    expect(err.message).toMatch(/reload the page/i)
    expect(err.message).not.toMatch(/admin/i)
  })

  test('403 otherwise points at permissions', async () => {
    const err = await apiError(response(403, { message: 'Forbidden' }), 'delete the proxy')
    expect(err.message).toMatch(/permission|admin/i)
  })

  test('404 explains the item may be gone', async () => {
    const err = await apiError(response(404, { message: 'Proxy not found' }), 'delete the proxy')
    expect(err.message).toContain('Proxy not found')
  })

  test('413 explains the size limit', async () => {
    const err = await apiError(response(413, undefined), 'upload the backup')
    expect(err.message).toMatch(/too large/i)
  })

  test('429 uses Retry-After', async () => {
    const err = await apiError(response(429, { message: 'Too many requests' }, { 'Retry-After': '42' }), 'sign in')
    expect(err.message).toMatch(/42 seconds/)
  })

  test('a generic "Server error" message is replaced by guidance, not repeated', async () => {
    const err = await apiError(response(500, { message: 'Server error while creating proxy' }), 'save the proxy')
    expect(err.message).not.toMatch(/^Couldn't save the proxy\. Server error while/)
    expect(err.message).toMatch(/unexpected error/i)
    expect(err.message).toMatch(/backend log/i)
  })

  test('a Caddy rejection (502) keeps the reason Caddy gave', async () => {
    const err = await apiError(response(502, { message: 'Caddy rejected the proxy: unknown directive' }), 'save the proxy')
    expect(err.message).toContain('Caddy rejected the proxy: unknown directive')
  })

  test('an HTML error page from nginx (backend down) does not leak a JSON parse error', async () => {
    const err = await apiError(response(502, undefined), 'load proxies')
    expect(err.message).not.toMatch(/Unexpected token|JSON/)
    expect(err.message).toMatch(/backend/i)
  })
})

describe('describeError / apiRequest', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })
  beforeEach(() => { window.sessionStorage.clear() })

  test('a network failure says the API cannot be reached', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(apiRequest('/proxies')).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringMatching(/can't reach the CaddyManager API/i),
    })
  })

  test('a timeout says no answer came', async () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    globalThis.fetch = vi.fn().mockRejectedValue(abort)
    await expect(apiRequest('/proxies')).rejects.toMatchObject({ kind: 'timeout', message: expect.stringMatching(/did not answer/i) })
  })

  test('describeError names the action for connection problems and keeps ApiError text', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await apiRequest('/proxies').catch((e) => e)
    expect(describeError(err, 'load proxies')).toMatch(/^Couldn't load proxies\. .*can't reach/i)

    const server = await apiError(response(400, { message: 'Bad name' }), 'save')
    expect(describeError(server, 'ignored')).toBe(server.message)
  })

  test('describeError handles plain errors and unknown values', () => {
    expect(describeError(new Error('boom'), 'save the proxy')).toBe('Couldn\'t save the proxy. boom')
    expect(describeError(undefined, 'save the proxy')).toMatch(/^Couldn't save the proxy\./)
  })
})
