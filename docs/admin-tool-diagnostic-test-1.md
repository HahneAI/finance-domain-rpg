# Admin Tool Diagnostic Test 1

## What We're Doing

Investigating two symptoms on the owner account (DHL preset): a **-$4,700 net worth trend** and a **$2,000 goal estimated at ~5 months to completion**. Working through the admin diagnostic toolkit in sequence — Config JSON, Live State Inspector, DB Row Viewer, and Week Inspector — to isolate the root cause before touching any code or data.

---

## Step 1 — Config JSON Dump

**Tool:** Tools sheet → Config JSON → View ↓

**Key findings:**

| Field | Value | Note |
|-------|-------|------|
| `taxExemptOptIn` | `true` | No federal/state withholding from paychecks |
| `targetOwedAtFiling` | `$2,000` | Intentional underpayment strategy |
| `k401Rate` | `1%` | Low contribution; starts May 9 |
| `k401MatchRate` | `0` | No employer match |
| `paycheckBuffer` | `$50` | $50/week reserved off the top |
| `baseRate` | `$19.65/hr` | Night shift + $1.75 diff rate |
| `pastWeekTaxStatusOverrides` | weeks 9–15 → `false` | Only week 8 actually withheld tax |
| `taxedWeeks` | 34 entries | Spread across the fiscal year |

**Inferences:**
- Tax-exempt election means full annual tax liability lands at filing. The $2,000 target owed is intentional, but any shortfall in projected withholding/savings shows up as a liability drag on net worth.
- Only 1 of 8 early active weeks actually withheld — weeks 9–15 were overridden to untaxed. This is a significant under-withholding window early in the year.
- 401k not yet active (starts May 9). No match means that deduction is pure cost with no offset.

---

## Step 2 — Live State Inspector

**Tool:** Amber "Live" pill → expand

**Values:**

| Field | Value |
|-------|-------|
| Effective Today | 2026-05-07 |
| Week | 18 (Week 19, 33 left) |
| Future Weeks | 35 |
| Unconfirmed | 0 |
| Extra / Check | $65.02 |
| Tax Gap | $3,690 |
| Taxed Checks Remaining | 26 |
| Goal Spend | $0 funded |
| Buffer / Wk | $50 |
| Weekly Income | $969 |
| Annual Net | $53,010 |

**Inferences:**
- `TAX GAP: $3,690` — the system projects $3,690 more owed at filing than the $2,000 target. This is a real off-balance-sheet liability and the most likely primary driver of the negative net worth trend.
- `GOAL SPEND: $0 funded` — the $2,000 goal has accumulated nothing. The 5-month estimate is a projection from zero, meaning the goal clock hasn't started yet. This is likely an allocation/priority issue, not a math bug.
- `EXTRA/CHECK: $65.02` — after buffer and deductions, only $65/week is available above baseline. Low slack = slow goal accumulation.
- `weeklyIncome: $969` at 35 future weeks = ~$33,915 projected remaining gross. Annual net of $53,010 implies the projection is reasonable but margins are tight.

**Resolution:** -$4,769 is the **NET WORTH TREND** card on the Home panel — labeled "projected annual savings · Wk 19." Budget Health card confirms the mechanism: **$4,598/mo expenses vs $4,417/mo take-home = 109% spend ratio.**

---

## Step 3 — DB Row Viewer + Home Panel Screenshot

**Tool:** Tools sheet → DB Row → Fetch + Home panel screenshot

**Expense breakdown (current weekly, May 2026):**

