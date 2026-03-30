# Authority OS — Active Systems Reference

Living doc. Describes what is built, how it works, and known issues.
**Guardrail: keep under 300 lines. Summarize; do not transcribe.**
Last updated: 2026-03-30 | App: Authority Finance (A:Fin)

---

## System Index

| # | System | Files | Status |
|---|--------|-------|--------|
| 1 | Expense Drag-and-Drop Reorder | `BudgetPanel.jsx` | Live — open issue |
| 2 | Expense Inline Editor + Pay Cycle Math | `BudgetPanel.jsx` | Live |
| 3 | Goals Timeline — Monthly/Weekly Grid | `BudgetPanel.jsx`, `finance.js` | Live |
| 4 | Rolling Active Views + Progressive Scaling | `rollingTimeline.js`, `IncomePanel.jsx`, `BudgetPanel.jsx` | Live |
| 5 | Adjusted Take-Home / Tax Payback Pipeline | `App.jsx`, `IncomePanel.jsx` | Live |
| 6 | Expense Pay Period vs Monthly Display | `BudgetPanel.jsx` | Resolved (by design) |
| 7 | Year Summary — Adjusted Net + Event Loss | `IncomePanel.jsx`, `App.jsx` | Live |
| 8 | Log Tab — Hero + Log Effect Summary | `LogPanel.jsx` | Live |

---

## 1. Expense Drag-and-Drop Reorder

Supports both mouse drag and touch (450ms hold-to-drag) within the Expenses tab.

**Mouse drag:** `onExpenseDragStart` → `EXPENSE_DRAG_PREVIEW_TINT` fades card toward destination category color on hover → `reorderExpenseByInsert()` splices dragged card into the correct insert-index position and updates `category` if cross-lane. Preview resets on drop/leave/cancel.

**Touch drag:** Ghost overlay follows finger. Edge proximity triggers `runTouchAutoScroll` (rAF loop, max 18px/frame). Drop resolves via `expenseTouchInsertRef` position. Exit fade on 130ms timer.

**Reorder logic:** `reorderExpenseByInsert(draggedId, lane, insertIndex)` — walks `regularExpenses` to find the correct splice point, mutates category to `targetLane`, preserves loan ordering separately.

**Categories:** Needs / Lifestyle (cross-lane drag supported). Goals tab uses `GOAL_LANES` colors for inline labels only — not split containers.

**Open issue:** Task 1 post-commit noted Goals tab was accidentally given Expenses/Lifestyle split containers. Code audit shows Goals renders as a single list with lane badges inline per card — appears resolved, but needs visual QA confirmation.

---

## 2. Expense Inline Editor + Pay Cycle Math

**Cycle options:** weekly (7d), biweekly (14d), every30days, yearly (365d).
`PAYCHECK_CADENCE_DAYS = 7` — one check per fiscal week.

**Core formula:**
```
perPaycheck = amount × 7 / cycleDays
monthly     = perPaycheck × 4   (PAYCHECKS_PER_MONTH, not calendar days)
```

**Effective start date:** new expenses use `TODAY_ISO` as `effectiveFrom`. Edit: if last history entry is ≤3 days old, updates in place; otherwise appends a new history entry. No backfill.

**Phase-aware:** `billingMeta.byPhase[ap]` stores per-phase `{amount, cycle, effectiveFrom}`. `getEffectiveAmount()` resolves the correct history entry for the active phase and date.

**Edit flow:** `startEditExp` reverse-converts stored `perPaycheck → cycle amount` via `cycleAmountFromPerPaycheck` for display in the inline editor.

---

## 3. Goals Timeline — Monthly/Weekly Grid

**Location:** `BudgetPanel.jsx` Goals view, uses `computeGoalTimeline()` from `finance.js`.

**Timeline structure:** Month-labeled track built from `futureWeeks`. Each month renders `MONTH_SUBDIVISIONS = 4` subtle internal blocks. `deriveRollingTimelineMonths()` filters visible months (see System 4).

**Goal bar positioning:** `computeGoalTimeline()` runs week-by-week surplus sequencing — each loop week: `weeklyNets[weekOffset] - futureEventDeductions - effectiveNonTransferSpend - smearedPastLoss + smearedGain`. Goals funded in list order. Start week `sW` and duration `wN` map to month position proportionally, including mid-month stops.

**Known gap:** `wN` fallback for unfunded goals uses `remaining / avgNet` approximation — can diverge from true week-by-week surplus under volatile checks (partial-year extrapolation).

---

## 4. Rolling Active Views + Progressive Scaling

**Library:** `src/lib/rollingTimeline.js` — three pure exports.

**Weekly (IncomePanel):**
`deriveRollingIncomeWeeks(allWeeks, todayIso, 4)` → shows last 4 completed weeks + current week + all remaining weeks through EOY. Older weeks hidden; data preserved in `hiddenWeeks`.

**Monthly (BudgetPanel goals):**
`deriveRollingTimelineMonths(monthSegments, todayIso, 1)` → shows previous month + current month + all remaining months through EOY. Older months in `hiddenMonths`.

