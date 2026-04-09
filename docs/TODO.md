# TODO — Life RPG Finance Dashboard

## 1. Goals Funding + Tax Exempt Projection Integrity Sprint (2026-04-03)

- [x] **Funded goal cash absorption audit (no double counting after funding animation)**
  - [x] Trace current "Fund Goal" pipeline end-to-end: click handler → goal state mutation → funded list transfer → aggregate recompute path.
  - [x] Confirm funded amounts are treated as *spent* in all downstream totals: goals surplus section, surplus account, net worth, and annual take-home views.
  - [x] Add explicit guardrail checks so funded goal dollars cannot re-enter available surplus/take-home totals in later weeks.
  - [x] Validate behavior with a reproducible fixture (fund goal mid-year, confirm post-funding totals drop once and stay dropped).

- [ ] **Tax exempt payback withholding should behave like a real expense in taxed weeks**
  - [ ] Map where extra withholding is currently calculated and where it is displayed across weekly/monthly/year projections.
  - [ ] Ensure extra withholding is subtracted from taxed weeks as an expense (not only shown as a tax note), so future planning reflects reduced usable cash.
  - [ ] Propagate the same subtraction into forward-looking charts and monthly rollups (future taxed weeks and months).
  - [ ] Add consistency checks so weekly table, yearly projection math, and chart datasets all use one shared withholding-adjusted net value.

- [ ] **Goal timeline ETA sensitivity bug (expenses change but finish week stays static)**
  - [ ] Reproduce with a controlled scenario: increase recurring expenses by ~$150/week and compare goal #2 finish week before/after.
  - [ ] Audit timeline inputs to verify the predictor is using live post-expense surplus instead of stale or averaged values.
  - [ ] Fix dependency/recompute triggers so editing expenses immediately updates timeline completion weeks.
  - [ ] Add regression coverage for at least two deltas (e.g., +$150/week, +$300/week) to ensure ETA moves later when surplus shrinks.

- [x] **Goals card + horizontal timeline UI rework prep (premium liquid-flow direction)**
  - [x] Create a UI spec pass for goals card simplification: remove low-value text blocks and define minimum info hierarchy.
  - [x] Replace current "always full color bar" behavior with true progress-fill rendering tied to computed funding percentage.
  - [x] Evaluate removing goal color picker and standardize goals to one system color unless premium theming requires overrides.
  - [x] Bring the current + future month markers back to the goal fill bar to turn bar back into timelime bar reaching to end of fiscal year, with months that pass dropping off.
  - [x] Prototype "liquid/glass fill" interaction direction for premium mode while preserving readable fallback for standard mode.

*Last updated: 2026-04-04*

## 2. Non-Priority Brand Feature — Food Control Spotlight

- [ ] **Brand-first food expense identity (non-priority)** — elevate Food as its own required expense signal so the experience reinforces our core promise: you stay in control of life math, even in everyday categories that feel easy to ignore.
  - [ ] Add a dedicated Food expense card with a unique icon and visual emphasis (separate from generic Needs) while keeping it categorized under Needs in calculations.
  - [ ] Require a Food expense input in budget setup and default to **$400/month for one person** as the starting value.
  - [ ] Keep copy intentionally minimal in the core UI (subconscious visual emphasis over heavy explanation).

- [ ] **Fast food buffer toggle (new-user budget trigger, non-priority)**
  - [ ] Introduce this option only after a new user first opens the Budget tab (do not surface it earlier in onboarding).
  - [ ] Add a dedicated on/off toggle modeled after the paycheck buffer behavior and placement.
  - [ ] Use this exact explainer copy:
    - [ ] "Similar to the paycheck buffer feature that you can turn on or off in order to match realistic lifestyle numbers when calculating your goals in life every year, we would like to add a fast food buffer to your income math. This buffer will be ignored from your paycheck formulas and specifically when calculating your extra money for goals."
  - [ ] Ensure buffer math excludes the configured fast food amount from paycheck-based surplus/goal projections when enabled.


## 3. Desktop Scroll Regression

- [ ] **Global scrolling** — desktop scrolling regressed again; investigate the latest global layout/container changes and restore smooth wheel/trackpad scrolling across all tabs.

---

## 4. Non-DHL Experience Sprint

