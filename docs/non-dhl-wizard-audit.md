# Non-DHL Wizard Audit

Investigation of the non-DHL (standard user) setup wizard path.
Context: DHL has been the primary dev + QA target. The non-DHL path is partially built but under-tested.

---

## Known Bug — Negative Net on Fresh Non-DHL Account

**Symptom:** After completing the non-DHL wizard with reasonable positive-income values and zero
expenses/goals, the home dashboard displayed:
- Next take-home check: **−$50**
- Net worth trend: **going down**

**Account state at time of bug:** no expenses, no goals, no deductions — clean setup.

**Root cause (confirmed via Step 0 audit):** `weeklyIncome` in App.jsx is computed as:
```
weeklyIncome = projectedAnnualNet / 52 - bufferPerWeek
```
`bufferPerWeek = 50` by default (DEFAULT_CONFIG: `bufferEnabled: true`, `paycheckBuffer: 50`).
If `projectedAnnualNet = 0`, `weeklyIncome` is exactly **−$50**. `projectedAnnualNet = 0` occurs
when `allWeeks.filter(w => w.active)` is empty — i.e., no weeks are active. This happens when
`cfg.firstActiveIdx` exceeds the last week index in the fiscal year (max idx ≈ 52). A user who
enters a start date beyond the fiscal year end (e.g. 2027+) gets `firstActiveIdx = 53+` and
zero active weeks. Step 2 only validates that `startDate != null` — it does **not** validate that
the date falls within the current fiscal year.

**Secondary issue also confirmed:** `DEFAULT_CONFIG` seeds DHL-specific values that non-DHL users
never see prompted to change. Several are harmlessly neutralized in calculations by `isDHL` guards,
but `diffRate: 1.75` pre-fills the weekend differential input in Step 1 — a non-DHL user with no
weekend differential must manually clear it to 0 or it persists in their config (though it does not
affect calculations since `weekendHours = 0` for non-DHL in `buildYear`).

**Fix needed (Step 2):** Validate that `startDate` falls within the active fiscal year, or clamp
`firstActiveIdx` to `max(0, min(dateToWeekIdx(date), FISCAL_WEEKS_PER_YEAR - 1))` to prevent the
zero-active-weeks case.

---

## Open Items from Step 0 (non-step-specific)

### PTO — Non-DHL Has No Policy Question
Non-DHL users currently have no PTO question anywhere in the wizard. The BenefitsPanel PTO section
is DHL-only. Add a dedicated PTO subsection to Step 3 (Deductions) for non-DHL users:
- Does your employer offer PTO? (Y/N gate)
- If yes: accrual method (per hour / per pay period / lump sum annually), accrual rate, current
  balance, cap (if any).

`PTO_RATE = 19.65` in `config.js` is a module-level hardcoded constant tied to Anthony's base rate
— it is not derived from the user's `baseRate`. This must become a config field for non-DHL PTO
tracking to work correctly.

### DHL Values Seeded in DEFAULT_CONFIG That Non-DHL Wizard Never Prompts to Change

| Field | DEFAULT value | Neutralized by isDHL guard? | Action needed |
|-------|--------------|-----|------|
| `diffRate` | 1.75 | Harmless (wkndH = 0 for non-DHL) but pre-fills UI | Ask clearly in Step 1; default to 0 for non-DHL gate |
| `nightDiffRate` | 1.50 | Yes — `(isDHL && dhlNightShift)` check | None (never applied) |
| `dhlNightShift` | true | Yes | None (never applied) |
| `bucketStartBalance/Cap/PayoutRate` | DHL values | Yes — `computeBucketModel` gated on employerPreset=DHL | None for now |
| `PTO_RATE` | 19.65 | No — module-level constant | Migrate to config field |
| `taxedWeeks` | Anthony's DHL schedule | Rebuilt at wizard completion | OK |
| `firstActiveIdx` | 7 | N/A — set from startDate in Step 2 | Clamp to fiscal year bounds |

---

## Step-by-Step Audit

---

### Step 0 — Welcome

**Status: Complete**

