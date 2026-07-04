-- ─────────────────────────────────────────────────────────────────────────────
-- 019_enable_user_data_rls.sql
--
-- SECURITY FIX — closes the critical hole documented in
-- docs/security-audit-2026-07-04.md (Finding #1).
--
-- Today `user_data` has RLS DISABLED (see 001_initial_schema.sql). Because the
-- Supabase anon key is embedded in the shipped client bundle, ANY visitor can
-- point supabase-js at the project and:
--   • SELECT every row → dump all users' finances, PII, Stripe ids, trial state
--   • UPDATE/DELETE any row → tamper with or destroy any account
--   • set is_admin = true on their own row → unlock the "admin-only" RLS
--     policies on investor_users / investor_codes / demo_accounts
--   • forge billing columns → free premium once the paywall is enforced
--
-- This migration:
--   (A) enables RLS with own-row policies (auth.uid() = user_id), and
--   (B) locks privileged columns so an authenticated user can only ever write
--       their OWN, non-privileged fields — even on their own row.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ REQUIRED COMPANION CODE CHANGES — apply these BEFORE running this migration,
--    or the listed client writes will start failing:
--
--    Section (B) revokes client UPDATE on is_admin, is_investor,
--    tax_projections_enabled and every Stripe/trial/subscription column. Two
--    client functions currently write some of those columns with the anon key
--    and MUST move to a service-role server route first:
--
--      1. src/lib/db.js `syncUserProfile()` — seeds trial_started_at /
--         trial_ends_at / access_ends_at / subscription_status on first login.
--         Move this seeding into a service-role route (e.g. api/seed-trial.js)
--         or a SECURITY DEFINER function. display_name / avatar_url stay
--         client-writable (they are in the granted column list below).
--
--      2. src/lib/db.js `createInvestorAccount()` — sets is_investor = true on
--         the seeded user_data row. Move that flag write to a service-role
--         route, or seed it via a SECURITY DEFINER function keyed off a
--         validated investor code.
--
--    saveUserData() and the LoginScreen signup insert only touch non-privileged
--    columns, so they keep working unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (A) Enable RLS + own-row policies ────────────────────────────────────────

alter table user_data enable row level security;

-- A user may read only their own row. The admin-check sub-selects used by the
-- investor_users / investor_codes / demo_accounts policies read
-- `user_data WHERE user_id = auth.uid()`, i.e. the caller's own row, so they
-- keep working under this policy.
create policy "user_data own row select"
  on user_data for select to authenticated
  using (auth.uid() = user_id);

create policy "user_data own row insert"
  on user_data for insert to authenticated
  with check (auth.uid() = user_id);

create policy "user_data own row update"
  on user_data for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_data own row delete"
  on user_data for delete to authenticated
  using (auth.uid() = user_id);

-- ── (B) Column-level write protection ────────────────────────────────────────
-- Own-row policies alone still let a user write ANY column of their own row —
-- including is_admin. Postgres column privileges are the layer that stops that.
-- We revoke blanket write access from the client roles, then grant back only the
-- columns the client legitimately owns. The service_role key (used by the
-- api/stripe-*.js and api/delete-account.js routes) bypasses both RLS and these
-- column grants, so server-side billing/admin writes are unaffected.

revoke insert, update on user_data from anon, authenticated;

-- Columns the client is allowed to INSERT (signup + investor seed).
grant insert (
  user_id, config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) on user_data to authenticated;

-- Columns the client is allowed to UPDATE (saveUserData + profile metadata).
-- NOTE the deliberate omissions: is_admin, is_investor, tax_projections_enabled,
-- and every stripe_* / subscription_* / trial_* / access_ends_at / card_on_file /
-- *_dunning_* / current_period_end / plan column are NOT here — the client can
-- never escalate privilege, unlock gated features, or forge billing state.
grant update (
  config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) on user_data to authenticated;

-- anon (unauthenticated) gets no write access at all; RLS + no grants = deny.

-- ── Verification (run after applying) ────────────────────────────────────────
--   select relname, relrowsecurity from pg_class where relname = 'user_data';
--     -> relrowsecurity should be TRUE
--   Signed in as user A, attempt: update user_data set is_admin = true
--     where user_id = auth.uid();  -> must fail / affect 0 columns.
--   Signed in as user A, attempt: select * from user_data
--     where user_id <> auth.uid(); -> must return 0 rows.
