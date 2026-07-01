-- Authority Finance: Stripe subscription + trial lifecycle fields (docs/TODO.md §17.A).
-- Adds the columns needed to track a card-less, app-managed 14-day trial + hidden
-- 7-day grace + Stripe-backed subscription state. Run in the Supabase SQL editor.
--
-- Security note: user_data has no RLS enabled today (see the commented-out example
-- in 001_initial_schema.sql). Rather than bolt on column-level RLS for just these
-- columns right now, these fields are protected at the app layer instead:
--   - src/lib/db.js `saveUserData()` never includes any of these columns in its
--     client-side upsert payload — only the future service-role webhook/checkout/
--     portal routes (api/stripe-*.js) write them.
--   - src/lib/db.js `loadUserData()` / `syncUserProfile()` only ever SELECT or seed
--     these columns; they never accept them from client input.
-- Enabling real RLS on user_data (own-row policies + a service-role bypass) is
-- tracked as its own follow-up task, independent of this feature.

alter table user_data
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_status text, -- trialing | active | past_due | canceled | incomplete | unpaid
  add column trial_started_at timestamptz,
  add column trial_ends_at timestamptz,      -- day 14, user-facing trial end
  add column access_ends_at timestamptz,     -- day 21, internal hard cutoff (hidden grace) — never surfaced to users
  add column card_on_file boolean not null default false,
  add column last_dunning_email_at timestamptz,
  add column dunning_email_count int not null default 0,
  add column current_period_end timestamptz,
  add column plan text; -- monthly | annual
