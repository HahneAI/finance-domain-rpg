-- ─────────────────────────────────────────────────────────────────────────────
-- 037_add_beta_homebase.sql
--
-- "Beta Tester Homebase" — a single in-app destination (icon next to the
-- notification bell, gated on isTrackedBetaTester) weaving together three
-- previously-separate threads of the beta program:
--   1. The scoring rubric (docs/TODO.md §12.L — 100 pts: Usage 50/floor 30,
--      Feedback 25, Calls 15, Longevity 10) made tester-visible.
--   2. A feature checklist testers can personally check off.
--   3. Admin-authored "creative suggestion" prompts for testers to try.
-- Interconnects with the existing changelog_entries "What's New" feed
-- (migration 032) — that table is untouched; the Homebase just reads more of
-- it (a short list, not only the single latest entry ChangelogModal shows).
--
-- Three new tables, one shared helper function:
--
--   beta_content_items         — admin-authored checklist items AND suggestion
--                                 prompts (kind column distinguishes them; same
--                                 title/body/published_at shape as
--                                 changelog_entries, so one table covers both
--                                 instead of two near-identical ones).
--   beta_checklist_completions — a tester's own personal check-off state per
--                                 checklist item. Row existence = checked;
--                                 toggling off deletes the row (mirrors the
--                                 rest of this app's own-row insert/delete
--                                 patterns rather than a boolean column with
--                                 nothing else on the row worth keeping).
--   beta_scores                — one row per tester, the four rubric category
--                                 scores. ADMIN-ENTERED, not auto-computed —
--                                 docs/TODO.md §12.L already made "scoring
--                                 stays manual, reviewed by a human" an
--                                 explicit decision (Call Attendance in
--                                 particular has zero in-app data — this app
--                                 has no record of scheduled calls, see that
--                                 section's discussion). This table gives that
--                                 existing manual judgment a live, tester-
--                                 visible home instead of a spreadsheet only
--                                 the admin sees.
--
-- Write path for all three, same posture as changelog_entries (032) and
-- beta_codes/investor_codes: nothing here is client-writable except a
-- tester's OWN checklist completions. Content authoring (checklist items,
-- suggestion prompts) and score entry go through api/admin-beta-hub.js's
-- service-role client, which re-checks is_admin server-side — never a direct
-- client write, per the migration-019 RLS posture the rest of the app
-- follows.
--
-- is_tracked_beta_tester(uid) — a SQL-side twin of entitlements.js's
-- isTrackedBetaTester({isTester, betaCodeUsed}) (is_tester = true AND
-- beta_code_used IS NOT NULL — friends/family testers with is_tester=true but
-- no code are deliberately excluded, same as everywhere else this
-- distinction is made). docs/drift-app-warden.md F122 already documents this
-- rule existing in "two languages, no shared source" (JS + migration 031's
-- inline trigger check) — this migration adds a THIRD, but factors it into
-- one reusable SQL function instead of inlining the same subquery three more
-- times across this file's own RLS policies and trigger. SECURITY DEFINER +
-- STABLE: reads user_data (RLS-protected) on behalf of the calling role,
-- same reasoning migration 031's comment gives for why a plain RLS subquery
-- isn't used directly — this codebase's established way to let a policy
-- cross-reference another table's row without granting broader read access.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function is_tracked_beta_tester(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from user_data
    where user_id = uid and is_tester = true and beta_code_used is not null
  );
$$;

-- ── beta_content_items ─────────────────────────────────────────────────────

