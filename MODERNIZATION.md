# CaddyManager Modernization Log

Tracks every change made on the `chore/modernization` branch, following the review of
the backend (TypeScript readiness, obsolete packages, declared-but-missing features, tests).

Each item below is one commit. Commits are prefixed with the item ID, e.g. `fix(0.5): ...`,
so `git log --grep "(0.5)"` finds the change for any entry.

## Plan

| Phase | Scope |
|-------|-------|
| 0 | Prerequisites: dependency hygiene, Node LTS, Caddy contract test, fix broken features |
| 0+ | Remaining functional/security fixes found in the review |
| 1 | `tsconfig` with `allowJs` + `checkJs`, type-check in CI |
| 2 | Convert `utils`, `config`, `middleware`; typed Caddy config module |
| 3 | Convert models (class-based Sequelize) and services; break circular requires |
| 4 | Convert routes; zod request schemas |
| 5 | (Optional) ESM |

## Status

| ID | Item | Status |
|----|------|--------|
| 0.1 | Remove unused backend dependencies | done |
| 0.2 | In-range dependency updates + `npm audit fix` | done |
| 0.3 | Fix frontend lint error that fails CI | done |
| 0.4 | Node 20 (EOL) → Node 24 LTS | done |
| 0.5 | Caddy config contract test (`caddy validate`) | done |
| 0.6 | Upstream URL copied verbatim into Caddy `dial` | done |
| 0.7 | Basic auth: invalid handler + plaintext password | pending |
| 0.8 | Active health checks rejected by Caddy | pending |
| 0.9 | "weighted" load balancing policy | pending |
| 0.10 | Certificate service calls non-existent Caddy admin endpoints | pending |
| 0.11 | `ssl_type` enum lacks `cloudflare` (Postgres) | pending |
| 0.12 | Access log file not shared between Caddy and backend | pending |

## Changes

### 0.1 Remove unused backend dependencies

- Removed `@kubernetes/client-node` (never imported; pulled in the deprecated `request`
  package and 4 of the 8 critical `npm audit` findings).
- Removed `otplib` (TOTP is implemented with `speakeasy`).
- Removed `@babel/preset-env` (no Babel config exists; Jest runs plain CommonJS).
- Removed `sequelize-cli` (no `.sequelizerc`; migrations run through `migrationService`).
- `pg` and `sqlite3` are kept: Sequelize loads them dynamically by dialect.
- Verification: backend suite 32/32 suites, 136/136 tests passing.

### 0.2 In-range dependency updates + `npm audit fix`

- Backend: `npm update` + `npm audit fix`, then raised every caret floor in `package.json`
  to the installed version so fresh installs cannot resolve back to vulnerable minimums
  (e.g. `express-rate-limit ^8.7.1` fixes the IPv4-mapped IPv6 rate-limit bypass,
  `axios ^1.20.0`, `multer ^2.4.0`, `js-yaml ^4.3.2`, `express ^5.3.0`).
- Backend production audit: **41 → 14** (critical 8 → 3). The remaining 14 need major
  upgrades (`simple-git` 4, `sqlite3` 6, `nodemailer` 10, `dockerode` 5) and are
  handled as separate items.
- Frontend: lockfile resynced (it was missing Tailwind's optional platform binaries,
  so `npm ci` failed on npm 11), `npm update` + `npm audit fix`, floors raised
  (`vite ^6.4.4`, `react ^19.3.0`, `react-router-dom ^7.18.4`, `tailwindcss ^4.3.3`).
- Frontend audit: **23 → 0**.
- Verification: backend 136/136 tests; frontend 15/15 tests; `vite build` succeeds.

### 0.3 Fix frontend lint error that fails CI

- `e2e/playwright.config.js` uses `process.env`, but the flat ESLint config applied only
  browser globals to every file, so `npm run lint` (a CI step) failed with `no-undef`.
- Added a block giving Node globals to `e2e/**` and root `*.config.{js,mjs}` files.
- Verification: `npm run lint` → 0 errors (4 pre-existing `exhaustive-deps` warnings).

### 0.4 Node 20 (EOL) → Node 24 LTS

- Node 20 reached end-of-life in April 2026.
- `backend/Dockerfile`: `node:20-slim` → `node:24-slim`; deprecated `npm ci --only=production`
  → `npm ci --omit=dev`.
