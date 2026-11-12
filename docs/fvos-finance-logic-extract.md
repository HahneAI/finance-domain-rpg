# FVOS Finance Logic Extract (from Authority Finance)

Research only. This extracts the LOGIC of Authority Finance (A:Fin) for a fresh, offline, plain-JS rewrite
in FVOS (see FVOS `docs/ROADMAP_DECISIONS.md` R6). No code or schema is meant to be copied. Every number in
this doc is made up. Paths are relative to this repo (`src/lib/…`). Written 2026-11-12, from branch
`claude/coach-ai-personality-bmopcx` (in sync with `Version-control` at `96b765e`).

**Vocabulary.** A:Fin runs everything on a **weekly basis**: incomes and costs are converted to "$ per week",
summed, then scaled back to per-paycheck or per-month only for display. A **fiscal week** is one row of a
yearly grid (`buildYear`). **Phase** = calendar quarter 0–3.

---

## 1. Calculation inventory

### 1.1 Income (personal payroll)
| Calc | Formula | Path |
|---|---|---|
| Weekly gross | `reg×rate + regWeekendH×diff + OT×rate×otMult + otWeekendH×diff×otMult`, with `reg = min(hours, otThreshold)`, `OT = max(hours − otThreshold, 0)`; weekend hours fill the regular bucket only after non-weekend hours | `finance.js` `buildYear`, `estimateWeeklyGross` |
| Weekly net | `net = gross − fed − state − FICA − benefits − 401k − otherPostTax`; `fed = taxable × rate(hi/lo week) + extraPerCheck` on "taxed" weeks only; `taxable = gross − benefits − 401k`; `FICA = gross × ficaRate` | `finance.js` `computeNetBreakdown`/`computeNet` |
| Annual net | `Σ net` over active weeks | `App.jsx` `projectedAnnualNet` |
| Spendable weekly income | `weeklyIncome = annualNet / activeWeeks − allowancePerWeek`; `activeWeeks = totalWeeks − firstActiveIdx` (53 in a 53-week year, not 52) | `App.jsx`, `fiscalWeek.js` `resolveActiveWeeksThisYear` |
| Per-check ↔ per-week | `perCheckFactor = 52 / checksPerYear` (weekly 52, biweekly 26, monthly 12) | `cashOnHand.js`, `App.jsx` |
| Tax gap → extra withholding | `liability = progressive(max(Σtaxable − stdDeduction, 0))`; `gap = liability − Σ(taxable × rate)` over taxed weeks; `extraTotal = max(gap − targetOwed, 0)`; `extraPerCheck = extraTotal / remainingTaxedChecks` (0 if none) | `App.jsx` `taxDerived`, `finance.js` `fedTax`/`stateTax` |
| Employer match (tiered) | `min(r, 4%) + min(max(r − 4%, 0), 2%) × 0.5` | `finance.js` `dhlEmployerMatchRate` |
| Logged events | Missed shift / bonus / PTO → `grossLost`/`grossGained` against that week's own gross; net impact = gross delta through the same tax rates | `finance.js` `calcEventImpact` |

Edge cases: `annualNet / 0 → 0`; a week before `firstActiveIdx` is inactive, never zero-income; non-taxed weeks
have higher net, and the gap is recovered on taxed weeks (not tax-free).

### 1.2 Costs (recurring items)
| Calc | Formula | Path |
|---|---|---|
| Display reserve (rounded) | `perWeek = roundToQuarter(monthly(amount, cycle) / 4)`; `monthly`: weekly×4, biweekly×2, every30days×1, yearly÷12 | `expense.js` `perPaycheckFromCycle`, `roundToQuarter` |
| Exact weekly cost | `amount × cyclesPerYear / 52` (weekly 52, biweekly 26, every30days 12, yearly 1) | `expense.js` `exactWeeklyCost` |
| Amount in force for a month | Override for that month, else the newest history entry with `effectiveFrom ≤ the 15th`, else `weekly[phase]` | `finance.js` `getEffectiveAmountForMonth`, `getExactEffectiveAmountForMonth` |
| Remaining spend | `total = Σ_weeks Σ_items exactWeekly(item, month(week))`; `avgWeeklySpend = total / futureWeeks` | `finance.js` `computeRemainingSpend` |
| Monthly expenses | Three different constants exist: `avg × 52/12` (Home), `avg × 4.33` (`normalizeToMonthlyAmount`), `reserve × 4` (bill cards) | `HomePanel.jsx`, `finance.js`, `expense.js` |
| Next due date | `anchor + ceil((today − anchor) / cycleDays) × cycleDays`; never in the past; today = anchor counts as due | `expense.js` `getNextDueDate` |
| Due today / this week | Dated bills: `perPayment × occurrences in window`; undated: averaged weekly share; returns null until at least one bill has a due date | `finance.js` `getBillsDueOn`, `computeThisWeekActualSpend` |
| Deleted item | Never removed from storage. Amount is zero this month, nothing non-zero later in the year, and history exists. | `finance.js` `isExpenseRemoved` |