create table if not exists beta_content_items (
  id            uuid        primary key default gen_random_uuid(),
  kind          text        not null check (kind in ('checklist', 'suggestion')),
  title         text        not null,
  body          text,                                  -- markdown, rendered via ChangelogBody (same renderer as changelog_entries)
  published_at  timestamptz,                            -- NULL = draft, not yet visible — same convention as changelog_entries
  created_by    uuid        references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_beta_content_items_kind_published
  on beta_content_items (kind, published_at desc nulls last);

alter table beta_content_items enable row level security;

drop policy if exists "tracked beta testers can read published beta content" on beta_content_items;
create policy "tracked beta testers can read published beta content"
  on beta_content_items
  for select
  to authenticated
  using (published_at is not null and is_tracked_beta_tester(auth.uid()));

-- No insert/update/delete policy — those only happen via api/admin-beta-hub.js's
-- service-role client, which re-verifies the caller's is_admin flag server-side.

-- ── beta_checklist_completions ─────────────────────────────────────────────

create table if not exists beta_checklist_completions (
  id                uuid        primary key default gen_random_uuid(),
  checklist_item_id uuid        not null references beta_content_items(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  completed_at      timestamptz not null default now(),
  unique (checklist_item_id, user_id)
);

create index if not exists idx_beta_checklist_completions_user
  on beta_checklist_completions (user_id);

alter table beta_checklist_completions enable row level security;

drop policy if exists "testers manage their own checklist completions" on beta_checklist_completions;
create policy "testers manage their own checklist completions"
  on beta_checklist_completions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Same class of gap migration 031 closed for beta_activity_events: the base
-- RLS policy above only proves "this row belongs to me," not "I'm actually a
-- tracked beta tester." Without this, any authenticated user could insert
-- their own completion rows for a feature they were never eligible to see.
-- Practical severity is low (nothing privileged unlocked by a checkmark), but
-- closing it properly costs nothing and matches the established pattern.
create or replace function check_beta_checklist_completion_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_tracked_beta_tester(NEW.user_id) then
    raise exception 'beta_checklist_completions insert rejected: % is not a tracked beta tester', NEW.user_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_beta_checklist_completion_eligibility on beta_checklist_completions;
create trigger trg_check_beta_checklist_completion_eligibility
  before insert on beta_checklist_completions
  for each row
  execute function check_beta_checklist_completion_eligibility();

-- ── beta_scores ─────────────────────────────────────────────────────────────

create table if not exists beta_scores (
  user_id         uuid        primary key references auth.users(id) on delete cascade,
  usage_score     integer     check (usage_score between 0 and 50),
  feedback_score  integer     check (feedback_score between 0 and 25),
  calls_score     integer     check (calls_score between 0 and 15),
  longevity_score integer     check (longevity_score between 0 and 10),
  admin_notes     text,                                  -- admin's own reasoning, never shown to the tester
  updated_by      uuid        references auth.users(id),
  updated_at      timestamptz not null default now()
);

alter table beta_scores enable row level security;

drop policy if exists "testers can read their own score" on beta_scores;
create policy "testers can read their own score"
  on beta_scores
  for select
  to authenticated
  using (user_id = auth.uid() and is_tracked_beta_tester(auth.uid()));

-- No insert/update/delete policy — writes only via api/admin-beta-hub.js's
-- service-role client (admin_notes must never leak to a non-admin, so this
-- can't be an own-row-writable table like beta_checklist_completions).

-- ── Verification (run after applying) ────────────────────────────────────────
--   -- As a tracked beta tester (is_tester=true, beta_code_used set):
--   select * from beta_content_items where published_at is not null; -- visible
--   insert into beta_content_items (kind, title) values ('checklist', 'hack'); -- must fail (no insert policy)
--   insert into beta_checklist_completions (checklist_item_id, user_id) values ('<real id>', auth.uid()); -- succeeds
--   -- As a non-tester (is_tester=false or beta_code_used null):
--   select * from beta_content_items; -- zero rows
--   insert into beta_checklist_completions (checklist_item_id, user_id) values ('<real id>', auth.uid());
--     -- must fail: "beta_checklist_completions insert rejected: ... is not a tracked beta tester"
--   select * from beta_scores where user_id = auth.uid(); -- zero rows even for your own (never scored, or not a tracked tester)
