# Audit TODO — Codex Task Review & Documentation Update

Temporary working file. Delete when all tasks complete.

**Goal:** Build `active-systems.md` as the authoritative living doc of how the app works,
then use it to update the README and touch up CLAUDE.md.

---

## Phase 1 — Codex Task Audits → active-systems.md

One entry per task. For each: read the spec, confirm what shipped, document the
live behavior and any known issues.

- [x] Task 1 — `FEATURE_drag_reorder_expense_cards_with_category_preview`
- [ ] Task 2 — `FEATURE_expense_inline_editor_pay_cycle_math`
- [ ] Task 3 — `FEATURE_goals_timeline_monthly_weekly_grid_rebuild`
- [ ] Task 4 — `FEATURE_rolling_active_view_hide_old_data_prepare_full_year_review`
- [ ] Task 5 — `BUGFIX_budget_events_takehome_math_goals_audit_tax_payback_adjustment`
- [ ] Task 6 — `BUG_expense_pay_period_vs_monthly_math_audit`
- [ ] Task 7 — `FEATURE_year_summary_use_adjusted_net_with_event_loss_info_modal`
- [ ] Task 8 — `FEATURE_log_tab_hero_cleanup_and_effect_summary_card`
- [ ] Task 9 (UI/Flow) — already captured in `authority-design-system`

---

## Phase 2 — README Update

- [ ] Rewrite README to reflect current app state, Authority OS branding, and actual feature set
- [ ] Cover: what the app is, tech stack, how to run it locally, key panels/features

---

## Phase 3 — CLAUDE.md Touchups

- [ ] Update CLAUDE.md UI Component Standards section to reflect Flow tokens (currently documents old gold/DM Serif system)
- [ ] Update shared primitives table to match current `ui.jsx` exports and props
- [ ] Add Authority OS naming (A:Fin, etc.) and dual-layer design system reference
- [ ] Remove or note stale references (DM Serif Display, gold `#c9a84c`)
