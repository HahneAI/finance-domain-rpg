-- ─────────────────────────────────────────────────────────────────────────────
-- 028_add_beta_codes.sql
--
-- docs/TODO.md §32 — self-serve redemption for the beta program, replacing the
-- manual-SQL-only path (025_add_beta_code_used.sql). Deliberately mirrors
-- investor_codes (010_add_investor_codes.sql) almost exactly, including its
-- management model: codes are managed directly in the Supabase dashboard
-- (insert a row to add a code, set is_active=false to retire one) — no admin
-- UI is built for this table, matching investor_codes' original pattern and
-- the "don't overbuild for ~40 users" scope this whole beta system was built
-- under. All active codes are valid simultaneously; no one-time-use logic.
--
-- No seed row here (unlike investor_codes' 'success' launch code) — the beta
-- program is explicitly not ready to accept redemptions yet ("codes will not
-- be accessible until we are fully ready for the beta to start"). An empty
-- table means the redemption route has zero valid codes and is inert until
-- someone inserts real codes via the dashboard when the program is ready to
-- open.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beta_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT,                          -- human label, e.g. "Cohort 1 invite"
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only active codes are readable by the client (same as investor_codes) — lets
-- the redemption UI give instant "valid code" feedback without a round trip,
-- while api/seed-beta.js re-validates server-side as the real security boundary.
ALTER TABLE beta_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read active beta codes" ON beta_codes;
CREATE POLICY "anon can read active beta codes"
  ON beta_codes
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- ── Verification (run after applying) ────────────────────────────────────────
--   insert into beta_codes (code, label) values ('betatest1', 'Manual smoke test');
--   select * from beta_codes where is_active = true;
--     -> the new row should be readable as anon/authenticated
