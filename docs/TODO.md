# TODO — Life RPG Finance Dashboard

## 1. Immediate Bug Fixes

- [x] Fix Cashflow tab in Budget panel — review layout, math, and display accuracy
- [x] Fix Goals display — verify weeks-to-completion math and progress rendering

---

## 2. Quarterly Phase Refactor

- [x] **Quarterly phase refactor** — replace the current 3 arbitrary phases with 4 clean calendar quarters; each quarter is 3 months and named by month range (e.g. "Jan–Mar") never "Quarter 1" or "Phase 1":
  - [x] **`config.js`** — replaced `PHASE_END_DATES` with `QUARTER_BOUNDARIES` (`2026-03-31`, `2026-06-30`, `2026-09-30`); replaced `PHASES` with 4 quarter definitions labeled `Jan–Mar`, `Apr–Jun`, `Jul–Sep`, `Oct–Dec`
  - [x] **`finance.js`** — updated `getPhaseIndex` to return 0–3 for 4 quarters; updated `buildLoanHistory` to emit `weekly: [w, w, w, w]`
  - [x] **`BudgetPanel.jsx`** — updated all `[p1, p2, p3]` input sets to `[p1, p2, p3, p4]`; replaced "Phase N Weekly" / "P{N}/wk" labels with quarter month-range labels; phase selector tabs now show 4 quarter tabs
  - [x] **`db.js`** — migration on load: history entries with `weekly.length === 3` get Q3 copied into Q4; note arrays of length 3 also extended
  - [x] **Visibility rule** — quarter labels appear only in Budget expense editing; income, benefits, and log panels unaffected

---

## 3. Attendance Bucket Model

- [x] **Attendance bucket model** — DHL/P&G policy formula, tracked month-by-month from the event log:

  **Monthly unapproved hours missed (M) → bucket effect:**
  - `M = 0` → bucket += 18 (perfect attendance bonus)
  - `0 < M ≤ 12` → bucket -= M, then bucket += 12 (reduced bonus)
  - `12 < M ≤ 24` → bucket -= M, then bucket += 6 (minimal bonus)
  - `M > 24` → bucket -= M, bonus = 0 (no intake)

  **Rules:**
  - Unapproved missed time: deducts hours + reduces monthly bonus tier
  - Unpaid approved absence: does NOT hit bucket, but DOES reduce PTO accrual
  - PTO usage: does NOT hit bucket, and still accrues PTO hours while on PTO
  - PTO used to cover an unapproved absence: saves the bucket hit (mark as exception on event)

  **Build tasks:**
  - [x] Aggregate unapproved hours per calendar month from the event log to determine each month's bonus tier
  - [x] Running bucket total: start at 64h (new hire), cap at 128h; overflow pays out at `PTO_RATE / 2` ≈ $9.825/hr; apply monthly net (bonus − deductions) for each past month, project forward assuming perfect attendance
  - [x] Dashboard indicator in both panels: current bucket level with balance bar, SAFE/CAUTION/CRITICAL status band, hours to next tier drop for current in-progress month; monthly history + projection table in BenefitsPanel; compact widget in LogPanel
  - [x] `bucketStartBalance: 64`, `bucketCap: 128`, `bucketPayoutRate: 9.825` added to DEFAULT_CONFIG
  - [x] **Wire attendance bonus into BenefitsPanel** — static "$200/month · 7 payouts · $1,400 max" replaced with dynamic `computeBucketModel()` output; realized + projected overflow payout shown as income line

---

## 4. Setup Wizard

> **Full spec and step-by-step build order:** `docs/setup-wizard-plan.md`
> **Field-by-field decisions:** `docs/setup-wizard-field-notes.md`

