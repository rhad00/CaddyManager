---
target: frontend/src/components/ProxyForm.jsx
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/ubuntu/git/proiecte_github_live/caddymanager/.claude/worktrees/modernization/frontend/src/components/ProxyForm.jsx"
target_fingerprint: "sha256:85e3bdc5f1e07e5d98beea63c7acda1fec1a46345902cb9bed34527a5fa325c4"
target_path: /home/ubuntu/git/proiecte_github_live/caddymanager/.claude/worktrees/modernization/frontend/src/components/ProxyForm.jsx
timestamp: 2026-11-03T11-29-36Z
slug: frontend-src-components-proxyform-jsx
---
Method: dual-agent (A: design-review subagent, B: detector and browser subagent)

# Critique: ProxyForm.jsx (Create/Edit Proxy)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | A failed save shows nothing in view; only a generic "Saving..." |
| 2 | Match system / real world | 3 | Terms fit the audience; "SSL Type" dated, title-case labels |
| 3 | User control and freedom | 2 | A template silently unchecks options; clearing it does not restore them |
| 4 | Consistency and standards | 2 | Captions inconsistent; sub-labels not real labels; title case vs sentence-case voice |
| 5 | Error prevention | 2 | Template locks good; no format validation; blank rows dropped; empty password on edit |
| 6 | Recognition rather than recall | 3 | Good placeholders; template effects learned too late |
| 7 | Flexibility and efficiency | 2 | Save about 1300px down, no sticky bar, no collapse, no duplicate |
| 8 | Aesthetic and minimalist design | 1 | Headers/CSP list dominates; 15 controls at equal weight |
| 9 | Error recovery | 2 | Good copy, but banner off-screen; no field-level errors |
| 10 | Help and documentation | 2 | A few inline hints; nothing on burst, health checks, path syntax |
| **Total** | | **21/40** | **Acceptable** |

## Design Specificity Verdict
LLM assessment: interchangeable. The shell is authored for the product; the form inside is stock Tailwind forms markup with no Route Trace identity (no mono for data, no route shown as a route). Reads as the generic-SaaS and cluttered-console anti-references.

Deterministic scan: static detector 0 findings. In-page overlay: 5 issues (3 placeholders at 3.2:1, one 4.48:1 text pair probably outside the form, h1 to h3 skipped heading). No false positives. Overlay ran headless, no [Human] tab.

Evidence conflict resolved: B reported all inputs labelled but measured with toggles closed; A found about 15 sub-field inputs with no label or id in source. A is right.

## Priority Issues
- [P0] A failed save is invisible (banner at top of a 1300-2700px form, no role=alert, no focus move). Fix: scroll and focus the banner, role=alert, summary beside Save. Command: harden
- [P1] Flat 15-control wall with no hierarchy. Fix: sections Route / TLS / collapsed More options, collapse headers list, sticky Save bar, template first. Commands: layout, distill
- [P1] About 15 nested inputs have no accessible name (no htmlFor/id; weight placeholder-only; no aria-describedby). Fix: Field component, fieldset/legend, named Remove buttons. Command: harden
- [P2] Not authored for this product: no mono data, title case, text-yellow-600 warning about 2.9:1, placeholders 3.2:1, input borders 1.54:1. Fix: mono, sentence case, AA warning style, darker borders, live route preview. Commands: typeset, colorize
- [P2] "Confirm changes" step never appears (stale configPreview read) and pathRoutes edited in place. Fix: local variable, copy row objects. Command: harden

## Persona Red Flags
Jordan: cannot tell only 3 fields are required; SSL Type jargon; silent failure on duplicate domain; unexplained unsafe-inline CSP.
Sam: unnamed number fields in every toggle section; save error not announced; unlinked disabled-reason; 16px checkboxes; all 16 controls under 44px in one dimension.
Alex: scrolls about 1300px to Save every time; no duplicate-proxy; template last then rewrites earlier fields; many clicks to add routes.

## Minor Observations
h1 then h3 skipped h2; clearing a template does not restore options; edit mode never repopulates basic-auth password; blank route and upstream rows dropped silently; literal backticks around CF_API_TOKEN; upstream placeholder clipped at 375px; TLS status panel off-palette amber button and pills.

## Questions to Consider
1. If the promise is fewer steps to an HTTPS site, why does the minimum path require scrolling past 12 irrelevant controls?
2. What if Apply template came first and set the defaults?
3. What would a form look like that showed what is about to happen (route, certificate, DNS) before saving, using the route-trace motif?
