# Test Coverage Analysis & Recommendations

**Date:** 2026-03-22
**Current Coverage:** 0% — no test files, no test framework, no test scripts

---

## Codebase Summary

| File | Lines | Domain |
|------|-------|--------|
| `src/App.jsx` | 587 | App shell, state management, Supabase sync |
| `src/components/BudgetPanel.jsx` | 726 | Expense/loan/goal CRUD + projections |
| `src/components/WeekConfirmModal.jsx` | 491 | Week-by-week confirmation workflow |
| `src/components/LogPanel.jsx` | 389 | Event logging + impact display |
| `src/components/IncomePanel.jsx` | 281 | Income simulation + tax breakdown |
| `src/components/BenefitsPanel.jsx` | 148 | Attendance bucket visualization |
| `src/components/ui.jsx` | 19 | Shared UI primitives |
| `src/lib/finance.js` | 335 | **Pure financial calculation functions** |
| `src/lib/db.js` | 104 | Supabase load/save + schema migrations |
| `src/lib/supabase.js` | 11 | Supabase client init |
| `src/hooks/useLocalStorage.js` | 21 | localStorage persistence hook |
| `src/constants/config.js` | 76+ | Tax brackets, defaults, initial data |
| `src/main.jsx` | 11 | React entry point |
| **Total** | **~2,641** | |

---

## Required Setup

No test framework is installed. Add the following before writing any tests:

```bash
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```

Update `vite.config.js`:

```js
/// <reference types="vitest" />
export default defineConfig({
  // ...existing config
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
```

Create `src/test/setup.js`:

```js
import '@testing-library/jest-dom'
```

Add to `package.json` scripts:

```json
"test": "vitest",
"test:coverage": "vitest run --coverage"
```

**Why Vitest over Jest:** The project already uses Vite — Vitest reuses the same config/transforms with zero additional setup, and supports ESM natively.

---

## Priority 1 — `src/lib/finance.js` (Critical)

**Why:** 335 lines of pure financial logic. No React dependencies. Bugs here directly affect income projections, tax calculations, and attendance bonus payouts shown to the user as financial facts. Pure functions are also the easiest to test — no mocking required.

### Functions to Test

#### `fedTax(grossIncome, filingStatus)`
- Correct bracket thresholds for each filing status
- Income at exactly a bracket boundary (edge case)
- Income spanning multiple brackets
- Zero income returns zero

#### `buildYear(config)`
- Generates exactly 52 weeks
- Week 1 is a 4-day shift, week 2 is a 6-day shift (rotation)
- Gross pay reflects base rate × shift hours + OT multiplier where applicable
- Weekend differential applied on correct days
- Tax withholding flag set only on configured weeks (e.g. weeks 7–8, 19–22, 37–52)

#### `computeNet(grossPay, config, weekIndex)`
- FICA deduction matches expected percentage
- 401k deduction matches contribution rate
- LTD deduction applied correctly
- Federal tax withheld on withholding weeks only
- Net = gross minus all deductions (no double-counting)

#### `computeBucketModel(config, logs, weekConfirmations)`
- Month with no events: 18h bonus credited
- Month with a minor violation: 6h bonus credited
- Month with a major violation: 0h bonus
- Overflow payout triggers when bucket exceeds 128h cap
- Projected vs. realized split is accurate

#### `calcEventImpact(event, config, weekData)`
- Missed unpaid shift: gross loss = shift hours × rate
- Missed unapproved shift: gross loss + bucket deduction
- PTO: no gross loss, possible bucket deduction
- Bonus event: positive gross/net impact
- 401k match loss calculated on gross loss (not net loss)
- Partial shift: pro-rated based on hours worked

#### `computeGoalTimeline(goals, weeklyNetSurplus)`
- Goals sequenced in priority order
- Each goal's completion week accounts for goals before it consuming surplus
- Zero surplus: all goals return `Infinity` / no completion date
- Goal already met (saved >= target): returns week 0

#### `computeLoanPayoffDate(loan, currentWeek)`
- Monthly payment correctly converted to weekly equivalent
- Biweekly payment correctly converted to weekly equivalent
- Payoff date advances correctly with extra payments
- Loan with zero balance returns current week

#### `getEffectiveAmount(expense, weekIndex)`
- Returns base amount when no history exists
- Returns overridden amount after a change takes effect
- Change mid-year doesn't retroactively affect prior weeks
- Multiple history entries resolved in correct order

#### `loanWeeklyAmount(loan)`
- Monthly → weekly: `monthlyPayment * 12 / 52`
- Biweekly → weekly: `biweeklyPayment / 2`
- Weekly: returns as-is

#### `computeRemainingSpend(expenses, currentWeek)`
- Projects only future weeks (week >= currentWeek)
- Includes all active expense categories
- Correctly applies quarterly effective amounts

---

## Priority 2 — `src/lib/db.js` (High)

**Why:** `loadUserData()` runs silent schema migrations on every load. A regression here could corrupt or silently reset user data. These functions should be tested with mocked Supabase responses.

### Functions to Test

