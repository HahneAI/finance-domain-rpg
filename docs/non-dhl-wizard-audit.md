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

**Primary hypothesis:** The displayed number is suspiciously exactly `paycheckBuffer: 50`, which is
enabled by default in `DEFAULT_CONFIG`. If something in the post-wizard income pipeline subtracts the
buffer from the projected net before display, and the underlying net-after-taxes is near zero due to
a separate issue (wrong rate application, wrong hours multiplier, etc.), you'd land at exactly −$50.

**Secondary hypothesis:** `DEFAULT_CONFIG` seeds DHL-specific values (`fedRateLow: 0.0784`,
`stateRateLow: 0.0338`, `userState: "MO"`, `shiftHours: 12`) that a non-DHL user likely never
overwrites. A non-DHL user who picks "Use Estimate for Now" on the tax step gets new rates written;
one who enters paystub values also writes them. But if any DHL-preset values bleed into the
non-DHL computation path (rotation logic, DHL-specific multipliers, etc.), the weekly gross
estimate or `buildYear` output could be wrong.

**Where to look:**
- `estimateWeeklyGross()` in `SetupWizard.jsx` — non-DHL branch uses `standardWeeklyHours ?? 40`,
  NOT `shiftHours`. `shiftHours` is required in Step 1 validation but not used in gross calc.
- `buildYear()` in `finance.js` — does the non-DHL path reach any DHL-gated branch incorrectly?
- `computeNet()` in `finance.js` — does it apply buffer deduction to the projected weekly net?
- `HomePanel.jsx` `projectedWeeklyLeft` — what is the source value and does it double-count buffer?
- `PAYCHECKS_PER_YEAR` factor in `StepWrapUp` vs in `buildYear` — could be inconsistent for
  biweekly/monthly users (factor applied in one place but not the other).

---

## Step-by-Step Audit

Work through each step in order. For each: document what the non-DHL UI shows, what gets written to
`formData`, whether the validation gates are correct, and what a DHL user sees differently.

---

### Step 0 — Welcome

- [ ] Audit

---

### Step 1 — Pay Structure

- [ ] Audit

---

### Step 2 — Schedule

- [ ] Audit

---

### Step 3 — Deductions

- [ ] Audit

---

### Step 4 — Tax Rates

- [ ] Audit

---

### Step 5 — Wrap Up

- [ ] Audit
