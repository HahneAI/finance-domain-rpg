# DHL Sprint Bug Tracker — 2026-04-02

## FIXED ✅

**BUG-1: `k401StartSource` undefined in BenefitsPanel → runtime crash**
Added `const k401StartSource = ...` definition at BenefitsPanel.jsx line 44 (after `raw401StartIso`).

**BUG-2/3: Day-index convention mismatch — wrong weekend diff for standard DHL users**
finance.js lines 85-94. `dhlWeekendHoursPerDayIndex` used 0=Mon convention; all preset data uses JS Date 0=Sun. Fixed the function to 0=Sun (5=Fri½, 6=Sat, 0=Sun). Also corrected `CUSTOM_LONG_DAY_INDEXES` ([1,2,3,4,5,6] → [2,3,4,5,6,0]) and `CUSTOM_SHORT_DAY_INDEXES` ([0,2,3,4] → [1,3,4,5]) to match. `WEEKEND_INDEX_ORDER = [5,6,0]` was already correct in JS Date convention.
Pay math impact: short week was inflated +$23, long week deflated -$28. Both weeks still hit ≥$800/≥$950 targets after fix.

---

## CONFIRMED WORKING (Codex got right)
- Rotation labels: "Short Week"/"Long Week" via `rotation.js`, admin sees raw code in parentheses ✅
- 401k start date fallback to `benefitsStartDate` in `buildYear` + `calcEventImpact` ✅
- 4-shift short / 5-shift long in `buildYear` via `getDhlPlannedPattern` ✅
- "401K" pill label (was "K401") ✅
- `isAdmin` prop threaded to all panels ✅
- SetupWizard writes `k401StartDate` and `benefitsStartDate` as separate fields ✅

---

## MODERATE — open

**BUG-4: No `projectedGross` regression test for standard DHL config**
`src/test/lib/finance.test.js` — `DHL_STANDARD_CONFIG` exists but is never tested against `projectedGross`. Should add short/long week assertions matching `buildYear` grossPay output to lock in the corrected math.

---

## UNCERTAIN — needs investigation

**U-1: Root cause of $613 gross on new standard DHL test account**
BUG-2 only caused a ~$23/$28 delta, not a $613 result. Most likely cause: wizard initialized account with null `dhlTeam` or false `startingWeekIsLong`, causing the code path to fall through to the custom schedule arrays with wrong hours. Needs a traced run through wizard output config on a fresh account.

**U-2: `calcEventImpact` doesn't gate 401k on enrollment date**
Events logged before 401k enrollment may overstate 401k loss in impact calculations. Lower priority — investigate when users start logging pre-enrollment events.