- [ ] **Week counter mismatch** — new non-DHL accounts show “Week 16” during Week 14; audit the wizard’s fiscal-week seeding for standard users so post-setup dashboards land on the correct `weekIdx`.
- [ ] **Step 2 shift differential flow** — remove the default weekend/night differential inputs for non-DHL users. Instead:
  - [ ] Ask whether the user has any shift differentials; when “Yes,” animate in a multi-select with “Night” and “Weekend” options.
  - [ ] For each selected option, show a rate input plus the necessary timing fields:
    - Night diff: start/end times for the higher rate window.
    - Weekend diff: choose whether weekend pay starts on Friday or Saturday, ends on Sunday or Monday, and specify the clock times for the cutoff.
  - [ ] Persist these schedules in Supabase (`user_data`) so non-standard rotations survive across devices.
- [ ] **Step 4 paystub alignment** — the gross/tax inputs inside the optional paystub calculator render staggered when expanded; tighten the layout so the three inputs share a clean grid.
- [ ] **Deductions layout** — the benefits/other deductions pickers grow too tall on both wizard variants. Widen the viewport breakpoint or switch to a two-column layout whenever a section would otherwise force long scrolling.
- [ ] **Non-DHL schedule expectations** — WeekConfirmModal currently shows seven empty days and treats every check as an extra pickup. Use the `standardWeeklyHours` input to derive the implied number of shifts/hours, pre-fill those days as “worked,” and only count hours beyond that baseline as surplus (e.g., 6 shifts at 8h each should net +8h, not +40h).
- [ ] **Pay frequency selection** — add a gate after the DHL preset question asking whether the user is paid weekly, bi-weekly, or monthly; thread that choice through all “per-check” math (expenses, goals, surplus) instead of assuming DHL’s weekly cadence.
- [ ] **PTO/bucket visibility** — if the wizard’s attendance/bucket question is answered “No,” hide PTO accrual cards and bucket hour components across the dashboard. Expose a Benefits subtab setup module only when the user opts into PTO and completes its formula inputs.

---

## 5. Auth Providers

- [x] **Wire Google OAuth** — end-to-end Google sign-in/sign-up via Supabase OAuth
  - [x] Frontend `signInWithOAuth` call + Google button in `LoginScreen.jsx` — done
  - [x] Supabase Google provider configured (Client ID + Secret set by user in Supabase dashboard) — done
  - [x] Delete account clears OAuth identity — `admin.deleteUser()` in `api/delete-account.js` removes Supabase auth user + all linked OAuth identities (Google); already correct
  - [x] **Whitelist redirect URLs in Supabase Auth** — in Supabase Dashboard › Authentication › URL Configuration › Redirect URLs, add: `http://localhost:5173`, your Vercel production URL, and `https://*.vercel.app` wildcard; without this, OAuth redirect back to the app is blocked in prod (config step, no code change)
  - [x] **Seed `user_data` row on first Google sign-in** — add explicit upsert in App.jsx `onAuthChange` handler when `event === 'SIGNED_IN'` so new OAuth users get a `user_data` row immediately; current path relies on debounced save (works but racy on slow connections)
  - [x] **Sync Google profile metadata on sign-in** — read `user.user_metadata.full_name` and `user_metadata.avatar_url` from the Google auth payload; new migration `005_add_profile_metadata.sql` adds `display_name TEXT` and `avatar_url TEXT` columns to `user_data`; write metadata in the SIGNED_IN handler; surface display name + avatar in ProfilePanel Account view
  - [x] **Link Google OAuth to Anthony's existing email account** — add "Link Google Account" button in ProfilePanel Account sub-view (only shown when user has no Google identity linked); calls `supabase.auth.linkIdentity({ provider: 'google' })` which triggers an OAuth redirect and attaches Google to the existing account without losing data or re-running setup wizard; show currently linked providers (email / Google)
  - [x] **Test sign-up and sign-in flows end-to-end** — new Google account (no existing `user_data`) should hit setup wizard; returning Google user should go straight to dashboard; verify no flash or missing-row errors on first OAuth land
- [x] **LoginScreen layout update** — OAuth button slots + divider in place
- [x] **LoginScreen layout update** — add OAuth buttons below email/password form with a divider ("or continue with"); style per platform guidelines (Apple button must be black/white)


## 6. Benefits ? Deductions Pipeline

The setup wizard collects health, dental, vision, STD, life/AD&D, HSA, FSA premiums and freeform `otherDeductions` into `config`, but **none of them are applied to take-home math**. Only `cfg.ltd` and `k401kEmployee` are deducted in `computeNet()` and `buildYear()`.

