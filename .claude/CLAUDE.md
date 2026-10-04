# CLAUDE.md — Authority Finance

## Product
**Company:** Authority | **Product:** Authority OS | **Tagline:** *"You are missing out… on you."*
**This app:** Authority Finance (A:Fin) — personal finance dashboard: income modeling, budgeting, goals, event logging.
**Design system:** Flow shell (live) + Pulse overlay (Phase 2). See `docs/authority-design-system`.
**Liquid Glass UI:** `src/components/LiquidGlass.jsx` — frosted glass for nav, pills, modals. Recipe in `docs/active-systems.md` §1.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Auth + DB | Supabase (auth live, localStorage→Supabase migration path) |
| Testing | Vitest + Testing Library |
| PWA | vite-plugin-pwa (manifest + service worker active) |
| Hosting | Vercel |

**No standalone backend server** — but no longer "pure frontend": `api/` holds 12 Vercel
serverless functions (Stripe checkout/webhook/portal/revive, Coach streaming proxy, daily
subscription-lifecycle cron + email engine, delete-account, revival-lookup, admin-changelog for
the "What's New" authoring surface, `admin-beta-hub.js` for the Beta Homebase's checklist/
suggestion content + rubric scores (dispatched on `entity`: "content" | "score"), plus
`api/seed.js` — a single route dispatched on `body.type` ("beta" | "investor" | "trial") that
consolidates what used to be three separate seed-beta/seed-investor/seed-trial functions). All
privileged writes (tier flags, subscription columns, changelog entries, beta content/scores) go
through these service-role routes — the client never writes them (RLS migration 019).

**Vercel Hobby-plan function cap:** a deployment can include **at most 12 Serverless Functions**
(one per non-`_`-prefixed file in `api/`) on the free Hobby plan — exceeding it fails the build
outright ("No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan").
This repo hit 13 once (adding `admin-changelog.js` tipped it over) and was brought back under the
cap by merging seed-beta/seed-investor/seed-trial into the one `api/seed.js` above — same fix to
reach for again if a future route addition trips this same failure, rather than assuming it's a
rate limit or a real Vercel outage. **Currently sitting at 12/12 — zero headroom** (the Beta
Homebase's `admin-beta-hub.js`, 2026-08-06, spent the last free slot by design — everything
tester-facing in that feature reads/writes Supabase directly under RLS instead of adding routes).
Consolidation candidates if another route is needed: the three `stripe-*.js` routes remain the
next most mergeable group (same shape, different Stripe action).

---

## Git PR Flow

**Three-tier pipeline:** `claude/*` feature branches → `Version-control` (integration) → `master` (production). Push to feature branches; user merges to Version-control, then to master. For systematic cross-file updates (e.g. section numbering), use placeholder-based two-pass replacement (`§15` → `__SECTION_15__` → `§1`) to prevent regex overlap when replacing multiple references simultaneously.

### Numbering collision check — MANDATORY, run it twice

**Run before pushing AND again right after merging `Version-control`** whenever you add a
`docs/TODO.md` section, a `database/migrations/` file, or a `drift-app-warden.md` F-entry:

```bash
{ grep -oE '^## [0-9]+\.' docs/TODO.md | sort | uniq -d | sed 's/^/TODO heading /'
  grep -oE '^\| [0-9]+ \| [0-9]+ \|' docs/TODO.md | awk -F'|' '{print $3}' | sort -n | uniq -d | sed 's/^/TODO index §/'
  ls database/migrations/*.sql | sed -E 's#.*/([0-9]+)_.*#\1#' | sort | uniq -d | sed 's/^/migration /'
  grep -oE '^\*\*F[0-9]+ ·' docs/drift-app-warden.md | sort | uniq -d | sed 's/^/warden /'
} | grep . || echo "no numbering collisions"
```

**Why "after merging" is the half that matters: git will not catch this for you.** Two branches
appending `## 27.` at *different* points in a long file do not overlap textually, so the merge
auto-resolves clean with no conflict and no warning — the file just quietly ends up with two
`## 27.` headings and two Priority Index rows. Every collision so far was found by eye, after the
fact. This has now happened four times: F-numbers once, TODO §27 twice (Job Hunt OS vs React
upgrade, then again vs Location-Aware Claim Date), and §28 once (Coach over SMS vs React upgrade,
2026-10-04 — a renumber that *itself* collided on the next merge). "Pick the next free number"
is not enough, because a sibling branch picked the same next-free number an hour ago.

