# Design System Source of Truth (Flow)

**Purpose:** ground-truth extraction from this repo's actual code, for reconciling the
`claude.ai/design` "Flow" design-system project against what the app really renders. Written
2026-09-01 during a diagnostic pass — see that session for the prompt that triggered it. This
file is the reference; the design-system project should be edited to match it, not the other
way around.

**Known limitation at time of writing:** this pass could not read the live Claude Design
project's files directly — `DesignSync` needs `/design-login` authorization, which requires an
interactive terminal session. Everything below is verified against the repo source (file:line
cited). Section 7 flags what's *likely* stale based on recent commits, but a literal file diff
against the synced project still needs to happen once `/design-login` has run.

**Source files read:** `src/index.css`, `src/components/ui.jsx`, `src/components/LiquidGlass.jsx`,
`src/App.jsx`, `src/components/LoginScreen.jsx`. No `tailwind.config.js` exists — Tailwind v4,
tokens live entirely in `index.css`'s `@theme` block.

---

## 1. Color tokens (`src/index.css:3–58`)

| Token | Value | Usage note |
|---|---|---|
| `--color-bg-base` | `#05100c` | app shell background |
| `--color-bg-surface` | `#112c1f` | card background |
| `--color-bg-raised` | `#163828` | elevated surfaces, button hover |
| `--color-bg-gradient` | `linear-gradient(180deg, #091a11 0%, #05100c 100%)` | `html/body`, `#root` background |
| `--color-teal` / `--color-accent-primary` | `#00c896` | active tabs, CTAs, section bars |
| `--color-teal-muted` | `#0a8f6f` | |
| `--color-teal-bright` | `#33e0b0` | default press-flash fill color |
| `--color-green` | `#22c55e` | income/positive status |
| `--color-green-muted` | `#168246` | |
| `--color-red` | `#ef4444` | **defined but NOT used in UI** — comment: "kept for reference, use `--color-deduction` instead" |
| `--color-red-muted` | `#8a2323` | |
| `--color-deduction` | `#f4a4a4` | **the actual red used everywhere** — same hue as `--color-red`, ~80% lightness, softer on dark bg |
| `--color-warning` | `#f59e0b` | |
| `--color-text-primary` | `#e6f4ef` | |
| `--color-text-secondary` | `#7fa39a` | |
| `--color-text-disabled` | `#4a645c` | |
| `--color-border-subtle` | `#1f3b31` | |
| `--color-border-accent` | `rgba(0,200,150,0.28)` | |

**Liquid Glass tokens** (line 33–42) — only ever consumed via `LiquidGlass.jsx`, never raw:
- Blur: `--glass-blur-light: 12px`, `--glass-blur-strong: 20px`
- Teal tint/border: `rgba(0,200,150,0.10)` / `rgba(0,200,150,0.24)`
- Blue tint/border: `rgba(91,140,255,0.16)` / `rgba(91,140,255,0.35)`
- Purple tint/border: `rgba(124,92,255,0.10)` / `rgba(124,92,255,0.26)`

**Pulse signal tokens** (line 44–48) — **Phase 2, reserved, not built**:
`--color-signal-blue: #5b8cff`, `--color-signal-purple: #7c5cff`,
`--color-signal-glow: rgba(124,92,255,0.25)`. Explicit rule in the source comment: never apply
to Flow UI elements. If any Flow-system component preview shows blue/purple, that's drift.

## 2. Typography (`index.css:50–57`, `164–247`)

Two-font system, adopted 2026-08-09:
- **`--font-display`: `'Titillium Web', system-ui, sans-serif`** — all headings (h1–h6), page/
  section titles, hero/headline text, large numeric emphasis on metric cards. Weights used:
  400/600/700/900.
- **`--font-sans`: `'Rajdhani', system-ui, sans-serif`** — everything else: body copy, nav
  links, labels, ALL interactive components (buttons, tabs, toggles, badges, chips), and ALL
  form inputs/selects/textareas. Weights: 400/500/600/700.
