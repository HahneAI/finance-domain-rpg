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
├── active-systems.md        — PRIMARY REFERENCE: all live systems, math, data flow
├── premium-ui-TODO.md       — Liquid Glass + premium UI polish backlog (Section §4 = glass sheen recipe)
├── account-reference.json   — ground-truth DHL account data (db_record / computed_expectations / ui_assertions)
└── TODO.md                  — prioritized backlog
```

---

## Environments — Pick the Right One Per Task

Three persistent environments are configured in Codex settings for this repo.
**Select the environment that matches your task domain before launching.**

### `authority-finance-core`
Math engine, data pipeline, persistence, fiscal logic.

| Scope | Files |
|---|---|
| Core math | `src/lib/finance.js`, `src/lib/rollingTimeline.js`, `src/lib/goalFunding.js` |
| Fiscal week | `src/lib/fiscalWeek.js` |
| Rotation / scheduling | `src/lib/rotation.js` |
| Persistence | `src/lib/db.js`, `src/hooks/useLocalStorage.js` |
| Constants | `src/constants/config.js`, `src/constants/stateTaxTable.js` |
| Tests | `src/test/lib/`, `src/test/constants/`, `src/test/hooks/` |

Use for: tax math, benefits pipeline (Task 4), fiscal week roadmap (Task 2), state tax audit (Task 3), goal surplus engine, any change to `buildYear` / `computeNet` / `computeGoalTimeline` / `calcEventImpact`.

---

### `authority-finance-ui`
Components, panels, auth flows, design tokens, PWA shell.

| Scope | Files |
|---|---|
| Root shell | `src/App.jsx`, `src/main.jsx` |
| All panels | `src/components/` (all `.jsx` files) |
| Shared primitives | `src/components/ui.jsx` |
| Design tokens | `src/index.css` |
| Auth API route | `api/delete-account.js` |
| PWA / HTML shell | `index.html`, `public/` |
| Component tests | `src/test/components/` |

Use for: Profile auth flows (Task 1), sticky header (Task 6), tax plan relocation (Task 5), any panel build or rewrite, token/style changes, PWA label cleanup.

---

### `authority-finance-audit`
Docs, task specs, value-flow traces, design references.

| Scope | Files |
|---|---|
| Task specs | `docs/codex-task-1` through `docs/codex-task-7` |
| Audit logs | `docs/audit-log.md`, `docs/codex-test-output.txt` |
| Audit scripts | `scripts/generate-audit-log.mjs` |
| Active systems | `docs/active-systems.md`, `docs/TODO.md`, `docs/premium-ui-TODO.md` |
| Design refs | `docs/authority-design-system`, `docs/Authority-Company-Branding` |
| Supporting docs | `docs/dhl-sprint-bugs.md`, `docs/state-tax-math-helper.md`, `docs/account-reference.json` |

Use for: expense calculation audit log (Task 7), quarterly switch audits, source-of-truth checks, value-flow tracing, any `docs/` write.

---

### No Environment — CC Only (Do Not Touch in Codex)
`vite.config.js`, `vitest.config.js`, `eslint.config.js`, `package.json`, `package-lock.json`

These are build/toolchain config files. Changes here require full-host build verification that is not possible in the Codex sandbox. Route to Claude Code.

---

## Environment Enforcement

Every task must declare three fields at the start:
- `environment_domain` — which environment this task belongs in
- `allowed_environment_domains` — list of environments whose file scope this task touches
- `environment_reason` — one sentence explaining why

**Codex cannot inspect its own active environment identifier at runtime.** The environment name is not exposed as a readable variable inside the sandbox. Therefore enforcement is scope-based, not runtime-introspection-based.

### Before making any code changes, check scope — not identity:

Check whether the files the task requires are in scope for the declared `environment_domain` per the routing table above.

**Case 1 — True scope mismatch** (task files clearly belong to a different environment):

Stop immediately. Return:
```json
{
  "status": "ENVIRONMENT_SCOPE_MISMATCH",
  "declared_environment": "<environment_domain from task>",
  "reason_task_does_not_belong_here": "<which files/domains conflict and why>",
  "recommended_environment": "<correct environment per routing table>"
}
```

Do not partially implement. Do not "attempt anyway."

**Case 2 — Runtime environment not inspectable** (scope looks correct but environment ID cannot be confirmed):

Proceed. Return this header before any code changes:
```json
{
  "status": "ENVIRONMENT_UNVERIFIED",
  "declared_environment": "<environment_domain from task>",
  "runtime_environment_visibility": "not_exposed",
  "proceeding_based_on_declared_task_environment": true
}
```

Then continue with the task normally. The scope check passed — "cannot verify identity" is not a stop condition.

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

**Prefer pure JS solutions.** If a task can be solved without native binaries, system calls, or compiled modules, do it that way. Sandbox EPERM errors are not recoverable mid-task.

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

## Liquid Glass Premium UI

**Component:** `src/components/LiquidGlass.jsx`
**Props:** `tone` ("teal"|"blue"|"purple") · `intensity` ("light"|"strong") · `withBorder` · `purpose` (required, guards against misuse) · `style` (spread last — overrides defaults) · `className`

### Placement whitelist (`ALLOWED_PURPOSES`)

| `purpose` | Where used | `tone` |
|-----------|-----------|--------|
| `"pulse"` | `InsightRow` in `ui.jsx` — glass pill on MetricCards with `insight` prop | blue / purple |
| `"nav"` | Floating bottom nav pill in `App.jsx` | teal |
| `"log-summary"` | Log Effect Summary container in `LogPanel.jsx` | teal |
| `"modal"` | Reserved — not yet wired | teal |

**To add a placement:** update `docs/premium-ui-TODO.md` §4 first, then extend `ALLOWED_PURPOSES` in the component. Dev logs a warning on any unwhitelisted purpose.

**Never** apply `LiquidGlass` to primary MetricCards, data tables, or buttons.

### `MetricCard` — `visualTier` prop

Accepts `visualTier="glass"` or `"overlay"`. Modifies `containerStyle` in-place (no extra wrapper element):
- `"glass"`: blur 12px · tint `rgba(0,200,150,0.08)` · border `rgba(0,200,150,0.20)`
- `"overlay"`: blur 20px · tint 0.12 · border 0.28
- Default (no prop): unchanged solid bg-surface behaviour

### Glass sheen recipe (nav pill — 2026-04-12 starting point)

5-layer raised glass effect. Apply via `style` prop overrides + one `pointerEvents:none` child sheen div:

```
background:  rgba(0, 200, 150, 0.15)           // tint α bump (default 0.10)
border:      1px solid rgba(0, 200, 150, 0.40)  // border α bump (default 0.24)
boxShadow:   0 8px 32px rgba(0,200,150,0.22),   // outer teal ambient glow
             0 4px 16px rgba(0,0,0,0.55),        // dark lift/elevation
             inset 0 1px 0 rgba(255,255,255,0.10) // inner top rim highlight
