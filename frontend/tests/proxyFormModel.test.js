/* global describe, test, expect */
import {
  DEFAULT_VALUES,
  valuesFromProxy,
  parseDomains,
  validateValues,
  buildPayload,
  lockValues,
  unlockValues,
  groupOfField,
} from '../src/components/proxy/proxyFormModel'

const valid = (patch = {}) => ({
  ...DEFAULT_VALUES,
  name: 'Grafana',
  domains: 'grafana.example.com',
  upstreamUrl: 'http://grafana:3000',
  ...patch,
})

describe('parseDomains', () => {
  test('splits on commas, trims and drops empties', () => {
    expect(parseDomains(' a.example.com, ,b.example.com ,')).toEqual(['a.example.com', 'b.example.com'])
  })
  test('is empty for blank text', () => {
    expect(parseDomains('  , ')).toEqual([])
  })
})

describe('valuesFromProxy', () => {
  test('without a proxy gives the defaults', () => {
    expect(valuesFromProxy(null)).toEqual(DEFAULT_VALUES)
  })

  test('reads every field of a stored proxy', () => {
    const values = valuesFromProxy({
      name: 'S3',
      domains: ['s3.example.com', '*.s3.example.com'],
      upstream_url: 'https://10.0.0.9',
      ssl_type: 'cloudflare',
      compression_enabled: false,
      skip_tls_verify: true,
      security_headers_enabled: true,
      rate_limit: { enabled: true, requests_per_second: 5, burst: 9 },
      ip_filtering: { enabled: true, mode: 'allow', ip_list: ['10.0.0.1', '10.0.0.0/24'] },
      basic_auth: { enabled: true, username: 'ops' },
      path_routing: { enabled: true, routes: [{ path: '/api/*', upstream_url: 'api:80' }] },
      load_balancing: { enabled: true, policy: 'least_conn', upstreams: [{ url: 'a:80', weight: 3 }, { url: 'b:80' }] },
      health_checks: { enabled: true, path: '/up', interval: '10s', timeout: '2s', max_fails: 4 },
    })
    expect(values).toMatchObject({
      name: 'S3',
      domains: 's3.example.com, *.s3.example.com',
      upstreamUrl: 'https://10.0.0.9',
      sslType: 'cloudflare',
      compressionEnabled: false,
      skipTlsVerify: true,
      securityHeadersEnabled: true,
      rateLimitEnabled: true,
      requestsPerSecond: 5,
      rateLimitBurst: 9,
      ipFilteringEnabled: true,
      ipFilteringMode: 'allow',
      ipList: '10.0.0.1\n10.0.0.0/24',
      basicAuthEnabled: true,
      basicAuthUsername: 'ops',
      basicAuthPassword: '',
      pathRoutingEnabled: true,
      pathRoutes: [{ path: '/api/*', upstream_url: 'api:80' }],
      lbEnabled: true,
      lbPolicy: 'least_conn',
      lbUpstreams: [{ url: 'a:80', weight: '3' }, { url: 'b:80', weight: '' }],
      healthCheckEnabled: true,
      healthCheckPath: '/up',
      healthCheckInterval: '10s',
      healthCheckTimeout: '2s',
      healthCheckMaxFails: 4,
    })
  })

  test('survives legacy rows: a string domain, no ip_list, no routes, null settings', () => {
    const values = valuesFromProxy({
      name: 'Old',
      domains: 'old.example.com',
      upstream_url: 'old:80',
      ssl_type: 'acme',
      ip_filtering: { enabled: true, mode: 'block' },
      path_routing: { enabled: true },
      load_balancing: null,
      health_checks: null,
    })
    expect(values.domains).toBe('old.example.com')
    expect(values.ipList).toBe('')
    expect(values.pathRoutes).toEqual([{ path: '', upstream_url: '' }])
    expect(values.compressionEnabled).toBe(true)
    expect(values.lbEnabled).toBe(false)
  })

  test('does not share arrays with the stored proxy', () => {
    const routes = [{ path: '/a', upstream_url: 'a:1' }]
    const values = valuesFromProxy({ name: 'x', domains: ['x.example.com'], upstream_url: 'x:1', path_routing: { enabled: true, routes } })
    values.pathRoutes[0].path = '/changed'
    expect(routes[0].path).toBe('/a')
  })
})

