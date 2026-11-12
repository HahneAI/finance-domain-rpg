# FVOS Finance Logic Extract (from Authority Finance)

This document is research only. It records the logic from Authority Finance (A:Fin) for a fresh plain-JS rewrite in
FVOS (R6); no code is copied. All numbers are made up, and paths are under `src/lib/` unless stated. A:Fin works on a
**weekly basis**: everything is converted to "$ per week", summed, and scaled back to a per-period figure only for
display.

## 1. Calculation inventory

| Calc | Formula | Path |
|---|---|---|
| Weekly net (payroll) | `gross − fed − state − FICA − benefits − 401k`; `taxable = gross − benefits − 401k` | `finance.js` `computeNet` |
| Spendable weekly income | `annualNet / activeWeeks − allowance/wk`; `activeWeeks = gridWeeks − firstActiveIdx` | `App.jsx`, `fiscalWeek.js` |
| Per-period scale | `factor = 52 / periodsPerYear` | `cashOnHand.js` |
| Tax gap | `extra = max(liability − withheld − targetOwed, 0) / remainingTaxedChecks` (0 if no checks remain) | `App.jsx` `taxDerived` |
| Exact item cost | `amount × cyclesPerYear / 52` (weekly 52, biweekly 26, monthly 12, yearly 1) | `expense.js` `exactWeeklyCost` |
| Display reserve | `roundToQuarter(monthly / 4)` — for display only | `expense.js` `perPaycheckFromCycle` |
| Amount in force | Month override, else the newest history entry with `effectiveFrom ≤ the 15th` of the month | `finance.js` `getEffectiveAmountForMonth` |
| Avg weekly spend | `Σ weeks Σ items exactCost / futureWeeks`; returns 0 when there are no weeks | `finance.js` `computeRemainingSpend` |
| Next due date | `anchor + ceil((today − anchor)/cycle) × cycle`, never a past date | `expense.js` `getNextDueDate` |
| Loan | weekly = `pmt` \| `pmt/2` \| `pmt×12/52`; payments = `ceil(total/pmt)`; reserved until the end of the payoff quarter | `finance.js` `buildLoanHistory` |
| Spend ratio | `income > 0 ? spend/income : 0`; bands <0.5, <0.75, else "watch" | `upkeepHealth.js` |
| "Net worth" (a flow, not a balance) | `(income − spend) × activeWeeks − fundedGoals`; flagged when `< 10%` of income; `null` if income ≤ 0 | `HomePanel.jsx`, `finance.js` `netWorthHealthStatus` |
| Cash on hand | `anchor + paychecks since anchor − Needs bills due since anchor` | `cashOnHand.js` `computeCashOnHand` |
| Cash status | **red** if a bill due before payday can't be covered (or the gap is beyond orange); **green** if `gap = cash − setAside ≥ 0`; **orange** if `−gap ≤ max(200, 20% setAside)` | same |
| Runway | `∞` if burn ≤ 0. With a pending inflow `P` arriving in `d` days, cash runs out at `cash/(burn/7)` if that comes first; otherwise `d + (cash − d·burn/7 + P)/(burn/7)` | `newJobSeasonRunway.js` |
| Goal waterfall | Each week's surplus fills goals in list order; an unfinished goal's weeks = `remaining/(avgSurplus − 0.01)`, or **∞** (stalemate) if avgSurplus ≤ 0 | `finance.js` `computeGoalTimeline` |
| Claim Date | `weekStart + ceil(offset) × 7d`; hidden beyond a rolling 5-year horizon | `claimDate.js` |
| Goal limits | ≤ 6 active goals; total targets ≤ `(income − Needs) × 52/12 × 60`; only a change that grows the plan is blocked | `goalLimits.js` |
| Snapshot export | Copies the figures above; money rounded with `round(n×100)/100`; a missing value is `null`, never 0 | `resourceSnapshot.js` |

**Investor financial models: none exist.** The investor work is a signup flow and demo accounts only.

**Currency and rounding:** USD only. Full precision is stored, and rounding happens only for display or export.

## 2. Entities
- **Recurring item:** label, category (Needs / Lifestyle / Loan), amount + cycle, due anchor, `history[{effectiveFrom, amount}]`, month overrides.
- **Loan:** total, payment, frequency, first date.
- **Goal:** label, target, rank, completed, completedAt.
- **Cash anchor:** amount, asOf date, per-paycheck corrections.
- **Event:** a dated income change.
- **Income plan:** produces derived weeks.

History is point-in-time: an edit appends an entry, and a delete zeroes the item from that date forward, so past
periods never change.

