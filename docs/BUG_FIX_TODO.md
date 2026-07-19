# Bug Fix To-Do

**Repurposed 2026-07-19:** this file is now the standing **bug intake for Drift App
Warden passes** (`docs/drift-app-warden.md` — see its "Findings offload" section).
Every open code defect a drift pass surfaces gets one entry here; the warden doc keeps
the full analysis, this file is the work queue. Entries link back to their warden
section rather than duplicating the write-up.

> Status legend: ✅ confirmed by code reading · 🔶 suspect, needs live-data confirmation

---

## Open — Drift Warden findings

| # | Finding | Where | Severity / blast radius | Warden entry |
|---|---------|-------|------------------------|--------------|
| DW-1 | ✅ **Quick Rate Update doesn't eager-save the live rate.** `onActivate` sets `config.baseRate` via bare `setConfig` — no `savePersistedStateNow` — so the live rate rides the 800ms debounce. The `account_history` row + optimistic `baseRateHistory` append ARE safe, so week math survives a lost write after reload, but live `config.baseRate` (ProfilePanel display, wizard previews) can silently revert. Cheap fix: mirror `JobLossEntry.onActivate`'s compute-then-eager-save shape. | `App.jsx:3404–3407` | Soft-D3 · any user running Quick Rate Update on mobile | `drift-app-warden.md` §7.4 finding 1 (T1 pass) |
| DW-2 | ✅ **`taxDerived` memo has a stale dep under admin Lock Date.** The memo uses `effectiveToday` (`:1127`, past/future split for tax-status override remediation) but its dep array (`:1170`) lists only `today`; separately `:1148` (`remainingTaxedChecks`) uses real `today` outright. Setting/changing Lock Date doesn't recompute the remediation split until an unrelated dep moves, and "remaining taxed checks" ignores the lock entirely. Fix: add `effectiveToday` to deps + owner decision on whether `:1148` should honor the lock. | `App.jsx:1122–1170` | Admin-only · weakens the Lock Date tool's simulation promise | `drift-app-warden.md` §9.4 finding 1 (T3 pass) |
| DW-3 | ✅ **Reopen Last Check-In doesn't eager-save its deletes.** Dropping the confirmation record + its spawned log entry uses bare functional `setState`s — the one Delete-shaped action on the Income surface violating the CLAUDE.md eager-save rule. Worst case mild (admin-only; a lost delete resurrects a valid confirmation). Fix: compute both next values synchronously, one `savePersistedStateNow({ weekConfirmations, logs })`. | `App.jsx:1055–1068` | Soft-D3 · admin-only | `drift-app-warden.md` §9.4 finding 2 (T3 pass) |

---

## ARCHIVED — Expense add/edit defects (2026-06-15/16) — shipped

Everything below is the historical June pass on `monthlyOverrides`/`history`
reconciliation. **Verified 2026-07-19: the fix shipped** — the pure helpers it
introduced (`onwardStartMonthKey`, `applyQuarterForward`, `applyAllQuarters`) are live
in `src/lib/expense.js` with their tests, and the display-anchor fix is in
`BudgetPanel.jsx`. The only item never formally closed was the optional live-data
verification on Anthony's account (step 5's `lastEditedAt` cleanup also remains
vestigial, non-blocking). Kept for the decision record (Decisions 1–3 still govern
expense-save semantics — do not re-litigate without sign-off).

Tracking expense add/edit defects that surface when acting on the **current**
fiscal timeline (today = 2026-06-15, Q2). Both reports trace back to how the
budget panel reconciles two storage layers — `monthlyOverrides` and `history` —
and how the save/add helpers write to them.

---

## ⚙️ How resolution actually works (ground truth)

There is **one** resolver, `getEffectiveAmountForMonth(exp, monthKey, phaseIdx)`
(`src/lib/finance.js` ~651):

1. If `monthlyOverrides[monthKey]` exists → **use it** (always wins).
2. Else → fall back to `history` (latest entry with `effectiveFrom ≤ the 15th of
   the month`, via `getEffectiveAmount`).

So **`monthlyOverrides` unconditionally shadow `history`**, regardless of which was
edited more recently. That is the root tension with the intended behavior:

> **Intended model:** the most recent save/override from any create/update change
> should take priority **precisely** within the timeframe the user selected via the
> save-button choice.

### What each Save button writes today

