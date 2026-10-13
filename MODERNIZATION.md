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
| 0.7 | Basic auth: invalid handler + plaintext password | done |
| 0.8 | SSRF guard bypass via IPv4-mapped IPv6 / trailing-dot hosts | done |
| 0.9 | Active health checks rejected by Caddy | done |
| 0.10 | "weighted" load balancing policy | done |
| 0.11a | Certificates: parsing, key/cert match, `created_by`, ids | done |
| 0.11b | Certificates: load custom certs via `apps.tls.certificates.load_pem` | done |
| 0.11c | Certificates: self-signed generation needs `openssl` in the image | done |
| 0.11d | Certificates: sync / renew / per-domain lookup without fake endpoints | done |
| 0.11e | Certificates: ACME CAs and CA trust without fake endpoints | done |
| 0.12 | `ssl_type` enum lacks `cloudflare` (Postgres) | done |
| 0.13 | Access log never written, and not shared between Caddy and backend | done |
| 0.14 | Cloudflare DNS policy captures every proxy's domains, not just Cloudflare ones | done |
| 0.15 | Proxy create/update commits to DB before Caddy; failure leaves orphan + 500 | done |
| 0.16 | Proxies from GitOps sync / backup restore / discovery skip upstream validation | done |
| 0.17 | Prod compose file mounts a non-existent `./Caddyfile` | done |
| 0.18 | GitOps sync and Docker discovery call a non-existent `caddyService.updateCaddyConfig()` | done |
| | **Phase 0+: remaining fixes from the review** | |
| 0.19 | API keys: write-scope check and key owner status | done |
| 0.20 | Alerts: `error_rate` / `no_traffic` stubs, stale `tls_status`, certificate sync never scheduled | pending |
| 0.21 | Alert webhooks: SSRF | pending |
| 0.22 | Git: rollback to a commit | pending |
| 0.23 | Git: token stored in `.git/config`, GitLab token URL format, password hashes in the export | pending |
| 0.24 | Discovery: container state, unused labels | pending |
| 0.25 | Cluster mode: schedulers run in every instance | pending |
| 0.26 | CI: tests not run, no coverage threshold, no Postgres or Playwright job | pending |
| 0.27 | README references missing files | pending |
| 0.28 | Major upgrades: `simple-git` 4, `sqlite3` 6, `nodemailer` 10, `dockerode` 5 | pending |
| 0.29 | Declared but unimplemented: Kubernetes discovery, backup upload, `custom_ssl_cert_id`, proxy middlewares (stored, never applied) | pending |

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

### 0.7 Basic auth: invalid handler + plaintext password

- Problems:
  - `createRouteFromProxy` emitted `handler: "basic_auth"`, which only exists as a Caddyfile
    directive. Caddy rejected the whole config (`unknown module`), so enabling basic auth
    on one proxy broke config loads for every proxy.
  - The UI sends `basic_auth.password`; the API stored it as-is (plaintext in the
    database, returned by every GET) and never produced the `hashed_password` the route
    builder read.
- New `backend/src/utils/basicAuth.js`:
  - `prepareBasicAuth(input, existing)` validates the username (RFC 7617: no colon; 1-64
    printable characters, no spaces) and the password (8-72 bytes, the bcrypt limit).
    It bcrypt-hashes a new password (12 rounds), keeps the stored hash when no password is
    sent (edit form), hashes a legacy plaintext value if one is found, and rejects
    enabling without a password. bcrypt is loaded lazily, because `caddyService` unit
    tests mock `fs` and that breaks native module resolution.
  - `toCaddyAuthHandler()` emits `{ handler: "authentication", providers: { http_basic:
    { accounts: [...] } } }`. If enabled without a hash it fails closed for that route
    (static 401) instead of aborting the whole rebuild or exposing the upstream.
  - `redactBasicAuth()` replaces the hash with `has_password: true`.
- Proxies API: create/update run `prepareBasicAuth` (400 on invalid input); list, get,
  create and update responses go through `serializeProxy`, so no hash or password is
  ever returned. Git exports and backups still contain the bcrypt hash, so restores and
  GitOps keep working.
