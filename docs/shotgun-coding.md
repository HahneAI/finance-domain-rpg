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

**One decision block per shipped feature. Hard cap: 5 lines of prose, plus a 3–4 item test checklist
(the checklist does not count toward the 5). No exception for big features — if it won't fit, the
decision was too big to log in one block; split it into two.** Each prose line is one sentence.

```
### §N <short task title>
1. Built: <what you coded>.
2. Chose: <how you set it up — the decision>. 
3. Other options: <x> / <y>.
4. Built off: <system/feature y> by making <x> interact with it by <how>.
5. (optional) Trade-off or risk worth remembering.
- [ ] Test: <step Anthony can do in the app, with the expected result>
- [ ] Test: ...
- [ ] Test: ...            (3–4 checklist items; tick them off as you verify)
```

Lines 1–4 are the original "I coded X and chose Y / other options / built off Z" note, split so each
fits on one line. Checklist items are real click-through steps (or one command), not "tests pass".

End each run with a **footer of at most 3 lines**: `Skipped:` (task + reason, or "none") ·
`Verification:` (suite/build/lint result in one line) · `Drift entries consulted:`.

---

## Run log

<!-- NEW ENTRIES GO HERE, NEWEST FIRST -->

## Run — 2026-10-01 14:49 UTC  ·  branch: claude/shotgun-coding-doc-cleanup  ·  scope: 8 of 30 open Tier-1 tasks (§23 ×5, §20 ×3)

### §23 Per-bill weekly/biweekly cadence (New Job Season wizard)
1. Built: a cadence row on each bill in the wizard's due-date step; Weekly/Biweekly swap the date picker for an amount-per-payment box plus a "paid on" weekday.
2. Chose: three pills only (Monthly/as entered, Weekly, Biweekly) and a **permanent** correction to the bill, not New-Job-Season-only.
3. Other options: a full four-cycle dropdown / storing the cadence only for the wizard.
4. Built off: Budget's "Month+ Onward" save (`applyMonthEditForward`) via new `applyCadenceCorrection`, so every cost reader sees the new weekly amount; weekly bills also feed the "already paid" step.
5. Trade-off: biweekly anchors on the next chosen weekday, so which alternate week is "week 1" is the user's first payment.
- [ ] Test: Quit My Job with a $1,000/mo bill → pick Weekly, $500, Friday → Activate; Budget shows $500/week.
- [ ] Test: pick Weekly, then switch back to "Monthly / as entered" → the normal date picker returns and the bill is unchanged.
- [ ] Test: Weekly with no amount or no day → Activate stays disabled and shows the required hint.

### §20.A Optional per-expense due date
1. Built: an optional "Due date" row (Set / Change / Clear) in Budget's bill detail sheet.
2. Chose: reuse the existing `dueDateAnchor` field — no new schema, no migration; undated bills behave exactly as before.
3. Other options: a day-of-month field / a new `dueDate` object inside `billingMeta`.
4. Built off: the New Job Season due-date picker, so a date set in either place shows in both (`getNextDueDate` reads it).
5. Loans and read-only accounts don't show the row; not asked in the setup wizard.
- [ ] Test: open a bill's sheet → Set → "3rd week of month" → Save; the row reads "Next due …".
- [ ] Test: Clear removes it and the bill goes back to undated.
- [ ] Test: the date also appears on that bill in New Job Season Upcoming Bills.

### §20.B1 "This week's actual" spend rule (math only)
1. Built: `computeThisWeekActualSpend` in `finance.js`; nothing in the UI calls it yet (that is §20.B2).
2. Chose: hybrid — dated bills count what truly falls due that week, undated bills count their averaged weekly share.
3. Other options: show it only when every bill is dated (rarely triggers) / ignore undated bills.
4. Built off: `getExactEffectiveAmountForMonth`, the same figure `computeRemainingSpend` uses, so it can't become a third formula.
5. Returns `null` until at least one non-loan bill has a due date; loans always count as dated.
- [ ] Test: unit tests only for now — `njsCadenceAndDueDates.test.jsx` ("hybrid rule" block) passes.
- [ ] Test: with no bill dated, the function returns `null` (the "returns null" unit test).
- [ ] Test (when B2 lands): set a date on one bill; the actual figure appears and differs from the averaged one.

