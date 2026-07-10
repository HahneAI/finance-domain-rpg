-- ─────────────────────────────────────────────────────────────────────────────
-- 021_add_is_tester_beta_flag.sql
--
-- Beta Tester account flag (docs/active-systems.md — "Beta Tester Accounts").
--
-- Purpose: give specific existing accounts access to in-progress AI features
-- (docs/TODO.md §18 standing constraint) without granting the full Admin
-- Diagnostic Toolkit. `is_tester` is set ONLY by Anthony directly in the
-- Supabase SQL editor on an already-existing account — there is no signup
-- flow, no self-service opt-in, and no client code path that can ever set it.
--
-- CRUCIAL DIVISION — read before touching this column anywhere:
--   Beta testers are NOT investors. is_tester must never be treated as
--   equivalent to is_investor, and must never grant:
--     • the investor access-code redemption flow (investor_codes/investor_users)
--     • the Demo Account Tree (gated solely on config.isInvestor client-side)
--   Keep those gates checking is_investor only. If a future change ever makes
--   is_tester imply investor-like behavior, that's a bug — undo it.
--
-- Auto trial window: per the standing app-side trial system (migration 017 /
-- src/lib/subscription.js getEntitlement), flipping is_tester from false→true
-- auto-seeds a 6-month trial window (trial_ends_at = access_ends_at = +6
-- months, no separate hidden grace period — testers have no Stripe billing to
-- recover from, so there's nothing for a grace window to bridge). This is a
-- ONE-TIME seed on the false→true transition, not a continuously-renewed
-- window — to extend an existing tester's window, update trial_ends_at /
-- access_ends_at directly, or toggle is_tester off then back on.
--
-- Column privilege: is_tester is a brand-new column added after migration
-- 019's RLS lockdown (`revoke insert, update on user_data from anon,
-- authenticated`, followed by a narrow column-level grant list). Since this
-- column is never added to that grant list, the client has NO write access to
-- it by default — same protection as is_admin/is_investor, no extra policy
-- needed here.
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_data
  add column if not exists is_tester boolean not null default false;

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
$$ language plpgsql;

drop trigger if exists trg_set_tester_trial_window on user_data;
create trigger trg_set_tester_trial_window
  before insert or update on user_data
  for each row
  execute function set_tester_trial_window();

-- ── Verification (run after applying) ────────────────────────────────────────
--   update user_data set is_tester = true where user_id = '<some existing user>';
--   select is_tester, trial_started_at, trial_ends_at, access_ends_at
--     from user_data where user_id = '<same user>';
--     -> trial_ends_at / access_ends_at should be ~6 months from now
--   Run the same update again (is_tester already true, no-op transition):
--     -> trial_ends_at should NOT move (only fires on false→true)
