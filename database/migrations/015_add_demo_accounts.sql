-- ─────────────────────────────────────────────────────────────────────────────
-- 015_add_demo_accounts.sql
--
-- Adds the demo_accounts table so admins can tune the two demo profiles
-- that investors see (Demo Account 1 and Demo Account 2).
--
-- Rows are optional: DemoAccountTree falls back to fixture files when absent.
--
-- RLS policy:
--   SELECT — any authenticated user (investors can read the live demo data)
--   INSERT/UPDATE — only users with is_admin = true in user_data
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE demo_accounts (
  account_number  INTEGER PRIMARY KEY CHECK (account_number IN (1, 2)),
  config          JSONB NOT NULL DEFAULT '{}',
  expenses        JSONB NOT NULL DEFAULT '[]',
  goals           JSONB NOT NULL DEFAULT '[]',
  logs            JSONB NOT NULL DEFAULT '[]',
  meta            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE demo_accounts ENABLE ROW LEVEL SECURITY;

-- Any authenticated user (including investors) can read demo accounts.
CREATE POLICY "authenticated users can read demo accounts"
  ON demo_accounts
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can create a demo account row.
CREATE POLICY "admin can insert demo accounts"
  ON demo_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_data
      WHERE user_id = auth.uid()
        AND is_admin = true
    )
  );

-- Only admins can update demo account data.
CREATE POLICY "admin can update demo accounts"
  ON demo_accounts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_data
      WHERE user_id = auth.uid()
        AND is_admin = true
    )
  )
  WITH CHECK (true);
