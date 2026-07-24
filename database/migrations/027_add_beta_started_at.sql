-- ─────────────────────────────────────────────────────────────────────────────
-- 027_add_beta_started_at.sql
--
-- docs/TODO.md §30 — scopes the beta usage report to each tester's ACTUAL
-- 10-week window instead of all-time activity. beta_code_used (025) has no
-- timestamp, so api/admin-beta-report.js currently sums every event ever
-- logged for a tracked tester — silently wrong the moment codes go out
-- staggered, since tester A's week 1 and tester B's week 1 aren't the same
-- calendar date.
--
-- Auto-stamped, not a third manual field to remember alongside is_tester/
-- beta_code_used — mirrors set_tester_trial_window() (migration
-- 021_add_is_tester_beta_flag.sql) exactly: a trigger fires the moment
-- beta_code_used transitions from null to a real value (or changes to a
-- different value — treated the same as a fresh start), stamping
-- beta_started_at = now(). Re-saving the same beta_code_used value does NOT
-- re-stamp it — this only matters for direct beta_code_used writes (manual
-- SQL today, api/seed-beta.js once §32 lands); ordinary client saves never
-- include beta_code_used in their payload at all (saveUserData's destructure
-- excludes it), so they can't accidentally reset this either way.
--
-- Column privilege: same client-write protection as beta_code_used/is_tester —
-- never added to the authenticated column-grant list.
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_data
  add column if not exists beta_started_at timestamptz;

create or replace function set_beta_started_at()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.beta_code_used is not null then
      NEW.beta_started_at := now();
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.beta_code_used is not null and OLD.beta_code_used is distinct from NEW.beta_code_used then
      NEW.beta_started_at := now();
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_set_beta_started_at on user_data;
create trigger trg_set_beta_started_at
  before insert or update on user_data
  for each row
  execute function set_beta_started_at();

-- ── Verification (run after applying) ────────────────────────────────────────
--   update user_data set is_tester = true, beta_code_used = 'BETA10W'
--     where user_id = '<some existing account>';
--   select beta_code_used, beta_started_at from user_data where user_id = '<same user>';
--     -> beta_started_at should be ~now()
--   Run an update that changes an unrelated column only (not beta_code_used):
--     -> beta_started_at should NOT move
--   Update beta_code_used to a different non-null value:
--     -> beta_started_at SHOULD move to the new now() (treated as a fresh start)
