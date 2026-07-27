# CLAUDE.md — Authority Finance

## Product
**Company:** Authority | **Product:** Authority OS | **Tagline:** *"You are missing out… on you."*
**This app:** Authority Finance (A:Fin) — personal finance dashboard: income modeling, budgeting, goals, event logging.
**Design system:** Flow shell (live) + Pulse overlay (Phase 2). See `docs/authority-design-system`.
**Liquid Glass UI:** `src/components/LiquidGlass.jsx` — frosted glass for nav, pills, modals. Recipe in `docs/active-systems.md` §15.

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

**No standalone backend server** — but no longer "pure frontend": `api/` holds 11 Vercel
serverless functions (Stripe checkout/webhook/portal/revive, Coach streaming proxy, daily
subscription-lifecycle cron + email engine, delete-account, revival-lookup, admin-changelog for
the "What's New" authoring surface, plus `api/seed.js` — a single route dispatched on
`body.type` ("beta" | "investor" | "trial") that consolidates what used to be three separate
seed-beta/seed-investor/seed-trial functions). All privileged writes (tier flags, subscription
columns, changelog entries) go through these service-role routes — the client never writes them
(RLS migration 019).

**Vercel Hobby-plan function cap:** a deployment can include **at most 12 Serverless Functions**
(one per non-`_`-prefixed file in `api/`) on the free Hobby plan — exceeding it fails the build
outright ("No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan").
This repo hit 13 once (adding `admin-changelog.js` tipped it over) and was brought back under the
cap by merging seed-beta/seed-investor/seed-trial into the one `api/seed.js` above — same fix to
reach for again if a future route addition trips this same failure, rather than assuming it's a
rate limit or a real Vercel outage. Consolidation candidates if it happens again: the three
`stripe-*.js` routes are the next most mergeable group (same shape, different Stripe action).

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
│   ├── LoginScreen.jsx      — auth shell
│   └── ProfilePanel.jsx     — account + employment settings
├── constants/
│   ├── config.js            — FISCAL_YEAR_START, PHASES, EVENT_TYPES, DHL_PRESET, BENEFIT_OPTIONS
│   └── stateTaxTable.js     — state tax rate table
├── hooks/useLocalStorage.js
├── lib/
│   ├── finance.js           — buildYear, computeNet, computeGoalTimeline, calcEventImpact
│   ├── rollingTimeline.js   — deriveRollingIncomeWeeks, deriveRollingTimelineMonths
│   ├── fiscalWeek.js        — FISCAL_WEEKS_PER_YEAR, week index helpers
│   ├── configHistory.js     — §19 sensitive-field whitelist + diff gating account_history capture
│   ├── db.js                — localStorage persistence
│   └── supabase.js          — Supabase client
└── test/                    — Vitest tests
docs/                        — project documentation
database/migrations/         — Supabase SQL migrations (see BOOKMARK note below)
```

---

## SetupWizard Quick Reference (`src/components/SetupWizard.jsx` ~2500 lines)

**Full drift map (key functions, IF/THEN checks, path matrix): `docs/drift-app-warden.md` §7 — consult it before changing anything here.**

**Export:** `SetupWizard({ config, onComplete, onCancel, lifeEvent, isInvestor, isExiting })`
- `config` — current app config; spread into `formData` on mount; `firstActiveIdx` re-derived from `startDate` on every open
- `lifeEvent` — `null` (first-run) | `"structure_change"` | `"lost_job"` | `"changed_jobs"` | `"commission_job"`
- `onComplete(data)` — receives merged config + `taxedWeeks` + `accountCreatedIdx` + `setupComplete: true`

**Steps (controlled by `STEP_DEFS` — each has `showIf(formData, lifeEvent)` + `isValid(formData)`):**
| Step ID | Title | Key fields / notes |
|---------|-------|-------------------|
| 0 | Welcome | First-run: "Are you currently unemployed?" seed (§15.H) + intro; re-entry: life event picker or structure_change overview |
| 10/11/12 | Jobless mini-flow | First-run + unemployed only: unemployment benefits → job-loss details → wrap up; skips steps 1–4 and 7 entirely |
| 1 | Pay Structure | DHL employer gate → team/shift/rotation; base rate, OT threshold/multiplier, weekend diff, commission; tips/commission daily check-in opt-in (No/Tips/Commission + commission-only follow-up, inert today) |
| 2 | Schedule | Job start date → `firstActiveIdx` (via `dateToWeekIdx`); rotation week (DHL) or hours + pay period close day + biweekly parity |
| 3 | Deductions | BenefitCard toggles (BENEFIT_OPTIONS), `otherDeductions` rows, attendance gate; `skippable: true` |
| 4 | Tax Rates | State select, inline `PaystubCalc`, rate summary with FICA + std deduction; DHL MO preset |
| 7 | Wrap Up | Live net preview (`estimateWeeklyNet`), paycheck buffer toggle ($50 default, $200 max), tax-exempt opt-in; structure_change adds "What's Changing" diff |

**Life event routing:** `lost_job` / `commission_job` → steps 0–4, **no WrapUp** (WrapUp-only fields must default in `handleComplete`); `null`(employed) / `"changed_jobs"` / `"structure_change"` → all steps including WrapUp (7); `null` + unemployed → steps 0, 10–12 only.

**Internal helpers (file-private):** `Pill`, `Field`, `FieldRow`, `errBorder`, `BenefitCard`, `PaystubCalc`, `StepWrapUp`, `StructureChangeDiff`, `StepJobless*`, `isFirstRunJobless`. (`dateToWeekIdx` was promoted to a shared `lib/fiscalWeek.js` export — App.jsx needs the same calendar-date → fiscal-week-idx conversion to tag Tips/Commission daily check-in log entries.)

**State:** `formData` is flat; `update(patch)` merges via `setFormData(prev => ({ ...prev, ...patch }))`. `attempted` bool set on failed Next — triggers red borders/labels + shake; resets on step change.

**On complete:** enforces DHL overrides (`payPeriodEndDay: 0, otThreshold: 40, otMultiplier: 1.5`), normalizes `paycheckBuffer ?? 50`, runs `buildYear`, derives `taxedWeeks` from `firstActiveIdx` (empty if `taxExemptOptIn`), stamps `accountCreatedIdx`, calls `onComplete`.

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
| `--font-display` / `--font-sans` | `'Inter'` | Headings + body |
| `--font-mono` | `'JetBrains Mono'` | Inputs + data cells only |

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

**Encryption at rest:** no persisted field has field-level encryption today — protection is TLS + RLS only (migration 019). That's fine for everything currently collected, but a future field carrying regulated/high-sensitivity data (SSN, DOB, bank/routing, government ID) must NOT just ride the ordinary four-site persisted-field procedure — see `docs/drift-app-warden.md` §19 F120 for the required trigger check, and `docs/TODO.md` §27 for the open tracking item.

---

## Drift App Warden — MANDATORY drift check before believing a change is done

**`docs/drift-app-warden.md`** is the app's drift ledger: for every critical formula,
function, pattern, and AI-context point it answers *"I am changing X — what Y must I check
before X counts as done?"* It exists because the app's dominant failure mode is no longer
locally-wrong code but **drift** — a locally-correct change that silently invalidates a
distant system (five documented real incidents are catalogued there as case law: parallel
formulas, retroactive recompute, lost saves, gate bypass, stale docs).

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
  §24 first — it documents the grounding pattern (every context field must resolve through the
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
`022_BOOKMARK_schema_snapshot_2026-07-10.sql` (schema state through migration 021).
Real migrations continue past it: 023 (coach_chats), 024 (user_data write-permission fix),
025–030 (beta program — `beta_code_used`, `beta_started_at`, `beta_codes`,
`beta_halfway_email_sent_at`, `beta_activity_events` + its `feedback` event type), 031
(beta_activity_events eligibility trigger), 032 (`changelog_entries` — the admin-managed
"What's New" table, `api/admin-changelog.js`), 033 (`consent_records` — Terms of Service /
Privacy Policy consent capture, append-only, `LoginScreen.jsx`'s signup gate) exist —
**the next real migration is 034.** Verify against the folder before numbering; this note
has now gone stale four times (drift-app-warden §14, again across the beta-program migrations,
again across 031/032, and again across 033 — a fresh BOOKMARK compiling schema state through
033 is now overdue; the existing `022` snapshot is stale for the same reason).

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

---

## Mobile Checklist
- [ ] No horizontal scroll at 390px / 375px · All tap targets ≥ 44×44px
- [ ] Font-size ≥ 16px on all inputs (prevents iOS zoom)
- [ ] Bottom nav clears `safe-area-inset-bottom` · PWA installs from Safari · Standalone mode active
- [ ] Dark status bar (black-translucent) · Dynamic Island / notch not obscured

---

## Environment Variables
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...       # server-side only — api/coach.js (§18.G Coach infra)
ANTHROPIC_API_KEY_TEST=...  # optional — preview/dev builds use this if set, same MODE
                            # split pattern as STRIPE_SECRET_KEY_TEST in _stripeClient.js
```

