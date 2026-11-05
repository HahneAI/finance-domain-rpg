-- ─────────────────────────────────────────────────────────────────────────────
-- 049_add_coach_memory.sql — Coach memory (docs/TODO.md §32 B1, 2026-11-03)
--
-- Short facts a user chose to have Coach remember: why a goal matters, a
-- decision, something to avoid, how they want Coach to talk to them, or a fact
-- about them. Every row is user-confirmed — Coach can only PROPOSE one
-- (propose_memory tool → a card the user saves), never write one itself.
--
-- SENSITIVITY (drift-app-warden §19 F120 trigger check, run 2026-11-03):
-- free text up to 280 characters about the user's money and life. Below the
-- regulated class (SSN, date of birth, bank/routing, government ID), so this is
-- an ordinary RLS-protected column, NOT an encrypted one. Regulated identifiers
-- are kept out at the door instead: src/lib/coachMemory.js rejects SSN-shaped
-- text, 9+ digit runs and card-number-shaped text before any insert, and
-- Coach's prompt forbids proposing them. If that ever changes (a kind that
-- invites regulated data), revisit F120 before widening this table.
--
-- DELETION (Anthony, 2026-11-03): rows cascade with user_data. A non-payment
-- deletion archives them into deleted_accounts.archived_coach_memory (added
-- below) and a paid revival restores them; a user-requested deletion archives
-- nothing — memory is gone for good (api/_accountArchive.js).
--
-- Same table shape and own-row RLS as coach_chats (023).
-- ─────────────────────────────────────────────────────────────────────────────

create table coach_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references user_data(user_id) on delete cascade,
  kind        text not null
              check (kind in ('goal_why', 'decision', 'avoid', 'instruction', 'fact')),
  body        text not null
              check (char_length(body) between 1 and 280),
  -- who suggested it: typed on the memory page ('user') or proposed by Coach
  -- and confirmed by the user ('coach'). Confirmation is required either way.
  source      text not null default 'user'
              check (source in ('user', 'coach')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index coach_memory_user_id_created_at
  on coach_memory (user_id, created_at desc);

alter table coach_memory enable row level security;

create policy "coach_memory own row select"
  on coach_memory for select to authenticated
  using (auth.uid() = user_id);

create policy "coach_memory own row insert"
  on coach_memory for insert to authenticated
  with check (auth.uid() = user_id);

create policy "coach_memory own row update"
  on coach_memory for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "coach_memory own row delete"
  on coach_memory for delete to authenticated
  using (auth.uid() = user_id);

-- Non-payment archive slot (service role only, like the rest of deleted_accounts).
alter table deleted_accounts add column if not exists archived_coach_memory jsonb;
