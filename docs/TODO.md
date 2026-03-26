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

### Phase 1 — Foundation ✅
- [x] `config.js` — add wizard fields (`setupComplete`, `taxExemptOptIn`, `paycheckBuffer`, `employerPreset`, `startingWeekIsHeavy`, `scheduleIsVariable`, `userState`, `standardWeeklyHours`, `taxRatesEstimated`) and generalized rate fields (`fedRateLow/High`, `stateRateLow/High`); keep legacy `w1/w2` rate fields for backward compat during transition
- [x] `db.js` — fix config merge strategy (`{ ...DEFAULT_CONFIG, ...data.config }` so new fields reach existing rows); pre-wizard migration block stamps `employerPreset: "DHL"`, `dhlTeam: "B"`, `dhlCustomSchedule: true`, copies w1/w2 rates to new field names, marks `setupComplete: true` so Anthony never sees the wizard

### Phase 2 — finance.js + State Tax Table ✅
- [x] `finance.js` — decoupled `buildYear()` rotation logic; uses `employerPreset` + `startingWeekIsHeavy`; `computeNet()` uses `fedRateLow/High` with `w1/w2` fallback; weekend diff earned by all shifts (corrected 2026-03-24 — `dhlNightShift` no longer zeros `diffRate`)
- [x] `stateTaxTable.js` — 50-state table (NONE / FLAT / PROGRESSIVE models)
- [x] `finance.js` — `stateTax(income, stateConfig)` function
- [x] `App.jsx` — `moFlatRate` replaced by `stateTax()` lookup; `getStateConfig()` helper in finance.js

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

#### Sub-sprint 3e — Step 3: Deductions ✅
- [x] Benefits availability gate pill (enrolled / not yet / no benefits) — controls field visibility
- [x] Fields: `ltd`, `k401Rate`, `k401MatchRate`, `k401StartDate`, benefit premium fields (health, dental, vision, etc.) shown/hidden per gate answer
- [x] "Not yet" path shows enrollment date + note about projected kick-in

#### Sub-sprint 3f — Step 4: Tax Rates ✅
- [x] Variable hours gate (`scheduleIsVariable`) — auto-true for DHL, pill question for standard users
- [x] State dropdown (`userState`) → pre-fills rate from `STATE_TAX_TABLE`; NONE model shows "no state income tax" note
- [x] Paystub calculator (gross + withheld → derives `fedRateLow/High`, `stateRateLow/High`) — **optional/skippable**: "Use estimate for now" path pre-fills from STATE_TAX_TABLE and sets `taxRatesEstimated: true`
- [x] `taxRatesEstimated` flag in config — drives "estimate" badge on tax-derived numbers in IncomePanel; cleared when user confirms real paystub rates
- [x] "Sharpen your tax rates" modal in IncomePanel (Sharpen Rates button) — same paystub calculator, no full wizard re-run

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
- [x] Visual test all 3 variants; delete losers before merging

#### Sub-sprint 3k — DHL Employer Preset Tune *(post-wizard, DHL users only)* ✅
> Shown only when `employerPreset === "DHL"`. Positioned after Step 1 (Pay Structure), before Schedule.
> Anthony's account: `dhlTeam: "B"`, `dhlCustomSchedule: true` stamped by the pre-wizard migration in db.js — keeps `buildYear()` on his 4-day/6-day hardcoded arrays (2026-03-24).

**Standard DHL rotation (2026 — rigid, full-year):**
| Week type | Required days | Hours | Weekend shifts |
|-----------|--------------|-------|----------------|
| Light     | Mon / Thu / Fri | 36h (3 × 12h) | 0 |
| Heavy     | Tue / Wed / Sat / Sun | 48h (4 × 12h) | 2 (Sat + Sun) |

**Teams:** A-team starts on light; B-team starts on heavy. Both alternate every week — while A works their 3-day, B works their 4-day.

