# Authority OS — Active Systems Reference

Living doc. Describes what is built, how it works, and known issues.
**Guardrail: keep under 300 lines. Summarize; do not transcribe.**
Last updated: 2026-04-12 | App: Authority Finance (A:Fin)

---

## System Index

| # | System | Files | Status |
|---|--------|-------|--------|
| 1 | Expense Drag-and-Drop Reorder | `BudgetPanel.jsx` | Live — open issue |
| 2 | Expense Inline Editor + Pay Cycle Math | `BudgetPanel.jsx` | Live |
| 3 | Goals Timeline — Monthly/Weekly Grid | `BudgetPanel.jsx`, `finance.js` | Live |
| 4 | Rolling Active Views + Progressive Scaling | `rollingTimeline.js`, `IncomePanel.jsx`, `BudgetPanel.jsx` | Live |
| 5 | Adjusted Take-Home / Tax Payback Pipeline | `App.jsx`, `IncomePanel.jsx` | Live |
| 6 | Expense Pay Period vs Monthly Display | `BudgetPanel.jsx` | Resolved (by design) |
| 7 | Year Summary — Adjusted Net + Event Loss | `IncomePanel.jsx`, `App.jsx` | Live |
| 8 | Log Tab — Hero + Log Effect Summary | `LogPanel.jsx` | Live |
| 9 | Loan payoff quarter persistence | `finance.js` | Live — keeps payoff amounts through the payoff quarter |
| 12 | Pulse Intelligence Layer — InsightRow | `ui.jsx`, `HomePanel.jsx`, `IncomePanel.jsx`, `BudgetPanel.jsx` | Rough draft — signal tokens live, insights wired to real data |
| 13 | Liquid Glass Premium UI Layer | `LiquidGlass.jsx`, `ui.jsx`, `index.css` | Live — InsightRow wired as first Pulse placement |
| 14 | Swipeable Stacks — Horizontal Snap Cards | `useSwipeStack.js`, `ui.jsx`, `IncomePanel.jsx`, `HomePanel.jsx` | Sprint 1 shipped · Sprint 2 in progress · Sprints 3–5 pending |

---

## 1. Expense Drag-and-Drop Reorder

Supports both mouse drag and touch (450ms hold-to-drag) within the Expenses tab.

**Mouse drag:** `onExpenseDragStart` → `EXPENSE_DRAG_PREVIEW_TINT` fades card toward destination category color on hover → `reorderExpenseByInsert()` splices dragged card into the correct insert-index position and updates `category` if cross-lane. Preview resets on drop/leave/cancel.

**Touch drag:** Ghost overlay follows finger. Edge proximity triggers `runTouchAutoScroll` (rAF loop, max 18px/frame). Drop resolves via `expenseTouchInsertRef` position. Exit fade on 130ms timer.

**Reorder logic:** `reorderExpenseByInsert(draggedId, lane, insertIndex)` — walks `regularExpenses` to find the correct splice point, mutates category to `targetLane`, preserves loan ordering separately.

**Categories:** Needs / Lifestyle (cross-lane drag supported). Goals tab uses `GOAL_LANES` colors for inline labels only — not split containers.

**Open issue:** Task 1 post-commit noted Goals tab was accidentally given Expenses/Lifestyle split containers. Code audit shows Goals renders as a single list with lane badges inline per card — appears resolved, but needs visual QA confirmation.

---

## 2. Expense Inline Editor + Pay Cycle Math

**Cycle options:** weekly (7d), biweekly (14d), every30days, yearly (365d).
`PAYCHECK_CADENCE_DAYS = 7` — one check per fiscal week.

**Core formula:**
```
perPaycheck = amount × 7 / cycleDays
monthly     = perPaycheck × 4   (PAYCHECKS_PER_MONTH, not calendar days)
```

**Effective start date:** new expenses use `TODAY_ISO` as `effectiveFrom`. Edit: if last history entry is ≤3 days old, updates in place; otherwise appends a new history entry. No backfill.

**Phase-aware:** `billingMeta.byPhase[ap]` stores per-phase `{amount, cycle, effectiveFrom}`. `getEffectiveAmount()` resolves the correct history entry for the active phase and date.

