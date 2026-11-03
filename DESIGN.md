---
name: CaddyManager
description: A quiet, exact console for Caddy reverse proxies, where the menu is drawn as the route a request takes.
colors:
  ink: "#16212b"
  ink-soft: "#1d2a36"
  fog: "#f4f6f7"
  surface: "#ffffff"
  trace: "#4fd1b5"
  gateway-teal: "#0e6b63"
  gateway-teal-deep: "#0b564f"
  gateway-teal-tint: "#e8f6f3"
  hairline: "#e0e5e9"
  slate-muted: "#66737f"
  slate-text: "#36414c"
typography:
  display:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.01em"
  title:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
rounded:
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  rail: "18rem"
  header: "3.5rem"
components:
  button-primary:
    backgroundColor: "{colors.gateway-teal}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.gateway-teal-deep}"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.slate-text}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-rail:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    width: "{spacing.rail}"
  nav-item-current:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  top-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.slate-text}"
    height: "{spacing.header}"
---

# Design System: CaddyManager

## Overview

**Creative North Star: "The Route Trace"**

CaddyManager manages the path a request takes, so the interface draws that path. The left menu is a line; each submenu branches off it, and the page you are on is a lit node on the line. Domains, upstreams, addresses and versions are set in mono because they are real data the operator recognises, not decoration. Everything else stays out of the way: the product is used to finish a task and leave, so the system favours precision over personality.

Components are quiet and exact. Surfaces sit on a one-pixel hairline instead of a drop shadow, a single solid teal marks the primary action and the current place, and nothing moves unless the person caused it. The look is a dark ink rail beside a cool, pale page, with cards that read as sheets on that page.

The system rejects three looks: a **generic SaaS admin template** (identical rounded cards, purple or indigo accents, gradient washes), a **terminal-green hacker dashboard** (black with neon green, mono everywhere), and a **cluttered enterprise console** (dense toolbars with every option on screen at once).

**Key Characteristics:**
- A dark rail and a pale page; the rail carries the identity, the page stays neutral.
- One accent (gateway teal) for the primary action, links and focus; a brighter teal (trace) only on the dark rail.
- Hairline-edged cards; no decorative shadows, gradients or ornament.
- Sentence case everywhere; real addresses and versions in mono.
- Left-aligned, task-first pages with a breadcrumb that mirrors the menu tree.

## Colors

A cool, ink-tinted neutral palette with one teal accent. Neutrals lean slightly toward blue-green so the teal never looks pasted on.