| Button (scope) | Writes `monthlyOverrides`? | Writes `history`? | Precise + most-recent-wins? |
|---|---|---|---|
| `[Month] Only` (`saveThisMonth`) | ✅ that month | — | ✅ |
| `This Qtr` (`saveThisQuarterOnly`) | ✅ the 3 quarter months | — | ✅ |
| `[Month]+ Onward` (`saveFromMonthForward`) | ✅ month→Dec | ✅ (redundant) | ✅ |
| **`Q[n]+ Onward`** (`saveAllQuarters`) | ❌ **none** | ✅ only | ❌ shadowed by any in-range override |
| **`All Qtrs`** (`saveAllQuartersFull`) | ❌ **none** | ✅ only | ❌ shadowed by any in-range override |

**Core defect:** the two quarter-scoped saves write *only* `history`, but the
resolver reads `monthlyOverrides` first. If any month in the selected range already
has an override — from a prior month-level edit, or seeded data (e.g. **Angel**
carries `2026-04`/`2026-05` overrides) — the new quarter save is silently ignored
there.

### ⚠️ Correction to a prior finding
An earlier draft claimed `latestPastEntry` was called without its `todayIso`
argument. **That was wrong.** `BudgetPanel.jsx:574` defines a local closure
`const latestPastEntry = (existing) => latestPastEntryPure(existing, TODAY_ISO)`
that binds the date correctly. Not a bug — disregard.

---

## ✅ Decisions locked (2026-06-16)

These three product/architecture decisions are settled and govern the
implementation. Do not re-litigate without explicit sign-off.

### Decision 1 — In-range conflict: **overwrite finer overrides in range**
When a broader save (`Q+ Onward`, `All Qtrs`) covers months that already have a
per-month override, the broad save **replaces** those overrides across its scope.
- **Why:** this is what "the most recent save wins **precisely** in the selected
  timeframe" requires — the newest, broadest edit is authoritative across the whole
  window the user picked.
- **Trade-off accepted:** prior month-specific customizations inside the range are
  intentionally discarded. The user chose a broad scope; that is the signal to flatten.
- **Approach note:** with Option A this is automatic — writing an override for each
  month in scope overwrites whatever was there. No separate "clear" pass needed.

### Decision 2 — "Onward" in the current period: **today's month forward only**
For the current period, an `Onward` save covers the **current month → December**.
Already-elapsed months in the current quarter are **left untouched**.
- **Example (today 2026-06-15):** `Q2+ Onward` and `June+ Onward` both write
  **June → Dec**. April and May are not modified.
- **Why:** "onward" reads as future-facing from now; rewriting elapsed months would
  retroactively change periods the user has already lived/spent through.
- **Fixes in scope:** `saveAllQuarters` currently back-dates its `history` entry to
  the quarter's first month (April 1) and can create a **duplicate `effectiveFrom`**.
  Under Decision 2 the write window starts at the current month, eliminating both the
  back-dating and the duplicate-`effectiveFrom` fragility.

### Decision 3 — Storage approach: **Option A — unify on `monthlyOverrides`**
Every scoped save writes an override for exactly the months in its scope (quarter
saves included). `monthlyOverrides` stays the authoritative layer; `history` is the
baseline for untouched/future months and brand-new expenses.
- **Why over timestamp-based resolution (Option B):**
  - Smallest, most contained change — **no rewrite of the resolver**, which feeds
    display, projections, budget health, and goal timelines (highest-risk surface).
  - Decisions 1 & 2 map directly onto it: "precise scope" = the exact set of month
    keys written; "today-forward" = write `currentMonth…Dec`; "overwrite in range"
    is automatic.
  - Deterministic — one value per month, no tie-breaking, no clock dependence, easy
    to unit-test.
  - Option B doesn't remove the work: a timestamp alone doesn't encode which months
    a save covered, so per-month scope must still be stored — Option A's granularity
    plus a resolver rewrite and a clock dependency on top.
- **The one real cost (must handle):** a few display surfaces read `history`
  **directly** and ignore overrides — `currentEffective`/`quarterEffective`
  (`BudgetPanel.jsx` ~197 / ~230, used by the quarter cards and swipeable stacks at
  ~439/472/501/534, and the restore sheet at ~2217). When overrides become
  authoritative, these must either keep `history` in sync on every save **or** be
  pointed at `getEffectiveAmountForMonth`, so the same expense never shows two
  different numbers across surfaces.

---

## Bug 1 — Editing an existing expense "onward" in the current timeline does nothing

**Reported:** Editing **Gas** ($100/wk → $70/wk) in the Q2 / June review; tapping
`June+ Onward` or `Q2+ Onward` and saving drops back to the sheet with no change.
The same buttons work in a **future** quarter/month.

