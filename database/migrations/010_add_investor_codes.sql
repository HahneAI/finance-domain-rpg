-- ─────────────────────────────────────────────────────────────────────────────
-- 010_add_investor_codes.sql
--
-- Adds the investor_codes table. Codes are managed directly in the Supabase
-- dashboard — insert new rows to add codes, set is_active=false to retire them.
-- All active codes are valid simultaneously; there is no one-time-use logic.
--
-- RLS: anon + authenticated can SELECT active codes so the client can validate
-- without a backend. Only the project owner inserts/updates via dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investor_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT,                          -- human label, e.g. "NOLA Q2 Meeting"
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only active codes are readable by the client.
ALTER TABLE investor_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read active investor codes"
  ON investor_codes
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Seed the initial launch code.
INSERT INTO investor_codes (code, label)
  VALUES ('success', 'Initial Launch Code')
  ON CONFLICT (code) DO NOTHING;