- Migration `20261013-hash-basic-auth-passwords.js` hashes existing plaintext passwords
  on startup and removes them.
- Runtime check (live `caddy:2.10.2` with the generated handler and a raw bcrypt hash):
  no credentials → 401, wrong password → 401, correct password → 200.
- Tests: `tests/unit/basicAuth.test.js` (17), `tests/integration/basicAuth.proxies.test.js`
  (5: hashing on create, hash kept on update, 400 without password, no hash in GET,
  migration). Contract case flipped to `test`. `caddyService.real.test.js` assertions that
  encoded the invalid handler now expect `authentication`.
- Verification: backend 177 passed (unit 111, integration 63); contract 19/19.
- Renumbering: a background security review after 0.6 led to finding SSRF guard bypasses
  that already existed before this work. They are now item 0.8, and the following items
  shifted by one.

### 0.8 SSRF guard bypass via IPv4-mapped IPv6 / trailing-dot hosts

- Problem (existed before this work): the upstream SSRF guard compared hostname strings,
  so these all passed:
  - `http://[::ffff:127.0.0.1]` (loopback)
  - `http://[::ffff:a9fe:a9fe]` (the cloud metadata IP 169.254.169.254)
  - `http://localhost.:8080`
  - `*.localhost` names
- New `backend/src/utils/ssrf.js` `isRestrictedHost()`:
  - Uses Node's `net.BlockList`, which matches IPv4-mapped IPv6 addresses against the
    IPv4 rules.
  - Blocks the same IPv4 ranges as before, plus IPv6 `::/96` (unspecified, loopback,
    IPv4-compatible), `64:ff9b::/96` (NAT64), `fc00::/7` and `fe80::/10`.
  - Normalises case and trailing dots and treats `*.localhost` as loopback (RFC 6761).
- `validateUpstreamUrl` uses it in place of the hand-written IPv4/IPv6 helpers. Numeric
  forms such as `2130706433` and `0x7f.1` were already normalised by `URL` and are
  covered by regression tests.
- Follow-ups not addressed here:
  - DNS names that resolve to private addresses are not checked.
  - Alert webhook URLs and Git repository URLs are fetched without any SSRF check
    (tracked with the alert and Git items).
- Tests: `tests/unit/ssrf.test.js` (43 cases); 6 bypass regressions added to
  `tests/integration/proxies.routes.real.test.js`.
- Verification: backend 226 passed.

### 0.9 Active health checks rejected by Caddy

- Problem: the route builder always emitted `max_fails` inside `health_checks.active`.
  That field only exists on passive checks, so Caddy rejected the whole config
  (`unknown field "max_fails"`) whenever a proxy enabled health checks. It also used the
  deprecated `path` field.
- Fix: `active: { uri, interval, timeout, fails }`. The stored and UI field names are
  unchanged: `path` → `uri`, and "Max Fails" → `fails` (consecutive failures before an
  upstream is marked unhealthy).
- API: `health_checks.path` must start with `/` and contain no spaces.
- README: Caddy's active checks are HTTP only, so the "TCP/HTTP" claims were corrected.
- Tests: `tests/unit/healthChecks.test.js` (3); contract case flipped to `test`.
- Verification: backend 229 passed; contract 19/19.

### 0.10 "weighted" load balancing policy

- Problems:
  - The README advertised a `weighted` strategy, but Caddy has no such module, so the
    config was rejected.
  - Per-upstream weights from the UI were written to `max_requests`, which is a
    per-upstream concurrency cap, not a weight. Weights therefore never affected
    distribution, and low "weights" throttled upstreams instead.
- Fix: new `caddyService.buildSelectionPolicy()`:
  - Round robin with any weight set, `weighted`, or `weighted_round_robin` →
    `{ policy: "weighted_round_robin", weights: [...] }` in upstream order. A missing or
    invalid weight counts as 1.
  - Other policies (`least_conn`, `ip_hash`, `random`, `first`) pass through and ignore
    weights.
  - `max_requests` is no longer emitted.
- API accepts `weighted_round_robin` and `weighted`; weights must be integers 1–1000.
- UI adds a "Weighted Round Robin" option and labels round robin "(weighted when weights
  are set)". README strategy lists updated.