### Primary
- **Gateway Teal** (#0e6b63): the primary button, links, focus ring, selected states in forms. Deepens to **Gateway Teal Deep** (#0b564f) on hover. **Gateway Teal Tint** (#e8f6f3) is the quiet background for informational and "selected" areas.
- **Trace** (#4fd1b5): the lit node on the menu line, the mark's stroke, and the version badge on the rail. It is bright enough for the dark rail only; on light surfaces it fails contrast and is not used.

### Neutral
- **Ink** (#16212b): the rail, the darkest text, and the page title colour. **Ink Soft** (#1d2a36) is the raised row on the rail (current page, hover).
- **Fog** (#f4f6f7): the page background behind cards.
- **Surface** (#ffffff): cards, the top bar, inputs.
- **Hairline** (#e0e5e9): every border and divider, and the ring on cards.
- **Slate Text** (#36414c) and **Slate Muted** (#66737f): body text on light surfaces and secondary text such as helper lines and breadcrumbs.
- Status colours (green, red, amber, blue) keep their Tailwind defaults and appear only as small pills and alert panels.

### Named Rules
**The One Teal Rule.** Teal marks the one primary action on a screen, links, focus and the current place. If two teal buttons share a view, one of them is wrong.

**The Indigo Alias Rule.** The pages are written with Tailwind's `indigo-*` and `gray-*` classes, and `src/index.css` redefines both scales: `indigo-*` is gateway teal, `gray-*` is the ink-tinted neutral. Keep using those class names for the accent and neutrals; do not introduce a real indigo or another grey scale.

**The Trace Stays Dark Rule.** Trace green is only used on ink. On a light background use gateway teal.

## Typography

**Display and body font:** IBM Plex Sans (variable, bundled with the app; the Content-Security-Policy allows only same-origin fonts).
**Data font:** IBM Plex Mono (400 and 500, bundled).

**Character:** One humanist family for everything you read, and its mono sibling for everything you copy. The pairing looks technical without turning the interface into a terminal.

### Hierarchy
- **Display** (600, 1.5rem, 1.33): the page title (`h1`) at the top of each page. One per page.
- **Title** (600, 1.125rem, 1.55): card and section headings.
- **Body** (400, 0.875rem, 1.43, tabular numbers): all running text, table cells, helper lines. Prose blocks stay under about 70 characters wide.
- **Label** (500, 0.875rem, 1.43): button text, form labels, menu items.
- **Data** (mono, 0.75rem to 0.875rem): domains, upstream URLs, IPs, API keys, versions, error codes quoted in messages.

### Named Rules
**The Data in Mono Rule.** Anything the operator might copy or compare character by character is set in mono: domains, upstreams, addresses, versions, tokens.

**The Sentence Case Rule.** Labels, buttons and menu items are in sentence case. No all-caps labels, no tracked-out eyebrows.

## Layout

An app shell, not a page: a fixed 18rem (288px) rail on the left, a sticky 3.5rem top bar, and a scrolling content area. Content is left-aligned and capped at 80rem (`max-w-7xl`), with 16px side padding on phones, 24px from `sm` and 32px from `lg`. Pages are vertical stacks of cards separated by 24px.

The rail is controlled by a hamburger in the top bar. From 1024px it sits beside the content and folds away with a remembered preference; below 1024px it opens over the content with a dim backdrop, closes on Escape, backdrop click, its own close button or a link, and returns focus to the hamburger. Submenus nest to any depth; the menu tree, the breadcrumb and the routes come from one definition (`src/navigation.js`).

Spacing follows a 4px base: 4, 8, 16, 24, 32. Related controls sit 8 to 12px apart; sections 24px apart. Narrow screens stack, never scroll sideways.

## Elevation & Depth

Flat by default, with depth carried by tone and a hairline. The rail is darker than the page; cards are lighter than it. Surfaces do not float.

### Shadow Vocabulary
- **Hairline** (`box-shadow: 0 0 0 1px rgb(22 33 43 / 0.06)`): a card at rest.
- **Card** (`0 0 0 1px rgb(22 33 43 / 0.06), 0 1px 2px rgb(22 33 43 / 0.04)`): the default for `shadow` and `shadow-sm`.
- **Raised** (`0 0 0 1px rgb(22 33 43 / 0.07), 0 4px 12px rgb(22 33 43 / 0.06)`): menus and popovers.
- **Overlay** (`0 0 0 1px rgb(22 33 43 / 0.08), 0 12px 28px rgb(22 33 43 / 0.1)`): dialogs.

### Named Rules
**The Hairline Rule.** Every border is Hairline (#e0e5e9). Tailwind 4 would draw a bare `border` in black; a base rule in `index.css` resets it, so a border never needs its colour restated.

## Shapes

Softly squared: 8px (`rounded-md`) on buttons and fields, 10px (`rounded-lg`) on cards, 14px for large panels, and full pills only for status badges. Borders are 1px hairlines. The only circle is the node on the menu line.

## Components

### Buttons
- **Shape:** 8px radius, text-sm medium weight, 8px by 16px padding.
- **Primary:** solid gateway teal with white text. It deepens to gateway teal deep on hover and shows a 2px teal focus ring with a 2px offset.
- **Quiet:** white with a hairline border and slate text, for cancel and secondary actions. Hover is a faint grey fill.
- **Danger and status actions:** small tinted buttons (red, amber, teal tints) inside list rows; never as the primary action of a page.

### Cards / Containers
- **Corner style:** 10px.
- **Background:** white on the fog page.
- **Edge:** the Card shadow (a hairline ring and a 1px soft shadow).
- **Internal padding:** 24px; list rows inside a card are divided by hairlines, not nested cards.

### Inputs / Fields
- **Style:** white fill, 1px border in a mid grey, 8px radius, 8px by 12px padding, text-sm.
- **Focus:** border and a 1px ring turn gateway teal; the global 2px teal focus-visible outline applies to every control.
- **Disabled and locked:** a grey fill with reduced opacity and a not-allowed cursor, always with the reason written beneath in amber text (for example the options a template cannot work with).
- **Error:** a bordered red-tinted panel above the form with `role="alert"`, in plain sentences that say what failed and what to do.

### Navigation (the signature component)
- **The rail:** ink background, 18rem wide, header with the mark, the name and a mono version badge in trace green.
- **The line:** each submenu is a 1px trace-green line at 25% opacity; items hang off it. Nesting indents the line, so Settings > My account > API keys shows two branches.
- **Items:** slate-300 text, white on hover with a faint white fill. The current page is white text, a faint raised fill (ink soft) and a **node**: a trace-green dot with a soft ring sitting on the line. Inactive items have a small slate dot.
- **Groups:** a button with an icon, the label, and a chevron that rotates when open (`aria-expanded`). The submenu that holds the current page opens automatically.
- **Top bar:** white, hamburger on the left, breadcrumb (the menu path, last item bold, `aria-current="page"`), then the signed-in email and Sign out.
- **Mobile:** the rail becomes an overlay with its own close button.

### Status pills
Small full-radius pills (text-xs, medium) in tinted green, amber, red or grey fills for Active, Disabled, SSL type and TLS state. They carry a text label, never colour alone.

### Sign-in
A split screen from 1024px: the ink panel on the left draws the product as a three-node route (visitor, caddy, upstream) in mono; the form sits on fog on the right. Below 1024px only the form remains, with the brand and version above it.

## Do's and Don'ts

### Do:
- **Do** use gateway teal (#0e6b63) for exactly one primary action per view, and for links and focus.
- **Do** set domains, upstreams, addresses, versions and keys in IBM Plex Mono.
- **Do** keep every border at Hairline (#e0e5e9) and rely on tone, not shadow, for depth.
- **Do** write messages that say what failed and what to do, in sentence case, in the interface's own voice (no apologies).
- **Do** disable an option that cannot work and write the reason under it; the server enforces the same rule.
- **Do** keep motion to responses to the person's action (the menu opening or folding, a chevron turning), and honour `prefers-reduced-motion`.
- **Do** keep every screen operable by keyboard with the visible 2px focus outline, and meet WCAG 2.2 AA contrast.

### Don't:
- **Don't** build a generic SaaS admin template: no rows of identical rounded cards in different colours, no purple or indigo accent, no gradient washes.
- **Don't** drift toward a terminal-green hacker dashboard: no black pages, no neon green on light surfaces, no mono body text.
- **Don't** build a cluttered enterprise console: do not show every option at once; group sub-settings into submenus and reveal detail on demand.
- **Don't** use trace green (#4fd1b5) on a light background; it is for the dark rail only.
- **Don't** introduce a second accent colour or a second grey scale; the `indigo` and `gray` Tailwind scales are already redefined.
- **Don't** convey state by colour alone; every status pill and error carries text.
- **Don't** use all-caps labels or tracked-out eyebrow text above headings.
