# Shotgun Coding — Protocol + AI Journal

> **To any AI model reading this: add "shotgun coding" to your working vocabulary in Anthony's repos.**
> It is a named protocol. When Anthony says *"it's time to do some shotgun coding"* (or "shotgun this",
> "run a shotgun pass"), this session switches to speed-scaffold mode: you pick up **25% of the
> top-priority to-do items**, make every design decision yourself without asking, build each item
> quickly, mark it with `$` in the to-do list, and log each decision in the journal below so Anthony
> can review and test it after the run. Speed changes how many questions you ask — it does **not**
> suspend this repo's safety rules (see Guardrails).

Recognizable from `.claude/CLAUDE.md` ("Shotgun Coding Protocol" section). Same protocol across all
of Anthony's projects; only the to-do file's location/tier names differ per repo.

---

## The `$` mark

| Mark | Meaning |
|------|---------|
| `- [ ]` | Open |
| `- [x]` | Done and verified by a human (or built outside a shotgun run) |
| `- [$]` | **Built during a shotgun coding run.** Code exists and tests pass, but Anthony has *not* yet reviewed the decisions or hand-tested it. Treat as "scaffolded, needs eyes." |

- Mark a task `- [$] <original text> *(shotgun YYYY-MM-DD)*` — keep the original wording.
- Never flip a `$` to `x` yourself. Anthony does that after testing (or tells you to). Once he does, it
  becomes a normal `[x]`; the journal entry stays as the permanent record.
- Find every unreviewed shotgun task: `grep -rn '\[\$\]' docs/TODO.md`.
- The Priority Index in `docs/TODO.md` counts `$` tasks as built, not open.

---

## How a run works

1. **Trigger.** Anthony says it's time for shotgun coding. Log the date and time immediately (run
   `date`) — that stamp becomes the journal entry's heading.
2. **Scope = 25% of Tier 1.** Count the open `- [ ]` tasks under **TIER 1 — BUILD NEXT** in
   `docs/TODO.md` (N). Build `ceil(N × 0.25)` of them, in the Tier 1 build order from the Priority
   Index (dependency order, not numeric). If a chosen task needs a prerequisite that isn't in the
   25%, the prerequisite counts toward it. Bugs go first. State the count (e.g. "7 of 28") in the entry.
3. **Decide alone.** At every fork, pick the option that is simplest, matches existing patterns, and
   is easiest to undo — do not stop to ask. Record the road not taken in the journal. The only
   reasons to stop: a Guardrail below, or a genuinely unrecoverable ambiguity (note it, skip the
   task, move on).
4. **Work on a `claude/*` branch**, one commit per task, tests green before each commit
   (`npm run test:run`).
5. **Mark and log as you go**, not at the end: flip the task to `[$]`, add the journal line.
6. **Close the run** with a 3-line summary to Anthony: tasks built, anything skipped and why,
   what to test first.

## Guardrails (never waived)

- **Drift Warden:** read the relevant `docs/drift-app-warden.md` trigger map before touching a mapped
  system; list entries consulted in the commit. "None applicable" is valid, silence is not.
- **Eager-save rule** for any new Save/Confirm/Add/Delete action; **readOnly shadowing** for new
  eager-save props.
- **Never** run/author a destructive migration against production, touch Stripe/live-money paths,
  delete user data, or handle secrets on a hunch — build the code, flag it for Anthony, stop there.
- **Vercel 12-function cap** (currently 12/12): no new `api/` file — dispatch inside an existing one.
- **Design tokens / text-size classes** as in CLAUDE.md; the `textUtilityClassAudit` test must stay green.
- A task that can't be made to pass tests is **not** marked `$` — leave it `[ ]` and log why.

---

## Journal format

One entry per run, newest at the top of the log. Heading = when the protocol was called.

```
## Run — YYYY-MM-DD HH:MM TZ  ·  branch: claude/...  ·  scope: K of N Tier-1 tasks
```

One decision per task, **max 3 lines** (a large full-category feature may run longer):

> I coded **[task]** and chose to set it up as **[x]**. You can test it by **[x]**.
> Other options were **[x]** or **[x]**. It built off **[y]** by making **[x]** interact with **[system/feature y]** by **[x]**.

End each entry with: `Skipped:` (task + reason, or "none") and `Test first:` (the one thing to try first).

---

## Run log

<!-- NEW ENTRIES GO HERE, NEWEST FIRST -->