**Edit flow:** `startEditExp` reverse-converts stored `perPaycheck → cycle amount` via `cycleAmountFromPerPaycheck` for display in the inline editor.

---

## 3. Goals Timeline — Monthly/Weekly Grid

**Location:** `BudgetPanel.jsx` Goals view, uses `computeGoalTimeline()` from `finance.js`.

**Timeline structure:** Month-labeled track built from `futureWeeks`. Each month renders `MONTH_SUBDIVISIONS = 4` subtle internal blocks. `deriveRollingTimelineMonths()` filters visible months (see System 4).

**Goal bar positioning:** `computeGoalTimeline()` runs week-by-week surplus sequencing — each loop week: `weeklyNets[weekOffset] - futureEventDeductions - effectiveNonTransferSpend - smearedPastLoss + smearedGain`. Goals funded in list order. Start week `sW` and duration `wN` map to month position proportionally, including mid-month stops.

**Known gap:** `wN` fallback for unfunded goals uses `remaining / avgNet` approximation — can diverge from true week-by-week surplus under volatile checks (partial-year extrapolation).

---

## 4. Rolling Active Views + Progressive Scaling

**Library:** `src/lib/rollingTimeline.js` — three pure exports.

**Weekly (IncomePanel):**
`deriveRollingIncomeWeeks(allWeeks, todayIso, 4)` → shows last 4 completed weeks + current week + all remaining weeks through EOY. Older weeks hidden; data preserved in `hiddenWeeks`.

**Monthly (BudgetPanel goals):**
`deriveRollingTimelineMonths(monthSegments, todayIso, 1)` → shows previous month + current month + all remaining months through EOY. Older months in `hiddenMonths`.

**Progressive scaling:**
`progressiveScale(scaleProgress, 0.15)` → `1 + (progress × 0.15)`. Returns 1.00x at year start, 1.15x at EOY. `scaleProgress` = hidden periods / max possible hidden periods. Applied as `weeklyDensityScale` in IncomePanel weekly rows.

**Hidden data** preserved in derived structures for future full-year review tab.

---

## 5. Adjusted Take-Home / Tax Payback Pipeline

**Event impact engine (`App.jsx` `eventImpact` memo):**
Loops all logs → `calcEventImpact(e, config)` per entry → accumulates:
- `netLost` / `netGained` — total net delta
- `missedEventDayNetLost` — absence-type events only (feeds Task 7 modal)
- `weeklyNetAdjustments[idx]` — per-week net delta map
- `grossDeltaByWeek[idx]` — per-week gross delta (feeds tax recalc)
- `futureEventDeductionsByWeek[idx]` — future weeks only (feeds goal surplus)

**Tax payback adjustment:**
`adjustedTaxableGrossByWeek[idx] = taxableGross + grossDeltaByWeek[idx]`
Feeds full federal (`fedTax`) and state (`stateTax`) liability recalculation → recomputes `fedGap`, `moGap` → `extraPerCheck = targetExtraTotal / taxedWeekCount`. Missed days reduce gross → lower projected tax owed.

**Downstream consumers:**
- `adjustedWeeklyAvg = baseWeeklyUnallocated + (totalNetAdjustment / futureWeekCount)`
- `futureWeekNets[]` — per-week spendable net, buffer-excluded, fed to `computeGoalTimeline`
- `logTotals.adjustedTakeHome = projectedAnnualNet + totalNetAdjustment`

---

## 6. Expense Pay Period vs Monthly Display

**Resolved — by design.** Monthly cost = `perPaycheck × 4` (paycheck-based month, not calendar). This is intentional: app runs on weekly fiscal cadence, so 4 checks = 1 "month." Not a math error. `cycleAmountFromPerPaycheck` reverse-converts for editor display. Documented as resolved in task audit.

**Monthly budget-health projection tap points (2026-04-05):**
- Core selector output lives in `computeRemainingSpend(expenses, futureWeeks, options)` in `src/lib/finance.js`.
- Components that need true monthly budget health should consume:
  - `monthlyExpenses` (normalized from weekly spend using 4.33),
  - `monthlyNetTakeHome` (sum of projected next 4 weeks),
  - `budgetHealth` (`monthlyExpenses / monthlyNetTakeHome`).