- Tests: `tests/unit/loadBalancing.test.js` (4); contract case flipped to `test` and
  `weighted_round_robin` added to the policy matrix. No `test.failing` cases remain.
- Verification: backend 233 passed; contract 20/20; frontend lint clean.

### 0.11 Certificate subsystem (overview)

Checked against a live Caddy 2.10.2: `GET /certificates`, `DELETE /certificates/:id`,
`/acme/accounts` and `POST /load/certificates` all return 404, because they are not part
of Caddy's admin API. Most certificate features failed at runtime, and the unit tests hid
this by mocking axios. The fix is split into 0.11a–e, one commit each. The goal is
"works against a real Caddy, or fails with an honest error", not new features.

### 0.11a Certificates: parsing, key/cert match, `created_by`, ids

- Problems found besides the fake endpoints:
  - `parseCertificateInfo` called `fs.writeFileSync` on `fs.promises` and an `execSync`
    that was never imported. It always threw, and the catch silently recorded issuer
    "Unknown" and a fake validity of now → +365 days for every certificate.
  - `Certificate.created_by` is NOT NULL, but upload and sync never set it, so the insert
    failed.
  - There was no check that the private key matches the certificate.
  - The service required `uuid`, which is not a declared dependency.
  - Upload and generate responses returned the stored (encrypted) private key.
  - `GET /certificates/domains/:domain` returned full rows, including decrypted private
    keys, to any authenticated user. It was hidden only because that route always
    failed earlier on the fake sync endpoint.
- New `backend/src/utils/certificates.js` (Node `crypto.X509Certificate`, no openssl CLI):
  - `parsePemCertificate()`: issuer, subject, validity, DNS SANs, fingerprint.
  - `assertKeyMatchesCertificate()`.
  - `resolveCertificateDomains()`: domains default to the certificate SANs; requested
    domains must be covered (single-label wildcard matching).
  - `toCertificateResponse()` strips `private_key_pem`.
  - `CertificateError` maps to HTTP 400.
- Service: upload and generate use the parser, record `created_by`, use
  `crypto.randomUUID()`, and validate input before touching disk. Generate always
  cleans up its temp directory. `parseCertificateInfo` was removed.
- Routes: pass `req.user.id`; `domains` is optional on upload; `CertificateError` → 400;
  every certificate response is sanitized.
- Model and migration `20261013-certificates-created-by-nullable.js`: `created_by` is
  nullable, for rows created by sync rather than by a user.
- Test fixtures: `tests/fixtures/certs/` (test-only EC P-256 pair plus an unrelated key).
- Tests: `tests/unit/certificateUtils.test.js` (9). In `certificateService.real.test.js`,
  the test that asserted the silent fallback was replaced with upload tests (real
  metadata stored; a mismatched key is rejected before Caddy or the database is touched).
- Still broken after this item: loading into Caddy (0.11b).
- Verification: backend 243 passed.

### 0.11b Certificates: load custom certs via `apps.tls.certificates.load_pem`

- Problems:
  - Uploaded and self-signed certificates were pushed to `POST /load/certificates`, which
    does not exist, so no custom certificate ever reached Caddy.
  - `gitService.exportConfigToFile` called `caddyService.getCaddyConfig()`, which did not
    exist either. Every Git export, and therefore every auto-commit, threw.
- New `backend/src/utils/caddyTls.js` (pure, non-mutating):
  - `withCustomCertificates(config, certs)` replaces the `load_pem` entries tagged
    `caddymanager` with the given certificates and keeps foreign entries.
  - `withoutCustomCertificates(config)` removes them, private keys included.
- `caddyService`:
  - `loadConfig()` merges every stored uploaded or self-signed certificate (not revoked)
    into each config it pushes. Certificates survive rebuilds, startup from the backup
    file, and backup restore without any path needing to remember them.
  - `backupConfig()` (plaintext `caddy_config_backup.json`), `includeInBackup()` and
    the new `getCaddyConfig()` (used by the Git export) strip managed certificates, so
    private keys never land on disk or in Git.
  - New `loadCustomCertificates()` and `syncCustomCertificates()` (read-modify-write
    under the existing config mutex).
