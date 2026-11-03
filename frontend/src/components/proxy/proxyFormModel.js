// Pure model of the proxy form: default values, conversion to and from the API shape,
// validation (the rules the server enforces, so errors show before the request) and
// template locks. No React in here, so every rule is unit tested.

export const DEFAULT_VALUES = Object.freeze({
  name: '',
  domains: '',
  upstreamUrl: '',
  sslType: 'acme',
  compressionEnabled: true,
  skipTlsVerify: false,
  securityHeadersEnabled: false,
  rateLimitEnabled: false,
  requestsPerSecond: 10,
  rateLimitBurst: 20,
  ipFilteringEnabled: false,
  ipFilteringMode: 'block',
  ipList: '',
  basicAuthEnabled: false,
  basicAuthUsername: '',
  basicAuthPassword: '',
  pathRoutingEnabled: false,
  pathRoutes: [{ path: '', upstream_url: '' }],
  lbEnabled: false,
  lbPolicy: 'round_robin',
  lbUpstreams: [{ url: '', weight: '' }],
  healthCheckEnabled: false,
  healthCheckPath: '/health',
  healthCheckInterval: '30s',
  healthCheckTimeout: '5s',
  healthCheckMaxFails: 3,
})

const freshDefaults = () => ({
  ...DEFAULT_VALUES,
  pathRoutes: DEFAULT_VALUES.pathRoutes.map((r) => ({ ...r })),
  lbUpstreams: DEFAULT_VALUES.lbUpstreams.map((u) => ({ ...u })),
})

export const parseDomains = (text) =>
  String(text ?? '').split(',').map((d) => d.trim()).filter(Boolean)

const lines = (text) => String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

export function valuesFromProxy(proxy) {
  const values = freshDefaults()
  if (!proxy) return values

  values.name = proxy.name ?? ''
  values.domains = Array.isArray(proxy.domains) ? proxy.domains.join(', ') : String(proxy.domains ?? '')
  values.upstreamUrl = proxy.upstream_url ?? ''
  values.sslType = proxy.ssl_type ?? 'acme'
  values.compressionEnabled = proxy.compression_enabled ?? true
  values.skipTlsVerify = Boolean(proxy.skip_tls_verify)
  values.securityHeadersEnabled = Boolean(proxy.security_headers_enabled)

  const rl = proxy.rate_limit
  if (rl) {
    values.rateLimitEnabled = Boolean(rl.enabled)
    values.requestsPerSecond = rl.requests_per_second ?? values.requestsPerSecond
    values.rateLimitBurst = rl.burst ?? values.rateLimitBurst
  }

  const ip = proxy.ip_filtering
  if (ip) {
    values.ipFilteringEnabled = Boolean(ip.enabled)
    values.ipFilteringMode = ip.mode ?? 'block'
    values.ipList = Array.isArray(ip.ip_list) ? ip.ip_list.join('\n') : ''
  }

  const ba = proxy.basic_auth
  if (ba) {
    values.basicAuthEnabled = Boolean(ba.enabled)
    values.basicAuthUsername = ba.username ?? ''
  }

  const pr = proxy.path_routing
  if (pr) {
    values.pathRoutingEnabled = Boolean(pr.enabled)
    if (Array.isArray(pr.routes) && pr.routes.length > 0) {
      values.pathRoutes = pr.routes.map((r) => ({ path: r.path ?? '', upstream_url: r.upstream_url ?? '' }))
    }
  }

  const lb = proxy.load_balancing
  if (lb) {
    values.lbEnabled = Boolean(lb.enabled)
    values.lbPolicy = lb.policy ?? 'round_robin'
    if (Array.isArray(lb.upstreams) && lb.upstreams.length > 0) {
      values.lbUpstreams = lb.upstreams.map((u) => ({
        url: u.url ?? '',
        weight: u.weight == null ? '' : String(u.weight),
      }))
    }
  }

  const hc = proxy.health_checks
  if (hc) {
    values.healthCheckEnabled = Boolean(hc.enabled)
    values.healthCheckPath = hc.path ?? values.healthCheckPath
    values.healthCheckInterval = hc.interval ?? values.healthCheckInterval
    values.healthCheckTimeout = hc.timeout ?? values.healthCheckTimeout
    values.healthCheckMaxFails = hc.max_fails ?? values.healthCheckMaxFails
  }

  return values
}