**Resolution rule:** the number stays with whichever entry **already landed on `Version-control`
AND is already cross-referenced**; the later writer renumbers. Grep the number across `docs/`
before choosing — an entry cited from other docs is expensive to move, an hour-old one is not.
Use the placeholder two-pass above only for a genuinely cross-file renumber; a 2–4 site renumber
is safer done directly, asserting an exact match count per edit.

**Known open collisions (pre-existing, not yet resolved):** `drift-app-warden.md` has **two F161
entries** (§7 Setup Wizard Schedule+Tax merge / Bulk Edit `monthlyOverrides` regression, DW-20)
and **two F162 entries** (§7 blur-gated reveals / duplicate PWA manifest, DW-21). Both sides of
both pairs are cited from 4+ docs, so renumbering needs its own pass — until then, always
qualify which one you mean. The check above reports these every run; that is expected, not a
new failure.

**Next free numbers (verify, do not trust):** TODO `§31` · migration `048` · warden `F181`.

---
## Commands
```bash
npm run dev         # Vite dev server (needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
npm run build       # vite build — the only check that exercises the React Compiler (see Testing)
npm run lint        # eslint .
npm run test:run    # Vitest single pass — use this to verify changes
```

## Doc map — if you're touching X, read Y first
| Touching | Read |
|---|---|
| Anything in a mapped area (wizard, 5 panels, auth, paywall, fiscal math, persistence, entitlements, AI, design system, admin) | `docs/drift-app-warden.md` — that section's trigger map |
| How a live system works | `docs/active-systems.md` (Coach/AI context: §6/§24 grounding rule first) |
| Setup wizard | warden §7 (gate matrix §7.3); `active-systems.md` §9 |
| Design tokens / typography | `docs/design-system-source-of-truth.md`, warden §22 |
| Migrations / schema | `database/migrations/README.md` |
| Backlog / shipped log | `docs/TODO.md` / `docs/past-TODO-tasks.md` |
| Account ground truth | `docs/account-reference.json` |


## File Structure
```
src/
├── App.jsx                  — root shell, nav, auth gate, fiscal week state
├── index.css                — @theme design tokens (single source of truth)
├── components/
│   ├── ui.jsx               — shared primitives (MetricCard, NT, VT, SmBtn, SH, iS, lS)
│   ├── HomePanel.jsx        — dashboard home tiles + the Claim Date goal surface
│   ├── IncomePanel.jsx      — income / tax / rolling weekly view
│   ├── BudgetPanel.jsx      — expenses / goals / loans
│   ├── LogPanel.jsx         — event log + Log Effect Summary
│   ├── WeekConfirmModal.jsx — weekly schedule confirmation
│   ├── TipsCommissionCheckIn.jsx — small daily check-in card (tips/commission opt-in, skinned bonus-log mechanism)
│   ├── SetupWizard.jsx      — multi-step onboarding (see Setup Wizard section below)
│   ├── SetupWizardAdlib.jsx — REAL production wizard for first-run onboarding + lost_job/commission_job re-entry, "fill-in-the-blank" style (see Setup Wizard section below)
│   ├── LoginScreen.jsx      — auth shell
│   ├── BetaHomebase.jsx     — tracked-beta-tester-only page (real nav-stack view, not a modal — see App.jsx's `navigate("betaHomebase")`): rubric score, feature checklist, suggestion feed, changelog recap
│   ├── ProductivityHub.jsx  — "Money Moves": base-user counterpart to BetaHomebase (every non-tracked-tester user), same page treatment, same checklist/tips/feedback flow minus scoring; reuses BetaHomebase's exported section components
│   └── ProfilePanel.jsx     — account + employment settings
├── constants/
│   ├── config.js            — FISCAL_YEAR_START, PHASES, EVENT_TYPES, DHL_PRESET, BENEFIT_OPTIONS
│   └── stateTaxTable.js     — state tax rate table
├── hooks/useLocalStorage.js
├── lib/
│   ├── finance.js           — buildYear, computeNet, computeGoalTimeline, calcEventImpact
│   ├── rollingTimeline.js   — deriveRollingIncomeWeeks, deriveRollingTimelineMonths
│   ├── fiscalWeek.js        — FISCAL_WEEKS_PER_YEAR, week index helpers
│   ├── configHistory.js     — §3 sensitive-field whitelist + diff gating account_history capture
│   ├── db.js                — localStorage persistence
│   └── supabase.js          — Supabase client
└── test/                    — Vitest tests
docs/                        — project documentation
database/migrations/         — Supabase SQL migrations (see BOOKMARK note below)
```