**Required OT (DHL mandated — 1 extra 12h shift per week, worker picks off-day):**
- Light week off-days: Tue / Wed / Sat / Sun — Sat/Sun OT earns `diffRate` (`dhlOtOnWeekend` flag)
- Heavy week off-days: Mon / Thu / Fri — all weekdays, no diff ever applies

**DHL MO supply chain preset notes:**
- Weekend `diffRate` is earned by **all shifts** (morning and night) — corrected 2026-03-24. The original assumption that morning shift earns no diff was wrong.
- `dhlNightShift` is still stored for future night-shift bonus tracking; it no longer gates `diffRate` in `buildYear()`.
- Tax rates are the same regardless of shift — morning vs. night affects gross pay, not effective tax rate.

**Wizard step tasks:**
- [x] A / B team pill → writes `dhlTeam`; auto-derives `startingWeekIsHeavy` from `DHL_PRESET.teams[dhlTeam].startsHeavy`; applies `DHL_PRESET.defaults` to formData
- [x] "Standard rotation" vs "Custom schedule" pill → `dhlCustomSchedule: bool`; standard locks to `DHL_PRESET.rotation`; custom preserves Anthony's hardcoded day arrays
- [x] Night / morning shift pill → `dhlNightShift: bool`; stored for future night differential — no longer zeros `diffRate` (corrected 2026-03-24; `effectiveDiffRate` removed from `buildYear()`)
- [x] OT day preference pill: "Weekday only" / "Sometimes weekend (Sat/Sun)" → `dhlOtOnWeekend: bool`
- [x] `isValid`: `d.dhlTeam !== null`
- [x] `buildYear()` update: `dhlTeam && !dhlCustomSchedule` gates preset rotation; otherwise falls back to hardcoded arrays; all shifts earn `cfg.diffRate` on weekend hours equally
- [x] `saveUserData()`: syncs `is_dhl` column from `config.employerPreset === "DHL"` on every save
- [x] `isDHL` prop threaded to `BenefitsPanel` and `LogPanel` from App.jsx
- [x] `dhlCustomSchedule: false` + `dhlNightShift: true` added to DEFAULT_CONFIG
- [x] `DHL_PRESET` imported into finance.js

### Phase 3 — SetupWizard component ✅
All 9 step components (3a–3k) built and wired. SetupWizard exports correctly. Pending: Phase 4 integration.

### Phase 4 — App.jsx integration ✅
- [x] First-run gate: `if (!config.setupComplete)` → render `<SetupWizard />`
- [x] `handleWizardComplete` merges and saves config
- [x] Life Events sidebar item + dependency engine for re-entry

### Phase 5 — Tax Exempt Gate
- [x] `IncomePanel.jsx` — visual test all 3 variants (A/B/C) behind `GATE_VARIANT` const; pick winner; delete losers

### Sprint: Attendance History View (All Users) ✅
- [x] **Attendance history view** — log-based missed day tracking for all users:
  - [x] Pull `missed_unpaid`, `missed_unapproved`, `partial` entries from event log
  - [x] Show: missed days per month, running YTD total, day-of-week pattern breakdown
  - [x] Surface in LogPanel as collapsible "Attendance History" section
  - [x] No bucket math — pure event log history; bucket model output shown separately for users with attendance policy enabled

---

## 5. WeekConfirmModal — Three Holes (identified 2026-03-25)

### Hole 1 — Net-zero swallows real schedule changes
**Fix:** Make all event logs show editable shifts + hours fields (so missed/gained can be directly adjusted), and show a confirmation popup before "Log & Confirm" that validates the hours math.
- [x] Net-zero with actual day swap → offer "Confirm Clean" OR "Log Swap →" in Layer 1 footer instead of silently confirming
- [x] Layer 2 (WeekConfirmModal): add editable Shifts Missed + Hours Missed override fields after DayPicker for missed_unpaid / missed_unapproved
- [x] Layer 2 (WeekConfirmModal): add editable Shifts Gained + Hours Gained fields for bonus type
- [x] Layer 2 footer: "Log & Confirm" → first click shows confirmation summary (hours math check, override warning); second click saves
- [x] LogPanel add/edit forms: same override fields (Shifts Missed + Hours Missed after DayPicker for missed types; Shifts/Hours Gained for bonus)
- [x] LogPanel SAVE buttons: gated behind same confirmation popup showing the math before committing

