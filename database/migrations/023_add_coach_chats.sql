-- ─────────────────────────────────────────────────────────────────────────────
-- 023_add_coach_chats.sql
--
-- TODO §18.H — Chat & Search History Persistence. Every Coach conversation and
-- every Job Scout search becomes a row here, linked to the user, so history
-- survives across devices/sessions and Coach can reference past conversations.
--
-- Renumbered from the TODO spec's original `017_add_coach_chats.sql` — 017
-- through 022 are taken (021 went to is_tester; 022 was claimed by a
-- concurrent, not-yet-pushed session). Verify 023 is still free in this
-- directory before running, in case something else landed first.
--
-- Deviations from the TODO §18.H spec, both deliberate:
--   1. `user_id references user_data(user_id)`, not `user_data(id)` — the spec
--      text names the wrong column. user_data's primary key is `user_id`
--      (see 001_initial_schema.sql), not `id`.
--   2. No `moddatetime` trigger for `updated_at` — despite CLAUDE.md's
--      aspirational mention, no such trigger exists anywhere in this schema
--      today; every table (including user_data) stamps `updated_at` from the
--      client on each write instead (see db.js saveUserData/saveCoachChat).
--      Matching the actual established pattern rather than introducing a new
--      one only this table would use.
-- ─────────────────────────────────────────────────────────────────────────────

create table coach_chats (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references user_data(user_id) on delete cascade,

  -- discriminator: what kind of record is this row?
  chat_type       text not null
                  check (chat_type in ('ask_coach', 'job_scout', 'job_hunt', 'statement_summary')),

  -- human-readable label shown in history list; auto-generated, user-editable
  title           text,

  -- full message thread: [{role, content, timestamp}]
  messages        jsonb not null default '[]'::jsonb,

  -- Coach-generated 1-3 sentence summary written at end of session
  summary         text,

  -- structured insights extracted from the conversation (statement insight keys, etc.)
  insights        jsonb,

  -- job_scout only: the search parameters that produced this record
  search_params   jsonb,   -- { jobTitle, address, radiusMiles, searchTerms[] }

  -- job_scout only: compiled employer list
  search_results  jsonb,   -- [{ businessName, town, state, phone, category, searchTerm }]

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- fast lookup: all chats for a user, newest first
create index coach_chats_user_id_created_at
  on coach_chats (user_id, created_at desc);

-- ── RLS — full own-row CRUD, unlike account_history's append-only posture ────
-- Chat history is user-editable (rename a title, delete an embarrassing test
-- chat) and user-deletable (swipe-to-delete in the history list, §18.H3), so
-- this table grants all four operations to the owning row — closer to
-- user_data's own-row policy set (019) than account_history's insert-only one
-- (020). Service role bypasses for admin diagnostics (the "Coach Chats" count
-- line, §18.H4) and any future summary/insight-generation server route.

alter table coach_chats enable row level security;

create policy "coach_chats own row select"
  on coach_chats for select to authenticated
  using (auth.uid() = user_id);

create policy "coach_chats own row insert"
  on coach_chats for insert to authenticated
  with check (auth.uid() = user_id);

create policy "coach_chats own row update"
  on coach_chats for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "coach_chats own row delete"
  on coach_chats for delete to authenticated
  using (auth.uid() = user_id);

-- ── Verification (run after applying) ────────────────────────────────────────
--   select relname, relrowsecurity from pg_class where relname = 'coach_chats';
--     -> relrowsecurity should be TRUE
--   Signed in as user A, attempt: select * from coach_chats where user_id <> auth.uid();
--     -> must return 0 rows
