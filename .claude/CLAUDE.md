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
│   ├── LogPanel.jsx         — event log + Log Effect Summary
│   ├── WeekConfirmModal.jsx — weekly schedule confirmation
│   ├── TipsCommissionCheckIn.jsx — small daily check-in card (tips/commission opt-in, skinned bonus-log mechanism)
│   ├── SetupWizard.jsx      — multi-step onboarding (see §SetupWizard below)
│   ├── SetupWizardAdlib.jsx — EXPERIMENTAL admin-only "fill-in-the-blank" pilot (see §SetupWizard below)
│   ├── LoginScreen.jsx      — auth shell
│   ├── BetaHomebase.jsx     — tracked-beta-tester-only modal: rubric score, feature checklist, suggestion feed, changelog recap
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

## SetupWizard (`src/components/SetupWizard.jsx`)

Multi-step onboarding (~2500 lines). Controlled steps with conditional routing based on `lifeEvent` (null/structure_change/lost_job/changed_jobs/commission_job). Covers pay structure, schedule, deductions, tax rates, and wrap-up. Full drift map: `docs/drift-app-warden.md` §7 — consult before changes. See source file for step definitions, helper components, state management, and DHL employer preset overrides.

**DHL Site — Plant vs Warehouse (`dhlSite`).** DHL now has two schedule shapes, chosen in Step 1
right after "Do you work for DHL? Yes": **Plant** (`dhlSite: "PLANT"`) is the original rotating
Team A/B short/long-week alternation — unchanged. **Warehouse** (`dhlSite: "WAREHOUSE"`) is a
fixed schedule with no rotation at all — a Mon–Thu team and a Wed–Sat team (`dhlTeam: "MT" | "WS"`,
`DHL_PRESET.warehouseTeams`), each working the *same 4 days every single week*, plus a real
user-selectable shift-length question (10 or 12 hours, not hardcoded) alongside the existing
night/morning-shift question. Same bucket/PTO numbers, weekend differential, and night
differential dollar amounts as Plant. `dhlSite !== "WAREHOUSE"` is the Plant fallback — every
existing DHL account (no `dhlSite` key in its stored config at all) needs **no migration**, it
just keeps behaving exactly as before. `finance.js`'s `getDhlPlannedDayIndexes()`/
`getDhlPlannedPattern()` are the single shared source of the day-pattern for `buildYear()`,
`projectedGross()`, and `calcEventImpact()` alike — a Warehouse branch there is enough to make all
three correct, no per-caller duplication. `buildYear()` additionally forces `isHighWeek: false`
for Warehouse weeks (financially inert — `PaystubCalc` already guarantees `fedRateHigh ===
fedRateLow` whenever `scheduleIsVariable` is false, which Warehouse always sets). Site-gated UI:
Step 1 (site/team/shift-length questions, custom-rotation question hidden for Warehouse), Step 2
(Short/Long Week pills hidden for Warehouse — nothing else to ask beyond the start date), Step 4
("Load DHL Preset" hidden for Warehouse — those rates are Plant-specific), and `ProfilePanel.jsx`'s
T5 Employment card (DHL Team editor + Schedule Override, same field/second-editor pattern per
`docs/drift-app-warden.md` §7). See that doc's DHL_PRESET/`dhlSite` trigger-map rows before
touching any of this again.

`initialStepId` (optional prop, default `null`) opens the wizard on a specific `STEP_DEFS` id
instead of always step 0 — added solely so `SetupWizardAdlib.jsx` can hand off into the real
wizard after its own pilot pages are answered. No effect on any existing call site that omits it.

