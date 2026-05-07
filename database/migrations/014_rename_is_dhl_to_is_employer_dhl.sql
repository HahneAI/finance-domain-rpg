-- ─────────────────────────────────────────────────────────────────────────────
-- 014_rename_is_dhl_to_is_employer_dhl.sql
--
-- Renames the user_data.is_dhl column to is_employer_dhl to match the
-- generalizable employer-preset naming convention adopted 2026-04-29.
--
-- Background:
--   is_dhl was a boolean convenience column that denormalises whether the user
--   has the DHL employer preset. As Authority Finance adds more employer
--   presets (Amazon, FedEx, etc.) the column name must be specific to DHL.
--   The JS layer already uses isEmployerDHL; this migration brings the schema
--   into alignment.
--
-- No data is changed — this is a pure column rename.
-- RLS policies on user_data do not reference is_dhl, so no policy changes are
-- needed.
--
-- Run in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_data
  rename column is_dhl to is_employer_dhl;
