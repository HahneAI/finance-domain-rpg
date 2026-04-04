# AGENTS.md — Authority Finance (Codex)

Codex-facing authority doc. Mirrors `.claude/CLAUDE.md` — both agents share the same rules.
**Keep under practical cap. Reference `docs/active-systems.md` for system detail; do not duplicate it here.**

---

## Product

**Authority Finance (A:Fin)** — flagship pillar of Authority OS.
Personal finance dashboard: income modeling, budgeting, goals, event logging.
Tagline: *"You are missing out… on you."*

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Auth + DB | Supabase (auth live) |
| Testing | Vitest 4 + Testing Library |
| PWA | vite-plugin-pwa |
| Hosting | Vercel |

**No backend server.** Pure frontend. No Express, no Railway, no Claude API, no Stripe.

---

## File Structure

```
src/
├── App.jsx                  — root shell, nav, auth gate, fiscal week state
├── index.css                — @theme design tokens (single source of truth)
├── components/
│   ├── ui.jsx               — shared primitives (MetricCard, NT, VT, SmBtn, SH, iS, lS)
│   ├── HomePanel.jsx        — dashboard home tiles
│   ├── IncomePanel.jsx      — income / tax / rolling weekly view
│   ├── BudgetPanel.jsx      — expenses / goals / loans
│   ├── BenefitsPanel.jsx    — 401k + PTO
│   ├── LogPanel.jsx         — event log + Log Effect Summary
│   ├── WeekConfirmModal.jsx
│   ├── SetupWizard.jsx      — 6-step onboarding
│   ├── LoginScreen.jsx
│   └── ProfilePanel.jsx
├── constants/
│   ├── config.js            — FISCAL_YEAR_START, PHASES, EVENT_TYPES
│   └── stateTaxTable.js     — state tax rate table
├── hooks/useLocalStorage.js
├── lib/
│   ├── finance.js           — buildYear, computeNet, computeGoalTimeline, calcEventImpact
│   ├── rollingTimeline.js   — deriveRollingIncomeWeeks, deriveRollingTimelineMonths
│   ├── db.js                — localStorage persistence
│   └── supabase.js
└── test/                    — Vitest tests

docs/
├── active-systems.md        — PRIMARY REFERENCE: all 11 live systems, math, data flow
├── codex-memory.md          — session log + task direction digests
└── TODO.md                  — prioritized backlog
```

---

## Environments — Pick the Right One Per Task

Three persistent environments are configured in Codex settings for this repo.
**Select the environment that matches your task domain before launching.**

| Environment | Use When Working On |
|---|---|
| `authority-finance-core` | `finance.js`, `rollingTimeline.js`, `constants/`, tax math, benefits pipeline, goal surplus engine |
| `authority-finance-ui` | `components/`, `ui.jsx`, `index.css`, single panel builds, auth flows, token/style changes |
| `authority-finance-audit` | `docs/` writes, value-flow traces, quarterly audits, expense mapping, source-of-truth checks |

---

## Commands

### Always Safe in Any Environment
```bash
npm ci                  # install — use this, not npm install
npm run lint            # ESLint 9
npm run test:run        # Vitest 4, single pass — PRIMARY validation
npx vitest run -u       # update snapshots (only after intentional DEFAULT_CONFIG changes)
```

### NOT Safe in Codex Sandbox
```bash
npm run build   # FAILS — @rolldown/plugin-babel + @tailwindcss/vite spawn native .node binaries (EPERM)
npm run dev     # FAILS — same reason
npm run typecheck  # does not exist — this is JSX, not TypeScript
```

**Test config:** Vitest auto-prefers `vitest.config.js` over `vite.config.js`. The separate config intentionally omits Tailwind, Rolldown, and LightningCSS to be sandbox-safe. Do not merge them.

**Reporter:** verbose is set — always read per-test output, not just the summary line. Vitest 4's default reporter can miscount failures.

---

## Architecture Pipeline

