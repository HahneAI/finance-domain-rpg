-- ─────────────────────────────────────────────────────────────────────────────
-- 044_add_deletion_requested_at.sql
--
-- User-initiated account deletion (api/delete-account.js) used to be a
-- synchronous, all-or-nothing hard delete: if the final auth.admin.deleteUser
-- call failed for any reason (a transient Supabase Auth error, network blip,
-- etc.), the user was shown a raw "Failed to delete auth account" error and
-- sent right back into the app — after their user_data row had *already* been
-- deleted. A user who asks to leave must never be told "no" by an
-- infrastructure hiccup. This column is the fix: delete-account.js now stamps
-- deletion_requested_at FIRST (a write that should essentially never fail),
-- which is enough on its own to lock the account and honor the request from
-- the user's perspective, before attempting the real archive-then-delete
-- (api/_accountArchive.js, same tombstone path the day-21+7 dunning cron
-- already uses). If that inline attempt fails partway, the row is left
-- locked-but-not-yet-purged, and the daily cron (api/cron-subscription-lifecycle.js)
-- sweeps any row with deletion_requested_at set and retries the same archive
-- until it succeeds — see that file's sweepPendingDeletions().
--
-- A non-null deletion_requested_at also gates app access going forward
-- (src/lib/db.js loadUserData → src/App.jsx) so a locked account can't keep
-- using the dashboard in the (should-be-brief) window before the retry sweep
-- finishes the real purge.
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_data
  add column if not exists deletion_requested_at timestamptz;

-- ── Verification (run after applying) ────────────────────────────────────────
--   -- Simulate a locked-but-not-purged row:
--   update user_data set deletion_requested_at = now() where user_id = '<test-uid>';
--     -> next app load for that user should show the goodbye/locked screen, not the dashboard
--   -- Confirm the client can't clear its own lock (privileged column, no client grant):
--   update user_data set deletion_requested_at = null where user_id = auth.uid();
--     -> should fail/affect 0 columns under the migration 019 column-grant policy
