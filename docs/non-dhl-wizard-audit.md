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

### Step 3 — Deductions

- [ ] Audit

**Backlog:** PTO needs its own subsection here for non-DHL users — see Open Items above.

---

### Step 4 — Tax Rates

- [ ] Audit

---

### Step 5 — Wrap Up

- [ ] Audit
