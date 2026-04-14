# Math Pipeline — Authority Finance
<!-- Trace every number from raw config through each UI panel. Fill blanks with live values. -->

---

## Live Account Data Source

**File:** [`docs/account-reference.json`](account-reference.json)  
**Account:** Anthony — primary DHL B-team, custom schedule  
**Last updated:** 2026-04-13

This file is the single source of truth for filling in every `___` blank below. It has three tiers:

| Tier | Key | Use for |
|------|-----|---------|
| `db_record` | Raw Supabase row | Stage 0 config inputs, expense list, goals, logs, week_confirmations |
| `computed_expectations` | What finance.js should produce | Expected values in Stages 1–3 (fill these in after running the engine) |
| `ui_assertions` | What each panel should display | Expected values in Stages 4–8 (fill these in after QA) |

**Workflow:** Pull the live row from Supabase → paste into `db_record` → run the app or unit tests → fill `computed_expectations` → compare against live UI → fill `ui_assertions`. Never fabricate values; derive them.

---

## Stage 0 — Setup Wizard (config inputs)

All downstream math is deterministic from these fields. Source of truth: `src/constants/config.js → DEFAULT_CONFIG`.

### Pay Structure
| Field | Variable | Current Value |
|-------|----------|---------------|
| Base hourly rate | `config.baseRate` | ___ |
| Shift length (hrs) | `config.shiftHours` | ___ |
| Weekend diff rate ($/hr) | `config.diffRate` | ___ |
| Night diff rate ($/hr) | `config.nightDiffRate` | ___ |
| OT threshold (hrs) | `config.otThreshold` | ___ |
| OT multiplier | `config.otMultiplier` | ___ |
| Night shift active | `config.dhlNightShift` | ___ |
| Employer preset | `config.employerPreset` | ___ |
| DHL custom schedule | `config.dhlCustomSchedule` | ___ |
| Pay schedule | `config.userPaySchedule` | ___ |
| Annual salary (if applicable) | `config.annualSalary` | ___ |
| First active week idx | `config.firstActiveIdx` | ___ |
| Starting week is long | `config.startingWeekIsLong` | ___ |

### Tax Rates
| Field | Variable | Current Value |
|-------|----------|---------------|
| Fed rate — low week | `config.fedRateLow` | ___ |
| Fed rate — high week | `config.fedRateHigh` | ___ |
| State rate — low week | `config.stateRateLow` | ___ |
| State rate — high week | `config.stateRateHigh` | ___ |
| FICA rate | `config.ficaRate` | ___ |
| Federal std deduction | `config.fedStdDeduction` | ___ |
| Target owed at filing | `config.targetOwedAtFiling` | ___ |
| Taxed weeks (count) | `config.taxedWeeks.length` | ___ |
| State | `config.userState` | ___ |
| Rates estimated (not confirmed) | `config.taxRatesEstimated` | ___ |

### Payroll Deductions (per paycheck)
| Field | Variable | Current Value |
|-------|----------|---------------|
| Health premium | `config.healthPremium` | ___ |
| Dental premium | `config.dentalPremium` | ___ |
| Vision premium | `config.visionPremium` | ___ |
| LTD | `config.ltd` | ___ |
| STD | `config.stdWeekly` | ___ |
| Life / AD&D | `config.lifePremium` | ___ |
| HSA | `config.hsaWeekly` | ___ |
| FSA | `config.fsaWeekly` | ___ |
| 401k employee rate | `config.k401Rate` | ___ |
| 401k employer match rate | `config.k401MatchRate` (or DHL tiered) | ___ |
| Other deductions ($/wk total) | `otherPostTaxDeductions(cfg)` | ___ |

### Buffer
| Field | Variable | Current Value |
|-------|----------|---------------|
| Buffer enabled | `config.bufferEnabled` | ___ |
| Buffer amount ($/wk) | `config.paycheckBuffer` | ___ |
| Effective buffer per week | `bufferPerWeek` | ___ |

---

## Stage 1 — buildYear() → per-week row array

**File:** `src/lib/finance.js → buildYear(cfg)`  
**Output:** `allWeeks[]` — 53 week objects (idx 0–52)