## Naming Conventions
Files: kebab-case · Components: PascalCase · Utilities/hooks: camelCase · Database: snake_case

## Known Cleanup
- `WeekConfirmModal.jsx`, `LoginScreen.jsx`, `ProfilePanel.jsx` — hardcoded hex colors not yet tokenized (tracked in TODO §10)

---

## Account Tiers

Three independent flags on `user_data`, each unlocking a distinct, non-overlapping surface —
never treat one as implying another:

| Flag | Unlocks | Set via |
|------|---------|---------|
| `is_admin` | Full Admin Diagnostic Toolkit (below) + all AI features + Tax Plan | Manual SQL |
| `is_tester` | AI features (`canAccessAiFeatures`) + Tax Plan (`canAccessTaxPlan`), both in `entitlements.js` — no toolkit, no other admin surface | Manual SQL only, on an already-existing account (migration `021_add_is_tester_beta_flag.sql`); auto-seeds a 6-month app-side trial window on the false→true transition |
| `is_investor` | Demo Account Tree + investor code signup path | `createInvestorAccount()` via the investor code flow |

**Beta testers are NOT investors — this is a crucial, deliberate division.** `is_tester` must
never grant Demo Account Tree access or the investor code path, and `is_investor` must never
grant AI features. Full detail: `docs/active-systems.md` §23 (Beta Tester Accounts) and §18
(Investor & Demo Accounts).