#### `loadUserData(supabase, userId)`
- Returns `DEFAULT_CONFIG` defaults when Supabase returns null
- Merges partial saved data with defaults (doesn't drop missing keys)
- **3-phase → 4-quarter migration:** quarterly arrays of length 3 are expanded to length 4
- Loan history regenerated from loan metadata on load
- Legacy weekly arrays converted to history entry format
- Error from Supabase: throws or returns safe fallback (define expected behavior)

#### `saveUserData(supabase, userId, data)`
- Calls Supabase upsert with correct table and payload shape
- All state slices (config, expenses, goals, logs) included in save
- Does not mutate the input data object

**Mocking approach:** Use `vi.mock('../lib/supabase')` or pass a mock Supabase client as a parameter to isolate from network.

---

## Priority 3 — `src/constants/config.js` (Medium)

**Why:** The 2026 federal tax brackets embedded here are consumed by `fedTax()`. A typo in a bracket threshold or rate silently produces wrong numbers across all income projections.

### What to Test

- **Snapshot test** on `DEFAULT_CONFIG` — catches accidental mutations
- **Snapshot test** on `INITIAL_EXPENSES` and `INITIAL_GOALS`
- Tax bracket array is sorted ascending by threshold
- No overlapping bracket ranges
- Each bracket has both a threshold and a rate
- `EVENT_TYPES` contains all expected event type keys

---

## Priority 4 — Component Integration Tests (Medium)

Test components that contain non-trivial logic, not just rendering. Use `@testing-library/react` with `userEvent` for interactions.

### `BudgetPanel.jsx` — 726 lines

- **Add expense:** fill form → submit → expense appears in list
- **Edit expense:** click edit → change amount → confirm → updated value shown
- **Delete expense:** click delete → expense removed from list
- **Quarterly phase switch:** changing quarter shows correct effective amount for that quarter
- **Loan payoff date:** entering loan details shows expected payoff week
- **Goal timeline:** adding a goal with known surplus shows correct weeks-to-complete

### `LogPanel.jsx` — 389 lines

- **Add event:** select event type → fill fields → submit → event appears in log
- **Delete event:** remove event → list updates, impact recalculated
- **Impact display:** missed unpaid shift shows correct gross/net loss values
- **Week-confirm sync:** confirmed weeks reflected in log state

### `WeekConfirmModal.jsx` — 491 lines

- **Confirm week:** clicking confirm updates weekConfirmations state
- **Shift delta calculation:** adding/removing shifts updates the delta display
- **Event scheduling:** scheduling an event for a week shows in that week's summary
- **Navigation:** previous/next week buttons advance correctly

### `IncomePanel.jsx` — 281 lines

- **Renders 52 weeks:** annual breakdown table has 52 rows
- **Net < Gross:** every row should show net pay less than gross pay
- **Withholding weeks highlighted:** weeks in withholding schedule visually distinct

---

## Priority 5 — Hooks & Utilities (Low)

### `useLocalStorage.js`

- Initial value returned when localStorage is empty
- State persisted to localStorage on update
- Corrupted JSON in localStorage falls back to initial value (no crash)

### `ui.jsx`

- `Card` renders children
- `SmBtn` fires onClick handler
- Snapshot tests for visual regression

---

## Suggested File Structure

```
src/
└── test/
    ├── setup.js                        # @testing-library/jest-dom import
    ├── lib/
    │   ├── finance.test.js             # Unit tests — all finance.js functions
    │   └── db.test.js                  # Unit tests — loadUserData, saveUserData
    ├── constants/
    │   └── config.test.js              # Snapshot + structural tests
    ├── components/
    │   ├── BudgetPanel.test.jsx        # Integration tests — CRUD flows
    │   ├── LogPanel.test.jsx           # Integration tests — event logging
    │   ├── WeekConfirmModal.test.jsx   # Integration tests — confirm flow
    │   └── IncomePanel.test.jsx        # Integration tests — income display
    └── hooks/
        └── useLocalStorage.test.js     # Unit tests — hook behavior
```

---

## Coverage Targets

| Area | Target | Rationale |
|------|--------|-----------|
| `finance.js` | 90%+ | Financial logic — highest correctness risk |
| `db.js` | 80%+ | Migration bugs can corrupt user data |
| `config.js` | 100% | Static data — snapshots are trivial |
| Components | 60%+ | Focus on logic paths, not rendering |
| Hooks | 80%+ | Simple but worth confirming edge cases |

---

## Phased Implementation Plan

### Phase 1 — Foundation (do this first)
1. Install Vitest + Testing Library
2. Configure `vite.config.js` and `setup.js`
3. Write `finance.test.js` (pure functions, no mocking)
4. Write `config.test.js` (snapshots + bracket structure)

### Phase 2 — Data Layer
5. Write `db.test.js` with mocked Supabase client
6. Cover all migration branches in `loadUserData()`

### Phase 3 — Components
7. `BudgetPanel.test.jsx` — CRUD flows
8. `LogPanel.test.jsx` — event logging + impact
9. `WeekConfirmModal.test.jsx` — confirmation workflow

### Phase 4 — Coverage Sweep
10. `IncomePanel.test.jsx`
11. `useLocalStorage.test.js`
12. Fill gaps identified by `vitest --coverage`

---

## Key Risks if Tests Remain Absent

| Risk | Impact |
|------|--------|
| Wrong tax bracket thresholds | User sees incorrect annual income projections |
| `buildYear()` rotation off by one | Every week's pay is wrong — cascades through all panels |
| Schema migration bug in `loadUserData()` | User's quarterly expense data silently reset on load |
| `computeBucketModel()` off-by-one on tier thresholds | Wrong attendance bonus shown; user misjudges financial position |
| `calcEventImpact()` wrong for one event type | User makes PTO/scheduling decisions based on incorrect impact numbers |