### Hole 2 — Confirming a zero-content absence event
**Fix:** Guard the Layer 2 confirm action — if missed type but no days selected and no manual hours entered, block or warn. Show popup if user tries to navigate away from an open event form without finishing it.
- [x] WeekConfirmModal Layer 2: disable / warn on "Log & Confirm" if missed type has 0 shifts, 0 hours, and no days selected (the empty confirm case)
- [x] WeekConfirmModal: if user clicks "Skip for now" or dismisses while on Layer 2, show "You haven't finished logging — leave anyway?" confirmation
- [x] LogPanel add form: warn user with "Leave without saving?" if they click CANCEL after partially filling a form (at minimum a week is selected)

### Hole 3 — Calendar date labels always assume Monday-start fiscal year
**Fix:** Align `buildYear()` to understand the actual fiscal year calendar; overlay pay period start day so all date math across the app runs only on paychecks that land in the current fiscal year.
- [x] Audit `buildYear()` — ensure week start day is derived from `FISCAL_YEAR_START` config, not hardcoded to Monday
- [x] Add `payPeriodStartDay` to config (0=Sun, 1=Mon, etc.); use it as a metaphorical overlay in calendar/day grid displays
- [x] WeekConfirmModal day grid: dates under each day label must derive from actual week start, not always `weekStart + 0..6` assuming Mon=0
- [x] Verify all fiscal-year-bound math (PTO accrual, bucket model, goal timelines) runs only on paychecks that land within the current fiscal year

---

## 6. Auth & Multi-User

> Builds on existing Supabase project. RLS is currently **disabled** — must be enabled before any second user touches the table.
> `user_data.user_id` is already a UUID primary key — no schema changes needed for auth linkage.

### Step 0 — Link your account (manual, one-time) ✅
- [x] In Supabase SQL editor: `UPDATE user_data SET user_id = '<auth-uuid>' WHERE user_id = 'db07a039-...'`
- [x] Update `VITE_USER_ID` in `.env` to match the auth UUID (keeps the app working until dynamic auth lands)

### Step 1 — supabase.js: swap hardcoded USER_ID for dynamic session ✅
- [x] Remove `export const USER_ID = import.meta.env.VITE_USER_ID`
- [x] Export `getCurrentUserId()` helper: `(await supabase.auth.getUser()).data.user?.id ?? null`
- [x] Export `onAuthChange(callback)` wrapper around `supabase.auth.onAuthStateChange`

### Step 2 — db.js: make load/save user-ID-aware ✅
- [x] `loadUserData()` — call `getCurrentUserId()`; return defaults (not throw) if null (unauthenticated visitor gets a blank slate, not a crash)
- [x] `saveUserData()` — call `getCurrentUserId()`; bail silently if null so unauthenticated state never writes
- [x] **Data isolation fix (2026-03-25)** — new users with empty rows no longer see Anthony's personal goals/logs/expenses; empty arrays now return `[]` instead of falling back to `INITIAL_GOALS/LOGS/EXPENSES`

### Step 3 — LoginScreen.jsx (new component) ✅
- [x] Email + password fields; Sign In button → `supabase.auth.signInWithPassword()`
- [x] "Create account" toggle → `supabase.auth.signUp()` then `INSERT INTO user_data (user_id) VALUES (new_uid)` to seed the row
- [x] Inline error display (wrong password, email taken, etc.)
- [x] Loading state during async call; disable buttons while in flight
- [x] `emailRedirectTo: window.location.origin` — confirmation email links back to the active domain (Vercel preview / prod / localhost) instead of hardcoded localhost

