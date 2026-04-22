# CLAUDE.md — Authority Finance

**Line limit:** keep under practical cap; compact older sections before adding new content.

---

## Agent Delegation Guide

Two agents work this codebase. Route tasks correctly when logging to the backlog.

### Claude Code (CC)
Handles anything requiring planning, reasoning, or cross-file awareness.
- Multi-file changes or cascading logic
- Architectural decisions
- Core engine work (`finance.js`, `App.jsx`, `rollingTimeline.js`)
- Fuzzy or iterative tasks that need conversation
- Anything that could break the income/tax/goals pipeline

### Codex
Best for scoped, self-contained execution with a clear spec.
- Single component builds or rewrites
- Tokenizing hardcoded colors/styles
- Adding a panel, modal, or UI element with clear inputs/outputs
- Isolated refactors that don't touch core state
- Anything where a task spec can fully describe the job in one shot

### Tagging Convention (todo backlog)
- `[CC]` — Claude Code must handle this
- `[CODEX]` — Good Codex candidate, write a task spec before firing
- `[CODEX?]` — Probably Codex but verify scope first before delegating

### Codex Handoff Rule
Before delegating a `[CODEX]` task, ensure `docs/CODEX_MEMORY.md` is current.
Claude Code should update it at the end of any session that changes
architecture, state shape, or core logic.

---

## Product

**Company:** Authority | **Product:** Authority OS | **Tagline:** *"You are missing out… on you."*

**This app:** Authority Finance (A:Fin) — flagship pillar. Personal finance dashboard covering income modeling, budgeting, goals, and event logging.

**Other pillars (post-launch):**

| Label | Domain |
|-------|--------|
| A:Intel | Career / education / knowledge |
| A:Perf | Fitness / physical optimization |
| A:Legacy | Family planning / long-term structure |

**Launch requirement:** A:Fin MVP complete → public launch → build remaining pillars.

**Design system:** Flow shell (live) + Pulse overlay (Phase 2). See `docs/authority-design-system`.

**Liquid Glass UI layer (live):** `src/components/LiquidGlass.jsx` — frosted glass surfaces for nav, pulse pills, modals, log summaries. Glass sheen recipe (5-layer raised glass effect) documented in `docs/active-systems.md` §13 and `docs/premium-ui-TODO.md` §4. Codex reference: `AGENTS.md` §Liquid Glass.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Auth + DB | Supabase (auth live, localStorage→Supabase migration path) |
| Testing | Vitest + Testing Library |
| PWA | vite-plugin-pwa (installed, manifest + service worker active) |
| Hosting | Vercel |

**No backend server.** Pure frontend app. No Express, no Railway, no Claude API, no Stripe — yet.

---

## File Structure

```
src/
├── App.jsx                  — root shell, nav, auth gate, fiscal week state
├── index.css                — @theme design tokens (single source of truth)
├── main.jsx
├── components/
│   ├── ui.jsx               — all shared primitives (MetricCard, NT, VT, SmBtn, SH, iS, lS)
│   ├── HomePanel.jsx        — dashboard home tiles
│   ├── IncomePanel.jsx      — income / tax / rolling weekly view
│   ├── BudgetPanel.jsx      — expenses / goals / loans
│   ├── BenefitsPanel.jsx    — 401k + PTO
│   ├── LogPanel.jsx         — event log + Log Effect Summary
│   ├── WeekConfirmModal.jsx — weekly schedule confirmation
│   ├── SetupWizard.jsx      — multi-step onboarding
│   ├── LoginScreen.jsx      — auth shell
│   └── ProfilePanel.jsx     — account + employment settings
├── constants/
│   ├── config.js            — FISCAL_YEAR_START, PHASES, EVENT_TYPES, etc.
│   └── stateTaxTable.js     — state tax rate table
├── hooks/
│   └── useLocalStorage.js
├── lib/
│   ├── finance.js           — buildYear, computeNet, computeGoalTimeline, calcEventImpact
│   ├── rollingTimeline.js   — deriveRollingIncomeWeeks, deriveRollingTimelineMonths, progressiveScale
│   ├── db.js                — localStorage persistence
│   └── supabase.js          — Supabase client
└── test/                    — Vitest tests for lib, components, hooks, constants

docs/                        — project documentation
database/migrations/         — Supabase SQL migrations
```

---

## UI Component Standards

Full token reference: ` ##UI Design System — Authority Finance` (Next Section). Full component reference: `docs/active-systems.md`.

### Shared Primitives (`src/components/ui.jsx`)

