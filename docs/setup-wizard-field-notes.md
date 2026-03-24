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

## Fields Pending Review (start here next session)

| Config Field | Current Value | What It Is | Wizard Question (draft) |
|---|---|---|---|
| `w2FedRate` | 0.1283 | Federal withholding rate on Week 2 (higher-tax week) | Paystub calculator: enter withheld + gross, app derives rate |
| `w2StateRate` | 0.040 | MO state withholding rate on Week 2 | Same paystub calculator flow |
| `w1FedRate` | 0.0784 | Federal withholding rate on Week 1 (lower-tax week) | Second paystub calculator |
| `w1StateRate` | 0.0338 | MO state withholding rate on Week 1 | Same |
| `ficaRate` | 0.0765 | FICA — Social Security + Medicare (7.65% federal law) | Pre-filled, confirm only |
| `fedStdDeduction` | 15000 | Federal standard deduction for 2026 single filer | Pre-filled for 2026, allow override |
| `moFlatRate` | 0.047 | Missouri flat income tax rate | Pre-filled, confirm only |
| `targetOwedAtFiling` | 1000 | Target amount owed to IRS at filing | Personal preference question |
| `taxedWeeks` | [7, 8, 19...] | Which weeks have withholding applied | Auto-derived from firstActiveIdx + rotation — user confirms list |
| `bucketStartBalance` | 64 | Attendance bucket starting hours | HR policy question |
| `bucketCap` | 128 | Max bucket before overflow pays out | HR policy question |
| `bucketPayoutRate` | 9.825 | $/hr for overflow hours | Auto-derived (baseRate ÷ 2) — read-only display, no question |

---

*Last updated: 2026-03-19 — Reviewed through k401StartDate. Resume at w2FedRate.*
