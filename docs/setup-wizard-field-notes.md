# Setup Wizard — Field-by-Field Design Notes

Fields reviewed top-to-bottom. Pick up at `w2FedRate` next session.

---

## Pay Type (pre-step, above all fields)

**Not a config field — gates everything downstream.**

> "Are you paid on salary, hourly, or commission?"

- Pill button multiselect (one choice only here, but pill UI consistent with rest of wizard)
- Selecting a pill highlights it + shows a checkmark to confirm
- Determines which Pay Structure fields appear:
  - **Hourly** → show all fields below
  - **Salary** → hide shiftHours, diffRate, otThreshold, otMultiplier; show annual salary field instead
  - **Commission** → show base hourly/salary if applicable + commission estimate field

---

## Pay Structure Fields

| Config Field | Wizard Question | UI Pattern | Notes |
|---|---|---|---|
| `baseRate` | "What is your base hourly pay rate?" | $ number input | Straightforward |
| `shiftHours` | "How many hours is a standard shift?" | Number input | Only shown if hourly |
| `diffRate` | "Do you have overnight or weekend differentials?" | Two pill buttons: **Overnight** · **Weekend** — multiselect | Each selected pill expands an inline input for the differential amount ($/hr). Pills turn color on select. Separate amounts per type stored. |
| `otThreshold` | "How is overtime calculated at your job?" | Pill select: **Over 40 hrs/week** · **Over 8 hrs/day** · **Both** | Selecting "Over 8 hrs/day" unlocks a secondary input: daily OT threshold (default 8). App must handle daily OT accumulation logic if this path is chosen. Note to self: finance.js only does weekly OT today — daily OT is a future logic change. |
| `otMultiplier` | "What is your overtime multiplier?" | Pill select: **1.5× (standard)** · **2× (double time)** · **Custom** | Custom expands a number input. Most users will hit 1.5× and move on. |

---

## Deductions / Benefits Fields

| Config Field | Wizard Question | UI Pattern | Notes |
|---|---|---|---|
| `ltd` | Gated behind benefits availability | Benefits gate pill first (see below) | |
| `k401Rate` | Gated behind benefits availability | Benefits gate pill first (see below) | |
| `k401MatchRate` | Gated behind benefits availability | Benefits gate pill first (see below) | |
| `k401StartDate` | Gated behind benefits availability | Benefits gate pill first (see below) | |

**Benefits gate question (shown before LTD / 401k fields):**

> "Does your employer offer benefits?"

- Pill buttons: **Yes, I'm enrolled** · **Yes, but I don't qualify yet** · **No benefits offered**
- **"Yes, I'm enrolled"** → show LTD + 401k fields normally
- **"Yes, but I don't qualify yet"** → show fields with a note: *"You can enter your expected start date and contribution rates now so the app projects them correctly when they kick in. Come back and confirm when enrollment opens."*
- **"No benefits offered"** → skip LTD + 401k entirely; surface a note: *"If that changes, you can model it anytime under the Theoretical tab."*

---

## Tax Rate Fields — Reworked for Multi-User

**Decision (2026-03-24):** The original `w1FedRate / w2FedRate / w1StateRate / w2StateRate` fields were hardcoded to Anthony's specific 4-day/6-day rotating schedule. "Week 1" and "Week 2" mean nothing to any other user. The underlying reality is that withholding rates vary with gross pay (progressive taxation) — not with a named week type.

**New model:**
- Users with consistent hours → single rate pair (`fedRate`, `stateRate`)
- Users with variable/rotating hours → two rate pairs (`fedRateLow`/`fedRateHigh`, `stateRateLow`/`stateRateHigh`)
- Rates are **derived** from a paystub calculator (enter gross + withheld → app computes rate), never manually entered as decimals
- **Paystub is not required at setup.** State rate pre-fills from `STATE_TAX_TABLE` as an estimate. The paystub calculator in Step 4 is skippable — user clicks "Use estimate for now" and continues. Reminders to sharpen rates with a real paystub are surfaced throughout the app post-setup.
- State is captured as `userState` (e.g. `"MO"`) and used to pre-fill the state rate from a lookup table; user confirms against paystub when available

**Deprecated fields** (single-user hardcoded, replaced by generalized shape below):
- ~~`w1FedRate`~~ → `fedRateLow`
- ~~`w2FedRate`~~ → `fedRateHigh`
- ~~`w1StateRate`~~ → `stateRateLow`
- ~~`w2StateRate`~~ → `stateRateHigh`

**New config fields:**

| Config Field | Replaces | What It Is | Wizard Question |
|---|---|---|---|
| `scheduleIsVariable` | *(new)* | True if gross pay changes week to week | "Does your gross pay change week to week?" — pill: **Yes** · **No** |
| `userState` | *(new)* | Two-letter state code for tax lookup | "What state do you live in?" — state dropdown |
| `fedRateLow` | `w1FedRate` | Federal withholding rate on a lighter paycheck | Paystub calculator: enter gross + withheld on a light-week check |
| `fedRateHigh` | `w2FedRate` | Federal withholding rate on a heavier paycheck | Paystub calculator: enter gross + withheld on a heavy-week check |
| `stateRateLow` | `w1StateRate` | State withholding rate on a lighter paycheck | Same paystub as fedRateLow — derived simultaneously |
| `stateRateHigh` | `w2StateRate` | State withholding rate on a heavier paycheck | Same paystub as fedRateHigh — derived simultaneously |

