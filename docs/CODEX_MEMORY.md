# Codex Memory

## 2026-03-28 — Benefits/Deductions math wiring audit (first entry)
- Reviewed `buildYear()` and `computeNet()` to map how wizard deduction fields flow into taxable gross and take-home pay.
- Current pre-tax deduction pool in `buildYear()` only includes `cfg.ltd` and `k401kEmployee`; insurance premiums (`healthPremium`, `dentalPremium`, `visionPremium`, `stdWeekly`, `lifePremium`) and account contributions (`hsaWeekly`, `fsaWeekly`) are collected in config but not applied.
- `benefitsStartDate` is captured in wizard/profile, but no date gate currently controls benefit/HSA/FSA deduction activation in `buildYear()`.
- `otherDeductions` are collected as repeatable weekly rows, but `computeNet()` currently subtracts only `cfg.ltd + w.k401kEmployee`, so freeform entries do not affect net pay.
- Because `taxableGross` feeds federal/state withholding and annual taxable rollups, these omissions currently overstate taxable income and take-home projections relative to configured benefits.

## 2026-03-28 — Goals timeline surplus/feed audit
- Reviewed the goals forecast path end-to-end: `App.jsx` builds `futureWeekNets` from per-week `computeNet()` output (minus optional paycheck buffer), then `BudgetPanel` passes those nets into `computeGoalTimeline()`.
- Current timeline sequencing is driven by **per-check surplus**, not a flat weekly number: each loop week uses `(weeklyNets[weekOffset] - targetedFutureEventDeduction - effectiveNonTransferSpend - smearedPastLoss + smearedGain)` before funding goals in list order.
- Past log losses are intentionally smeared across remaining weeks, while current/future-week losses are applied to their exact `week.idx` via `futureEventDeductions`; this is the key split that controls where dips appear in the goal bar.
- `wN` fallback for unfunded goals still uses an average-net approximation (`remaining / avgNet`) when no completion week is found, so partial-year visual extrapolation can diverge from true week-by-week surplus under volatile checks.
- Current goal bar rendering in `BudgetPanel` is week-index based (`Wk {nowIdx}…Wk 52` with `% width = sW/wN over weeksLeft`), so the TODO “monthly notated bar with 4-week sub-divisions” will require a presentation-layer scale remap without breaking the existing weekly surplus engine.