- `certificateService`:
  - Upload and generate store the row first, then `activateCertificate()` syncs Caddy. If
    Caddy rejects the config, the row is removed again and the error is reported.
  - Delete removes the row, then syncs.
  - The fake `loadCertificateIntoCaddy` and its `DELETE /certificates/:id` call are gone.
- Runtime check (live `caddy:2.10.2`, fixture certificate via `load_pem`, HTTPS route for
  `app.example.com`): the response is 200 with the fixture certificate (CN
  `app.example.com`, expires 2126), and there are no ACME attempts. Caddy logs "skipping
  automatic certificate management because one or more matching certificates are already
  loaded".
- Tests:
  - New: `tests/unit/caddyTls.test.js` (6) and `tests/unit/caddyService.certificates.test.js`
    (5: merged on load; only uploaded/self-signed queried; no keys in the backup file,
    backup archive or Git export; sync re-pushes).
  - New contract case with the real fixture PEM.
  - Five `caddyService` test files gained a `Certificate` model mock.
- Verification: backend 254 passed; contract 21/21.

### 0.11c Certificates: self-signed generation needs `openssl` in the image

- Problem: `generateSelfSignedCertificate` shells out to the `openssl` CLI (with
  `execFileSync`), but `node:24-slim` (and the earlier `node:20-slim`) does not include it,
  so generation always failed in the shipped container. CI and dev machines have openssl,
  which hid the gap.
- Fix: `backend/Dockerfile` installs `openssl` (`--no-install-recommends`, apt lists
  removed).
- Verification: built the image and ran the real `generateSelfSignedCertificate` inside it
  (in-memory SQLite, Caddy push stubbed). Result: type `self-signed`, both SANs, 30-day
  validity, PEM produced.

### 0.11d Certificates: sync / renew / per-domain lookup without fake endpoints

- Problems:
  - `syncCertificates` read `GET /certificates`, which does not exist.
    `GET /certificates/domains/:domain` called sync first, so it always failed with 500.
  - Renew sent `DELETE /certificates/:id`, which does not exist, and was only allowed
    for ACME certificates, which Caddy renews on its own anyway.
  - Domain lookup used `LIKE %domain%`, so `app.example.com` also matched
    `myapp.example.com`.
- Changes:
  - `syncCertificates()` probes active ACME/Cloudflare proxy domains over TLS, using the
    existing `verifyTlsForDomains`, which now also reports `issuer`. Wildcards are skipped.
    Results are upserted as "observed" ACME rows (`caddy_cert_id = observed:<domain>`);
    rows for domains no longer proxied are marked `revoked`. Per-domain probe failures are
    returned instead of aborting the sync. It is not wired to a schedule yet; the alerts
    item uses it to refresh expiry data.
  - `getCertificatesForDomain()` reads stored data only and matches domains exactly.
  - `renewCertificate()`:
    - ACME → 400 "Caddy renews ACME certificates automatically…".
    - Uploaded → 400 "upload a replacement".
    - Self-signed → regenerated in place with the same domains and validity period,
      then Caddy is synced.
  - Self-signed generation is split into `validateSelfSignedInput()` and
    `createSelfSignedPem()` for reuse by renew. The renew route maps `CertificateError`
    to 400. The fake `getCertificatesFromCaddy` was removed.
- Tests: in `certificateService.real.test.js`, the test of the fake endpoint was replaced
  with sync (upsert, revoke, failures reported, wildcards skipped, no axios), exact domain
  lookup, and renew for all three types.
- Verification: backend 258 passed.

### 0.11e Certificates: ACME CAs and CA trust without fake endpoints

- Problems:
  - Adding an ACME CA called `POST /acme/accounts`, which does not exist, so it always
    failed.
  - `POST /cas` also required a certificate file, which the UI never sends for ACME CAs.
  - Trusting a custom CA patched `root_ca_pool` into Caddy's TLS app. That field does
    not exist, so Caddy rejected it (and a missing TLS app caused a TypeError).
  - The `/certificates/acme/accounts` routes proxied to non-existent endpoints.
