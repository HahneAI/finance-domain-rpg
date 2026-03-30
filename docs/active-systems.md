# Authority OS — Active Systems Reference

Living document. Describes what is currently built and how each system works.
Updated incrementally as Codex task audits complete.

**Last updated:** 2026-03-30
**App:** Authority Finance (A:Fin) — flagship pillar
**Design system:** Flow shell + Pulse overlay (see `authority-design-system`)

---

## How to use this doc

Each section covers one feature system: what it does, how the data flows,
known behavior rules, and any open issues. This is the reference point for
both human developers and AI agents working on the codebase.

---

## System Index

| # | System | Source Task | Status |
|---|--------|------------|--------|
| 1 | Expense Drag-and-Drop Reorder | Task 1 | Audited — known issue logged |
| 2 | Expense Inline Editor + Pay Cycle Math | Task 2 | Pending audit |
| 3 | Goals Timeline — Monthly/Weekly Grid | Task 3 | Pending audit |
| 4 | Rolling Active Views + Progressive Scaling | Task 4 | Pending audit |
| 5 | Budget Events / Adjusted Take-Home / Tax Payback | Task 5 | Pending audit |
| 6 | Expense Pay Period vs Monthly Math | Task 6 | Pending audit |
| 7 | Year Summary Card — Adjusted Net + Event Loss Modal | Task 7 | Pending audit |
| 8 | Log Tab Layout — Hero Cleanup + Log Effect Summary | Task 8 | Pending audit |

---

---

## 1. Expense Drag-and-Drop Reorder

**Source task:** `FEATURE_drag_reorder_expense_cards_with_category_preview`
**Type:** Feature
**Files affected:** Expense list components, expense card component, drag state logic

### What it does

Allows users to reorder expense cards within their list via click-and-drag.
When a card is dragged across a category boundary (Expenses → Lifestyle or
vice versa), the dragged card shows a live visual color fade preview toward
the destination category before the card is dropped.

### Behavior rules

- Drag-and-drop is scoped to the **Expenses tab only**
- Reorder persists within the expense list order
- Cross-category drag (Expenses ↔ Lifestyle) shows a color transition preview
  on the dragged card while hovering over the destination zone
- Preview resets cleanly on: drop, drag cancel, drag leave
- No new dependencies introduced — built on the app's existing drag pattern

### Category preview logic

- On `dragenter` / `dragover` into a destination category zone: apply fade
  toward destination category color on the dragged card
- On `dragleave`, `drop`, or `dragend`: reset card to original color state
- Preview is localized to the dragged card only — other cards do not animate

### Known issue — Goals tab contamination (post-commit)

The initial implementation accidentally applied the Expenses/Lifestyle split
container layout to the **Goals tab** as well. The Goals tab should be a
single-section layout — it does not have Expense Goals / Lifestyle containers.

**Required fix (tracked in TODO):**
- Restore Goals panel to single-section layout
- Remove unintended Expense Goals / Lifestyle split containers from Goals tab
- The Goals timeline bar must remain unchanged — no visual rollback
- Drag-and-drop category interaction must remain scoped to Expenses tab only

**Validation when fixed:**
- Goals tab renders as one section
- Goals timeline bar unchanged
- Expenses tab retains drag/drop category behavior
- No cross-tab UI coupling

---

---

## 2. Expense Inline Editor + Pay Cycle Math

**Source task:** `FEATURE_expense_inline_editor_pay_cycle_math`
**Status:** Pending audit

*To be documented after Task 2 code review.*

---

## 3. Goals Timeline — Monthly/Weekly Grid

**Source task:** `FEATURE_goals_timeline_monthly_weekly_grid_rebuild`
**Status:** Pending audit

*Confirmed shipped per CODEX_MEMORY entry (2026-03-28):*
> "Replaced the single continuous goal fill bar with a month-notated track in
> BudgetPanel: timeline now builds month segments from futureWeeks, applies
> subtle 4-part visual subdivisions per month, and labels each month on the
> goal card. Goal funding fill now renders as discrete weekly chunks."

*Full behavior documentation pending deeper code audit.*

---

