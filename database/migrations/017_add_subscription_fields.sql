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

-- ── Account Revival After Non-Payment Deletion (docs/TODO.md §17.I) ─────────────
-- Added 2026-07-01. When the day-21+7 dunning cron eventually deletes an account
-- for non-payment (§G — not yet built), it archives a snapshot here FIRST, keyed
-- by email, before hard-deleting the auth.users row and the user_data row. This
-- is the only deletion path that archives — the user-initiated "type DELETE" flow
-- in ProfilePanel (api/delete-account.js) stays a true, unrecoverable hard delete
-- with no archive.
--
-- Revival reads/writes to this table happen ONLY from service-role server routes
-- (api/revival-lookup.js, api/stripe-revive-checkout.js, the webhook handler) —
-- never from the client. RLS is enabled with deliberately NO policies, so
-- anon/authenticated get zero access by default and only the service-role key
-- (which bypasses RLS) can reach it. This is a different posture than user_data,
-- which has RLS disabled entirely (see the note above) — this table holds
-- archived financial data for accounts with no live session, so default-deny is
-- the right starting point rather than something to relax later.
create table deleted_accounts (
  id                     uuid primary key default gen_random_uuid(),
  email                  text not null,
  former_user_id         uuid,        -- prior auth.users id, kept for audit only (row no longer exists)
  display_name           text,
  avatar_url             text,
  oauth_provider         text,        -- e.g. 'google'; null for email/password accounts

  -- Restored into the new user_data row on successful revival charge.
  archived_config        jsonb,
  archived_expenses      jsonb,
  archived_goals         jsonb,
  archived_logs          jsonb,
  archived_show_extra    boolean,
  archived_week_confirmations jsonb,
  archived_pto_goal      jsonb,

  stripe_customer_id     text,        -- reused on revival so billing history stays linked
  plan                   text,        -- monthly | annual — the plan they were on, pre-selected on revival

  deletion_reason        text not null default 'non_payment_dunning_expired',
  deleted_at             timestamptz not null default now(),

  revived_at             timestamptz, -- null until a successful revival charge; tombstone considered "open" while null
  revival_attempt_count  int not null default 0,
  last_revival_attempt_at timestamptz,
  last_decline_code      text,        -- Stripe decline_code, e.g. 'insufficient_funds', 'expired_card'
  last_decline_message   text
);

-- Upsert-on-email: a second deletion cycle (revive → cancel again) overwrites the
-- same tombstone rather than accumulating duplicates per email.
create unique index deleted_accounts_email_key on deleted_accounts (email);

alter table deleted_accounts enable row level security;
-- No policies created intentionally — see comment above.