**UI shown (first-run, `lifeEvent === null`):**
Two paragraphs of static text — "Set up your pay in a few steps" and a note about paystubs for tax
sharpening. No inputs, no fields, no choices. `isValid: () => true` auto-passes.

**UI shown (re-entry, life event):**
Three life event buttons: Lost my job / Changed jobs / Got a commission job. These write to
`lifeEvent` state (not `formData`). No DHL/non-DHL difference here.

**What gets written to formData:** Nothing. Step 0 is purely informational.

**DHL vs non-DHL difference:** None at the UI level. Both see the same welcome screen.

**Issues found:**
1. `formData` is initialized from `{ ...config }` = `DEFAULT_CONFIG` before Step 0 renders.
   This means ALL DHL-seeded values are live in `formData` from the first frame. Values that
   the non-DHL wizard path overwrites later are fine; values it never prompts for persist silently.
   See the table above for the full inventory.
2. The welcome text does not hint at what to have ready (e.g., OT policy, any shift differentials,
   whether PTO applies). A non-DHL user has no idea the wizard will ask about these. DHL users
   similarly have no "have your team assignment handy" cue. Low priority but worth a copy pass.
3. Life events don't include "Got a raise / changed pay rate" — common scenario that currently
   requires re-running the full "Changed jobs" flow. Backlog item, not a blocker.

**Verdict:** Step 0 itself is not broken. The `DEFAULT_CONFIG` initialization that happens before
Step 0 is the source of the bleed-through issues tracked above.

---

### Step 1 — Pay Structure

**Status: Complete**

**UI shown (non-DHL path):**
1. DHL gate — Yes/No pills (required before anything else renders)
2. "How do you get paid?" — Weekly / Biweekly / Monthly / Salary / Commission Only (disabled)
3. Rate fields — salary: Annual Salary input; hourly: Base Rate ($/hr) + Shift Length (hrs)
4. Weekend Differential ($/hr) — shown to ALL users, DHL and non-DHL
5. OT Threshold (non-DHL only) — 40h / 48h / Custom pills
6. OT Multiplier (non-DHL only) — 1.5× / 2× pills

**Fields written to formData (non-DHL path):**
`employerPreset`, `userPaySchedule`, `baseRate`, `shiftHours`, `diffRate`, `otThreshold`,
`otMultiplier`, (salary path) `annualSalary`

**DHL vs non-DHL difference:**
DHL shows team picker, night shift, rotation type; hides OT threshold/multiplier (locked via preset).
Non-DHL shows OT threshold + multiplier; hides all DHL team/rotation fields.
Weekend Differential shows for both.

---

**Issues found:**

**[BUG — FIXED] `userPaySchedule` silently pre-selected as "weekly"**
`DEFAULT_CONFIG.userPaySchedule = "weekly"`. When the non-DHL pay form first renders after clicking
"No", the Weekly pill appears active even though the user never explicitly picked it. `isValid`
checks `!d.userPaySchedule`, which passes immediately because `"weekly"` is truthy. A biweekly or
monthly user who doesn't notice the pre-selection proceeds with weekly — which halves their benefit
deduction scaling in `weeklyBenefitDeductions()` (biweekly factor = 0.5 vs weekly = 1.0). This
affects anyone with deductions set in Step 3.
Fix: `setDHL(false)` now also resets `userPaySchedule: null` so the user must make an explicit pick.

