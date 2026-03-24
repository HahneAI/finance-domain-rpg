# Plan: Setup Wizard (TODO Section 4)

## Context for New Sessions

This is the primary implementation document for the setup wizard. Read this before touching any wizard-related code.

**What this wizard is:** A multi-step onboarding flow that replaces all hardcoded single-user config values (currently Anthony's DHL account) with a user-facing setup process that works for any user. Every income calculation in the app flows from `DEFAULT_CONFIG` — the wizard is how new users populate it.

**Current app state:** All config is hardcoded for Anthony (DHL warehouse worker, Missouri, rotating 12hr shifts). Supabase persistence is live. No auth. No setup wizard yet. Finance.js `buildYear()` and `computeNet()` use hardcoded rotation strings and `w1/w2` rate fields that only make sense for Anthony's schedule.

**Key architectural decision:** Anthony's DHL-specific setup (heavy/light week rotation, dual withholding rates, bucket attendance model) is handled via an `employerPreset: "DHL"` flag. Standard users get a simpler flat weekly hours model. See `docs/setup-wizard-field-notes.md` for the full field-by-field decision log.

**Anthony migration:** When Phase 1 ships, a one-time migration in `db.js` detects Anthony's existing pre-wizard Supabase row (by absence of `setupComplete`) and sets `employerPreset: "DHL"`, copies legacy rate fields to the new names, and marks `setupComplete: true` — so Anthony never sees the wizard but the app is now multi-user ready structurally.

---

## Overview

A multi-step setup wizard that serves as the first page seen after sign-in when no saved config is detected. Also re-accessible from a sidebar life event menu ("Lost my job", "Changed jobs", "Got a commission job") to reset and re-configure affected fields without wiping unrelated config.

---

## Entry Points

### First-Run Gate
- App.jsx checks on load: `if (!loading && !config.setupComplete)` → render `<SetupWizard />`
- After wizard completes → writes `config.setupComplete = true` → saves → redirects to `/income` (or just sets topNav)
- "setupComplete" added to `DEFAULT_CONFIG` as `false`

### Life Event Re-Entry (Sidebar Menu)
- New sidebar item: **"Life Events"** — opens a modal or navigates to the wizard with a life event pre-selected
- Life events:
  - **Lost my job** → clears Pay Structure + Schedule + Deductions + Tax Rates; keeps Benefits capture; marks setupComplete=false so wizard re-runs
  - **Changed jobs** → full wizard re-run; pre-fills FICA (rarely changes) and Annual Tax Strategy; clears the rest
  - **Got a commission job** → flags commission mode; adds commission income field to Pay Structure; flags that OT/shift-based logic doesn't fully apply
- Re-entry pre-fills all surviving fields from current config; only affected steps are cleared/editable

---

## Wizard Steps

Steps render sequentially. Each step has: title, plain-English explanation ("what this affects" + "where to find it"), input fields, validation, Next / Back navigation.

---

### Step 0 — Welcome (first-run only) / Life Event Select (re-entry)

**First-run:**
> "Welcome to Life RPG Finance. Before we build your dashboard, let's capture your pay setup. This takes about 3 minutes. You'll be able to update anything anytime from the Life Events menu."

No fields. Just a Start button.

**Re-entry:**
- Dropdown: select life event type
- Dependency engine reads selection and marks downstream steps dirty/clean

---

### Step 1 — Pay Structure

**What it affects:** Every gross income calculation in the app.
**Where to find it:** Your offer letter or most recent paystub.

**Employer preset gate (shown first, before any pay fields):**

> "Do you work for DHL?"

- Pill: **Yes** · **No**
- Writes: `employerPreset: "DHL" | null`
- **DHL = Yes:** auto-sets `scheduleIsVariable = true`; activates bucket attendance model; unlocks DHL rotation picker in Step 2; skips Step 6 attendance policy gate (DHL always has bucket tracking); pre-loads bucket defaults (`bucketStartBalance: 64`, `bucketCap: 128`, `bucketPayoutRate: 9.825`)
- **No:** standard path — `scheduleIsVariable` defaults false; Step 4 asks hours-vary question normally; Step 6 attendance gate shown

Note: This gate is the foundation for future employer presets (UPS, Amazon warehouse, etc.) — same pattern, different defaults.

| Field | Input | Notes |
|-------|-------|-------|
| Base hourly rate | $ number | e.g. 19.65 |
| Shift length | hrs number | e.g. 10 |
| Weekend differential | $ number | extra $/hr for weekend shifts; 0 if none |
| OT threshold | hrs/wk number | default 40; some contracts differ |
| OT multiplier | × number | default 1.5 |

**Commission mode flag** (if life event = commission job):
- Toggle: "My pay includes commission (not just hourly)"
- Adds: Commission estimate (monthly average $) — used for income projection

---

### Step 2 — Schedule

**What it affects:** Which weeks generate income, your baseline hours, and all date-sensitive calculations.
**Where to find it:** Your start date and your first paystub.

| Field | Input | Notes |
|-------|-------|-------|
| Job start date | date picker | Used to derive `firstActiveIdx` |
| Standard weekly hours | number | **Standard path only** — "How many hours do you work in a typical week?" (e.g. 40). Deviations logged via weekly check-in. |
| DHL rotation phase | Pill: **Currently on 4-day week** · **Currently on 6-day week** | **DHL preset only** — shown if `employerPreset = "DHL"`. Writes `startingWeekIsHeavy: false | true`. Used by `buildYear()` to alternate light/heavy rate assignment from `firstActiveIdx`. |
| Pay period end day | Day-of-week picker (Sun–Sat) | Which day your pay week closes; used to trigger weekly work confirmation modal (`config.payPeriodEndDay`, 0=Sun default) |

Plain-English note (pay period end day): "This tells the app when to prompt you to confirm what you actually worked each week. Typically Sunday if your work week runs Monday–Sunday."

Plain-English note (DHL rotation): "This tells the app whether your current paycheck is from a lighter 4-day week or a heavier 6-day week. It needs to know which one you're on right now so it can alternate correctly for the rest of the year."

---

### Step 3 — Deductions

**What it affects:** Your net take-home on every paycheck.
**Where to find it:** Your benefits enrollment confirmation or paystub deduction breakdown.

| Field | Input | Notes |
|-------|-------|-------|
| LTD (Long-Term Disability) | $ / week | Check paystub; enter 0 if not enrolled |
| 401k employee contribution | % | e.g. 6 |
| Employer match | % | e.g. 3 (match up to X%) |
| 401k enrollment start date | date | Leave blank if already active |

Dependency: if 401k enrollment date is in the future, app shows countdown in Benefits panel (already implemented).

---

### Step 4 — Tax Rates

**What it affects:** How much is withheld from each paycheck and your projected year-end tax balance.
**Where to find it:** One or two recent paystubs (depends on whether your hours vary week to week).

**Gate question (shown first):**
> "Does your gross pay change week to week?"
- Pill: **Yes, it varies** · **No, it's consistent**
- **Yes** → two paystub calculators shown (light week + heavy week)
- **No** → one paystub calculator shown; single rate used for all weeks

**State question:**
> "What state do you live in?"
- State dropdown → app pre-fills state rate from lookup table
- User confirms against their paystub in the calculator below

**Paystub calculator UI (shown once or twice based on gate above):**
> "Pull up [a recent / your lighter-week] paystub. Enter the numbers below and we'll figure out your rates."
- Input: Gross pay that check
- Input: Federal income tax withheld
- Input: State income tax withheld
- App derives and displays: federal rate = withheld ÷ gross, state rate = withheld ÷ gross
- User confirms (or adjusts if paystub had an anomaly)

| Stored Field | Replaces | Notes |
|---|---|---|
| `scheduleIsVariable` | *(new)* | Drives whether one or two calculators shown; persists to inform `buildYear()` logic |
| `userState` | *(new)* | Two-letter state code; drives state rate pre-fill and Annual Tax Strategy step |
| `fedRateLow` | `w1FedRate` | Federal rate on lighter/consistent paycheck |
| `fedRateHigh` | `w2FedRate` | Federal rate on heavier paycheck (equals fedRateLow if not variable) |
| `stateRateLow` | `w1StateRate` | State rate on lighter/consistent paycheck |
| `stateRateHigh` | `w2StateRate` | State rate on heavier paycheck (equals stateRateLow if not variable) |
| `ficaRate` | — | Pre-filled 7.65% (W-2 employee share: 6.2% SS + 1.45% Medicare). Read-only — no user input. If pay type = self-employed/1099, auto-set to 15.3% instead. SS wage cap ($176,100 for 2026) not a concern at this income level. |

Plain-English note shown at top of step: "We're not asking you to know your tax rate off the top of your head — your paystub already has the answer. Just grab one and we'll do the math together."

---

### Step 5 — Annual Tax Strategy

**What it affects:** Whether you're projected to owe at filing, and how much extra to withhold per check.
**Where to find it:** Last year's tax return (line 61 for amount owed). Missouri uses a flat rate derived from your state selection in Step 4.

**Standard deduction assumption (shown as a disclosure at the top of this step):**
> "All tax projections use the federal standard deduction ($15,000 for 2026 single filers). If you itemize deductions, your actual tax liability may be lower — but we keep things simple here. A full deductions breakdown is available as an optional advanced setup."

`fedStdDeduction` is pre-filled and read-only. Not shown as an editable input — it's a system constant updated annually.

| Field | Input | Notes |
|-------|-------|-------|
| MO flat rate | % | Pre-filled from `userState` lookup; shown for confirmation, not entry |
| Target amount owed at filing | $ | 0 = break even; small positive = safer than refund |

Plain-English note: "If you enter $200 here, the app will calculate how much extra to withhold each check so you owe exactly $200 at filing — not a surprise bill, not a big refund you didn't earn."

---

### Step 6 — Benefits Capture

**What it affects:** Your net paycheck (health insurance deduction), PTO accrual tracking, and paternity leave planning in the Benefits panel.
**Where to find it:** Your benefits enrollment email or HR portal.

| Field | Input | Notes |
|-------|-------|-------|
| Health insurance deduction | $ / paycheck | Enter 0 if not enrolled yet |
| Benefits start date | date | When health/dental/vision kicks in |
| Any other recurring deductions | repeatable $ field | Label + amount (e.g. "Dental: $12") |

**Attendance policy gate (shown at end of Step 6 — standard path only):**

Skipped entirely if `employerPreset = "DHL"` — DHL users have bucket tracking auto-enabled from Step 1.

> "Does your employer have a formal attendance policy — like a points or hours-based system?"

- Pill: **Yes — points or hours based** · **No — standard time-off tracking**
- **Yes** → enables simplified bucket tracker (hours-based policy assumed; intake rates adjustable from Settings)
- **No** → log-based attendance history only: no bucket math; missed days visible in event log history
- **All users** get: attendance history view (missed days, monthly trend) — gate only controls whether bucket model is active

---

### Step 7 — Paycheck Buffer

**What it affects:** A safety floor applied to every unallocated income calculation. Any surplus below this threshold is treated as "spoken for."
**Where to find it:** Nowhere — you set this. It's your buffer.

Show: projected net per check (calculated live from steps 1–6).

| Field | Input | Notes |
|-------|-------|-------|
| Safety buffer per check | $ | Minimum $50 enforced; default $50 |

Plain-English note: "Life is unpredictable. This buffer reserves a slice of each paycheck for things the app doesn't know about — a co-pay, a car issue, a last-minute grocery run. $50 is the floor; go higher if your life has more noise."

Validation: warn if user enters < 50; block save until corrected or explicitly overridden with confirmation.

---

### Step 8 — Tax Exempt Gate (Visual Testing Sprint)

Three UI options to test at the end of the feature sprint. Implement all three, gate behind a flag, A/B test visually. Pick winner before launch.

**Context:** Tax schedule controls (per-week taxed/exempt toggles, extra withholding toggle) are advanced and carry personal liability risk. User must opt in after reading a disclaimer before these controls unlock.

**Disclaimer text:**
> "Heads up — adjusting your withholding or exemption status can affect how much you owe at tax time. Life RPG helps you plan and visualize your finances, but we're not a tax advisor. If you're unsure, a quick chat with a CPA before changing your W-4 can save you a headache come April. You've got this — just go in informed."

**Option A — Blur + Lock overlay:**
- Tax schedule section renders normally but is covered by a frosted/blurred overlay
- Overlay shows a padlock icon + short prompt + "Enable Advanced Tax Controls" button
- Clicking button shows disclaimer modal → Accept → overlay removed → controls unlock

**Option B — Hidden, revealed by link:**
- Tax schedule section is completely absent from the UI
- In IncomePanel, a small muted "Advanced" text link appears below the relevant section
- Clicking "Advanced" shows the disclaimer inline (no modal) → Accept → section appears

**Option C — Locked placeholder card:**
- Tax schedule section replaced by a single locked card with:
  - Section title (grayed)
  - "🔒 Advanced — Tax Schedule Controls"
  - One-sentence description of what's behind the lock
  - "Learn more & enable" button → disclaimer modal → Accept → card replaced with real controls

**Acceptance persistence:** once accepted, `config.taxExemptOptIn = true` saves to Supabase. User never sees the gate again unless they clear data.

---

## Dependency Engine (Step Routing)

```
lifeEvent = null (first-run)     → show all steps 0–8
lifeEvent = "Lost my job"        → show steps 0, 1, 2, 3, 4 only; preserve 5, 6, 7; skip 8
lifeEvent = "Changed jobs"       → show all steps 0–8; pre-fill FICA + tax strategy fields
lifeEvent = "Commission job"     → show steps 0, 1 (with commission flag), 2, 3, 4, 5; skip 6, 7
```

Each step checks: does a dependency make this step irrelevant? If yes, auto-skip (no user sees it).

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/constants/config.js` | Add 6 new fields to DEFAULT_CONFIG |
| `src/lib/db.js` | Fix config merge strategy; add Anthony migration block |
| `src/lib/finance.js` | Update `buildYear()` rotation logic; add `stateTax()` (state sprint) |
| `src/constants/stateTaxTable.js` | **Create** — 50-state tax table (state sprint) |
| `src/components/SetupWizard.jsx` | **Create** — full multi-step wizard component |
| `src/App.jsx` | First-run gate; `handleWizardComplete`; Life Events sidebar item |
| `src/components/IncomePanel.jsx` | Tax exempt gate (3 UI options behind flag) |
| `docs/TODO.md` | Mark Section 4 items complete as shipped |

---

## Build Order

### Phase 1 — Foundation (do this first, before any wizard UI)

**Step 1 — `src/constants/config.js`**
Add to DEFAULT_CONFIG:
```js
setupComplete: false,
taxExemptOptIn: false,
paycheckBuffer: 50,
employerPreset: null,       // "DHL" | null
startingWeekIsHeavy: null,  // DHL only: true = first active week is 6-day (72hr)
userState: "MO",            // state sprint
```
Remove `w1FedRate`, `w2FedRate`, `w1StateRate`, `w2StateRate` from DEFAULT_CONFIG — replaced by `fedRateLow`, `fedRateHigh`, `stateRateLow`, `stateRateHigh` (wizard-derived, not hardcoded).

**Step 2 — `src/lib/db.js` — config merge fix (critical)**

Current behavior: `data.config || DEFAULT_CONFIG` — entire DEFAULT_CONFIG is discarded if any config row exists. New fields added to DEFAULT_CONFIG will never reach existing users.

Fix in `loadUserData()`:
```js
// Before (broken for new fields):
config: Object.keys(data.config).length ? data.config : DEFAULT_CONFIG,

// After (new DEFAULT_CONFIG fields fill in for existing rows):
config: { ...DEFAULT_CONFIG, ...data.config },
```

**Step 3 — `src/lib/db.js` — Anthony migration block**

Add after the merge fix, before returning:
```js
// Anthony account migration — set DHL preset on existing row
if (mergedConfig.employerPreset === null) {
  mergedConfig.employerPreset = "DHL";
  mergedConfig.startingWeekIsHeavy = true; // Anthony's first active week is 6-day
}
// Keep moFlatRate in config for now; state sprint will remove it once stateTax() is wired
```
This runs once; after wizard completes, `setupComplete: true` prevents re-entry and these values are confirmed.

---

### Phase 2 — finance.js updates (before wizard UI — wizard previews depend on these)

**Step 4 — `src/lib/finance.js` — decouple rotation from hardcoded strings**

In `buildYear()`, replace the `rotation === "6-Day"` / `rotation === "4-Day"` string checks with config-driven logic:
- If `config.employerPreset === "DHL"`: alternate heavy/light starting from `config.startingWeekIsHeavy` at `firstActiveIdx`; even/odd determines which is which
- If standard user (`employerPreset === null`): all active weeks use `config.standardWeeklyHours` (new field from wizard Step 2); no rotation concept

In `computeNet()`, replace `w1FedRate`/`w2FedRate` references:
- DHL: use `fedRateLow` for light weeks, `fedRateHigh` for heavy weeks
- Standard: use `fedRateLow` for all weeks (wizard sets `fedRateHigh === fedRateLow` when not variable)
- Backward compat: if `fedRateLow` not set yet (old row before wizard), fall back to `w1FedRate`

**Step 5 — `src/constants/stateTaxTable.js` + `src/lib/finance.js` — state sprint**

Per the state sprint plan already in this doc:
1. Create `stateTaxTable.js` with NONE + FLAT states; stub progressive states as FLAT with TODO comments
2. Add `stateTax(income, stateConfig)` to `finance.js`
3. In `App.jsx` `taxDerived`, replace `moFlatRate` usage with `stateTax(fAGI, STATE_TAX_TABLE[config.userState])`
4. Keep `moFlatRate` in config as read-only fallback; remove after migration confirmed

---

### Phase 3 — SetupWizard component

**Step 6 — Create `src/components/SetupWizard.jsx` — scaffold**

Wizard state shape:
```js
const [step, setStep] = useState(0);
const [formData, setFormData] = useState({ ...config }); // pre-fills on re-entry
```

Navigation: Back / Next buttons; progress indicator (step X of 8); Next disabled until current step validates.

Step router — array of step components, filtered by `lifeEvent` + `employerPreset`:
```
steps = [Step0, Step1, Step2, Step3, Step4, Step5, Step6, Step7, Step8]
activeSteps = steps.filter(s => s.showIf(formData, lifeEvent))
```

On wizard complete:
```js
function handleComplete(finalData) {
  // Auto-populate taxedWeeks: all weeks from firstActiveIdx onward
  const taxedWeeks = allWeeks
    .filter(w => w.idx >= finalData.firstActiveIdx)
    .map(w => w.idx);
  onComplete({ ...finalData, taxedWeeks, setupComplete: true });
}
```

**Step 7 — Implement steps in order (one step = one sitting)**

Each step: title, plain-English blurb, inputs, inline validation, Next gated on valid.

| Sitting | Step | Key implementation notes |
|---------|------|--------------------------|
| 1 | Step 0 | Welcome copy + Start button; Life Event dropdown on re-entry; dependency engine sets `lifeEvent` |
| 2 | Step 1 | DHL pill gate first → writes `employerPreset`; then Pay Structure fields; commission toggle if life event = commission |
| 3 | Step 2 | Job start date → derives `firstActiveIdx` from `FISCAL_YEAR_START`; standard path shows weekly hours input; DHL path shows 4-day/6-day pill → `startingWeekIsHeavy` |
| 4 | Step 3 | Benefits availability gate (enrolled / not yet / none) → shows/hides LTD + 401k fields conditionally |
| 5 | Step 4 | Variable hours gate (`scheduleIsVariable`) — auto-true for DHL; state dropdown → pre-fills rate from STATE_TAX_TABLE; one or two paystub calculators (gross + withheld → derives rate) |
| 6 | Step 5 | Standard deduction disclosure (read-only); state rate shown/hidden based on model; `targetOwedAtFiling` input |
| 7 | Step 6 | Health deduction + benefits start date + repeatable other deductions; attendance gate at bottom (skip if DHL) |
| 8 | Step 7 | Live net-per-check preview (computed from formData so far); `paycheckBuffer` input; $50 floor validation |
| 9 | Step 8 | Tax Exempt Gate — implement all 3 options (A/B/C) behind a `GATE_VARIANT` constant; pick winner after visual test |

---

### Phase 4 — App.jsx integration

**Step 8 — First-run gate**
```jsx
// In App.jsx render, before main layout:
if (!config.setupComplete) {
  return <SetupWizard config={config} onComplete={handleWizardComplete} />;
}
```

`handleWizardComplete(newConfig)`:
- Merge `newConfig` into state
- Save to Supabase immediately
- `setupComplete: true` persists — gate never triggers again

**Step 9 — Life Events sidebar item**
- New sidebar entry: "Life Events"
- Opens modal: select event type (Lost my job / Changed jobs / Got a commission job)
- On select: set `lifeEvent`, clear affected config fields, set `setupComplete: false` → wizard re-runs with pre-fills intact for surviving fields

---

### Phase 5 — Tax Exempt Gate in IncomePanel

**Step 10 — `src/components/IncomePanel.jsx`**
- Wrap the Tax Schedule view (per-week toggles, extra withholding controls) with gate logic
- Gate reads `config.taxExemptOptIn`
- Implement all 3 options behind `const GATE_VARIANT = 'A'` (or 'B' / 'C')
- Run all 3 visually; pick winner; delete the losers before merging
- On accept: write `taxExemptOptIn: true` → save → gate never shown again

---

### Verification (run in order after build)

1. Clear Supabase config (or use incognito) → wizard appears on load, main app blocked
2. Complete wizard as standard user (No DHL) → `setupComplete: true` saved → main app loads
3. Complete wizard as DHL user → `employerPreset: "DHL"`, `startingWeekIsHeavy` set → heavy/light income projections match hand-calculated values
4. Anthony's existing row loads → DHL migration fires → `employerPreset: "DHL"` written → no income math regression
5. Sidebar "Life Events" → "Changed jobs" → wizard opens with FICA + tax strategy pre-filled; Pay Structure blank
6. Set buffer to $30 → validation error; $50 → saves fine
7. State sprint: switch `userState` to "TX" → state liability $0; Step 5 hides state rate field
8. Tax Exempt Gate: toggle `GATE_VARIANT` between A/B/C → all 3 render correctly; accept → `taxExemptOptIn: true` → gate gone on reload

---

## Verification

1. Fresh Supabase row (or clear config) → wizard appears on load, Income panel not accessible until wizard completes
2. Complete wizard → `setupComplete: true` saved → redirects to Income panel
3. Sidebar "Life Events" → "Changed jobs" → wizard opens with FICA + tax strategy pre-filled, Pay Structure fields blank
4. Set buffer to $30 → validation error shown; $50 → saves fine
5. Tax exempt gate: toggle flag between A/B/C → verify each option renders correctly in IncomePanel
6. Accept disclaimer → `taxExemptOptIn: true` written → gate never shown again on reload

---

*Last updated: 2026-03-24 — Build Order expanded to full phase-by-phase implementation plan. Phase 1: config fields + db.js migration fix (critical — merge strategy change). Phase 2: finance.js rotation decoupling + state sprint. Phase 3: SetupWizard scaffold + 9 step sittings. Phase 4: App.jsx gate + Life Events. Phase 5: Tax Exempt Gate in IncomePanel. Verification checklist added.*

---

---

# Sprint: State Tax Table + userState Dropdown

**Scope:** Config-driven state tax architecture — replaces the hardcoded MO-only assumption with a 50-state lookup table and a user-facing state selector in the wizard.

**Context:** Currently `moFlatRate: 0.047` is hardcoded in DEFAULT_CONFIG and `taxDerived` in App.jsx assumes Missouri flat tax for every user. The wizard (Step 4) already plans for a `userState` dropdown and rate pre-fill — this sprint builds the backend dataset and wires it up.

---

## Mental Model (3 Tax Models)

Every state falls into one of three categories:

```
NONE         → state income tax = 0 (return immediately)
FLAT         → tax = income × flatRate
PROGRESSIVE  → tax = iterate through brackets (same pattern as federal)
```

Once the user selects their state, the app:
1. Pulls `STATE_TAX_TABLE[userState]`
2. Passes income + config into a single `stateTax(income, stateConfig)` function
3. Returns the computed liability — no per-state branching anywhere else in the app

---

## State Breakdown

**No Income Tax (model: "NONE"):**
Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Wyoming

**Flat Tax (model: "FLAT"):**
Arizona, Colorado, Georgia, Idaho, Illinois, Indiana, Iowa, Kentucky, Louisiana, Michigan, Mississippi*, North Carolina, Ohio, Pennsylvania, Utah

*Mississippi: transitioning system, effectively flat after a threshold — model as FLAT for now, leave room to upgrade later.

**Progressive (model: "PROGRESSIVE"):**
Everything else — approximately 26 states + DC.

**Edge Cases to Handle:**
- **Washington** — doesn't tax wages, only capital gains. Treat as NONE for income tax. Do not apply normal income tax logic.
- **Massachusetts** — mostly flat (5%) but has a high-income surtax layer above ~$1M. Treat as FLAT for MVP (irrelevant at this income level).
- **Missouri** — flat at 4.7%. Already correct; just migrates to the table.

---

## Data Shape

```js
// src/constants/stateTaxTable.js  (new file)

export const STATE_TAX_TABLE = {
  // No income tax
  AK: { model: "NONE" },
  FL: { model: "NONE" },
  NV: { model: "NONE" },
  NH: { model: "NONE" },
  SD: { model: "NONE" },
  TN: { model: "NONE" },
  TX: { model: "NONE" },
  WA: { model: "NONE" },  // wages only; capital gains separate
  WY: { model: "NONE" },

  // Flat tax
  AZ: { model: "FLAT", flatRate: 0.025 },
  CO: { model: "FLAT", flatRate: 0.044 },
  GA: { model: "FLAT", flatRate: 0.055 },
  ID: { model: "FLAT", flatRate: 0.058 },
  IL: { model: "FLAT", flatRate: 0.0495 },
  IN: { model: "FLAT", flatRate: 0.0305 },
  IA: { model: "FLAT", flatRate: 0.038 },
  KY: { model: "FLAT", flatRate: 0.04 },
  LA: { model: "FLAT", flatRate: 0.03 },
  MI: { model: "FLAT", flatRate: 0.0425 },
  MS: { model: "FLAT", flatRate: 0.047 },  // transitioning; revisit
  MO: { model: "FLAT", flatRate: 0.047 },
  NC: { model: "FLAT", flatRate: 0.045 },
  OH: { model: "FLAT", flatRate: 0.035 },  // simplified; verify brackets at target income
  PA: { model: "FLAT", flatRate: 0.0307 },
  UT: { model: "FLAT", flatRate: 0.0465 },
  MA: { model: "FLAT", flatRate: 0.05 },   // surtax irrelevant at this income level

  // Progressive — brackets filled in per state
  // Example shape:
  // CA: { model: "PROGRESSIVE", brackets: [{ min: 0, max: 10099, rate: 0.01 }, ...] },
  // (remaining 26 states + DC populated at build time)
};
```

**Note:** Rate accuracy should be verified against each state's 2026 published tax tables before launch. The flat rates listed above are based on current law as of planning; some states adjust annually.

---

## New Calculation Function

```js
// src/lib/finance.js — add alongside fedTax()

export function stateTax(income, stateConfig) {
  if (!stateConfig || stateConfig.model === "NONE") return 0;
  if (stateConfig.model === "FLAT") return income * stateConfig.flatRate;
  if (stateConfig.model === "PROGRESSIVE") {
    let tax = 0, prev = 0;
    for (const { max, rate } of stateConfig.brackets) {
      if (income <= prev) break;
      tax += (Math.min(income, max ?? Infinity) - prev) * rate;
      prev = max ?? Infinity;
    }
    return tax;
  }
  return 0;
}
```

---

## Config Changes

**`DEFAULT_CONFIG` additions (`src/constants/config.js`):**

```js
userState: "MO",          // two-letter state code; drives STATE_TAX_TABLE lookup
```

**`DEFAULT_CONFIG` deprecations (kept for migration, not surfaced in wizard):**
- `moFlatRate` — replaced by `STATE_TAX_TABLE[config.userState].flatRate`
- Remove once migration confirmed safe (check `db.js` migration logic)

---

## App.jsx Wiring

In `taxDerived`, replace:
```js
const mL = tt * config.moFlatRate;  // current: hardcoded MO
```
with:
```js
import { STATE_TAX_TABLE } from '../constants/stateTaxTable';
import { stateTax } from '../lib/finance';

const stateConfig = STATE_TAX_TABLE[config.userState] ?? STATE_TAX_TABLE["MO"];
const mL = stateTax(fAGI, stateConfig);  // use AGI same as federal (verify per-state)
```

Also update `moWithheldBase` label/variable name to `stateWithheldBase` for clarity.

---

## Wizard Integration

**Step 4 (Tax Rates)** — state dropdown already planned:
- Dropdown populated from `Object.keys(STATE_TAX_TABLE)` sorted alphabetically by full state name
- On select: look up `STATE_TAX_TABLE[code]` → derive `stateRateLow` pre-fill
  - NONE → pre-fill 0%, show note "Your state has no income tax"
  - FLAT → pre-fill `flatRate` directly
  - PROGRESSIVE → run `stateTax(estimatedGross, stateConfig) / estimatedGross` as a rough effective rate for display; user confirms against paystub

**Step 5 (Annual Tax Strategy)** — update the field label:
- "MO flat rate" → "[State] state tax rate" (derived from `userState` + table)
- If model is NONE: hide the field entirely, show "Your state has no income tax — no state liability to plan around."
- If model is PROGRESSIVE: show effective rate note, not flat rate

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/constants/stateTaxTable.js` | **Create** — full `STATE_TAX_TABLE` dataset |
| `src/lib/finance.js` | Add `stateTax(income, stateConfig)` function |
| `src/constants/config.js` | Add `userState: "MO"` to DEFAULT_CONFIG |
| `src/App.jsx` | Replace `moFlatRate` usage in `taxDerived` with `stateTax()` lookup |
| `src/components/SetupWizard.jsx` | State dropdown in Step 4; conditional Step 5 display |

---

## Build Order

1. `stateTaxTable.js` — build the dataset (NONE + FLAT states first; progressive states can be stubbed as FLAT initially with a TODO comment)
2. `finance.js` — add `stateTax()` function
3. `config.js` — add `userState`; keep `moFlatRate` for now as fallback
4. `App.jsx` — swap `taxDerived` to use `stateTax()` lookup; verify MO output unchanged
5. `SetupWizard.jsx` — wire state dropdown to `userState`; add NONE/FLAT/PROGRESSIVE display logic in Steps 4 & 5

---

## Verification

1. Default load (MO) → `taxDerived.moLiability` unchanged from before the migration
2. Switch `userState` to "TX" → state liability = $0; Step 5 hides state rate field
3. Switch `userState` to "CA" → progressive brackets calculate correctly vs. manual check
4. Flat state (e.g. "IL") → `stateTax(50000, IL_config)` = $2,475 (50000 × 0.0495)
5. Wizard Step 4: select state → rate pre-fills in paystub calculator; user can override
6. Old `moFlatRate` config key in Supabase → db.js migration handles gracefully (no crash on existing rows)

---

*Added: 2026-03-24 — Planning only, no implementation started*