const toInt = (value, fallback) => {
  const n = parseInt(String(value).trim(), 10)
  return Number.isNaN(n) ? fallback : n
}

export function buildPayload(values, userId) {
  const routes = values.pathRoutes
    .map((r) => ({ path: r.path.trim(), upstream_url: r.upstream_url.trim() }))
    .filter((r) => r.path && r.upstream_url)

  const upstreams = values.lbUpstreams
    .map((u) => ({ url: u.url.trim(), weight: String(u.weight ?? '').trim() }))
    .filter((u) => u.url)
    .map((u) => ({ url: u.url, ...(u.weight ? { weight: toInt(u.weight, 1) } : {}) }))

  const password = values.basicAuthPassword

  return {
    name: values.name.trim(),
    domains: parseDomains(values.domains),
    upstream_url: values.upstreamUrl.trim(),
    ssl_type: values.sslType,
    compression_enabled: values.compressionEnabled,
    skip_tls_verify: values.skipTlsVerify,
    security_headers_enabled: values.securityHeadersEnabled,
    rate_limit: values.rateLimitEnabled
      ? {
          enabled: true,
          requests_per_second: toInt(values.requestsPerSecond, DEFAULT_VALUES.requestsPerSecond),
          burst: toInt(values.rateLimitBurst, DEFAULT_VALUES.rateLimitBurst),
        }
      : null,
    ip_filtering: values.ipFilteringEnabled
      ? { enabled: true, mode: values.ipFilteringMode, ip_list: lines(values.ipList) }
      : null,
    // A blank password is left out so the server keeps the stored hash
    basic_auth: values.basicAuthEnabled
      ? { enabled: true, username: values.basicAuthUsername.trim(), ...(password ? { password } : {}) }
      : null,
    path_routing: values.pathRoutingEnabled ? { enabled: true, routes } : null,
    load_balancing: values.lbEnabled ? { enabled: true, policy: values.lbPolicy, upstreams } : null,
    health_checks: values.healthCheckEnabled
      ? {
          enabled: true,
          path: values.healthCheckPath.trim(),
          interval: values.healthCheckInterval.trim(),
          timeout: values.healthCheckTimeout.trim(),
          max_fails: toInt(values.healthCheckMaxFails, DEFAULT_VALUES.healthCheckMaxFails),
        }
      : null,
    created_by: userId,
  }
}

const DOMAIN_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i
const DURATION_RE = /^\d+(\.\d+)?(s|m|h)$/
const USERNAME_RE = /^[A-Za-z0-9._@-]{1,64}$/
const WHOLE_RE = /^\d+$/

const isPositiveWhole = (value) => {
  const text = String(value ?? '').trim()
  return WHOLE_RE.test(text) && Number(text) >= 1
}

const utf8Length = (text) => new TextEncoder().encode(text).length

/**
 * Checks the values with the rules the server applies.
 * Returns errors keyed by the id of the field, in page order, plus the same as a list.
 */
