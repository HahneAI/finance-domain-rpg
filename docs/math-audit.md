# Math Audit — Authority Finance

**Status:** Diagnostic pass complete. Decisions needed (marked ⚡).
**Last updated:** 2026-04-01

---

## TL;DR — What's Actually Broken

| Issue | Severity | Location | Status |
|---|---|---|---|
| "Every 30 days" monthly display is wrong ($560 shows, $600 correct) | HIGH | `BudgetPanel`, `monthlyFromPerPaycheck()` | ⚡ Decision needed |
| Past event can double-count in goal timeline | HIGH | `App.jsx` event memo + `computeGoalTimeline` | ⚡ Decision needed |
| "Next Week" tile shows projected net, not labeled as such | MEDIUM | `HomePanel` | ⚡ Decision needed |
| Monthly income table mixes actual + projected with no visual split | MEDIUM | `IncomePanel` | ⚡ Decision needed |
| 401k/PTO cards sum all 52 weeks — no "YTD actual vs. projected" split | MEDIUM | `BenefitsPanel` | ⚡ Decision needed |
| `PAYCHECKS_PER_MONTH = 4` hardcoded; 5-week months get wrong totals | MEDIUM | `BudgetPanel` | ⚡ Decision needed |

---

## 1. The Projected vs. Actual Split

### What each concept means in the code

| Concept | Source | Time Frame |
|---|---|---|
| **Actual (past week)** | `allWeeks[i]` where `weekEnd < today` + event log adjustments | Confirmed — already happened |
| **Next paycheck (actual, unpaid)** | `prevWeekNet = computeNet(last past week) + event adjustments` | The specific prior fiscal week, not yet deposited |
| **Projected future week** | `futureWeekNets[0]` = `computeNet()` on next calendar week | Speculative — assumes no new events, config unchanged |
| **Year-end forecast** | `projectedAnnualNet` = sum of `computeNet()` across all 52 weeks | All 52 weeks, past actual + future projected combined |
| **Adjusted take-home** | `projectedAnnualNet + eventImpact.totalNetAdjustment` | Year-end net after all logged events (past + future) |

### Where components mix these — specific locations

**HomePanel — "Next Week" tile**
```js
const nextWeekNet = futureWeekNets?.[0] ?? weeklyIncome;
```
- If `futureWeekNets[0]` exists → shows that week's projected net (week-specific)
- If not → falls back to `weeklyIncome` (annual average ÷ 52)
- These are different concepts. No label distinguishes them.
- Subtitle compares projected week against annual average, not against `prevWeekNet` (what user actually got last week).

**BudgetPanel — Goal Timeline**
```js
const incomingWeekNet = futureWeekNets?.[0] ?? prevWeekNet ?? weeklyIncome;
```
- Three possible values with different time-frame meanings used in the same subtraction.

**IncomePanel — Monthly breakdown**
```js
const wks = allWeeks.filter(w => w.active && w.weekEnd.getMonth() === mi);
net: wks.reduce((s, w) => s + gN(w), 0)
```
- In April: past April weeks = actual paid. Remaining April weeks = projected.
- Shown as one number per month row with no visual split.

**BenefitsPanel — 401k cards**
```js
const bE = allWeeks.reduce((s, w) => s + w.k401kEmployee, 0);
```
- Sums all 52 weeks. The card label says nothing about it being a year-end forecast.

### ⚡ Architecture decision needed

Choose a labeling convention and apply it everywhere:

**Option A — Label projected numbers inline**
Add "(projected)" or "est." suffix wherever a number includes future weeks. Minimal code change.

**Option B — Split display: Actual YTD | Year-End Forecast**
Show two numbers for any card that mixes past + future. More info, more UI surface.

**Option C — "Today" line in tables**
Monthly income table gets a divider row between the last completed week and the first projected week. Same data, visually honest.

---

## 2. The "Every 30 Days" Expense Bug

### The formulas

```js
// BudgetPanel — converts user-entered amount to weekly rate
const PAYCHECKS_PER_MONTH = 4;  // ← the problem

const perPaycheckFromCycle = (amount, cycle) => {
  const days = cycleByValue[cycle]?.days ?? 7;  // 30 for "every30days"
  return (amount * 7) / days;
  // $600 every 30 days → (600 × 7) / 30 = $140/week ✓ correct
};

const monthlyFromPerPaycheck = (perPaycheck) => perPaycheck * PAYCHECKS_PER_MONTH;
// $140 × 4 = $560/month ✗ wrong — should be $600
```