- Pass `options.futureWeekNets` and/or `options.weeklyIncome` to keep it reactive to income updates.
- Pass `options.previousMonthKey` + `options.now` and watch `shouldReevaluateForMonthBoundary` for the 1st-of-month reset/re-evaluation trigger.

---

## 7. Year Summary — Adjusted Net + Event Loss

**IncomePanel** receives `adjustedTakeHome` and `missedEventDayNetLost` as props (from `App.jsx` `logTotals`).

**Year Summary card:** Displays `adjustedTakeHome` (not raw projected net) as "Adjusted Net" with `missedEventDayNetLost` as sublabel: `"$X missed-day loss"` shown in red when non-zero.

**Inline breakdown row** (IncomePanel lines 226–230): Shows missed-day loss in red and adjusted take-home in gold as a consolidated callout — replaces the old separate yellow/red adjusted take-home component.

**Source of truth:** `adjustedTakeHome = projectedAnnualNet + eventImpact.totalNetAdjustment`. Card and breakdown row use same prop — no divergence risk.

---

## 8. Log Tab — Hero + Log Effect Summary

**Three hero cards:** net loss (`tot.nL`), PTO loss (`tot.pto` hours), bucket hours lost (`tot.bucket`). Larger week-naming card and bucket hour bar card preserved.

**Log Effect Summary card** (single card, no internal background separation):
- `adjTH = projectedAnnualNet - tot.nL + tot.nG` — adjusted annual take-home
- `adjWA = baseWeeklyUnallocated - (tot.nL / weeksLeft) + (tot.nG / weeksLeft)` — adjusted weekly avg
- `projS = adjWA × weeksLeft` — projected savings
- Displays: adjusted take-home, adjusted weekly avg, projected savings vs total unfunded goals, weeks-to-fund estimate

**Attendance history** section: groups absence-type logs by calendar month, counts unpaid shifts, unapproved days, partial shifts. Day-of-week miss frequency sorted descending. Explanatory text box removed.

---

## 9. Loan payoff quarter persistence

**History rebuild:** `buildLoanHistory()` still regenerates a runway entry (`loanRunwayStartDate` + `loanWeeklyAmount`) per loan and a payoff entry, but the payoff entry now becomes effective the day after the quarter-end boundary that contains `computeLoanPayoffDate(loan)`. Helpers `getQuarterEndIsoForDate` (one of the new helper exports) and `addDaysToIso` derive that boundary from ISO cutoffs (Q1=Mar 31, Q2=Jun 30, Q3=Sep 30, Q4=Dec 31).

**Quarter coverage:** Loans closing in July or August now keep their weekly allocation (e.g., Laptop \$33/wk, AirPods \$17.50/wk) visible through Q3 totals, so the quarterly spend audits and Budget tab phase math never drop them to zero before `2026-10-01`.

**Why this matters:** A loan payoff happening mid-quarter previously zeroed the cost for that entire quarter; now the cost is kept alive through the quarter that contains the final payment, ensuring totals, goals, and console audit logs stay aligned with the user’s expectation that a loan “still exists” until the quarter closes.

## 12. Pulse Intelligence Layer (2026-04-10)

**Concept:** Flow dominates visually; Pulse enhances meaning. Pulse elements sit below primary metrics — never replace them. See `docs/authority-design-system` for full spec.

**Tokens** (live in `src/index.css` `@theme`):
- `--color-signal-blue: #5b8cff` — directional trend signals
- `--color-signal-purple: #7c5cff` — warnings / AI-generated insight moments
- `--color-signal-glow: rgba(124,92,255,0.25)` — reserved for future glow surfaces

**Component — `InsightRow`** (exported from `src/components/ui.jsx`):
```
Props: arrow ("up"|"down"|"flat") · delta (string, optional) · label (string) · variant ("blue"|"purple")
Renders: [↑↓→] [delta] [label]   — arrow+delta in signal color, label in text-disabled
```

**`MetricCard` / `Card` insight prop:** Pass `insight={{ arrow, delta, label, variant }}` to any card — renders InsightRow below the sub label. Returns nothing when `insight` is `undefined`.

