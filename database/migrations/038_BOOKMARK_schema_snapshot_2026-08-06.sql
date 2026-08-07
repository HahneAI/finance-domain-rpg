-- ═════════════════════════════════════════════════════════════════════════════
-- 📌 BOOKMARK — NOT A MIGRATION — DO NOT RUN AS PART OF THE MIGRATION SEQUENCE
-- ═════════════════════════════════════════════════════════════════════════════
--
--   File:      038_BOOKMARK_schema_snapshot_2026-08-06.sql
--   Snapshot date: 2026-08-06
--   Compiled from: 001_initial_schema.sql  →  037_add_beta_homebase.sql
--                  (every migration file in this folder at the time of writing)
--   Verified against: a live Supabase schema export pasted directly by the
--                      account owner on 2026-08-06 (table/column definitions
--                      only — no RLS/functions/triggers in that export format;
--                      those below are reconstructed from the migration files
--                      themselves, same as 022's bookmark did).
--
--   WHAT THIS IS
--   ────────────
--   A single, read-in-one-sitting recap of what the `finance-domain-rpg`
--   Supabase database looks like once every migration through 035 has been
--   applied — see the ⚠️ NOT YET LIVE section immediately below for why the
--   cutoff is 035, not 037. It exists so a future session (human or Claude)
--   can understand the full current schema without opening and mentally
--   diffing 30+ files. Same purpose, same conventions, as
--   022_BOOKMARK_schema_snapshot_2026-07-10.sql — read that file's own header
--   for the full rationale; not repeated verbatim here.
--
--   WHAT THIS IS NOT
--   ────────────────
--   • It is NOT the next migration to run. It changes nothing that migrations
--     001–035 didn't already change.
--   • It does NOT replay one-time DATA fixes or seed INSERTs — SCHEMA ONLY.
--   • The BOOKMARK tag + the numeric prefix landing on the next open file slot
--     (038 — 037 is a real migration, `beta_homebase`) is deliberate, same
--     reasoning as 022.
--
--   NUMBERING GAP — 008 still does not exist in this folder (noted in 022's
--   bookmark; still true, not repeated here as a new finding).
--
-- ═════════════════════════════════════════════════════════════════════════════
--   ⚠️  NOT YET LIVE — 036 and 037 are committed migration FILES that have
--       NOT been run against the database this snapshot was taken from.
--       This is a real, actionable finding surfaced by reconciling the pasted
--       live export against the migrations folder, not a stylistic choice:
--
--   • 036_add_resume_profile.sql — the `resume_profile` table is ABSENT from
--     the live export entirely. Additionally, the live `coach_chats.chat_type`
--     CHECK constraint still reads
--       CHECK (chat_type = ANY (ARRAY['ask_coach','job_scout','job_hunt','statement_summary']))
--     — no 'resume_review' — confirming 036's constraint update never ran
--     either. **Practical effect: the Résumé Review feature (§18.E1) is
--     currently non-functional in production** — any save to `resume_profile`
--     or any Coach chat tagged `resume_review` will fail outright until 036 is
--     applied.
--   • 037_add_beta_homebase.sql — `beta_content_items`, `beta_checklist_completions`,
--     and `beta_scores` are all ABSENT from the live export. **The Beta Tester
--     Homebase (icon next to the notification bell, shipped 2026-08-06) will
--     500 on load for every tracked beta tester until 037 is applied** — this
--     was already flagged when that feature shipped; repeated here because
--     this snapshot is independent confirmation from the live schema itself,
--     not just a reminder.
--
--   ACTION: run 036_add_resume_profile.sql and 037_add_beta_homebase.sql
--   against production before relying on either feature. This bookmark
--   intentionally does NOT include their tables in the CREATE TABLE section
--   below — it snapshots verified live reality (through 035), not aspirational
--   file-folder contents. Once both are confirmed applied, the next bookmark
--   should extend through 037.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: user_data
-- Origin: 001 (initial 7 columns) · columns added/renamed by 002, 003, 004,
-- 005, 012, 014 (rename is_dhl → is_employer_dhl), 016, 017, 021, 025, 027, 029.
-- One row per app user, keyed 1:1 to auth.users via user_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_data (
  user_id                 UUID        PRIMARY KEY,                       -- 001
  config                  JSONB       NOT NULL DEFAULT '{}',              -- 001
  expenses                JSONB       NOT NULL DEFAULT '[]',              -- 001
  goals                   JSONB       NOT NULL DEFAULT '[]',              -- 001
  logs                    JSONB       NOT NULL DEFAULT '[]',              -- 001
  show_extra              BOOLEAN     NOT NULL DEFAULT true,              -- 001
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),             -- 001

  week_confirmations      JSONB       NOT NULL DEFAULT '{}',              -- 002

  is_employer_dhl         BOOLEAN     NOT NULL DEFAULT false,             -- 003 (as is_dhl; renamed by 014)
  is_admin                BOOLEAN     NOT NULL DEFAULT false,             -- 003

  pto_goal                JSONB       DEFAULT NULL,                       -- 004

  display_name            TEXT,                                          -- 005
  avatar_url               TEXT,                                          -- 005

  is_investor              BOOLEAN     NOT NULL DEFAULT false,             -- 012

  tax_projections_enabled  BOOLEAN     NOT NULL DEFAULT false,             -- 016

  -- Stripe / trial lifecycle (docs/TODO.md §17.A) — service-role write only, see RLS below
  stripe_customer_id       TEXT,                                          -- 017
  stripe_subscription_id   TEXT,                                          -- 017
  subscription_status      TEXT,        -- trialing | active | past_due | canceled | incomplete | unpaid   -- 017
  trial_started_at         TIMESTAMPTZ,                                   -- 017
  trial_ends_at            TIMESTAMPTZ, -- day 14, user-facing trial end   -- 017
  access_ends_at           TIMESTAMPTZ, -- day 21, hidden hard cutoff, never surfaced to users  -- 017
  card_on_file             BOOLEAN     NOT NULL DEFAULT false,             -- 017
  last_dunning_email_at    TIMESTAMPTZ,                                   -- 017
  dunning_email_count      INT         NOT NULL DEFAULT 0,                -- 017
  current_period_end       TIMESTAMPTZ,                                   -- 017
  plan                     TEXT,        -- monthly | annual               -- 017

  -- Beta Tester flag (docs/active-systems.md §23) — manual SQL only, never client-writable
  is_tester                 BOOLEAN     NOT NULL DEFAULT false,            -- 021

  -- Beta program cohort tracking (docs/TODO.md §12) — see beta_code_used's own
  -- comment below for the is_tester-true-but-no-code "friends/family" split.
  beta_code_used             TEXT,                                        -- 025 — real 10-week cohort vs friends/family split; set together with is_tester
  beta_started_at            TIMESTAMPTZ,                                 -- 027 — auto-stamped by trg_set_beta_started_at on beta_code_used null→non-null
  halfway_email_sent_at      TIMESTAMPTZ                                  -- 029 — week-5 nudge email throttle, same pattern as last_dunning_email_at
);

