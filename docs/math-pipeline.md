# Math Pipeline — Authority Finance
<!-- Trace every number from raw config through each UI panel. Fill blanks with live values. -->

---

## Live Account Data Source

**File:** [`docs/account-reference.json`](account-reference.json)  
**Account:** Anthony — primary DHL B-team, custom schedule  
**Last updated:** 2026-04-13  
**Audit run:** 2026-04-14 (scripts/math-audit.mjs + scripts/math-audit-expenses.mjs)

This file is the single source of truth for filling in every blank below. It has three tiers:

| Tier | Key | Use for |
|------|-----|---------|
| `db_record` | Raw Supabase row | Stage 0 config inputs, expense list, goals, logs, week_confirmations |
| `computed_expectations` | What finance.js should produce | Expected values in Stages 1–3 (fill these in after running the engine) |
| `ui_assertions` | What each panel should display | Expected values in Stages 4–8 (fill these in after QA) |

**Workflow:** Pull live row from Supabase → paste into `db_record` → run audit scripts → fill `computed_expectations` → compare against live UI → fill `ui_assertions`. Never fabricate values; derive them.

---

## Stage 0 — Setup Wizard (config inputs)

All downstream math is deterministic from these fields. Source of truth: `src/constants/config.js → DEFAULT_CONFIG`.

### Pay Structure
| Field | Variable | Current Value |
|-------|----------|---------------|
| Base hourly rate | `config.baseRate` | $19.65 |
| Shift length (hrs) | `config.shiftHours` | 12 |
| Weekend diff rate ($/hr) | `config.diffRate` | $1.75 |
| Night diff rate ($/hr) | `config.nightDiffRate` | $1.50 |
| OT threshold (hrs) | `config.otThreshold` | 40 |
| OT multiplier | `config.otMultiplier` | 1.5× |
| Night shift active | `config.dhlNightShift` | true |
| Employer preset | `config.employerPreset` | DHL |
| DHL custom schedule | `config.dhlCustomSchedule` | true |
| Pay schedule | `config.userPaySchedule` | weekly |
| Annual salary (if applicable) | `config.annualSalary` | null |
| First active week idx | `config.firstActiveIdx` | 7 (week ending 2026-02-23) |
| Starting week is long | `config.startingWeekIsLong` | false → idx 7 = 4-Day |

### Tax Rates
| Field | Variable | Current Value |
|-------|----------|---------------|
| Fed rate — low week | `config.fedRateLow` | 7.84% |
| Fed rate — high week | `config.fedRateHigh` | 12.83% |
| State rate — low week | `config.stateRateLow` | 3.38% |
| State rate — high week | `config.stateRateHigh` | 4.00% |
| FICA rate | `config.ficaRate` | 7.65% |
| Federal std deduction | `config.fedStdDeduction` | $15,000 |
| Target owed at filing | `config.targetOwedAtFiling` | $1,000 |
| Taxed weeks (count) | `config.taxedWeeks.length` | 26 weeks |
| State | `config.userState` | MO (progressive brackets, top rate 4.7%) |
| Rates estimated (not confirmed) | `config.taxRatesEstimated` | false (confirmed from paystub) |

### Payroll Deductions (per paycheck)
| Field | Variable | Current Value |
|-------|----------|---------------|
| Health premium | `config.healthPremium` | $0 |
| Dental premium | `config.dentalPremium` | $0 |
| Vision premium | `config.visionPremium` | $0 |
| LTD | `config.ltd` | $2.00 |
| STD | `config.stdWeekly` | $0 (changed from $2 — updated 2026-04-13) |
| Life / AD&D | `config.lifePremium` | $0 |
| HSA | `config.hsaWeekly` | $0 |
| FSA | `config.fsaWeekly` | $0 |
| 401k employee rate | `config.k401Rate` | 6% |
| 401k employer match rate | DHL tiered formula | 5% (100% up to 4%, 50¢/$1 from 4%→6%) |
| Other deductions ($/wk total) | `otherPostTaxDeductions(cfg)` | $0 |

