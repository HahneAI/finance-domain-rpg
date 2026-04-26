# Feature: Monthly Budget View + Inline Period Selector

**Branch:** `claude/add-monthly-budget-view-TxSam`  
**Priority:** High — replaces quarterly-only UX with full month-level control  
**Scope:** `BudgetPanel.jsx`, `PhaseAdvancedEditModal.jsx`, `finance.js`, `expense.js`

---

## Goal

Replace the 4-quarter tab strip with one unified full-width component:
- **Top row:** 12 clickable month pills (Jan–Dec)
- **Bottom row:** 4 quarter blocks (Q1–Q4) each spanning 3 month columns

Selecting a month shows expense amounts, weekly spend numbers, and edit/delete flows scoped to that month. Selecting a quarter shows the same UI but resolved from the first month of that quarter. Advanced edit functionality moves out of the modal and surfaces inline in the panel.

---

## Current State Summary

| Concern | Where it lives | Notes |
|---|---|---|
| Active period | `ap` state (0–3, quarter index) in `BudgetPanel.jsx:83` | Syncs to `currentPhaseIdx` on mount |
| Quarter tabs | 4 `VT` buttons in overview render block | `Q1 Jan–Mar` … `Q4 Oct–Dec` |
| Amount resolution | `getEffectiveAmount(exp, date, phaseIdx)` in `finance.js` | Picks latest history entry where `effectiveFrom <= date` |
| Quarter rep dates | `Q_REP_DATES` at `BudgetPanel.jsx:131` | `Feb 15, May 15, Aug 15, Nov 15` |
| Advanced edit | `PhaseAdvancedEditModal.jsx` | Full-screen modal, opened via `advEditPhaseIdx` state |
| Delete | `deleteExp()` in `BudgetPanel.jsx` | Soft-delete: appends zeroed history entry from active phase forward |
| Month-level data | None | History entries are per-quarter (`weekly[4]`), no month granularity |

---

## Data Model Changes

### New field: `expense.monthlyOverrides`

Add an optional map keyed by `"YYYY-MM"` month strings. Each entry stores the resolved per-paycheck amount for that month, plus enough metadata to reconstruct the original bill amount for the edit form.

```js
// expense object (additions only)
{
  monthlyOverrides: {
    "2026-05": { perPaycheck: 87.5, amount: 350, cycle: "every30days" },
    "2026-06": { perPaycheck: 100,  amount: 400, cycle: "every30days" },
  }
}
```

**Rules:**
- A `monthlyOverrides` entry is created whenever the user saves an edit scoped to a specific month.
- A zeroed entry (`perPaycheck: 0`) represents a month-scoped deletion.
- When computing "delete forward from this month," zero-fill all months from the selected month through year-end in `monthlyOverrides` and also append the existing phase-forward zeroed history entry starting on the 1st of the selected month.
- `monthlyOverrides` keys are calendar months, not fiscal weeks.

### New resolution function: `getEffectiveAmountForMonth(expense, monthKey, phaseIdx)`

Add to `finance.js`. Called by all new month-aware display paths.

```js
// monthKey = "2026-05"
export function getEffectiveAmountForMonth(expense, monthKey, phaseIdx) {
  // 1. Check month-level override first
  if (expense.monthlyOverrides?.[monthKey] != null) {
    return expense.monthlyOverrides[monthKey].perPaycheck;
  }
  // 2. Fall back to existing date-based resolution
  const repDate = new Date(`${monthKey}-15`);
  return getEffectiveAmount(expense, repDate, phaseIdx);
}
```

### `getEffectiveAmount` stays unchanged

No migration required. All existing quarter logic continues to work. Monthly overrides layer on top.

---

## New Component: `MonthQuarterSelector`

**File:** `src/components/MonthQuarterSelector.jsx`