Edge cases: no future weeks → every output 0 (guarded); unknown cycle → every30days; a mid-month change
applies to the WHOLE month (15th rule).

### 1.3 Loans
`weekly = payment` (weekly) `| payment/2` (biweekly) `| payment×12/52` (monthly). `payments = ceil(total/payment)`;
`payoff = first + round(payments × daysPerCycle)` (30.4375 for monthly). Reserving starts one cycle before the first
payment. It stays at the full weekly amount through the END of the payoff quarter, then drops to 0.
Path: `finance.js` `loanWeeklyAmount`, `computeLoanPayoffDate`, `buildLoanHistory`.

### 1.4 Health, savings, "net worth"
| Calc | Formula | Path |
|---|---|---|
| Left this week | `lastPaycheckNet − avgWeeklySpend` (falls back to `weeklyIncome`) | `HomePanel.jsx`, `finance.js` `resolvePrevWeekNet` |
| Spend ratio + band | `ratio = income > 0 ? spend/income : 0`; `<0.5` well-managed, `<0.75` healthy, else watch | `upkeepHealth.js` |
| Annual savings ("net worth") | `(weeklyIncome − avgWeeklySpend) × activeWeeks − fundedGoalSpend`. This is a FLOW, not a balance; no balance is stored. | `HomePanel.jsx` |
| Savings rate / thin cushion | `rate = annualSavings / (weeklyIncome × activeWeeks)`; flagged when `< 10%`; null when income ≤ 0 | `finance.js` `netWorthHealthStatus` |
| Funded goal spend | `Σ target` of completed goals with target > 0 and `completedAt ≤ today` (a missing date still counts) | `goalFunding.js` `getFundedGoalSpend` |

### 1.5 Cash on hand (employed)
`cash = anchor + Σ paychecks credited since anchor date (user correction, else estimate) − Σ Needs-bill occurrences
due since anchor date`. A paycheck is credited the day after its pay period ends. `setAside = weekly Needs (incl.
loans) × perCheckFactor`; `gap = cash − setAside`. Status:
- **red** if any bill due before the next payday can't be covered by walking the bills in date order;
- otherwise **green** if `gap ≥ 0`;
- otherwise **orange** if `−gap ≤ max(200, 20% × setAside)`;
- otherwise **red**.

`ifStoppedWeeks = max(cash, 0) / weeklyNeeds`. Path: `cashOnHand.js` `computeCashOnHand`, `computeNeedsSetAsidePerCheck`.

### 1.6 Runway (no income: "New Job Season")
`burn = Σ weekly essential tracked items`; `cash = max(0, rawCash − bills due since its as-of date)`; optional
benefits add `remainingWeeks × weeklyBenefit`.

`days(cash)`:
- `∞` if `burn ≤ 0`;
- `cash / burn × 7` with no pending inflow;
- with an inflow of `P` landing in `d` days: if the money runs out first (`cash − burn/7 × d ≤ 0`), then `cash / (burn/7)`;
- otherwise `d + (cash − burn/7 × d + P) / (burn/7)`.

Cliff date = `today + round(days)`. Lifestyle spend is reported but excluded from burn. Path: `newJobSeasonRunway.js`
`computeNewJobSeasonRunway`, `resolvePrimaryRunwayDays`.

### 1.7 Goals (the "Claim Date")
- **Funding sim** (`finance.js` `computeGoalTimeline`): for each future week,
  `surplus = net[w] − weekEvents[w] − Σ items exactWeekly − pastLosses/n + gains/n`.
  - A positive surplus fills goals strictly in list order (waterfall).
  - `endWeek = w + fund / (fund + leftover + 0.0001)`.
  - Weeks before an optional "epoch" week fund nothing.
  - An unfinished goal gets `wN = remaining / (avgSurplus − 0.01)` when `avgSurplus > 0`, else **∞**, which means stalemate.