**Notes:**
- If `scheduleIsVariable = false`, only one paystub calculator shown; `fedRateLow === fedRateHigh` and `stateRateLow === stateRateHigh` (stored once, used for all weeks)
- State pre-fill lookup covers all 50 states + flat-rate states (MO, IL, etc.) and graduated states (fallback to paystub-derived only)
- Formula change in `finance.js`: swap `rotation === "6-Day"` check → use `week.grossPay > threshold` or a simpler `week.isHighWeek` flag derived during `buildYear()`

---

## Fields Pending Review

| Config Field | Current Value | What It Is | Wizard Question (draft) |
|---|---|---|---|
| `ficaRate` | 0.0765 | Employee FICA: 6.2% Social Security + 1.45% Medicare. Federal law — same for all W-2 employees below the SS wage cap ($176,100 for 2026). No question needed for target demographic. **Exception:** if pay type gate = self-employed/1099 → override to 0.153 (both halves). Additional Medicare surtax (0.9% above $200k) not applicable at this income level. | Pre-filled at 7.65%, read-only display. Self-employed path auto-sets to 15.3%. No user input required in either case. |
| `fedStdDeduction` | 15000 | Federal standard deduction for 2026 single filer. **All tax math runs off standard deduction — no itemized deduction support in MVP.** Pre-filled and locked; updated annually by app maintainer. User does not need to touch this. Future optional phase planned for users who want to enter full itemized deductions for more accurate projections (see TODO Section 6). | Pre-filled, read-only. Shown as a disclosure line in Step 5: "All projections use the standard deduction ($15,000 for 2026 single filers). If you itemize, your actual tax liability may differ." |
| `moFlatRate` | 0.047 | Missouri flat income tax rate | Pre-filled via `userState` lookup, confirm only |
| `targetOwedAtFiling` | 1000 | Target amount owed to IRS at filing | Personal preference question |
| `taxedWeeks` | [7, 8, 19...] | Which weeks have withholding applied | **Decision (2026-03-24):** Default all active weeks to taxed on first setup. Written to Supabase (not just DEFAULT_CONFIG) as a database field so it's user-specific from the start. The Tax Exempt Gate (Step 8) is what unlocks per-week toggling — until that's built and the user opts in, every week from `firstActiveIdx` onward is taxed. No wizard question needed; auto-populated on wizard completion. |

---

## Attendance Bucket + Heavy/Light Week — DHL Employer Preset Decision

**Decision (2026-03-24):** The heavy/light week rotation, dual withholding rates (`fedRateLow`/`fedRateHigh`), and bucket attendance model are all DHL-specific. They are not general multi-user features. The wizard resolves all three with a single employer preset gate early in setup.

---

### Employer Preset Gate (Step 1, before Pay Structure fields)

> "Do you work for DHL?"

- Pill: **Yes** · **No**
- Stored as: `employerPreset: "DHL" | null`

**If "Yes" (DHL preset activates):**
- `scheduleIsVariable` auto-set to `true` — no question asked
- Step 2 shows a pre-loaded DHL rotation picker: "Which rotation are you currently on — 4-day or 6-day week?" (writes `startingWeekIsHeavy: true | false`)
- Step 4 shows two paystub calculators (light/heavy) as normal for variable users
- Bucket attendance model activates; `bucketStartBalance`, `bucketCap`, `bucketPayoutRate` loaded from DHL preset defaults
- Step 6 attendance policy gate is skipped — DHL users have bucket tracking automatically

**If "No" (standard path):**
- `scheduleIsVariable` defaults to `false`; Step 4 gate asks the hours-vary question normally
- Step 2 asks: "How many hours do you work per week?" — single number, used as the standard week baseline
- Users log deviations weekly (the check-in / weekly confirmation flow handles this for all users)
- Step 6 attendance policy gate shown: "Does your employer have a formal attendance policy (points/hours based)?" — Yes enables simplified bucket tracker; No = log-based history only
- All users get: attendance history view (missed days, monthly trend, day-of-week breakdown) regardless of policy gate answer

**Why this works:**
- Heavy/light week complexity (`startingWeekIsHeavy`, `fedRateLow`/`fedRateHigh` divergence) is confined to the DHL preset — general users never encounter it
- Bucket fields (`bucketStartBalance: 64`, `bucketCap: 128`, `bucketPayoutRate: 9.825`) stay DHL-preset-loaded; not in DEFAULT_CONFIG for general users
- Pattern is extensible: "Do you work at UPS / Amazon warehouse?" presets could follow the same shape if demand exists post-launch

**New config field:**

| Field | Type | Default | Notes |
|---|---|---|---|
| `employerPreset` | `"DHL" \| null` | `null` | Set in Step 1; drives preset branching throughout wizard |
| `startingWeekIsHeavy` | `boolean \| null` | `null` | DHL preset only; `true` = first active week is a 6-day (72hr) week |

---

*Last updated: 2026-03-24 — `taxedWeeks`: default all active weeks taxed, stored in Supabase. Bucket fields + heavy/light week rotation: resolved via DHL employer preset gate in Step 1 (`employerPreset: "DHL" | null`). Standard users: single weekly hours input, log-based attendance. DHL users: rotation picker, dual withholding rates, bucket auto-enabled. Attendance history view added as sprint feature for all users.*