### Why it's wrong

| | Calculation | Result |
|---|---|---|
| Correct: weeks per month | 52 ÷ 12 = 4.333 | $140 × 4.333 = **$600/month** ✓ |
| App: | 4 hardcoded | $140 × 4 = **$560/month** ✗ |
| Error | | -$40/month (~6.7%) |

### 5-week months compound the problem

If a calendar month contains 5 pay periods (e.g. Jan 2026), the weekly draw fires 5 times:
- 5 × $140 = **$700 actual spend**
- UI card still shows: **$560/month**
- Gap: **$140** — a full extra weekly draw invisible to the user

### The edit form is fine

When you re-open an expense to edit it, the recovery formula is correct:
```js
const cycleAmountFromPerPaycheck = (perPaycheck, cycle) => {
  return (perPaycheck * days) / 7;  // (140 × 30) / 7 = $600 ✓
};
```
Only the monthly display summary is wrong.

### ⚡ Decision needed: what should "monthly total" mean?

**Option A — Calendar month (exact)**
Count how many times the expense actually fires in each calendar month. Requires iterating weeks by month. The honest number but changes month to month.

**Option B — Average month (52/12)**
```js
const monthlyFromPerPaycheck = (perPaycheck) => perPaycheck * (52 / 12);
// $140 × 4.333 = $606.67 ≈ $607
```
Stable number, close to correct. Off by <$7 on exact 30-day cycles.

**Option C — Keep cycle math pure**
For "every 30 days": monthly = `cycleAmount × (30.4375 / 30)` = $600 × 1.0146 ≈ $609.
For weekly: monthly = `perPaycheck × 4.333`.
Each cycle type uses its own exact conversion.

**Recommendation:** Option B for weekly-derived display, Option C if you want per-cycle precision. Option A is the most honest but requires the most work.

---

## 3. Past Event Double-Count in Goal Timeline

### How it happens

```js
// App.jsx — classifies events as future if weekEnd >= today
if (e.weekEnd && e.weekEnd >= today && i.netLost) {
  futureEventDeductionsByWeek[idx] += i.netLost;
}
```

```js
// computeGoalTimeline — removes future-specific events from the smear
const futureDeductionTotal = Object.values(futureEventDeductions).reduce((a, b) => a + b, 0);
const perWeekLost = (logNetLost - futureDeductionTotal) / n;
```

If an event's `weekEnd` is in the past but the event was just entered today, it gets put into `futureEventDeductionsByWeek` (week is past, but `today` check passes if same day). Then it's also counted in `logNetLost`. It gets subtracted twice: once as a specific-week hit and once spread across all remaining weeks.

### ⚡ Decision needed

The fix is: only add to `futureEventDeductionsByWeek` if `weekEnd > today` (strictly greater), not `>=`. One character fix — but confirm first that same-day events should be treated as past, not future.

---

## 4. All Core Formulas

### Gross pay (`buildYear`, `finance.js`)

```js
grossPay = regularHours  * (baseRate + nightDiff)
         + regWeekendH   * diffRate
         + overtimeHours * (baseRate + nightDiff) * otMultiplier
         + otWeekendH    * diffRate * otMultiplier
```

- `regularHours` = min(totalHours, otThreshold) [≤40]
- `regWeekendH` = weekend hours that don't push past OT threshold
- `overtimeHours` = max(totalHours − otThreshold, 0)
- `otWeekendH` = weekend hours that DO push past threshold
- Night diff stacks into the 1.5× OT multiplier (not a separate stack)

**DHL 6-day example (12h shifts, $19.65 + $1.50 night diff):**
- 72h total → 32h OT, 30h weekend (all OT)
- Regular: 40 × $21.15 = $846
- OT non-weekend: 2h × $21.15 × 1.5 = $63.45
- OT weekend: 30h × $19.65 × 1.5 = ~$884.25 (uses baseRate, not diffRate, for OT)
- Total: ~$1,793.70 (before deductions)

### Taxable gross (`buildYear`)

```js
taxableGross = max(grossPay − weeklyBenefitDeductions − k401kEmployee, 0)
```