**Progressive scaling:**
`progressiveScale(scaleProgress, 0.15)` → `1 + (progress × 0.15)`. Returns 1.00x at year start, 1.15x at EOY. `scaleProgress` = hidden periods / max possible hidden periods. Applied as `weeklyDensityScale` in IncomePanel weekly rows.

**Hidden data** preserved in derived structures for future full-year review tab.

---

## 5. Adjusted Take-Home / Tax Payback Pipeline

**Event impact engine (`App.jsx` `eventImpact` memo):**
Loops all logs → `calcEventImpact(e, config)` per entry → accumulates:
- `netLost` / `netGained` — total net delta
- `missedEventDayNetLost` — absence-type events only (feeds Task 7 modal)
- `weeklyNetAdjustments[idx]` — per-week net delta map
- `grossDeltaByWeek[idx]` — per-week gross delta (feeds tax recalc)
- `futureEventDeductionsByWeek[idx]` — future weeks only (feeds goal surplus)

**Tax payback adjustment:**
`adjustedTaxableGrossByWeek[idx] = taxableGross + grossDeltaByWeek[idx]`
Feeds full federal (`fedTax`) and state (`stateTax`) liability recalculation → recomputes `fedGap`, `moGap` → `extraPerCheck = targetExtraTotal / taxedWeekCount`. Missed days reduce gross → lower projected tax owed.

**Downstream consumers:**
- `adjustedWeeklyAvg = baseWeeklyUnallocated + (totalNetAdjustment / futureWeekCount)`
- `futureWeekNets[]` — per-week spendable net, buffer-excluded, fed to `computeGoalTimeline`
- `logTotals.adjustedTakeHome = projectedAnnualNet + totalNetAdjustment`

---

## 6. Expense Pay Period vs Monthly Display

**Resolved — by design.** Monthly cost = `perPaycheck × 4` (paycheck-based month, not calendar). This is intentional: app runs on weekly fiscal cadence, so 4 checks = 1 "month." Not a math error. `cycleAmountFromPerPaycheck` reverse-converts for editor display. Documented as resolved in task audit.

---

## 7. Year Summary — Adjusted Net + Event Loss

**IncomePanel** receives `adjustedTakeHome` and `missedEventDayNetLost` as props (from `App.jsx` `logTotals`).

**Year Summary card:** Displays `adjustedTakeHome` (not raw projected net) as "Adjusted Net" with `missedEventDayNetLost` as sublabel: `"$X missed-day loss"` shown in red when non-zero.

**Inline breakdown row** (IncomePanel lines 226–230): Shows missed-day loss in red and adjusted take-home in gold as a consolidated callout — replaces the old separate yellow/red adjusted take-home component.

**Source of truth:** `adjustedTakeHome = projectedAnnualNet + eventImpact.totalNetAdjustment`. Card and breakdown row use same prop — no divergence risk.

---

## 8. Log Tab — Hero + Log Effect Summary

**Three hero cards:** net loss (`tot.nL`), PTO loss (`tot.pto` hours), bucket hours lost (`tot.bucket`). Larger week-naming card and bucket hour bar card preserved.

**Log Effect Summary card** (single card, no internal background separation):
- `adjTH = projectedAnnualNet - tot.nL + tot.nG` — adjusted annual take-home
- `adjWA = baseWeeklyUnallocated - (tot.nL / weeksLeft) + (tot.nG / weeksLeft)` — adjusted weekly avg
- `projS = adjWA × weeksLeft` — projected savings
- Displays: adjusted take-home, adjusted weekly avg, projected savings vs total unfunded goals, weeks-to-fund estimate

**Attendance history** section: groups absence-type logs by calendar month, counts unpaid shifts, unapproved days, partial shifts. Day-of-week miss frequency sorted descending. Explanatory text box removed.

---

## Core Architecture

```
SetupWizard → config
    ↓
buildYear() → allWeeks[] (52 weeks, taxableGross, grossPay per week)
    ↓
computeNet(week, config, extraPerCheck) → per-check net
    ↓
projectedAnnualNet → weeklyIncome → baseWeeklyUnallocated
    ↓
eventImpact (logs) → adjustedWeeklyDelta, grossDeltaByWeek
    ↓
taxDerived (adjustedTaxableGross) → extraPerCheck (feeds back into computeNet)
    ↓
futureWeekNets[] → computeGoalTimeline() → goal fund sequences
```

**Key constants:** `FISCAL_YEAR_START`, `PAYCHECK_CADENCE_DAYS = 7`, `PAYCHECKS_PER_MONTH = 4`

**Known gap:** `buildYear()` only applies `ltd` + `k401kEmployee` to pre-tax deductions. Insurance premiums and HSA/FSA contributions collected in config but not subtracted → taxable gross overstated. Tracked in TODO §8.

**Persistence:** localStorage via `src/lib/db.js`. Supabase for multi-user (auth live). No schema changes made by Tasks 1–8.