---

## Setup Wizard
**`SetupWizardAdlib.jsx` is the only mounted wizard** — a cascading "fill-in-the-blank" flow: 4 employed pages
(Intake, Schedule+Tax, Deductions, Wrap Up) + 3 native jobless pages. `App.jsx` mounts it whenever
`wizardEntry !== null` (`false` = first-run; a life-event string = re-entry). `SetupWizard.jsx` is **no longer
mounted** — retained only as the export home of `LIFE_EVENTS` / `DIFF_FIELDS` / `StructureChangeDiff`.
**Read `docs/drift-app-warden.md` §7 (trigger map + §7.3 gate matrix) before any change here.**
Full implementation reference: `docs/setup-wizard-reference.md`; overview: `docs/active-systems.md` §9.

- **One save path:** every finish runs `finalizeWizardConfig()` (`src/lib/wizardComplete.js`) → `onComplete()` →
  `handleWizardComplete()` (eager save, configHistory tag, food seed). Never add a second normalizer.
- **`lifeEvent`** = `null | structure_change | lost_job | changed_jobs | commission_job`. `structure_change`
  is the only menu entry; the other three are reached via the wizard's internal `LifeEventPivot`. Re-entry
  pre-fills from config; first-run is **blank-by-default** (`BLANK_PAY_FIELDS` — a new asked field must be
  added there, and a cleared `InlineSelect` must resolve to `null`, not a falsy default).
- **Required-field parity:** each page's `isXValid()` is a line-for-line mirror of the real `STEP_DEFS`
  `isValid` — change both or neither (warden §7 F7).
- **Number-gated reveals fire on blur, not per keystroke** (`InlineNumber onCommit` + `useCommitTracking`) — F162.
- **DHL:** `dhlSite` `"PLANT"` | `"WAREHOUSE"` (absent = Plant, no migration); `getDhlPlannedDayIndexes()` /
  `getDhlPlannedPattern()` in `finance.js` are the single day-pattern source (`active-systems.md` §11).
- **New wizard-asked field → four-site procedure** incl. `HISTORY_SENSITIVE_FIELDS` (`src/lib/configHistory.js`)
  — two gaps were already found there (F136).
- **Block-level children inside a sentence `<p>` throw only a console warning** (F137) — watch test output.


---

## Employer Preset Naming Convention

**Adopted 2026-04-29.** DHL is the first employer preset; the pattern generalizes to future partners (Amazon, FedEx, etc.).

| Variable | Meaning | Derived from |
|----------|---------|--------------|
| `isEmployerDHL` | User has the DHL employer preset | `config.employerPreset === "DHL"` |
| `isBaseUser` | User has no employer preset | `!isEmployerDHL` (currently; more precisely `!config.employerPreset`) |
| `isEmployerAmazon` | (future) User has Amazon preset | `config.employerPreset === "AMAZON"` |

**Rules:**
- Every component/function that gates on employer type must declare `const isEmployerDHL = config.employerPreset === "DHL"` locally (or receive it as a prop).
- Every component that gates base-user behavior must also declare `const isBaseUser = !isEmployerDHL` immediately after.
- Prop names follow the same pattern: `isEmployerDHL={isEmployerDHL}` (not `isDHL`).
- The Supabase column was renamed from `is_dhl` → `is_employer_dhl` via migration `014_rename_is_dhl_to_is_employer_dhl.sql`. In JS, `loadUserData()` maps it to the `isEmployerDHL` property.
- Source-code comments say "base user" (not "non-DHL"). Doc files use whatever phrasing is clearest.