A single full-width block rendered above the expense list in `BudgetPanel`. It replaces the existing 4 `VT` quarter buttons.

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Jan  Feb  Mar  │  Apr  May  Jun  │  Jul  Aug  Sep  │  Oct  Nov  Dec   │  ← month row
├─────────────────┼─────────────────┼─────────────────┼──────────────────┤
│       Q1        │       Q2        │       Q3        │        Q4        │  ← quarter row
│  Jan–Mar        │  Apr–Jun        │  Jul–Sep        │  Oct–Dec         │
└─────────────────────────────────────────────────────────────────────────┘
```

- Month pills: 12 equal-width columns, each tappable
- Quarter blocks: 4 equal-width columns, each tappable, spanning their 3 months
- Active month: teal (`--color-accent-primary`) background, dark text
- Active quarter: teal bottom border + teal label; dimmed if a specific month within it is active
- Current month/quarter: subtle gold dot indicator

### Props

```js
MonthQuarterSelector({
  activeMonth,       // "2026-05" | null — null means quarter mode
  activeQuarter,     // 0–3
  currentMonthKey,   // "2026-04" — today's month, for "current" indicator
  currentPhaseIdx,   // 0–3 — today's quarter
  onSelectMonth,     // (monthKey: string) => void
  onSelectQuarter,   // (phaseIdx: number) => void
})
```

### Behavior

- Clicking a month pill: sets `activeMonth` to that `"YYYY-MM"` key, updates `activeQuarter` to the quarter containing it.
- Clicking a quarter block: sets `activeMonth = null`, sets `activeQuarter` to that quarter index. Display resolves from the first month of that quarter.
- Months outside the fiscal year (none for a Jan–Dec year) are rendered disabled.
- On mobile: both rows scroll horizontally if needed; month pills are `minWidth: 44px` for tap targets.

---

## BudgetPanel State Changes

### Replace `ap` with `activeMonth` + `activeQuarter`

```js
// REMOVE:
const [ap, setAp] = useState(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0);

// ADD:
const [activeMonth, setActiveMonth] = useState(null);         // "2026-MM" or null
const [activeQuarter, setActiveQuarter] = useState(() =>      // 0–3
  currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0
);
```

### Derived: effective display context

```js
// Quarter index to use for all calculations
const displayPhaseIdx = activeQuarter;

// Month key to resolve amounts from (first month of quarter when in quarter mode)
const QUARTER_FIRST_MONTHS = ["2026-01", "2026-04", "2026-07", "2026-10"];
const displayMonthKey = activeMonth ?? QUARTER_FIRST_MONTHS[activeQuarter];