**Meaningful-data trigger rule (critical):**
Pulse signals must return `undefined` when the backing data is absent or insufficient. Never fabricate a signal. Each signal computation is an IIFE that returns `undefined` on early exit conditions (no weeklyIncome, no nextWeekNet, no goals, etc.). This keeps Pulse rare and trustworthy.

**Wired surfaces (rough draft):**

| Panel | Cards carrying Pulse signals |
|---|---|
| HomePanel | Left This Week, Net Worth Trend, Goals, Budget Health, Next Week Takehome |
| IncomePanel | Gross (Year) — net rate; Adjusted Net — missed-event loss % (purple, only when > 0) |
| BudgetPanel overview | Weekly Spend — spend ratio; Left This Week — forward delta vs next check |
| BudgetPanel goals | Active Goals Total — % of remaining income; Weeks to Complete All — fundable this year? |
| BudgetPanel loans | Weekly Committed — debt service ratio; Debt-Free In — clears within 2026? |

---

## Core Architecture

```
SetupWizard → config
    ↓
buildYear() → allWeeks[] (52 weeks, taxableGross, grossPay per week)
    ↓
computeNet(week, config, extraPerCheck) → per-check net
    ↓
projectedAnnualNet → weeklyIncome → baseWeeklyUnallocated
    ↓
eventImpact (logs) → adjustedWeeklyDelta, grossDeltaByWeek
    ↓
taxDerived (adjustedTaxableGross) → extraPerCheck (feeds back into computeNet)
    ↓
futureWeekNets[] → computeGoalTimeline() → goal fund sequences
```

**Key constants:** `FISCAL_YEAR_START`, `PAYCHECK_CADENCE_DAYS = 7`, `PAYCHECKS_PER_MONTH = 4`

**Known gap:** `buildYear()` only applies `ltd` + `k401kEmployee` to pre-tax deductions. Insurance premiums and HSA/FSA contributions collected in config but not subtracted → taxable gross overstated. Tracked in TODO §8.

**Persistence:** localStorage via `src/lib/db.js`. Supabase for multi-user (auth live). No schema changes made by Tasks 1–8.

---

## Setup Wizard

**File:** `src/components/SetupWizard.jsx` — shipped. Consolidated from 10 steps → 6 (2026-03-31).

**Entry:** `App.jsx` checks `!config.setupComplete` on load → renders wizard. On completion writes `setupComplete: true` and redirects to income view. Re-accessible from sidebar "Life Events" menu for job changes without wiping unrelated config.

**6-step flow:**
1. **Welcome** — first-run intro or life event select (lost job / changed jobs / commission)
2. **Pay Structure** — base rate, shift hours, OT threshold/multiplier, weekend diff; DHL users also complete team A/B, shift type (night/morning), rotation, and OT day preference inline (was separate Step 15)
3. **Schedule** — job start date → `firstActiveIdx`, rotation week (DHL short/long), pay period close day
4. **Deductions** — benefits multi-select with inline config (401k, health, dental, vision, LTD, STD, life, HSA, FSA), benefits start date, freeform other-deductions rows, attendance policy gate (merged from old Step 6)
5. **Tax Rates** — state dropdown, paystub calculator (skippable), rate summary card now shows FICA + standard deduction inline (old Step 5 absorbed here)
6. **Wrap Up** — live estimated net breakdown, paycheck buffer toggle ($0–200/wk), tax-exempt week disclaimer gate (non-blocking; merged from old Steps 7+8)

**`STEP_DEFS` shape:** `{ id, title, showIf(formData, lifeEvent), isValid(formData, lifeEvent), skippable?, component }`. `activeSteps = STEP_DEFS.filter(showIf)` — progress bar and step counter derived from that filtered array. Life event routing gates Steps 3 and 6 (`null` | `changed_jobs` only).

**Employer preset:** `employerPreset: "DHL"` activates bucket attendance model, rotation-based scheduling, dual withholding rates, and DHL team/shift fields in Step 2. `isValid` for Step 2 requires `dhlTeam !== null` when DHL. Standard users get flat weekly hours model.

