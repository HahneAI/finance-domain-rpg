# Bug Fix To-Do

Tracking expense add/edit defects that surface when acting on the **current**
fiscal timeline (today = 2026-06-15, Q2). Both reports trace back to how the
budget view resolves "the current period" and how the save/add helpers write
to `monthlyOverrides` vs `history`.

> Status legend: ✅ confirmed by code reading · 🔶 strong suspect, needs live-data confirmation

---

## Bug 1 — Editing an existing expense "onward" in the current timeline does nothing

**Reported behavior**
> Editing the **Gas** expense in the Q2 / June timeline review, changing it from
> $100/wk → $70/wk. Tapping **"June+ Onward"** (month view) or **"Q2+ Onward"**
> (quarter view) and hitting save just drops back to the expense sheet's view mode
> with **no change**. The same onward buttons work when viewing a **future**
> quarter/month.

**Where the code lives** (`src/components/BudgetPanel.jsx`)
- Quarter-view onward → `saveAllQuarters` (line ~838)
- Month-view onward → `saveFromMonthForward` (line ~791)
- Edit pre-fill → `startEditExp` (line ~576)
- Display resolver → `displayEffective` / `displayMonthKey` (lines ~215–216)
- Underlying resolver → `getEffectiveAmountForMonth` / `getEffectiveAmount`
  (`src/lib/finance.js` lines ~632–655)

**Suspected root causes (ranked)**

1. 🔶 **`latestPastEntry` is called without its `todayIso` argument.**
   `src/lib/expense.js` defines `latestPastEntry(existing, todayIso)` and filters
   `existing.filter(en => en.effectiveFrom <= todayIso)`. But the call sites pass
   only `existing`:
   - `saveFromMonthForward` (line ~803): `latestPastEntry(existing)`
   - `saveAllQuarters` (line ~845): `latestPastEntry(existing)`
   - `saveAllQuartersFull` (line ~868): `latestPastEntry(existing)`
   - `startEditExp` (line ~595): `latestPastEntry(existing)`

   With `todayIso === undefined`, `en.effectiveFrom <= undefined` is always
   `false`, so the filter empties and the function falls back to `existing[0]`
   (the **oldest** entry) instead of the most recent past entry. This corrupts
   `latest`, `baseWeekly`, and `daysDiff`, and means the `daysDiff <= 3` "replace
   in place" branch matches the wrong entry. **Fix:** pass `TODAY_ISO` to every
   call site.

2. 🔶 **`saveAllQuarters` back-dates the new history entry to the quarter's first
   month and creates a duplicate `effectiveFrom`.** For the current quarter,
   `qStartIso = QUARTER_FIRST_MONTHS[ap] + "-01"` = `"2026-04-01"` — a date in the
   **past**. Gas's existing history is `[{effectiveFrom:"2026-04-01", weekly:[100,…]}]`,
   so the append branch produces **two entries with the same `effectiveFrom`**
   (`[100,100,100,100]` and `[100,70,70,70]`). `getEffectiveAmount` resolves ties
   by array order (`>=` means last-wins), which happens to surface $70 in memory —
   but the ordering is fragile across a Supabase round-trip / re-sort and can
   revert to the stale $100 entry. **Fix:** when the new effectiveFrom collides
   with an existing entry, replace that entry instead of appending a duplicate.

3. ✅ **`saveAllQuarters` never writes or clears `monthlyOverrides`.** A month that
   already has an override entry (e.g. the **Angel** expense has `2026-04` and
   `2026-05` overrides in `account-reference.json`) will keep showing the old
   value because `getEffectiveAmountForMonth` checks `monthlyOverrides` *first* and
   only falls back to `history`. This is inconsistent with the month-scoped saves
   (`saveFromMonthForward` / `saveThisMonth` / `saveThisQuarterOnly`) which **do**
   write overrides. For any expense carrying current/forward overrides, the
   quarter-view onward edit is silently shadowed. **Fix:** have `saveAllQuarters`
   overwrite/clear `monthlyOverrides` for the affected months (current month → Dec)
   the same way `saveFromMonthForward` does.

