-- ─────────────────────────────────────────────────────────────────────────────
-- 032_add_resume_profile.sql
--
-- §18.E1 — Résumé Review v1. Storage decision per docs/TODO.md §18.E1 (scoped
-- 2026-07-22): plain pasted text, not a file upload — a pasted résumé and a
-- PDF-extracted one look identical to the analysis pipeline downstream, so a
-- real upload path (Storage bucket + parser) is deferred to a v2 that's only
-- worth building once v1 shows real usage.
--
-- One row per user (`user_id` is the primary key, not a separate `id` — this
-- table is 1:1 with an account, unlike `coach_chats` which is 1:many).
-- ─────────────────────────────────────────────────────────────────────────────

create table resume_profile (
  user_id         uuid primary key references user_data(user_id) on delete cascade,

  resume_text     text,
  target_role     text,   -- free-text override; defaults client-side to the most
                           -- recent config.jobApplications entry's role when unset

  last_reviewed_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()  -- client-stamped, no trigger —
                                                        -- matches 023_add_coach_chats.sql's
                                                        -- established no-trigger pattern
);

-- ── RLS — full own-row CRUD, same shape as coach_chats (019/023 precedent) ──
-- A résumé is user-editable (paste a new version) and user-deletable (clear
-- it out), so this grants all four operations to the owning row.

alter table resume_profile enable row level security;

create policy "resume_profile own row select"
  on resume_profile for select to authenticated
  using (auth.uid() = user_id);

create policy "resume_profile own row insert"
  on resume_profile for insert to authenticated
  with check (auth.uid() = user_id);

create policy "resume_profile own row update"
  on resume_profile for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "resume_profile own row delete"
  on resume_profile for delete to authenticated
  using (auth.uid() = user_id);

-- ── §18.E1's AI-pipeline decision: reuse coach_chats, not a new table/route ──
-- The résumé *review conversation* (Coach's written skill-gap output) is
-- stored as a coach_chats row via the existing api/coach.js pipeline, not
-- here — this table only holds the input (résumé text + target role).
-- 'resume_review' needs adding to the chat_type check constraint.

alter table coach_chats drop constraint coach_chats_chat_type_check;
alter table coach_chats add constraint coach_chats_chat_type_check
  check (chat_type in ('ask_coach', 'job_scout', 'job_hunt', 'statement_summary', 'resume_review'));

-- ── Verification (run after applying) ────────────────────────────────────────
--   select relname, relrowsecurity from pg_class where relname = 'resume_profile';
--     -> relrowsecurity should be TRUE
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'coach_chats_chat_type_check';
--     -> definition should include 'resume_review'
--   Signed in as user A, attempt: select * from resume_profile where user_id <> auth.uid();
--     -> must return 0 rows
