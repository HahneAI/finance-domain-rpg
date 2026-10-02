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

*No runs yet. The first shotgun coding run's entry goes directly below this line.*

<!-- NEW ENTRIES GO HERE, NEWEST FIRST -->