| Export | What it is | Key props |
|--------|-----------|-----------|
| `MetricCard` / `Card` | Static + interactive metric card | `label`, `val`, `sub`, `status` (`green\|gold\|red`), `onClick`, `rawVal` (countup), `entranceIndex` (stagger), `span` |
| `NT` | Nav tab | `label`, `active`, `onClick` — teal fill when active |
| `VT` | View tab (sub-panel) | Same as NT, smaller padding |
| `SmBtn` | Inline utility button | `children`, `onClick`, `c` (color), `bg` |
| `SH` | Section header | `children`, `color`, `right` — teal left-bar + uppercase |
| `iS` | Input style object | Spread onto `<input>` / `<select>` — JetBrains Mono, 16px |
| `lS` | Label style object | Spread onto `<label>` — 10px, 2px tracking, uppercase |

### Layout Constants
- Card grid gap: `12px` | Section `marginBottom`: `20px`
- Card padding: `18px 16px` (static) · `16px 18px` + `minHeight: 88px` (interactive)

### Inline Button Pattern
```
CANCEL: bg-raised, text-secondary, border-subtle, radius 12px, pad 7px 14px, 10px uppercase
SAVE:   bg-green or bg-gold (teal), color bg-base, radius 12px, pad 8px 16px, 10px bold uppercase
```

### Numeric Input Standard (required for all new number inputs)

Number inputs must allow blank display while the user is mid-edit. **Never coerce on `onChange`.**

**Rules:**
1. `value` — use a string draft state or `field ?? ""` so the field can visually go empty
2. `onChange` — store the raw string; do NOT use `parseFloat(v) || fallback` (the fallback snaps the display). Only parse at commit time (blur, save button, form submit)
3. On commit: `parseFloat(draft) || 0` or explicit null-check is fine
4. For required fields with a multi-step flow: pass an `attempted` boolean (set when user taps Next/Save on a blank required field). When `attempted && fieldEmpty`, show: red label (`color: var(--color-red)`), red input border (`border: 1px solid var(--color-red)`), and an inline `↑ Required` message below the input

**Wizard pattern** (SetupWizard `Field` + `errBorder` helper already support this):
```jsx
const [draft, setDraft] = useState(String(config.field ?? ""));
<Field label="Rate" error={attempted && !draft ? "Required" : null}>
  <input type="number" value={draft}
    onChange={e => setDraft(e.target.value)}
    style={{ ...iS, ...errBorder(attempted && !draft) }} />
</Field>
// On save: parseFloat(draft) || 0
```

**Inline panel edit pattern** (BudgetPanel, ProfilePanel, etc.):
```jsx
value={editDraft.amount}   // "" is allowed
onChange={e => setEditDraft(v => ({ ...v, amount: e.target.value }))}
// On save: parseFloat(editDraft.amount) || 0
```

### Animation Rules
- Entrance stagger: `entranceIndex` on MetricCard → `fadeSlideUp` 400ms, 80ms/card, capped 400ms
- Countup: `rawVal` prop → 0→target over 1200ms on mount/change
- Value flash: `rawVal` change → `--color-gold-bright` 150ms, fades over 600ms
- **No bounce, no spin, no scale-up on mount. Press = `scale(0.97)` only. All durations ≤ 500ms except countup.**

---

## UI Design System — Authority Finance

Design token source of truth. All values confirmed against `src/index.css` `@theme` block.
**Never use raw hex for accent, green, or red. Always reference tokens.**

---

### Color Tokens (live in `src/index.css`)

| Token | Value | Role |
|-------|-------|------|
| `--color-bg-base` | `#05100c` | App shell / page background |
| `--color-bg-surface` | `#112c1f` | Card background |
| `--color-bg-raised` | `#163828` | Elevated surfaces, button hover |
| `--color-bg-gradient` | `linear-gradient(180deg, #091a11, #05100c)` | Header / container gradient |
| `--color-gold` | `#00c896` | Legacy alias → maps to `--color-accent-primary` |
| `--color-accent-primary` | `#00c896` | Flow identity: active tabs, CTAs, section bars |
| `--color-green` | `#22c55e` | Semantic positive: income values, healthy status |
| `--color-red` | `#ef4444` | Negative / spend / risk |
| `--color-warning` | `#f59e0b` | Warning / attention |
| `--color-text-primary` | `#e6f4ef` | Body text |
| `--color-text-secondary` | `#7fa39a` | Labels, sublabels |
| `--color-text-disabled` | `#4a645c` | Inactive / disabled |
| `--color-border-subtle` | `#1f3b31` | Card borders |
| `--color-border-accent` | `rgba(0,200,150,0.28)` | Accent-highlighted borders |
| `--font-display` | `'Inter'` | Metric values, headings |
| `--font-sans` | `'Inter'` | All UI body text |
| `--font-mono` | `'JetBrains Mono'` | Inputs + data table cells only |

