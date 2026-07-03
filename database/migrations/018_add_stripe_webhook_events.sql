-- Authority Finance: Stripe webhook idempotency (docs/TODO.md §17.C).
-- api/stripe-webhook.js claims each Stripe event id here before processing it.
-- Stripe redelivers events on retry (and occasionally redelivers already-
-- successful ones), so this is a real, not speculative, correctness need.
--
-- Service-role only — same posture as deleted_accounts in migration 017.
-- Run in the Supabase SQL editor.

create table stripe_webhook_events (
  id text primary key, -- Stripe event id, e.g. evt_...
  type text not null,
  processed_at timestamptz not null default now()
);

alter table stripe_webhook_events enable row level security;
-- No policies created intentionally — only the service-role key (used from
-- api/stripe-webhook.js) can reach this table.