**Tax rates policy:** Paystub not required. Step 5 pre-fills from `STATE_TAX_TABLE`; users sharpen later via Income → Sharpen Rates (same calc UI, no wizard re-run).

**Token standard:** All rgba values use teal `rgba(0,200,150,...)` and green `rgba(34,197,94,...)` — old amber `rgba(201,168,76,...)` and old green `rgba(76,175,125,...)` fully removed.

---

## Rolling Active Views — QA Notes

Testing requires manual date simulation (no date override utility yet):
1. Near year start — minimal hidden periods, scale near 1.00x
2. Mid-year — some hidden periods, subtle scale increase visible
3. Near EOY — many hidden periods, scale near 1.15x cap

Hidden weeks/months preserved in `hiddenWeeks` / `hiddenMonths` arrays from `rollingTimeline.js` — ready for a future full-year review tab without data migration.

---

## 10. Funded goal absorption integrity (2026-04-03)

**Objective:** prevent funded-goal dollars from re-entering future surplus projections while avoiding double subtraction across weekly averages and year-end rollups.

**Current behavior:**
- `getFundedGoalSpend(goals, todayIso)` (new helper) sums completed goal targets as absorbed spend, ignores future-dated completions, and counts legacy completed goals without `completedAt`.
- App-level `baseWeeklyUnallocated` remains the pure paycheck-minus-expense baseline; funded-goal absorption is applied in projection summaries instead of being smeared into baseline weekly math.
- Budget/Home/Log projection surfaces consume `fundedGoalSpend` so funded amounts stay deducted once from year-end-style totals and cannot drift back into available surplus.

**Guardrail note:** this separation (baseline weekly surplus vs absorbed-goal projection adjustments) prevents the prior “spread + explicit subtract” double-count pattern.

## 13. Liquid Glass Premium UI Layer (2026-04-12)

**Files:** `src/components/LiquidGlass.jsx` · `src/components/ui.jsx` · `src/index.css` · `src/App.jsx` · `src/components/LogPanel.jsx`

**Component — `LiquidGlass`:**
```
Props: tone ("teal"|"blue"|"purple") · intensity ("light"|"strong") · withBorder (bool) · purpose (required) · style (merged last — overrides defaults) · className
Effect: backdropFilter blur + semi-transparent tint + accent border on the wrapper div
```
Placement guard fires a `console.warn` in dev if `purpose` is not in the whitelist (`nav | pulse | modal | log-summary`). To add a new placement: update `docs/premium-ui-TODO.md` §4 first, then extend `ALLOWED_PURPOSES` in `LiquidGlass.jsx`.

**Tone guide:**
- `teal` — Flow accent surfaces (nav, future neutral Pulse)
- `blue` — signal-blue Pulse rows (directional trend signals) → uses `rgba(91, 140, 255)`
- `purple` — signal-purple Pulse rows (warnings / AI moments) → uses `rgba(124, 92, 255)`

**Locked base values (finalized 2026-04-12):**

| Tone | Tint | Border |
|------|------|--------|
| teal | `rgba(0, 200, 150, 0.10)` | `rgba(0, 200, 150, 0.24)` |
| blue | `rgba(91, 140, 255, 0.16)` | `rgba(91, 140, 255, 0.35)` |
| purple | `rgba(124, 92, 255, 0.10)` | `rgba(124, 92, 255, 0.26)` |

Blur: `light = 12px` · `strong = 20px`. Values are hardcoded in the component lookup table — CSS custom property `blur(var(--x))` does not resolve in inline styles.

**Active placements:**

| Purpose | Location | Notes |
|---------|----------|-------|
| `pulse` | `InsightRow` in `ui.jsx` | `inline-flex` pill under MetricCard value; `tone="blue"` for directional, `tone="purple"` for warnings |
| `nav` | `mobile-bottom-nav` in `App.jsx` | Floating pill with full glass sheen recipe (see below) |
| `log-summary` | Log Effect Summary container in `LogPanel.jsx` | Wraps the pre-log summary grid; `tone="teal" intensity="light"` |

**Banned surfaces:** primary MetricCards, data tables, buttons. Never apply `LiquidGlass` to Flow-tier elements.

