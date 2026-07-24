-- ─────────────────────────────────────────────────────────────────────────────
-- 031_beta_activity_events_eligibility_trigger.sql
--
-- Drift-warden finding (2026-07-24 pass, cross-checked against
-- docs/drift-app-warden.md §20's cardinal rule: "Every gate exists twice or
-- not at all. Client-side gating is UX; the real gate is server/RLS-side. A
-- gated surface checked only client-side is a drift finding.") —
-- beta_activity_events' INSERT policy (migration 026) only checks
-- `auth.uid() = user_id`, same as every other own-row table in this schema.
-- The actual "only tracked beta testers write here" rule
-- (is_tester = true AND beta_code_used IS NOT NULL) was enforced ENTIRELY by
-- src/lib/entitlements.js isTrackedBetaTester() being called before every
-- insert — a client-side JS check, not a real boundary. Any authenticated
-- user could bypass it via devtools and insert arbitrary rows for their own
-- user_id.
--
-- Practical severity was already low — docs/TODO.md §30's window-scoping
-- (a user's report counts only events within THEIR OWN beta_started_at ..
-- +10 weeks window) means any events self-inserted before a real redemption
-- fall outside that window and can never count toward a score, and nothing
-- privileged (money, entitlement, feature access) is unlocked by this table.
-- But closing it properly is cheap and matches the codebase's existing
-- security-definer-trigger pattern (021/024's is_tester trial-window trigger,
-- 027's beta_started_at trigger) rather than leaving a documented-but-open gap.
--
-- SECURITY DEFINER is required from the start here — 021's original trigger
-- shipped WITHOUT it and needed a follow-up fix in 024 once it tried to write
-- columns the calling client-role couldn't touch under its own privileges.
-- This trigger only READS user_data (not writes), but the calling role
-- (authenticated) still needs elevated privilege to read another table's row
-- during its own INSERT — SECURITY DEFINER from day one avoids repeating that
-- exact class of mistake.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function check_beta_activity_event_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_tester boolean;
  v_beta_code_used text;
begin
  select is_tester, beta_code_used
    into v_is_tester, v_beta_code_used
    from user_data
    where user_id = NEW.user_id;

  if v_is_tester is not true or v_beta_code_used is null then
    raise exception 'beta_activity_events insert rejected: % is not a tracked beta tester', NEW.user_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_check_beta_activity_event_eligibility on beta_activity_events;
create trigger trg_check_beta_activity_event_eligibility
  before insert on beta_activity_events
  for each row
  execute function check_beta_activity_event_eligibility();

-- ── Verification (run after applying) ────────────────────────────────────────
--   -- As a user WITHOUT is_tester/beta_code_used set, attempt (via the app or
--   -- a direct authenticated client call):
--   --   insert into beta_activity_events (user_id, event_type) values (auth.uid(), 'login');
--   -- -> must fail: "beta_activity_events insert rejected: ... is not a tracked beta tester"
--   -- As a real tracked beta tester (is_tester=true, beta_code_used set), the
--   -- same insert must succeed — confirm the app's normal login/goal/expense/
--   -- feedback logging still works end-to-end after applying this migration.
