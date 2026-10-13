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