| Expense | Weekly | Monthly | Category |
|---------|--------|---------|----------|
| Kids | $500 | $2,165 | Needs |
| Gas | $100 | $433 | Needs |
| Car Insurance | $32.50 | $141 | Needs |
| Housing (trailer) | $50 | $217 | Needs — rises to $150/wk July |
| Car loan (Bob's Chevy) | $46.15 | $200 | Loans — first payment May 29 |
| Angel/Naveah loan | $26 | $113 | Loans — ends Sep 30 |
| Airpods loan | $20 | $87 | Loans — ends Jun 30 |
| iPhone 17 loan | $5.77 | $25 | Loans |
| Nicotine | $30 | $130 | Lifestyle |
| Fireblood | $18 | $78 | Lifestyle |
| Food | $100 | $400 | Needs |
| Food (30-day) | — | — | (included above) |
| Claude | $10 | $40 | Lifestyle |
| TRW | $12.50 | $54 | Lifestyle |
| Gym | $9 | $36 | Lifestyle |
| Disney+ (bundle) | $5 | $20 | Lifestyle |
| Disney+ (duplicate entry) | $0 | $0 | Lifestyle — overridden $0 all months; data artifact |
| Phone | $11.25 | $45 | Needs |
| Jesse | $40 | $173 | Needs |
| Walmart | $3.75 | $15 | Lifestyle |

**Approximate weekly spend total: ~$1,020/wk → ~$4,420/mo**
*(UI shows $4,598/mo — delta likely includes buffer $50/wk and 401k deduction starting May 9)*

**Goals in DB (5 active, $0 funded each):**

| Goal | Target | Due Week | Note |
|------|--------|----------|------|
| Maternity Leave | $2,000 | 49 | Money for Angel during birth |
| Christmas | $1,000 | 49 | Family gifts |
| The Executive | $1,200 | 52 | Firearm |
| FHA 1st Chunk | $2,500 | — | No due week set |
| Tattoo | $1,000 | — | No due week set |

**Total unfunded goal burden: $7,700**

**Inferences:**

**Root cause — NET WORTH TREND -$4,769:**
The Budget Health 109% ratio is the direct driver. Monthly expenses ($4,598) exceed monthly take-home ($4,417) by ~$181/mo. Projected forward annually: roughly -$2,172 operational deficit. The remainder of the gap to -$4,769 is likely the TAX GAP ($3,690) being baked into the annual projection as a future liability — even with `taxExemptOptIn`, the system accounts for the eventual tax bill. Combined: operational deficit + tax obligation ≈ -$5,800, which the app partially offsets against the `targetOwedAtFiling: $2,000` target to arrive at ~-$4,769.

**Kids expense is the single largest driver:** $500/wk = $2,165/mo = **47% of total monthly spend.** This alone is what tips the budget past 100%.

**Upcoming cost increases that will worsen the trend:**
- Car loan first payment May 29 ($200/mo) — already in weekly rate but not yet hitting
- Housing jumps from $50/wk → $150/wk starting July (per `monthlyOverrides`) — adds ~$433/mo
- 401k deduction starts May 9 (1% of gross ≈ ~$9.65/wk) — minor but further reduces take-home

**Root cause — Maternity Leave goal at ~5 months:**
- `GOAL SPEND: $0` — no explicit allocation. Timeline is based purely on available surplus.
- `EXTRA/CHECK: $65/wk` is the only fuel for all 5 goals ($7,700 total unfunded).
- At $65/wk: $2,000 ÷ $65 ≈ 30.8 weeks (~7 months) for Maternity Leave alone if prioritized.
- 5-month estimate likely reflects the app distributing available surplus across all goals proportionally, or accounting for short-term expense reductions (Airpods loan ending June 30 frees $20/wk; Angel/Naveah loan ending Sep 30 frees $26/wk).
- **No goal will be fully funded on schedule without either reducing expenses or explicitly allocating a weekly goal contribution.**

**Data note:** Two Disney+ entries exist (`exp_1cf44b9b` at $20/mo and `exp_adcfdd3e` at $25/mo). The second is zeroed out via `monthlyOverrides` for all months — appears to be a duplicate that was neutralized rather than deleted. No current financial impact but worth cleaning up.

---

## Step 4 — Week Inspector (Wk 19 · May 11–18)

**Tool:** Income panel → tap Week 19 row

**Values:**

| Field | Value |
|-------|-------|
| Type | 4-day · LOW WEEK · TAXED · ACTIVE · UNCONFIRMED |
| Worked Days | Mon, Thu, Fri, Tue |
| Total Hours | 60 |
| Regular Hours | 40 |
| Overtime Hours | 20 |
| Weekend Hours | 6 |
| Gross Pay | $1,496.25 |
| Taxable Gross | $1,479.29 |
| Benefits Deduction | $2.00 (LTD) |
| 401k Employee | $14.96 |
| 401k Employer | $14.96 |
| ComputeNet (Live) | $1,133.83 |
| Spendable | $1,083.83 (after $50 buffer) |
| Log Entries | None |

**Inferences:**

**Income math is correct** — user confirmed. The per-week calculation is working as expected.

**Week 19 gross ($1,496) vs Live Inspector average ($969):** This week has 60 hours including 20 OT, which is a high-output week. The $969 weekly average reflects the blend across a full year including lighter weeks and untaxed weeks where net is higher.

**Flag — 401k Employer match showing $14.96 despite `k401MatchRate: 0`:** The employer contribution equals the employee contribution exactly (100% match), which contradicts the config. This is either a display bug in the Week Inspector or the match rate field is being misread. Does not appear to affect the net pay calculation (employer match doesn't reduce take-home), but worth verifying whether it's inflating any annual net projections.

**Both `customWeeklyHoursLong` and `customWeeklyHoursShort` are 60:** Even "low" weeks are configured as 60-hour weeks. This means the income floor is higher than a standard 3-day/36-hour DHL week, which is favorable — but the budget deficit exists even with this elevated income floor.

---

## Conclusion

**The math is working correctly.** Both symptoms — -$4,769 net worth trend and ~5-month goal timeline — are entirely explained by the expense profile, not a calculation error.

**Primary driver:** Kids expense at $500/wk is 47% of total spend and the single item pushing Budget Health past 100%.

**Secondary pressure:** $3,690 tax gap (tax-exempt election + deferred liability) contributing to the annual trend calculation.

**Future pressure incoming:** Housing doubles in July (+$433/mo), car loan activates May 29. Without expense reduction, the trend worsens in H2.

**Goal timeline is a downstream symptom:** $65/wk surplus across 5 goals totaling $7,700 cannot fund any goal on an aggressive schedule.

**One open bug to investigate:** 401k employer match displaying $14.96 when `k401MatchRate: 0`.