## 3. Personal vs business
- **Keep:** item cost and cycle math, due dates, point-in-time history, loans, runway with pending inflows, the ∞ stalemate rule.
- **Generalize:**
  - spend ratio → `costs/revenue`, *undefined* (not 0) when revenue is 0;
  - savings → net cash flow and margin;
  - cash on hand → anchor + any inflows − outflows;
  - goals → milestones;
  - the snapshot → a per-venture summary.
- **Drop:** payroll gross/net, tax gap, employer match, goal caps.

**Ventures need, and A:Fin lacks:**
- **Revenue lines** per product or channel.
- **Cost per project**, with an allocation rule for shared costs.
- **Burn and runway:**
  - `netBurn = costs − revenue`;
  - `runway = cash / netBurn`, or ∞ when net burn ≤ 0.
- **Unit economics:**
  - `margin = price − variableCost`;
  - `breakEven = fixedCosts / margin`, undefined when margin ≤ 0.
- **R&D with no revenue:** cumulative spend and runway to a funding date.
- **Roll-up across ventures:** consolidated cash ÷ consolidated burn, never an average of each venture's runway.
- **A transaction ledger** of actuals (A:Fin only projects), plus a currency field and period close.

## 4. Worked test cases (expected outputs verified by running A:Fin's functions)
1. $120 every 30 days → exact `27.6923/wk`, display `30`. $260 yearly → exact `5.00`, display `5.50`.
2. Item A 30/wk; item B 10/wk, dropping to 0 effective May 10; weeks ending May 4 and May 11 → total `60` (the 15th rule zeroes B for all of May). A date-range engine gives `70`. Pick one rule.
3. No future weeks → every output `0`.
4. Ratio: 350/500 → `0.70` healthy; exactly 0.75 → "watch"; spend 100 on income 0 → `0` "well-managed". The last is wrong; return undefined instead.
5. Income 500/wk, spend 460/wk, 52 weeks → rate `0.08`, flagged. Income 0 → `null`, not flagged.
6. Nets [100,100,100], goals A=150 then B=100 → A ends ≈ week `1.5`; B starts week `1` and ends ≈ week `2.5`.
7. Nets [50,50], costs 60/wk, goal 100 → no end date, duration `∞`.
8. Loan of 1,200 at 100/month from 2026-01-15 → `23.0769/wk`, payoff `2027-01-15`, reserved until `2027-04-01`.
9. Loan of 1,000 at 300/week → `4` payments; the model reserves 300 for the final payment, though only 100 is owed.
10. Cash 700, burn 350/wk: inflow 300 arriving in 10 days → `20` days; the same inflow in 20 days → `14` days; burn 0 → `∞`.
11. Set-aside 400 (band 200): cash 1,350 → green; 300 → orange; 100 → red; 500 with a 600 bill due before payday → red.
12. Income 500, Needs 300 → cap `52,000`. Adding a goal that lands the total exactly on the cap is allowed; one dollar over → "amount"; a 7th goal → "count".
13. Tax: liability 3,000, withheld 2,200, target owed 300 → `25/check` over 20 checks; `0` when no taxed checks remain.
14. `round2(1.005) = 1.00` because of binary floats. Use integer cents.
15. 100/wk becomes `433.33`, `433` or `400` a month, depending on the screen. Use one conversion.

## 5. Lessons learned (`docs/drift-app-warden.md`)
- **Fake divisor:** clamping a negative surplus to 0.01/wk produced dates 1,000+ years out. The fix returns ∞ as a stalemate state (DW-26).
- **Diluted average:** income was divided by 52 instead of the active weeks (F13/F14).
- **Parallel formulas:** Coach and the panels calculated runway separately and disagreed (F24); monthly conversion still exists three ways.
- **Display rounding leaked into totals:** a $150/yr bill showed as $156/yr. Display rounding now stays out of every total.
- **Wrong anchors and caches:** an "edited at" date was used as the due date, and a stale "entered amount" was used as the current amount. Keep separate fields with one resolver.
- **Grid clamping:** dates past year-end snapped to the last week, and 52 vs 53-week years caused errors (F148). Use date arithmetic and named constants.
- **Double posting:** marking a bill paid while the cash total also deducts it automatically needs a skip flag.
- **Would design differently:** a ledger first, date ranges instead of quarter arrays, integer cents, and *undefined* (not 0) for ratios with no denominator.

## 6. Not worth carrying
- **Employer shift and differential rules:** they belong to one employer.
- **Withholding estimator:** personal tax only.
- **Freedom Allowance:** a personal spending-money concept.
- **`weekly[4]` quarter arrays and the 15th rule:** legacy storage granularity.
- **Quarter-dollar rounding:** a display nicety.
- **Goal caps:** personal guardrails.
- **Next-year flat estimate and the one-year grid:** a workaround that a multi-year timeline removes.
- **Coach notes and alerts:** presentation, not logic.
