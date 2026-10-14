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
| 0.20 | Alerts: `error_rate` / `no_traffic` stubs, stale `tls_status`, certificate sync never scheduled | done |
| 0.21 | Alert webhooks: SSRF | done |
| 0.22 | Git: rollback to a commit | done |
| 0.23a | Git: backend image has no `git` binary or CA certificates | done |
| 0.23b | Git: token stored in `.git/config`, GitLab token URL format, password hashes in the export | done |
| 0.24 | Discovery: labels, names, events, template crash, unused labels | done |
| 0.25 | Cluster mode: schedulers run in every instance | done |
| 0.26 | CI: no coverage threshold, no Postgres or Playwright job | done |
| 0.27 | README references missing files | done |
| 0.28 | Major upgrades: `dockerode` 5 (done), `nodemailer` 10, `sqlite3` 6, `simple-git` 4 | in progress |
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
  - Discovery was suspected of misreading `State`. Checked against a real Docker
    daemon in 0.24: inspect returns `State` as an object, so `State.Running` was
    right. The real bugs are listed under 0.24.
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
- Review follow-up (security review of the first commit):
  - Account security refuses API keys: `/auth/2fa/*` answers 403 to any key. A
    `write` key could otherwise call `/2fa/setup` + `/2fa/verify` for its owner,
    replace the TOTP secret and lock the owner out. This was open before 0.19.
  - Administration areas need the `admin` scope for every method: users, keys,
    backups, alerts, Git and audit. `write` keys reached some of their POST/PUT routes
    (create backup, alert tests, Git sync) through the method rule. This is enforced in
    `authMiddleware` from the router mount path (`/api` and `/api/v1`), so new routes in
    those areas are covered without per-route checks.
  - Proxy create/update requiring `write` (no longer `admin`) is intentional: it is the
    documented meaning of `write` ("create/update"), and the role check still requires
    the owner to be an admin.
  - Last-admin guard: demoting, locking or deleting the last *active* admin is
    refused. Locked admins no longer count. The check runs in the change's transaction
    with the admin rows locked, so concurrent requests cannot both pass. Admins cannot
    lock their own account.
  - Tests: `apiKeyAuth` +7 (admin areas, 2FA); new `users.lastAdmin` (5).
  - Verification: backend 354 passed, 21 skipped. Both files also pass against
    PostgreSQL 16.
- Second follow-up (background security review of the first follow-up):
  - The area check parsed `req.baseUrl`. Express matches routes case-insensitively:
    `POST /api/USERS` reaches the users router with `req.baseUrl` `/api/USERS`, so a
    `write` key bypassed the admin-scope rule. Verified against Express.
  - Areas are now marked by mounting `adminScopeArea` / `noApiKeyArea` in front of the
    router, so Express's own routing decides what is inside an area. No path
    parsing is left.
  - The API router moved from `app.js` to `src/api/index.js` (`buildApiRouter`), the
    single place listing the areas. The tests mount that same router.
  - Tests: `apiKeyAuth` +6 (case and prefix variants for admin areas and 2FA, on the
    real API router).

### 0.20 Alerts evaluate real data

- Problem:
  - `error_rate` and `no_traffic` rules could be created in the UI but always returned
    "not triggered".
  - `cert_expiry` read `proxy.tls_status`, which is only written when a proxy is saved
    or rechecked by hand, so expiry warnings were based on data of any age.
  - `upstream_down` fired when that same stale TLS check of the proxy's own domain had
    failed, which says nothing about the upstream.
  - Alerts also ran for disabled proxies, which are not in Caddy.
  - `certificateService.syncCertificates` existed but was never scheduled.
- Fix:
  - New `services/trafficStats.js` counts requests and 5xx per host from the access
    log (shared with the backend since 0.13). Hosts are normalised (case, port).
  - `error_rate`: share of 5xx over the last 15 minutes, at least 20 requests;
    `threshold` = percent, default 5.
  - `no_traffic`: no request to any of the proxy's domains for `threshold` minutes
    (default 60). Only when the log covers the whole window (not new or rotated) and
    the proxy is older than the window.
  - `upstream_down`: new `utils/upstreamProbe.js` opens a TCP connection to every
    upstream (main, load-balanced, path-routed) and reports the ones that refuse or
    time out.
  - `cert_expiry` refreshes a TLS status older than 6 hours before judging it and
    skips proxies without TLS.
  - Only active proxies are evaluated. The log is read once per window per run.
    Messages describe each condition.
  - `scheduleCertificateSync(6)` runs the sync a minute after startup and every 6
    hours.
