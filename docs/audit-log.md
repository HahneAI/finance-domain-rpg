# Expense Calculation Audit Log

Generated at: 2026-04-03T10:46:44.489Z

## Step 1: traceExpenseCalculationSteps(input)
- **What happens:** Initialize income and expense routing inputs.
- **Values:** `{"baseRate":19.65,"shiftHours":12,"firstActiveIdx":7,"expenseCount":3,"futureWeekCount":16,"extraPerCheck":30,"showExtra":true,"bufferPerWeek":50}`
- **Passed on:** buildYear(cfg)

## Step 2: buildYear
- **What happens:** Build all fiscal weeks and route only active weeks into net-pay calculations.
- **Values:** `{"totalWeeks":53,"activeWeekCount":46,"firstActiveWeekIdx":7,"lastActiveWeekIdx":52}`
- **Passed on:** computeNet(activeWeek)

## Step 3: computeNet + weeklyIncome
- **What happens:** Transform weekly gross/tax data into spendable weekly income.
- **Values:** `{"projectedAnnualNet":51429.64168999996,"averageNetBeforeBuffer":989.0315709615377,"bufferPerWeek":50,"spendableWeeklyIncome":939.0315709615377,"sampledSpendableWeeks":[1061.8624000000002,843.50279,1346.332]}`
- **Passed on:** computeRemainingSpend(expenses, futureWeeks)

## Step 4: getPhaseIndex + getEffectiveAmount
- **What happens:** Route each future week into its quarter and resolve history-aware weekly expense amounts.
- **Values:** `{"auditedFutureWeeks":16,"sampleWeekComparisons":[{"weekIdx":7,"weekEndIso":"2026-02-23","phaseIdx":0,"weekActualTotal":490,"weekSplitTotal":490,"discrepancy":0,"expenseComparisons":[]},{"weekIdx":8,"weekEndIso":"2026-03-02","phaseIdx":0,"weekActualTotal":490,"weekSplitTotal":490,"discrepancy":0,"expenseComparisons":[]},{"weekIdx":9,"weekEndIso":"2026-03-09","phaseIdx":0,"weekActualTotal":490,"weekSplitTotal":490,"discrepancy":0,"expenseComparisons":[]}]}`
- **Passed on:** Quarter rollup + discrepancy checks

## Step 5: quarterly comparison
- **What happens:** Compare aggregated weekly expense outputs against quarterly split totals.
- **Values:** `{"quarterlyDiscrepancies":[{"phaseIdx":0,"weekCount":6,"weeklyActualTotal":2940,"weeklySplitTotal":2940,"discrepancy":0},{"phaseIdx":1,"weekCount":10,"weeklyActualTotal":5250,"weeklySplitTotal":5000,"discrepancy":250},{"phaseIdx":2,"weekCount":0,"weeklyActualTotal":0,"weeklySplitTotal":0,"discrepancy":0},{"phaseIdx":3,"weekCount":0,"weeklyActualTotal":0,"weeklySplitTotal":0,"discrepancy":0}]}`
- **Passed on:** Audit markdown output

## Step 6: BudgetPanel quarter tab routing
- **What happens:** Compare quarter-tab spend (currentEffective with today's date) against representative quarter-date routing and optional observed app values.
- **Values:** `{"uiQuarterlySpendByPhase":[490,525,525,535],"representativeQuarterlySpendByPhase":[490,525,525,535],"uiVsRepresentativeDelta":[0,0,0,0],"observedQuarterlySpendByPhase":[null,757,794,774],"observedVsUiDelta":[-490,232,269,239]}`
- **Passed on:** Audit markdown output