### Freedom Allowance
| Field | Variable | Current Value |
|-------|----------|---------------|
| Freedom Allowance enabled | `config.freedomAllowanceEnabled` | **false** |
| Freedom Allowance amount ($/wk) | `config.freedomAllowance` | $50 (inactive) |
| Effective Freedom Allowance per week | `freedomAllowancePerWeek` | **$0** |

---

## Stage 1 — buildYear() → per-week row array

**File:** `src/lib/finance.js → buildYear(cfg)`  
**Output:** `allWeeks[]` — 53 week objects (idx 0–52)  
**Active weeks:** idx 7–52 = **46 weeks** | 23 long (6-Day) + 23 short (4-Day)  
**Pattern from idx 7:** 4-Day, 6-Day, 4-Day, 6-Day... (startingWeekIsLong=false)

### Per-week row shape
```
{
  idx, weekEnd, weekStart,
  rotation,           // "6-Day" | "4-Day"
  isHighWeek,         // true = 6-Day (long), false = 4-Day (short)
  totalHours,         // worked hours this week
  regularHours,       // min(totalHours, otThreshold)
  overtimeHours,      // max(totalHours - otThreshold, 0)
  weekendHours,       // diff-eligible hours (Fri midnight→Sat 6a = ½ shift)
  grossPay,           // see formula below
  taxableGross,       // grossPay - benefitsDeduction - k401kEmployee
  benefitsDeduction,  // $2.00/wk (LTD only)
  k401kEmployee,      // grossPay × 0.06 (only after 2026-05-15, idx 19+)
  k401kEmployer,      // grossPay × 0.05 (DHL tiered match, idx 19+)
  taxedBySchedule,    // idx in config.taxedWeeks set
  active,             // idx >= 7
}
```

### grossPay formula (DHL night shift, custom schedule)
```
grossPay =
  regularHours        × (baseRate + nightDiffRate)    // base + night diff
+ regWkndH           × diffRate                       // weekend diff (reg hours)
+ overtimeHours      × (baseRate + nightDiffRate) × otMultiplier
+ otWkndH            × diffRate × otMultiplier

where:
  nonWeekendH  = totalHours - weekendHours
  regWkndH     = max(0, min(weekendHours, otThreshold - nonWeekendH))
  otWkndH      = weekendHours - regWkndH
```

### Long week (6-Day: Tue/Wed/Thu/Fri/Sat/Sun)
| | Formula | Value |
|-|---------|-------|
| totalHours | 6 shifts × 12h | **72h** |
| weekendHours | Fri½ (6h) + Sat (12h) + Sun (12h) | **30h** |
| nonWeekendH | 72 − 30 | 42h |
| regularHours | min(72, 40) | **40h** |
| overtimeHours | 72 − 40 | **32h** |
| regWkndH | max(0, min(30, 40−42)) | **0h** (all wknd is OT) |
| otWkndH | 30 − 0 | **30h** |
| grossPay | 40×21.15 + 0 + 32×21.15×1.5 + 30×1.75×1.5 | **$1,939.95** |

### Short week (4-Day: Mon/Wed/Thu/Fri)
| | Formula | Value |
|-|---------|-------|
| totalHours | 4 shifts × 12h | **48h** |
| weekendHours | Fri½ only (6h) | **6h** |
| nonWeekendH | 48 − 6 | 42h |
| regularHours | min(48, 40) | **40h** |
| overtimeHours | 48 − 40 | **8h** |
| regWkndH | max(0, min(6, 40−42)) | **0h** (all wknd is OT) |
| otWkndH | 6 − 0 | **6h** |
| grossPay | 40×21.15 + 0 + 8×21.15×1.5 + 6×1.75×1.5 | **$1,115.55** |

---

## Stage 2 — computeNet() → per-week take-home

**File:** `src/lib/finance.js → computeNet(w, cfg, extraPerCheck, showExtra)`

### Formula
```
taxableGross = grossPay - benefitsDeduction - k401kEmployee

if NOT taxedBySchedule (non-taxed week):
  netPay = grossPay - FICA - benefitsDeduction - k401kEmployee - otherPostTax

if taxedBySchedule:
  fed   = taxableGross × (isHighWeek ? fedRateHigh : fedRateLow)
          + (showExtra ? extraPerCheck : 0)
  state = taxableGross × (isHighWeek ? stateRateHigh : stateRateLow)
  FICA  = grossPay × ficaRate
  netPay = grossPay - fed - state - FICA - benefitsDeduction - k401kEmployee - otherPostTax
```