- Tests:
  - New `trafficStats` (3), `upstreamProbe` (3, real TCP server and a closed port),
    `alertService.conditions` (10, every condition incl. quiet cases),
    `certificateService.schedule` (1, fake timers, survives a failed run).
- Verification:
  - Backend 378 passed, 21 skipped.
  - Live check: a Caddy 2.10.2 using CaddyManager's access-log config served 30× 200
    for one host and 30× 502 for another. `trafficStats` read 30/0 and 30/30 from the
    real log; `error_rate` fired for the failing host (100%) and stayed quiet for the
    other.
- Review note (background security review): it flagged the TCP probe as SSRF. Kept as
  is:
  - The probe only connects to upstreams of active proxies. Those are admin-created and
    pass the SSRF rule on save, and Caddy already proxies to them on the same compose
    network.
  - It only learns reachable or not, reported to admin channels. An admin can already
    have Caddy fetch full content from those hosts.
  - Discovered proxies start disabled and are not probed.

### 0.21 Alert channels: SSRF and secret exposure

- Problem:
  - Slack, Discord and webhook channels stored any URL and posted to it with
    redirects followed. Any configured URL was requested by the backend, including
    cloud metadata (`169.254.169.254`), the Caddy admin API (`localhost:2019`) and
    internal services. The "test" button made this an on-demand request.
  - Webhooks accepted any HTTP method and headers, including `Host`.
  - `GET /alerts/channels` (any logged-in user) redacted only `webhook_url`: webhook
    `url` and header values (typically `Authorization`) were visible to read-only
    users.
- Fix:
  - New `utils/outboundRequest.js` (`sendOutbound`) checks the URL (http/https, no
    restricted IP literal) and resolves names through `guardedLookup`. The lookup
    refuses any restricted address at connection time, so a DNS answer cannot be
    swapped after the check. Redirects are not followed; 10 s timeout.
  - `ALERT_WEBHOOK_ALLOW_PRIVATE=true` (documented in `.env.example`) allows private
    ranges for internal receivers. Loopback and link-local stay blocked.
  - New `utils/notificationChannels.js` validates per type: email needs valid
    addresses; Slack/Discord an https `webhook_url`; webhook a safe `url`, method
    POST/PUT/PATCH, header names without `Host`/`Content-Length`/... and single-line
    values.
  - Create and update validate; update validates the merged channel. `***`
    placeholders from the redacted list keep the stored secret, so editing in the UI
    still works.
  - The list and create/update responses redact URLs and header values; header names
    stay visible.
  - `sendToChannel` re-validates stored channels (created before this change) before
    sending.
- Tests:
  - New `outboundRequest` (13: URL rules, the private-range switch, lookup guard,
    no redirects).
  - New `alertChannels.validation` integration (12: per-type rejections,
    merged-update validation, redaction, keeping secrets on edit, legacy channel
    refused at send).
- Verification:
  - Backend 403 passed, 21 skipped.
  - Live DNS check: `localtest.me` (public name resolving to `127.0.0.1`/`::1`) is
    refused by the guard inside axios's real request path.
- Review follow-up (background security review):
  - Problem: the `***` placeholder let an admin keep the stored `Authorization`
    header while pointing the webhook at a new URL, sending another admin's secret to
    a server of their choice.
  - Fix: stored header values are only kept while the URL and channel type stay the
    same; otherwise the values must be re-entered (400).
  - Test: +1 in `alertChannels.validation`.

### 0.22 GitOps rollback

- Problem:
  - `rollbackToCommit` checked out the target commit and then called `syncFromGit`.
    That pulled the branch again (`git pull origin <branch>`), so the config applied
    was the branch head, not the target. The rollback did nothing.
  - Even with the right config applied, the next auto-sync saw branch head ≠
    `last_commit_sha` and re-applied the head.
  - Each call left a `backup-<timestamp>` branch and the clone on a detached HEAD.
  - The SHA was passed to `git checkout` as is: `--output=/tmp/x` reached git as an
    option (the route validated the format, the service did not). A commit from
    another branch was accepted.
  - All failures answered 500.
