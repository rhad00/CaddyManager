# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two groups, equally, using the same screens:

- **Homelab and self-hosting operators.** One person running their own services at home or on a VPS, often opening the UI from a LAN. They want HTTPS sites up without writing a Caddyfile or nginx syntax.
- **Sysadmins and DevOps on small teams.** A few admins sharing one proxy for company services. They rely on roles (admin and read-only), the audit log, backups and Git history.

Both are technical. They know what a domain, an upstream, a certificate and a header are, and come to the app to do a task and leave. Accounts have two roles: admin and read-only.

## Product Purpose

CaddyManager is a web UI for managing a Caddy reverse proxy: domains and upstreams, TLS certificates, headers, access rules, load balancing and health checks, plus the operations around them (metrics, access logs, alerts, backups, Git history). It exists so nobody has to hand-edit proxy configuration to put a service on HTTPS. Success is a working, verifiable HTTPS site with as few steps as possible, and a configuration that can be inspected and rolled back afterwards.

## Positioning

Three claims a neighbouring tool could not truthfully copy, all confirmed:

1. **It manages a real Caddy and is tested against one.** It drives Caddy's Admin API, and an end-to-end suite puts a real Caddy in front of test origins, including origins as strict as Ceph RadosGW with AWS SigV4 (S3) requests.
2. **Fewer steps from container to HTTPS site.** Docker label discovery, service templates, and Cloudflare DNS-01 certificates with the A record created automatically, so there is no trip to other dashboards.
3. **Configuration you can audit and roll back.** Audit log, scheduled and encrypted backups, and Git/GitOps commits with rollback.

## Operating Context

- Runs as three containers (frontend served by nginx, backend, Caddy) from Docker Compose, or from source. The frontend and backend images ship under one release tag; the UI shows its version and warns when the backend runs another.
- Reached by browser, mostly on a desktop, sometimes on a phone to check or fix something.
- Lives next to the operator's other tools: Cloudflare (DNS and tunnels), Docker, Git hosts, identity providers (Authelia, Keycloak), and S3-compatible storage.
- Persistence is SQLite by default and PostgreSQL for production.

## Capabilities and Constraints

- **Scope:** manages the operator's own Caddy reverse proxy. It is not an ingress controller and has no Kubernetes integration; discovery is Docker only.
- **Status:** Alpha. The README tells users to test thoroughly in their own environment.
- **Templates** (Authelia, Keycloak, Amazon S3, Nextcloud, Cloudflare Tunnel, Grafana, Kibana) can forbid proxy options they cannot work with. The form greys those out with the reason, and the server resets them when the template is applied. Amazon S3 locks compression and basic auth off.
- **Cloudflare:** a token with Zone:Read and DNS:Edit gives DNS-01 certificates and automatic A records. The Cloudflare proxy (orange cloud) is on for public targets and off for private addresses (RFC 1918 and similar).
- **Security:** CSRF protection on every state-changing request, JWT in an httpOnly cookie, optional two-factor authentication, API keys with permissions, and SSRF limits on upstreams and webhooks.
- **Terminology the UI uses:** proxy (a domain-to-upstream route), upstream, template, discovery, audit log, GitOps.
- **Undecided:** certificate management has a page in the code that the app does not link to yet.

## Brand Commitments

- Name: CaddyManager (one word, capital C and M).
- Open source under Apache-2.0, developed on GitHub (rhad00/CaddyManager).
- Voice in the interface: plain, direct, sentence case. Errors say what failed and what to do; they do not apologize.

## Evidence on Hand

- A README with the feature descriptions above, and a dashboard screenshot at `.github/images/caddymanager-readme-q85.jpg`.
- Automated tests, including end-to-end tests against a real Caddy (see the Testing section of the README).
- No customer names, testimonials, user counts or benchmarks exist. Do not invent any.

## Product Principles

1. **Say what is true and what to do.** Any message, label or empty state names what happened and the next step, in plain words.
2. **Prevent the broken combination, don't just warn about it.** When options cannot work together, disable them and explain why; the server holds the same line.
3. **Remove the trip to another tool.** If a task needs a second dashboard (DNS, certificates, containers), look for a way to do it from here.
4. **Everything can be inspected and undone.** Changes are visible in an audit trail and recoverable from a backup or a Git commit.
5. **Show the real thing.** Domains, upstreams, versions and addresses appear as the operator knows them, not as abstractions.

## Accessibility & Inclusion

Target WCAG 2.2 AA on every screen: full keyboard operation, visible focus, sufficient contrast, labelled controls, and no information carried by colour alone.
