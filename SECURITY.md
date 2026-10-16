# Security Policy

CaddyManager sits in front of your services and holds their TLS, authentication and routing configuration, so security
reports are taken seriously.

## Supported versions

CaddyManager is in alpha. Security fixes are made for the **latest release** only; please upgrade before reporting
(`docker compose pull`, or the newest `ghcr.io/rhad00/caddymanager-*` image tag).

| Version | Supported |
| ------- | --------- |
| Latest release (see [Releases](https://github.com/rhad00/CaddyManager/releases)) | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

**Please do not open a public issue, pull request or discussion for a security problem.**

Report it privately through GitHub:
**[Report a vulnerability](https://github.com/rhad00/CaddyManager/security/advisories/new)**
(repository → *Security* → *Report a vulnerability*).

Please include, as far as you can:

- the affected version or image tag and how you run it (Docker Compose, manual install, SQLite or PostgreSQL)
- what the problem is and what an attacker gains (read or change configuration, bypass authentication, reach internal
  services, leak secrets, ...)
- steps or a proof of concept to reproduce it
- any suggested fix

Do not include real secrets, production hostnames or other people's data in the report.

### What to expect

This is a volunteer-run project, so these are targets, not guarantees:

- an acknowledgement within **7 days**
- an assessment and a plan within **14 days**
- a fix and a release as soon as it is ready, with the advisory published after users had the chance to update
- credit in the advisory if you want it

If the report is accepted, we coordinate the disclosure date with you. If it is declined, we explain why.

## Scope

In scope: the CaddyManager backend (API, authentication, 2FA, API keys, backup, Git and Docker integrations, the Caddy
configuration it generates), the frontend, and the published container images and Compose files.

Out of scope:

- vulnerabilities in Caddy, Docker, Node.js or other upstream software (report those upstream; tell us if CaddyManager
  makes them exploitable)
- findings that need an already-compromised host, admin account or Docker socket
- missing hardening that is documented as a deployment choice (see below)
- automated scanner output without a demonstrated impact, and denial of service through unrealistic request volumes

## Hardening your installation

- **Secrets**: set `JWT_SECRET`, `ENCRYPTION_KEY` and `ADMIN_PASSWORD` to strong, unique values (see `.env.template`).
  The production Compose file refuses to start with empty secrets. Rotate them if they may have been exposed.
- **Expose only what is needed**: publish ports 80/443 for proxied sites. Keep the CaddyManager UI/API and the Caddy admin
  API (port 2019) on a private network, behind a VPN, or behind an authenticating proxy.
- **HTTPS for the UI**: set `COOKIE_SECURE=true` when the UI is served over HTTPS.
- **Behind Cloudflare or another proxy**: set `CADDY_TRUSTED_PROXIES` to the proxies you control only, otherwise
  rate limits and IP filters can be bypassed with a forged client address.
- **PostgreSQL**: use `DB_SSL_CA` / `DB_SSL_REJECT_UNAUTHORIZED` so the server certificate is verified.
- **Accounts**: enable two-factor authentication for admins and use scoped API keys for automation.
- **Docker discovery** needs access to the Docker socket, which is equivalent to root on the host. Enable it only if you
  trust the containers on that host.
- **Updates**: keep the images current; releases are published to GHCR and listed under
  [Releases](https://github.com/rhad00/CaddyManager/releases).