- `frontend/Dockerfile`: `node:20-alpine` → `node:24-alpine` (and `as` → `AS`).
- `.github/workflows/ci.yml` matrix and `version-and-release.yml`: 20 → 24.
- `engines.node: ">=24"` in both `package.json` files; README tech-stack lines updated.
- Verification: both Docker images build; in the backend image (Node v24.21.0)
  `bcrypt` and `sqlite3` native modules load.

### 0.5 Caddy config contract test (`caddy validate`)

- New suite `backend/tests/contract/caddyConfig.contract.test.js` (+ `caddyValidator.js`,
  `jest.contract.config.js`, `npm run test:contract`).
- Builds full configs exactly like `rebuildConfigFromDatabase` (routes from
  `createRouteFromProxy`, access logging, Cloudflare policy) for every proxy feature and
  runs them through a real `caddy validate`.
- Caddy source: `CADDY_BIN`, `CADDY_IMAGE` (Docker), or `caddy` on `PATH`; skipped when
  none is available unless `CADDY_CONTRACT_REQUIRED=true`.
- Plugin-dependent cases (rate limit, Cloudflare DNS) run only when `caddy list-modules`
  reports the module; `CADDY_REQUIRED_MODULES` makes CI fail if the project image was
  built without them (the `caddy/Dockerfile` silently falls back to stock Caddy).
- `caddy validate` does not parse `dial` addresses (resolved per request), so the suite
  also checks every upstream `dial` is a plain `host:port`.
- CI: builds `./caddy` and runs the suite with `CADDY_CONTRACT_REQUIRED=true`.
- Known-broken cases are recorded with `test.failing` so CI stays green; each fix flips
  its case to a normal `test`:
  - 0.6 `http://app:8080` upstream → `dial: "http://app:8080"` (new finding: the API has
    required an `http(s)://` URL since `fa5a042`, but Caddy's `dial` needs `host:port`,
    so every request through such a proxy fails with "too many colons in address").
  - 0.7 `basic_auth` → `unknown module: http.handlers.basic_auth`
  - 0.8 health checks → `unknown field "max_fails"`
  - 0.9 `weighted` policy → `unknown module: http.reverse_proxy.selection_policies.weighted`
- Verification: against the project image (`caddy/Dockerfile`, Caddy 2.10.2 + plugins)
  18/18 pass (14 valid + 4 expected failures); against stock `caddy:2.10.2` 16 pass,
  2 plugin cases skipped; without Caddy the suite is skipped and the main suite passes.

### 0.6 Upstream URL copied verbatim into Caddy `dial`

- Problem: since `fa5a042` the proxies API requires `upstream_url` to be an `http(s)://`
  URL, while the UI hinted `localhost:8080`, and `createRouteFromProxy` wrote the URL
  straight into `dial`. Caddy accepts that config but every request fails with
  "too many colons in address". Load-balancing and path-routing upstreams had the same
  problem, and path-route upstreams were not validated at all.
- New `backend/src/utils/upstream.js`:
  - `parseUpstream()` accepts `http(s)://host[:port]` or bare `host[:port]` and returns
    `{ dial: "host:port", useTls, hostname }`. Default ports are 80/443; port 443 implies
    TLS (as before). Paths, queries and credentials are rejected.
  - `upstreamHostname()` for host-only checks.
- `caddyService.createRouteFromProxy` uses it for the single upstream, every
  load-balancing member and every path route. Path routes to `https://` upstreams now get
  a TLS transport. A load-balanced pool gets a TLS transport if any member uses TLS.
  New `buildTlsTransport()` helper.
- `addProxy` duplicate detection compares against both the normalised dial and the raw
  URL, so routes written before this fix are still detected.
- API `validateUpstreamUrl` accepts both input forms. It runs the existing SSRF host
  checks first, then the structural rules. New `validatePathRoutingConfig` validates
  path-route paths and upstreams.
- UI placeholder updated to `http://app:8080, https://api or app:3000`.
- Existing proxies get correct `dial` values on the next config rebuild or update.
- Open question (not changed): the SSRF guard rejects private ranges such as
  `10.0.0.0/8` and `192.168.0.0/16`, which are common upstreams for a self-hosted
  reverse proxy. Docker service names are unaffected.
- Tests: new `tests/unit/upstream.test.js` (19 cases); contract case flipped from
  `test.failing` to `test`, plus a new case for URL-form load-balancing and path-routing
  upstreams with https.
- Verification: backend 155 passed; contract suite 19/19 against the project image.