**`SetupWizardAdlib.jsx` — EXPERIMENTAL, admin-only, not for real users.** A "fill-in-the-blank"
reimagining of the wizard's first three steps as two cascading mad-libs pages with inline
`<select>`/`<input>` blanks, instead of stacked form fields or a page-per-step flow — pilot for a
friendlier onboarding feel. Page 1 (`IntakePage`) merges Welcome + Pay Structure into one
continuous sentence; page 2 (`SchedulePage`) covers Schedule as its own page, in the same style.
Triggered from the Admin Tools panel ("Ad-Lib Wizard" → Preview button, both mobile and desktop
copies in `App.jsx`) via `adlibPreviewOpen` state; **never reachable by a real signup** —
`isAdmin` gates the trigger button, and the component itself has no other entry point. Reuses the
exact same config fields and DHL-preset defaults as real Step0/Step1/Step2 (see `pickTeamPatch()`
mirroring Step1's `pickTeam()`) so there's zero drift between the two experiences on the fields
they share. Once both pages are answered, `onHandoff(mergedFormData, initialStepId)` closes the
preview and reopens the real `SetupWizard` (via `App.jsx`'s `adlibHandoff` state) at Deductions
(id 3) or the jobless mini-flow (id 10) for the remaining steps — a real, click-through
continuation, not a throwaway mockup. **MOCK ONLY — nothing is ever saved**, including that
continuation: `App.jsx`'s wizard mount's `onComplete` skips `handleWizardComplete` entirely
whenever `adlibHandoff` is set (no `setConfig`, no `savePersistedStateNow`), and `onCancel` stays
available the whole way through instead of first-run's normal "no cancel button" rule — admins can
click all the way to Finish with zero risk to real account data. Only these 3 steps are ad-libbed
today — expanding to the rest, or promoting this to a real user-facing A/B split, is a future
decision pending how the pilot feels in practice.

- **Two real pages, each internally cascading.** `PAGES = [{Component: IntakePage}, {Component:
  SchedulePage}]`, navigated with a page-level Next/Back via `StepSlide` (same slide transition the
  real wizard uses) — but *within* each page, clauses still cascade in as plain `formData`-gated
  conditionals (`isEmployed && (…)`, `formData.startDate && (…)`, etc.) that mount the instant their
  prerequisite answer is given, no click required. Jobless users skip page 2 entirely
  (`activePages = startedUnemployed === true ? [PAGES[0]] : PAGES`), same as the real wizard's
  `isFirstRunJobless` gate skipping STEP_DEFS id 2 outright. Back is hidden on page 1 (`pageIdx >
  0`) and reappears on page 2, returning to page 1 with its answers intact — this Back is a real
  page-level navigation, distinct from undoing an earlier answer within the current page (just
  re-picking that blank directly).
- **Each newly-revealed clause rolls in with a typed reveal, not an instant appear.** `TypedText`
  runs the clause's static wording through the `adlibType` stepped `clip-path` keyframe
  (`index.css`) — a "crisp" blocky reveal, not a smooth wipe — combined with the existing
  `fadeSlideUp` fade+lift in the same `animation` shorthand, so the clause both rolls onto the page
  and types itself out at once. `FadeIn` then fades the blank in at `delay = typeDuration(precedingText)`,
  so the select/input appears right as its introducing text finishes typing. All `TypedText` within
  the same clause use `delay=0` (they mount together the instant the clause becomes eligible, so
  they can type in parallel — no cumulative per-segment delay bookkeeping needed).
- **Blank by default, not prefilled from the admin's real config.** `formData` starts as
  `{ ...config, ...BLANK_PAY_FIELDS }` — `BLANK_PAY_FIELDS` nulls every field either page asks
  about, both the original Welcome/Pay Structure set (`startedUnemployed`, `employerPreset`,
  `dhlTeam`, `dhlNightShift`, `nightDiffRate`, `userPaySchedule`, `annualSalary`, `baseRate`,
  `shiftHours`, `otThreshold`, `otMultiplier`, `payPeriodEndDay`, `scheduleIsVariable`,
  `bucketStartBalance`, `bucketCap`, `bucketPayoutRate`, `diffRate`, `startingWeekIsLong`) and the
  Schedule additions (`startDate`, `firstActiveIdx`, `maxWeeklyHours`, `hoursUnderstood`,
  `biweeklyPayWeekParity`). Without this, an admin whose real account already has these answered
  (e.g. a DHL-preset admin) would land on a page fully pre-filled and instantly proceed-eligible —
  silently skipping `isIntakeValid()`/`isScheduleValid()`'s required-field gating (already correct,
  mirrors STEP_DEFS id 0/1/2) since it never had a blank state to gate from. Every `InlineSelect`
  reselecting its blank `(select)` option must resolve to `null` (not a falsy default), or clearing
  back to blank would misreport as a real answer — see the explicit `v === "" ? null : …` branches
  in both pages' `onChange` handlers. Note that a DHL user's `startingWeekIsLong`/`payPeriodEndDay`
  legitimately stop being blank partway through page 1 (Team selection seeds them via
  `pickTeamPatch()`), which is intentional — it mirrors the real wizard's own Step1→Step2 default
  seeding, and `SchedulePage`'s Short/Long-Week select is deliberately not gated in
  `isScheduleValid()` for the same reason the real Step2 doesn't require it for DHL users.
- **Back at the hand-off boundary returns to this component, not the real Step0/Step1/Step2.**
  Without intervention, hitting Back on the real `SetupWizard`'s first handed-off step (Deductions
  id 3, or the jobless flow id 10) falls through to that component's own Welcome/Pay
  Structure/Schedule — the stacked-field UI for the same questions this pilot just asked ad-lib
  style, which reads as "kicked out of the preview." `SetupWizard`'s optional
  `onBackBeforeStart(formData)` prop fires instead, exactly once, only when `stepIdx` is still at
  the resolved `initialStepId` index — every other Back press behaves as before. `App.jsx` wires
  this to reopen `SetupWizardAdlib` via its `resumeFormData` prop, which skips `BLANK_PAY_FIELDS`
  and seeds `formData` directly from the in-progress answers, resuming on the last page (Schedule
  for an employed resume, since a handoff only ever fires once both pages are valid) — a real
  resume, not a restart. `adlibResumeData` (`App.jsx`) is cleared on both Exit Preview and a fresh
  forward hand-off, so a deliberate new "Preview" click always starts blank again.

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

