-- ─────────────────────────────────────────────────────────────────────────────
-- 020_add_account_history.sql
--
-- TODO §19 phase 1 (write path) — Master Timeline: config history.
--
-- Every historically-sensitive config change becomes an append-only row here,
-- so a mid-year pay/tax/schedule edit stops being unrecoverable. Per the §D2
-- design decisions (docs/TODO.md):
--   • each row stores the FULL NEW config (new-value snapshot), so
--     "config as of week N" resolves like getEffectiveAmount: latest row with
--     effective_from <= N. changed_fields is display-only metadata.
--   • effective_from is a DATE (never a week idx — idx is fiscal-year-relative).
--   • the engine read path (buildYear/computeNet consulting this table for past
--     weeks) is deliberately NOT part of this migration's scope.
-- ─────────────────────────────────────────────────────────────────────────────

create table account_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references user_data(user_id) on delete cascade,
  -- 'config' is the only entity_type written today; 'expense' | 'loan' | 'goal'
  -- | 'coach_chat' are reserved for later phases (§19.D / §19.E).
  entity_type    text not null default 'config',
  entity_id      text,                                -- null = whole-config snapshot
  snapshot       jsonb not null,                      -- the full NEW config value
  changed_fields text[] not null default '{}',        -- whitelist fields that changed (UI/diff display only)
  effective_from date not null,                       -- when the new values take over
  source         text not null default 'config_edit', -- 'setup_wizard' | 'life_event:<x>' | 'profile_edit' | 'rollout_seed' | ...
  created_at     timestamptz not null default now()
);

create index account_history_user_id_effective_from
  on account_history (user_id, effective_from desc, created_at desc);

-- ── RLS — own rows, append-only from the client ──────────────────────────────
-- History must never be editable after the fact: authenticated users may read
-- and insert their own rows, but there are no update/delete policies at all
-- (deny by default). Service role bypasses for admin diagnostics / §I revival.

alter table account_history enable row level security;

create policy "account_history own row select"
  on account_history for select to authenticated
  using (auth.uid() = user_id);

create policy "account_history own row insert"
  on account_history for insert to authenticated
  with check (auth.uid() = user_id);

-- Belt-and-braces on top of the missing policies (mirrors 019's column-grant
-- discipline): revoke mutation privileges outright so a future permissive
-- policy can't silently make history rewritable.
revoke update, delete on account_history from anon, authenticated;

-- ── Rollout seed (§D2 "clean start + seed row") ──────────────────────────────
-- One floor snapshot per existing account so the future read-path resolver
-- always has an entry to land on — no "fall back to live config" special case.

insert into account_history (user_id, snapshot, changed_fields, effective_from, source)
select user_id, config, '{}', current_date, 'rollout_seed'
from user_data;

-- ── Verification (run after applying) ────────────────────────────────────────
--   select count(*) from account_history;             -- = number of user_data rows
--   select relrowsecurity from pg_class where relname = 'account_history';  -- TRUE
--   Signed in as user A: update account_history set source = 'x'
--     where user_id = auth.uid();                     -- must fail (no privilege)
