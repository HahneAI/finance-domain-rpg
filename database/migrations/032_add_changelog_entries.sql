-- ─────────────────────────────────────────────────────────────────────────────
-- 032_add_changelog_entries.sql
--
-- docs/TODO.md — admin-managed "What's New" changelog, paired with the PWA
-- update banner (UpdateAvailableBanner.jsx). Unlike beta_codes/investor_codes
-- (managed directly in the Supabase dashboard, no admin UI), this table gets a
-- real in-app authoring surface in the Account panel — content changes are
-- expected often enough (every notable release) that a dashboard-only
-- workflow would be friction, unlike the "insert a row occasionally" codes
-- tables.
--
-- Writes (insert/update/delete) go through api/admin-changelog.js only — same
-- service-role + is_admin re-check pattern as api/admin-beta-report.js — never
-- a direct client write, per the migration-019 RLS posture the rest of the
-- app follows. Reads split in two:
--   - Published entries are readable directly by any authenticated client
--     (RLS policy below) — the SetupWizard-style "no API round trip needed
--     for a public read" pattern beta_codes/investor_codes already use.
--   - Draft entries (published_at IS NULL) are NOT covered by the RLS policy
--     below — the admin authoring list also goes through
--     api/admin-changelog.js (GET), which uses the service-role client to see
--     everything, drafts included.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS changelog_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT,                          -- freeform, e.g. "2026.07.26" — package.json's version isn't maintained, so this is the only version identity that exists
  title         TEXT        NOT NULL,
  body          TEXT        NOT NULL,           -- markdown, rendered client-side via react-markdown (no raw HTML — see ChangelogModal.jsx)
  published_at  TIMESTAMPTZ,                    -- NULL = draft, not yet visible to users
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_published_at
  ON changelog_entries (published_at DESC NULLS LAST);

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read published changelog entries" ON changelog_entries;
CREATE POLICY "authenticated can read published changelog entries"
  ON changelog_entries
  FOR SELECT
  TO authenticated
  USING (published_at IS NOT NULL);

-- No insert/update/delete policy for authenticated/anon — those only happen
-- via api/admin-changelog.js's service-role client, which bypasses RLS after
-- re-verifying the caller's is_admin flag server-side.

-- ── Verification (run after applying) ────────────────────────────────────────
--   insert into changelog_entries (version_label, title, body, published_at)
--     values ('test', 'Test entry', 'Hello **world**', now());
--   select * from changelog_entries; -- as authenticated: only published rows visible
--   insert into changelog_entries (version_label, title, body)
--     values ('draft', 'Draft entry', 'Not visible yet');
--   select * from changelog_entries where published_at is null;
--     -- as authenticated (non-service-role): should return zero rows