### Per-week row shape
```
{
  idx, weekStart, weekEnd,
  rotation,           // "6-Day" | "4-Day" | "Standard"
  isHighWeek,         // true = long/high-hour week (DHL) or false
  totalHours,         // worked hours this week
  regularHours,       // min(totalHours, otThreshold)
  overtimeHours,      // max(totalHours - otThreshold, 0)
  weekendHours,       // diff-eligible hours (Fri midnight→Sat 6a counts as ½)
  grossPay,           // see formula below
  taxableGross,       // grossPay - benefitsDeduction - k401kEmployee
  benefitsDeduction,  // weeklyBenefitDeductions(cfg)
  k401kEmployee,      // grossPay × k401Rate
  k401kEmployer,      // grossPay × effectiveMatchRate (DHL tiered)
  taxedBySchedule,    // idx in config.taxedWeeks set
  active,             // idx >= firstActiveIdx
}
```

### grossPay formula (DHL night shift path)
```
grossPay =
  regularHours        × (baseRate + nightDiffRate)
+ regWkndH           × diffRate
+ overtimeHours      × (baseRate + nightDiffRate) × otMultiplier
+ otWkndH            × diffRate × otMultiplier

where:
  nonWeekendH  = totalHours - weekendHours
  regWkndH     = max(0, min(weekendHours, otThreshold - nonWeekendH))
  otWkndH      = weekendHours - regWkndH
```

### Long week example (fill in live values)
| | Formula | Value |
|-|---------|-------|
| totalHours | ___ shifts × `shiftHours` | ___ |
| weekendHours | Sat (12h) + Sun (12h) + Fri½ (6h) | ___ |
| regularHours | min(___, 40) | ___ |
| overtimeHours | max(___−40, 0) | ___ |
| grossPay | _(formula above)_ | ___ |

### Short week example (fill in live values)
| | Formula | Value |
|-|---------|-------|
| totalHours | ___ shifts × `shiftHours` | ___ |
| weekendHours | Fri½ only (6h) | ___ |
| regularHours | min(___, 40) | ___ |
| overtimeHours | max(___−40, 0) | ___ |
| grossPay | _(formula above)_ | ___ |

---

## Stage 2 — computeNet() → per-week take-home

**File:** `src/lib/finance.js → computeNet(w, cfg, extraPerCheck, showExtra)`

### Formula
```
taxableGross = grossPay - benefitsDeduction - k401kEmployee

if NOT taxedBySchedule (non-taxed week):
  netPay = grossPay - FICA - benefitsDeduction - otherPostTax

if taxedBySchedule:
  fed   = taxableGross × (isHighWeek ? fedRateHigh : fedRateLow)
          + (showExtra ? extraPerCheck : 0)
  state = taxableGross × (isHighWeek ? stateRateHigh : stateRateLow)
  FICA  = grossPay × ficaRate
  netPay = grossPay - fed - state - FICA - benefitsDeduction - otherPostTax
```

### Live values
| | Value |
|-|-------|
| Long week grossPay | ___ |
| Long week netPay | ___ |
| Short week grossPay | ___ |
| Short week netPay | ___ |
| Non-taxed week netPay | ___ |

---

## Stage 3 — App.jsx aggregates (useMemo chain)

**File:** `src/App.jsx`

### projectedAnnualNet
```
projectedAnnualNet = sum of computeNet(w) for all active weeks
```
| | Value |
|-|-------|
| projectedAnnualNet | ___ |