### Step 4 — App.jsx: auth gate ✅
- [x] On mount: `supabase.auth.getSession()` — if valid session exists, skip login screen (persistence)
- [x] Listen to `onAuthStateChange` — update `authedUser` state; null = show login, object = show dashboard
- [x] `authChecked` flag prevents flash of login screen during session restore on reload
- [x] Sign-out button (⎋) in desktop sidebar and mobile drawer → `supabase.auth.signOut()`
- [x] Hard gate: render `<LoginScreen />` before any dashboard content when `authedUser === null`

### Step 5 — Supabase RLS ✅
- [x] `ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;` — run in Supabase SQL editor
- [x] `CREATE POLICY "own row only" ON user_data FOR ALL USING (auth.uid() = user_id);`
- [x] Verified: existing account reads/writes correctly after RLS enabled

### Step 6 — Session persistence on mobile (PWA) ✅
- [x] Supabase JS client persists session to localStorage automatically — verify it survives "Add to Home Screen" launch (standalone mode uses same localStorage origin)
- [x] Test: sign in on Safari, add to home screen, relaunch — should go straight to dashboard, no login prompt
- [x] If session expires: `onAuthStateChange` fires with `SIGNED_OUT` → app drops back to login screen cleanly

### PTO Goal (2026-03-26)
- [x] **Gate PTO Accrual section to DHL preset only** — `isDHL` prop was passed from App.jsx but not destructured in BenefitsPanel; PTO section was showing for all users
- [x] **Replace hardcoded Paternity Leave block with configurable PTO Goal** — label, hoursNeeded, targetDate, negativeBalanceCap; same accrual formula as hardcoded block; add/edit/clear inline UI
- [x] **New `user_data.pto_goal` JSONB column** — migration 004; parallel to `goals` field
- [x] **Wire pto_goal through db.js → App.jsx state → BenefitsPanel props**

### Wizard Polish (2026-03-26 — verbosity + diff simplification)
- [x] **Verbosity pass** — trim multi-sentence helper text to one sentence across all steps; bump key helper text from 11px/disabled to 12px/secondary for readability
- [x] **Step 1 differential simplification** — remove Overnight/Weekend pill multiselect; replace with single "Weekend Differential ($/hr)" input bar (enter 0 for none); diffRate set directly
- [x] **Visual touchups** — spacing and color polish across wizard steps
- [x] **Paycheck buffer rework** — convert buffer from hard floor/warning system to an optional toggle (default: on, $50); show total annual buffer amount on the step; buffer value excluded from all math pipeline (not counted as spendable income in any panel); toggle on/off with input bar appearing when on; $200 max ceiling; 2-sentence plain-language explanation on step page; add code comments around the buffer pipeline exclusion points

### Bug Fixes (2026-03-26 — new test account contamination + iOS safe area)
- [x] **DEFAULT_CONFIG contamination** — `ltd: 2.00`, `k401Rate: 0.06`, `k401MatchRate: 0.05`, `k401StartDate: "2026-05-15"` were Anthony's live DHL values hardcoded as defaults; new users got them via `{ ...DEFAULT_CONFIG, ...data.config }` merge. Zeroed all four fields to safe neutrals (`ltd: 0`, `k401Rate: 0`, `k401MatchRate: 0`, `k401StartDate: null`).
- [x] **iPhone Dynamic Island / notch safe-area** — mobile header height and `padding-top` were only set via inline styles; `env(safe-area-inset-top)` can fail to resolve in iOS PWA standalone mode without CSS `!important`. Moved explicit `height` and `padding-top` rules into the `@media (max-width: 767px)` block with `!important` so they win over inline styles and reliably apply in standalone mode.

### Wizard Polish (identified 2026-03-25 from test user session)
- [x] **Base pay prefill corrected** — `DEFAULT_CONFIG.baseRate` and placeholder changed from 21.15 → 19.65 (DHL forklift operator base rate); `PTO_RATE` was already 19.65
- [x] **Wizard scroll fixed** — Step 1 (and any tall step) now scrollable on mobile; outer container uses `overflowY: auto` + `margin: auto` on inner card instead of `justifyContent: center` which clipped tall steps
- [x] **DHL differential note added** — Step 1 DHL confirmation pill now shows: "Weekend rate ($3.00/hr) is pre-filled. Night shift adds $1.50/hr — set in the DHL team step."
- [x] **Night shift differential** — `nightDiffRate: 1.50` added to DEFAULT_CONFIG; applied in `buildYear()`, `projectedGross()`, and `calcEventImpact()` (missed_unpaid, missed_unapproved, partial, pto). Stacks on all hours for DHL night-shift weeks. Step 15 note updated to confirm live computation.