- **`--font-mono`: `'JetBrains Mono', 'Courier New', monospace`** — read-only numeric/data
  display ONLY (data tables, computed-value readouts). Moved off form fields 2026-08-10 — if a
  synced preview still shows mono on inputs, it's stale.

Heading scale:
- `h1`: 56px / weight 900 / letter-spacing 0.04em / line-height 1.15 (36px, same weight/spacing
  at ≤1024px)
- `h2`: 24px / weight 800 / letter-spacing 0.02em / line-height 1.15 (20px at ≤1024px)
- `.heading-xl` / `.heading-lg` utility classes exist in CSS but are **not yet referenced by any
  component** — don't treat their presence in the stylesheet as proof they're used anywhere.

Body-text scale — five fixed classes, **never arbitrary inline px/rem for label/body copy**:
`.text-2xs` 11px · `.text-xs` 12px · `.text-sm` 13px · `.text-base` 14px · `.text-md` 15px, all
`line-height: normal`. Enforced in-repo by a static-analysis test
(`src/test/lib/textUtilityClassAudit.test.js`).

## 3. Component patterns (`src/components/ui.jsx`)

| Component | Key spec | Line |
|---|---|---|
| `Pressable` | Base tap-feedback wrapper: derives a lighter same-family flash color from the target's own resting color (not a fixed color), plus `scale(0.94→1)` spring. All buttons/tabs build on this. | 193 |
| `NT` / `VT` (nav/view tabs) | `borderRadius: 12px`, `minHeight: 44px`, uppercase, `letterSpacing: 2px`, active = solid teal bg + dark text | 364, 385 |
| `MetricCard` / `Card` | `borderRadius: 16px`; status tint is a **gradient**, not flat fill (see `METRIC_STATUS`); interactive cards get `minHeight: 88px` + `scale(0.97)` press | 419–552 |
| `SmBtn` | `borderRadius: 12px`, `minHeight: 44px`, built on `Pressable` | 628 |
| `SH` (section header) | 3px-wide teal left bar + uppercase bold `.text-base` label | 635 |
| `PanelHero` | Centered eyebrow + large Titillium Web headline (32px/900) + small teal underline rule | 637 |
| `SectionHeader` | Gradient hairline rule above a centered 24px/800 Titillium Web title | 647 |
| `InsightRow` | **Pulse-layer component** — signal-blue/purple only, renders below a primary metric, never replaces it | 676 |
| `PaginationDots` / `ScrollSnapRow` | Frosted glass pill dots (12px blur, teal tint) under horizontal snap-scroll stacks | 717, 772 |

**Entrance animation rule** (also in CLAUDE.md): `fadeSlideUp` 400ms ease-out, staggered 80ms per
card, capped at 400ms max delay. Hard constraint: **no bounce, no spin, no scale-up on mount.**
Press feedback is `scale(0.94–0.97)` only. Everything ≤500ms except the countup number animation
(1200ms).

**Fold-Up transition system** (`index.css:410–490`, wired via `useFoldTransition`/`FoldSwitch`/
`StepSlide` in `ui.jsx`): pages lift+fade in from bottom (340ms enter / 180ms exit), modals/
dropdowns scale-fold from the top with overshoot on enter (280ms) and clean ease-out on exit
(240ms), bottom sheets slide up/down (320ms/240ms). This governs how the app itself
navigates/opens things — not a Storybook-only harness detail.

## 4. Liquid Glass (`src/components/LiquidGlass.jsx`)

Blur: `light` 12px / `strong` 20px. Tone-specific tint+border (not a generic gray glass):
- `teal` — Flow accent surfaces (nav, neutral pulse): tint `rgba(0,200,150,0.10)`, border
  `rgba(0,200,150,0.24)`
