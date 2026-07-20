# Handoff Prompt — Finish the Drift Warden Spine Passes (A–F)

**You are picking up a nearly-complete investigation.** Ten surgical passes built
`docs/drift-app-warden.md` — the app's drift ledger and the training foundation for a
future mandatory Drift Warden review agent. All ten surface tiers (T1–T10) are mapped.
Your job is the deliberately-saved-for-last closing pass: **Spines A–F**, the six
cross-cutting systems every surface consumes. Spines were written last so every spine
entry's blast radius can point at *finished* surface sections instead of forward
references.

---

## 1. Read these first, in this order

1. **`docs/drift-app-warden.md`** — the whole reason you're here.
   - The **Notation Legend** at the top (D1–D5 drift classes, L/G categories, T-tiers,
     Spines A–F, F-numbering, DW/DW-W queue rows).
   - **§1–§5**: purpose, case law, the two categories, the hierarchy (§4.2 is the
     spine table you're about to expand), and §5 — **the fixed 4-block entry format
     every section follows. Do not deviate from it; the doc is training data.**
   - **§7–§17**: skim every surface section's Block 1 — you will be *reverse-indexing*
     into these F-entries, not rewriting them.
2. **`docs/BUG_FIX_TODO.md`** — the work queue. Top table = confirmed defects DW-1…DW-7
   (DW-7 is the HIGH one: the lifecycle cron never SELECTs `is_tester`, so the tester
   exemption is dead). Second table = watch items DW-W1…DW-W3 (not bugs; each states
   its promotion condition). Archived June content below is a *decision record* —
   Decisions 1–3 govern expense-save semantics; never re-litigate them.
3. **`.claude/CLAUDE.md`** — the "Drift App Warden" section (the mandate), the
   Persistence/eager-save section, Account Tiers, and the SetupWizard quick reference.
4. `docs/active-systems.md` — "what exists" (the warden doc is "what breaks what";
   never duplicate between them — §5's covenant).

---

## 2. Current state (so you don't collide)

- Branch: **`claude/drift-app-warden-structure-24fykc`** — develop, commit, and push
  here. Commit per spine (or per logical group), push immediately after each commit.
- Section numbering: §17 (T10) is the last written section. **Spine sections are
  §18–§23** (A→F in order). Tick each spine off in the §6 checklist as you go
  (the last checklist item covers all spines — split it into six lines when you start).
- Function numbering: **F1–F95 are used. You start at F96.** Numbering never resets;
  it's one running sequence so "F41" is unambiguous doc-wide.
- Queue numbering: **DW-8+ / DW-W4+ are yours.** Keep both tables numerically ordered.
- ~19 doc-drift (D5) corrections were already applied across CLAUDE.md /
  active-systems / code comments during the surface passes.

---

## 3. The process for each spine (proven over ten passes — follow it)

1. **Git history first.** `git log --no-merges --oneline` the spine's files before
   reading code. Newest commits = newest intentions; the map documents what ships
   *today*, not what an old doc says. Several passes caught same-day rewrites this way.
2. **Verify every claim against live code before writing it.** Line anchors are
   `file:line` paired with a greppable symbol name. If a doc says X and code says Y,
   that's a D5 finding — **fix doc drift in the same pass** (the one finding class
   that never goes to the queue).
3. **Write Block 1 function-by-function** — not line-by-line documentation. Each key
   function gets: name · anchor · [L]/[G] tag · one-line invariant · a human-readable
   **IF/THEN** drift check ("IF X changes, THEN check Y — procedure"). This
   anchor+IF/THEN pairing is the owner's explicitly stated philosophy.
4. **Spine-specific shape:** a spine entry should be the *authority record* plus a
   **reverse index** into surface F-entries that already cover its consumers. Example:
   Spine A's `buildYear` entry states the authoritative contract once, then points at
   F5, F25–F29, F67 rather than restating them. New F-entries are for spine-internal
   machinery no surface pass covered (e.g. `buildYear`'s internal stages, `db.js`
   column mapping details, token cascade rules).
5. **Blocks 2–4 as usual:** cross-boundary trigger map · authority table (L-spines)
   or gate matrix (G-spines) · case law + findings.
6. **Findings offload (protocol is codified in §1 of the warden doc):** confirmed
   defect → one `DW-n` row in BUG_FIX_TODO.md (severity, blast radius, fix shape,
   pointer to your Block 4). Watch item → `DW-W-n` row with its promotion condition.
   ⚠ inline marker on the owning F-entry. Same pass, never later.
7. **Commit message:** what the section covers, findings by number, D5s corrected.
   End with the Co-Authored-By/Claude-Session trailer format visible in
   `git log -5`. State which drift-map entries were consulted where relevant.
8. **Honesty norms:** vitest is not installed in these containers (`npm run test:run`
   fails with "vitest: not found") — do not claim test runs you didn't do. Kill-tab
   tests, matrix walks, etc. are procedures you *write for future executors*, not
   things you run. Size any verification to the actual risk (a comment-only edit needs
   a syntax check, not a suite).

---

## 4. Per-spine guidance (what's already covered vs. what you owe)

**Spine A — Fiscal Math [L]** (`finance.js` 40 exports, `fiscalWeek.js`,
`rollingTimeline.js`, `expense.js`, `goalFunding.js`, `jobLossRunway.js`,
`stateTaxTable.js`). Largest spine. Already covered by surfaces: `dateToWeekIdx`/
`firstActiveIdx` (F1), `handleComplete`'s buildYear call (F5), preview pair (F6),
`resolveActiveWeeksThisYear`/`resolvePrevWeekNet` (F13–F15), `taxDerived` (F28), net
tiers (F29), `getEffectiveAmountForMonth` (F38), `calcEventImpact` weekMeta contract
(F57), runway pair (F22/F44 + the F24/DW quarantine). **You owe:** the
`buildYear → computeNet → calcEventImpact → computeGoalTimeline` trunk itself (internal
stages, week-object field contract — the shape a dozen F-entries reference), the
DHL rotation/bucket helpers, `expense.js` conversion helpers, and the master authority
table: every displayed number → its one source function → its surface consumers.

**Spine B — Persistence & Save Integrity [L]** (`db.js`, `useLocalStorage.js`,
`supabase.js`, eager-save pattern, `configHistory.js`, `database/migrations/`).
Heavily covered: T7 (§14) mapped load/save/flush/boot (F63–F68), eager-save wrappers
are F8/F35/F46, config-history watcher is F9/F10. **You owe:** the
`savePersistedStateNow`/debounce/`latestPersistedStateRef` internals in App.jsx +
SaveFailedBanner retry path, `useLocalStorage.js` (never examined!), migration-folder
rules (BOOKMARK convention; next real migration is **025**), and the four-site
new-field checklist as a named procedure (F68 sketched it).

**Spine C — Entitlements & Gating [G]** (`subscription.js`, `entitlements.js`, tier
flags). Mostly covered: `getEntitlement` (F80), enforcement fork (F81), tax plan gates
(F43/F50), tier/RLS checklist (F69), tester division (§23 everywhere, DW-7).
**You owe:** `entitlements.js` itself (`hasTesterAccess` base, the structural-superset
construction — verify the code matches the a643153 claim), and the one-page gate
registry: every gate function → its call sites client and server.

**Spine D — AI Layer & Context Grounding [L]** (`aiContext.js`, `coachPrompts.js`,
`coachFeatureGuide.js`, `coachTriggers.js`, `claude.js`, `api/coach.js`,
`AskCoachPanel.jsx`). Partially covered: trigger chain (F22/F24 + quarantined
`estimateRunwayDays`), DW-5's weekMeta lesson, runwayDays-never-wired gap (§8 Block 4).
**You owe:** `buildCoachContext()` field-by-field — each context line → the
authoritative Spine-A function it must resolve through (the §24 grounding rule is the
whole game here), the privacy rule (goal labels excluded), the server-side gate
re-check in `api/coach.js`, and the dormant `coach_chats` persistence layer
(migration 023, unwired — don't let anyone wire it without a map entry).

**Spine E — Design System & Motion [G]**. **Nearly done** — T10 (§17, F88–F95) *is*
mostly this spine. Your section can be short: the authority statement, a reverse index
to F88–F95, plus anything T10 scoped out (CLAUDE.md's UI standards tables as
enforceable spec, the `docs/authority-design-system` folder if it holds live rules).
Do not pad it — a thin honest spine beats a duplicated one.

**Spine F — Admin Diagnostic Toolkit [G]** (8 Phase-1 tools in `App.jsx`, per-entry
breakdown in LogPanel). Covered piecemeal: Lock Date semantics (F25/F28/DW-2), Reopen
(F32/DW-3), Week Inspector wiring (§9), drift badge (F68), Live Inspector fields
(referenced everywhere). **You owe:** the toolkit as a system — each tool → what it
reads → which F-entries use it as a verification procedure (the toolkit is the Warden's
instrument panel; a broken tool blinds checks doc-wide), plus the Phase-2 isOwner
tools' pre-build warnings (F26 already flags the confirmation-reset landmine).

---

## 5. When all six are done

1. Update the doc's **Status header** (top of drift-app-warden.md) from "Foundation
   pass" to complete, with the date.
2. Final §6 checklist: all boxes ticked.
3. Skim CLAUDE.md's Drift App Warden section — update if the spine passes changed
   anything it asserts.
4. Final commit + push. The owner reviews per-commit; you do not open a PR unless
   asked.

The owner (Anthony) works in short sessions and reads your commit messages — make them
carry the findings. When in doubt between thorough and honest: honest. The doc's value
is that every line in it has been verified against the code it describes.