**Root cause** ✅ — the quarter-scoped saves (`saveAllQuarters`, `saveAllQuartersFull`)
write only `history`, which the resolver treats as lower-priority than any
`monthlyOverrides` already present in the range (see "Core defect" above). Works in a
future view because future months typically have no overrides, so `history` wins
cleanly. Secondary contributors — back-dated `effectiveFrom` and duplicate entries in
`saveAllQuarters`, and the current-quarter display anchor (see Bug 2) — are resolved
by Decisions 2 and 3.

**Verification (optional, to confirm on live data):** Config dump of the live **Gas**
object to check for current/forward `monthlyOverrides`; DB Row → Fetch for `expenses`
drift + `updated_at` right after a failed onward save.

---

## Bug 2 — New expense added "[Month]+ Onward" on a fresh account saves as $0/check

**Reported:** On a new account in quarter view, adding an expense and tapping the
green `June+ Onward` creates the card but shows **$0/check** and doesn't factor in.

**Root cause** ✅ — a fresh account opens in quarter mode with `ap` = current quarter
(Q2). The quarter card reads `displayMonthKey = QUARTER_FIRST_MONTHS[ap]` =
`"2026-04"` (April). But `addExpFromMonthForward` anchors to the actual current month
(June), writing overrides/history only from June forward. April has neither an
override nor an in-effect history entry, so `getEffectiveAmountForMonth(exp, "2026-04")`
returns **0** → the card and the headline `ts` total (both read off April) show $0,
even though June-onward weeks are actually funded by `computeRemainingSpend`.
`addExpAllQuarters` is unaffected (its history starts at April 1).

**Fix (under Decision 3):** clamp the current quarter's representative month so the
quarter card reflects what's in effect **now** (current month) rather than an elapsed
month — `displayMonthKey` for the current quarter → `max(QUARTER_FIRST_MONTHS[ap],
currentMonthKey)`. This also resolves Bug 1's display-anchor contribution.

---

## 🔧 Implementation plan

Build order, all under the locked decisions above:

1. ✅ **Make quarter-scoped saves authoritative.** `saveAllQuarters` and
   `saveAllQuartersFull` now write `monthlyOverrides` across their exact scope
   (current-month → Dec for the onward case per Decision 2; all 12 for All Qtrs),
   overwriting in range (Decision 1), and keep one `history` baseline entry. The
   back-dated/duplicate `effectiveFrom` write is gone. Override construction is
   extracted to pure helpers in `src/lib/expense.js` (`onwardStartMonthKey`,
   `applyQuarterForward`, `applyAllQuarters`) alongside the month-level helpers.
2. ✅ **Fix the current-quarter display/add anchor** (Bug 2). `displayMonthKey` now
   anchors the current quarter to the current month (`ap === currentPhaseIdx
   ? currentMonthKey : QUARTER_FIRST_MONTHS[ap]`), so June-onward adds/edits no
   longer read $0 off elapsed April. All display totals flow through
   `displayEffective`, so the headline `ts` and cards are fixed too.
3. ✅ **Reconcile history-only readers.** The restore sheet now resolves via
   `getEffectiveAmountForMonth` at the displayed month; the debug-trace readers
   (`currentEffective`/`quarterEffective`) were re-pointed at the override-aware
   resolver so console output matches the panel. The now-unused `getEffectiveAmount`
   import was dropped from `BudgetPanel`.
4. ✅ **Tests** (`src/test/lib/expense.test.js`): each save scope writes the precise
   month set; broad save overwrites an in-range override; elapsed months are
   preserved; a brand-new expense is non-zero after All Qtrs; a save→reload
   (JSON round-trip) is stable. 16 new cases, all green; full suite unchanged
   apart from the pre-existing unrelated failures.
5. 🔶 **`lastEditedAt` — left vestigial (deliberate).** Under Option A, resolution is
   purely override-presence; no timestamp tie-break is needed, so the new quarter
   helpers intentionally do **not** stamp `lastEditedAt`. The field is still written
   by the month-level helpers and read nowhere — a candidate for a later cleanup
   pass, not blocking this fix.

> **Status:** steps 1–4 implemented, committed, and pushed to
> `claude/expense-editing-current-timeline-qitm8h`. Step 5 is a non-blocking
> follow-up. Remaining: live-data verification on Anthony's account (Gas edit +
> fresh-account add) before closing out.