### All 8 week archetypes (with extraPerCheck = $99.82 applied to taxed weeks)

| Archetype | Wk example | gross | k401 | taxableG | FICA | net |
|-----------|-----------|-------|------|----------|------|-----|
| 4-Day TAXED, no 401k | wk 7, 17 | $1,115.55 | $0 | $1,113.55 | $85.34 | **$803.45** |
| 6-Day TAXED, no 401k | wk 8, 18 | $1,939.95 | $0 | $1,937.95 | $148.41 | **$1,363.57** |
| 4-Day NON-TAXED, no 401k | wk 9–16 | $1,115.55 | $0 | $1,113.55 | $85.34 | **$1,028.21** |
| 6-Day NON-TAXED, no 401k | wk 10–16 | $1,939.95 | $0 | $1,937.95 | $148.41 | **$1,789.54** |
| 4-Day TAXED, w/ 401k | wk 19–47 odd | $1,115.55 | $66.93 | $1,046.62 | $85.34 | **$744.03** |
| 6-Day TAXED, w/ 401k | wk 20–52 even | $1,939.95 | $116.40 | $1,821.55 | $148.41 | **$1,266.76** |
| 4-Day NON-TAXED, w/ 401k | wk 23–51 odd | $1,115.55 | $66.93 | $1,046.62 | $85.34 | **$961.28** |
| 6-Day NON-TAXED, w/ 401k | wk 24–50 even | $1,939.95 | $116.40 | $1,821.55 | $148.41 | **$1,673.15** |

> **Note on 4-Day TAXED net:** $803.45 = $1,115.55 − (1,113.55×0.0784 + 99.82) − 1,113.55×0.0338 − 85.34 − 2

---

## Stage 3 — App.jsx aggregates (useMemo chain)

**File:** `src/App.jsx`

### projectedAnnualNet
```
projectedAnnualNet = sum of computeNet(w, extraPerCheck, showExtra=true) for all active weeks
```
| | Value |
|-|-------|
| projectedAnnualNet | **$53,341.19** |
| projectedAnnualGross | **$70,276.50** |

### taxDerived (annual tax gap → extraPerCheck)
```
totalTaxableGross    = sum of taxableGross for active weeks (+ event gross deltas)
fedAGI               = max(totalTaxableGross - fedStdDeduction, 0)
fedLiability         = fedTax(fedAGI)           // progressive brackets
moLiability          = stateTax(totalTaxableGross, MO_BRACKETS)

fedWithheldBase      = sum of taxableGross × fedRate for taxedBySchedule weeks
moWithheldBase       = sum of taxableGross × stateRate for taxedBySchedule weeks

fedGap               = fedLiability - fedWithheldBase
moGap                = moLiability  - moWithheldBase
totalGap             = fedGap + moGap
targetExtraTotal     = max(totalGap - targetOwedAtFiling, 0)
extraPerCheck        = targetExtraTotal / taxedWeekCount
```
| | Value |
|-|-------|
| totalTaxableGross | **$67,067.89** |
| fedAGI | **$52,067.89** |
| fedLiability | **$6,368.94** |
| moLiability | **$2,981.61** |
| fedWithheld (base) | **$4,296.89** |
| moWithheld (base) | **$1,458.41** |
| fedGap | **$2,072.04** |
| moGap | **$1,523.19** |
| totalGap | **$3,595.24** |
| targetExtraTotal | **$2,595.24** |
| taxedWeekCount | **26** |
| extraPerCheck | **$99.82** |

> **Interpretation:** Without extra withholding, Anthony would owe ~$3,595 at filing (wants to owe $1,000). The extra $2,595 is spread across 26 taxed paychecks as $99.82/check additional withholding.

### weeklyIncome (spendable average)
```
weeklyIncome = projectedAnnualNet / 52 - freedomAllowancePerWeek
             = 53341.19 / 52 - 0
```
| | Value |
|-|-------|
| projectedAnnualNet / 52 | **$1,025.79** |
| freedomAllowancePerWeek | **$0** (freedomAllowanceEnabled=false) |
| **weeklyIncome** | **$1,025.79** |