---

## UI Component Standards

### Shared Primitives (`src/components/ui.jsx`)
| Export | What it is | Key props |
|--------|-----------|-----------|
| `MetricCard` / `Card` | Static + interactive metric card | `label`, `val`, `sub`, `status` (`green\|teal\|red`), `onClick`, `rawVal`, `entranceIndex`, `span` |
| `NT` | Nav tab | `label`, `active`, `onClick` — teal fill when active |
| `VT` | View tab | Same as NT, smaller padding |
| `SmBtn` | Inline utility button | `children`, `onClick`, `c`, `bg` |
| `SH` | Section header | `children`, `color`, `right` — teal left-bar + uppercase |
| `iS` | Input style object | Spread onto `<input>` / `<select>` — JetBrains Mono, 16px |
| `lS` | Label style object | Spread onto `<label>` — 10px, 2px tracking, uppercase |

**Layout:** card gap `12px` · section `marginBottom` `20px` · card pad `18px 16px` (static) / `16px 18px` + `minHeight: 88px` (interactive).

**Button pattern:** CANCEL — bg-raised, text-secondary, border-subtle, radius 12px, pad 7px 14px, 10px uppercase. SAVE — bg-teal/green, color bg-base, radius 12px, pad 8px 16px, 10px bold uppercase.

### Panel naming — "Upkeep", not "Budget"

The Budget panel is **Upkeep** everywhere a user can read it; route keys, `BudgetPanel.jsx`,
`data-coach-ref` targets and `sessionStorage` keys still say `budget` (deliberate — a rename touches copy
only). Any surface that prints a view key instead of a label leaks the internal name (`VIEW_LABELS` in
`App.jsx`); `navigate_to`'s `panel` enum and `PANEL_VIEW_KEYS` are one unit. Screen any future panel name by
grepping it against existing vocabulary first ("Runway" was already taken twice). Warden §8 F178.

### The Claim Date (goal surface)

HomePanel goals lead with the **date**, not the dollar target (`CLAIM DATE` label, `✓ CLAIM IT` action,
"Next Claim Date" hero + `then …` queue). **Presentation only:** every date traces to
`resolveGoalFinishInfo()` — never compute one from anything else. The goal card body is **duplicated verbatim**
between the mobile and desktop branches; edit as a pair. Warden §8 F177.

### Numeric Input Standard
**Never coerce on `onChange`.** Use string draft state (`field ?? ""`); only `parseFloat` at commit (blur/save). For required fields, pass `attempted` bool — show red label + border + `↑ Required` when `attempted && fieldEmpty`. Reference implementation: `Field` + `errBorder` in SetupWizard.

### Animation Rules
- Entrance stagger: `entranceIndex` on MetricCard → `fadeSlideUp` 400ms, 80ms/card, capped 400ms
- Countup: `rawVal` → 0→target 1200ms on mount/change · value flash → teal 150ms, fades 600ms
- **No bounce, no spin, no scale-up on mount. Press = `scale(0.97)` only. All ≤ 500ms except countup.**

---

## UI Design System — Color Tokens (`src/index.css` `@theme`)
**Never use raw hex for accent, green, or red. Always reference tokens.** Source of truth for values:
`src/index.css` `@theme` (extracted + file:line cited in `docs/design-system-source-of-truth.md` §1).

- Surfaces: `--color-bg-base` / `-surface` / `-raised` / `-gradient` · Borders: `--color-border-subtle` / `-accent`
- Accent/CTA: `--color-teal` (= `--color-accent-primary`) · Positive/income: `--color-green` · Negative/risk: `--color-red`
- Soft deduction rows: `--color-deduction` (same hue as red, ~80% lightness) · Attention: `--color-warning`
- Text: `--color-text-primary` / `-secondary` / `-disabled`
- Status: `green` = positive/ahead · `teal` = attention/mixed · `red` = risk/behind
- **Pulse tokens** (`--color-signal-*`) are Phase 2, reserved for the AI insight overlay — never on Flow elements.