Pre-tax deductions: health, dental, vision, LTD, STD, life, HSA, FSA, 401k.

### Weekly net (`computeNet`)

```js
fica = grossPay × 0.0765
fed  = taxableGross × (isHighWeek ? fedRateHigh : fedRateLow) + (showExtra ? extraPerCheck : 0)
st   = taxableGross × (isHighWeek ? stateRateHigh : stateRateLow)
net  = grossPay − fed − st − fica − weeklyBenefitDeductions − k401kEmployee
```

Two-track tax system:
- **Per-check**: flat withholding rates × taxable gross (drives the weekly display numbers)
- **Year-end**: `fedTax(AGI)` via brackets after standard deduction (drives the reconciliation/true-up numbers)

Both are used — they're not the same calculation. The per-check flat rates are set by the user in setup to approximate the real withholding.

### Federal tax brackets (`fedTax`, 2025/2026)

```
$0–$11,925:        10%
$11,925–$48,475:   12%
$48,475–$103,350:  22%
$103,350+:         24%
```

Applied to AGI after standard deduction. Used only for year-end reconciliation display.

### 401k employer match — DHL

```js
tier1 = min(k401Rate, 0.04)            // 100% match up to 4%
tier2 = min(max(k401Rate − 0.04, 0), 0.02) × 0.5  // 50% match on 4%–6%
employerRate = tier1 + tier2           // max 5% total
```

| Employee | Employer |
|---|---|
| 4% | 4.0% |
| 5% | 4.5% |
| 6% | 5.0% (cap) |
| 10% | 5.0% (cap) |

### Loan weekly amount

```js
if (freq === "monthly")  weeklyAmount = paymentAmount × 12 / 52   // $500/mo → $115.38/wk
if (freq === "biweekly") weeklyAmount = paymentAmount / 2
if (freq === "weekly")   weeklyAmount = paymentAmount
```

Loan payoff uses `30.4375` days/month. Expenses use `30` days for "every 30 days." **Inconsistent.**

### Event net impact

```js
effectiveTaxRate = ficaRate + (isTaxedWeek ? withholdingRate : 0)
netLost = grossLost × (1 − effectiveTaxRate)
```

If the affected week is not in `taxedWeeks`, only FICA (7.65%) applies. No income tax hit.

### Goal timeline surplus per week

```js
perWeekLost = (logNetLost − futureEventDeductionTotal) / remainingWeeks
surplus = futureWeekNet − futureEventDeductions[week] − weeklySpend − perWeekLost + perWeekGain
```

Past losses are smeared evenly. Future-specific events hit their exact week.

---

## 5. Rounding Inventory

| Location | Method | Note |
|---|---|---|
| All display values | `.toLocaleString()` via `f()` / `f2()` | 0 or 2 decimal places |
| `perPaycheckFromCycle()` | Float division, no rounding | $140.00 exact for 30-day |
| `monthlyFromPerPaycheck()` | Float multiply, no rounding | $560.00 (wrong base) |
| Loan weekly | Float division | `$115.384...` displayed via `f()` |
| `computeGoalTimeline` surplus | Float arithmetic | Accumulates small errors over many weeks |
| HomePanel `annualSavings` | `weeklyLeft × 52` | No rounding — tiny float tails |
| HomePanel sparkline | `Math.round()` | Only place with explicit integer rounding |

No `Math.floor` / `Math.ceil` anywhere in financial calculations. Consistent use of `f()` for display. No silent truncation found.

---

## 6. Open Architecture Decisions

| # | Question | Options |
|---|---|---|
| 1 | What does "monthly total" mean for expenses? | Calendar-exact / 52÷12 average / per-cycle exact |
| 2 | Should "Next Week" tile show projected or actual last paycheck? | Projected (current) / Actual prev paycheck / Both with label |
| 3 | Should monthly income table split past/future? | Divider row / Two separate sections / Single projection label |
| 4 | Should 401k cards show YTD actual separately from year-end forecast? | Yes (two numbers) / No (one number with "projected" label) |
| 5 | Past-event double-count fix: `>= today` → `> today`? | Yes — confirm same-day events should be treated as past |
| 6 | Align loan days (30.4375) with expense days (30)? | Pick one and apply everywhere |