### Numeric Input Standard
**Never coerce on `onChange`.** Use string draft state (`field ?? ""`); only `parseFloat` at commit (blur/save). For required fields, pass `attempted` bool — show red label + border + `↑ Required` when `attempted && fieldEmpty`. Reference implementation: `Field` + `errBorder` in SetupWizard.

### Animation Rules
- Entrance stagger: `entranceIndex` on MetricCard → `fadeSlideUp` 400ms, 80ms/card, capped 400ms
- Countup: `rawVal` → 0→target 1200ms on mount/change · value flash → teal 150ms, fades 600ms
- **No bounce, no spin, no scale-up on mount. Press = `scale(0.97)` only. All ≤ 500ms except countup.**

---

## UI Design System — Color Tokens (`src/index.css` `@theme`)
**Never use raw hex for accent, green, or red. Always reference tokens.**

| Token | Value | Role |
|-------|-------|------|
| `--color-bg-base` | `#05100c` | App shell background |
| `--color-bg-surface` | `#112c1f` | Card background |
| `--color-bg-raised` | `#163828` | Elevated surfaces, button hover |
| `--color-bg-gradient` | `linear-gradient(180deg, #091a11, #05100c)` | Header gradient |
| `--color-teal` / `--color-accent-primary` | `#00c896` | Active tabs, CTAs, section bars |
| `--color-green` | `#22c55e` | Income values, positive status |
| `--color-red` | `#ef4444` | Spend, negative, risk |
| `--color-deduction` | `#f4a4a4` | Soft deduction rows — same H=0° hue as `--color-red`, lightness ~80%; not harsh on dark. Candidate to replace `--color-red` in low-emphasis negative contexts. |
| `--color-warning` | `#f59e0b` | Warning / attention |
| `--color-text-primary` | `#e6f4ef` | Body text |
| `--color-text-secondary` | `#7fa39a` | Labels, sublabels |
| `--color-text-disabled` | `#4a645c` | Inactive / disabled |
| `--color-border-subtle` | `#1f3b31` | Card borders |
| `--color-border-accent` | `rgba(0,200,150,0.28)` | Accent borders |
| `--font-display` | `'Titillium Web'` | All headings (h1–h6), page/section titles, hero/headline text, large numeric emphasis on metric cards |
| `--font-sans` | `'Rajdhani'` | Everything else — body copy, nav links, labels, and ALL interactive components (buttons, links-as-buttons, tabs, toggles, badges, chips) |
| `--font-mono` | `'JetBrains Mono'` | Inputs + data cells only (deliberate exception, not part of the display/body split — tabular-figure alignment) |

**Typography — two-font system (adopted 2026-08-09).** Titillium Web (400/600/700/900) is the
display/headline font; Rajdhani (400/500/600/700) is the body/interactive font. Both load via
Google Fonts `<link>` in `index.html` (same pattern as the pre-existing JetBrains Mono load).
Never hardcode a font-family — always reference `var(--font-display)` / `var(--font-sans)` /
`var(--font-mono)`.