**Fonts — never hardcode a family; use `var(--font-display)` / `var(--font-sans)` / `var(--font-mono)`.**
Display (Titillium Web) = headings, hero text, large numeric emphasis. Sans (Rajdhani) = everything else,
incl. ALL buttons/tabs/chips and ALL form inputs. Mono (JetBrains Mono) = read-only data display only,
**never a form field**. Headings: hero 900 / `0.04em` / `1.15`; secondary 800 / `0.02em` / `1.15`; not for
numeric emphasis. Detail: `docs/design-system-source-of-truth.md` §2, warden §22.

**Body-text scale.** Non-numeric text MUST use `.text-2xs` 11px · `.text-xs` 12 · `.text-sm` 13 · `.text-base` 14 ·
`.text-md` 15 — never a raw inline `fontSize` for label/body copy. Enforced by
`src/test/lib/textUtilityClassAudit.test.js` (exact per-file raw-literal counts; a new literal fails
`npm run test:run`). **Never wrap the `.text-*` block in `@layer`** — they collide by name with Tailwind v4
defaults and win only because they are unlayered; see the warning comment above that block in `src/index.css`.


## Persistence — Eager Save Pattern
**Every new Save/Confirm/Add/Delete action must call an eager save, not rely solely on the debounce.** `App.jsx` also runs a background debounced autosave (800ms after any `config`/`expenses`/`goals`/`logs`/`weekConfirmations` change) — that's fine for continuous edits (typing, live sliders), but a discrete "I'm done with this action" gesture that only relies on it can lose the change if the tab gets backgrounded/reclaimed before the debounce fires (mobile Safari does this aggressively). This caused real data loss in production (setup wizard, weekly check-ins, tax-plan toggles, goals/expenses/log entries) before every action below was audited and fixed — don't reintroduce the gap in new code.

**The rule:** any handler for a button whose label is essentially "Save," "Confirm," "Add," "Delete," or a per-item toggle (not a live-typing field) must compute the new value *synchronously* and pass that same value to both the local `setState` and the matching eager-save callback — never rely on a bare `setState(prev => ...)` alone for one of these.

| Field | Eager-save callback | Defined in |
|-------|---------------------|------------|
| `config` | `saveConfigNow(newConfig)` | `App.jsx`, threaded to `ProfilePanel`/`IncomePanel`/`LogPanel`/`HomePanel` |
| `goals` | `onSaveGoalsNow(newGoals)` | `App.jsx`, threaded to `HomePanel` |
| `expenses` | `onSaveExpensesNow(newExpenses)` | `App.jsx`, threaded to `BudgetPanel` |
| `logs` | `onSaveLogsNow(newLogs)` | `App.jsx`, threaded to `LogPanel` |
| `ptoGoal` | `onSavePtoGoalNow(newPtoGoal)` | `App.jsx`, threaded to `LogPanel` |

All five are thin wrappers over `savePersistedStateNow(overrides, historySource)` (`App.jsx`) — the general eager-save primitive: cancels the pending debounce, merges `overrides` onto the latest known full state, writes immediately, retries once on failure, and surfaces `SaveFailedBanner` (with the real Supabase error text) if the retry also fails.

