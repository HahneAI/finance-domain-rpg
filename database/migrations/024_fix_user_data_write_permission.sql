-- ─────────────────────────────────────────────────────────────────────────────
-- 024_fix_user_data_write_permission.sql
--
-- Fixes "permission denied for table user_data" on saveUserData()'s upsert —
-- reported live in production/preview testing on an admin/tester account.
--
-- ── Diagnosis (best evidence available without a live DB connection — run the
--    two queries below FIRST and read the output before assuming this is the
--    cause; this migration is safe to apply either way, but confirming first
--    means we're not guessing) ──
--
--   select is_tester, trial_started_at, trial_ends_at
--     from user_data where user_id = '<the affected account's user_id>';
--   -- If is_tester is true, the theory below is very likely confirmed.
--
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--     where table_name = 'user_data' and grantee = 'authenticated'
--     order by column_name, privilege_type;
--   -- Shows exactly what the client role can currently write. trial_started_at
--   -- / trial_ends_at / access_ends_at should NOT appear here — if they do,
--   -- something else granted them and this isn't the cause.
--
-- ── Root cause ──
-- 021_add_is_tester_beta_flag.sql added set_tester_trial_window(), a
-- BEFORE INSERT OR UPDATE trigger on user_data that assigns
-- NEW.trial_started_at / NEW.trial_ends_at / NEW.access_ends_at the moment
-- is_tester transitions to true. Those columns are deliberately excluded from
-- the `authenticated` role's column-level UPDATE grant (019) — same
-- protection as every other Stripe/trial/billing column, so the client can
-- never forge trial state.
--
-- The trigger function was written as plain SECURITY INVOKER (the default —
-- no `security definer` was specified), meaning it executes with the
-- CALLING role's privileges, not elevated ones. So the instant its guarded
-- branch actually assigns those columns — is_tester flipping to true, or an
-- INSERT where it's already true — Postgres enforces the exact same
-- column-privilege check it would for a direct client UPDATE, and rejects
-- the entire statement. Since this is a BEFORE ROW trigger, the rejection
-- kills the whole upsert, not just the trigger's own side effect — so a
-- completely ordinary saveUserData() call (writing only config/expenses/
-- goals/etc., never touching is_tester or the trial columns itself) fails
-- outright for any account where is_tester is already true, every single
-- time, silently (previously only console.error'd — see App.jsx's
-- savePersistedStateNow/SaveFailedBanner for why it's visible now).
--
-- ── Fix ──
-- Run the trigger function as SECURITY DEFINER (owner-level privilege) —
-- exactly the same escalation api/seed-trial.js already uses (service role)
-- for identical columns on the application side; this is the SQL-side
-- equivalent for a DB-side trigger that needs to do the same kind of
-- privileged write as a side effect of an ordinary client action. search_path
-- is pinned to prevent a hostile search_path from shadowing an unqualified
-- identifier inside a SECURITY DEFINER function (standard Postgres guidance).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_tester_trial_window()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.is_tester = true then
      NEW.trial_started_at := now();
      NEW.trial_ends_at := now() + interval '6 months';
      NEW.access_ends_at := now() + interval '6 months';
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.is_tester = true and OLD.is_tester is distinct from true then
      NEW.trial_started_at := now();
      NEW.trial_ends_at := now() + interval '6 months';
      NEW.access_ends_at := now() + interval '6 months';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql
security definer
set search_path = public;

-- ── Belt-and-suspenders: re-assert 019's column grants exactly as written,
--    in case they've drifted from the migration's original intent for any
--    other reason. GRANT is additive/idempotent — safe to re-run even if the
--    current state already matches; REVOKE-then-GRANT is the same pattern
--    019 itself already uses, just re-applied.
revoke insert, update on user_data from anon, authenticated;

grant insert (
  user_id, config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) on user_data to authenticated;

grant update (
  config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) on user_data to authenticated;

-- ── Verification (run after applying) ────────────────────────────────────────
--   Signed in as the affected account, save any change from the app (or just
--   let the debounced autosave fire) — "permission denied for table
--   user_data" should no longer appear, and the SaveFailedBanner should not
--   reappear on a normal save.
--
--   select prosecdef from pg_proc where proname = 'set_tester_trial_window';
--     -> should now be true (SECURITY DEFINER)
