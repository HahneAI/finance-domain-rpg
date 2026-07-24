-- ─────────────────────────────────────────────────────────────────────────────
-- 029_add_beta_halfway_email_sent_at.sql
--
-- docs/TODO.md §37 — throttle state for the beta program's week-5 "halfway"
-- nudge email, same pattern as last_dunning_email_at (017_add_subscription_fields.sql):
-- stamped only after a successful send, so a failed send is simply retried on
-- the next daily cron run, and a once-sent email is never sent twice.
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_data
  add column if not exists halfway_email_sent_at timestamptz;

-- ── Verification (run after applying) ────────────────────────────────────────
--   select halfway_email_sent_at from user_data where user_id = '<some account>';
--     -> should be null until the cron sends the halfway email for that account
