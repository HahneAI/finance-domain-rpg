-- ═════════════════════════════════════════════════════════════════════════════
-- 📌 BOOKMARK — NOT A MIGRATION — DO NOT RUN AS PART OF THE MIGRATION SEQUENCE
-- ═════════════════════════════════════════════════════════════════════════════
--
--   File:      022_BOOKMARK_schema_snapshot_2026-07-10.sql
--   Snapshot date: 2026-07-10
--   Compiled from: 001_initial_schema.sql  →  021_add_is_tester_beta_flag.sql
--                  (every file in this folder at the time of writing)
--   Verified: confirmed against a live Supabase schema export on 2026-07-10,
--             after 021 was run — is_tester is present in production.
--
--   WHAT THIS IS
--   ────────────
--   A single, read-in-one-sitting recap of what the `finance-domain-rpg`
--   Supabase database looks like once every migration through 021 has been
--   applied. It exists so a future session (human or Claude) can understand
--   the full current schema without opening and mentally diffing 20+ files.
--
--   WHAT THIS IS NOT
--   ────────────────
--   • It is NOT the next migration to run. It changes nothing that migrations
--     001–021 didn't already change.
--   • It does NOT replay one-time DATA fixes (006, 007, 009 — Anthony's
--     personal expense-history corrections) or seed INSERTs (001's single-user
--     row, 010's launch investor code, 020's rollout_seed backfill). Those
--     already executed against production; re-running them here would be
--     wrong. This file is SCHEMA ONLY — tables, columns, constraints, RLS,
--     functions, triggers.
--   • The word BOOKMARK in the filename (and the numeric prefix landing on
--     the next open slot, 022) is deliberate: it sorts correctly alongside
--     real migrations in a file listing, but the all-caps tag makes it
--     unmistakable at a glance that this one is reference material, not a
--     pending change.
--
--   NUMBERING GAP — 008 does not exist in this folder. 007 and 009 are both
--   one-time data-fix scripts for the same account (Anthony,
--   57318ced-60a0-4fdf-9a58-a6409ba8c9db); whatever would have been 008 was
--   apparently never committed. Not a bug to fix — just noted here so it
--   doesn't look like an accidental omission on first read.
--
--   HOW TO KEEP THIS USEFUL
--   ────────────────────────
--   This snapshot is frozen at 021. It will drift the moment 022+ (a REAL
--   migration, taking the next number after this bookmark) ships. When that
--   happens, don't edit this file — leave it as the "through 021" record and
--   add a new bookmark (e.g. 0NN_BOOKMARK_schema_snapshot_<date>.sql) the
--   next time a full recap is worth having. Every statement below uses
--   IF NOT EXISTS / DROP-then-CREATE idempotent patterns, so even if this
--   file were run by mistake against a DB already at 021, it is a no-op —
--   but that safety net is a bonus, not an excuse to run it. Treat it as
--   read-only documentation.
--
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: user_data
-- Origin: 001 (initial 7 columns) · columns added/renamed by 002, 003, 004,
-- 005, 012, 014 (rename is_dhl → is_employer_dhl), 016, 017, 021.
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
  is_tester                 BOOLEAN     NOT NULL DEFAULT false             -- 021
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

-- Column-level write protection (019): own-row RLS alone still lets a user
-- write ANY column of their own row, including is_admin — Postgres column
-- privileges are the layer that stops that. Client (anon/authenticated) has
-- ZERO insert/update rights except the narrow grant lists below.
-- NOTE: is_tester (021) was added AFTER this grant list existed and was
-- never added to it — same "no client write access" protection as
-- is_admin/is_investor/tax_projections_enabled/every Stripe column, with no
-- extra policy required. Any future column that must stay admin/service-role-
-- only should be added AFTER these two GRANT statements, never inside them.
REVOKE INSERT, UPDATE ON user_data FROM anon, authenticated;

GRANT INSERT (
  user_id, config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) ON user_data TO authenticated;

