-- ─────────────────────────────────────────────────────────────────────────────
-- 026_add_beta_activity_events.sql
--
-- Usage-tracking log for the 10-week beta program (docs/TODO.md — beta usage
-- scoring). Append-only, event-per-row. Only ever written for accounts that are
-- BOTH is_tester = true AND have a non-null beta_code_used (migration 025) — the
-- real beta cohort, not friends/family testers. That gate is enforced client-side
-- (src/lib/entitlements.js isTrackedBetaTester) at every call site, not by this
-- table's RLS, so friends/family accounts simply never produce rows here.
--
-- Modeled on coach_chats (023): own-row insert/select for the client, service
-- role bypasses for the admin report (api/admin-beta-report.js). Unlike
-- coach_chats, this is append-only like account_history (020) — no update/delete
-- policy, since an activity event is a fact about something that happened, not
-- an editable record.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists beta_activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references user_data(user_id) on delete cascade,

  -- login: one row per real sign-in (deduped client-side, not every tab-visibility
  --   re-fire of SIGNED_IN — see App.jsx's signedInChainRanForRef pattern).
  -- goal_created / goal_updated: HomePanel's addGoal / saveEditGoal.
  -- expense_created / expense_updated: BudgetPanel's applyExpenseUpdate funnel
  --   (covers both expenses and loans — both live in the same expenses array).
  event_type  text not null
              check (event_type in (
                'login', 'goal_created', 'goal_updated',
                'expense_created', 'expense_updated'
              )),

  created_at  timestamptz not null default now()
);

create index if not exists beta_activity_events_user_id_created_at
  on beta_activity_events (user_id, created_at desc);

alter table beta_activity_events enable row level security;

drop policy if exists "beta_activity_events own row select" on beta_activity_events;
create policy "beta_activity_events own row select"
  on beta_activity_events for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "beta_activity_events own row insert" on beta_activity_events;
create policy "beta_activity_events own row insert"
  on beta_activity_events for insert to authenticated
  with check (auth.uid() = user_id);

-- Append-only: no update/delete policy, and mutation privileges revoked outright
-- (same posture as account_history, migration 020) so a future permissive policy
-- can't silently make this rewritable.
revoke update, delete on beta_activity_events from anon, authenticated;

-- ── Verification (run after applying) ────────────────────────────────────────
--   select relname, relrowsecurity from pg_class where relname = 'beta_activity_events';
--     -> relrowsecurity should be TRUE
--   Signed in as user A, attempt: select * from beta_activity_events where user_id <> auth.uid();
--     -> must return 0 rows
--   Signed in as user A, attempt: update beta_activity_events set event_type = 'login' where user_id = auth.uid();
--     -> must fail (no UPDATE grant)