- [x] **Wire benefit premiums into `buildYear()` taxable gross** — `healthPremium`, `dentalPremium`, `visionPremium`, `stdWeekly`, `lifePremium` now reduce taxable gross alongside `cfg.ltd` and employee 401k.
  - Audit (2026-03-28): issue confirmed fixed — helper `weeklyBenefitDeductions()` feeds `taxableGross` today.
- [x] **Wire HSA and FSA into `buildYear()` taxable gross** — both pre-tax buckets share the same helper and already reduce taxable income.
  - Audit (2026-03-28): follow-up review confirmed `hsaWeekly`/`fsaWeekly` live in the same deduction pool.
- [x] **Wire `otherDeductions` array into `computeNet()`** — `otherDeductions[].weeklyAmount` now subtracts after-tax in both taxed and untaxed weeks.
  - Audit (2026-03-28): follow-up confirmed computeNet() mirrors the wizard preview subtotal for "Other Deduct."
- [x] **Respect `benefitsStartDate`** — deductions only apply to weeks on/after `config.benefitsStartDate`; earlier weeks keep gross untouched.
  - Audit (2026-03-28): buildYear() now stamps each week with `benefitsDeduction`, and computeNet() honors the per-week amount instead of blindly subtracting benefits.
- [x] **Update wizard preview (Step 7 — Paycheck Buffer)** — Step 7 shows gated benefits (or labels them as "start later") so the preview matches take-home math.


## 7. Setup Wizard Tune

- [ ] **End-to-end wizard walkthrough** — run a fresh account through every step; note any confusing copy, broken layout, or missing validation
- [ ] **Step copy pass** — trim any remaining multi-sentence helper text to one sentence; ensure every step has a clear "why this matters" hook
- [ ] **Mobile layout audit** — every wizard step must scroll cleanly at 390px with no clipped inputs or buttons hidden behind the keyboard
- [ ] **Edge case inputs** — test 0 values, very large numbers, and empty fields at each step; verify no NaN, Infinity, or blank values leak into config
- [ ] **Re-entry flow** — verify the Life Events re-entry path (lost job, changed jobs, commission) correctly diffs and re-runs only the affected steps


## 8. Profile & Account Management

> Audit run: 2026-03-28

- [x] **Profile screen** — new panel (or Settings tab) showing: display name, email, account created date, subscription status placeholder
  - Audit: **Partially live** (Profile panel + Account view exist, email shown), but display name, account created date, and subscription placeholder are not implemented.
- [ ] **Change email** — `supabase.auth.updateUser({ email: newEmail })`; confirmation email flow
  - Audit: **Not live** (no change-email form/action found).
- [ ] **Change password** — `supabase.auth.updateUser({ password: newPassword })`; current password confirmation before allowing change
  - Audit: **Partially live** (`updateUser({ password })` exists), but current-password confirmation gate is not implemented.
- [ ] **Delete account** — destructive action with "type DELETE to confirm" gate; removes `user_data` row then calls `supabase.auth.admin.deleteUser()` (or a backend route); irreversible warning
  - Audit: **Not live** (no delete-account UI/flow found).
- [ ] **Sign out all devices** — `supabase.auth.signOut({ scope: 'global' })`; useful when a device is lost
  - Audit: **Not live** (standard sign-out exists; global scope sign-out not found).


## 9. Post-Auth Roadmap

### Fiscal Week Features

- [x] **Fiscal week awareness** — app knows current week of the fiscal year (Week X of 52); `today` state ticks at midnight and cascades reactively through all panels; `FISCAL_YEAR_START` centralized constant; week badge in header, log, benefits, budget phase all in sync
  - [x] Confirmation of days worked vs. projected schedule each week
  - [x] Goal timeline surplus math — `futureWeekNets[]` (per-week `computeNet()` output, buffer-excluded) feeds `computeGoalTimeline()` directly; flat average no longer used

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



## 10. Authority OS ? Design System Migration

This section tracks incremental migration from the old "Dark Wealth" gold-based spec to the live Flow shell + future Pulse overlay system. Work is ordered by visual impact and risk.

### Green Alignment

