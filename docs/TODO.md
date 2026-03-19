# TODO — Life RPG Finance Dashboard

## Bug Fixes & Polish

- [ ] **Event log rework** — form UX improvements and math fixes:
  - [x] Pass `futureWeeks` into LogPanel and replace hardcoded `WEEKS_REMAINING = 44` so weekly unallocated and goals impact stay accurate as weeks pass
  - [x] Pass live `goals` prop into LogPanel instead of using `INITIAL_GOALS` so "Goals at risk" reflects actual edited goal targets
  - [x] Auto-derive `weekIdx` and `weekRotation` from the selected `weekEnd` date by matching against `allWeeks` — remove both manual inputs from the form
  - [ ] Add inline edit on existing log entries (not just delete) — expands in-card, pre-fills all fields, same conditional form logic as add, one open at a time
  - [ ] Date-level event selection — currently events are logged per pay week; add ability to select specific calendar days within that week so financial impact (gross lost, PTO used, attendance hit) is calculated against the actual shift days missed rather than estimating at the shift count level
  - [ ] New event type: **Missed Work — Unapproved** — distinct from `missed_unpaid`; fields: hours missed this shift (input as "X of {config.shiftHours}", e.g. "X of 12"), missed days, worked days, note; feeds gross loss calc AND attendance bucket tracker
  - [ ] **Attendance bucket model** — DHL/P&G policy formula, tracked month-by-month from the event log:

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
    - [ ] Aggregate unapproved hours per calendar month from the event log to determine each month's bonus tier
    - [ ] Running bucket total: start from current known balance, apply monthly net (bonus - deductions) for each past month, project forward
    - [ ] Dashboard indicator in Log or Benefits panel: current bucket level, hours until next tier drop, months until bucket goes critical, "safe / caution / critical" status band
    - [ ] Hook into existing bucket cap already in the app

  - [ ] **PTO accrual accuracy audit** — verify full chain: 1hr per 20 worked; unpaid approved reduces accrual; unapproved reduces accrual AND hits bucket; PTO usage does NOT reduce accrual (accrual continues while on PTO); paternity leave projection in Benefits reflects all logged events
- [ ] Fix Cashflow tab in Budget panel — review layout, math, and display accuracy
- [ ] Fix Goals display — verify weeks-to-completion math and progress rendering

## Features In Progress

- [x] **Fiscal week awareness** — app knows current week of the fiscal year (Week X of 52); `today` state ticks at midnight and cascades reactively through all panels; `FISCAL_YEAR_START` centralized constant; week badge in header, log, benefits, budget phase all in sync
  - [ ] Goals needing to be marked complete when funded
  - [ ] Confirmation of days worked vs. projected schedule each week
  - [ ] Goal timeline surplus math — swap flat `weeklyIncome` average for actual per-week `computeNet()` so taxed vs. non-taxed weeks produce accurate surplus and goal sequencing reflects real pay variation

## Upcoming Features

- [ ] **Setup Wizard** — onboard new / demo users by capturing all income-affecting variables:
  - [ ] Rigid vs. flexible schedule detection (live logging of worked days if non-set schedule)
  - [ ] Paycheck buffer — enforce a $50/check minimum safety buffer for uncalculated expenses
  - [ ] Benefits tab — capture if/when benefits kick in: health insurance, 401k enrollment date and match rate, LTD/STD, and any other deductions so the income engine reflects the correct net from day one
  - [ ] Tax exemption disclaimer — small "Advanced" text link near any tax withholding / exemption inputs that opens a modal with a professional, warm warning: adjusting exempt status carries personal tax liability risk, Life RPG is a planning tool only and is not responsible for tax outcomes. Tone: informative and caring, not cold legal-speak "Heads up — adjusting your withholding or exemption status can affect how much you owe at tax time. Life RPG helps you plan and visualize your finances, but we're not a tax advisor. If you're unsure, a quick chat with a CPA before changing your W-4 can save you a headache come April. You've got this — just go in informed."
  - [ ] **Tax exempt mode gate** — the Tax Schedule tab, per-week taxed/exempt toggles, extra withholding toggle, and all related UI should be hidden behind an opt-in wall; user must read and accept the disclaimer warning before the controls unlock; acceptance persists in user state so they don't re-confirm every session; if not opted in, show a locked/blurred placeholder with the "Advanced" prompt to enable
  - [ ] **Config onboarding wizard** — reverse-engineer all hardcoded config fields into guided setup steps grouped by section:
    - [ ] **Pay Structure** — base hourly rate, shift length (hrs), weekend differential ($/hr), OT threshold (hrs/wk), OT multiplier
    - [ ] **Schedule** — first active week index (when did/does the job start), pay rotation detection (Week 1 / Week 2 pattern)
    - [ ] **Deductions** — LTD weekly amount, 401k employee contribution %, employer match %, 401k enrollment start date
    - [ ] **Tax Rates** — Week 2 federal withholding rate, Week 2 MO state rate, Week 1 federal rate, Week 1 MO state rate, FICA rate (default 7.65%, rarely changes)
    - [ ] **Annual Tax Strategy** — federal standard deduction, MO flat rate, target amount owed at filing
    - [ ] Each section should explain in plain English what the field affects and where to find the value (e.g. "check your paystub" or "your offer letter")

- [ ] **Quarterly phase refactor** — replace the current 3 arbitrary phases with 4 clean calendar quarters; each quarter is 3 months and named by month range (e.g. "Jan–Mar") never "Quarter 1" or "Phase 1":
  - [ ] **`config.js`** — replace `PHASE_END_DATES` (2 cutoffs) with 3 quarter boundaries (`2026-03-31`, `2026-06-30`, `2026-09-30`); replace `PHASES` array (3 entries) with 4 quarter definitions labeled `Jan–Mar`, `Apr–Jun`, `Jul–Sep`, `Oct–Dec` with assigned colors
  - [ ] **`finance.js`** — update `getPhaseIndex` to return 0–3 for 4 quarters; update `buildLoanHistory` to emit `weekly: [w, w, w, w]` (4 values); `getEffectiveAmount` and all callers pick up the change automatically since they index by phase
  - [ ] **`BudgetPanel.jsx`** — update all `[p1, p2, p3]` input sets to `[p1, p2, p3, p4]`; replace "Phase 1 Weekly" / "P1/wk" labels with the corresponding month-range label ("Jan–Mar /wk"); update phase selector tabs to show 4 quarter labels
  - [ ] **`db.js`** — add migration on load: any expense history entry with a `weekly` array of length 3 gets a 4th value appended (copy the 3rd quarter value into Q4 as a safe default)
  - [ ] **Visibility rule** — quarter labels appear only in Budget expense editing and anywhere a "current quarter" context tag is useful (e.g. cashflow, statements); do not surface in income, benefits, or log panels

- [ ] **Theoretical Tab** — new page for quick "what if" income scenarios:
  - [ ] Job change / income change
  - [ ] Investment return modeling
  - [ ] Second job income layering
  - [ ] Output: "Here's how everything could hypothetically look if..."

- [ ] **Calendar Tab** — visual calendar mapping all expense due dates, loan payment dates, and goal milestones

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

*Last updated: 2026-03-18*