-- RLS (019): own-row SELECT/INSERT/UPDATE/DELETE.
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_data own row select" ON user_data;
CREATE POLICY "user_data own row select"
  ON user_data FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_data own row insert" ON user_data;
CREATE POLICY "user_data own row insert"
  ON user_data FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_data own row update" ON user_data;
CREATE POLICY "user_data own row update"
  ON user_data FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_data own row delete" ON user_data;
CREATE POLICY "user_data own row delete"
  ON user_data FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Column-level write protection (019, corrected by 024 — see that migration's
-- own header for the full "permission denied for table user_data" root-cause
-- trail). Own-row RLS alone still lets a user write ANY column of their own
-- row, including is_admin — Postgres column privileges are the layer that
-- stops that. Client (anon/authenticated) has ZERO insert/update rights
-- except the narrow grant lists below. Every column added after 019
-- (is_tester/021, beta_code_used/025, beta_started_at/027,
-- halfway_email_sent_at/029) was deliberately never added to these lists —
-- same "no client write access" protection, no extra policy required.
REVOKE INSERT, UPDATE ON user_data FROM anon, authenticated;

GRANT INSERT (
  user_id, config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) ON user_data TO authenticated;

GRANT UPDATE (
  user_id, config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) ON user_data TO authenticated;
-- anon gets no write access at all; RLS + no grants = deny.
-- NOTE: user_id is in the UPDATE grant per 024's fix (PostgREST's upsert
-- ON CONFLICT DO UPDATE SET always includes the conflict-target column) —
-- RLS's WITH CHECK (auth.uid() = user_id) still guarantees a row can never
-- actually change ownership.


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: investor_codes  (010, admin policies added by 013)
-- Access codes for the investor signup flow. All active codes valid at once;
-- no one-time-use logic. Managed by hand in the Supabase dashboard / admin UI.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investor_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE investor_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read active investor codes" ON investor_codes;
CREATE POLICY "anon can read active investor codes"
  ON investor_codes FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "admin can read all investor codes" ON investor_codes;
CREATE POLICY "admin can read all investor codes"
  ON investor_codes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_data WHERE user_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "admin can update investor codes" ON investor_codes;