- **Date** (`claimDate.js` `computeClaimDates`): `finish = currentWeekStart + ceil(offset) × 7 days`.
  - Goals that miss this year use a flat next-year estimate (`finance.js` `estimateGoalNextYear`), queued cumulatively.
  - Past a rolling 5-year horizon the date is hidden and shown as "BEYOND 5YR".
  - The queue is sorted by date.
- **Limits** (`goalLimits.js`): at most 6 active goals. Total active targets must stay ≤ `(weeklyIncome − weeklyNeeds) × 52/12 × 60`.
  - There's no cap when surplus ≤ 0.
  - Only a change that grows the plan is blocked.
  - Tolerance is 0.005.
- **Slip alert** (`claimDateWatch.js`): alert when the date moves ≥ 14 days later than its saved baseline. A target or rank change re-baselines quietly.

### 1.8 Resource snapshot (export to Cyborg)
Copies, never recomputes:
- cash, pending credits, status, gap, set-aside, weekly Needs and Lifestyle, the at-risk bill;
- the next paycheck (date and amount);
- the next Claim Date (future only, none in runway mode).

Money is rounded `Math.round(n×100)/100`; non-finite values become `null`, never 0. Path: `resourceSnapshot.js`.

### 1.9 Investor financial models
**None exist in this repo.** The investor work (`docs/INVESTOR_FEATURE_TODO.md`, `api/seed.js`) is an access-code
signup plus demo accounts. There are no revenue, MRR, CAC/LTV or unit-economics models to extract. Anything like that for
FVOS is new design (§3).

**Rounding and currency, overall:** USD only, no currency field anywhere. Store full precision. Round only at
display (`Math.round` dollars) or at an export boundary (cents). Rounding conventions:
- Bill reserves use the quarter-dollar `roundToQuarter`.
- Week counts use `ceil` (payments, finish week).

---

## 2. Entities (minimal)
| Entity | Key fields | Relations |
|---|---|---|
| **Income plan** | pay schedule (checks/yr), rate or salary, hours, tax rates, deductions, first active week | → weeks |
| **Week** (derived) | idx, start/end, active, gross, taxable, net, isPayWeek, payPeriodEnd | from income plan |
| **Recurring item** | label, category (Needs / Lifestyle / Loan), amount + cycle, due anchor, history[{effectiveFrom, weekly[4]}], monthOverrides{month: {amount, cycle}} | many per owner |
| **Loan** (item subtype) | total, payment, frequency, first payment date | is a recurring item |
| **Event** | date/week, type (missed, bonus, PTO…), hours/amount | → week |
| **Goal** | label, target, order (rank), completed, completedAt | ordered list |
| **Cash anchor** | amount, asOf date, per-paycheck corrections | → paychecks since asOf |
| **Week confirmation** | week idx → confirmed | → week |

Key design trait: **point-in-time history**. Edits append `{effectiveFrom, …}` entries instead of overwriting, so past
weeks keep their old amounts.

---

## 3. Personal vs business

| Calc | Verdict | How |
|---|---|---|
| Payroll gross/net, tax gap, match, events | **Drop** (personal-only) | Ventures record actual revenue/costs, not paychecks |
| Weekly basis + per-period scaling | **Keep** | Same `perPeriodFactor = 52 / periodsPerYear`; let a venture pick weekly or monthly |
| Exact cycle cost, next-due date, due-in-window | **Keep** | Unchanged; they are cycle math |
| Point-in-time history, month override | **Keep** | Replace the "15th of the month" rule with a real date-range lookup |
| Remaining spend / avg spend | **Generalize** | Per venture, per project, per category |
| Loans | **Keep** | Also covers equipment financing |
| Spend ratio | **Generalize** | Ventures: `costs / revenue` (margin is `1 − ratio`); undefined, not 0, when revenue = 0 |
| Annual savings / savings rate | **Generalize** | Becomes **net cash flow** and **profit margin** |
| Cash on hand | **Generalize** | Anchor + inflows − outflows since anchor, any inflow type |
| Runway with pending inflow | **Keep** | Core of venture burn/runway; allow many pending inflows, not one |
| Goals + waterfall + Claim Date | **Generalize** | Becomes **milestones funded from surplus or a budget**; the stalemate (∞) rule is essential |
| Goal limits (6, 5-year cap) | **Drop** | Personal guardrails |
| Resource snapshot | **Generalize** | Becomes the per-venture summary row the roll-up reads |

