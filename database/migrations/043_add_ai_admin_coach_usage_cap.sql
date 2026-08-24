-- ─────────────────────────────────────────────────────────────────────────────
-- 043_add_ai_admin_coach_usage_cap.sql
--
-- Rudimentary daily Coach-call cap for is_ai_admin accounts (migration 042).
-- 2026-08-24 — is_ai_admin was upgraded to full tester-tier front-line
-- feature access (entitlements.js hasTesterAccess/hasPrivilegedAccess), which
-- includes Ask Coach. Unlike a human beta tester, an AI agent can loop a
-- chat far faster than any person would, which could burn through the shared
-- Anthropic API budget during routine feature testing. api/coach.js enforces
-- a daily call cap for is_ai_admin accounts ONLY, using these two counter
-- columns — every other account tier (admin, tester, investor, real
-- trial/paid) is completely unaffected and never touches these columns.
--
-- Deliberately a plain daily counter, not a sliding window or token-bucket —
-- "rudimentary" by design; tighten later if it proves too coarse.
--
-- Column privilege: same as every other privileged column since migration
-- 019's RLS lockdown — these are NOT added to the client's INSERT/UPDATE
-- column-grant list, so an is_ai_admin account cannot read-then-reset its
-- own counter via the anon-key client. api/coach.js writes them exclusively
-- through a service-role client (SUPABASE_SERVICE_ROLE_KEY), same pattern as
-- api/delete-account.js.
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_data
  add column if not exists ai_admin_coach_calls_date date,
  add column if not exists ai_admin_coach_calls_count integer not null default 0;

-- ── Verification (run after applying) ────────────────────────────────────────
--   -- As the is_ai_admin account, attempt a client-side write (should fail):
--   update user_data set ai_admin_coach_calls_count = 0 where user_id = auth.uid();
--     -> should fail/affect 0 columns under the migration 019 column-grant policy
--   -- After exercising Ask Coach past AI_ADMIN_COACH_DAILY_LIMIT (default 25) in
--   -- one UTC day, the next api/coach.js call should return HTTP 429 with the
--   -- "AI Admin Coach usage cap reached" message.