---

## 7. UI Polish Sprint

### Weekly Pay Table (Income → Weekly tab)
Currently 9 columns (Wk End, Rot, Hrs, OT, Wknd, Gross, 401k, Take Home, Status) — requires horizontal scroll on mobile, visually dense with small text.

- [x] **Slim weekly table to essential columns only** — Keep: Wk End, Gross, Take Home, Status badge. Drop: Rot (redundant with color), Hrs, OT, Wknd, 401k. Goal: fits 390px screen without horizontal scroll.
- [x] **"Full detail" info button** — Add a small ⊞ button in the section header of the weekly table. Tapping opens a near-full-screen modal/sheet showing the complete 9-column table (all data points preserved, scrollable). Dismisses on tap-outside or ✕ button.

### Overview Tab (Income → Summary → Overview)
Monthly summary table currently shows 7 columns including `Your 401k` and `w/ Match`.

- [x] **Remove 401k columns from overview table** — Drop `Your 401k` and `w/ Match` columns from the monthly overview table. Keep: status bar, Month, Chks, Gross, Take Home. 401k detail lives exclusively on the 401k tab.

### 401k Tab (Income → 401k)
Currently shows a per-week table (one row per week with has401k=true) with a Rot column.

- [x] **Switch 401k table to monthly breakdown** — Aggregate weekly rows into monthly rows (same grouping logic as the overview monthly table). Columns: Month, Gross, Your X%, Match, Mo Total, Running. Remove the Rot column entirely — rotation is not meaningful at the month level.

### Home Tab (HomePanel.jsx)
Currently 7 cards: Take Home, Weekly Left, Net Worth Trend, Budget Health, Emergency Fund, Goals, Next Week.

- [x] **Replace Take Home card with Weekly Left — show what's left after expenses** — Remove the raw "Take Home" card (paycheck total). Keep "Weekly Left" (`adjustedWeeklyAvg` — after all expenses) as the primary top hero card (span 2). This is the number the user actually cares about day-to-day. Make sure its value reflects the current week's actual net minus expenses, not just a flat average.
- [x] **Remove "Emergency Fund" card** — Drop the Emergency Fund card. Remaining cards: Weekly Left, Net Worth Trend, Budget Health, Goals, Next Week.
- [x] **Center "Financial Health" section header** — `SH` component left-aligns with gold bar by default. Override to center for this section header only.
- [x] **Rewrite Home subtitle** — Replace `"Week {idx} of 52 · {rotation}"` with: `"Another beautiful day, {weekdayName} the {dayOfMonth}. You are working on your {topPriorityGoal} goal"`. Derive weekday name and day-of-month from `today` prop. Top priority goal = first non-completed goal by position, or first goal if none defined yet; if no goals, fall back to `"financial"`.

### Budget & Loans Bugs

- [x] **Budget breakdown yearly chart is tied to quarter selector** — The stretch chart in the Budget breakdown tab changes when flipping through quarters at the top. It should be a static full-year chart spanning all 4 quarters, auto-adjusting its totals whenever a bill amount changes. The quarter tab selector should only affect the detail rows below, not the chart itself.

- [x] **Loan expense doesn't end at payoff** — When a loan is set to be paid off within the current fiscal year, the expense row in the breakdown chart continues projecting past the payoff date instead of dropping to $0. The running total should taper off and stop once the loan balance reaches zero within the fiscal year period.

---

## 8. Pre-Launch Polish