- Fix:
  - Rollback validates the SHA, resolves it to a commit in the tracked branch's
    history (`rev-parse`, `merge-base`), and reads `config/proxies.json` at that
    commit with `git show`. Nothing is checked out.
  - The configuration is applied through `applyProxyDefinitions`, now shared with
    sync (validation and whitelist from 0.16, transaction, Caddy rebuild).
  - The rollback is recorded so auto-sync keeps it. With auto-commit, a
    "Rollback to <sha>" commit with the exported configuration is pushed, so Git and
    the database agree. Without it, the branch head is marked as seen; the next commit
    pushed to the branch is applied as usual.
  - `cloneOrUpdateRepo` checks out the tracked branch before pulling, which repairs
    clones left detached by the old rollback.
  - `getDiff` refuses refs that are not SHAs or `HEAD`.
  - Errors map to 400/404 (`GitRollbackError`), invalid configuration to 400.
- Regression found and fixed here (from the 0.16 follow-up): refusing
  `basic_auth: null` on import broke re-importing CaddyManager's own exports. Proxies
  without basic auth are exported with `null`, which affects backups and Git exports
  alike. `null` now means "not set". A backup round-trip test with a proxy without
  basic auth guards it; the earlier round-trip test only used a proxy with basic auth.
- Tests:
  - New `gitRollback` integration (5) on a real local Git repository (`file://`
    remote) and SQLite: rollback applies the target and survives the next sync;
    auto-commit pushes a matching rollback commit; unknown SHA, off-branch commit and
    option-like input are refused without changes.
  - `importRoutes.errors` +1 (rollback 404 mapping).
  - `proxyImport` and `backupRestore.validation` updated for the null case.
- Verification: backend 412 passed, 21 skipped.

### 0.23a Git in the backend image

- Problem: GitOps uses `simple-git`, which runs the `git` binary. The backend image
  (`node:24-slim` + `openssl`) had neither `git` nor a CA bundle, so every GitOps call
  (test connection, sync, export, rollback) failed in Docker. HTTPS clones would also
  have failed certificate verification.
- Fix: install `git` and `ca-certificates` in `backend/Dockerfile`.
- Verification: in the rebuilt image, `git` and `/etc/ssl/certs/ca-certificates.crt`
  are present, and `gitService.testConnection` succeeds against
  `https://github.com/caddyserver/caddy.git`. Before the change the image had neither.

### 0.23b Git credentials and secrets

- Problem:
  - Clones used a URL with the access token embedded, so the token was stored in
    plain text in the clone's `.git/config` (`remote.origin.url`). It also appeared
    in the git command line and in logged error messages that include the URL.
    Pushes passed the same URL.
  - GitLab and GitHub got `<token>:x-oauth-basic`. GitLab rejects that; it expects
    `oauth2:<token>`.
  - The Git export (`config/proxies.json`) contained each proxy's basic-auth bcrypt
    hash, so anyone with read access to the repository could crack the passwords
    offline.
- Fix:
  - The token is sent per command as an `Authorization: Basic` header through git's
    environment config (`GIT_CONFIG_COUNT`/`KEY`/`VALUE` → `http.extraHeader`). It is
    not on disk, not on the command line, and not in URLs.
  - Clones and pushes use the clean repository URL (`push origin <branch>`). Clones
    made by older versions have `origin` reset to the clean URL on the next update.
  - Usernames per provider: GitHub `x-access-token`, GitLab and Gitea `oauth2`,
    Bitbucket `x-token-auth`; the token is the password.
  - git runs with an allowlisted environment (PATH, HOME, locale, CA and proxy
    settings) and `GIT_TERMINAL_PROMPT=0`. simple-git's `allowUnsafeConfigEnvCount`
    is enabled only when a token is set; the only key is the constant
    `http.extraHeader`.
  - The Git export drops `hashed_password` (and legacy `password`). A sync keeps the
    hash stored for the proxy of the same name (`prepareImportedProxies(...,
    { existingBasicAuth })`). Backups still carry hashes: they are local, optionally
    encrypted, and a restore needs them.
- Tests: new `gitCredentials` integration (9) on a real local repository:
  - the clone's `.git/config` has no token, and a legacy token URL is cleaned on
    update;
  - per-provider basic credentials, and none without a token;
  - the export has no hash, and a sync keeps the stored hash.
- Verification:
  - Backend 421 passed, 21 skipped.
  - Against a local HTTP server, `testConnection` made git send `Authorization: Basic`
    for `oauth2:<token>` on its first request; the logged command and the error
    contain no token.

### 0.24 Docker discovery