// Weekly spend total for the displayed period
const ts = expenses.reduce(
  (s, e) => s + getEffectiveAmountForMonth(e, displayMonthKey, displayPhaseIdx),
  0
);
```

### Sync on phase advance

```js
useEffect(() => {
  setActiveQuarter(currentPhaseIdx);
  setActiveMonth(null); // reset to quarter view when real quarter advances
}, [currentPhaseIdx]);
```

---

## Expense Card Display Changes

Each expense card currently calls `currentEffective(exp, ap)`. Replace with:

```js
const displayAmt = getEffectiveAmountForMonth(exp, displayMonthKey, displayPhaseIdx);
```

Monthly equivalent:
```js
const displayMonthly = monthlyFromPerPaycheck(displayAmt, cpm);
```

No other card changes needed — labels, cycle, edit/delete buttons remain the same.

---

## Monthly Edit Flow

### How it works

When the user taps the edit pencil on an expense card while a **specific month** is selected (not quarter mode):

1. Edit form pre-fills with the current month's amount (from `monthlyOverrides[displayMonthKey]` if present, else back-calculated from `getEffectiveAmount`).
2. On save, write to `expense.monthlyOverrides[displayMonthKey]` and all subsequent months through end of year that don't already have an override. This is the "from this month onward" default.
3. The save does NOT append a new `history` entry — monthly overrides are separate from the quarter history chain.

### Edit save handler: `saveMonthEdit(expId, newAmount, newCycle)`

Add to `BudgetPanel.jsx`:

```js
const saveMonthEdit = (expId, newAmount, newCycle) => {
  const perPaycheck = perPaycheckFromCycle(newAmount, newCycle, cpm);
  const fiscalYear = 2026;
  const [year, mon] = displayMonthKey.split("-").map(Number);

  setExpenses(prev => prev.map(e => {
    if (e.id !== expId) return e;
    const overrides = { ...(e.monthlyOverrides ?? {}) };
    // Write this month and all subsequent months in the fiscal year
    for (let m = mon; m <= 12; m++) {
      const key = `${fiscalYear}-${String(m).padStart(2, "0")}`;
      if (!overrides[key]) {  // don't overwrite already-customized future months
        overrides[key] = { perPaycheck, amount: newAmount, cycle: newCycle };
      }
    }
    overrides[displayMonthKey] = { perPaycheck, amount: newAmount, cycle: newCycle }; // always write selected month
    return { ...e, monthlyOverrides: overrides };
  }));
};
```

### Edit save handler: `saveQuarterEdit(expId, newAmount, newCycle)` (quarter mode)

When no month is selected (quarter mode), editing behaves exactly as today: appends/updates a history entry. No change to existing `saveEditExp` logic — just ensure it is called with `displayPhaseIdx` instead of `ap`.

---

## Delete Flow

### New delete confirmation popup

Replace the existing single "Confirm Delete" dialog with a scoped choice dialog.

**When deleting in month mode** (`activeMonth !== null`):

```
┌─────────────────────────────────────────────────┐
│  Delete "Food"?                                  │
│                                                  │
│  [ This month only ]  [ This month + forward ]  │
│                        [ Cancel ]               │
└─────────────────────────────────────────────────┘
```

**When deleting in quarter mode** (`activeMonth === null`):

```
┌─────────────────────────────────────────────────┐
│  Delete "Food"?                                  │
│                                                  │
│  [ This quarter only ]  [ This quarter + all    │
│                           following quarters ]  │
│                        [ Cancel ]               │
└─────────────────────────────────────────────────┘
```

### Delete handlers

**`deleteMonthOnly(expId, monthKey)`** — zero just this month:
```js
setExpenses(prev => prev.map(e => {
  if (e.id !== expId) return e;
  return {
    ...e,
    monthlyOverrides: {
      ...(e.monthlyOverrides ?? {}),
      [monthKey]: { perPaycheck: 0, amount: 0, cycle: "every30days" },
    },
  };
}));
```

**`deleteMonthForward(expId, monthKey)`** — zero this month and all following:
```js
// Same as saveMonthEdit but perPaycheck=0 for all months from monthKey to Dec
// Also append a zeroed history entry starting monthKey's 1st for the owning quarter
```

**`deleteQuarterOnly(expId, phaseIdx)`** — zero just this quarter's months in overrides:
```js
// Write perPaycheck:0 to the 3 months of the target quarter in monthlyOverrides
// Leave other quarters untouched
```

**`deleteQuarterForward(expId, phaseIdx)`** — existing behavior, unchanged:
```js
// Existing deleteExp() logic — appends zeroed history entry from active phase forward
```

### State for delete confirmation

```js
// REMOVE:
const [delExpId, setDelExpId] = useState(null);