**What ventures need that A:Fin lacks:**
1. **Revenue lines** per product/channel (e.g. ad revenue, sponsorships, app sales), with actuals vs forecast.
2. **Cost per project**: tag every cost to `venture → project`; shared costs need an allocation rule.
3. **Burn and runway per venture**: `netBurn = costs − revenue` (gross burn = costs); `runway = cash / netBurn`, ∞ if ≤ 0.
4. **Unit economics**:
   - `margin/unit = price − variableCost/unit`;
   - `margin % = margin / price`;
   - `break-even units = fixedCosts / margin per unit` (undefined if margin ≤ 0).
5. **R&D with no revenue**: cumulative spend, a burn trend, and runway to a funding date. Ratios must not divide by zero revenue.
6. **Roll-up across ventures**: sum revenue, costs and cash; consolidated runway uses the consolidated cash and burn, NOT an
   average of runways.
7. **Actuals ledger** (transactions). A:Fin only projects from plans and has no transaction table; ventures need recorded
   actuals, plan-vs-actual and date-ranged reports.
8. **Currency field** (even if single-currency at first) and **period close** (lock a month).

---

## 4. Worked test cases (made-up numbers; outputs verified by running A:Fin's functions)

1. **Exact vs display cost.**
   - $120 every 30 days: exact weekly `120×12/52 = 27.6923…`; display reserve `roundToQuarter(120/4) = 30`.
   - $260 yearly: exact `5.00`; display `roundToQuarter(260/12/4) = 5.50`.
   - $45 weekly: both `45`.
2. **Remaining spend, mid-month change.** Item A 30/wk and item B 10/wk, with B dropping to 0 effective May 10. Weeks ending
   May 4 and May 11. Expected `total = 60`, `avg = 30`: B is 0 for the WHOLE of May (15th rule). A date-range engine should give
   `total = 70` (B counts in week 1). Pick one and pin it.
3. **No future weeks.** `computeRemainingSpend([], [])` → every output 0, `monthKey null`.
4. **Spend ratio bands.**
   - 350/500 → `0.70` "healthy".
   - 400/500 → `0.80` "watch".
   - Exactly 0.50 → "healthy"; exactly 0.75 → "watch".
   - Spend 100 on income 0 → `0` "well-managed". **That last one is wrong**; ventures must return undefined.
5. **Thin cushion.**
   - Income 500/wk, spend 460/wk, 52 weeks → savings 2,080 on 26,000 → `rate 0.08`, flagged.
   - 5,200 on 26,000 → `0.20`, not flagged.
   - Income 0 → `rate null`, not flagged.
6. **Goal waterfall.** Nets [100,100,100], no costs, goals A=150 then B=100.
   - A: `start 0, end ≈ 1.5`.
   - B: `start 1, end ≈ 2.5, duration ≈ 1.5`.
   - Both finish (`remainingAtEnd 0`).
7. **Goal stalemate.** Nets [50,50], costs 60/wk, goal 100 → `end null`, `duration ∞`, `remainingAtEnd 100`. The UI shows a
   stalemate message, never a date.
8. **Epoch.** Same as case 6, single goal 150, epoch = 2nd week → `start 1, end ≈ 2.5`.
9. **Smeared past loss.** Nets [100,100,100], logged loss 60 spread over 3 weeks (20/wk), goal 150 → `end ≈ 1.875`.
10. **Monthly loan.** Total 1,200, payment 100 monthly, first 2026-01-15.
    - weekly `23.0769…`; 12 payments; payoff `2027-01-15`; reserving starts `2025-12-16`.
    - Reserve stays until `2027-04-01` (end of the payoff quarter).
    - Biweekly 80 → `40/wk`.
11. **Loan, uneven last payment.** Total 1,000, 300 weekly from 2026-03-02 → `ceil = 4` payments, payoff `2026-03-30`. The
    model reserves 300 for the last payment although only 100 is owed.
12. **Runway with a pending inflow.** Cash 700, burn 350/wk (50/day):
    - Inflow 300 in 10 days → `20` days.
    - Same inflow in 20 days → `14` days (cash ran out first).
    - Burn 0 → `∞`.
    - No inflow → `14`.
13. **Cash status.** Set-aside 400, orange band `max(200, 80) = 200`:
    - Cash 1,350 → green.
    - Cash 300 (gap −100) → orange.
    - Cash 100 (gap −300) → red.
    - Cash 500 with a 600 bill due before payday → red.