export function validateValues(values, { hadBasicAuth = false } = {}) {
  const errors = {}
  const add = (id, message) => {
    if (!(id in errors)) errors[id] = message
  }

  const name = values.name.trim()
  if (!name) add('name', 'Enter a name for this proxy.')
  else if (name.length < 3 || name.length > 100) add('name', 'The name must be 3 to 100 characters.')

  const domains = parseDomains(values.domains)
  if (domains.length === 0) {
    add('domains', 'Enter at least one domain. Separate several with commas: example.com, www.example.com')
  } else {
    const bad = domains.find((d) => !DOMAIN_RE.test(d))
    if (bad) {
      add('domains', `"${bad}" is not a valid domain. Write it like app.example.com or *.example.com, without https:// or a path.`)
    }
  }

  const upstream = values.upstreamUrl.trim()
  if (!upstream) add('upstream_url', 'Enter where the traffic goes, like http://app:3000 or app:3000.')
  else if (/\s/.test(upstream)) add('upstream_url', 'The upstream cannot contain spaces.')

  if (values.rateLimitEnabled) {
    if (!isPositiveWhole(values.requestsPerSecond)) add('rate_limit_rps', 'Use a whole number of 1 or more.')
    if (!isPositiveWhole(values.rateLimitBurst)) add('rate_limit_burst', 'Use a whole number of 1 or more.')
  }

  if (values.ipFilteringEnabled && lines(values.ipList).length === 0) {
    add('ip_list', 'Add at least one IP address or CIDR range, one per line.')
  }

  if (values.basicAuthEnabled) {
    const username = values.basicAuthUsername.trim()
    if (!username) add('basic_auth_username', 'Enter a username.')
    else if (!USERNAME_RE.test(username)) {
      add('basic_auth_username', 'Use letters, numbers and . _ @ - only, up to 64 characters. A colon is not allowed.')
    }
    const password = values.basicAuthPassword
    if (!password) {
      if (!hadBasicAuth) add('basic_auth_password', 'Enter a password of at least 8 characters.')
    } else if (password.length < 8) {
      add('basic_auth_password', 'The password must be at least 8 characters.')
    } else if (utf8Length(password) > 72) {
      add('basic_auth_password', 'The password can be at most 72 bytes long.')
    }
  }

  if (values.pathRoutingEnabled) {
    let complete = 0
    let touched = false
    values.pathRoutes.forEach((route, i) => {
      const path = route.path.trim()
      const target = route.upstream_url.trim()
      if (!path && !target) return
      touched = true
      if (!path) add(`route_${i}_path`, 'Enter the path, like /api/*.')
      else if (!path.startsWith('/')) add(`route_${i}_path`, 'The path must start with /, like /api/*.')
      if (!target) add(`route_${i}_upstream`, 'Enter where this path goes.')
      if (path && target) complete += 1
    })
    if (!touched && complete === 0) add('route_0_path', 'Add at least one route, or turn path routing off.')
  }

  if (values.lbEnabled) {
    let withUrl = 0
    values.lbUpstreams.forEach((u, i) => {
      const url = u.url.trim()
      const weight = String(u.weight ?? '').trim()
      if (!url) {
        if (weight) add(`lb_upstream_${i}`, 'Enter the upstream this weight belongs to.')
        return
      }
      withUrl += 1
      if (weight && !isPositiveWhole(weight)) add(`lb_weight_${i}`, 'Use a whole number of 1 or more.')
    })
    if (withUrl === 0) add('lb_upstream_0', 'Add at least one upstream, or turn load balancing off.')
  }

  if (values.healthCheckEnabled) {
    if (!values.healthCheckPath.trim().startsWith('/')) add('health_path', 'The path must start with /, like /health.')
    if (!DURATION_RE.test(values.healthCheckInterval.trim())) add('health_interval', 'Use seconds, minutes or hours: 30s, 1m, 2h.')
    if (!DURATION_RE.test(values.healthCheckTimeout.trim())) add('health_timeout', 'Use seconds, minutes or hours: 5s, 1m.')
    if (!isPositiveWhole(values.healthCheckMaxFails)) add('health_max_fails', 'Use a whole number of 1 or more.')
  }

  return { errors, messages: Object.entries(errors).map(([id, message]) => ({ id, message })) }
}

const TRAFFIC_PREFIXES = ['rate_limit', 'ip_', 'basic_auth']
const ROUTING_PREFIXES = ['route_', 'lb_', 'health_']

/** Which collapsible option group holds a field, so an error can open it */
export function groupOfField(id) {
  if (TRAFFIC_PREFIXES.some((p) => id.startsWith(p))) return 'traffic'
  if (ROUTING_PREFIXES.some((p) => id.startsWith(p))) return 'routing'
  return null
}

// Template constraint option -> form value that switches it on
const LOCKABLE = Object.freeze({
  compression_enabled: 'compressionEnabled',
  basic_auth: 'basicAuthEnabled',
})

/** Forces the constrained options off; `restore` holds what they were, so clearing the template can undo it */
export function lockValues(values, constraints) {
  const restore = {}
  const next = { ...values }
  for (const { option } of constraints || []) {
    const key = LOCKABLE[option]
    if (!key) continue
    if (!(key in restore)) restore[key] = values[key]
    next[key] = false
  }
  return { values: next, restore }
}

export function unlockValues(values, restore) {
  return { ...values, ...restore }
}
