-- ─────────────────────────────────────────────────────────────────────────────
-- 013_investor_admin_policies.sql
--
-- Adds admin-only RLS policies to investor_codes and investor_users so that
-- users with is_admin = true in user_data can manage codes and view all
-- investor registrations from the in-app admin UI.
--
-- Existing policies are NOT dropped — the anon/investor policies continue to
-- work for login validation and investor self-service. These are additive.
--
-- investor_codes:
--   admin SELECT  — see ALL rows including is_active = false (anon sees active only)
--   admin UPDATE  — toggle is_active, edit label/notes
--   admin INSERT  — create new access codes
--
-- investor_users:
--   admin SELECT  — see all registrations (investors only see their own row)
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: returns true if the calling auth user has is_admin = true in user_data.
-- Inlined as a sub-select so it works in RLS policies without a stored function
-- (stored functions would require SECURITY DEFINER which is harder to review).

-- ── investor_codes admin policies ─────────────────────────────────────────────

CREATE POLICY "admin can read all investor codes"
  ON investor_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_data
      WHERE user_id = auth.uid()
        AND is_admin = true
    )
  );

CREATE POLICY "admin can update investor codes"
  ON investor_codes
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

CREATE POLICY "admin can insert investor codes"
  ON investor_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_data
      WHERE user_id = auth.uid()
        AND is_admin = true
    )
  );

-- ── investor_users admin policy ───────────────────────────────────────────────

CREATE POLICY "admin can read all investor users"
  ON investor_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_data
      WHERE user_id = auth.uid()
        AND is_admin = true
    )
  );