- Problem (found by running discovery against a real Docker daemon, API 1.55):
  - Labels: `docker inspect` has them under `Config.Labels`, with no top-level
    `Labels`. `parseContainerLabels` read the top level, so it returned null for
    every container and discovery never found anything. The `labels` stored on a
    DiscoveredService were undefined too.
  - Names: inspect has `Name` (`/web`), not `Names`, so the upstream host and the
    proxy name fell back to the short container ID.
  - Events: they carry `Action` and `Actor.ID`; there is no `status` or `id`.
    `handleDockerEvent` threw on `id.substr`, so start and stop events were never
    handled.
  - Template label: `templateService.applyTemplateToProxy` does not exist. The call
    threw after `Proxy.create` and before the proxy was linked, so every scan created
    another orphan proxy.
  - `path_prefix`, `rate_limit`, `ip_filter` and `security_headers` were parsed and
    ignored; `websocket_enabled` is not a Proxy column.
  - `State.Running` was correct (see the correction under 0.16).
- Fix:
  - New `utils/discoveryLabels.js`: `labelsOf` (Config.Labels, then Labels),
    `containerNameOf` (Name, then Names[0], then the short ID), label validation and
    the label → proxy field mapping.
  - Events are read through `Action`/`Actor.ID`, falling back to `status`/`id`.
  - A template label copies the template's headers onto the proxy. The proxy is linked
    to its DiscoveredService before headers are added, so a failure there cannot
    leave an orphan that the next scan duplicates.
  - Labels now take effect:
    - `security_headers=true` → `security_headers_enabled` plus the default headers.
    - `rate_limit=<n>` → `rate_limit` (whole number, 1–100000 requests per second).
    - `ip_filter=<ip|cidr,...>` → allow-list `ip_filtering` (1–10 entries, each a
      valid IP or CIDR).
    - `path_prefix=/api` → `path_routing` for `/api` and `/api/*` only.
    - Invalid values skip the container with a warning, as for domain and port.
  - Labels are untrusted input, so a label change on an `active` proxy that alters
    the domain, upstream, rate limit, IP filter, path routing or security headers sets
    it to `disabled` for admin review (before, only domain and upstream did). A
    removed label removes the feature.
  - The `websocket` label is dropped: Caddy's reverse_proxy passes WebSocket upgrades
    through.
  - `createOrUpdateProxy` is split into `updateLinkedProxy`, `createDisabledProxy`
    and `applyTemplateHeaders`.
  - The callers guard now covers every `<name>Service.<method>(` call against
    `src/services/<name>Service.js` (`services.callers.test.js`, replacing the
    caddyService-only one). It would have caught `applyTemplateToProxy`.
- Tests: new `dockerDiscovery.inspect` unit (10) with inspect-shaped and
  event-shaped fixtures: labels, name, feature mapping, invalid values, template,
  review on a removed access label, start and stop events.
- Verification:
  - Backend 59 suites passed, 1 skipped; 471 tests passed, 21 skipped.
  - Against the real daemon, a started container's real event, inspected by
    `handleDockerEvent`, reached `createOrUpdateProxy` with its domain and upstream
    `http://<name>:8080`.

#### 0.24b Review follow-up

A security review of 0.24 found no way for container labels to reach Caddy unvalidated
or to change an active proxy's access controls without review (labels are immutable
per container, and a recreated container gets a new Id and a new DISABLED proxy). It
did find these defects, now fixed:

- **A restart wiped admin settings.** An absent label meant "remove the feature", so a
  container or backend restart reset the IP filter, rate limit, security headers and
  compression an admin had set in the UI, and disabled the proxy. Now a rescan changes
  a field only when the labels changed since the last scan (the previous labels are
  the stored `DiscoveredService.labels`) and the proxy still holds what they set; a
  value the admin changed is kept (`featureUpdates`). Unchanged labels touch nothing
  and do not rebuild Caddy.
- **`path_prefix` with `security_headers` or `template` did nothing** (the Caddy
  builder only attaches headers to the default handler). The combination is refused
  with a warning instead of showing "headers enabled" while none are served.
- **Path routing answered unmatched paths with an empty 200.** The builder now ends
  the subroute with a 404 `static_response` (checked with `caddy validate`, 21
  contract tests).
- `path_prefix` with `..` or `//` and IPv6 zone IDs (`fe80::1%eth0`) in `ip_filter`
  are refused: Caddy rejects the zoned form, and one bad entry would break the whole
  config on rebuild.