- [x] **`ui.jsx` — fix METRIC_STATUS green.val** — changed from `var(--color-accent-soft)` to `var(--color-green)` (#22C55E)
- [x] **`index.css` — update `--color-gold-bright` flash token** — changed from `#4ade80` to `#33e0b0`
- [x] **Audit foreground use of `--color-accent-soft`** — lime no longer used as any foreground text or value color

### Remaining Rename + Cleanup

- [x] **Finish Authority OS rename** — `index.html` title + PWA label updated, `package.json` name updated, "Life RPG" eyebrow in `LoginScreen.jsx` updated
- [x] **Remove dead Google Fonts load in `index.html`** — DM Serif Display + DM Sans removed; JetBrains Mono only remains

### Pulse Layer (when ready — Phase 2)

- [ ] **Add Pulse signal tokens to `index.css`** — `--color-signal-blue: #5B8CFF`, `--color-signal-purple: #7C5CFF`, `--color-signal-glow: rgba(124,92,255,0.25)`
- [ ] **Build `InsightRow` component** — trend arrow + delta + label; signal-blue/purple only; always below primary metric; export from `ui.jsx`

---



## 11. Optional Deductions Mapping (Post-Setup Wizard)

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



## 12. Countup Animation Scope (2026-03-31)

- [x] **Countup animation rolled out to all dollar cards** — `rawVal` prop added to every dollar-amount `Card`/`MetricCard` across Income, Budget, Benefits, and Log panels. Previously only HomePanel cards animated.
- [ ] **[CC] Scope countup to first tab visit per session only (non-Home tabs)** — currently the 0→target countup fires every time a non-Home tab is mounted (i.e. every tab switch). If this feels like too much motion in practice, gate the animation so it only runs on the *first* visit to each tab within a session. Implementation sketch: track a `Set<panelName>` in App-level state (or a session-scoped ref), pass a `skipCountup` boolean into each panel, and suppress `rawVal` on `Card` if the panel has already been visited this session. Home tab always animates (no gate). The `rawVal` flash-on-change behavior should still fire on data changes regardless of the gate.

---

## 13. Income Weekly Sticky Header

- [ ] **Weekly subtab sticky card** — the Income tab’s Weekly view uses a sticky header/table shell that works on desktop, but on iPhone 17 the sticky row detaches ~2 cm before reaching the Dynamic Island and then snaps awkwardly. Rebuild the sticky behavior so the mini chart and column labels pin exactly at the viewport-safe-area boundary and release as expected across Safari/Chrome (test both portrait and landscape).

---

## 14. Mobile Navigation + Income IA + Budget Breakdown/Goals Bridge Discovery Notes (2026-04-03)

- [ ] **Navigation: make Goals a first-class destination**
  - [ ] Add Goals as a standalone top-level destination in both drawer and bottom navigation.
  - [ ] Reduce mobile primary shortcuts to ~5 total destinations.
  - [ ] Keep drawer and bottom-nav destinations aligned.

- [ ] **Income: simplify IA before downstream budget/goal work**
  - [ ] Remove the Income config sub-tab.
  - [ ] Move Income configuration controls to Profile/Account settings.
  - [ ] Collapse Income monthly/weekly into one unified primary view.

- [ ] **Budget: improve breakdown clarity and next-check realism**
  - [ ] Add a deductions line item to Breakdown as display-only.
  - [ ] Keep deductions display additive only; do not change tax threading or net-calculation logic.
  - [ ] Key Breakdown cashflow to next-check cadence instead of flat averages.

- [ ] **Goals timeline: tighten per-week completion precision**
  - [ ] Add a helper bridge that exposes weekly surplus snapshots for both Breakdown and Goals views.
  - [ ] Base completion timing on per-week surplus progression, not annualized fallback-first behavior.
  - [ ] Show goal-finish context with both projected horizon and near-term weekly surplus deltas.

## Completed

### Completed Section Summaries

- [x] **Immediate Bug Fixes** ? Cashflow and Goals tabs were audited so their math and layouts stay accurate after the early regressions. Follow-up checks are documented so future releases catch issues faster.
- [x] **Quarterly Phase Refactor** ? All budgeting, finance, and database layers now use four named quarters (Jan?Mar, etc.) with migrations to pad historic data. UI labels and selectors match the new cadence everywhere.
- [x] **Attendance Bucket Model** ? The DHL/P&G attendance engine runs monthly bonus math straight from the event log and shows bucket tiers, payout projections, and safety bands on the dashboard.
- [x] **Setup Wizard** ? The six-step wizard handles first-run and Life Event re-entry with DHL presets, validation, migrations, and tax/benefit previews so config stays consistent.
- [x] **WeekConfirmModal ? Three Holes** ? Swap logging, stricter validation, and accurate pay-period labeling shipped in both layers so real schedule changes are captured without empty events sneaking through.
- [x] **Auth & Multi-User** ? Supabase auth with RLS, login flows, and session persistence now gate the app, keeping Anthony's data isolated while enabling future accounts.

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

---

---