### Phase 1 — Foundation
- [ ] `config.js` — add wizard fields (`setupComplete`, `taxExemptOptIn`, `paycheckBuffer`, `employerPreset`, `startingWeekIsHeavy`, `scheduleIsVariable`, `userState`, `standardWeeklyHours`, `taxRatesEstimated`) and generalized rate fields (`fedRateLow/High`, `stateRateLow/High`); keep legacy `w1/w2` rate fields for backward compat during transition
- [ ] `db.js` — fix config merge strategy (`{ ...DEFAULT_CONFIG, ...data.config }` so new fields reach existing rows); add Anthony pre-wizard migration block (detects pre-wizard rows by absence of `setupComplete`; sets `employerPreset: "DHL"`, copies w1/w2 rates to new field names, marks `setupComplete: true` so Anthony never sees the wizard)

### Phase 2 — finance.js + State Tax Table
- [ ] `finance.js` — decouple `buildYear()` rotation logic from hardcoded strings; use `employerPreset` + `startingWeekIsHeavy`; update `computeNet()` to use `fedRateLow/High` with `w1/w2` fallback
- [ ] `stateTaxTable.js` — create 50-state table (NONE / FLAT / PROGRESSIVE models)
- [ ] `finance.js` — add `stateTax(income, stateConfig)` function
- [ ] `App.jsx` — replace `moFlatRate` hardcode with `stateTax()` lookup

### Phase 3 — SetupWizard component

#### Sub-sprint 3a — Scaffold ✅
- [x] `SetupWizard.jsx` — create file; wire step router (`activeSteps = steps.filter(s => s.showIf(formData, lifeEvent))`), Back/Next nav, progress indicator (step X of N), Next disabled until current step validates
- [x] `onComplete` handler — auto-populates `taxedWeeks` (all weeks ≥ `firstActiveIdx`), merges `setupComplete: true`, calls parent `onComplete`

#### Sub-sprint 3b — Step 0: Welcome / Life Event Select ✅
- [x] First-run: welcome copy + Start button; no fields
- [x] Re-entry: Life Event dropdown (Lost my job / Changed jobs / Got a commission job); dependency engine writes `lifeEvent` and marks affected steps dirty

#### Sub-sprint 3c — Step 1: Pay Structure ✅
- [x] DHL employer preset pill gate (`employerPreset: "DHL" | null`) rendered before all pay fields
- [x] Pay Structure fields: `baseRate`, `shiftHours`, `diffRate` (overnight/weekend pill multiselect with inline amount inputs), `otThreshold` pill, `otMultiplier` pill
- [x] Commission toggle shown if `lifeEvent === "commission_job"`

#### Sub-sprint 3d — Step 2: Schedule ✅
- [x] Job start date picker → derives `firstActiveIdx` from `FISCAL_YEAR_START`
- [x] Standard path: weekly hours number input (`standardWeeklyHours`)
- [x] DHL path: 4-day / 6-day rotation pill → `startingWeekIsHeavy`
- [x] Pay period end day picker (0=Sun default)

#### Sub-sprint 3e — Step 3: Deductions
- [ ] Benefits availability gate pill (enrolled / not yet / no benefits) — controls field visibility
- [ ] Fields: `ltd`, `k401Rate`, `k401MatchRate`, `k401StartDate` (shown/hidden per gate answer)
- [ ] "Not yet" path shows enrollment date + note about projected kick-in

#### Sub-sprint 3f — Step 4: Tax Rates
- [ ] Variable hours gate (`scheduleIsVariable`) — auto-true for DHL, pill question for standard users
- [ ] State dropdown (`userState`) → pre-fills rate from `STATE_TAX_TABLE`; NONE model shows "no state income tax" note
- [ ] Paystub calculator (gross + withheld → derives `fedRateLow/High`, `stateRateLow/High`) — **optional/skippable**: "Use estimate for now" path pre-fills from STATE_TAX_TABLE and sets `taxRatesEstimated: true`
- [ ] `taxRatesEstimated` flag in config — drives "estimate" badge on tax-derived numbers in IncomePanel; cleared when user confirms real paystub rates
- [ ] "Sharpen your tax rates" entry point in Settings — same paystub calculator, no full wizard re-run