CREATE POLICY "admin can update investor codes"
  ON investor_codes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_data WHERE user_id = auth.uid() AND is_admin = true))
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin can insert investor codes" ON investor_codes;
CREATE POLICY "admin can insert investor codes"
  ON investor_codes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_data WHERE user_id = auth.uid() AND is_admin = true));


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: investor_users  (011, admin policy added by 013)
-- One row per investor account, linked 1:1 to auth.users.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investor_users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  investor_name  TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  company_name   TEXT,
  city           TEXT,
  code_used      TEXT,                          -- code active at registration; never overwritten on login
  code_used_at   TIMESTAMPTZ,
  active_account SMALLINT    NOT NULL DEFAULT 1, -- 1 | 2 | 3 — last-selected accounts pill tab
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS investor_users_auth_idx ON investor_users (auth_user_id);

ALTER TABLE investor_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "investor can manage own row" ON investor_users;
CREATE POLICY "investor can manage own row"
  ON investor_users FOR ALL TO authenticated
  USING  (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "admin can read all investor users" ON investor_users;
CREATE POLICY "admin can read all investor users"
  ON investor_users FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_data WHERE user_id = auth.uid() AND is_admin = true));

CREATE OR REPLACE FUNCTION update_investor_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS investor_users_updated_at ON investor_users;
CREATE TRIGGER investor_users_updated_at
  BEFORE UPDATE ON investor_users
  FOR EACH ROW EXECUTE FUNCTION update_investor_users_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: demo_accounts  (015)