### taxDerived (annual tax gap → extraPerCheck)
```
totalTaxableGross    = sum of taxableGross for active weeks (+ event gross deltas)
fedAGI               = max(totalTaxableGross - fedStdDeduction, 0)
fedLiability         = fedTax(fedAGI)           // progressive brackets
moLiability          = stateTax(totalTaxableGross, stateConfig)
ficaTotal            = sum of grossPay × ficaRate

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
| fedAGI | ___ |
| fedLiability | ___ |
| moLiability | ___ |
| fedGap | ___ |
| moGap | ___ |
| totalGap | ___ |
| extraPerCheck | ___ |

### weeklyIncome (spendable average)
```
weeklyIncome = projectedAnnualNet / 52 - bufferPerWeek
```
| | Value |
|-|-------|
| projectedAnnualNet / 52 | ___ |
| bufferPerWeek | ___ |
| **weeklyIncome** | ___ |

### prevWeekNet (most recent confirmed paycheck)
```
prevWeekNet = computeNet(lastPastWeek) - bufferPerWeek + weekEventAdjustment
```
| | Value |
|-|-------|
| prevWeekNet | ___ |

### futureWeekNets[]
```
futureWeekNets[i] = weekNetLookup[futureWeeks[i].idx].adjustedSpendable
                  = computeNet(week) - bufferPerWeek + weeklyNetAdjustments[idx]
```
| | Value |
|-|-------|
| futureWeekNets[0] (next paycheck) | ___ |
| futureWeekNets[1] | ___ |

### eventImpact (log cascade)
```
Per log entry → calcEventImpact(e, cfg):
  netLost / netGained per event

totalNetAdjustment  = sum of all weeklyNetAdjustments values
adjustedWeeklyDelta = totalNetAdjustment / futureWeekCount
```
| | Value |
|-|-------|
| netLost (YTD) | ___ |
| netGained (YTD) | ___ |
| totalNetAdjustment | ___ |
| adjustedWeeklyDelta | ___ |

### remainingSpend (expense engine)
```
computeRemainingSpend(expenses, futureWeeks):
  for each future week: sum getEffectiveAmount(exp, weekEnd, phaseIdx)
  avgWeeklySpend = total spend / futureWeeks.length