#### Sub-sprint 3g — Step 5: Tax Summary *(read-only confirmation)*
> Tax strategy (exempt juggling, extra withholding tuning, `targetOwedAtFiling`) is behind
> a feature gate — NOT in the wizard. `targetOwedAtFiling` stays hardcoded at $1,000.
- [x] Read-only federal summary: standard deduction ($15k), FICA rate, effective fed rate(s)
- [x] Read-only state summary: hidden for NONE states, effective-rate note for PROGRESSIVE
- [x] "est." callout when `taxRatesEstimated` — points user to Sharpen Rates in Income panel

#### Sub-sprint 3h — Step 6: Other Deductions *(scoped down — preset benefits already in Step 3)*
- [x] Benefits start date — when health/dental/vision coverage activates
- [x] Repeatable other-deductions field — freeform label + weekly amount, add/remove rows; stored as `otherDeductions: [{id, label, weeklyAmount}]`
- [x] Attendance policy gate — standard users only; DHL skipped; `attendanceBucketEnabled: true|false|null`
- [x] `isValid`: DHL always passes; standard users must answer attendance pill (skippable)

#### Sub-sprint 3i — Step 7: Paycheck Buffer
- [x] Live net-per-check preview: `estimateWeeklyGross()` (DHL weighted avg, variable avg, standard flat); breakdown table: gross, fed, state, FICA, 401k, benefits, other; "estimated" note if taxRatesEstimated
- [x] `paycheckBuffer` input; `BUFFER_FLOOR = 50`; red warning block renders below $50; "Override anyway" writes `bufferOverrideAck: true` to formData; value change resets ack
- [x] `isValid`: passes if buf ≥ 50 OR bufferOverrideAck; `bufferOverrideAck` default added to config

#### Sub-sprint 3j — Step 8: Tax Exempt Gate (visual test)
- [x] Three variants behind `const GATE_VARIANT = 'A'` — A: blur overlay, B: hidden + disclaimer, C: locked card with padlock
- [x] Shared `TAX_EXEMPT_DISCLAIMER` const + `TaxExemptDisclaimerBox` + gold accept button
- [x] Accept writes `taxExemptOptIn: true`; `isValid` blocks until accepted
- [ ] Visual test all 3 variants; delete losers before merging

#### Sub-sprint 3k — DHL Employer Preset Tune *(post-wizard, DHL users only)*
> Shown only when `employerPreset === "DHL"`. Positioned after Step 1 (Pay Structure), before Schedule.
> Anthony's account is unaffected — his `dhlTeam === null` keeps `buildYear()` on the existing hardcoded day arrays.

**Standard DHL rotation (2026 — rigid, full-year):**
| Week type | Required days | Hours | Weekend shifts |
|-----------|--------------|-------|----------------|
| Light     | Mon / Thu / Fri | 36h (3 × 12h) | 0 |
| Heavy     | Tue / Wed / Sat / Sun | 48h (4 × 12h) | 2 (Sat + Sun) |

**Teams:** A-team starts on light; B-team starts on heavy. Both alternate every week — while A works their 3-day, B works their 4-day.

**Required OT (DHL mandated — 1 extra 12h shift per week, worker picks off-day):**
- Light week off-days: Tue / Wed / Sat / Sun — Sat/Sun OT earns `diffRate` (`dhlOtOnWeekend` flag)
- Heavy week off-days: Mon / Thu / Fri — all weekdays, no diff ever applies