### UI Tune
- [ ] **Full UI pass** — review every panel for spacing, alignment, and visual consistency; fix any cards that feel cramped or misaligned on 390px; verify no horizontal scroll anywhere
- [ ] **Typography pass** — confirm all hero numbers use `--font-display`, all body text uses `--font-sans`, all inputs and data table cells use `--font-mono`; fix any mismatches
- [ ] **Loading and empty states** — every panel should have a clean skeleton or empty-state message; nothing should flash or jump on first load
- [ ] **Mobile tap targets** — audit all buttons and interactive elements at 390px; anything below 44×44px gets padding bumped

### Color Scheme Decision
- [ ] **Lock final color palette** — evaluate the current token set in `--theme` block (`--color-bg-base`, `--color-gold`, `--color-green`, `--color-red`, etc.); decide if any tokens need adjustment before first external user; document final decisions in CLAUDE.md
- [ ] **Status color consistency** — audit all `status` props on `MetricCard`; confirm green/gold/red always mean the same thing (positive/neutral-attention/negative) across all panels

### Auth Providers
- [ ] **Decide on supported auth methods** — email/password (already built), Google OAuth, Apple Sign In; Apple required for iOS App Store; pick which to support at launch
- [ ] **Wire Google OAuth** — `supabase.auth.signInWithOAuth({ provider: 'google' })`; add Google button to `LoginScreen.jsx`; configure provider in Supabase dashboard
- [ ] **Wire Apple Sign In** — `supabase.auth.signInWithOAuth({ provider: 'apple' })`; add Apple button to `LoginScreen.jsx`; configure provider in Supabase dashboard; required for iOS App Store compliance
- [ ] **LoginScreen layout update** — add OAuth buttons below email/password form with a divider ("or continue with"); style per platform guidelines (Apple button must be black/white)

### Benefits → Deductions Pipeline
The setup wizard collects health, dental, vision, STD, life/AD&D, HSA, FSA premiums and freeform `otherDeductions` into `config`, but **none of them are applied to take-home math**. Only `cfg.ltd` and `k401kEmployee` are deducted in `computeNet()` and `buildYear()`.

- [ ] **Wire benefit premiums into `buildYear()` taxable gross** — `healthPremium`, `dentalPremium`, `visionPremium`, `stdWeekly`, `lifePremium` are pre-tax deductions; reduce taxable gross before fed/state/FICA are applied (same position as `cfg.ltd` today)
- [ ] **Wire HSA and FSA into `buildYear()` taxable gross** — both are pre-tax; add to the pre-tax deduction pool alongside insurance premiums
- [ ] **Wire `otherDeductions` array into `computeNet()`** — sum `otherDeductions[].weeklyAmount` and subtract post-tax (after FICA/fed/state, since arbitrary deductions may not be pre-tax); or allow a `preTax` flag per entry
- [ ] **Respect `benefitsStartDate`** — deductions should only apply to weeks on or after `config.benefitsStartDate`; weeks before that date skip all benefit/HSA/FSA deductions (same pattern as `k401StartDate` gate on 401k)
- [ ] **Update wizard preview (Step 7 — Paycheck Buffer)** — the live net-per-check breakdown already shows a "Benefits" subtotal; verify it matches `buildYear()` after the fix and that the buffer step stays in sync
- [ ] **Income config view** — add benefit premium fields to the Income → Config read-only display and edit form (same treatment as `ltd` today)

### Setup Wizard Tune
- [ ] **End-to-end wizard walkthrough** — run a fresh account through every step; note any confusing copy, broken layout, or missing validation
- [ ] **Step copy pass** — trim any remaining multi-sentence helper text to one sentence; ensure every step has a clear "why this matters" hook
- [ ] **Mobile layout audit** — every wizard step must scroll cleanly at 390px with no clipped inputs or buttons hidden behind the keyboard
- [ ] **Edge case inputs** — test 0 values, very large numbers, and empty fields at each step; verify no NaN, Infinity, or blank values leak into config
- [ ] **Re-entry flow** — verify the Life Events re-entry path (lost job, changed jobs, commission) correctly diffs and re-runs only the affected steps