```
| | Value |
|-|-------|
| avgWeeklySpend | ___ |

### fundedGoalSpend
```
getFundedGoalSpend(goals, today)
= sum of target for completed goals funded this fiscal year
```
| | Value |
|-|-------|
| fundedGoalSpend | ___ |

### logTotals.adjustedTakeHome
```
adjustedTakeHome = projectedAnnualNet + totalNetAdjustment - fundedGoalSpend
```
| | Value |
|-|-------|
| adjustedTakeHome | ___ |

---

## Stage 4 — HomePanel display

**File:** `src/components/HomePanel.jsx`

| Card | Formula | Expected | Actual |
|------|---------|----------|--------|
| Left This Week | `(prevWeekNet ?? weeklyIncome) - avgWeeklySpend` | ___ | ___ |
| Net Worth Trend | `(weeklyIncome - avgWeeklySpend) × 52 - fundedGoalSpend` | ___ | ___ |
| Goals | `completedGoals.length / goals.length` | ___ | ___ |
| Budget Health % | `avgWeeklySpend / weeklyIncome × 100` | ___ | ___ |
| Monthly Expenses | `avgWeeklySpend × (52/12)` | ___ | ___ |
| Monthly Take-Home | `adjustedTakeHome / 12` | ___ | ___ |
| Next Week Takehome | `futureWeekNets[0] ?? weeklyIncome` | ___ | ___ |
| Flow Score | `(1 - spendRatio)×55 + surplus_bonus×25 + goals_bonus×20` | ___ | ___ |

---

## Stage 5 — IncomePanel display

**File:** `src/components/IncomePanel.jsx`

| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Long week gross | `buildYear() → grossPay (isHighWeek=true)` | ___ | ___ |
| Short week gross | `buildYear() → grossPay (isHighWeek=false)` | ___ | ___ |
| Long week net | `computeNet(longWeek)` | ___ | ___ |
| Short week net | `computeNet(shortWeek)` | ___ | ___ |
| Projected annual gross | `sum of grossPay for active weeks` | ___ | ___ |
| Projected annual net | `projectedAnnualNet` | ___ | ___ |
| Extra per check | `taxDerived.extraPerCheck` | ___ | ___ |
| Annual tax gap | `taxDerived.totalGap` | ___ | ___ |

---

## Stage 6 — BudgetPanel display

**File:** `src/components/BudgetPanel.jsx`

### Expense totals
| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Total weekly spend (`ts`) | `sum of currentEffective(exp, ap)` | ___ | ___ |
| Monthly spend | `ts × (52/12)` | ___ | ___ |
| Weekly surplus (`wr`) | `weeklyIncome - ts` | ___ | ___ |
| Left this week | `prevWeekNet - avgWeeklySpend` | ___ | ___ |

### Year-End Outlook
| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Weeks remaining | `futureWeeks.length` | ___ | ___ |
| Funded goals (absorbed) | `fundedGoalSpend` | ___ | ___ |
| Adj. projected savings | `wr × weeksLeft - fundedGoalSpend` | ___ | ___ |
| Active goals total | `sum of target for incomplete goals` | ___ | ___ |
| Surplus after all goals | `adj. savings - active goals total` | ___ | ___ |

---

## Stage 7 — LogPanel (event impact)

**File:** `src/components/LogPanel.jsx`

| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Net lost (events) | `eventImpact.netLost` | ___ | ___ |
| Net gained (events) | `eventImpact.netGained` | ___ | ___ |
| 401k lost | `eventImpact.k401kLost` | ___ | ___ |
| 401k match lost | `eventImpact.k401kMatchLost` | ___ | ___ |
| PTO hours deducted | `eventImpact.ptoHoursLost` | ___ | ___ |
| Bucket hours impact | `eventImpact.bucketHours` | ___ | ___ |

---

## Stage 8 — BenefitsPanel display

**File:** `src/components/BenefitsPanel.jsx`

| Row | Formula | Expected | Actual |
|-----|---------|----------|--------|
| Weekly benefit deduction | `weeklyBenefitDeductions(cfg)` | ___ | ___ |
| Annual benefit cost | `weeklyBenefitDeductions × 52` | ___ | ___ |
| 401k employee (annual) | `sum of k401kEmployee across active weeks` | ___ | ___ |
| 401k employer match (annual) | `sum of k401kEmployer across active weeks` | ___ | ___ |
| PTO balance | `config.ptoHoursOverride ?? computed accrual` | ___ | ___ |
| Bucket balance | `config.bucketBalanceOverride ?? computeBucketModel(logs, cfg)` | ___ | ___ |

---

## Cross-Panel Consistency Checks

Run these after any math change to catch regressions.

| Check | Formula | Pass? |
|-------|---------|-------|
| Home Net Worth ≈ Budget surplus/yr | `(weeklyIncome - avgWeeklySpend)×52` vs Home "Net Worth Trend" | ___ |
| Budget monthly TH ≈ Income annual net/12 | `adjustedTakeHome/12` vs `projectedAnnualNet/12` | ___ |
| Budget Health % = spend/income | `avgWeeklySpend / weeklyIncome` vs displayed % | ___ |
| Year-End savings ≈ Home Net Worth (before goals) | `wr×weeksLeft` vs `avgWeeklySurplus×52` within ~5% | ___ |
| Log net impact reflected in adjustedTakeHome | `projectedAnnualNet + totalNetAdjustment - fundedGoalSpend` = `adjustedTakeHome` | ___ |
| extraPerCheck × taxedWeekCount ≈ targetExtraTotal | tolerance < $1 | ___ |

---

## Known Gotchas

- `weeklyIncome` is **spendable average** (annual net ÷ 52 − buffer). Not gross, not a specific paycheck.
- `incomingWeekNet` (next paycheck) is a **single rotation week** — using it for annual projections inflates results on high weeks. Always use `weeklyIncome` for year-scale math.
- Non-taxed weeks (idx NOT in `config.taxedWeeks`) skip fed/state withholding. Their net is higher but does not represent a tax-free week — the gap is accounted for via `extraPerCheck` on taxed weeks.
- `fundedGoalSpend` is subtracted from `adjustedTakeHome` and from `annualSavings`. It represents money already absorbed by completed goals — not future spend.
- `bufferPerWeek` is excluded from all spendable math downstream but does NOT reduce `projectedAnnualNet` (the income panel shows real earned income).
- DHL employer 401k match is **tiered**, not flat: 100% up to 4%, then 50¢/$1 from 4%→6%, capped at 5% match.