describe('buildPayload', () => {
  test('a plain proxy sends the same fields the form always sent', () => {
    expect(buildPayload(valid(), 'u1')).toEqual({
      name: 'Grafana',
      domains: ['grafana.example.com'],
      upstream_url: 'http://grafana:3000',
      ssl_type: 'acme',
      compression_enabled: true,
      skip_tls_verify: false,
      security_headers_enabled: false,
      rate_limit: null,
      ip_filtering: null,
      basic_auth: null,
      path_routing: null,
      load_balancing: null,
      health_checks: null,
      created_by: 'u1',
    })
  })

  test('every option on', () => {
    const payload = buildPayload(
      valid({
        rateLimitEnabled: true, requestsPerSecond: '5', rateLimitBurst: '9',
        ipFilteringEnabled: true, ipFilteringMode: 'allow', ipList: '10.0.0.1\n\n 10.0.0.0/24 ',
        basicAuthEnabled: true, basicAuthUsername: 'ops', basicAuthPassword: 'longpassword',
        pathRoutingEnabled: true, pathRoutes: [{ path: '/api/*', upstream_url: 'api:80' }, { path: '', upstream_url: '' }],
        lbEnabled: true, lbPolicy: 'least_conn', lbUpstreams: [{ url: ' a:80 ', weight: '3' }, { url: 'b:80', weight: '' }, { url: ' ', weight: '' }],
        healthCheckEnabled: true, healthCheckPath: '/up', healthCheckInterval: '10s', healthCheckTimeout: '2s', healthCheckMaxFails: '4',
      }),
      'u1',
    )
    expect(payload.rate_limit).toEqual({ enabled: true, requests_per_second: 5, burst: 9 })
    expect(payload.ip_filtering).toEqual({ enabled: true, mode: 'allow', ip_list: ['10.0.0.1', '10.0.0.0/24'] })
    expect(payload.basic_auth).toEqual({ enabled: true, username: 'ops', password: 'longpassword' })
    expect(payload.path_routing).toEqual({ enabled: true, routes: [{ path: '/api/*', upstream_url: 'api:80' }] })
    expect(payload.load_balancing).toEqual({
      enabled: true,
      policy: 'least_conn',
      upstreams: [{ url: 'a:80', weight: 3 }, { url: 'b:80' }],
    })
    expect(payload.health_checks).toEqual({ enabled: true, path: '/up', interval: '10s', timeout: '2s', max_fails: 4 })
  })

  test('a blank password is left out so the server keeps the stored hash', () => {
    const payload = buildPayload(valid({ basicAuthEnabled: true, basicAuthUsername: 'ops', basicAuthPassword: '' }), 'u1')
    expect(payload.basic_auth).toEqual({ enabled: true, username: 'ops' })
    expect('password' in payload.basic_auth).toBe(false)
  })

  test('never sends NaN', () => {
    const payload = buildPayload(valid({ rateLimitEnabled: true, requestsPerSecond: 'abc', rateLimitBurst: '' }), 'u1')
    expect(Number.isNaN(payload.rate_limit.requests_per_second)).toBe(false)
    expect(Number.isNaN(payload.rate_limit.burst)).toBe(false)
  })
})