### prevWeekNet (most recent confirmed paycheck)
> As of 2026-04-14, most recent past week = idx 14 (weekEnd 2026-04-13, 6-Day, non-taxed, no 401k)
```
prevWeekNet = computeNet(w14) - freedomAllowancePerWeek + weekEventAdjustment
```
| | Value |
|-|-------|
| prevWeekNet (wk14, 6-Day non-taxed) | **$1,789.54** |
| Event adjustment wk14 (missed Fri) | logged but net impact depends on calcEventImpact |

### futureWeekNets[]
| | Value |
|-|-------|
| futureWeekNets[0] — wk15 (4-Day, non-taxed, no 401k) | **$1,028.21** |
| futureWeekNets[1] — wk16 (6-Day, non-taxed, no 401k) | **$1,789.54** |

### eventImpact (log cascade)
> 3 log entries: wk10 (3 shifts missed), wk11 (1 shift missed), wk14 (1 shift missed)  
> Exact net impact requires `calcEventImpact()` — pending computation

| | Value |
|-|-------|
| netLost (YTD) | _pending calcEventImpact_ |
| netGained (YTD) | $0 |
| totalNetAdjustment | _pending_ |
| adjustedWeeklyDelta | _pending_ |

### remainingSpend (expense engine)
```
computeRemainingSpend(expenses, futureWeeks):
  future weeks = idx 15–52 = 38 weeks (weekEnd > 2026-04-14)
  avgWeeklySpend = totalRemainingSpend / 38
```
| | Value |
|-|-------|
| futureWeeks count | **38** (idx 15–52) |
| totalRemainingSpend | **$35,892.00** |
| avgWeeklySpend | **$944.53** |
| Phase 1 avg/wk (11 wks, Apr–Jun) | **$970.50** |
| Phase 2 avg/wk (13 wks, Jul–Sep) | **$970.50** |
| Phase 3 avg/wk (14 wks, Oct–Dec) | **$900.00** (Labtop/Airpods loans end Sep 30) |

> **Phase 3 drop:** Labtop ($33/wk) and Airpods ($17.50/wk) both end 2026-09-30, saving $50.50/wk.

### fundedGoalSpend
```
completedGoals = [Laywer + Fines ($500), Chevy Car Insurance ($250)]
fundedGoalSpend = $500 + $250 = $750
```
| | Value |
|-|-------|
| fundedGoalSpend | **$750** |

### logTotals.adjustedTakeHome
```
adjustedTakeHome = projectedAnnualNet + totalNetAdjustment - fundedGoalSpend
                 = 53341.19 + (event adj) - 750
```
| | Value |
|-|-------|
| adjustedTakeHome (excl. event adj) | **$52,591.19** |

---

## Stage 4 — HomePanel display

**File:** `src/components/HomePanel.jsx`

| Card | Formula | Expected | Actual |
|------|---------|----------|--------|
| Left This Week | `(prevWeekNet ?? weeklyIncome) - avgWeeklySpend` | $1,789.54 − $970.50 = **$819.04** | ___ |
| Net Worth Trend | `(weeklyIncome - avgWeeklySpend) × 52 - fundedGoalSpend` | (1025.79 − 944.53)×52 − 750 = **$3,475.71** | ___ |
| Goals | `completedGoals.length / goals.length` | 2/4 = **50%** | ___ |
| Budget Health % | `avgWeeklySpend / weeklyIncome × 100` | 944.53 / 1025.79 = **92.1%** | ___ |
| Monthly Expenses | `avgWeeklySpend × (52/12)` | **$4,092.95** | ___ |
| Monthly Take-Home | `adjustedTakeHome / 12` | 52,591.19 / 12 = **$4,382.60** | ___ |
| Next Week Take-Home | `futureWeekNets[0] ?? weeklyIncome` | **$1,028.21** (wk15, 4-Day non-taxed) | ___ |
| Flow Score | `(1 - spendRatio)×55 + surplus_bonus×25 + goals_bonus×20` | spendRatio=0.921, needs full formula | ___ |

---

## Stage 5 — IncomePanel display

**File:** `src/components/IncomePanel.jsx`

| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Long week gross | `buildYear() → grossPay (isHighWeek=true)` | **$1,939.95** | ___ |
| Short week gross | `buildYear() → grossPay (isHighWeek=false)` | **$1,115.55** | ___ |
| Long week net (taxed, w/ 401k) | `computeNet(longWeek, extraPerCheck)` | **$1,266.76** | ___ |
| Short week net (taxed, w/ 401k) | `computeNet(shortWeek, extraPerCheck)` | **$744.03** | ___ |
| Long week net (non-taxed, w/ 401k) | `computeNet(longWeek, 0, false)` | **$1,673.15** | ___ |
| Short week net (non-taxed, w/ 401k) | `computeNet(shortWeek, 0, false)` | **$961.28** | ___ |
| Projected annual gross | `sum of grossPay for active weeks` | **$70,276.50** | ___ |
| Projected annual net | `projectedAnnualNet` | **$53,341.19** | ___ |
| Extra per check | `taxDerived.extraPerCheck` | **$99.82** | ___ |
| Annual tax gap | `taxDerived.totalGap` | **$3,595.24** | ___ |

---

## Stage 6 — BudgetPanel display

**File:** `src/components/BudgetPanel.jsx`

### Current phase expense breakdown (Phase 1, wk15 representative date 2026-04-20)

| Expense | Category | $/wk |
|---------|----------|------|
| Kids / Angel | Needs | $525.00 |
| Food | Needs | $75.00 |
| Jesse (Loan + Phone) | Needs | $50.00 |
| Gas | Needs | $50.00 |
| Car Payment | Needs | $50.00 |
| Housing | Needs | $50.00 |
| Labtop | Loans | $33.00 |
| Car Insurance | Needs | $32.50 |
| Nicotine | Lifestyle | $25.00 |
| Fireflood | Lifestyle | $18.25 |
| Airpods | Loans | $17.50 |
| Phone Service | Needs | $12.50 |
| TRW | Lifestyle | $12.50 |
| Claude | Lifestyle | $5.00 |
| GPT | Lifestyle | $5.00 |
| Disney+ Bundle | Lifestyle | $5.00 |
| iPhone 17 | Loans | $3.00 |
| Walmart+ | Lifestyle | $1.25 |
| **TOTAL** | | **$970.50** |

### Expense totals
| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Total weekly spend (phase 1) | `sum of currentEffective(exp, phase1)` | **$970.50** | ___ |
| Monthly spend | `avgWeeklySpend × (52/12)` | **$4,092.95** | ___ |
| Weekly surplus | `weeklyIncome − avgWeeklySpend` | **$81.26** | ___ |
| Left this week | `prevWeekNet − avgWeeklySpend` | $1,789.54 − $970.50 = **$819.04** | ___ |

### Year-End Outlook
| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Weeks remaining | `futureWeeks.length` | **38** | ___ |
| Funded goals (absorbed) | `fundedGoalSpend` | **$750** | ___ |
| Adj. projected savings | `surplus × weeksLeft − fundedGoalSpend` | 81.26×38 − 750 = **$2,338.02** | ___ |
| Active goals total | `sum of target for incomplete goals` | $2,500 + $3,000 = **$5,500** | ___ |
| Surplus after all goals | `adj. savings − active goals total` | 2,338.02 − 5,500 = **−$3,161.98** | ___ |

> **Budget insight:** Anthony is $3,162 short of covering both active goals with remaining surplus alone. Goals will require 401k contribution or income events to close.

---

## Stage 7 — LogPanel (event impact)

**File:** `src/components/LogPanel.jsx`

Log entries (3 total):
1. Wk10: 3 shifts missed unpaid (Tue/Wed/Thu), worked Fri/Sat/Sun
2. Wk11: 1 shift missed unapproved (Wed, foot injury), 12h lost
3. Wk14: 1 shift missed unpaid (Fri, car registration), 12h lost

| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Net lost (events) | `eventImpact.netLost` | _pending calcEventImpact_ | ___ |
| Net gained (events) | `eventImpact.netGained` | $0 | ___ |
| 401k lost | `eventImpact.k401kLost` | _pending_ | ___ |
| 401k match lost | `eventImpact.k401kMatchLost` | _pending_ | ___ |
| PTO hours deducted | `eventImpact.ptoHoursLost` | _pending_ | ___ |
| Bucket hours impact | `eventImpact.bucketHours` | _pending_ | ___ |

