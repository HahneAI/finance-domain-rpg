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

-- Guard (added 2026-10-07): the first production run failed with
-- "relation beta_activity_events does not exist". That table comes from 026
-- (+ 030 note column, 031 eligibility trigger). Fail loudly with the fix
-- instead of a bare 42P01 — never create the table here (it needs 026's RLS
-- and 031's trigger, which this file must not duplicate).
do $$
begin
  if to_regclass('public.beta_activity_events') is null then
    raise exception 'beta_activity_events is missing in this database — run 026_add_beta_activity_events.sql, 030_add_beta_feedback.sql and 031_beta_activity_events_eligibility_trigger.sql first (or check you are in the production project), then re-run 048.';
  end if;
end $$;

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