## Run — 2026-10-01 13:53 UTC  ·  branch: claude/shotgun-coding-doc-cleanup  ·  scope: 12 of 45 Tier-1 tasks required → 15 delivered (§24 ×4, §25 ×5, §26 ×6)

*Overshoot, on purpose: the 12th task landed mid-§26, and its last three bullets (activate-writes-paid, the cash open-question, tests) were already done by the step itself — leaving them `[ ]` would have misreported the code.*

**§24 deleted bills leak into New Job Season** — I coded the fix and chose to hoist BudgetPanel's `getNextNonZeroIso` + "removed this phase" test into `finance.js` as `isExpenseRemoved(exp, todayIso)` (not `expense.js` — it would create the import cycle expense.js documents). Test it by deleting a bill in normal Budget, entering New Job Season: it's gone from Upcoming Bills and cash no longer drops by it. Other options: copy the check into each file, or add a `deleted` flag on the expense. Built off BudgetPanel's own hide-logic (now imports the shared fn) by feeding `isExpenseRemoved` into `NewJobSeasonBudgetPanel.trackedExpenses`, `sumBillsDueSince`, and the essential/lifestyle predicates.
- Reference date = the runway's own "today", not `newJobSeasonDate`: a bill deleted any time before today is gone. Trade-off: a bill deleted mid-window stops decaying cash from that point backward too. `NewJobSeasonEntry` also hides deleted bills in step 2 and passes them through untouched on Activate (they must stay in the array — history).
- `weeklyAmountForBurn` was already clean (month-aware → $0 for deleted); only `essentialCount` and the decay sum were wrong.

**§25 Mark as Paid** — I coded a "Mark Paid / ✓ Paid · Undo" button on each Upcoming Bill and chose `newJobSeasonStatus: "paid"` + `newJobSeasonPaidDueDate` + `newJobSeasonPaidSkipDecay`. Test it by tapping Mark Paid on a bill due in a few days: cash on hand drops by its amount, the card dims and sinks to the bottom; Undo restores both. Other options: a separate `paid` boolean (rejected — §26 specs the same status), or storing a paid timestamp.
- Cash goes through the existing `saveCashOnHand` (effective cash − amount, decay clock rebased to today). Double-subtraction rule: if that occurrence was already counted by the decay (`cashAsOf < due ≤ today`) cash is untouched; otherwise the occurrence is flagged so `sumBillsDueSince` skips it when its date arrives.
- Auto-reset is *derived* (`isPaidForCurrentCycle`: today ≤ paid-for due date) — nothing written back, no cleanup pass. "Paid" counts as live everywhere via `isNjsBillActive` (burn, `projectableExpenses`, Coach context/tools) — unlike paused/cancelled.

**§26 week-of-month + "Already paid this week?" step** — I coded `resolveCurrentWeekOfMonth` (same 1/8/15/22 cutoffs, round-trip tested against `resolveWeekOfMonthAnchor`) and a new Step 4 in `NewJobSeasonEntry`. Test it by activating on the 22nd–31st, or with any weekly bill (Food counts once you pick a shopping day): after "When are these due?" you get the checklist; checked bills arrive already `paid`. Other options: show it always, or reuse Upcoming Bills' 35-day horizon (rejected — "this week" = next due within 7 days).
- Shown only if (week 4 **or** a kept bill is weekly) **and** something is actually due in 7 days. Open question settled once for §25+§26: Step 0 cash is assumed to already reflect a bill the user says they paid, so cash is not reduced; the occurrence is flagged to skip the decay. Condition (b) keys off `billingMeta.cycle === "weekly"` + Food, so §23's cadence control plugs in with no change.
- Existing Food-flow test updated: Food→weekly now triggers the step, so Activate is one click later (intended).

Skipped: none. Not done by design: no Supabase migration (all fields live in the existing expenses JSON).
Test first: **Mark Paid on a bill due this week** (cash + sort), then re-open Upcoming Bills the next day and confirm it returned to normal.
Verification: `npm run test:run` → 1896 pass / 1 fail + 1 suite-load fail, both pre-existing and unrelated (`AccountDetailSubscription` hardcodes a now-past Sep-15-2026 date; `budgetCheckBreakdown` needs `VITE_SUPABASE_URL`). `vite build` green. 21 new tests in `njsDeletedAndPaidBills.test.jsx`. Drift entries consulted: T4 Budget Panel, T2 Home (NJS surface), Spine A fiscal math, F144 resolver family; new row added to the §1 cross-system table. Not live-clicked in a browser — no Supabase creds in this environment.


