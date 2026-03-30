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

Full token reference: `CLAUDE.md` (root). Full component reference: `docs/active-systems.md`.

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

### Animation Rules
- Entrance stagger: `entranceIndex` on MetricCard → `fadeSlideUp` 400ms, 80ms/card, capped 400ms
- Countup: `rawVal` prop → 0→target over 1200ms on mount/change
- Value flash: `rawVal` change → `--color-gold-bright` 150ms, fades over 600ms
- **No bounce, no spin, no scale-up on mount. Press = `scale(0.97)` only. All durations ≤ 500ms except countup.**

---

## Development Workflow

**30-minute sprints, 4x/week.**

Before: know the task, state it clearly.
After: commit (even if broken), one-sentence summary.

**Key docs for context:**
- `docs/active-systems.md` — how every live system works
- `docs/authority-design-system` — Flow + Pulse visual system
- `docs/TODO.md` — prioritized backlog

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

## Testing

Runner: **Vitest**. Tests in `src/test/`.

```bash
npm test          # watch mode
npm run test:run  # single pass
npm run test:coverage
```

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