- Changes:
  - CAs are stored as database records only. Type must be `acme` or `custom`. ACME CAs
    need an `https` directory URL. Custom CAs need a parseable PEM file, and the file is
    only required for custom CAs. Trust toggling and delete are database-only.
    `CertificateError` → 400.
  - The ACME account routes return 501 with an explanation, because Caddy creates ACME
    accounts itself from issuer config.
  - All fake admin-API helpers were removed (`registerACMEAccount`, `getACMEAccounts`,
    `addACMEAccount`, `deleteACMEAccount`, `trustCACertificate`, `untrustCACertificate`),
    along with the unused axios import.
- Known limitation and follow-up: CA records are not applied to Caddy yet.
  - An ACME CA could become an `acme` issuer (`ca` and `email`) in the automation policy
    for ACME proxies.
  - Trusted custom CAs should be applied per proxy on the upstream TLS transport.
    Applying them globally is not safe, because a custom root pool would replace the
    system roots for public upstreams.
- Verification: backend 258 passed.

### 0.12 `ssl_type` enum lacks `cloudflare` (Postgres)

- Problem: `Proxies.ssl_type` was `ENUM('acme','custom','none')`, while `cloudflare` is
  used throughout (UI, route builder, discovery labels). SQLite does not enforce ENUMs,
  so this only broke on PostgreSQL, the recommended production database: saving a
  Cloudflare proxy failed with `invalid input value for enum`. The API did not validate
  `ssl_type` at all, and the TLS recheck route rejected Cloudflare proxies.
- Changes:
  - Model enum is now `acme | cloudflare | custom | none`.
  - Migration `20261014-add-cloudflare-ssl-type.js` runs
    `ALTER TYPE "enum_Proxies_ssl_type" ADD VALUE IF NOT EXISTS 'cloudflare'` on
    PostgreSQL. It is a no-op on SQLite and idempotent.
  - API rejects unknown `ssl_type` values with 400.
  - `POST /proxies/:id/recheck-tls` accepts Cloudflare proxies.
- Verification on PostgreSQL 16 (throwaway container, old schema recreated): the insert
  is rejected before the migration and succeeds after it; running the migration twice
  is harmless.
- Tests: two cases added to `tests/integration/basicAuth.proxies.test.js` (create a
  Cloudflare proxy; reject an unknown type). Backend 260 passed.

### 0.13 Access log never written, and not shared between Caddy and backend

- Problems, found by running the real setup:
  1. The logging config included `http.log.access.srv0`, but the server logs as
     `http.log.access.access` (from `default_logger_name: "access"`). No access-log entry
     was ever written, even on a single host.
  2. Caddy wrote the file inside the caddy container, where no volume is shared with the
     backend, so the Access Log Viewer read a file that was never there.
  3. Caddy creates log files with mode 0600 and the backend runs as `node`, so even a
     shared file would have been unreadable.
- Changes:
  - `ensureAccessLogging` derives the include filter from the logger name and sets the
    file writer `mode: "0644"`.
  - All three compose files add a `caddy_access_logs` volume (read-write in Caddy,
    read-only in the backend) at `/var/log/caddy`, and set
    `CADDY_ACCESS_LOG=/var/log/caddy/access.log` for the backend. The backend writes that
    path into the Caddy config and reads it back.
  - README documents the shared-volume requirement.
- Runtime check (two containers, one named volume): Caddy with the generated logging config
  served a request, and the backend image, running as `node`, read the matching line
  from the shared file (mode `-rw-r--r--`). Before the include fix the file stayed empty.
- Tests: `tests/unit/accessLogging.test.js` (2); the contract suite validates the `mode`
  field (21/21). `docker compose config` renders all three files. Backend 262 passed.
- Found while here, logged as 0.17: the dev and prod compose files mount `./Caddyfile`,
  which does not exist (the file is `caddy/Caddyfile`).

### 0.14 Cloudflare DNS policy scope

- Problem: `ensureCloudflarePolicy` added domains whenever `CF_API_TOKEN` was set in the
  backend environment, even for plain ACME proxies:
  - `addProxy` and `updateProxy` called it for every ACME proxy.
  - `rebuildConfigFromDatabase` passed every proxy's domains.
  - Subjects were only ever merged, never removed (including on delete).

  With a Cloudflare token configured, every ACME domain was silently switched to the
  DNS-01 challenge and stayed there after its proxy changed type or was deleted.