-- Two admin-tunable profiles (1, 2) shown to investors in the Demo Account
-- Tree. Falls back to fixture files client-side when a row is absent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS demo_accounts (
  account_number  INTEGER PRIMARY KEY CHECK (account_number IN (1, 2)),
  config          JSONB NOT NULL DEFAULT '{}',
  expenses        JSONB NOT NULL DEFAULT '[]',
  goals           JSONB NOT NULL DEFAULT '[]',
  logs            JSONB NOT NULL DEFAULT '[]',
  meta            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE demo_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users can read demo accounts" ON demo_accounts;
CREATE POLICY "authenticated users can read demo accounts"
  ON demo_accounts FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin can insert demo accounts" ON demo_accounts;
CREATE POLICY "admin can insert demo accounts"
  ON demo_accounts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_data WHERE user_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "admin can update demo accounts" ON demo_accounts;
CREATE POLICY "admin can update demo accounts"
  ON demo_accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_data WHERE user_id = auth.uid() AND is_admin = true))
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: deleted_accounts  (017 §17.I)
-- Tombstone/archive for non-payment-dunning deletions only — the user-
-- initiated "type DELETE" hard-delete flow never archives here. Service-role
-- only: RLS enabled, deliberately zero policies (default-deny for
-- anon/authenticated; service_role bypasses RLS entirely).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deleted_accounts (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    TEXT        NOT NULL,
  former_user_id           UUID,        -- prior auth.users id, audit-only (row no longer exists)
  display_name             TEXT,
  avatar_url               TEXT,
  oauth_provider           TEXT,        -- e.g. 'google'; null for email/password accounts

  archived_config              JSONB,
  archived_expenses            JSONB,
  archived_goals                JSONB,
  archived_logs                 JSONB,
  archived_show_extra           BOOLEAN,
  archived_week_confirmations   JSONB,
  archived_pto_goal             JSONB,

  stripe_customer_id       TEXT,        -- reused on revival so billing history stays linked
  plan                     TEXT,        -- monthly | annual

  deletion_reason          TEXT        NOT NULL DEFAULT 'non_payment_dunning_expired',
  deleted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  revived_at                 TIMESTAMPTZ, -- null while the tombstone is "open"
  revival_attempt_count       INT         NOT NULL DEFAULT 0,
  last_revival_attempt_at     TIMESTAMPTZ,
  last_decline_code           TEXT,        -- Stripe decline_code, e.g. 'insufficient_funds'
  last_decline_message        TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS deleted_accounts_email_key ON deleted_accounts (email);

ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;
-- No policies — intentional. Only the service-role key can reach this table.


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: stripe_webhook_events  (018)
-- Idempotency ledger — api/stripe-webhook.js claims an event id here before
-- processing, since Stripe redelivers events on retry. Service-role only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id           TEXT        PRIMARY KEY, -- Stripe event id, e.g. evt_...
  type         TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies — intentional. Only the service-role key can reach this table.


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: account_history  (020, TODO §19 phase 1 — write path only)
-- Append-only config-change ledger. Each row is a FULL NEW-VALUE config
-- snapshot (not a diff) + display-only changed_fields + effective_from date.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES user_data(user_id) ON DELETE CASCADE,
  entity_type    TEXT        NOT NULL DEFAULT 'config', -- 'expense'|'loan'|'goal'|'coach_chat' reserved for later
  entity_id      TEXT,                                  -- null = whole-config snapshot
  snapshot       JSONB       NOT NULL,                   -- full NEW config value
  changed_fields TEXT[]      NOT NULL DEFAULT '{}',       -- whitelist fields changed (display-only)
  effective_from DATE        NOT NULL,
  source         TEXT        NOT NULL DEFAULT 'config_edit', -- 'setup_wizard'|'life_event:<x>'|'profile_edit'|'rollout_seed'|...
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_history_user_id_effective_from
  ON account_history (user_id, effective_from DESC, created_at DESC);

ALTER TABLE account_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_history own row select" ON account_history;
CREATE POLICY "account_history own row select"
  ON account_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "account_history own row insert" ON account_history;
CREATE POLICY "account_history own row insert"
  ON account_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Append-only: no update/delete policy exists, and mutation privileges are
-- revoked outright so a future permissive policy can't silently make this
-- rewritable.
REVOKE UPDATE, DELETE ON account_history FROM anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: coach_chats  (023, TODO §18.H)
-- Every Coach conversation and every Job Scout search — one row per session,
-- linked to the user. Full own-row CRUD, unlike account_history's insert-only
-- posture (a chat title can be renamed, an embarrassing test chat deleted).
--
-- ⚠️ The chat_type CHECK constraint below is LIVE-VERIFIED to still be the
-- 023 original — 036_add_resume_profile.sql's `resume_review` addition has
-- NOT been applied (see the NOT YET LIVE section at the top of this file).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coach_chats (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES user_data(user_id) ON DELETE CASCADE,
  chat_type       TEXT        NOT NULL
                  CHECK (chat_type IN ('ask_coach', 'job_scout', 'job_hunt', 'statement_summary')), -- resume_review NOT yet live — see 036
  title           TEXT,
  messages        JSONB       NOT NULL DEFAULT '[]', -- [{role, content, timestamp}]
  summary         TEXT,                                -- Coach-generated 1-3 sentence session summary
  insights        JSONB,                               -- structured insights (statement insight keys, etc.)
  search_params   JSONB,   -- job_scout only: { jobTitle, address, radiusMiles, searchTerms[] }
  search_results  JSONB,   -- job_scout only: [{ businessName, town, state, phone, category, searchTerm }]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now() -- client-stamped, no trigger (see 023's own header)
);

CREATE INDEX IF NOT EXISTS coach_chats_user_id_created_at
  ON coach_chats (user_id, created_at DESC);

ALTER TABLE coach_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_chats own row select" ON coach_chats;
CREATE POLICY "coach_chats own row select"
  ON coach_chats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "coach_chats own row insert" ON coach_chats;
CREATE POLICY "coach_chats own row insert"
  ON coach_chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "coach_chats own row update" ON coach_chats;
CREATE POLICY "coach_chats own row update"
  ON coach_chats FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "coach_chats own row delete" ON coach_chats;
CREATE POLICY "coach_chats own row delete"
  ON coach_chats FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: beta_activity_events  (026, note+feedback added by 030)
-- Usage-tracking log for the 10-week beta program. Append-only, event-per-row.
-- Only written for the tracked cohort (is_tester AND beta_code_used) — gated
-- client-side (isTrackedBetaTester) AND server-side (031's eligibility
-- trigger, see the function index below).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beta_activity_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES user_data(user_id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL
              CHECK (event_type IN (
                'login', 'goal_created', 'goal_updated',
                'expense_created', 'expense_updated', 'feedback' -- feedback added by 030
              )),
  note        TEXT,       -- 030 — only populated on 'feedback' rows
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_activity_events_user_id_created_at
  ON beta_activity_events (user_id, created_at DESC);

ALTER TABLE beta_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_activity_events own row select" ON beta_activity_events;
CREATE POLICY "beta_activity_events own row select"
  ON beta_activity_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "beta_activity_events own row insert" ON beta_activity_events;
CREATE POLICY "beta_activity_events own row insert"
  ON beta_activity_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Append-only, same posture as account_history (020).
REVOKE UPDATE, DELETE ON beta_activity_events FROM anon, authenticated;

-- Server-side eligibility enforcement — see check_beta_activity_event_eligibility()
-- in the function index below (031). RLS above only proves "this row is
-- mine"; the trigger proves "I'm actually a tracked beta tester."


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: beta_codes  (028, channel added by 035)
-- Self-serve beta redemption codes. Dashboard-managed, no admin UI (mirrors
-- investor_codes' original pattern). All active codes valid at once by table
-- design — api/seed.js layers single-use consumption on top via an atomic
-- UPDATE...WHERE claim, not a schema-level constraint.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beta_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT,                          -- human label, e.g. "Cohort 1 invite"
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel    TEXT                           -- 035 — e.g. 'flyer'/'website', lets one link auto-assign from a pool
);

ALTER TABLE beta_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read active beta codes" ON beta_codes;
CREATE POLICY "anon can read active beta codes"
  ON beta_codes FOR SELECT TO anon, authenticated
  USING (is_active = true);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: changelog_entries  (032)
-- Admin-managed "What's New" content, paired with UpdateAvailableBanner.
-- Published entries are readable directly by any authenticated client; drafts
-- only via api/admin-changelog.js's service-role GET.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS changelog_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT,
  title         TEXT        NOT NULL,
  body          TEXT        NOT NULL,           -- markdown, rendered client-side (no raw HTML)
  published_at  TIMESTAMPTZ,                     -- NULL = draft, not yet visible to users
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_published_at
  ON changelog_entries (published_at DESC NULLS LAST);

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read published changelog entries" ON changelog_entries;
CREATE POLICY "authenticated can read published changelog entries"
  ON changelog_entries FOR SELECT TO authenticated
  USING (published_at IS NOT NULL);

-- No insert/update/delete policy — only via api/admin-changelog.js's
-- service-role client, which re-verifies is_admin server-side.


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: consent_records  (033)
-- Terms of Service / Privacy Policy consent capture. Append-only — a consent
-- record is a point-in-time legal fact and must never be edited or deleted.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consent_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id),
  policy_version TEXT        NOT NULL,
  consented_at   TIMESTAMPTZ NOT NULL DEFAULT now() -- forced server-side, see trigger below — never trusted from client payload
);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id_consented_at
  ON consent_records (user_id, consented_at DESC);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read their own consent records" ON consent_records;
CREATE POLICY "users can read their own consent records"
  ON consent_records FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can insert their own consent records" ON consent_records;
CREATE POLICY "users can insert their own consent records"
  ON consent_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policy for any client role, by design — append-only.


-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTIONS & TRIGGERS — full list (all already shown inline above; repeated
-- here as a flat index for quick scanning)
-- ─────────────────────────────────────────────────────────────────────────────
--
--   update_investor_users_updated_at()        → trigger investor_users_updated_at              (011)
--     Stamps updated_at = now() on every investor_users row UPDATE.
--
--   set_tester_trial_window()                 → trigger trg_set_tester_trial_window             (021, SECURITY DEFINER fix in 024)
--     On user_data INSERT/UPDATE: the moment is_tester transitions false→true
--     (or is set true on INSERT), seeds trial_started_at / trial_ends_at /
--     access_ends_at to a flat 6-month window. One-time per transition.
--
--   set_beta_started_at()                     → trigger trg_set_beta_started_at                 (027)
--     On user_data INSERT/UPDATE: the moment beta_code_used transitions to a
--     new non-null value, stamps beta_started_at = now().
--
--   check_beta_activity_event_eligibility()   → trigger trg_check_beta_activity_event_eligibility (031, SECURITY DEFINER)
--     BEFORE INSERT on beta_activity_events: rejects the insert unless
--     NEW.user_id's user_data row has is_tester = true AND beta_code_used IS
--     NOT NULL — the server-side half of isTrackedBetaTester (drift-app-warden
--     §20 F122), closing what was previously a client-JS-only gate.
--
--   force_consent_record_timestamp()          → trigger trg_force_consent_record_timestamp      (033, SECURITY DEFINER)
--     BEFORE INSERT on consent_records: forces consented_at to now(),
--     regardless of what the insert payload claims.
--
--   check_beta_seat_cap()                     → trigger trg_check_beta_seat_cap                 (034, SECURITY DEFINER)
--     BEFORE INSERT OR UPDATE on user_data: on any transition INTO a non-null
--     beta_code_used, counts existing beta_code_used-populated rows and
--     raises if the count is already ≥ 40. Closes the TOCTOU race a
--     JS-side pre-check would have.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- END OF SNAPSHOT (verified live through 035) — next brand-new migration FILE
-- should be numbered 039. Apply 036 and 037 against production first (see the
-- ⚠️ NOT YET LIVE section at the top) — once confirmed live, the next
-- bookmark should extend this snapshot through 037.
-- ─────────────────────────────────────────────────────────────────────────────