describe('validateValues', () => {
  const errorsOf = (patch, options) => validateValues(valid(patch), options).errors

  test('a complete proxy has no errors', () => {
    expect(validateValues(valid(), {})).toEqual({ errors: {}, messages: [] })
  })

  test('names every missing required field', () => {
    const { errors, messages } = validateValues(valid({ name: ' ', domains: '', upstreamUrl: '' }), {})
    expect(Object.keys(errors)).toEqual(['name', 'domains', 'upstream_url'])
    expect(messages.map((m) => m.id)).toEqual(['name', 'domains', 'upstream_url'])
  })

  test('the name must be 3 to 100 characters, like the server', () => {
    expect(errorsOf({ name: 'ab' }).name).toMatch(/3 to 100/)
    expect(errorsOf({ name: 'x'.repeat(101) }).name).toMatch(/3 to 100/)
    expect(errorsOf({ name: 'abc' }).name).toBeUndefined()
  })

  test('accepts the domains the server accepts, wildcards included', () => {
    expect(errorsOf({ domains: 'example.com, *.s3.example.com, a-b.co' }).domains).toBeUndefined()
  })

  test.each(['https://example.com', 'example.com/path', 'exa mple.com', 'example.c', '-bad.example.com'])(
    'rejects %s and says how to write a domain', (bad) => {
      expect(errorsOf({ domains: `ok.example.com, ${bad}` }).domains).toMatch(/not a valid domain/)
    })

  test('accepts upstream forms the server accepts', () => {
    for (const upstream of ['http://upstream:8080', 'app:3000', 'https://api']) {
      expect(errorsOf({ upstreamUrl: upstream }).upstream_url).toBeUndefined()
    }
  })

  test('rate limit numbers must be whole numbers of 1 or more', () => {
    const errors = errorsOf({ rateLimitEnabled: true, requestsPerSecond: '0', rateLimitBurst: 'x' })
    expect(errors.rate_limit_rps).toBeDefined()
    expect(errors.rate_limit_burst).toBeDefined()
    expect(errorsOf({ rateLimitEnabled: false, requestsPerSecond: '0' }).rate_limit_rps).toBeUndefined()
  })

  test('IP filtering needs at least one entry', () => {
    expect(errorsOf({ ipFilteringEnabled: true, ipList: '  \n' }).ip_list).toMatch(/at least one/)
  })

  test('basic auth: username pattern, and a password of 8+ unless one is already stored', () => {
    expect(errorsOf({ basicAuthEnabled: true, basicAuthUsername: '', basicAuthPassword: 'longpassword' }).basic_auth_username).toBeDefined()
    expect(errorsOf({ basicAuthEnabled: true, basicAuthUsername: 'a:b', basicAuthPassword: 'longpassword' }).basic_auth_username).toBeDefined()
    expect(errorsOf({ basicAuthEnabled: true, basicAuthUsername: 'ops', basicAuthPassword: '' }).basic_auth_password).toBeDefined()
    expect(errorsOf({ basicAuthEnabled: true, basicAuthUsername: 'ops', basicAuthPassword: 'short' }).basic_auth_password).toMatch(/8/)
    expect(errorsOf({ basicAuthEnabled: true, basicAuthUsername: 'ops', basicAuthPassword: '' }, { hadBasicAuth: true }).basic_auth_password).toBeUndefined()
  })

  test('path routes: a half-filled row is an error, a blank row is ignored, none at all is an error', () => {
    const half = errorsOf({ pathRoutingEnabled: true, pathRoutes: [{ path: '/a', upstream_url: '' }] })
    expect(half.route_0_upstream).toBeDefined()
    const blankPlusGood = errorsOf({ pathRoutingEnabled: true, pathRoutes: [{ path: '/a', upstream_url: 'a:1' }, { path: '', upstream_url: '' }] })
    expect(Object.keys(blankPlusGood)).toEqual([])
    const none = errorsOf({ pathRoutingEnabled: true, pathRoutes: [{ path: '', upstream_url: '' }] })
    expect(none.route_0_path).toMatch(/at least one route/i)
  })

  test('load balancing needs an upstream, and weights must be whole numbers of 1 or more', () => {
    expect(errorsOf({ lbEnabled: true, lbUpstreams: [{ url: ' ', weight: '' }] }).lb_upstream_0).toBeDefined()
    expect(errorsOf({ lbEnabled: true, lbUpstreams: [{ url: 'a:1', weight: '0' }] }).lb_weight_0).toBeDefined()
    expect(errorsOf({ lbEnabled: true, lbUpstreams: [{ url: 'a:1', weight: '2' }] })).toEqual({})
  })

  test('health checks use the server rules: path starts with /, durations are 10s, 1m, 2h (no ms)', () => {
    const bad = errorsOf({ healthCheckEnabled: true, healthCheckPath: 'health', healthCheckInterval: '30', healthCheckTimeout: '5ms', healthCheckMaxFails: '0' })
    expect(Object.keys(bad)).toEqual(['health_path', 'health_interval', 'health_timeout', 'health_max_fails'])
    expect(errorsOf({ healthCheckEnabled: true, healthCheckInterval: '1.5m' })).toEqual({})
  })

  test('errors come in page order', () => {
    const { errors } = validateValues(
      valid({ upstreamUrl: '', name: '', healthCheckEnabled: true, healthCheckPath: 'x', rateLimitEnabled: true, requestsPerSecond: '0' }),
      {},
    )
    expect(Object.keys(errors)).toEqual(['name', 'upstream_url', 'rate_limit_rps', 'health_path'])
  })
})

describe('groupOfField', () => {
  test('tells which option group holds a field, so it can be opened', () => {
    expect(groupOfField('rate_limit_rps')).toBe('traffic')
    expect(groupOfField('ip_list')).toBe('traffic')
    expect(groupOfField('basic_auth_password')).toBe('traffic')
    expect(groupOfField('route_2_path')).toBe('routing')
    expect(groupOfField('lb_weight_1')).toBe('routing')
    expect(groupOfField('health_interval')).toBe('routing')
    expect(groupOfField('name')).toBeNull()
  })
})

describe('template locks', () => {
  const constraints = [
    { option: 'compression_enabled', value: false, reason: 'x' },
    { option: 'basic_auth', value: false, reason: 'y' },
  ]

  test('locking switches the options off and remembers what they were', () => {
    const before = valid({ compressionEnabled: true, basicAuthEnabled: true })
    const { values, restore } = lockValues(before, constraints)
    expect(values.compressionEnabled).toBe(false)
    expect(values.basicAuthEnabled).toBe(false)
    expect(restore).toEqual({ compressionEnabled: true, basicAuthEnabled: true })
    expect(before.compressionEnabled).toBe(true) // the input is not changed
  })

  test('unlocking puts the options back as they were', () => {
    const { values, restore } = lockValues(valid({ compressionEnabled: true, basicAuthEnabled: true }), constraints)
    const back = unlockValues(values, restore)
    expect(back.compressionEnabled).toBe(true)
    expect(back.basicAuthEnabled).toBe(true)
  })

  test('constraints that do not name an option change nothing', () => {
    const before = valid()
    const { values, restore } = lockValues(before, [])
    expect(values).toEqual(before)
    expect(restore).toEqual({})
  })
})