- `blue` — signal-blue Pulse rows (directional trend): tint `rgba(91,140,255,0.16)`, border
  `rgba(91,140,255,0.35)`
- `purple` — signal-purple Pulse rows (AI-generated/warning moments): tint
  `rgba(124,92,255,0.10)`, border `rgba(124,92,255,0.26)`

**Placement is allowlisted and enforced at dev-time** (`ALLOWED_PURPOSES`, line 27):
`nav | pulse | modal | log-summary | phase-btn`. Explicitly **banned**: primary cards, tables,
buttons. A design-system preview showing glass on a primary metric card or a data table is
off-spec per the code's own dev warning.

## 5. Nav shell (`src/App.jsx`)

- Desktop sidebar tabs (`NAV_ITEMS`, line 80): `Income / Budget / Log / Account` (profile tab is
  labeled "Account" in the UI, key is `profile`).
- Mobile bottom nav (`BOTTOM_NAV`, line 88): 5 items — `Home / Income / Budget / Log / Account` —
  each with a hand-authored inline SVG icon (not an icon font/library), Chime-style icon-over-
  label layout. Same icon set is reused for the hamburger drawer via `NAV_ICONS` (line 139) so
  they can't drift apart.
- Shell structure: `.app-shell` is a flex row (line 2324); `.main-content` is the scroll
  container. Breakpoint at 767/768px switches sidebar (desktop) ↔ bottom nav (mobile)
  (`index.css:141–162`, `App.jsx` inline `<style>` block ~2337–2430).

## 6. Login / Auth (`src/components/LoginScreen.jsx`)

- Auth card: `LiquidGlass purpose="modal"`, `borderRadius: 18px` (line 193) — larger radius than
  the standard 12–16px used elsewhere.
- Title: Titillium Web, weight 800, 22px, letter-spacing 0.01em (line 200).
- Inputs: shared `iS` style + `borderRadius: 8px` override, `.auth-input` class for the
  teal focus glow (`index.css:592–601`).
- **Ambient background** (`index.css:516–618`, `.auth-orb-1/2/3` + `.auth-card-in`): two or
  three slowly-drifting blurred teal/green radial-gradient orbs behind the card, plus a soft
  glowing gradient-border halo around the card itself and a 520ms card-entrance tween. This is
  raw CSS keyframes on the Login/Revive/Investor-register/Trial-explainer shell and
  `App.jsx`'s full-screen loading state — not a reusable component, so a generated design-system
  preview is unlikely to have reproduced it faithfully. Added 2026-08-22, punched up further in
  commit `e0444d8` (2026-08-2x) — check this is the freshest version if the sync predates that.

## 7. Recent design-relevant commits (check these against the synced preview first)

```
e0444d8  Punch up the auth-screen ambient glow — bigger, brighter, more alive
7c2455e  Premium first-impression treatment for auth screens and the boot loading state
7626ceb  Bump section-title and changelog typography hierarchy
```
Everything else in recent history (paystub calc, DHL Warehouse site, admin tooling, retroactive
pay-history fix) is logic/data, not visual — lower priority to re-check.

## 8. Flow vs Pulse

- **Flow** — the live, shipped system. Everything in sections 1–6 above is Flow. This is what
  gets synced to the design-system project.
- **Pulse** — Phase 2, not built. Reserved tokens only (`--color-signal-blue/purple`,
  `--color-signal-glow`, the `blue`/`purple` `LiquidGlass` tones, `InsightRow`). No dedicated
  Pulse components exist yet beyond `InsightRow`, which is the one place Pulse currently
  surfaces inside an otherwise-Flow card.

## 9. Next step to close the loop

Run `/design-login` from an interactive Claude Code session (same machine, real terminal) to
authorize `DesignSync`. Once that's done, a follow-up pass can `list_files`/`get_file` the actual
claude.ai/design project and produce a literal side-by-side diff against this document instead of
relying on "likely stale" inference from commit history.