### Profile & Account Management
- [ ] **Profile screen** — new panel (or Settings tab) showing: display name, email, account created date, subscription status placeholder
- [ ] **Change email** — `supabase.auth.updateUser({ email: newEmail })`; confirmation email flow
- [ ] **Change password** — `supabase.auth.updateUser({ password: newPassword })`; current password confirmation before allowing change
- [ ] **Delete account** — destructive action with "type DELETE to confirm" gate; removes `user_data` row then calls `supabase.auth.admin.deleteUser()` (or a backend route); irreversible warning
- [ ] **Sign out all devices** — `supabase.auth.signOut({ scope: 'global' })`; useful when a device is lost

---

## 9. Post-Auth Roadmap

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

## 10. Optional Deductions Mapping (Post-Setup Wizard)

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

### Multi-User Readiness (2026-03-26)
- [x] Derive App header employer label from `config.employerPreset` — removed hardcoded "DHL / P&G — Jackson MO" from sidebar, mobile header, and drawer
- [x] `nightDiffRate` explicit in wizard Step 15 — writes `1.50` (night) or `0` (morning) on shift toggle alongside `dhlNightShift` bool
- [x] Remove FHA $3,000 hardcoded hint from BenefitsPanel 401k section (Anthony-specific)
- [x] Empty `INITIAL_EXPENSES` / `INITIAL_GOALS` / `INITIAL_LOGS` — removed Anthony's personal data from unauthenticated/error fallback constants
- [x] Add `baseRate`, `diffRate`, `nightDiffRate`, `dhlNightShift` to `DHL_PRESET.defaults` — preset is now self-contained
- [ ] Tax schedule tab for DHL users — pending tax research sprint (currently `isAdmin` only)

### Multi-User Readiness Stragglers (2026-03-26)
- [x] **"MO Flat Rate" label in Income config view** — renamed to "State Rate (fallback)"; hidden entirely when `config.userState` is set (field is unused once wizard assigns a state)
- [x] **`PTO_RATE` hardcoded constant removed from runtime** — `calcEventImpact()` and `computeBucketModel()` now use `cfg.baseRate` / `cfg.baseRate / 2` directly; `LogPanel` labels use `config.baseRate`; constant retained in config.js for test assertions only

---

### Event Log Rework

- [x] Pass `futureWeeks` into LogPanel and replace hardcoded `WEEKS_REMAINING = 44` so weekly unallocated and goals impact stay accurate as weeks pass
- [x] Pass live `goals` prop into LogPanel instead of using `INITIAL_GOALS` so "Goals at risk" reflects actual edited goal targets
- [x] Auto-derive `weekIdx` and `weekRotation` from the selected `weekEnd` date by matching against `allWeeks` — remove both manual inputs from the form
- [x] Add inline edit on existing log entries (not just delete) — expands in-card, pre-fills all fields, same conditional form logic as add, one open at a time
- [x] Date-level event selection — pay week dropdown replaces freeform date; 7-day pill picker selects specific days missed within the week; shiftsLost, weekendShifts, and hoursLost all auto-computed from selected days rather than estimated
- [x] New event type: **Missed Work — Unapproved** — distinct from `missed_unpaid`; day picker drives hoursLost (days × shiftHours); feeds gross loss calc AND attendance bucket tracker (`bucketHoursDeducted` in calcEventImpact, aggregated in logTotals)
- [x] **PTO accrual accuracy audit** — verified: 1hr/20 worked ✓; unpaid approved reduces accrual (`hoursLostForPTO = shiftsLost × shiftHours`) ✓; unapproved reduces accrual AND hits bucket ✓; PTO usage does NOT reduce accrual (`hoursLostForPTO = 0` for PTO events) ✓; paternity leave projection in Benefits uses `adjP = ptoBs - logPTOHoursLost / 20` ✓

---

*Last updated: 2026-03-26 — §8 Pre-Launch Polish added (UI tune, color scheme decision, auth providers, wizard tune, profile/account management). Old §8 Post-Auth Roadmap renumbered to §9; Old §9 Optional Deductions renumbered to §10.*