```
SetupWizard → config
    ↓
buildYear() → allWeeks[] (52 weeks, taxableGross, grossPay per week)
    ↓
computeNet(week, config, extraPerCheck) → per-check net
    ↓
projectedAnnualNet → weeklyIncome → baseWeeklyUnallocated
    ↓
eventImpact (logs) → adjustedWeeklyDelta, grossDeltaByWeek
    ↓
taxDerived (adjustedTaxableGross) → extraPerCheck (feeds back into computeNet)
    ↓
futureWeekNets[] → computeGoalTimeline() → goal fund sequences
```

See `docs/active-systems.md` for full per-system detail on all 11 live systems.

---

## Design Tokens (Never Use Raw Hex for These)

| Token | Value | Role |
|-------|-------|------|
| `--color-accent-primary` | `#00c896` | Teal — tabs, CTAs, section bars |
| `--color-green` | `#22c55e` | Positive financial values only |
| `--color-red` | `#ef4444` | Negative / spend / risk |
| `--color-bg-base` | `#05100c` | App shell background |
| `--color-bg-surface` | `#112c1f` | Card background |
| `--color-text-primary` | `#e6f4ef` | Body text |
| `--color-text-secondary` | `#7fa39a` | Labels |

Full token table: `src/index.css` `@theme` block. Never use old amber `#c9a84c`, old green `#4caf7d`, or DM Serif/DM Sans fonts.

---

## Active Task Backlog (Route to Correct Environment)

| # | Task | Environment |
|---|------|-------------|
| 1 | Profile auth flows (change email/password, delete, global sign-out) | `authority-finance-ui` |
| 2 | Fiscal week roadmap (unified week source, goal auto-complete, daily confirm) | `authority-finance-core` |
| 3 | 50-state tax audit + Missouri marginal bracket fix | `authority-finance-core` |
| 4 | DHL benefits deduction pipeline (all premiums → pre-tax deduction in `buildYear`) | `authority-finance-core` |
| 5 | Move tax plan from Income tab → Account › Tax Plan | `authority-finance-ui` |
| 6 | Income weekly overview sticky header | `authority-finance-ui` |
| 7 | Expense calculation audit log (trace, no math changes) | `authority-finance-audit` |

Full specs for tasks 1–7: `docs/codex-memory.md` §2026-04-03.

---

## Known Gaps — Do Not Paper Over

- `buildYear()` only subtracts `ltd + k401kEmployee` pre-tax. Insurance premiums, HSA/FSA, other deductions collected in config but not applied → taxable gross overstated. Task 4 fixes this.
- `wN` fallback for unfunded goals uses `remaining / avgNet` approximation → can diverge under volatile checks. Tracked, not blocking.
- `index.html` still loads DM Serif + DM Sans (dead weight) and has stale title/PWA label. Low priority.
- `WeekConfirmModal.jsx`, `LoginScreen.jsx`, `ProfilePanel.jsx` contain hardcoded hex — tokenization tracked in TODO §10.

---

## Guardrails

- **No refactors outside explicit task scope.**
- **Preserve calculation outputs unless the task explicitly changes math.**
- **No `npm run build` in sandbox.** Use `npm run test:run` to validate instead.
- **Do not merge `vitest.config.js` into `vite.config.js`.**
- **Do not use raw hex for accent, green, or red.** Always reference tokens.
- **No new files unless the task spec requires them.**
- **Do not touch `finance.js`, `App.jsx`, or `rollingTimeline.js` from a UI-only task.**

---

## Reference Docs

| Doc | Purpose |
|-----|---------|
| `docs/active-systems.md` | All live systems — math, data flow, known issues. Read before touching any system. |
| `docs/codex-memory.md` | Session log, task direction digests, test infrastructure notes |
| `docs/TODO.md` | Prioritized backlog |
| `.claude/CLAUDE.md` | Claude Code authority doc (CC-facing mirror of this file) |
