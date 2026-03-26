-- Migration 004: Add pto_goal column for DHL PTO leave planning
--
-- Stores a single JSONB object per user describing their leave goal:
--   { label, hoursNeeded, targetDate, negativeBalanceCap }
-- NULL when no goal is set (default for all users).
--
-- Parallel to the existing goals JSONB column but scoped to a single
-- leave planning goal rather than an array of financial goals.
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS pto_goal JSONB DEFAULT NULL;