**Two populations both carry `is_tester = true`** — `user_data.beta_code_used` (migration
`025_add_beta_code_used.sql`, manual SQL, never client-writable) tells them apart: a non-null
value means the account is part of the tracked 10-week beta cohort (usage-logged to
`beta_activity_events`, migration `026`, scored via `api/admin-beta-report.js`); a null value
means an ad hoc friends/family tester, who keeps the standing 6-month trial window but is not
usage-tracked. Set both fields together for a real beta-cohort account — `is_tester` alone is
the friends/family case. Gate: `entitlements.js` `isTrackedBetaTester({ isTester, betaCodeUsed })`
— deliberately not built on `hasTesterAccess`, since `isAdmin` does not imply beta-cohort tracking.

---

## Admin Diagnostic Toolkit

**Gate:** `isAdmin` (from `user_data.is_admin`) unlocks all Phase 1 tools.
`isOwner` (`user_data.is_owner`, not yet built) unlocks Phase 2 destructive tools — never grantable via UI.

**How to use in a session:** ask the user to open the Admin Tools sheet (Tools icon in mobile bottom nav), run the relevant tool, and paste or describe the output here.

### Phase 1 — isAdmin (all 9 live ✓)

| Tool | How to invoke | What to ask for |
|------|--------------|-----------------|
| **Lock Date** | Tools sheet → Lock Date | Set a date to simulate a different `effectiveToday`. Ask: "set lock date to [date] and tell me what the Live Inspector shows for Effective Today, Week, and Future Weeks." |
| **Reopen Last Check-In** | Tools sheet → Weekly Check-In | Resets the most recent confirmed pay period and reopens the weekly confirm modal as if it was never finished — a safe way to re-review the modal on demand. Drops that week's `weekConfirmations` record (and any log entry it created); income projections are independent of confirmations, so the model is unaffected. Disabled when no confirmed week is eligible. |
| **Force Sync** | Tools sheet → Sync | **Push ↑** flushes in-memory state to Supabase immediately (bypasses 800ms debounce). **Pull ↓** reloads from DB into memory. Use before/after a save-related bug. |
| **Config Raw View** | Tools sheet → Config JSON → View ↓ | Paste the full JSON here to audit any config field. Copy button puts it on clipboard. **§15.I:** when any §15 field carries a value, a "Life Events" header lists just those fields (name + value) above the raw dump — `jobLossMode`, `jobLossDate`, `jobLossCashOnHand`/`jobLossCashOnHandAsOf`, `jobLossPendingCheckAmount`/`Date`, `unemploymentEnabled`/`Weekly`/`DurationWeeks`/`WaitingWeek`, `returnToWorkDate`, and entry counts for `jobApplications`/`jobHuntIncomeLog`. **Session insight:** Revealed the full tax strategy (`taxExemptOptIn`, `targetOwedAtFiling`, `pastWeekTaxStatusOverrides`) and deduction setup in one shot — ask for this first whenever the issue could involve pay structure, tax elections, or benefit configuration. |
| **DB Row Viewer** | Tools sheet → DB Row → Fetch | Shows raw `user_data` row + `updated_at`. **Drift** badge lists any column where in-memory value ≠ DB value (`config`, `expenses`, `goals`, `logs`, `show_extra`, `week_confirmations`, `pto_goal`). Ask: "run Fetch and paste the drift line and updated_at." **Session insight:** Provided the full expense list and all 5 goals with targets/due dates — the only tool that exposes spending profile and goal inventory, making it essential any time the issue involves budget health, goal timelines, or whether saved data matches what's in memory. Fetch also surfaces the §19 config-history line: "config history: N snapshots · latest [date] ([source]) · [changed fields]" — ask for it when verifying that a pay/tax/schedule edit was captured in `account_history`. Fetch also surfaces a §18.H4 "Coach Chats" line: "N saved chats (breakdown by type)" — tap it to expand the 5 most recent titles; ask for it when verifying Ask Coach conversation persistence. **§15.I:** Fetch also surfaces a "Triage: X active · Y paused · Z cancelled" line whenever any expense is paused/cancelled/flagged, reading the same `exp.jobLossStatus`/`autoReactivateOnIncome` fields `JobLossBudgetPanel`'s triage UI writes (F44) — flags any expense with `autoReactivateOnIncome === false` in the count; ask for it when a Job Loss account's Back to Work reactivation looks incomplete. |
| **Tax Weeks Grid** | Tools sheet → Tax Weeks → View ↓ | 52-cell grid. Teal = taxed/future · dark = untaxed/future · gray = past · teal border = current week · red dot = `pastWeekTaxStatusOverride`. Ask: "open Tax Weeks and describe any red dots or unexpected cell colors." |
| **Live State Inspector** | Amber "Live" pill fixed bottom-right corner | Tap to expand a real-time card showing: `effectiveToday` (amber if lock-offset), week idx + label, futureWeeks.length, unconfirmedCount, extraPerCheck, totalGap, taxedWeekCount, fundedGoalSpend, bufferPerWeek, weeklyIncome, projectedAnnualNet, plus (§17.F) the resolved subscription phase (`Sub Phase` — trial/grace/active/expired/none, with the raw Stripe status as its sub-label), `Trial Ends`, `Access Ends` (the hidden day-21 cutoff — admin-only, never shown elsewhere), `Period End`, and `Card / Dunning`. **§15.I:** the pill itself carries a small amber dot when `config.jobLossMode` is true (visible without opening the card); the expanded card then adds three amber-highlighted rows — `Job Loss Date`, `Unemployment Wkly`, `Unemployment Wks Left` (the last reads `computeJobLossRunway()`'s `benefitsRemainingWeeks` — same call Coach and both Job Loss panels use, never a second derivation). Ask: "open Live and paste all values, noting whether the Job Loss dot is showing." **Session insight:** Surfaced the $3,690 tax gap, $65/wk surplus, and $0 goal funding in a single read — ask for this early in any diagnostic where the complaint is about a number shown on screen, since it reflects exactly what the app is computing right now. |
| **Week Inspector** | Tap any week row in Income panel | Full-screen modal. Shows every field on the week object: schedule (workedDayNames, hours, OT, weekend), pay (grossPay, taxableGross, deductions, 401k, live computeNet), net lookup (baseNet, adjustment, spendable), confirmation record, and all log entries touching this week with net impact. **§15.I:** the Pay section adds an `Unemployment` row whenever `w.unemploymentIncome > 0` (buildYear's per-week benefit annotation — `finance.js`, non-taxed income added to net by `computeNet`); for a week inside the Job Loss window with no benefit paid that week, it instead shows "Job Loss Mode — outside benefit window". Ask: "tap week [N] and describe the Pay and Net Lookup sections." **Session insight:** Confirmed per-week income math was correct and isolated a 401k employer match display bug ($14.96 shown despite `k401MatchRate: 0`) — use this when the issue is a specific wrong number on a paycheck or week, or to rule out income math as the cause of a broader trend problem. |
| **Beta Report** | Tools sheet → Beta Report → Usage CSV / Feedback CSV | Downloads `api/admin-beta-report.js`'s two exports (per-user usage summary; raw feedback submissions) with the current admin session's token. The only in-app trigger for that endpoint — same data as hitting it directly with a Bearer token, just without crafting the request by hand. Ask for this when scoring the beta program against the rubric (`docs/TODO.md` §35, `database/beta-offboarding-day71.sql`). |

**Per-entry impact breakdown** (Log panel): tap the ▼ chevron on any log entry (admin-only) to expand an inline breakdown of that entry's exact impact — gross, net, 401k employee + match, PTO hours, bucket deduction, fiscal week idx, past/future classification.

### Phase 2 — isOwner (not yet built — full spec in `docs/admin-toolkit-todo.md`)

| Tool | Purpose | Risk |
|------|---------|------|
| **isOwner flag** | Migration + `db.js` + App state — prerequisite for everything below | — |
| **Lock `firstActiveIdx`** | Makes this nuclear field read-only for isAdmin, editable only for isOwner | Repositions entire fiscal calendar retroactively |
| **Tax Weeks Grid edit** | Tap a future cell to toggle `config.taxedWeeks` | Corrupts withholding math if misused |
| **Bulk Week Confirmation Seeding** | Mark all weeks as worked / missed / reset all | Reset permanently deletes confirmation history |
| **Config Raw JSON Apply** | Edit + apply config JSON directly | Same blast radius as all fields combined |
| **Config Snapshot / Restore** | Save/restore full account state (config + logs + expenses + goals) | Restore overwrites everything in one tap |

### Diagnostic request templates

When filing a bug or building a feature that touches fiscal math, ask the user to run these and share:
1. **Config dump** — Config JSON → Copy to Clipboard → paste here
2. **Drift check** — DB Row → Fetch → report `updated_at` + any drift columns
3. **Date context** — Live State Inspector → paste Effective Today + Week values
4. **Tax grid** — Tax Weeks → View ↓ → screenshot or describe red dots + current week position
5. **Week deep-dive** — tap the suspect week row in Income → describe Pay + Net Lookup + Log Entries sections
6. **Subscription/billing** — DB Row → Fetch already surfaces every raw column (`select *`, includes `subscription_status`/`trial_ends_at`/`access_ends_at`/`card_on_file`/`current_period_end`/`plan`); Live State Inspector adds the resolved phase on top. Ask for both when the issue involves the paywall gate, trial countdown, or billing state.
7. **Job Loss state (§15.I)** — Live State Inspector → confirm the amber Job Loss dot on the pill + paste `Job Loss Date`/`Unemployment Wkly`/`Unemployment Wks Left`; DB Row → Fetch → paste the `Triage:` line; Config JSON → View ↓ → paste the "Life Events" header block. Ask for all three when the issue involves runway, benefits, or expense triage during Job Loss Mode. Per-week benefit detail: `buildYear()` annotates every week with `unemploymentIncome` (`finance.js`) — non-zero only inside the eligibility window computed from `jobLossDate`/`unemploymentDurationWeeks`/`unemploymentWaitingWeek`; Week Inspector surfaces it directly (see table above).