---

**`MetricCard` — `visualTier` prop (2026-04-12):**

`MetricCard` / `Card` in `ui.jsx` accepts `visualTier="glass"` or `"overlay"`. Injects backdrop-filter + teal glass tint/border directly into `containerStyle` — no extra wrapper element.

| Tier | Blur | Background | Border |
|------|------|-----------|--------|
| _(default / `"solid"`)_ | none | `var(--color-bg-surface)` | `var(--color-border-subtle)` |
| `"glass"` | `12px` | `rgba(0, 200, 150, 0.08)` | `rgba(0, 200, 150, 0.20)` |
| `"overlay"` | `20px` | `rgba(0, 200, 150, 0.12)` | `rgba(0, 200, 150, 0.28)` |

---

**Glass Sheen Recipe — nav pill (2026-04-12 starting point):**

The floating nav pill overrides the default `LiquidGlass` style with 5 stacked layers to produce the raised Apple-style glass effect. Apply via the `style` prop (spread last in the component, so these win):

| Layer | Property | Value | Purpose |
|-------|----------|-------|---------|
| 1 | `background` | `rgba(0, 200, 150, 0.15)` | More opaque colored glass (default teal is 0.10) |
| 2 | `border` | `1px solid rgba(0, 200, 150, 0.40)` | Visible raised edge (default teal is 0.24) |
| 3 | `boxShadow` layer A | `0 8px 32px rgba(0, 200, 150, 0.22)` | Outer teal ambient glow — lifts pill off background |
| 4 | `boxShadow` layer B | `0 4px 16px rgba(0, 0, 0, 0.55)` | Dark lift shadow — adds depth/elevation |
| 5 | `boxShadow` layer C | `inset 0 1px 0 rgba(255, 255, 255, 0.10)` | Inner top rim highlight — glass edge |
| 6 | Sheen div (child) | `linear-gradient(180deg, rgba(255,255,255,0.09) 0%, transparent 100%)` at 45% height | Top-surface light refraction — curved glass illusion |

Full `boxShadow` string:
```
"0 8px 32px rgba(0, 200, 150, 0.22), 0 4px 16px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.10)"
```

**Variation presets** (adjust opacity knobs to taste):

| Preset | Outer glow α | Sheen div α | Tint α | Border α | Use |
|--------|-------------|------------|--------|----------|-----|
| Subtle | 0.10 | 0.05 | 0.10 | 0.24 | Background glass, log-summary |
| **Standard** (nav pill) | **0.22** | **0.09** | **0.15** | **0.40** | Floating nav — current shipped |
| Prominent | 0.28 | 0.12 | 0.18 | 0.48 | Modal overlays, focus surfaces |
| Dark/muted | — | 0.05 | 0.10 | 0.20 | Pulse rows on dark cards (no color glow) |

---

## 11. HomePanel build-parse stability (2026-04-03)

**Issue observed:** deployment logs reported a Babel parse error in `HomePanel.jsx` around the funded-goal prop additions.

**Hardening applied:**
- Normalized `HomePanel.jsx` to UTF-8 (no BOM) with LF-only line endings.
- Verified production compile succeeds after normalization with `npm run build`.

**Result:** Home panel math/features remain unchanged, but parser stability is now deterministic across local + Vercel build environments.

---

## 14. Swipeable Stacks — Horizontal Snap Cards (2026-04-13)

**Goal:** Convert weekly income rows (`IncomePanel`) and active goal cards (`HomePanel`) from vertical stacks into horizontal scroll-snap cards. Cuts mobile scrolling without touching data layer. Full spec: `docs/swipeable-stacks-sprint.md`.

**Files:** `src/hooks/useSwipeStack.js` · `src/components/ui.jsx` · `src/components/IncomePanel.jsx` · `src/components/HomePanel.jsx` · `src/index.css`

**Design constraints (all sprints):** CSS `scroll-snap-type: x mandatory` — no Framer Motion. Tokens only — no raw hex. No bounce, no scale-up on mount. Mobile-first; desktop degrades to existing layout.

---

### Sprint 1 — Core primitives (SHIPPED 2026-04-13)