- Fix: replaced it with `setCloudflarePolicy(config, domains)`, which sets the single
  DNS-01 policy's subjects to exactly the given domains, removes the policy when the list
  is empty, and leaves other automation policies alone. New `cloudflareDomains()` reads
  the domains of active Cloudflare proxies from the database. Rebuild, add, update and
  delete all recompute the policy from that list. The backend no longer needs
  `CF_API_TOKEN` itself, because Caddy resolves `{env.CF_API_TOKEN}` from its own
  environment.
- Tests:
  - New `tests/unit/cloudflarePolicy.test.js` (5).
  - `caddyService.loadPayload` asserted the bug (a plain ACME proxy expected in the DNS-01
    policy); it now asserts that only Cloudflare domains are covered.
  - `tokenRemovalAndNonCloudflare` was rewritten (switching to ACME removes the domain; no
    policy for non-Cloudflare proxies even with a token set).
  - Removed `policyDedup` and `cloudflare` tests, which tested the old merge semantics;
    the `test:regression` script now points at the new file.
- Verification: backend 263 passed; contract 21/21 (Cloudflare case on the plugin image).

### 0.15 Database and Caddy drift on failed proxy changes

- Problem:
  - Create and update commit the transaction, then call Caddy. When Caddy rejected the
    change, the `catch` called `rollback()` on the finished transaction, which threw
    again. The client got a 500 and the row stayed in the database without a matching
    Caddy route.
  - Retrying a failed create then returned 400 "already exists".
  - A rejected update left the database describing a config Caddy was not running, and
    the next full rebuild would push it.
  - Delete: the route deletes the row and passes `proxy.toJSON()` to
    `caddyService.deleteProxy`, which called `proxy.destroy()` again on that plain
    object. The resulting TypeError skipped the Cloudflare policy cleanup after the
    route removal.
  - `addProxy` and `updateProxy` failed when writing the local config backup failed,
    even though Caddy had already applied the change.
- Fix:
  - New `src/services/proxyCompensation.js`. If Caddy rejects a create, `discardProxy`
    removes the new proxy with its headers and middlewares. If Caddy rejects an update,
    `restoreProxy` writes back the snapshot taken before the update (row, headers,
    middlewares). Caddy's `/load` is atomic, so its config is unchanged in that case.
  - Both cases answer 502 with Caddy's error; the form already shows `message`.
  - The `catch` blocks only roll back unfinished transactions.
  - `deleteProxy` no longer touches the database.
  - The post-change backup is best-effort (`backupAfterChange`).
- Review follow-up (code review and background security review of the first commit):
  - `restoreProxy` no longer writes back `caddy_route_index`, `tls_status` or
    `tls_checked_at`. A concurrent delete may have shifted the index since the snapshot.
  - The restore only applies while the row's `updatedAt` still matches the value the
    failed update committed, so an edit made in the meantime is not overwritten. In
    that case the 502 says the previous version could not be restored.
  - A failing compensation step (`tryCompensation`) no longer turns the 502 into a
    generic 500. The response keeps Caddy's error and says what needs manual cleanup.
  - `addProxy` takes the new route's index from the routes it already read (appending
    under the config mutex). If a later step fails, it deletes that route, so a
    discarded proxy never stays live in Caddy.
- Tests:
  - New `tests/integration/proxies.caddyFailure.test.js` (6): create and update
    rollbacks, retry after a failed create, a failed cleanup, a concurrent edit during
    the Caddy call, and the delete hand-off.
  - `caddyService.real`: the delete test asserted the double destroy; it is replaced by
    index-shift and DNS-01 cleanup tests. Added tests for a failed backup, and for
    `addProxy` removing its posted route (and not deleting anything when the POST
    itself failed).
- Verification: backend 273 passed, 21 skipped (contract, no local Caddy); the
  compensation tests also pass 6/6 against PostgreSQL 16.
- Found while here, logged as 0.18: `caddyService.updateCaddyConfig()` does not exist,
  but GitOps sync (`gitService`), Docker discovery (3 calls) and the discovery delete
  route call it. Proxies created or removed by those paths never reach Caddy, and the
  TypeError is swallowed or turned into a 500.