Skipped: none (B2–D and any migration are out of scope by design).
Verification: 1909 tests pass / 1 fail + 1 suite-load fail (both pre-existing); `vite build` green; lint at baseline.
Drift entries consulted: T4 Budget Panel, NJS surface, Spine A fiscal math, F150 (untouched).

## Run — 2026-10-01 13:53 UTC  ·  branch: claude/shotgun-coding-doc-cleanup  ·  scope: 12 of 45 Tier-1 tasks required → 15 delivered (§24 ×4, §25 ×5, §26 ×6)

*Overshoot on purpose: §26's last three bullets were already done by the step itself, so leaving them `[ ]` would have misreported the code.*

### §24 Deleted bills leaking into New Job Season
1. Built: deleted bills no longer reach Upcoming Bills, the tracked-bills list, cash-on-hand decay, or the bill count.
2. Chose: one shared `isExpenseRemoved(exp, today)` in `finance.js`, judged "as of today" (not the activation date).
3. Other options: copy BudgetPanel's check into each file / add a `deleted` flag on the expense.
4. Built off: BudgetPanel's own "removed this phase" test, now imported from `finance.js`; the wizard also hides deleted bills but passes them through untouched on Activate.
5. Trade-off: a bill deleted mid-window stops decaying cash from that point backward too.
- [ ] Test: delete a bill in normal Budget, then enter New Job Season → it is absent from Upcoming Bills and tracked bills.
- [ ] Test: cash on hand no longer drops by the deleted bill when its old due date passes.
- [ ] Test: Quit My Job step 2 doesn't offer the deleted bill.

### §25 Mark as Paid
1. Built: a "Mark Paid / ✓ Paid · Undo" button on each Upcoming Bill; paid bills dim and sink to the bottom.
2. Chose: `newJobSeasonStatus: "paid"` plus `…PaidDueDate` and `…PaidSkipDecay`; the paid state resets itself after the due date (derived, never written back).
3. Other options: a separate `paid` boolean / a stored paid timestamp.
4. Built off: the Cash On Hand save path — marking paid takes the amount out of effective cash once, and the flag stops the decay subtracting it again.
5. "Paid" counts as a live bill everywhere (`isNjsBillActive`: burn, projections, Coach), unlike paused/cancelled.
- [ ] Test: tap Mark Paid on a bill due this week → cash drops by its amount once; the card dims and sinks.
- [ ] Test: tap Undo → cash comes back and the bill returns to its place.
- [ ] Test: next day, the bill is back to normal; its due date passing doesn't subtract it a second time.

### §26 Week-of-month detection + "Already paid this week?" step
1. Built: `resolveCurrentWeekOfMonth` and a new step 4 in the Quit My Job wizard listing bills due in the next 7 days.
2. Chose: show it only if it's week 4 **or** a kept bill is weekly, and something is actually due; checked bills arrive already `paid`.
3. Other options: always show it / reuse Upcoming Bills' 35-day horizon.
4. Built off: the picker's own 1/8/15/22 cutoffs (round-trip tested) and §25's paid state; Step 0 cash is assumed to already reflect paid bills, so it isn't reduced.
5. The Food-flow test changed: Food→weekly now triggers the step, so Activate is one click later (intended).
- [ ] Test: activate on the 22nd–31st (or with a weekly bill) → the step appears; check a bill → it lands as Paid.
- [ ] Test: activate on the 3rd with only monthly bills → no extra step.
- [ ] Test: nothing due in 7 days → step skipped even in week 4.

Skipped: none (no Supabase migration needed).
Verification: 1896 tests pass / 1 fail + 1 suite-load fail (pre-existing); `vite build` green; 21 new tests.
Drift entries consulted: T4 Budget Panel, T2 Home (NJS surface), Spine A fiscal math, F144.