**`src/hooks/useSwipeStack.js`** — `useSwipeStack(count)` → `{ containerRef, activeIndex }`. Attaches `IntersectionObserver` (threshold 0.6, root-scoped to scroll container) to every snap child. Reports the most-visible child index. Guards for SSR/jsdom (`typeof IntersectionObserver === "undefined"`).

**`src/components/ui.jsx`** — two new exports:

- **`PaginationDots({ count, active, color })`** — frosted glass pill indicator. Active dot = `--color-accent-primary`; inactive = `rgba(0,200,150,0.28)`. 200ms transition. Glass pill uses Subtle preset inline: `blur(12px)`, tint 0.06α, border 0.14α.
- **`ScrollSnapRow({ children, itemWidth, gap, showDots, dotColor })`** — flex container with `scroll-snap-type: x mandatory`, `scrollbarWidth: none`, and `.snap-scroll-row::-webkit-scrollbar { display:none }` CSS class (added to `src/index.css`). Each child is wrapped in a snap-aligned div. Dots render only when `count > 1`.

---

### Sprint 2 — IncomePanel weekly rows (IN PROGRESS)

**Target:** Replace the vertical `<table>` in the weekly subview with `ScrollSnapRow` on mobile (< 768px). Desktop keeps the existing table + sticky header unchanged.

**Each snap card shape:**
```
Wk End date  [← now badge]
─────────────────────────
GROSS          $1,234.56
TAKE HOME        $980.00   ← green=exempt, primary=taxed, disabled=past
─────────────────────────
5-Day · PROJECTED   [TX/EX]
```

**Key rules:** `itemWidth="min(80vw, 260px)"`. `isCurrent` card border = `var(--color-accent-primary)`. Past weeks `opacity: 0.65`. Sticky header JS block removed on mobile only. "Full Detail" modal button preserved. `archivedWeeklyRows` footnote preserved.

**Current state:** `ScrollSnapRow` import and `isMobile` state added to `IncomePanel.jsx`. The table-to-snap card conversion of the weekly view body is the remaining work.

---

### Sprint 3 — HomePanel active goal cards (PENDING)

Wrap `{tl.map((g, i) => ...)}` goal card block in `ScrollSnapRow` with `itemWidth="min(88vw, 340px)"`. Card body is verbatim — only the container changes from vertical margin-stacking to horizontal snap. `draggable`/`onDragStart` props removed from card when inside snap row (reorder via ↑ ↓ buttons only on mobile). Desktop keeps existing vertical list. Inline edit form and celebrating pulse are untouched.

---

### Sprint 4 — QA + cleanup (PENDING)

Mobile checklist: 390px / 375px — no horizontal bleed on app shell. `scroll-snap-type` must not conflict with main-content scroll container. iOS Safari momentum scroll (`-webkit-overflow-scrolling: touch`) verified. Edge cases: 0 / 1 / 3 / 20 rows. "Full Detail" modal and goal inline edit verified inside snap cards.

---

### Sprint 5 — Goal card identity + Reorder Modal (PENDING)

**5a. Ghost ordinal number** — each goal card gets a large background ordinal (`96px` desktop / `72px` mobile, `font-weight: 900`, `rgba(255,255,255,0.09)`, `position: absolute`, `top: -8px`, `right: 12px`, `pointer-events: none`). Card container needs `position: relative; overflow: hidden`.

**5b. REORDER button** — replaces the ↑ ↓ `SmBtn` pair on each card footer. Single button opens the Reorder Modal (5c).

**5c. Reorder Modal** — bottom sheet on mobile / centered on desktop. Contains a horizontal `ScrollSnapRow` of mini-cards (`min(40vw, 140px)` × 80px). Two interaction modes: drag-and-drop on desktop (`pointer: fine`), tap-to-select + ← → arrow buttons on touch (`pointer: coarse`). Uses existing `moveGoal()` — no new data shape. Modal chrome: `position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.82); align-items: flex-end`.

**What does NOT change:** label, target $, timeline fill bar, month markers, finish-week label, EDIT form, DONE/delete buttons, `computeGoalTimeline`, `deriveRollingTimelineMonths`.