### 0.17 Prod compose Caddyfile mount

- Problem: `docker-compose.prod.yml` bind-mounted `./Caddyfile`, which does not exist
  (the file is `caddy/Caddyfile`; the dev compose file already used that path). Docker
  creates a missing bind source as an empty directory, so Caddy failed at startup
  reading `/etc/caddy/Caddyfile`.
- Fix: mount `./caddy/Caddyfile`.
- Verification: `docker compose -f docker-compose.prod.yml config` resolves the source to
  the existing file, and `caddy adapt` on it succeeds in the project Caddy image.

### 0.18 GitOps sync and Docker discovery never reached Caddy

- Problem: five call sites used `caddyService.updateCaddyConfig()`, which does not
  exist: `gitService.syncFromGit`, Docker discovery (container update, container stop,
  reconcile) and `DELETE /api/discovery/:id?deleteProxy=true`.
  - Each threw a TypeError after the database change. Discovery logged and swallowed
    it.
  - Git sync then called `rollback()` on its committed transaction, which threw again
    and replaced the error.
  - The discovery route answered 500 after deleting the proxy.
  - Result: proxies synced from Git, or changed or removed by discovery, stayed out of
    Caddy (or stayed live in it) until the next restart.
- Fix:
  - The callers use `rebuildConfigFromDatabase()`, the full DB-to-Caddy sync. It now
    holds the config mutex, so it cannot interleave with add, update or delete.
  - The rebuild clears `caddy_route_index` on proxies it leaves out (disabled, or a
    duplicate of another proxy's domains). Before, they kept a stale index, and their
    next update overwrote whichever route now sat there.
  - Git sync only rolls back unfinished transactions. If the Caddy step fails,
    `last_commit_sha` is not advanced, so the next sync retries that commit.
- Tests:
  - New `tests/unit/caddyService.callers.test.js` scans `src/` for every
    `caddyService.<method>(` call and asserts the method exists (17 call sites). It
    caught all five broken calls.
  - New `tests/unit/gitService.sync.test.js` (2): a sync pushes to Caddy; a Caddy
    failure surfaces its own error without a rollback and does not advance the commit.
  - Added a rebuild test that clears the index of a disabled proxy.
- Verification: backend 293 passed, 21 skipped.

### 0.16 Validate proxies from GitOps sync, backup restore and discovery

- Problem: only `POST/PUT /api/proxies` validated proxies. Since 0.18 the import paths
  reach Caddy, and the background security review flagged both of these:
  - **GitOps sync** passed every field of `config/proxies.json` to `Proxy.create`:
    restricted upstreams such as `169.254.169.254`, forged `id`/`created_by`,
    unchecked basic-auth hashes. Anyone who can push to the repository controls these.
  - **Docker discovery** took domain, port and SSL type from container labels without
    checks. New labels on an existing proxy rewrote its domain and upstream and pushed
    them live, even for a proxy an admin had approved. Anyone who can label a container
    could retarget it.
  - **Backup restore** copied 7 fields and dropped the rest (basic auth, load balancing,
    health checks, path routing, ...). It applied nothing to Caddy, and a bad file
    answered 500.
- Fix:
  - The API's validators moved unchanged from `api/proxies/routes.js` to
    `utils/proxyValidation.js`.
  - New `utils/proxyImport.js` (`prepareImportedProxies`) runs `validateProxyInput` on
    every entry and keeps only the API's whitelisted fields (proxy, header and
    middleware fields). Basic auth takes an exported bcrypt hash only if it is
    well-formed; a plaintext password written by hand is hashed. All invalid entries
    are reported together (`ProxyImportError`).
  - Git sync and backup restore call it before deleting anything, so a bad repository
    or file changes nothing. Both routes answer 400 with the list of invalid entries.
  - Backup restore now keeps every API field and runs `rebuildConfigFromDatabase` after
    the commit. A Caddy failure is reported in `result.caddy` and the response message;
    the restore itself stands.
  - Discovery checks label values (domain, port 1–65535, SSL type). The private-address
    rule does not apply, because the host comes from Docker (container name or network
    IP). A label change to an active proxy's domain or upstream sets it to `disabled`
    for admin review, as newly discovered proxies already are.