// ADD:
const [pendingDelete, setPendingDelete] = useState(null);
// null | { id: string, mode: "month" | "quarter" }
```

---

## Surfacing Advanced Edit Inline

### Current problem

`PhaseAdvancedEditModal.jsx` opens as a full-screen overlay triggered by `advEditPhaseIdx`. The bulk edit capability (editing all expenses for a quarter at once, adding new ones inline) is buried and not discoverable.

### Approach: Inline Expansion Panel

Instead of opening a modal, reveal a full-width "bulk edit" row beneath the period selector when the user taps an "Edit Period" button. This replaces the modal entirely.

**New state:**
```js
const [bulkEditOpen, setBulkEditOpen] = useState(false);
```

**UI placement:**

```
[ MonthQuarterSelector ]          ← always visible
[ Edit Period ▼ ]                 ← small SmBtn, right-aligned
[ BulkEditPanel (inline) ]        ← expands below when open, full width
[ Expense cards ]
```

**`BulkEditPanel` (new component or inline JSX):**
- Renders all regular expenses as editable rows (amount + cycle inputs)
- "Add expense" row at the bottom
- Save / Cancel buttons at the bottom
- No overlay, no modal-open body class
- On save, calls `saveAdvancedEdit()` exactly as the modal does today, then `setBulkEditOpen(false)`
- Remove `PhaseAdvancedEditModal.jsx` import and `advEditPhaseIdx` state once this is wired

**Migration note:** `PhaseAdvancedEditModal.jsx` contains the patch/addition assembly logic. Extract that logic into a shared helper in `expense.js` before removing the modal so it can be called from the inline panel.

---

## Weekly Spend Numbers Per Month

The existing `futureWeeks` array (from `rollingTimeline.js`) contains all fiscal weeks for the year with their `weekEnd` dates. To compute accurate weekly spend for a calendar month:

```js
// Get fiscal weeks whose weekEnd falls within a calendar month
const weeksInMonth = (monthKey, futureWeeks) => {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end   = new Date(y, m, 0); // last day of month
  return futureWeeks.filter(w => {
    const d = new Date(w.weekEnd);
    return d >= start && d <= end;
  });
};
```

Display in the period summary bar above expense cards:

```
May 2026  ·  4 pay periods  ·  $87.50/wk avg  ·  $350.00/mo
```

---

## Implementation Order

### Phase 1 — Data layer ✅ COMPLETE
- [x] Add `getEffectiveAmountForMonth(expense, monthKey, phaseIdx)` to `finance.js`
- [x] Add `monthlyOverrides` read/write to `expense.js` helpers
- [x] Add `saveMonthEdit`, `deleteMonthOnly`, `deleteMonthForward`, `deleteQuarterOnly` handlers in `BudgetPanel.jsx`
- [x] Vitest tests: `getEffectiveAmountForMonth` (6 cases) + expense helpers (21 cases)

### Phase 2 — Period selector component ✅ COMPLETE
- [x] Build `MonthQuarterSelector.jsx` — month row (Jan–Dec) + quarter row (Q1–Q4) in one LiquidGlass card
- [x] Replace inline LiquidGlass quarter block in `BudgetPanel` with `<MonthQuarterSelector>`
- [x] `displayMonthKey` = activeMonth or first month of active quarter (Jan/Apr/Jul/Oct)
- [x] All spend calculations (ts, category totals, expense cards, breakdown, loans) use `displayEffective`
- [x] Quarter click → `activeMonth = null`, resolves from first month of quarter ✓
- [x] Month click → `activeMonth = "2026-MM"`, resolves exact month amounts ✓

### Phase 3 — Edit flow ✅ COMPLETE
- [x] `startEditExp` pre-fills from `monthlyOverrides[activeMonth]` in month mode; history-based in quarter mode
- [x] Save button routes to `saveMonthEdit` (month mode) or `saveEditExp` (quarter mode)
- [x] Button label: `SAVE FROM MAY +` in month mode; `SAVE` in quarter mode
- [x] Context note: "Applies from MAY onward — earlier months unchanged" shown in month mode
- [x] Override indicator: gold `◆` on month pills that have at least one `monthlyOverride` entry

### Phase 4 — Delete flow ✅ COMPLETE
- [x] Replace `delExpId` with `pendingDelete: { id, mode: "month"|"quarter" } | null`
- [x] Month mode confirmation: `[MO. ONLY]` `[+ ONWARD]` `[✕]`
- [x] Quarter mode confirmation: `[QTR ONLY]` `[+ ONWARD]` `[✕]`
- [x] All four handlers wired; `deleteExp` updated to call `setPendingDelete(null)`

### Phase 5 — Inline bulk edit
- [ ] Extract patch/addition assembly from `PhaseAdvancedEditModal.jsx` into `expense.js`
- [ ] Build inline `BulkEditPanel` below the period selector
- [ ] Remove `PhaseAdvancedEditModal.jsx` and `advEditPhaseIdx` state
- [ ] Remove `document.body.classList.toggle("modal-open", ...)` side-effect

### Phase 6 — QA
- [ ] Mobile: month pills tap targets ≥ 44px, no horizontal overflow at 390px
- [ ] Verify annual breakdown table still correct after `monthlyOverrides` changes
- [ ] Run `npm run test:run` — fix any snapshot drift from state shape changes
- [ ] Check `account-reference.json` computed expectations still match

---

## Post-Sprint 5 Investigations

### Phase 7 — Supabase Schema Investigation

**Context:** With month-level overrides and per-quarter editing now exposed in the UI, the current flat `expenses` JSONB column in `user_data` is carrying more structure than it was designed for. This phase is a design investigation before any migration.

**Current schema (inferred):**
```
user_data
  id           uuid
  user_id      uuid
  config       jsonb   -- pay rate, schedule, state, etc.
  expenses     jsonb   -- array of expense objects including history[] + monthlyOverrides
  goals        jsonb
  logs         jsonb
  week_confirmations jsonb
  pto_goal     jsonb
