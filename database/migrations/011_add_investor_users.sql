-- ─────────────────────────────────────────────────────────────────────────────
-- 011_add_investor_users.sql
--
-- Adds the investor_users table. One row per investor account, linked to
-- auth.users via auth_user_id.
--
-- code_used / code_used_at: only populated at account creation — the code
-- that was active when the investor registered. Never overwritten on login
-- (backwards-compatible: even if the original code is retired, the investor
-- can still log in via standard email + password).
--
-- active_account: persists the investor's last-selected accounts pill tab
-- (1 = Demo 1, 2 = Demo 2, 3 = personal). Default 1 so new investors always
-- land on the demo view.
--
-- RLS: each investor can only read and update their own row.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investor_users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  investor_name  TEXT        NOT NULL,
  email          TEXT        NOT NULL,
  company_name   TEXT,
  city           TEXT,
  code_used      TEXT,                      -- code active at registration time
  code_used_at   TIMESTAMPTZ,
  active_account SMALLINT    NOT NULL DEFAULT 1, -- 1 | 2 | 3
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by auth user on every login.
CREATE UNIQUE INDEX IF NOT EXISTS investor_users_auth_idx
  ON investor_users (auth_user_id);

ALTER TABLE investor_users ENABLE ROW LEVEL SECURITY;

-- Investor can read and modify only their own row.
CREATE POLICY "investor can manage own row"
  ON investor_users
  FOR ALL
  TO authenticated
  USING  (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Auto-update updated_at on any row change.
CREATE OR REPLACE FUNCTION update_investor_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER investor_users_updated_at
  BEFORE UPDATE ON investor_users
  FOR EACH ROW EXECUTE FUNCTION update_investor_users_updated_at();