**Status:** `green` = positive/ahead · `teal` = attention/mixed · `red` = risk/behind

**Pulse tokens (Phase 2 — not in index.css):** `--color-signal-blue` `#5B8CFF` · `--color-signal-purple` `#7C5CFF` · `--color-signal-glow` `rgba(124,92,255,0.25)` — reserved for AI insight overlay, do not use on Flow elements.

---

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

**Encryption at rest:** no persisted field has field-level encryption today — protection is TLS + RLS only (migration 019). That's fine for everything currently collected, but a future field carrying regulated/high-sensitivity data (SSN, DOB, bank/routing, government ID) must NOT just ride the ordinary four-site persisted-field procedure — see `docs/drift-app-warden.md` §3 F120 for the required trigger check, and `docs/TODO.md` §11 (Data Encryption) for the open tracking item.

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

---

## Development Workflow
**30-min sprints, 4×/week.** Before: state the task clearly. After: commit + one-sentence summary.
- `docs/active-systems.md` — how every live system works. **Working on Coach/AI context?** Read
  §6 first — it documents the grounding pattern (every context field must resolve through the
  same authoritative function the UI itself uses, e.g. `computeGoalTimeline()`,
  `getEffectiveAmountForMonth()` — never a parallel approximation) that live testing had to
  rediscover through several real bugs. Skipping it reintroduces those bugs.
- `docs/TODO.md` — prioritized backlog (open items only)
- `docs/past-TODO-tasks.md` — completed work log (one-liner per shipped item, for historical context)
- `docs/account-reference.json` — Anthony's primary account ground truth

**Schema bookmarks:** `database/migrations/0NN_BOOKMARK_schema_snapshot_<date>.sql` files are
periodic full-schema recaps, not real migrations — never assign one the actual next migration
number in sequence expecting it to run. They exist purely so a session can read one file instead
of the entire migrations folder to understand current DB shape. The `BOOKMARK` tag and all-caps
make them impossible to mistake for a pending migration. Latest bookmark:
`038_BOOKMARK_schema_snapshot_2026-08-06.sql` — table/column defs for migrations through 035 were
verified 2026-08-06 against a live Supabase schema export; 036 and 037 were added to the same file
on 2026-08-07 per Anthony's confirmation that both had been run against production (attributed in
the file as owner confirmation, not a fresh export reconciliation — see its header for the exact
distinction). Real migrations continue past it: 023 (coach_chats), 024 (user_data write-permission fix),
025–030 (beta program — `beta_code_used`, `beta_started_at`, `beta_codes`,
`beta_halfway_email_sent_at`, `beta_activity_events` + its `feedback` event type), 031
(beta_activity_events eligibility trigger), 032 (`changelog_entries` — the admin-managed
"What's New" table, `api/admin-changelog.js`), 033 (`consent_records` — Terms of Service /
Privacy Policy consent capture, append-only, `LoginScreen.jsx`'s signup gate), 034
(beta_seat_cap — hard 40-seat cap enforced at the DB level), 035 (beta_codes_channel — lets one
link/QR code auto-assign from a named pool), 036 (resume_profile + coach_chats `resume_review`
chat_type), 037 (`beta_content_items` + `beta_checklist_completions` + `beta_scores` — the Beta
Homebase, `api/admin-beta-hub.js`, drift-app-warden §20 F123) exist — **the next real migration
is 039.** Verify against the folder before numbering; this note has now gone stale five times
(drift-app-warden §14, across the beta-program migrations, across 031–032, again across 033, and
again when 032 collided with a second, independently-numbered `032_add_resume_profile.sql` on a
parallel branch — resolved by renumbering the resume_profile migration to 036 on merge).

**✅ 036 and 037 have now been run against production** — 2026-08-06's export reconciliation for
the 038 bookmark had found them missing live (`resume_profile` absent, `coach_chats.chat_type`
still lacking `resume_review`, and `beta_content_items`/`beta_checklist_completions`/`beta_scores`
all absent), but Anthony confirmed on 2026-08-07 that both have since been applied. Résumé Review
(§18.E1) and the Beta Tester Homebase should now be functional in production. The 038 bookmark's
table section has been extended to include both migrations' schema (reconstructed from the
migration files, not re-verified against a fresh export — see the bookmark's own header). Next
bookmark, if a fresh live export is pasted, should re-verify 036/037 the same way 001-035 were
originally verified.

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