GRANT UPDATE (
  config, expenses, goals, logs, show_extra, week_confirmations,
  is_employer_dhl, pto_goal, display_name, avatar_url, updated_at
) ON user_data TO authenticated;
-- anon gets no write access at all; RLS + no grants = deny.


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
-- Nothing reads this table yet — the resolver is a deliberate future phase.
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
-- FUNCTIONS & TRIGGERS — full list (both already shown inline above; repeated
-- here as a flat index for quick scanning)
-- ─────────────────────────────────────────────────────────────────────────────
--
--   update_investor_users_updated_at()      → trigger investor_users_updated_at   (011)
--     Stamps updated_at = now() on every investor_users row UPDATE.
--
--   set_tester_trial_window()               → trigger trg_set_tester_trial_window (021)
--     On user_data INSERT/UPDATE: the moment is_tester transitions false→true
--     (or is set true on INSERT), seeds trial_started_at / trial_ends_at /
--     access_ends_at to a flat 6-month window. One-time per transition, not
--     renewed on subsequent saves. See 021's header comment for full rationale.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- END OF SNAPSHOT — next real migration should be numbered 023.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- 🔎 LIVE DIAGNOSTIC ADDENDUM — appended 2026-07-17, does NOT change the
--    2026-07-10 snapshot above. Filename/date intentionally left as-is per
--    the file's own "don't edit, add a new bookmark instead" rule — this is
--    an appendix, not a re-snapshot. Captures what a live `information_schema`
--    / `pg_catalog` query bundle actually showed on the production/preview
--    Supabase project during investigation of a "permission denied for table
--    user_data" error surfacing in App.jsx's SaveFailedBanner (added the same
--    week — see git log around the eager-save work). Two things prompted
--    this: (1) confirmation that some RLS work has been applied by hand
--    directly in the Supabase SQL editor over time, not always as a committed
--    migration in this folder, so this folder's contents can drift from the
--    live schema; (2) a real save failure that needed root-causing.
--
--    HOW TO USE THIS SECTION
--    ────────────────────────
--    If you're debugging another user_data write failure later, re-run the
--    query bundle below against the live project FIRST — don't trust that
--    001–024 fully describe current reality. This addendum is a snapshot of
--    one point in time (2026-07-17), not a guarantee of what's true later.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── What was run ──────────────────────────────────────────────────────────────
--   1. select relname, relrowsecurity, relforcerowsecurity, relowner::regrole
--      as owner from pg_class where relname = 'user_data';
--   2. select policyname, cmd, roles, qual, with_check from pg_policies
--      where tablename = 'user_data';
--   3. select grantee, privilege_type, column_name from
--      information_schema.column_privileges where table_name = 'user_data'
--      and grantee in ('authenticated','anon') order by grantee, column_name,
--      privilege_type;
--   4. select grantee, privilege_type from information_schema.role_table_grants
--      where table_name = 'user_data' and grantee in ('authenticated','anon')
--      order by grantee, privilege_type;
--   5. select t.tgname, p.proname, p.prosecdef as is_security_definer from
--      pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid =
--      'user_data'::regclass and not t.tgisinternal;
--   6. select user_id, is_admin, is_tester, is_investor, subscription_status,
--      trial_ends_at from user_data where user_id = '<account>';
--
-- ── Findings ─────────────────────────────────────────────────────────────────
--
--   (1) RLS: relrowsecurity = true, relforcerowsecurity = false, owner =
--       postgres. As expected — 019 enabled RLS and it's live.
--
--   (2) POLICIES — five exist, not four. Alongside 019's own four
--       (user_data own row select/insert/update/delete, all role
--       `authenticated`) there's a fifth, older policy:
--
--         "own row only"  cmd=ALL  roles={public}  qual=(auth.uid()=user_id)
--         with_check=null
--
--       This is NOT in any migration file in this folder — almost certainly
--       one of the hand-run RLS pieces mentioned above, likely predating 019.
--       It's redundant (Postgres OR's multiple permissive policies for the
--       same command together, so this doesn't restrict anything 019's four
--       don't already cover) and role `public` is broader than it needs to be
--       (harmless in practice since `auth.uid()` is null for anon, but sloppy
--       — worth a future cleanup migration that drops it). NOT the cause of
--       the permission-denied error: RLS policy violations either silently
--       filter rows (USING) or raise "new row violates row-level security
--       policy" (WITH CHECK) — never "permission denied for table X". That
--       exact wording is Postgres's signature for a missing GRANT, a
--       different failure class entirely. Ruled out as the cause here.
--
--   (3) COLUMN-LEVEL GRANTS for `authenticated` — confirmed present and
--       correct (INSERT + UPDATE) for every column checked so far: config,
--       expenses, goals, logs, is_employer_dhl, display_name, avatar_url.
--       Confirmed correctly ABSENT (no INSERT/UPDATE, as 019 intends) for:
--       is_admin, is_investor, is_tester, access_ends_at, card_on_file,
--       current_period_end, dunning_email_count, last_dunning_email_at, plan.
--       STILL UNCONFIRMED as of this writing: pto_goal, show_extra,
--       week_confirmations, updated_at, user_id — the result set was cut off
--       mid-list by the SQL editor's display before reaching them. These are
--       exactly the remaining columns saveUserData() (src/lib/db.js) writes
--       on every save — if even one lacks its UPDATE grant, that alone
--       explains "permission denied for table user_data" on every ordinary
--       save, since Postgres rejects the whole multi-column UPDATE/UPSERT
--       statement if any one targeted column lacks privilege. Follow-up
--       query (narrowed to just these columns, to avoid truncation):
--
--         select grantee, privilege_type, column_name
--         from information_schema.column_privileges
--         where table_name = 'user_data' and grantee = 'authenticated'
--           and column_name in ('user_id','config','expenses','goals','logs',
--             'show_extra','week_confirmations','is_employer_dhl','pto_goal',
--             'updated_at')
--         order by column_name, privilege_type;
--
--       Update this addendum with the result once run.
--
--   (4) TABLE-LEVEL GRANTS for `authenticated`: DELETE, REFERENCES, SELECT,
--       TRIGGER, TRUNCATE. Notably NO table-level INSERT or UPDATE — confirms
--       019's `revoke insert, update on user_data from anon, authenticated`
--       took effect and stuck. All write access for `authenticated` on this
--       table is governed exclusively by the column-level grants in (3).
--       This matters for the same reason as (3): there is no broader
--       table-level fallback, so a single missing column grant is a hard
--       failure for the entire write, not a partial one.
--
--   (5) TRIGGERS: only one non-internal trigger on user_data —
--       trg_set_tester_trial_window → set_tester_trial_window(), confirmed
--       `is_security_definer = false` (plain SECURITY INVOKER, the default).
--       This IS a real, independent latent bug: the function assigns
--       NEW.trial_started_at / trial_ends_at / access_ends_at, columns
--       deliberately excluded from `authenticated`'s grant (see (3)) — for
--       any account where is_tester actually transitions to true, this
--       trigger would attempt a privileged write under the calling client's
--       own (insufficient) privileges and fail the whole statement, exactly
--       like (3)'s failure mode. Fixed regardless in
--       024_fix_user_data_write_permission.sql (makes the function SECURITY
--       DEFINER). BUT: traced through the trigger's own logic and confirmed
--       this specific bug does NOT explain the failures reported during this
--       investigation — both affected accounts (Anthony's admin account and
--       a separate base-tier trial account) have is_tester = false, and the
--       trigger's guarded branches (`if NEW.is_tester = true ...`) never
--       execute when is_tester stays false, so it never actually touches the
--       locked columns for either of them. Keep the SECURITY DEFINER fix as
--       correct hardening for real is_tester accounts, but the root cause of
--       the currently-reported failures is still (3)'s unconfirmed columns.
--
--   (6) Account flags at time of query — Anthony's admin account
--       (57318ced-60a0-4fdf-9a58-a6409ba8c9db): is_admin=true, is_tester=
--       false, is_investor=false, subscription_status='trialing',
--       trial_ends_at='2026-07-17 05:55:28.28+00' (today, at time of
--       writing — unrelated to this bug since is_admin bypasses the paywall
--       gate regardless of trial phase, but noted in case it's a surprise).
--
-- ── Working diagnosis as of this addendum ───────────────────────────────────
--   Not yet fully confirmed. Leading theory: one or more of pto_goal /
--   show_extra / week_confirmations / updated_at is missing its column-level
--   UPDATE grant for `authenticated`, despite being listed in 019's migration
--   file — meaning the LIVE grant state has drifted from what 019 says it
--   should be (consistent with the "some RLS work was run by hand, untracked"
--   context that prompted this whole investigation — see (2)'s orphaned
--   policy for a second, independent piece of the same evidence). If that's
--   confirmed, the fix is a straightforward re-grant of the missing
--   column(s), same pattern as 019 / 024's belt-and-suspenders re-assertion.
-- ═════════════════════════════════════════════════════════════════════════════
