-- ─────────────────────────────────────────────────────────────────────────────
-- 048_beta_events_identity_and_goal_limits.sql
--
-- docs/TODO.md §31 Phase 4 — the tuning loop for Goal Archetypes. The starter
-- goal dollars and the suggested Lifestyle bills are rough guesses; the only way
-- to tune them is to see what the beta cohort picks, accepts, dismisses, and
-- where they hit the new goal limits. Widens beta_activity_events' event_type
-- CHECK with four types. `note` (030) carries the detail:
--   archetype_selected   note = archetype id        ("builder")
--   suggestion_accepted  note = suggestion templateKey ("heartbeat.gym")
--   suggestion_dismissed note = suggestion templateKey
--   goal_limit_hit       note = "count" | "amount"
--
-- Purely additive: every existing event_type stays valid; no data is touched.
-- Same drop/re-add-by-auto-name pattern as 030. The eligibility trigger (031)
-- is unchanged and still gates every insert to the tracked cohort.
--
-- Until this runs, the client's inserts of the four new types fail the old
-- CHECK and logBetaEvent only console.warns — nothing user-facing breaks.
-- ─────────────────────────────────────────────────────────────────────────────

alter table beta_activity_events
  drop constraint if exists beta_activity_events_event_type_check;

alter table beta_activity_events
  add constraint beta_activity_events_event_type_check
  check (event_type in (
    'login', 'goal_created', 'goal_updated',
    'expense_created', 'expense_updated', 'feedback',
    'archetype_selected', 'suggestion_accepted', 'suggestion_dismissed', 'goal_limit_hit'
  ));

-- ── Verification (run after applying) ────────────────────────────────────────
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'beta_activity_events_event_type_check';
--   -- expect all ten types listed
--   select event_type, note, count(*) from beta_activity_events
--    where event_type in ('archetype_selected','suggestion_accepted','suggestion_dismissed','goal_limit_hit')
--    group by 1, 2 order by 3 desc;
