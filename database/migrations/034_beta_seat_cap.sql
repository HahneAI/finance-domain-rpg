-- ─────────────────────────────────────────────────────────────────────────────
-- 034_beta_seat_cap.sql
--
-- Hard 40-seat cap on the beta program. Enforced at the database level, not
-- just in api/seed.js's application code — same "the real gate is server/RLS
-- (here: trigger)-side, not client or even application-server-side alone"
-- posture as migration 031's beta_activity_events eligibility trigger, and
-- for the same reason: a pre-check-then-write in JS has a TOCTOU race (two
-- redemptions landing in the same window could both pass a "39 taken" check
-- and put the program at 41). A BEFORE trigger's count-then-raise happens
-- inside the same transaction as the write it's guarding, closing that race
-- completely — Postgres won't run two concurrent triggers past each other on
-- the same table without serializing.
--
-- Scope: only fires on the transition INTO having a beta code — null→non-null
-- on INSERT, or a changed value on UPDATE (mirrors 027's beta_started_at
-- trigger's own transition guard). An already-enrolled account saving
-- unrelated fields, or the day-71 offboarding script clearing
-- beta_code_used back to null (database/beta-offboarding-day71.sql), must
-- never trip this — the cap is about NEW enrollments, not existing ones.
--
-- SECURITY DEFINER: not strictly load-bearing today (the only realistic
-- caller is api/seed.js's service-role client, which already has full table
-- read access), but included from the start anyway per 031's own precedent —
-- defensive-correct now rather than a footgun if a future write path to this
-- column ever changes shape.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function check_beta_seat_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seats_taken integer;
  v_seat_cap constant integer := 40;
begin
  if NEW.beta_code_used is not null
     and (TG_OP = 'INSERT' or OLD.beta_code_used is distinct from NEW.beta_code_used) then
    -- BEFORE trigger: this row's own new value isn't committed yet, so
    -- counting existing beta_code_used-populated rows correctly excludes it —
    -- v_seats_taken is "seats taken before this one," not including it.
    select count(*) into v_seats_taken from user_data where beta_code_used is not null;
    if v_seats_taken >= v_seat_cap then
      raise exception 'beta program is full — % of % seats taken', v_seats_taken, v_seat_cap;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_beta_seat_cap on user_data;
create trigger trg_check_beta_seat_cap
  before insert or update on user_data
  for each row
  execute function check_beta_seat_cap();

-- ── Verification (run after applying) ────────────────────────────────────────
--   select count(*) from user_data where beta_code_used is not null;
--     -> confirm current seat count before testing
--   With fewer than 40 seats taken, redeem a code on a test account — must succeed.
--   Manually fill the remaining seats (or lower v_seat_cap to e.g. 1 for a quick
--   local test), then attempt one more redemption:
--     update user_data set beta_code_used = 'overflow-test' where user_id = '<41st account>';
--     -> must fail: "beta program is full — 40 of 40 seats taken"
--   Confirm an already-enrolled account can still be updated on unrelated
--   columns without tripping the trigger (e.g. update display_name).
--   Confirm the day-71 offboarding script's beta_code_used = null clears still
--   work (transition OUT of a code is never blocked — only INTO one).