**[BUG — FIXED] `diffRate: 1.75` pre-fills for non-DHL**
`DEFAULT_CONFIG.diffRate = 1.75` (Anthony's DHL weekend rate). The field renders with "1.75" but the
placeholder says "0 = no differential". A non-DHL user without a weekend differential must actively
clear it. The value is harmless in income calculations (`weekendHours = 0` for non-DHL in
`buildYear`), but it pollutes the config and is confusing.
Fix: `setDHL(false)` now also resets `diffRate: 0`.

**[BUG — FIXED] Custom OT threshold field has no validation**
When the user picks "Custom" OT threshold and leaves the input blank, `otThreshold` stays at 40
(DEFAULT_CONFIG). isValid didn't catch this. More dangerously: if someone enters `0`, all hours
become OT (`regularHours = min(totalH, 0) = 0`), inflating gross by 1.5× across the board.
Fix: added `(d.otThreshold ?? 0) > 0` guard to isValid for non-DHL, plus error state on the
custom threshold input.

**[MISSING — BACKLOG] No night differential for non-DHL**
`nightDiffRate` is DHL-only in the wizard and gated by `isDHL && cfg.dhlNightShift` in
`finance.js`. Non-DHL workers with a night differential (nurses, overnight warehouse, etc.) have no
mechanism to configure this. Requires both a wizard field and a `finance.js` engine change to
remove the `isDHL` gate on night differential. Tag: `[CC]`

**[MISSING — BACKLOG] No "No overtime" path**
OT threshold offers 40h / 48h / Custom — but no "exempt / not applicable" option. Salaried exempt
workers or workers with no OT policy can't express this cleanly. Workaround: set threshold to 168.
Backlog: add a "No OT" toggle that sets `otThreshold: null` and updates engine to skip OT math.

**[UX — BACKLOG] `shiftHours` label doesn't explain its purpose for non-DHL**
"Shift Length (hrs)" collects per-shift duration (8 hrs/day). The income calculation uses
`standardWeeklyHours` from Step 2 — `shiftHours` is only used in event impact math (missed shifts,
PTO counted in "shifts not hours"). This split is never explained, making the field feel redundant
next to the weekly hours question in Step 2. Add a helper line: "Used for shift counting in
event logging — income is based on total weekly hours set in the next step."

---

### Step 2 — Schedule

- [ ] Audit

**Known bug (pre-flagged):** `startDate` is not validated against fiscal year bounds. A date beyond
the fiscal year end produces `firstActiveIdx > max week index`, resulting in zero active weeks,
`projectedAnnualNet = 0`, and `weeklyIncome = −$50` (buffer only). Fix: clamp or validate date.

---

**[PLANNING NOTE] Non-DHL variable schedule — replace short/long week pair with `maxWeeklyHours` ceiling**

The current wizard asks "does your pay vary week to week?" for non-DHL users and, if yes, tries to
collect a short-week and long-week hours pair (via `standardWeeklyHours` / `longWeeklyHours`). This
model is abandoned. The new direction:

**Single field: `maxWeeklyHours`**
Non-DHL users set one number — the most hours they would ever be scheduled in a given week. This
becomes the projection ceiling. Income, net-pay estimates, and budget/expense panel formulas all
project off `maxWeeklyHours` as the baseline. There is no separate "short week" or "long week"
concept for non-DHL users.

For non-variable users (fixed schedule), `maxWeeklyHours` and their actual hours are the same — the
field still applies and replaces `standardWeeklyHours` in the non-DHL engine path.

**Weekly confirm modal for non-DHL users**
No preset rotation or scheduled days. Instead, the modal presents an open 7-day selector. The user
checks off whatever days they worked that week. The modal computes the day count × `shiftHours` and
compares to `maxWeeklyHours`:
- If actual worked hours = max → full projection week, no adjustment
- If actual worked hours < max → projection adjusts down proportionally (income delta logged)
- No day is ever "expected" or "required" — the ceiling is the only reference point

This means non-DHL users never have to configure a schedule. They configure their pay rate (Step 1),
their max hours (Step 2), and the weekly modal handles week-by-week reality against that ceiling.

**Implications for Step 4 (Tax Rates):**
The "does your pay vary?" question in Step 4 and the two-paystub path exist to derive separate
withholding rates for short vs long weeks. With the `maxWeeklyHours` model, non-DHL users provide
one paystub at a representative pay level. The `scheduleIsVariable` flag and second paystub section
can be removed from the non-DHL path — one rate set, one paystub. Revisit Step 4 when implementing.

**Implications for `buildYear` / `estimateWeeklyGross`:**
- Replace `cfg.standardWeeklyHours` and `cfg.longWeeklyHours` references in the non-DHL path with
  `cfg.maxWeeklyHours`
- `estimateWeeklyGross` for non-DHL: `maxWeeklyHours * baseRate` (no alternating week logic)
- `scheduleIsVariable` becomes unused for non-DHL and can be removed from that branch

**New config fields needed:** `maxWeeklyHours` (number, required for non-DHL). `standardWeeklyHours`
and `longWeeklyHours` are retired from the non-DHL engine path. Tag: `[CC]`

---

### Step 3 — Deductions

**Status: Functional — three gaps, no blockers**

**UI shown (non-DHL path):**
1. Benefits checklist — Health/Medical, Dental, Vision, LTD, STD, Life/AD&D, 401k, HSA, FSA
   (same list as DHL — `BENEFIT_DEFS = DHL_BENEFIT_OPTIONS` alias)
2. 401k card expands to: Your Contribution %, Employer Match %, Enrollment Date (all three required if 401k is selected)
3. Benefits Start Date — optional free-form date; blank = already active
4. Other Recurring Deductions — free-form label + per-paycheck amount rows; "+ Add Deduction" button
5. Attendance policy gate (non-DHL only) — "Yes — points or hours system" / "No — standard time off" pills

**Fields written to formData (non-DHL):**
`selectedBenefits`, `healthPremium`, `dentalPremium`, `visionPremium`, `ltd`, `stdWeekly`,
`lifePremium`, `k401Rate`, `k401MatchRate`, `k401StartDate`, `hsaWeekly`, `fsaWeekly`,
`benefitsStartDate`, `otherDeductions[]`, `attendanceBucketEnabled`

**DHL vs non-DHL difference:**
- DHL 401k card shows computed DHL tiered match (formula-driven); non-DHL shows free-form "Employer Match %" input.
- Attendance policy gate renders only for non-DHL; DHL bucket is always active via `isDHL` in WeekConfirmModal.
- Step is `skippable: true` — user can bypass entirely. Skipping leaves `attendanceBucketEnabled: null`, which correctly defaults to no-bucket-tracking in the rest of the app (`hasBucket = isDHL || attendanceBucketEnabled === true`).

---

**Issues found:**

**[PLANNING NOTE] Non-DHL attendance policy — general point/hours system design**

Most real-world non-DHL attendance systems share the same two-threshold shape: a number at which
the employee faces corrective action or suspension, and a higher number at which they are terminated.
The unit varies by employer (points, hours, occurrences) but the employee always knows both numbers.

**Design direction (for the eventual implementation):**
Capture three policy-agnostic fields when `attendanceBucketEnabled = true`:
- `attendanceWarnThreshold` — corrective action / suspension risk level
- `attendanceTerminateThreshold` — termination level
- `attendanceCurrentBalance` — where the employee is right now (starting point)

Unit label ("points", "hours", "occurrences") is cosmetic and user-supplied. Unapproved absence
events increment the balance by a configurable `attendanceIncrement` (default 1; user can set 0.5
or 2 for policies that assign fractional or weighted values per event). The model just tracks a
running number against the two thresholds — no monetary output, no tier bonus math.

**What this system explicitly does NOT include:**
- Overflow payout — DHL-exclusive. Do not port `payoutRate`, payout columns, or bonus math.
- Monthly tier bonuses (Tier 1–4 / 18h recovery) — DHL preset only.
- `bucketPayoutRate` — DHL preset only.

**Current state (shipped):**
- The yes/no gate in Step 3 saves `attendanceBucketEnabled` to config.
- `computeBucketModel` is gated to DHL-only in App.jsx — non-DHL users receive `bucketModel = null`.
- The "DHL Attendance Bucket" chart in LogPanel is gated on `hasBucket = isDHL` and will not
  render for non-DHL users even if `attendanceBucketEnabled = true`.
- WeekConfirmModal still shows "⚠ BUCKET HIT" for non-DHL users with the flag set — acceptable
  for now; the label will be generalized when the full non-DHL tracker ships.

**Next step:** add the three threshold fields as a conditional expansion below the "Yes" pill in
Step 3, then wire them into a simple threshold-status display in the relevant panel. Tag: `[CC]`

**[NAMING — FIXED] `DHL_BENEFIT_OPTIONS` renamed to `BENEFIT_OPTIONS`**
Shipped. `config.js`, `SetupWizard.jsx`, and `ProfilePanel.jsx` updated.

**[NAMING — LOW] `otherDeductions[].weeklyAmount` stores a per-paycheck value**
The UI label says "per paycheck" and the placeholder says "$/check". The field name `weeklyAmount`
contradicts this. `otherPostTaxDeductions()` in finance.js correctly treats it as per-paycheck
(`perCheck * checksPerYear / 52`), so the math is right, but the field name will mislead future
developers who read the config shape. Rename field to `perCheckAmount` in config + finance + wizard.
Tag: `[CODEX]`

**[MISSING — BACKLOG] No PTO section**
Non-DHL users have no PTO question in the entire wizard. See Open Items above for the full spec.
Must be added here as a dedicated subsection with: PTO offered? (Y/N gate) → accrual method →
accrual rate → current balance → cap. Also requires migrating `PTO_RATE` from a module-level constant
to a per-user config field. Tag: `[CC]`

**Verdict:** Step 3 proceeds correctly for non-DHL users. The attendance gate works, 401k employer
match is properly uncoupled from the DHL formula, `benefitsStartDate` is safely optional, and
`otherDeductions` math is correct. The three gaps above are tracking/UX issues, not blockers to
completing setup.

---

### Step 4 — Tax Rates

**Status: Functional — two known approximations, no blockers**

**UI shown (non-DHL path):**
1. "Does your pay vary week to week?" — Yes / No pills (non-DHL only; DHL auto-shows an info note that variable is pre-set)
2. Your State — full state dropdown with tax model hint below selection
3. Paystub Calculator — open by default when no rates set; "Recalculate from Paystub" link when rates exist
   - Fixed schedule: one paystub section (Gross, Fed Withheld, State Withheld)
   - Variable schedule: two sections (Shorter Week, Longer Week) — second is optional; if blank, `fedRateHigh = fedRateLow`
4. "Estimate" fallback button — pre-fills rates without a paystub and marks as Estimated
5. Tax Picture summary card — shows Standard Deduction, FICA, Fed rate(s), State rate(s) with Estimated/Confirmed badge

**Fields written to formData (non-DHL):**
`scheduleIsVariable`, `userState`, `fedRateLow`, `fedRateHigh`, `stateRateLow`, `stateRateHigh`, `taxRatesEstimated`

**DHL vs non-DHL difference:**
- Variable-schedule gate is non-DHL only. DHL auto-sets `scheduleIsVariable: true` and shows an info note instead.
- DHL MO preset load button only appears for `isDHL && !hasRates && userState === "MO"`. Non-DHL users never see it.
- Both paths share the same `PaystubCalc` component, `handleEstimate` logic, and Tax Picture summary.

**`isValid`:** `fedRateLow > 0 && userState != null` — no requirement on `stateRateLow`, `scheduleIsVariable`,
or confirmation status. A user on the estimate path passes as soon as fed rates and state are set.

---

**Issues found:**

**[APPROXIMATION — KNOWN] PROGRESSIVE state estimate falls back to 5%**
`handleEstimate()` uses `stateConfig?.flatRate ?? 0.05`. PROGRESSIVE states have no `flatRate` field,
so any non-flat state (CA, OR, NY, MN, NJ, etc.) gets a hardcoded 5% estimate regardless of brackets.
This is communicated to the user via the "Estimated" badge and the "Progressive brackets — estimate uses
a mid-bracket approximation" hint, and users can sharpen later via Sharpen Rates in Income. But a
California user at a $60k income (~9.3% effective state rate) or an Oregon user (~9.9%) starts with a
materially wrong estimate. Low-urgency since the paystub path gives exact rates, but worth flagging.
Fix when the user base diversifies: add a bracket midpoint lookup per state to replace the flat 5%.
Tag: `[CC]`

**[APPROXIMATION — KNOWN] No filing status; standard deduction hardcoded at $15,000**
`fedStdDeduction: 15000` in DEFAULT_CONFIG is never prompted in the wizard. The Tax Picture summary
displays it as a fixed value. MFJ users have a $30,000 deduction for 2025 — roughly double — so their
tax picture is meaningfully understated. Single filers at $15,000 are accurate for 2025.
This only affects the wizard summary display and the paystub-derived rates are empirical so the
actual withholding math stays correct. Fix when filing status is added to onboarding. Tag: `[CC]`

**Verdict:** Step 4 is well-constructed for non-DHL users. The variable-schedule gate, state dropdown,
paystub calculator, and estimate path all work correctly. Both approximations are disclosed to the user
and correctable via Sharpen Rates post-setup. No blocking issues.

---

### Step 5 — Wrap Up

**Status: Functional with one real bug — `longWeeklyHours` never set for non-DHL variable schedule**

**UI shown (non-DHL and DHL — no path difference):**
1. Live net estimate — breakdown card: Gross, Fed Tax, State Tax, FICA, 401k, Benefits, Other Deductions, Net
2. Paycheck Buffer — On/Off pills + amount input (default $50, max $200, clamped on save)
3. Tax-Exempt Gate — disclaimer + "Unlock projections" button (non-blocking placeholder)

**Fields written to formData:** `bufferEnabled`, `paycheckBuffer`, `taxExemptOptIn`

**`isValid`:** `() => true` — always passes, non-blocking.

**`showIf`:** `(_, ev) => ev === null || ev === "changed_jobs"` — step is skipped for the "lost_job"
life event (buffer and tax-exempt state preserved in config but not re-prompted).

**DHL vs non-DHL difference:** None. Both see the same Wrap Up step.

---

**Issues found:**

**[BUG — SUPERSEDED] `longWeeklyHours` / `standardWeeklyHours` short-long pair is abandoned**
The original fix direction (add `longWeeklyHours` to Step 2) is superseded by the design decision
documented in the Step 2 planning note above. The short/long week pair model is dropped entirely
for non-DHL. The replacement is a single `maxWeeklyHours` ceiling field — see Step 2 planning note
for the full spec including `buildYear`, `estimateWeeklyGross`, and `scheduleIsVariable` implications.
The `longWeeklyHours` references in `finance.js` lines 507 and 1068, and `estimateWeeklyGross`
line 1311, will be replaced when that work ships. Tag: `[CC]`

**[PLACEHOLDER — KNOWN] `taxExemptOptIn` is stored but unused**
`TaxExemptPreview` shows a static confirmation message ("Tax-Exempt Projections Unlocked") marked
in code as "Phase 5." `taxExemptOptIn` is saved to config but nothing in `App.jsx` or `IncomePanel`
reads it to gate or change any display. The opt-in UI is correct and the disclaimer copy is solid —
the backend wire-up is just deferred. No action needed until Phase 5.

**[CONFIRMED OK] Buffer $200 max is enforced in both wizard and ProfilePanel**
`SetupWizard` clamps inline via `Math.min(parseFloat(e.target.value) || 0, BUFFER_MAX)`.
`ProfilePanel` clamps on save via `Math.max(0, Math.min(Number(paycheckBuffer) || 0, 200))`.
Consistent — no bypass path found.

**[CONFIRMED OK] Salary users' gross estimate is correct**
`estimateWeeklyGross` for salary path: `40 * (baseRate)` where `baseRate = annualSalary / 2080`
(set by Step 1 on salary entry). This correctly yields `annualSalary / 52` weekly. ✓

**Verdict:** Wrap Up is clean for all non-DHL users. The `longWeeklyHours` gap is superseded by the
`maxWeeklyHours` redesign documented in Step 2. The Wrap Up step itself needs no changes — fixes
land in Step 2 UI, `buildYear`, and `estimateWeeklyGross`. Everything else here is confirmed correct
or intentionally deferred to Phase 5.
