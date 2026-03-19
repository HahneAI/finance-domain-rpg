# Plan: Setup Wizard (TODO Section 4)

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

**What it affects:** Which weeks generate income, pay rotation (Week 1/Week 2 taxed differently), and all date-sensitive calculations.
**Where to find it:** Your start date and your first paystub.

| Field | Input | Notes |
|-------|-------|-------|
| Job start date | date picker | Used to derive firstActiveIdx |
| Pay week rotation | Week 1 / Week 2 picker | "Which week type does your first paycheck fall on?" |

Plain-English note: "Week 1 vs Week 2 affects how your federal taxes are withheld each paycheck. Check your first paystub — if you were taxed more, that was likely Week 2."

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
**Where to find it:** Your W-4 and most recent paystubs for both Week 1 and Week 2 checks.

| Field | Input | Notes |
|-------|-------|-------|
| Week 2 federal withholding rate | % | Higher-tax week |
| Week 2 MO state rate | % | |
| Week 1 federal rate | % | Lower-tax week |
| Week 1 MO state rate | % | |
| FICA rate | % | Default 7.65%; almost never changes |

Tip shown inline: "Not sure? Your paystub shows total federal/state withheld. Divide by gross pay to get the rate. Two paystubs — one from each week type — will give you both rates."

---

### Step 5 — Annual Tax Strategy

**What it affects:** Whether you're projected to owe at filing, and how much extra to withhold per check.
**Where to find it:** Last year's tax return (line 12 for standard deduction; line 61 for amount owed). Missouri uses a flat rate.

| Field | Input | Notes |
|-------|-------|-------|
| Federal standard deduction | $ | 2026 single filer: $15,000 |
| MO flat rate | % | 4.95% for 2026 |
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
| `src/components/SetupWizard.jsx` | Create — full multi-step wizard component |
| `src/constants/config.js` | Add `setupComplete: false`, `taxExemptOptIn: false`, `paycheckBuffer: 50` to DEFAULT_CONFIG |
| `src/App.jsx` | Add first-run gate logic; add Life Events sidebar item |
| `src/components/IncomePanel.jsx` | Add tax exempt gate (one of 3 options) |
| `docs/TODO.md` | Mark Section 4 items complete as shipped |

---

## Build Order

1. `config.js` — add 3 new fields
2. `SetupWizard.jsx` — scaffold all 8 steps with navigation, validation, live save on complete
3. `App.jsx` — first-run gate + Life Events sidebar menu
4. `IncomePanel.jsx` — implement all 3 tax exempt gate options behind flag; visual test each; pick winner

---

## Verification

1. Fresh Supabase row (or clear config) → wizard appears on load, Income panel not accessible until wizard completes
2. Complete wizard → `setupComplete: true` saved → redirects to Income panel
3. Sidebar "Life Events" → "Changed jobs" → wizard opens with FICA + tax strategy pre-filled, Pay Structure fields blank
4. Set buffer to $30 → validation error shown; $50 → saves fine
5. Tax exempt gate: toggle flag between A/B/C → verify each option renders correctly in IncomePanel
6. Accept disclaimer → `taxExemptOptIn: true` written → gate never shown again on reload

---

*Last updated: 2026-03-19 — Planning doc created, no implementation started*
