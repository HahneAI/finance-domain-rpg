-- ─────────────────────────────────────────────────────────────────────────────
-- 012_add_is_investor_to_user_data.sql
--
-- Adds is_investor flag to user_data. Existing rows default to false.
-- Set to true by createInvestorAccount() in supabase.js when an investor
-- registers via the access code flow.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS is_investor BOOLEAN NOT NULL DEFAULT false;