```

**Problem 1 — Single JSONB column for all expenses:**
All 12 months of overrides + full history for every expense live in one column. When the user makes a "forward" delete that cascades through Q2, Q3, Q4 overrides, the entire `expenses` blob is rewritten on every save. This is fine for now but will degrade with many expenses and frequent edits.

**User's proposal:** Break into per-quarter columns (`expenses_q1`, `expenses_q2`, `expenses_q3`, `expenses_q4`) so each quarter's data is isolated. An "onward" delete or edit from Q2 forward would then need to update `expenses_q2`, `expenses_q3`, `expenses_q4` — three targeted column writes instead of one full rewrite.

**Tradeoffs to investigate:**

| Approach | Pros | Cons |
|---|---|---|
| Keep single `expenses` column | Zero migration, works today | Full blob rewrite on every edit; grows unbounded |
| Per-quarter columns | Targeted writes; quarter-isolated reads | Schema migration; "onward" edits touch multiple columns; cross-quarter queries are awkward |
| Separate `expenses` table (one row per expense) | True relational; targeted row updates | Breaking change; requires FK joins; RLS rules need rework |
| Hybrid: `expenses` + `expense_month_overrides` table | Clean separation of base vs. override data | Two tables to keep in sync; adds complexity |

**Problem 2 — Expense ID consistency:**
Expenses currently use `id: "exp_${timestamp}"` generated at creation. This is unique per session but not guaranteed globally unique across devices or if the user creates expenses in rapid succession. The `history[]` and `monthlyOverrides` maps already key off the expense `id` for lookups. For Supabase row-level targeting (if we move to a per-expense table) or for efficient JSONB path queries, IDs need to be:
- Deterministic and stable across saves
- Globally unique (UUID preferred)

**Investigation checklist:**
- [x] Audit current `db.js` save/load path — full array read/write confirmed; `saveUserData` upserts the entire `expenses` JSONB blob on every save; no per-ID targeting
- [ ] Check if any Supabase RLS policies reference expense shape
- [ ] Prototype per-quarter column approach on staging — measure write amplification on a 10-expense account with 6 months of history
- [x] Decide: UUID expense IDs — switched all three generation sites in `BudgetPanel.jsx` and `BulkEditPanel.jsx` to `crypto.randomUUID()` (non-breaking; existing rows keep their old IDs)
- [ ] If per-quarter columns: write a migration SQL + update `db.js` to split/merge on read/write
- [ ] Document the "onward delete cascade" logic for multi-column writes

**Recommendation (preliminary):** Stay on single `expenses` column with `monthlyOverrides` nested for now. Introduce UUID expense IDs immediately (non-breaking — just change the generation function). Revisit schema split when expense count or edit frequency causes visible latency.

---

### Phase 8 — Three-Day Buffer Edit Audit

**Context:** The existing `saveEditExp` function has a 72-hour buffer: if the most recent history entry was created within 3 days, edits overwrite that entry in place rather than appending a new one. This prevents unbounded history growth from rapid corrections.

**Current buffer location:** `BudgetPanel.jsx → saveEditExp()` and `deleteExp()`:
```js
const daysDiff = (new Date(TODAY_ISO) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
if (daysDiff <= 3) {
  // update in place
} else {
  // append new history entry
}
```

**Problem:** This buffer only applies to quarter-mode history-based edits. The new month-mode `saveMonthEdit` and `applyMonthEditForward` helpers write directly to `monthlyOverrides[key]` with no timestamp check — they always overwrite the override entry. This means month-mode edits already have implicit idempotency (same key = same slot), but there's no record of *when* the override was written, making it impossible to distinguish "created 30 seconds ago and being corrected" from "created last week."

**What needs auditing:**

| Edit path | Buffer applied? | Notes |
|---|---|---|
| `saveEditExp` (quarter mode) | ✅ Yes — 72h check on latest history entry | Working as designed |
| `deleteExp` (quarter forward) | ✅ Yes — 72h check before appending | Working as designed |
| `saveMonthEdit` → `applyMonthEditForward` | ⚠️ Implicit only — key overwrite, no timestamp | Corrections always land; no history bloat risk |
| `deleteMonthOnly` → `clearMonth` | ⚠️ Implicit only | Same as above |
| `saveAdvancedEdit` (ADV. EDIT modal) | ✅ Partial — checks `effectiveFrom` exact match | Works but keyed on date string, not wall clock |

**Action items:**
- [x] Add `lastEditedAt: ISO_TIMESTAMP` to each `monthlyOverrides` entry when written — `applyMonthEditForward`, `clearMonth`, `clearMonthForward`, `clearQuarterMonths` all stamp it via optional `editedAt` param (defaults to `new Date().toISOString()`)
- [x] Add `lastEditedAt` field to `expense.js` helper signatures so all write paths stamp it consistently
- [x] Write tests: `lastEditedAt` is stamped correctly; explicit timestamp passes through; default is a valid ISO string within the call window — **514 tests passing**
- [ ] In `applyMonthEditForward`: 72h overwrite vs. log decision — deferred (key-overwrite idempotency is sufficient for now; no history bloat risk for month-mode edits)
- [ ] Audit `saveAdvancedEdit` patch path for 72h wall-clock window — deferred (effectiveFrom exact-match is correct; partial-day edits are safe)

---

### Phase 9 — Rolling Month Drop-Off in MonthQuarterSelector

**Context:** As months pass, the period selector should not keep showing stale past months. Displaying January in June creates confusion and wastes tappable space. The rule is: **show the most recently completed month + all current and future months**. Past months beyond the immediately preceding one drop off.

**Drop-off rule:**
```
visibleMonths = { lastCompletedMonth } ∪ { currentMonth } ∪ { all future months }

On May 1:  visible = [Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec]
On Jun 1:  visible = [May, Jun, Jul, Aug, Sep, Oct, Nov, Dec]
On Jul 1:  visible = [Jun, Jul, Aug, Sep, Oct, Nov, Dec]
```

**Quarter-row behavior when pills drop off:**
When one or more months drop off from a quarter, the quarter row must still visually align with the remaining month pills above it. The quarter block should span only its *visible* months — and visible months fill space equally.

```
May 1 — Q2 has Apr (dropped), May, Jun:
  Month row: [Apr✗] [May ][Jun ]  →  [ May  ][ Jun  ]  (2 pills fill Q2 space)
  Quarter:   [       Q2          ]

Jun 1 — Q2 has Apr (dropped), May (dropped), Jun:
  Month row: [May✗][Jun ]  →  [  Jun   ]  (1 pill fills Q2 space)
  Quarter:   [    Q2    ]

Q1 is entirely past (all 3 months dropped beyond the buffer):
  Month row: Q1 has no visible pills — Q1 quarter block collapses entirely
  Quarter:   [  Q2  ][  Q3  ][  Q4  ]  (3 quarters share full width)
```

**Implementation approach:**

```js
// In MonthQuarterSelector (or BudgetPanel, passed as prop)
const lastCompletedMonthKey = (() => {
  const [y, m] = currentMonthKey.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
})();

const visibleMonths = MONTH_KEYS.filter(key =>
  key >= lastCompletedMonthKey  // keeps last completed + current + future
);
```

**Layout change:** Replace the fixed `flex: 1` equal-width approach with a CSS grid where each column represents one *visible* month pill. Quarter blocks span `grid-column: span N` where N = number of their months that are still visible. Quarters with 0 visible months are hidden entirely.

```
grid-template-columns: repeat(${visibleMonths.length}, 1fr)
```

**Propagation beyond BudgetPanel:** The user noted this should affect all panels. Scope:
- `MonthQuarterSelector` (BudgetPanel) — primary target
- `IncomePanel` rolling timeline — already uses fiscal weeks, but any month-label header row should also drop off
- `HomePanel` — if it gains a period selector in future
- `LogPanel` — if it gains a month filter

**Action items:**
- [x] Add `lastCompletedMonthKey` derivation inside `MonthQuarterSelector` (`prevMonth()` helper, self-contained)
- [x] Filter `MONTH_KEYS` to `visibleMonths` before rendering month pills
- [x] Layout: used `flex: 1` per visible month pill (same alignment as grid `repeat(N, 1fr)` — simpler, no grid needed)
- [x] Quarter blocks: `flex: visiblePerQ[i]` so each quarter spans exactly its visible month count; quarters with 0 visible months return `null`
- [x] Sliding teal indicator bar repositioned proportionally — `barLeft` and `barWidth` computed from `visiblePerQ` ratios
- [x] Past month (immediately preceding) rendered with `--color-text-disabled` color — visually subdued but still tappable
- [x] Cross-panel audit: IncomePanel uses week-level rolling rows (no horizontal month bar); LogPanel and BenefitsPanel use month labels only for date formatting — no other panels need drop-off treatment
- [x] HomePanel goal timeline bar: anchored to start of previous calendar month (was anchored to current fiscal week, causing intra-month bar shrink); removed weekly subdivision ticks; updated fill-bar positions to calendar coordinate system; `lookbackMonths` changed from 0→1 to show previous month as reference
- [ ] Test: set system clock to June 1, verify May is last visible in Q2 with only 1 pill spanning its Q2 column (deferred — visual QA)

---

## Files Touched

| File | Change |
|---|---|
| `src/components/BudgetPanel.jsx` | Replace `ap` state, add month handlers, replace delete state, remove modal wiring |
| `src/components/MonthQuarterSelector.jsx` | **New** — period selector component |
| `src/components/PhaseAdvancedEditModal.jsx` | Delete after Phase 5 migration |
| `src/lib/finance.js` | Add `getEffectiveAmountForMonth` |
| `src/lib/expense.js` | Add `monthlyOverrides` helpers, extract bulk-edit patch logic |
| `src/test/finance.test.js` | Add `getEffectiveAmountForMonth` tests |

---

## Open Questions

1. **Fiscal year boundary:** `monthlyOverrides` keys assume calendar year 2026. If `FISCAL_YEAR_START` shifts, key format should use fiscal-year-relative months instead. Defer until multi-year support is needed.
2. **"This month only" delete UX:** Zeroing a single month creates a gap in spend — visually the card could show "$0" for that month. Should the card hide entirely or show a "paused" badge? Lean toward "paused" badge so users don't think the bill is gone.
3. **Carry-forward on month edit:** Current proposal writes the new value to all subsequent months that don't already have an override. Alternative: only write the one month and let users propagate manually. The "overwrite forward" default aligns with user intent ("change my Food budget from May onward") but needs a clear UI label on the save button.
