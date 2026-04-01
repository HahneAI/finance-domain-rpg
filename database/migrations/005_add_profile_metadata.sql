-- Migration 005: Google OAuth profile metadata columns
-- Stores display name and avatar URL synced from OAuth provider (Google) on sign-in.
-- Both are nullable — email-only users will never have values written here.

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;
