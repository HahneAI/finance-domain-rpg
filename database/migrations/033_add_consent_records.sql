-- ─────────────────────────────────────────────────────────────────────────────
-- 033_add_consent_records.sql
--
-- Terms of Service / Privacy Policy consent capture — paired with the
-- signup gate in LoginScreen.jsx and the (currently flag-gated, see
-- constants/legalDocuments.js's ENFORCE_EXISTING_USER_RECONSENT) re-consent
-- check in App.jsx.
--
-- Append-only by design: a consent record is a point-in-time legal fact
-- ("this user agreed to version X at time Y") and must never be edited or
-- deleted after the fact — that's why this is its own table instead of a
-- user_data column a later edit could silently overwrite. No UPDATE/DELETE
-- policy exists for any client role below.
--
-- consented_at is forced to the database's own clock via trigger, never
-- trusted from the client insert payload — same reasoning as
-- 031_beta_activity_events_eligibility_trigger.sql's insert-time guard,
-- applied here so a modified client can't backdate a consent timestamp.
--
-- IMPORTANT: as of this migration, the Terms of Service / Privacy Policy
-- text this table records agreement to (constants/legalDocuments.js) is
-- placeholder copy, not reviewed or approved legal language. The mechanism
-- here is real and live for new signups; see that file's header for what's
-- still outstanding before this should be treated as a real compliance
-- record.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consent_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id),
  policy_version TEXT        NOT NULL,
  consented_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id_consented_at
  ON consent_records (user_id, consented_at DESC);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read their own consent records" ON consent_records;
CREATE POLICY "users can read their own consent records"
  ON consent_records
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users can insert their own consent records" ON consent_records;
CREATE POLICY "users can insert their own consent records"
  ON consent_records
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policy for any client role, by design — append-only.

-- Forces consented_at to the server's clock regardless of what the insert
-- payload claims, so a modified client can't backdate a consent record.
CREATE OR REPLACE FUNCTION force_consent_record_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.consented_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_consent_record_timestamp ON consent_records;
CREATE TRIGGER trg_force_consent_record_timestamp
  BEFORE INSERT ON consent_records
  FOR EACH ROW
  EXECUTE FUNCTION force_consent_record_timestamp();

-- ── Verification (run after applying) ────────────────────────────────────────
--   insert into consent_records (user_id, policy_version) values (auth.uid(), '0.1-placeholder');
--   select * from consent_records where user_id = auth.uid();
--     -> consented_at should be ~now(), even if a different value was sent in the insert
--   update consent_records set policy_version = 'x' where user_id = auth.uid();
--     -> must fail: no UPDATE policy exists
