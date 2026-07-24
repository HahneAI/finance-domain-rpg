-- ─────────────────────────────────────────────────────────────────────────────
-- 030_add_beta_feedback.sql
--
-- docs/TODO.md §33 (upgraded from Option A → Option B — see that section's own
-- note on when this upgrade becomes worth it: "only worth it if... becomes hard
-- to correlate." The beta scoring rubric now requires it outright — "Feedback
-- Submitted — 25 pts, frequency + specificity" can't be scored from a mailto
-- link, which produces zero queryable data. This closes that gap.
--
-- Adds a 'feedback' event_type and a nullable `note` column (only populated on
-- feedback rows — every other event_type leaves it null) to the existing
-- beta_activity_events table (026) rather than a separate table, since it's
-- still one append-only fact-per-row log for the same tracked cohort, gated
-- the same way (isTrackedBetaTester, enforced client-side at the call site).
--
-- No length constraint on `note` — capped client-side (textarea maxLength)
-- instead. ~40 known, personally-invited beta users; not worth a DB-level
-- guard for this population.
--
-- Postgres auto-names an inline CHECK constraint <table>_<column>_check, so
-- dropping/recreating it by that name is safe and matches how this constraint
-- was originally created in 026 (also inline, no explicit name).
-- ─────────────────────────────────────────────────────────────────────────────

alter table beta_activity_events
  drop constraint if exists beta_activity_events_event_type_check;

alter table beta_activity_events
  add constraint beta_activity_events_event_type_check
  check (event_type in (
    'login', 'goal_created', 'goal_updated',
    'expense_created', 'expense_updated', 'feedback'
  ));

alter table beta_activity_events
  add column if not exists note text;

-- ── Verification (run after applying) ────────────────────────────────────────
--   insert into beta_activity_events (user_id, event_type, note)
--     values ('<some tracked beta user>', 'feedback', 'test feedback text');
--     -> should succeed
--   insert into beta_activity_events (user_id, event_type) values ('<user>', 'bogus');
--     -> must fail (check constraint violation)