- **`reconcileServices` removed live containers' proxies about 15 minutes after
  start**, because `last_seen` is only refreshed by a scan or start event. It now
  asks Docker which containers run, refreshes those, removes only the missing ones,
  and removes nothing if Docker cannot be listed.

Left open (low risk, not label-reachable):

- The Caddy builder keeps only the first 10 `ip_filtering.ip_list` entries; for a
  UI/API `deny` list longer than that, the rest are silently not blocked. (Labels
  are limited to 10.) The model comment also says `block` where the builder knows
  `deny`. To fix together with the 0.29 middleware work.
- The `domain` label accepts wildcards and is not checked for a duplicate of an active
  domain; new proxies are DISABLED, so an admin sees both in review.
- A template is found by exact name (`authelia` does not match `Authelia` on a
  case-sensitive database); template rows are copied without header validation; the
  template's `middleware` is ignored.
- Discovered services store all container labels; check the API does not expose them
  before showing them in the UI.

### 0.25 Cluster mode: one leader runs the background work

- Problem: `CLUSTER_MODE=true` forked N workers that all ran `index.js` in full. Each
  one ran the migrations, the backup, metrics, alert and certificate schedulers, Docker
  discovery (so every container event was handled N times) and the Git init with
  auto-sync. Alerts and notifications were sent N times. Without `GIT_SECRET_KEY`
  (development only) each worker also had its own random key and could not decrypt
  the Git tokens another worker had stored.
- Fix:
  - `utils/clusterRole.js`: `isLeader()` is false only for a worker the primary started
    with `CLUSTER_ROLE=follower`. (A first version also required the leader role in
    cluster mode; a review showed that `CLUSTER_MODE=true` left in a shared `.env`
    with `node src/index.js` would then have no leader at all.)
  - `index.js`: the one-time and background work moved into `runLeaderTasks()`, which
    only the leader runs. Other workers validate the environment and serve requests.
    After `startServer()` the process sends `{ type: 'ready' }` to the primary.
  - `clusterSupervisor.js` (the primary): forks the leader alone, forks the followers
    when the leader reports ready (so they never meet an unmigrated database),
    replaces a dead follower with a follower and a dead leader with a new leader, and
    stops forking on SIGTERM/SIGINT (a pending respawn or a late "ready" forks
    nothing after that). `cluster.js` forwards the signal to the workers and exits
    after 20 s if one hangs.
  - A leader that dies before it is ready is retried after 1 s, 2 s, 4 s … (max 30 s);
    after 8 failures in a row the primary exits with an error instead of crash-looping.
  - Outside production the primary creates one `GIT_SECRET_KEY` for all workers when
    none is set. Production still refuses to start without it.
- Not fixed (documented in `cluster.js`):
  - The Caddy config mutex is per process. Writes made through different workers at the
    same moment are not serialized, so route indices can race. A fix needs a lock
    shared across processes (database or file). Until then `CLUSTER_WORKERS=1`, or one
    instance behind a load balancer, is the safe setting for heavy writers.
  - A Git repository created or edited through a follower starts its auto-sync timer in
    that follower (`startAutoSync`; the timer is never stopped, also in a single
    process); only the leader starts timers at boot.
  - Docker discovery runs only in the leader, so `GET /discovery/status` and manual
    container sync answer "not initialized" when a follower handles the request.
    Fixing both needs the leader to own the work (IPC) or the follower to initialize
    its own Docker client lazily; left for the cluster rework if clustering is kept.
- Tests: new `clusterSupervisor` unit (14) with a fake cluster: roles, start order,
  follower and leader replacement, no second follower start, retry and give-up of a
  leader that keeps dying, no forking after stop, a direct start with
  `CLUSTER_MODE=true`.
- Verification: the real `node src/cluster.js` with 3 workers, a file SQLite database
  and a real Caddy 2.10.2: one "Database synchronized", two request-only workers,
  three listening servers, `/health` 200, clean exit on SIGTERM with no respawn.

### 0.26 CI gaps

- Problem (the original review said "tests are not run"; that was out of date: since
  0.4 CI runs the backend unit, integration and Caddy contract tests):
  - The "Upload backend coverage" step uploaded a `backend/coverage/` that the unit
    and integration configs never produced, and nothing enforced a minimum.
  - Production uses PostgreSQL, but CI only ran SQLite. The Postgres-only bugs found in
    0.12 and 0.15 (enum without `cloudflare`, transactions) would not have been caught.
  - The Playwright tests in `frontend/e2e` were never run.