---

## Stage 8 — BenefitsPanel display

**File:** `src/components/BenefitsPanel.jsx`

| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Weekly benefit deduction | `weeklyBenefitDeductions(cfg)` | **$2.00** (LTD only) | ___ |
| Annual benefit cost | `weeklyBenefitDeductions × 52` | **$104.00** | ___ |
| 401k employee (annual) | `sum of k401kEmployee across active weeks` | **$3,116.61** (34 wks × avg) | ___ |
| 401k employer match (annual) | `sum of k401kEmployer across active weeks` | **$2,597.17** | ___ |
| 401k year-end balance | `employee + employer` | **$5,713.78** | ___ |
| 401k start date | `config.k401StartDate` | **2026-05-15** (idx 19, wkEnd 2026-05-18) | ___ |
| DHL employer match rate (at 6% contrib) | tiered formula | **5.0%** | ___ |
| PTO balance | `config.ptoHoursOverride ?? computed accrual` | _pending PTO model_ | ___ |
| Bucket balance | `config.bucketBalanceOverride ?? computeBucketModel(logs, cfg)` | _pending bucket model_ | ___ |

---

## Cross-Panel Consistency Checks

Run these after any math change to catch regressions.

| Check | Formula | Expected | Pass? |
|-------|---------|----------|-------|
| Home Net Worth ≈ Budget surplus/yr | `(weeklyIncome − avgWeeklySpend)×52` vs Home "Net Worth Trend" | $3,475.71 ✓ | ___ |
| Budget monthly TH ≈ Income annual net/12 | `adjustedTakeHome/12` vs `projectedAnnualNet/12` | $4,382.60 vs $1,025.79×12=$12,309... wait — adjustedTakeHome/12 uses annual figure ✓ | ___ |
| Budget Health % = spend/income | `avgWeeklySpend / weeklyIncome` vs displayed % | 92.1% ✓ | ___ |
| Year-End savings ≈ Home Net Worth (before goals) | `surplus×weeksLeft` vs `surplus×52` within ~5% | $3,088 vs $4,226 — ~37% diff (expected: 38 remaining wks ≠ 52) | N/A |
| Log net impact reflected in adjustedTakeHome | `projectedAnnualNet + totalNetAdjustment − fundedGoalSpend` | $53,341.19 + adj − $750 | ___ |
| extraPerCheck × taxedWeekCount ≈ targetExtraTotal | $99.82 × 26 = $2,595.32 vs $2,595.24 | $0.08 rounding ✓ | pass |

---

## Known Gotchas

- `weeklyIncome` is **spendable average** (annual net ÷ 52 − Freedom Allowance). Not gross, not a specific paycheck.
- `incomingWeekNet` (next paycheck) is a **single rotation week** — using it for annual projections inflates results on high weeks. Always use `weeklyIncome` for year-scale math.
- Non-taxed weeks (idx NOT in `config.taxedWeeks`) skip fed/state withholding. Their net is higher but does not represent a tax-free week — the gap is accounted for via `extraPerCheck` on taxed weeks.
- `fundedGoalSpend` is subtracted from `adjustedTakeHome` and from `annualSavings`. It represents money already absorbed by completed goals — not future spend.
- `freedomAllowancePerWeek` is **$0** for Anthony (freedomAllowanceEnabled=false). The $50 freedomAllowance field is inactive.
- DHL employer 401k match is **tiered**, not flat: 100% up to 4%, then 50¢/$1 from 4%→6%, capped at 5% match.
- **401k starts idx 19** (weekEnd 2026-05-18, first week ≥ 2026-05-15 start date). Weeks 7–18 have zero 401k deduction — those 12 weeks have higher net pay.
- **Labtop + Airpods loans end 2026-09-30** — Phase 3 weekly spend drops by $50.50/wk ($33 + $17.50).
- All weekend hours are OT for Anthony's schedule: nonWeekendH = 42 always exceeds otThreshold = 40, so regWkndH = 0.