## 4. Rolling Active Views + Progressive Scaling

**Source task:** `FEATURE_rolling_active_view_hide_old_data_prepare_full_year_review`
**Status:** Pending audit

*Rules documented in `docs/rolling-active-view-scaling.md`:*

**Weekly timelines:**
- Show last 4 completed weeks + current week + all remaining weeks through EOY
- Older completed weeks hidden from main view (data preserved)

**Monthly timelines (goals):**
- Show previous month + current month + all remaining months through EOY
- Older months hidden from main view (data preserved)

**Progressive scaling:** ~1.00x early year → ~1.15x EOY cap, gradual increment

*Full behavior documentation pending deeper code audit.*

---

## 5. Budget Events / Adjusted Take-Home / Tax Payback

**Source task:** `BUGFIX_budget_events_takehome_math_goals_audit_tax_payback_adjustment`
**Status:** Pending audit

*To be documented after Task 5 code review.*

---

## 6. Expense Pay Period vs Monthly Math

**Source task:** `BUG_expense_pay_period_vs_monthly_math_audit`
**Status:** Pending audit

*To be documented after Task 6 code review.*

---

## 7. Year Summary Card — Adjusted Net + Event Loss Modal

**Source task:** `FEATURE_year_summary_use_adjusted_net_with_event_loss_info_modal`
**Status:** Pending audit

*To be documented after Task 7 code review.*

---

## 8. Log Tab — Hero Cleanup + Log Effect Summary

**Source task:** `FEATURE_log_tab_hero_cleanup_and_effect_summary_card`
**Status:** Pending audit

*To be documented after Task 8 code review.*

---

---

## Core Architecture Notes

### Data flow overview (current understanding)

```
SetupWizard (config input)
    ↓
buildYear() → per-week paycheck projections (52-week array)
    ↓
computeNet() → per-check net after taxes, deductions, events
    ↓
futureWeekNets[] → fed into BudgetPanel
    ↓
computeGoalTimeline() → per-week surplus → goal funding sequences
```

**Known gap (from CODEX_MEMORY 2026-03-28):**
`buildYear()` pre-tax deduction pool currently only applies `cfg.ltd` and
`k401kEmployee`. Insurance premiums (`healthPremium`, `dentalPremium`,
`visionPremium`, `stdWeekly`, `lifePremium`) and account contributions
(`hsaWeekly`, `fsaWeekly`) are collected in config but NOT applied — causing
taxable income and take-home projections to be overstated. Tracked in
TODO section 8 (Benefits → Deductions Pipeline).

### Key files

| File | Role |
|------|------|
| `src/App.jsx` | Root shell, nav routing, auth gate, week state |
| `src/components/ui.jsx` | All shared primitives: MetricCard, NT, VT, SmBtn, SH, iS, lS |
| `src/components/HomePanel.jsx` | Dashboard home — interactive metric tiles |
| `src/components/IncomePanel.jsx` | Income breakdown — Overview/Monthly/Weekly/Tax tabs |
| `src/components/BudgetPanel.jsx` | Expenses/Goals/Loans tabs + goal timeline |
| `src/components/BenefitsPanel.jsx` | 401k + PTO tracking |
| `src/components/LogPanel.jsx` | Event log — hero cards + Log Effect Summary + history |
| `src/components/WeekConfirmModal.jsx` | Weekly schedule confirmation + event logging |
| `src/components/SetupWizard.jsx` | Multi-step onboarding (pay structure, schedule, deductions, tax) |
| `src/components/LoginScreen.jsx` | Auth shell (sign in, sign up, password recovery) |
| `src/components/ProfilePanel.jsx` | Account + employment settings |
| `src/index.css` | All design tokens (`@theme` block) — single source of truth |

### Fiscal year model

- `FISCAL_YEAR_START` is a centralized constant
- App tracks current fiscal week (Week X of 52)
- `today` state ticks at midnight and cascades reactively through all panels
- Week badge shown in header, log, benefits, budget phase — all in sync

---

*This document grows as each Codex task is audited. See `audit-TODO.md` for
remaining work and `authority-design-system` for the visual/brand layer.*
