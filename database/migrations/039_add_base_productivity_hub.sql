-- ─────────────────────────────────────────────────────────────────────────────
-- 039_add_base_productivity_hub.sql
--
-- "Money Moves" — the base-user counterpart to the Beta Tester Homebase
-- (migration 037), adapted for the whole user base rather than the tracked
-- 10-week cohort. Same underlying flow the beta program validated (a
-- checklist, admin-authored tips, a feedback box, a changelog recap) but a
-- different purpose: financial-productivity self-service for every user, not
-- a scored path toward a free-account reward. No scoring table here — that
-- stays beta-program-specific (docs/TODO.md §12.L's rubric is deliberately
-- NOT ported).
--
-- Deliberately THREE NEW TABLES, not a reuse of beta_content_items /
-- beta_checklist_completions — see drift-app-warden.md F123's addendum for
-- the full reasoning, summarized here: beta_checklist_completions and
-- beta_activity_events both carry SECURITY DEFINER triggers (031, 037) that
-- HARD-REJECT any insert from a user who isn't a tracked beta tester
-- (is_tester = true AND beta_code_used IS NOT NULL). Reusing those tables for
-- base users would mean loosening the exact triggers protecting the live
-- 40-person cohort's scoring data mid-program — real risk for zero benefit,
-- since new tables cost nothing against the Vercel Hobby serverless-function
-- cap (that cap is per api/*.js FILE, not per table). Admin content
-- authoring reuses the EXISTING api/admin-beta-hub.js route instead of a new
-- serverless function (this repo is at 12/12 already, see CLAUDE.md) via a
-- new `entity: "base_content"` branch alongside its existing `entity:
-- "content"` (beta) branch.
--
--   base_content_items         — admin-authored checklist items AND tip/
--                                 suggestion prompts. Same kind/title/body/
--                                 published_at shape as beta_content_items
--                                 (and changelog_entries before it) — proven
--                                 shape, no reason to diverge.
--   base_checklist_completions — any authenticated user's own check-off
--                                 state. Unlike beta_checklist_completions,
--                                 NO eligibility trigger — there's no
--                                 "tracked cohort" concept for base users,
--                                 the gate is simply "signed in."
--   base_feedback_events       — append-only free-text feedback from any
--                                 user. Deliberately its own table, not a
--                                 second event_type bolted onto
--                                 beta_activity_events (030's pattern) —
--                                 that table exists specifically to feed the
--                                 beta scoring rubric's usage aggregation
--                                 (api/admin-beta-report.js); mixing
--                                 non-cohort rows into it would corrupt that
--                                 aggregation's "~40 known testers" scope.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── base_content_items ──────────────────────────────────────────────────────

create table if not exists base_content_items (
  id            uuid        primary key default gen_random_uuid(),
  kind          text        not null check (kind in ('checklist', 'suggestion')),
  title         text        not null,
  body          text,                                  -- markdown, rendered via ChangelogBody (same renderer as changelog_entries/beta_content_items)
  published_at  timestamptz,                            -- NULL = draft, not yet visible
  created_by    uuid        references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_base_content_items_kind_published
  on base_content_items (kind, published_at desc nulls last);

alter table base_content_items enable row level security;

drop policy if exists "authenticated users can read published base content" on base_content_items;
create policy "authenticated users can read published base content"
  on base_content_items
  for select
  to authenticated
  using (published_at is not null);

-- No insert/update/delete policy — those only happen via api/admin-beta-hub.js's
-- service-role client (entity: "base_content"), which re-verifies is_admin
-- server-side, same posture as beta_content_items.

-- ── base_checklist_completions ──────────────────────────────────────────────

create table if not exists base_checklist_completions (
  id                uuid        primary key default gen_random_uuid(),
  checklist_item_id uuid        not null references base_content_items(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  completed_at      timestamptz not null default now(),
  unique (checklist_item_id, user_id)
);

create index if not exists idx_base_checklist_completions_user
  on base_checklist_completions (user_id);

alter table base_checklist_completions enable row level security;

drop policy if exists "users manage their own base checklist completions" on base_checklist_completions;
create policy "users manage their own base checklist completions"
  on base_checklist_completions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No eligibility trigger, unlike beta_checklist_completions (037) — every
-- signed-in user is in-scope for this table by design, so RLS's own-row
-- check is the whole gate.

-- ── base_feedback_events ─────────────────────────────────────────────────────

create table if not exists base_feedback_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  note       text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_base_feedback_events_user_created
  on base_feedback_events (user_id, created_at desc);

alter table base_feedback_events enable row level security;

drop policy if exists "users can read their own base feedback" on base_feedback_events;
create policy "users can read their own base feedback"
  on base_feedback_events
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users can submit their own base feedback" on base_feedback_events;
create policy "users can submit their own base feedback"
  on base_feedback_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Append-only, same posture as account_history (020) / beta_activity_events (026).
revoke update, delete on base_feedback_events from anon, authenticated;

-- No admin-facing read UI is built in this migration's paired feature work —
-- out of scope for this pass (docs/TODO.md, if/when added). The service-role
-- key already bypasses RLS for a future admin viewer; no extra policy needed
-- to unlock that later.

-- ── Verification (run after applying) ────────────────────────────────────────
--   select relname, relrowsecurity from pg_class
--     where relname in ('base_content_items', 'base_checklist_completions', 'base_feedback_events');
--     -> all three relrowsecurity should be TRUE
--   -- As any signed-in non-tester user:
--   select * from base_content_items where published_at is not null; -- visible
--   insert into base_content_items (kind, title) values ('checklist', 'hack'); -- must fail (no insert policy)
--   insert into base_checklist_completions (checklist_item_id, user_id) values ('<real id>', auth.uid()); -- succeeds
--   insert into base_feedback_events (user_id, note) values (auth.uid(), 'test'); -- succeeds
--   update base_feedback_events set note = 'edited' where user_id = auth.uid(); -- must fail (no update grant)
--   -- As a different user:
--   select * from base_feedback_events where user_id <> auth.uid(); -- must return 0 rows