14. **Goal limits.** Income 500/wk, Needs 300/wk → cap `200 × 52/12 × 60 = 52,000`.
    - 5 active goals of 1,000 + new 47,000 → allowed (equals cap).
    - +47,001 → "amount".
    - 6 active + any new goal → "count".
    - Lowering a target on an over-cap plan → allowed.
15. **Funded goals.** Completed 300 (no date) + completed 200 dated after today + open 999 + completed −5 → `300`.
16. **Tax gap** (made-up brackets: 10% to 10,000, 20% above).
    - Taxable 30,000, std deduction 10,000 → AGI 20,000 → liability 3,000.
    - Withheld 2,200, target owed 300 → extra 500.
    - Over 20 remaining taxed checks → `25/check`; 0 remaining checks → `0`.
17. **Cents rounding trap.** `round2(12.345) = 12.35` but `round2(1.005) = 1.00` (binary float). Use integer cents or a
    decimal-safe round.
18. **Three "months".** 100/wk → `433.33` (×52/12), `433` (×4.33), `400` (×4). Pick ONE.

---

## 5. Lessons learned (warden case law: `docs/drift-app-warden.md`)

- **Fake-positive divisor** (`computeGoalTimeline`, DW-26): a floor `max(avgSurplus − 0.01, 0.01)` turned a NEGATIVE surplus
  into "0.01/week", producing claim dates 1,000+ years out. Fix: return ∞ and treat it as a first-class "stalemate" state.
- **Diluted average** (F13/F14): weekly income was divided by a flat 52 even for a user active only part of the year, giving a
  fraction of a real paycheck. Fix: divide by active weeks, from one shared helper.
- **Parallel formulas**:
  - Runway was once estimated separately for Coach and for the runway panels, and they disagreed (F24). Fix: one function plus a shared selector.
  - Spend ratio now has one formula for its three readers (`upkeepHealth.js`).
  - Monthly conversion still lives in three (case 18).
- **Two rounding paths on purpose:** quarter-dollar for bill cards, exact 52-week for totals. A $150/yr bill showed $156/yr
  "annual" on the rounded path. Keep display rounding out of any total.
- **Stale cached estimate:** a form's "amount entered" (`billingMeta`) was used as the current amount and drifted from month
  overrides by double digits. One resolver for "amount in force" only.
- **Wrong anchor:** an "edited at" timestamp was used as a bill's due-date anchor, so every recently edited bill looked due
  today. Keep `dueAnchor` and `editedAt` as separate fields.
- **Index clamping:** finish dates were found by indexing the current-year week grid, so anything past year-end clamped to
  the last week. Fix: date arithmetic from the current week start.
- **53-week years** (F148): `52` hard-coded vs a real 53-week grid. Separate the "nominal year" (52) from the "real grid
  length" constant and name both.
- **Retroactive recompute:** editing a bill must not rewrite past weeks. That is why history is point-in-time with
  `effectiveFrom`, and deletion zeroes forward.
- **Double subtraction (designed out):** "Mark as paid" plus the automatic bill decay would subtract the same bill twice,
  so the paid occurrence is flagged and the decay skips it (`planMarkBillPaid`). Any engine with both manual and automatic
  posting needs this rule.
- **Designed differently today:**
  - A transaction ledger as the base truth, with projections layered on top.
  - Date-range lookups instead of "phase/quarter" arrays.
  - Integer cents.
  - One period-conversion module.
  - Undefined instead of 0 when a ratio has no denominator.

---

## 6. Not worth carrying
- **Employer rotation schedules, weekend/night differentials:** one employer's pay rules, irrelevant to ventures.
- **Withholding estimator / tax gap:** personal payroll tax; venture tax is a different domain.
- **Freedom Allowance:** a personal spending-money concept.
- **`weekly[4]` quarter arrays + the "15th of the month" rule:** legacy storage that forces whole-month and whole-quarter granularity.
- **Display rounding to the quarter dollar:** a UI nicety, not engine logic.
- **Goal count/amount caps:** personal-planning guardrails.
- **Next-fiscal-year flat estimate:** a workaround for a one-year grid; a multi-year date engine removes the need.
- **Single-fiscal-year week grid:** ventures need open-ended timelines.
- **Coach/AI context, notes, alerts:** presentation over the numbers, not finance logic.
