# Finance Pillar — Claude Code Handoff
## (Pillar 1 of 4 | MVP Launch Requirement)

## What This Is (Plain Terms)

A personal finance dashboard built for one person (Anthony, DHL/P&G warehouse worker, Jackson MO) tracking his entire 2026 financial picture. It calculates his exact take-home pay week by week based on his rotating shift schedule, tracks his budget across three spending phases, logs any income disruptions (missed shifts, PTO, bonuses), and projects how long it will take to hit each of his savings goals in priority order.

Everything is connected — change a pay rate, toggle a tax week, or log a missed shift and every number in every tab updates instantly.

---

## What We Built (Technical Spec)

### Stack
- React 18 + Vite (plain JS/JSX, no TypeScript)
- No external libraries — all inline styles, no Tailwind, no UI kit
- Single file: `src/App.jsx` (~700 lines)
- Local dev: `npm run dev` → localhost:5173

### Architecture
All state lives in the root `App` component and flows down as props. Three `useMemo` chains derive all computed values reactively:

```
config → buildYear(config) → allWeeks
allWeeks + config → taxDerived (liability, gap, extraPerCheck)
allWeeks + config + showExtra → projectedAnnualNet → weeklyIncome
expenses + weeklyIncome → baseWeeklyUnallocated
logs + config + projectedAnnualNet + baseWeeklyUnallocated → logTotals (adjustedTakeHome, adjustedWeeklyAvg)
```

### Config Object (DEFAULT_CONFIG)
All income constants in one object — editing any field and saving recalculates all 52 weeks.

**Current fields (Anthony's hardcoded single-user values):**
- `baseRate` $21.15/hr, `shiftHours` 12, `diffRate` $3/hr weekend
- `otThreshold` 40hrs, `otMultiplier` 1.5x (base only, diff stays flat)
- `ltd` $2/wk, `k401Rate` 6%, `k401MatchRate` 5%, `k401StartDate` 2026-05-15
- `firstActiveIdx` 7 (employment starts week ending Feb 23)
- `w2FedRate` 12.83%, `w2StateRate` 4.0%, `w1FedRate` 7.84%, `w1StateRate` 3.38%
- `ficaRate` 7.65%, `fedStdDeduction` 15000, `moFlatRate` 0.047, `targetOwedAtFiling` 1000
- `taxedWeeks` — flat array of week indices that have fed+state withheld
- `bucketStartBalance` 64h, `bucketCap` 128h, `bucketPayoutRate` $9.825/hr (DHL attendance policy)
- `payPeriodEndDay` 0 (Sunday)

**Fields being added by the setup wizard (see `docs/setup-wizard-plan.md` Phase 1):**
- `setupComplete`, `taxExemptOptIn`, `paycheckBuffer` — wizard gate/completion fields
- `employerPreset` ("DHL" | null), `startingWeekIsHeavy` — DHL rotation preset
- `scheduleIsVariable`, `standardWeeklyHours` — schedule type for non-DHL users
- `userState` — two-letter state code for STATE_TAX_TABLE lookup (state sprint)
- `fedRateLow/High`, `stateRateLow/High` — generalized replacements for `w1/w2` rate fields

**Migration note:** `w1FedRate`/`w2FedRate`/`w1StateRate`/`w2StateRate` are deprecated but kept in DEFAULT_CONFIG during transition. finance.js still reads them until Phase 2 updates it to use `fedRateLow/High`.

### Schedule Logic (DHL-specific — Anthony's account)
- Year indexed 0–52, starting Jan 5 2026 (Monday pay week ends)
- Even idx = 6-day week (72h: Tue–Sun, 32h OT, 24h weekend diff) — heavy week
- Odd idx = 4-day week (48h: Mon/Wed/Thu/Fri, 8h OT, 0 weekend diff) — light week
- `firstActiveIdx = 7` — weeks 0–6 are pre-employment, dimmed, excluded from totals
- `taxedWeeks` array drives withholding; toggling a week index instantly recalculates
- Phase 2 of the wizard build decouples this logic from hardcoded strings using `employerPreset` + `startingWeekIsHeavy`; standard users get flat weekly hours instead

### Key Derived Constants (computed, not hardcoded)
- `projectedAnnualNet` — sum of `computeNet(w)` for all active weeks
- `weeklyIncome` — `projectedAnnualNet / 52` (replaces hardcoded $50k)
- `baseWeeklyUnallocated` — `weeklyIncome` minus weighted avg phase spend
- `extraPerCheck` — extra federal withholding per taxed check to target ~$1k owed at filing

### Event Log Cascade
`calcEventImpact(event, config)` computes the delta using projection-vs-actual:
- **missed_unpaid**: `projectedGross(rotation) - actualGross(shiftsWorked)` — captures full OT collapse
- **pto**: rate differential loss + lost OT premium (PTO pays $19.65/hr flat)
- **partial**: hours lost × base rate
- **bonus / other_loss**: direct dollar amount
- Every event produces: `grossLost, netLost (×FICA), k401kLost (if after May 15), hoursLostForPTO (÷20 = PTO accrual lost)`
- `logTotals` aggregates all events → `adjustedTakeHome`, `adjustedWeeklyAvg`
- `adjustedWeeklyAvg` feeds the goals waterfall timeline directly

### Panels & Views

**Income (6 views):** Summary (monthly table), Monthly (card grid), Weekly (52-row table), 401k (per-check running balance), Tax Debt (gap analysis + extra withholding plan), Schedule (per-week taxed/exempt toggle), Config (all DEFAULT_CONFIG fields editable inline)

**Budget (4 views):** Overview (expense lines by category — full CRUD: add/edit/delete per line, all 3 phases), Breakdown (category bars + annual projection table), Cashflow (weekly allocation flow using live weeklyIncome), Goals (priority waterfall — full CRUD: add/edit/delete/reorder/complete, hex color picker, timeline bars, year-end outlook)

**Benefits:** 401k base vs. adjusted (event-impacted), PTO accrual base vs. adjusted with paternity leave on-track indicator, attendance bonus summary

**Log:** Impact summary cards, goals-at-risk indicator, inline add form (5 event types with conditional fields), delete with confirm, footer notes

### CRUD Implemented
- ✅ Income config: all constants editable, save triggers full recalculation
- ✅ Tax schedule: per-week taxed/exempt toggle in Schedule view
- ✅ Expenses: add (label, category, P1/P2/P3 amounts, note), edit (all 3 phase amounts), delete
- ✅ Goals: add (label, target, hex color + picker, note), edit, delete, reorder (↑↓), mark complete/undo
- ✅ Event log: add (5 types, conditional fields), delete with confirm

### Not Yet Built
- Auth / multi-user (Supabase persistence is live for single-user; auth and multi-user accounts are post-MVP)
- Setup wizard (see `docs/setup-wizard-plan.md` — all config currently hardcoded for Anthony)
- Data export
- Mobile layout optimization

---

## File Structure
```
life-rpg/
  src/
    App.jsx        ← entire app, single file
    index.css      ← minimal reset only
  index.html
  vite.config.js   ← uses @vitejs/plugin-react (NOT swc)
  package.json
```

## Design System
- Background: `#0d0d0d`, surface: `#141414` / `#1a1a1a`
- Gold accent: `#c8a84b`, green: `#6dbf8a`, red: `#e8856a`, blue: `#7a8bbf`
- Font: `'Courier New', monospace` everywhere
- All styles inline — no CSS classes, no external stylesheets
- Shared primitives: `NT` (nav tab), `VT` (view tab), `Card`, `SmBtn`
- Shared style objects: `iS` (input), `lS` (label)