- Fix:
  - `backend/jest.ci.config.js` and `npm run test:ci`: the whole backend suite once,
    with coverage of `src/` and a threshold just under the measured value (statements
    53 / branches 50 / functions 55 / lines 53; measured 55.6 / 52.4 / 57.8 / 55.5).
    It is a separate config because a threshold in `jest.config.js` would fail every
    single-file run. Replaces the separate unit and integration steps; the coverage
    artifact now exists.
  - New job `backend-postgres`: PostgreSQL 16 service, the integration tests with
    `DB_TYPE=postgres` (`--runInBand`: the test files share one database).
  - New job `frontend-e2e`: installs Chromium, runs `npm run e2e` (the API is mocked,
    no backend needed), uploads the results on failure.
  - `frontend/.gitignore`: Playwright output; `.github/workflows/README.md` updated.
- Verification (run locally, the workflow itself runs on GitHub):
  - `npm run test:ci`: 60 suites passed, 1 skipped (the contract suite, which has its
    own step); 498 tests passed; exit 0. With an unreachable threshold (99%) the same
    run exits 1 with "does not meet global threshold".
  - Integration tests on PostgreSQL 16, `--runInBand`: 16 suites, 149 tests passed.
  - Playwright after `playwright install chromium`: 2 passed.
  - The workflow YAML parses (3 jobs).
- Not done: raising the coverage floor (80% is the project goal; least covered
  are `index.js` (0%), `metricsService`, `migrationService`, `logService`, `twoFactor`,
  the audit and discovery routes and `passwordReset` (6–17%)), and a job that starts
  the real stack (backend + Caddy + frontend) for end-to-end flows.

### 0.27 README references

- Problem (checked every file the README links or names against the repository):
  - `.env.prod.example` did not exist, but the production quick start starts with
    `cp .env.prod.example .env.prod`.
  - That quick start listed two required values, but `docker-compose.prod.yml` also
    consumes `CSRF_SECRET` and `GIT_SECRET_KEY` (the backend refuses to start in
    production without them) and `ENCRYPTION_KEY`, `CF_API_TOKEN`, `CORS_ORIGINS`.
    It also pointed at `http://localhost:3000`, which production does not publish.
  - The Testing section documented `test.sh`, `discovery_test.sh`,
    `git_integration_test.sh` and `metrics_test.sh`, none of which exist, and none of
    the real test commands.
  - The Documentation list linked `CLAUDE.md` and `FEATURE_IMPLEMENTATION.md`, which do
    not exist.
  - `.env.prod`, which the README tells people to create, was not in `.gitignore`.
- Fix:
  - New `.env.prod.example`: required, recommended and optional settings with how to
    generate each secret; `.env.prod` added to `.gitignore`.
  - Quick start lists the four required values and the real access points.
  - Testing section: the npm commands (unit, integration, `test:ci`, PostgreSQL,
    contract, frontend unit and Playwright) and the three scripts that exist.
  - Documentation list: only files that exist, plus the workflows README.
  - Not changed: `config/proxies.json` and `proxies.yaml` are files in the user's Git
    repository, not in this one.
- Not done: `docker-compose.prod.yml` still starts with an empty `DB_PASSWORD` or
  `JWT_SECRET` when the variables are unset (`${VAR}` instead of `${VAR:?message}`);
  the backend then stops or runs with a blank password. Failing fast in the compose
  file is a behavior change, left for the deployment pass.

### 0.28 Major upgrades (one commit per package)

Release notes read before each upgrade; each package is verified on its own.

#### 0.28a dockerode 4.0.2 → 5.0.1

- Upstream changes: dropped the `uuid` dependency, raised the minimum Node version
  (the package says >= 14.17; we run 24). Nothing in the API changed.
- Used by: `dockerDiscoveryService` only (`new Docker`, `ping`, `getEvents`,
  `listContainers`, `getContainer().inspect()`).
- Verification: the live discovery check against the real Docker daemon (API 1.55)
  still gets the start event, parses the inspect labels and reaches
  `createOrUpdateProxy`; backend 60 suites passed, 1 skipped; 498 tests passed.

## Where this session stopped

Done: 0.1–0.27. Next up, in order:

1. 0.28 Major upgrades: `simple-git` 4, `sqlite3` 6, `nodemailer` 10, `dockerode` 5.
2. 0.29 Declared but not implemented: Kubernetes discovery, backup upload,
   `custom_ssl_cert_id`, proxy middlewares.
3. TypeScript phases 1–5.
