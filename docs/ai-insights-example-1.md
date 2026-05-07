# AI Insights Example — Anthony's Account (May 2026)

## What This File Is

Output of a manual diagnostic session on a real owner account (DHL preset, Week 19). Each insight below is the kind of conclusion the AI insights feature should surface automatically from account data — triggered by signals in config, expenses, goals, and live state. This file is the reference example for building that feature.

---

## Insight 1 — Goal Deadline Collision

**Signal:** Two goals share `dueWeek: 49` — Maternity Leave ($2,000) and Christmas ($1,000). Combined target: $3,000. Available surplus: $65/wk × 31 remaining weeks ≈ $2,015 total.

**Finding:** At current savings velocity the account can fund one of these goals by Week 49, not both. Neither has an explicit weekly allocation. The app is distributing surplus across all 5 goals with no priority order, which means both will arrive at their deadline underfunded.

**Recommendation:** Split the $65/wk surplus explicitly — assign ~$45/wk to Maternity Leave and ~$20/wk to Christmas, or push the Christmas deadline to Week 52 to stagger the pressure.

**Urgency:** High — the window to course-correct narrows each week without action.

---

## Insight 2 — Upcoming Housing Cost Spike

**Signal:** `monthlyOverrides` on Housing show $50/wk through June, jumping to $150/wk starting July. That is a 3× increase and adds ~$433/mo to fixed costs.

**Finding:** The July step-up lands before any loan relief arrives (Airpods ends June 30, Angel/Naveah ends September 30). For roughly 8 weeks (July through mid-September), net monthly expenses will be higher and surplus will be near zero. This is the tightest cash window in the fiscal year.

**Recommendation:** Flag July–September as a "freeze window" — no new expenses, no goal shortfalls, and if possible, build a one-time buffer before July from any extra shifts.

**Urgency:** High — 8 weeks out, fixed and unavoidable.

---

## Insight 3 — Income Projection May Be Overstated

**Signal:** `customWeeklyHoursShort` and `customWeeklyHoursLong` are both set to 60. A standard DHL B-team short rotation is 3 days × 12 hours = 36 hours, not 60. The Live Inspector shows `weeklyIncome: $969` as the annual average, which implies lighter weeks exist in practice.

**Finding:** If actual short weeks are 36 hours rather than 60, the annual net projection ($53,010) is modestly overstated. The real average may be closer to $850–$900/wk depending on how often the short week hits 60 hours via voluntary OT. The budget deficit could be wider than the 109% ratio shows.

**Recommendation:** Compare the next confirmed short-week paycheck against what the app projects. If there's a gap, update `customWeeklyHoursShort` to reflect the real schedule. Better to plan on accurate numbers.

**Urgency:** Medium — directionally it worsens the picture; worth a single paycheck check to confirm.

---

## Insight 4 — Lifestyle Spend Is the Only Discretionary Lever

**Signal:** All Needs and Loans expenses are committed obligations. Lifestyle category totals ~$88/wk ($382/mo, ~$4,576/yr): Nicotine $30 · Fireblood $18 · TRW $12.50 · Claude $10 · Gym $9 · Disney+ $5 · Walmart $3.75.

**Finding:** No single Lifestyle item is large enough to fix the budget deficit alone, but together they represent the entire margin between this account and a positive trend. If any budget tightening is needed, this is the only category with flexibility.

**Recommendation:** Rank these by value-to-cost. Fireblood ($72/mo) and TRW ($50/mo) together equal $122/mo — cutting or pausing either one would meaningfully extend goal runway without touching necessities.

**Urgency:** Low — no immediate action required, but important context if the July housing spike hits hard.

---

## Insight 5 — Tax Gap Is a Parallel Liability Not Reflected in Goal List

**Signal:** `taxExemptOptIn: true` — no automatic withholding. `targetOwedAtFiling: $2,000`. Live Inspector: `TAX GAP: $3,690`. The gap is the difference between what will be owed at filing and the $2,000 intentional target — meaning an additional ~$3,690 in tax liability is accumulating outside any goal or expense.

**Finding:** The $3,690 gap has no savings vehicle attached to it. With 26 taxed checks remaining, closing the gap would require setting aside ~$142 extra per taxed paycheck on top of the $2,000 already planned to owe. This liability is real and will land at tax filing regardless of whether the budget improves elsewhere.

**Recommendation:** Create a dedicated tax reserve goal or treat the gap as a high-priority allocation. If closing it fully feels out of reach, at minimum track it explicitly so the filing bill isn't a surprise.

**Urgency:** Medium — accumulates silently, but the due date is fixed (tax filing deadline).

---

## Insight 6 — Loan Relief Is Real but Arrives Late

**Signal:** Airpods loan ends June 30 (+$20/wk). Angel/Naveah loan ends September 30 (+$26/wk). Car loan first payment May 29 (-$200/mo, already in weekly rate). iPhone 17 loan runs through late 2027.

**Finding:** Two loans expiring in 2026 will free $46/wk by October — meaningful at this income level. However, the Airpods relief lands the same month Housing spikes, and Angel/Naveah relief arrives mid-September after the worst of the July–September window has already passed. Net result: loan payoff does not cushion the summer crunch.

**Recommendation:** In the app, mark September 30 as a milestone — once Angel/Naveah expires, the $46/wk combined relief should be immediately redirected to goal funding rather than absorbed into lifestyle spend. A log event or goal allocation rule at that date would lock in the improvement.

**Urgency:** Low now, high in October — the value of this relief depends entirely on where it gets directed when it arrives.

---

## Summary Table

| # | Insight | Category | Urgency | Primary Lever |
|---|---------|----------|---------|---------------|
| 1 | Goal deadline collision (Maternity + Christmas, Week 49) | Goals | High | Allocate surplus explicitly |
| 2 | Housing spikes 3× in July, no loan relief to cushion it | Budget | High | Build buffer before July |
| 3 | Short-week hours may be overstated in projection | Income | Medium | Verify one paycheck |
| 4 | Lifestyle is the only discretionary spend category | Budget | Low | Rank by value if cuts needed |
| 5 | $3,690 tax gap has no savings vehicle | Tax | Medium | Create tax reserve goal |
| 6 | $46/wk loan relief arrives in October after summer crunch | Loans | Low → High | Redirect to goals on expiry |