- Tests:
  - `proxyImport` (11).
  - `gitService.sync` (+2: invalid entry refuses the sync before deleting; whitelist).
  - New `backupRestore.validation` integration test (3): full round-trip incl. basic
    auth, load balancing, health checks and headers; tampered file refused; Caddy
    failure reported.
  - `dockerDiscovery.validation` (8).
  - `importRoutes.errors` (3).
- Verification: backend 321 passed, 21 skipped.
- Review follow-up (code review of the first commit):
  - An import is refused when two entries share a domain, as the API refuses a domain
    another proxy already serves.
  - `basic_auth: null` is refused, as in the API.
  - The review also noted that `validateMiddlewaresConfig` checks fields
    (`type`, `requests_per_second`) that stored middlewares do not have. Caddy route
    building never reads Middleware rows, so this has no effect on Caddy. Logged under
    0.29 (middlewares stored but never applied) instead of validating dead data.
  - Verification: backend 323 passed, 21 skipped.
- Found while here (added to the discovery and Git fix tier):
  - Discovery reads `container.State.Running`, but the list API returns `State` as a
    string, so every discovered service is recorded as `stopped`.
  - `websocket_enabled` is not a Proxy column, so the label is silently dropped.
  - The Git export commits each proxy's basic-auth bcrypt hash to the repository.

### 0.19 API key permissions and owner

- Problem:
  - `authMiddleware` turned an API key into `{ id: created_by, role }`, taking the role
    from the key's scope alone. The owner was never loaded, so a key kept working after
    its owner was locked, deleted or demoted. An `admin` key created by an admin stayed
    admin for good.
  - A `write` key got role `user`, which does not exist (the User enum is `admin`,
    `read-only`). Every mutating route requires `admin`, so `write` keys could not
    write anything. The UI and README document `write` as GET + POST + PUT.
  - Scopes were only checked where a route called `requireApiKeyPermission` (5
    routes). A `read` key of an admin passed every other admin-only mutation.
  - The API key routes and user management had no scope check: a `write` key could
    create new keys or manage users.
  - Deleting a user who owns API keys failed with 500: `api_keys.created_by` is NOT NULL
    with a foreign key to users.
- Fix:
  - A key authenticates as its owner, with the owner's current role. Owner missing or
    not `active` → 401.
  - `authMiddleware` enforces the key's scope by HTTP method on every route:
    GET/HEAD/OPTIONS need `read`, POST/PUT/PATCH need `write`, DELETE (and anything
    else) needs `admin`. Scopes are cumulative.
  - `requireApiKeyPermission` uses the same scope order.
  - User and API key management require the `admin` scope. Proxy create and update
    require `write`, as documented; delete keeps `admin`.
  - Deleting a user deletes their API keys in the same transaction.
- Tests:
  - New `tests/integration/apiKeyAuth.test.js` (19, real middleware and SQLite): the
    scope × method matrix; user and key management need `admin`; the key acts as its
    owner; a read-only owner caps an admin key; demotion applies at once; locked owner;
    deleting an owner removes the keys.
  - The users and keys route tests were updated for the new imports.
- Verification: backend 342 passed, 21 skipped (49 suites passed, 1 skipped).

## Where this session stopped (usage limit)

Done: 0.1–0.10 and 0.11a–e. Next up, in order:

1. 0.12 `ssl_type` enum lacks `cloudflare` (Postgres migration).
2. 0.13 Shared access-log volume in docker-compose.
3. 0.14 Cloudflare policy scope.
4. 0.15 Proxy create/update DB-before-Caddy ordering.
5. 0.16 Validate upstreams for GitOps, restore and discovery imports.
6. Remaining-fix tier from the review: alerts (stubs, stale `tls_status`, schedule
   `syncCertificates`), API-key scopes and owner status, Git rollback and token in
   `.git/config`, discovery labels, cluster-mode schedulers, CI test gaps, README
   cleanup, and major upgrades (`simple-git` 4, `sqlite3` 6, `nodemailer` 10,
   `dockerode` 5).
7. TypeScript phases 1–5.