**Pattern:**
```js
const handleSave = () => {
  const next = { ...currentValue, ...patch };   // or newArray.map/filter/concat — computed, not a functional updater
  setTheState(next);
  onSaveXNow?.(next);
};
```
For a value only reachable inside a `setState` updater (e.g. a handler delayed via `setTimeout`, where the outer closure's value could be stale by the time it fires), capture the computed result *through* the updater instead of bypassing it:
```js
let next;
setTheState(prev => { next = /* derive from prev */; return next; });
onSaveXNow?.(next);
```
For a file with many call sites mutating the same field (see `BudgetPanel.jsx`'s `applyExpenseUpdate`), wrap `setState` once in a helper that captures and eager-saves the updater's result, then convert each call site by renaming the outer function call only — don't hand-transcribe complex per-item transformation logic.

**Do NOT** add eager save to:
- Plain text/number input `onChange` — stays on the debounce, that's what it's for.
- Continuous/high-frequency events (`dragover`, live drag preview) — verify a reorder handler fires once on drop/dragend before wiring it up, not on every pointer move, or it'll fire a network write per pixel.
- `useEffect`-driven derived-state sync (e.g. auto-recalculating a goal's projected due date whenever the timeline changes) — that's recomputed automatically from other data on every relevant render, not a user action; if a write is ever lost it just recomputes the same correct value again next load.

**readOnly gate:** `HomePanel`/`BudgetPanel` shadow their setters (and now their eager-save callbacks) with no-ops when `readOnly` (paywall-expired) is true — see the `noop` pattern near the top of each. Any new eager-save prop threaded into a component with this gate must be shadowed the same way, or a read-only account could bypass the paywall via the eager-save path even though the local `setState` is a no-op.

**Encryption at rest:** no persisted field has field-level encryption today — protection is TLS + RLS only (migration 019). That's fine for everything currently collected, but a future field carrying regulated/high-sensitivity data (SSN, DOB, bank/routing, government ID) must NOT just ride the ordinary four-site persisted-field procedure — see `docs/drift-app-warden.md` §19 F120 for the required trigger check, and `docs/TODO.md` §11 (Data Encryption) for the open tracking item.

---

## Drift App Warden — MANDATORY drift check before believing a change is done

**`docs/drift-app-warden.md`** is the app's drift ledger: for every critical formula,
function, pattern, and AI-context point it answers *"I am changing X — what Y must I check
before X counts as done?"* It exists because the app's dominant failure mode is no longer
locally-wrong code but **drift** — a locally-correct change that silently invalidates a
distant system (six documented real incidents are catalogued there as case law: parallel
formulas, retroactive recompute, lost saves, gate bypass, stale docs, and a React-Compiler
miscompilation invisible to the entire test suite — §12.4).

- **Before changing** anything under a mapped section (Setup Wizard, the 5 panels —
  Home, Income, Budget, Log, Account — Auth, Login, Paywall, UI-UX, or the shared
  spines — fiscal math, persistence, entitlements, AI context, design system, admin
  toolkit), read that section's drift trigger map and run its checks. State in the commit/PR which entries were consulted; "none applicable" is valid,
  silence is not.
- **Two categories, one fork:** every mapped item is either **LEDGER** (L — computes/stores
  truth; drift = silently wrong numbers; hunt via cross-check against the single
  source-of-truth function) or **GATEWAY** (G — routes/gates/presents; drift = wrong
  surface for the wrong tier/mode; hunt via walking the full gate matrix).
- **Keep it current in the same PR** — a stale drift-map entry certifies a false checklist,
  which is worse than none. `active-systems.md` describes what exists; the warden doc maps
  what breaks what — never duplicate between them.
- This document is the foundation for a future **Drift Warden AI agent** that will be
  mandatory for all development-team changes — write entries machine-actionable (named
  triggers, named blast radii, executable procedures), never as prose warnings.
- A live-testing pass is this mandate in practice — see the Development Workflow section below
  for the two skills that drive one end to end.

---

## Shotgun Coding Protocol — vocabulary every AI model must know

**"Shotgun coding"** is Anthony's named speed-scaffold protocol. When he says *"it's time to do some
shotgun coding"*, this session builds **25% of the open Tier 1 items** in `docs/TODO.md` (rounded up,
in the Priority Index's build order), with the AI making every design decision itself — no clarifying
questions. **Full protocol, guardrails, and the decision journal: `docs/shotgun-coding.md` — read it
before starting a run.**

| Mark in `docs/TODO.md` | Meaning |
|---|---|
| `- [ ]` | Open |
| `- [x]` | Done and human-verified |
| `- [$]` | **Built in a shotgun run** — code + passing tests, but Anthony hasn't reviewed/tested it yet. Never flip `$`→`x` yourself. |

Each run adds a timestamped entry to the journal in `docs/shotgun-coding.md`: one block per feature, **max 5
lines of prose** (built / chose / other options / built off / optional trade-off) **plus a 3–4 item test checklist**
(the checklist doesn't count toward the 5), and a ≤3-line footer. Shotgun mode skips questions, **not** the Drift
Warden check, eager-save rule, 12-function Vercel cap, or the no-destructive-migration/no-live-money rules in
the protocol doc. Automated live tests add a single `> 🧪 Live test …` comment under a checklist item (✅/⚠️/❌ + evidence) and
never tick the box — only Anthony does.

---

## Development Workflow
**30-min sprints, 4×/week.** Before: state the task clearly. After: commit + one-sentence summary.
- `docs/active-systems.md` — how every live system works. **Working on Coach/AI context?** Read
  §6 first — it documents the grounding pattern (every context field must resolve through the
  same authoritative function the UI itself uses, e.g. `computeGoalTimeline()`,
  `getEffectiveAmountForMonth()` — never a parallel approximation) that live testing had to
  rediscover through several real bugs. Skipping it reintroduces those bugs.
- `docs/TODO.md` — prioritized backlog, grouped in 4 tiers with a Priority Index (open items; closed subsections are archived to `past-TODO-tasks.md`)
- `/skill-menu` (skill, `.claude/skills/skill-menu/`) — chat display of which staged plugins are enabled vs disabled (`scripts/plugin-toggle.mjs`, `.claude/plugins-staging/README.md`)
- `docs/shotgun-coding.md` — the Shotgun Coding protocol + its decision journal (see section above)
- `docs/past-TODO-tasks.md` — completed work log (one-liner per shipped item, for historical context)
- `docs/account-reference.json` — Anthony's primary account ground truth
- `docs/live-testing-checklist.md` — the live-testing punch list. Say "live test the app," "run
  a testing pass," or name a checklist item to trigger the account-level
  **`authority-finance-live-test`** skill — it drives the real app against the shared test
  account and encodes the whole find → fix → test → document → commit → push loop, including
  the drift-doc conventions above. Anything touching Ask Coach specifically goes through
  **`authority-finance-coach-live-test`** instead — it has its own token-budget/scoped-API-key
  handling since it calls Anthropic directly and real money is on the line.

**Migrations:** next real migration is **048** (042–047 exist) — always verify against
`database/migrations/` before numbering; this note has gone stale five times (the Git PR Flow
section's numbering collision check covers this — run it when adding a migration). `0NN_BOOKMARK_*` files
(latest `038_BOOKMARK_schema_snapshot_2026-08-06.sql`) are schema snapshots, **never** a pending
migration. Per-migration history, and the 036/037 production-confirmation note:
`database/migrations/README.md`. Serverless cap + migration pointer: `docs/active-systems.md` §27.

---

## Plugins
Account-level plugins (agent-protocols, product-management, design, pwa2play) load in every session —
index in `docs/plugin-index.md`. Staged repo plugins: `/skill-menu`. **Rule:** a plugin skill that proposes
a change to a Drift-Warden-mapped area still requires the drift check above before the change counts as done.

**Adopting a staged or third-party skill / command / agent — MANDATORY 5-step check.** Run it whenever you
enable one (`node scripts/plugin-toggle.mjs enable <plugin>`) or are asked to adapt one; do not enable and walk
away. The enabled copies are plain in-repo markdown, so edit them in place (the toggle script only adds/removes
`.disabled`; verified it never restores upstream text).
1. **Read it for generic assumptions that clash with this file** — TS/style defaults (`function` keyword, Props
   types, "avoid try/catch"), auto-commit/push, anything that skips the drift check or the eager-save rule.
2. **Add the hard rules that apply** — eager-save handlers stay synchronous, keep `"use no memo"`, never inline
   the single-source finance functions, design tokens + `.text-*` scale, 12-function `api/` cap, naming
   conventions (see `.claude/agents/code-simplifier-code-simplifier.md` for a worked example).
3. **Make anything that writes or runs on its own request-only** — remove "autonomous/proactive" wording; no
   commits or pushes unless asked.
4. **Run it once on a small, low-risk target** and check its report before trusting it near `HomePanel` /
   `App.jsx` / anything Drift-Warden-mapped.
5. **Commit it on its own `claude/*` branch.**

Limits: plugin MCP servers and hooks are never auto-enabled by the toggle script (hand-wire + credentials);
check `/skill-menu` readiness notes first — some plugins are flagged deferred. Re-importing a plugin from
upstream can overwrite an adapted copy; the git diff shows it, revert it.

---

## Account Reference (`docs/account-reference.json`)
Three tiers: `db_record` (raw Supabase columns) → `computed_expectations` (what finance.js derives) → `ui_assertions` (what each panel displays). Derive `computed_expectations` from `db_record` — never fabricate. Update `last_updated` whenever config or account data changes.

---

## Testing
Runner: **Vitest**. Tests in `src/test/`. `vitest.config.js` is sandbox-safe — omits `@tailwindcss/vite`, `@rolldown/plugin-babel`, CSS processing (avoids native `.node` failures in CI).
```bash
npm run test:run      # single pass — use this to verify changes
npm test              # watch mode
npx vitest run -u     # update snapshots after DEFAULT_CONFIG changes
```
Reporter is `verbose` — Vitest 4's default misreports suite failures as "no tests." Do not use `-- --runInBand` (Jest flag, ignored by Vitest).

**Blind spot: omitting `@rolldown/plugin-babel` means Vitest never exercises the React
Compiler** — a real production-only miscompilation (drift-app-warden §12.4) crashed 3 admin
panels on their first render with zero test failures. A `useState`-heavy component whose
`cancelEdit`/`handleSave`-shaped handlers close over a shared `draft` object is the known
trigger; the fix is `"use no memo";` as the component's first statement (see
`ChangelogAdminDetail`/`BetaContentAdminDetail`/`BetaScoresAdminDetail` in
`ProfilePanel.jsx`) plus wrapping its render site in `AdminDetailErrorBoundary` — the app has
no top-level error boundary, so an uncaught render crash anywhere blanks the whole page.
`npm run test:run` passing is **not sufficient evidence** this class of bug is absent; a real
`vite build` + browser render is the only way to catch it.

**Second blind spot: invalid-HTML-nesting warnings don't fail the suite either.** A `<div>`
rendered inside a `<p>` (or similar HTML-nesting violation) surfaces only as a
`console.error`/`console.warn` from React/testing-library, never a thrown assertion — a whole
test file can pass 100% with the warning printed on every run. Found in production code once
already (`SetupWizardAdlib.jsx`'s `IntakePage`, drift-app-warden §7 F137) — two card components
were nested inside the page's sentence `<p>` and went unnoticed until an unrelated test happened
to render far enough into the tree to trigger the console warning. Watch console output when
adding any block-level (`<div>`-rendering) child to a component whose top-level element is a
`<p>` or other phrasing-content element.

---

## Environment Variables
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...       # server-side only — api/coach.js (§2.G Coach infra)
ANTHROPIC_API_KEY_TEST=...  # optional — preview/dev builds use this if set, same MODE
                            # split pattern as STRIPE_SECRET_KEY_TEST in _stripeClient.js
```

## Naming Conventions
Files: kebab-case · Components: PascalCase · Utilities/hooks: camelCase · Database: snake_case

---

## Account Tiers

Three flags on `user_data`:

| Flag | Unlocks | Set via |
|------|---------|---------|
| `is_admin` | Full Admin Toolkit + AI features + Tax Plan + bypasses paywall | Manual SQL |
| `is_tester` | AI features + Tax Plan + bypasses paywall | Manual SQL; auto-seeds 6-month trial on false→true |
| `is_investor` | Demo Account Tree + investor signup path + AI features + bypasses paywall | `createInvestorAccount()` |

All three bypass the paid wall — none should ever need a real subscription. See `docs/active-systems.md` §2 & §9 for full detail on Investor, Demo Accounts, and Beta Testers.

---

## Admin Diagnostic Toolkit

Full reference: `docs/admin-toolkit-reference.md`. **Gate:** `isAdmin` unlocks 9 Phase 1 tools (Lock Date, Reopen Check-In, Force Sync, Config View, DB Viewer, Tax Grid, Live Inspector, Week Inspector, Beta Report); `isOwner` unlocks Phase 2 (not yet built). Diagnostic templates for common issues included in reference file.