sheen child: linear-gradient(180deg, rgba(255,255,255,0.09) 0%, transparent 100%)
             position:absolute top:0 left:0 right:0 height:45% pointerEvents:none zIndex:1
```

**α variation presets** (outer glow / sheen / tint / border):

| Preset | Values | When to use |
|--------|--------|-------------|
| Subtle | `0.10 / 0.05 / 0.10 / 0.24` | Background glass, log-summary |
| **Standard** (nav) | **`0.22 / 0.09 / 0.15 / 0.40`** | Floating nav — current shipped |
| Prominent | `0.28 / 0.12 / 0.18 / 0.48` | Modal overlays, focus surfaces |
| Dark/muted | `— / 0.05 / 0.10 / 0.20` | Pulse rows (no color glow) |

Full detail: `docs/active-systems.md` §13 · `docs/premium-ui-TODO.md` §4.

---

## Account Reference File

`docs/account-reference.json` — ground-truth data for Anthony's primary DHL account. Three sections:

1. **`db_record`** — raw Supabase `user_data` row (config, logs, expenses, goals, week_confirmations, pto_goal)
2. **`computed_expectations`** — values `finance.js` / `rollingTimeline.js` should derive from that record
3. **`ui_assertions`** — what each panel should display (used for QA and integration test expected values)

**When writing tests against real account behavior, cross-reference this file.** Never fabricate expected values — derive from `db_record`. Update `last_updated` + the changed section whenever config or data changes.

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

### Task Direction Digests

**Task 1 — Profile auth actions**
Complete change-email, change-password (with current-password confirmation), delete account (secure backend route + Supabase admin API — never client-exposed), and global sign-out. All actions must be reachable in Profile UI with loading/error/success states. Use `supabase.auth.updateUser`, `supabase.auth.signOut({ scope: 'global' })`.

**Task 2 — Fiscal week roadmap**
Audit and finish: centralized week awareness (Week X of 52), goal auto-complete on funding, weekly projected-vs-actual day confirmation, goal timeline surplus sourced from per-week net outputs (not flat averages). Audit-first, avoid duplicate date logic, preserve existing behaviour where correct.

**Task 3 — 50-state tax audit**
Classify all states as no-tax / flat / bracketed. Flat = one rate, bracketed = marginal math, no-tax = zero. Verify Missouri marginal thresholds specifically. Data-driven table design, no hardcoded flat approximations for bracketed states.

**Task 4 — DHL benefits deduction pipeline**
Wire every payroll-deducted benefit (medical, dental, vision, LTD, STD, life, HSA/FSA, 401k) from Account/Profile editing → saved state → `buildYear()` pre-tax deduction. No invented defaults. Keep editing authoritative in Account/Profile; remove conflicting duplicate edit surfaces.

**Task 5 — Move tax plan to Account › Tax Plan**
Relocate Income tab's tax strategy/planning sections into Account › Tax Plan. Reuse existing components/handlers — no logic duplication. No tax math changes. Clean any layout gaps left behind.

**Task 6 — Income weekly overview sticky header**
Add pinned header row to the weekly chart/table. Column alignment must track horizontal scroll if present. Clean layering/background/z-index — no chart redesign or data math changes.

**Task 7 — Expense calculation audit log**
Trace expense calculation path from income through intermediary transforms to quarterly splits. Log each transition step in `docs/audit-log.md`. Audit only — no calculation modifications.

---

## Known Gaps — Do Not Paper Over

- `buildYear()` only subtracts `ltd + k401kEmployee` pre-tax. Insurance premiums, HSA/FSA, other deductions collected in config but not applied → taxable gross overstated. Task 4 fixes this.
- `wN` fallback for unfunded goals uses `remaining / avgNet` approximation → can diverge under volatile checks. Tracked, not blocking.
- `index.html` still loads DM Serif + DM Sans (dead weight) and has stale title/PWA label. Low priority.
- `WeekConfirmModal.jsx`, `LoginScreen.jsx`, `ProfilePanel.jsx` contain hardcoded hex — tokenization tracked in TODO §10.

---

## Guardrails

- **One task = one PR.** Do not bundle unrelated changes into a single commit or branch.
- **No refactors outside explicit task scope.**
- **Do not modify unrelated files.** If a file isn't in the task spec, don't touch it.
- **Preserve calculation outputs unless the task explicitly changes math.**
- **Do not introduce build-breaking changes.** If you can't run `npm run build` in sandbox, verify with `npm run test:run` and `npm run lint` at minimum — do not ship code you know is broken.
- **No `npm run build` in sandbox.** Use `npm run test:run` to validate instead.
- **Do not merge `vitest.config.js` into `vite.config.js`.**
- **Do not use raw hex for accent, green, or red.** Always reference tokens.
- **No new files unless the task spec requires them.**
- **Do not touch `finance.js`, `App.jsx`, or `rollingTimeline.js` from a UI-only task.**
- **`HomePanel.jsx` is encoding-sensitive.** Prior Codex sessions corrupted this file twice with mixed CRLF/duplicate blocks. Write clean LF-only output and do not append stray JSX after closing braces.

---

## Task Output Format

When completing any task, return a structured summary in this format:

```
files_changed:         [list every file modified, created, or deleted]
changes_made:          [one sentence per file — what changed and why]
affected_calculation_paths: [which pipeline stages were touched, if any — buildYear / computeNet /
                        computeGoalTimeline / calcEventImpact / rollingTimeline / none]
validation_result:     [output of npm run lint && npm run test:run — pass / fail + relevant lines]
new_risks_detected:    [any regressions, edge cases, or known gaps introduced or observed]
```

`affected_calculation_paths` is required even when the answer is "none" — it forces an explicit check that UI or config changes did not inadvertently reach the finance pipeline.

---

## Reference Docs

| Doc | Purpose |
|-----|---------|
| `docs/active-systems.md` | All live systems — math, data flow, known issues. Read before touching any system. |
| `docs/premium-ui-TODO.md` | Liquid Glass + premium UI polish backlog. §4 = glass sheen recipe + variation presets. |
| `docs/account-reference.json` | Ground-truth DHL account data for tests and QA. |
| `docs/TODO.md` | Prioritized backlog |
| `.claude/CLAUDE.md` | Claude Code authority doc (CC-facing mirror of this file) |
