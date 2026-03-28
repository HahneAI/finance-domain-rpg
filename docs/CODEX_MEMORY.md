# Codex Memory

## 2026-03-28 — Benefits/Deductions math wiring audit (first entry)
- Reviewed `buildYear()` and `computeNet()` to map how wizard deduction fields flow into taxable gross and take-home pay.
- Current pre-tax deduction pool in `buildYear()` only includes `cfg.ltd` and `k401kEmployee`; insurance premiums (`healthPremium`, `dentalPremium`, `visionPremium`, `stdWeekly`, `lifePremium`) and account contributions (`hsaWeekly`, `fsaWeekly`) are collected in config but not applied.
- `benefitsStartDate` is captured in wizard/profile, but no date gate currently controls benefit/HSA/FSA deduction activation in `buildYear()`.
- `otherDeductions` are collected as repeatable weekly rows, but `computeNet()` currently subtracts only `cfg.ltd + w.k401kEmployee`, so freeform entries do not affect net pay.
- Because `taxableGross` feeds federal/state withholding and annual taxable rollups, these omissions currently overstate taxable income and take-home projections relative to configured benefits.