**DHL MO supply chain preset notes (from Anthony's confirmed paystub data):**
- Tax rates in `DHL_PRESET.defaults` represent a **night shift** employee.
- **Morning shift users** earn the same base pay but do NOT get the `$1.50/hr` night shift differential (`diffRate`). Add a "Do you work nights?" pill to Step 1 or here that zeros `diffRate` for morning shift.
- Tax rates are the same regardless of shift — morning vs. night affects gross pay, not effective tax rate.

**Wizard step tasks:**
- [x] A / B team pill → writes `dhlTeam`; auto-derives `startingWeekIsHeavy` from `DHL_PRESET.teams[dhlTeam].startsHeavy`; applies `DHL_PRESET.defaults` to formData
- [x] "Standard rotation" vs "Custom schedule" pill → `dhlCustomSchedule: bool`; standard locks to `DHL_PRESET.rotation`; custom preserves Anthony's hardcoded day arrays
- [x] Night / morning shift pill → `dhlNightShift: bool`; morning zeroes `effectiveDiffRate` in `buildYear()` without changing stored `diffRate`
- [x] OT day preference pill: "Weekday only" / "Sometimes weekend (Sat/Sun)" → `dhlOtOnWeekend: bool`
- [x] `isValid`: `d.dhlTeam !== null`
- [x] `buildYear()` update: `dhlTeam && !dhlCustomSchedule` gates preset rotation; otherwise falls back to hardcoded arrays; `effectiveDiffRate` = 0 when `dhlNightShift === false`
- [x] `saveUserData()`: syncs `is_dhl` column from `config.employerPreset === "DHL"` on every save
- [x] `isDHL` prop threaded to `BenefitsPanel` and `LogPanel` from App.jsx
- [x] `dhlCustomSchedule: false` + `dhlNightShift: true` added to DEFAULT_CONFIG
- [x] `DHL_PRESET` imported into finance.js

### Phase 4 — App.jsx integration
- [ ] First-run gate: `if (!config.setupComplete)` → render `<SetupWizard />`
- [ ] `handleWizardComplete` merges and saves config
- [ ] Life Events sidebar item + dependency engine for re-entry

### Phase 5 — Tax Exempt Gate
- [ ] `IncomePanel.jsx` — implement all 3 gate options (A/B/C) behind flag; visual test; pick winner

### Sprint: Attendance History View (All Users)
- [ ] **Attendance history view** — log-based missed day tracking for all users:
  - [ ] Pull `missed_unpaid`, `missed_unapproved`, `partial` entries from event log
  - [ ] Show: missed days per month, running YTD total, day-of-week pattern breakdown
  - [ ] Surface in LogPanel as collapsible "Attendance History" section
  - [ ] No bucket math — pure event log history; bucket model output shown separately for users with attendance policy enabled

---

## 5. Post-Auth Roadmap

### Fiscal Week Features

- [x] **Fiscal week awareness** — app knows current week of the fiscal year (Week X of 52); `today` state ticks at midnight and cascades reactively through all panels; `FISCAL_YEAR_START` centralized constant; week badge in header, log, benefits, budget phase all in sync
  - [ ] Goals needing to be marked complete when funded
  - [ ] Confirmation of days worked vs. projected schedule each week
  - [ ] Goal timeline surplus math — swap flat `weeklyIncome` average for actual per-week `computeNet()` so taxed vs. non-taxed weeks produce accurate surplus and goal sequencing reflects real pay variation

### Theoretical Tab

- [ ] **Theoretical Tab** — new page for quick "what if" income scenarios:
  - [ ] Job change / income change
  - [ ] Investment return modeling
  - [ ] Second job income layering
  - [ ] Output: "Here's how everything could hypothetically look if..."

### Calendar Tab

- [ ] **Calendar Tab** — visual calendar mapping all expense due dates, loan payment dates, and goal milestones

### Statements Tab

- [ ] **Statements Tab** — personal finance statements for download and AI-powered insights:
  - [ ] Statement periods: monthly, quarterly, and yearly snapshots generated from live app data
  - [ ] Core statement contents:
    - [ ] Income summary — gross, net, FICA, 401k contributions + match, event log adjustments
    - [ ] Expense breakdown — by category, including loan payoff progress and drops-off that occurred
    - [ ] Surplus / deficit — what was actually left after all spend
    - [ ] Goals report — which goals were funded, completed, or missed during the period; progress % on in-flight goals
    - [ ] Net worth delta — estimated change in financial position over the period
  - [ ] Download formats — clean PDF and/or CSV export
  - [ ] Statement storage — saved statements persist in Supabase so you can pull up any past period
  - [ ] AI insights layer — end-of-period summary generated by Claude: what went well, what missed, spending patterns, goal velocity, and forward recommendations based on trajectory
  - [ ] Year-end summary — deeper annual report: full goal reconciliation, total tax picture, 401k growth, biggest expense shifts, and a narrative arc of the fiscal year

---

## 6. Optional Deductions Mapping (Post-Setup Wizard)

- [ ] **Itemized deductions module** — optional advanced setup for users who want more accurate year-end tax projections beyond the standard deduction assumption:
  - [ ] Entry point: "Advanced" link shown on the Annual Tax Strategy step of the setup wizard, and accessible anytime from Settings
  - [ ] **Above-the-line deductions** (reduce AGI directly):
    - [ ] 401k traditional contributions (already tracked in config — auto-pull)
    - [ ] HSA contributions (if applicable)
    - [ ] Student loan interest paid
    - [ ] IRA contributions
  - [ ] **Itemized vs. standard toggle** — user selects which filing method they use; app compares their itemized total to the standard deduction and warns if standard is higher
  - [ ] **Common itemized deductions** (if user chooses to itemize):
    - [ ] Mortgage interest
    - [ ] State + local taxes paid (SALT, capped at $10k)
    - [ ] Charitable contributions
    - [ ] Medical expenses exceeding 7.5% AGI threshold
  - [ ] **Output:** revised projected AGI and federal tax liability fed back into the tax gap analysis in IncomePanel; "With your deductions, you're projected to owe X instead of Y"
  - [ ] **Persistence:** deductions stored in user config alongside standard fields; wizard standard deduction assumption shown with a badge: "Standard" or "Itemized" indicating which mode is active
  - [ ] **Disclaimer:** same tone as tax exempt gate — "This is a planning tool, not tax advice. Your actual liability depends on your full return. A CPA review before filing is always worth it."

---

## Completed

### Event Log Rework

- [x] Pass `futureWeeks` into LogPanel and replace hardcoded `WEEKS_REMAINING = 44` so weekly unallocated and goals impact stay accurate as weeks pass
- [x] Pass live `goals` prop into LogPanel instead of using `INITIAL_GOALS` so "Goals at risk" reflects actual edited goal targets
- [x] Auto-derive `weekIdx` and `weekRotation` from the selected `weekEnd` date by matching against `allWeeks` — remove both manual inputs from the form
- [x] Add inline edit on existing log entries (not just delete) — expands in-card, pre-fills all fields, same conditional form logic as add, one open at a time
- [x] Date-level event selection — pay week dropdown replaces freeform date; 7-day pill picker selects specific days missed within the week; shiftsLost, weekendShifts, and hoursLost all auto-computed from selected days rather than estimated
- [x] New event type: **Missed Work — Unapproved** — distinct from `missed_unpaid`; day picker drives hoursLost (days × shiftHours); feeds gross loss calc AND attendance bucket tracker (`bucketHoursDeducted` in calcEventImpact, aggregated in logTotals)
- [x] **PTO accrual accuracy audit** — verified: 1hr/20 worked ✓; unpaid approved reduces accrual (`hoursLostForPTO = shiftsLost × shiftHours`) ✓; unapproved reduces accrual AND hits bucket ✓; PTO usage does NOT reduce accrual (`hoursLostForPTO = 0` for PTO events) ✓; paternity leave projection in Benefits uses `adjP = ptoBs - logPTOHoursLost / 20` ✓

---

*Last updated: 2026-03-24 — Sections 1, 2 & 3 complete. Section 4 added: full Setup Wizard build plan (Phases 1–5). Section 6 added: optional itemized deductions module (post-wizard, post-launch scope).*
