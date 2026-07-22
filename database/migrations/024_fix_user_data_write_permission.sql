-- ─────────────────────────────────────────────────────────────────────────────
-- 024_fix_user_data_write_permission.sql
--
-- Fixes "permission denied for table user_data" on saveUserData()'s upsert.
-- CONFIRMED root cause (via a live Supabase API log entry showing the exact
-- SQL PostgREST generated for the failing request — see the addendum in
-- 022_BOOKMARK_schema_snapshot_2026-07-10.sql for the full investigation
-- trail, including the theories that were ruled out along the way: is_tester
-- trigger privileges, RLS policies, key/URL mismatches, custom auth hooks,
-- and a plain-SQL simulated write that succeeded — all before the real cause
-- was found).
--
-- ── Root cause ──
-- saveUserData() (src/lib/db.js) calls supabase-js's
-- `.upsert(row, { onConflict: "user_id" })`. PostgREST compiles this into:
--
--   INSERT INTO user_data (...) SELECT ... FROM json_to_record(...)
--   ON CONFLICT (user_id) DO UPDATE SET
--     "config" = EXCLUDED."config", ...,
--     "user_id" = EXCLUDED."user_id",   <-- included automatically
--     "week_confirmations" = EXCLUDED."week_confirmations"
--
-- PostgREST's DO UPDATE SET clause includes EVERY column present in the
-- request payload — including the conflict-target column itself
-- (`user_id`) — even though its value is definitionally unchanged (it's
-- the column the conflict was matched on). Postgres checks column-level
-- UPDATE privilege for every column named in a SET clause regardless of
-- whether the assigned value differs from the current one, and
-- 019_enable_user_data_rls.sql only ever granted `authenticated` INSERT on
-- user_id, never UPDATE (a completely reasonable-looking omission at the
-- time — nobody should ever need to change their own primary key). Nobody
-- anticipated that upsert's DO UPDATE SET mechanics would attempt to
-- "update" it anyway, to the same value, as an unavoidable side effect of
-- how the SET clause is built from the payload.
--
-- Because a single missing column privilege fails the ENTIRE statement, and
-- saveUserData() always includes user_id in its payload (required for the
-- insert half of every upsert), this has been failing for every account,
-- on every save, unconditionally, since 019 went live — not intermittently,
-- not tied to is_tester, not tied to network conditions. Confirmed by
-- App.jsx's savePersistedStateNow (previously this only ever hit
-- console.error, invisible until the SaveFailedBanner surfaced it).
--
-- ── Fix ──
-- Grant `authenticated` UPDATE on user_id too. Safe: the existing
-- "user_data own row update" RLS policy's WITH CHECK (auth.uid() = user_id)
-- already guarantees a row can never actually end up with a different
-- user_id after an update — RLS enforces that independent of column grants,
-- so this doesn't open any new ability to reassign a row to someone else.
-- It only lets Postgres past the SET-clause privilege check for a column
-- whose value RLS already guarantees can't meaningfully change.
--
-- ── Also included: set_tester_trial_window() → SECURITY DEFINER ──
-- A second, independent, real bug found during the same investigation (see
-- the 022 addendum) — not the cause of the failures reported here (both
-- accounts investigated had is_tester=false, so that trigger's privileged
-- branch never actually fired for them), but worth fixing in the same
-- migration since it's the exact same failure class waiting to happen for
-- any account where is_tester actually is true: the trigger assigns
-- trial_started_at/trial_ends_at/access_ends_at (deliberately excluded from
-- authenticated's grant, same protection as every other billing column) as
-- plain SECURITY INVOKER, so it hits the identical "trying to SET a column
-- the calling role can't UPDATE" failure the moment its guarded branch
-- actually runs. Fixed by running it as SECURITY DEFINER instead — the
-- SQL-side equivalent of the service-role escalation api/seed-trial.js
-- already uses for the same columns on the application side. search_path is
-- pinned per Postgres's standard SECURITY DEFINER guidance.
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

-- Re-assert 019's grants, PLUS the one column it was missing: user_id on
-- UPDATE. GRANT is additive/idempotent — safe to re-run even where already
-- correct; REVOKE-then-GRANT is the same pattern 019 itself already uses.
revoke insert, update on user_data from anon, authenticated;

grant insert (
  user_id, config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) on user_data to authenticated;

grant update (
  user_id, config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) on user_data to authenticated;

-- ── Verification (run after applying) ────────────────────────────────────────
--   Signed in as any account, save any change from the app (or just let the
--   debounced autosave fire) — "permission denied for table user_data"
--   should no longer appear, the SaveFailedBanner should not reappear on a
--   normal save, and Supabase's API logs should show a 200/201 for the
--   POST/PATCH to /rest/v1/user_data instead of a 42501 error.
--
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--     where table_name = 'user_data' and grantee = 'authenticated'
--       and column_name = 'user_id';
--     -> should now list INSERT, REFERENCES, SELECT, and UPDATE
--
--   select prosecdef from pg_proc where proname = 'set_tester_trial_window';
--     -> should now be true (SECURITY DEFINER)