**Note:** `index.html` still loads DM Serif Display + DM Sans via Google Fonts — dead weight, tracked for cleanup.

---

### Status Color Semantics (Global)

Applied via `status` prop on `MetricCard` and inline throughout panels:

- **green** = positive / healthy / ahead
- **gold** = neutral attention / mixed / watchlist
- **red** = negative / risk / behind

---

### Pulse Signal Tokens (Phase 2 — not yet in `index.css`)

Reserved for the intelligence overlay layer. Do not use on Flow UI elements.

| Token | Value | Role |
|-------|-------|------|
| `--color-signal-blue` | `#5B8CFF` | Trend indicators, insight labels |
| `--color-signal-purple` | `#7C5CFF` | AI-generated insight moments |
| `--color-signal-glow` | `rgba(124,92,255,0.25)` | Subtle glow on AI insight surfaces |


---

## Development Workflow

**30-minute sprints, 4x/week.**

Before: know the task, state it clearly.
After: commit (even if broken), one-sentence summary.

**Key docs for context:**
- `docs/active-systems.md` — how every live system works
- `docs/authority-design-system` — Flow + Pulse visual system
- `docs/TODO.md` — prioritized backlog
- `docs/account-reference.json` — Anthony's primary account ground truth (see below)

---

## Mobile Checklist (run before any mobile ship)

- [ ] No horizontal scroll at 390px and 375px
- [ ] All tap targets ≥ 44×44px
- [ ] Font-size ≥ 16px on all inputs (prevents iOS zoom)
- [ ] Bottom nav clears home indicator (`safe-area-inset-bottom`)
- [ ] PWA installs from Safari "Add to Home Screen"
- [ ] Standalone display mode active (no browser chrome)
- [ ] Dark status bar on iPhone (black-translucent)
- [ ] Dynamic Island / notch not obscured

---

## Account Reference (Ground Truth)

`docs/account-reference.json` holds Anthony's primary DHL account data in three tiers:

| Tier | Key | What it contains |
|------|-----|-----------------|
| 1 — DB | `db_record` | Raw Supabase `user_data` columns: config, logs, expenses, goals, week_confirmations, pto_goal |
| 2 — Computed | `computed_expectations` | What finance.js should derive: income, bucket, PTO, 401k, goals, log impact |
| 3 — UI | `ui_assertions` | What each panel should display (for manual QA + integration test expected values) |

**Rules:**
- Never fabricate expected values — derive `computed_expectations` from the actual `db_record`
- Update `last_updated` + the changed section whenever config or real account data changes
- Use `computed_expectations` as the expected-values source when writing tests against real account behavior

---

## Testing

Runner: **Vitest**. Tests in `src/test/`. Config lives in `vitest.config.js` (separate from `vite.config.js` — Vitest auto-prefers it).

```bash
npm test              # watch mode
npm run test:run      # single pass  ← use this to verify a change
npm run test:coverage
npx vitest run -u     # update snapshots after intentional DEFAULT_CONFIG changes
```

**Reporter is set to `verbose` in `vitest.config.js`.** Without `verbose`, Vitest 4's default reporter can misreport suite failures as "no tests" when collection errors exist — the verbose mode always shows accurate per-file and per-test counts.

**Do not use `npm run test -- --runInBand`.** `--runInBand` is a Jest flag; Vitest ignores it. Use `npm run test:run` for a single serial pass.

**`vitest.config.js` is sandbox-safe** — intentionally omits `@tailwindcss/vite`, `@rolldown/plugin-babel`, and CSS processing to avoid native `.node` binaries that fail in restricted environments (Codex, CI).

---

## Environment Variables

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Naming Conventions

- Files: kebab-case (`setup-wizard.jsx`)
- Components: PascalCase (`SetupWizard`)
- Utilities/hooks: camelCase (`useLocalStorage`)
- Database: snake_case (`fiscal_year_start`)

---

## Known Cleanup Items

- `index.html` loads DM Serif Display + DM Sans from Google Fonts — stale, Inter is the active font
- `index.html` `apple-mobile-web-app-title` = "Finance RPG" — update to "Authority Finance"
- `index.html` `<title>` = "2026 Financial Dashboard" — update to "Authority Finance"
- `WeekConfirmModal.jsx`, `LoginScreen.jsx`, `ProfilePanel.jsx` — hardcoded hex colors not yet tokenized (tracked in TODO §10)
