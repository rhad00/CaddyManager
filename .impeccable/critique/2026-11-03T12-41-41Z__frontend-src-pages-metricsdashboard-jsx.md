---
target: frontend/src/pages/MetricsDashboard.jsx
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/ubuntu/git/proiecte_github_live/caddymanager/.claude/worktrees/modernization/frontend/src/pages/MetricsDashboard.jsx"
target_fingerprint: "sha256:6ad0109d5966d0e830b82cf088f75f035422e12110debeb5e84457e1d299dde3"
target_path: /home/ubuntu/git/proiecte_github_live/caddymanager/.claude/worktrees/modernization/frontend/src/pages/MetricsDashboard.jsx
timestamp: 2026-11-03T12-41-41Z
slug: frontend-src-pages-metricsdashboard-jsx
---
Method: dual-agent (A: design review, B: detector and browser evidence)

# Critique: frontend/src/pages/MetricsDashboard.jsx

Score 16/40 (Poor). Heuristics: 1:1, 2:2, 3:2, 4:2, 5:2, 6:2, 7:1, 8:2, 9:1, 10:1. Cognitive load fails 5 of 8.

Design specificity: generic SaaS stat cards and definition lists inside an authored shell. Detector: 0 findings in file; overlay reported 4 whole-page patterns (not itemised).

## Priority issues
- [P1] Page does not answer "is anything wrong right now?" (cumulative counters, no verdict, error rate needs hand division). Fix: verdict line, 5xx share, latency in ms, certificate expiry, rate from history deltas; one page, no tabs. Commands: shape, layout.
- [P1] Old visual language: rainbow icon tiles (green/yellow/purple outside palette), hard-coded chart hexes, no mono, Chart.js defaults. Commands: colorize, typeset.
- [P1] Thin or misleading states: `|| 0` hides missing data, no refresh indicator, stale data without banner, error state with no h1, retry, role=alert or next step, silent history failure. Commands: harden, clarify.
- [P2] Accessibility: no tab semantics, unnamed canvases, unlabelled select, heading skip, gray-500 on fog measures 4.48:1 (theme token, app-wide), yellow tile and amber slice about 2:1. Commands: audit, harden.
- [P2] Number honesty: cumulative counter plotted as a line, string memory values, 0.012345 seconds, MiB shown as MB, history never auto-refreshes. Commands: harden, clarify.
- [P3] 375px: horizontal scroll (459px), header wraps. Command: adapt.

## Personas
Alex: no verdict, no deep link, interval not remembered, tabs not arrow-key operable. Sam: tabs, canvases and select unnamed, error not announced, 4xx vs 5xx by colour only. Homelab operator on a phone: sideways scroll, certificates off-screen and only a count, no way from the error state to logs.

## Questions
One number to keep? Per-route health as the product's own page? Why four tabs for 14 numbers?