4. ✅ **The quarter view's display month is the quarter's *first* calendar month,
   even when that month is in the past.** `displayMonthKey = activeMonth ??
   QUARTER_FIRST_MONTHS[ap]`. For the current quarter Q2 this is `"2026-04"`
   (April). A change scoped "from June onward" is correct, but the quarter card is
   reading April, so the edit can look like it "did nothing" in that view. See
   Bug 2 — same root mechanism. **Fix (shared with Bug 2):** clamp the current
   quarter's representative month to `max(QUARTER_FIRST_MONTHS[ap], currentMonthKey)`.

**Why it "works in a future view":** future quarters/months typically have no
pre-existing `monthlyOverrides`, the representative month is not a past month, and
the back-dated/duplicate `effectiveFrom` collision (cause #2) doesn't occur — so
the history-only write resolves cleanly.

**Verification needed (per CLAUDE.md diagnostic templates):**
- Config dump (Tools → Config JSON → Copy) for the live **Gas** object — confirm
  whether it carries `monthlyOverrides` for current/forward months.
- DB Row → Fetch → report drift on `expenses` + `updated_at` immediately after a
  failed onward save, to separate an in-memory failure from a persistence revert.

---

## Bug 2 — New expense added "[Month]+ Onward" on a fresh account saves as $0/check

**Reported behavior**
> On a brand-new test account, adding a new expense (name + price + frequency) and
> tapping the big green **"June+ Onward"** button. The expense card is created and
> added, but it shows **$0/check** and doesn't factor into anything.

**Where the code lives** (`src/components/BudgetPanel.jsx`)
- `addExpFromMonthForward` (line ~704), `addExpThisMonth` (line ~686)
- `displayEffective` / `displayMonthKey` (lines ~215–216)
- `ts` headline total (line ~314): `expenses.reduce((s,e)=>s+displayEffective(e,ap),0)`

**Root cause** ✅
A fresh account opens in **quarter mode** (`activeMonth === null`), and on mount
`ap` is set to the current quarter (Q2 = index 1). The display resolves through:

```
displayMonthKey = activeMonth ?? QUARTER_FIRST_MONTHS[ap]   // = "2026-04" (April)
displayEffective(exp) = getEffectiveAmountForMonth(exp, "2026-04", 1)
```

But `addExpFromMonthForward` anchors to the **actual current month**:

```
anchor = activeMonth ?? currentMonthKey                     // = "2026-06" (June)
overrides set for months 6 → 12 only
history entry effectiveFrom = "2026-06-01"
```

So **April and May get neither an override nor an in-effect history entry.**
`getEffectiveAmountForMonth(exp, "2026-04", 1)` finds no `2026-04` override and no
history entry effective on `2026-04-15` (the only entry starts `2026-06-01`), so it
returns **0**. The quarter card — and the headline `ts` total, which both read
`displayMonthKey` = April — show **$0/check**, even though June-onward weeks are
actually funded (`computeRemainingSpend` iterates real future weeks and *does* pick
up the June+ overrides). Net effect: the expense looks dead in the quarter view.

> Note: `addExpAllQuarters` is unaffected (its history entry starts at the quarter's
> first month, April 1, so April resolves correctly). Only the **month-onward** and
> **this-month** add paths exhibit the $0 display in the current quarter.

**Proposed fix** (one of, prefer A)
- **A — Clamp the current quarter's representative month.** Make `displayMonthKey`
  use `max(QUARTER_FIRST_MONTHS[ap], currentMonthKey)` for the current quarter so
  the quarter card reflects what's actually in effect *now* rather than a past month.
  This single change also addresses Bug 1 cause #4. (Confirm the quarter total
  semantics are still acceptable — a quarter that changes mid-quarter will now
  represent the current-month value.)
- **B — Backfill the add helpers.** In quarter mode, have `addExpFromMonthForward`
  also seed the quarter's earlier months (April/May for Q2) so the representative
  month isn't empty. Riskier — it would misrepresent the expense as active in
  months before the user said it started.

---

## Suggested fix order
1. Fix `latestPastEntry` call sites (pass `TODAY_ISO`) — low risk, clearly correct.
2. Fix `displayMonthKey` clamp for the current quarter — resolves Bug 2 and Bug 1 #4.
3. Make `saveAllQuarters` write `monthlyOverrides` (parity with month-scoped saves)
   and stop creating duplicate `effectiveFrom` entries — resolves Bug 1 #2/#3.
4. Add Vitest coverage in `src/test/` for: add-month-onward in current quarter,
   edit-onward in current quarter with a pre-existing override, and a save→reload
   round-trip to catch the duplicate-`effectiveFrom` revert.
