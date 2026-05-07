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

**Open question:** Where is the -$4,700 displayed (Home panel card, Budget trend label)? Needed to identify which calculation produces it.

**Missing data:** Expenses not in config JSON — required to evaluate whether spend vs. income math explains the negative trend.

---

## Step 3 — DB Row Viewer *(pending)*

**Tool:** Tools sheet → DB Row → Fetch

**Looking for:** `expenses`, `goals`, drift columns, `updated_at`

---

## Step 4 — Week Inspector *(pending)*

**Tool:** Income panel → tap Week 18 row

**Looking for:** Pay section (gross, deductions, net), Net Lookup, Log Entries
