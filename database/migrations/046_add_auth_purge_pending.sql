-- ─────────────────────────────────────────────────────────────────────────────
-- 046_add_auth_purge_pending.sql
--
-- Closes a retry-tracking gap in api/_accountArchive.js's archiveAndDeleteAccount()
-- found alongside migration 045's FK fix. That function's steps run in order:
-- cancel Stripe → upsert the deleted_accounts tombstone → delete the user_data
-- row → delete the auth.users row. If ONLY that last step fails (045's FK bug
-- was exactly this, but any transient auth-admin error has the same shape),
-- everything before it already completed — including the user_data delete.
--
-- The problem: the only signal that a deletion is still in progress
-- (user_data.deletion_requested_at, migration 044) lives on the user_data row
-- — which this exact failure mode has already deleted by the time it happens.
-- api/cron-subscription-lifecycle.js's sweepPendingDeletions() queries
-- user_data for that flag, so it can never find (and therefore never retry)
-- an account stuck in this state — the auth.users row is orphaned forever,
-- still fully able to sign in with no user_data behind it (the "logged back
-- in like a first-time user" symptom).
--
-- Fix: track "does this account still need its auth.users row purged?" on
-- deleted_accounts instead — a row written BEFORE the failure-prone step and
-- never itself deleted, so it survives to be retried regardless of where the
-- process failed. auth_purge_pending starts true on every (re-)upsert and
-- flips false only once auth.admin.deleteUser() actually succeeds.
-- ─────────────────────────────────────────────────────────────────────────────

alter table deleted_accounts
  add column if not exists auth_purge_pending boolean not null default true,
  add column if not exists auth_purged_at timestamptz;

-- ── One-time backfill for rows tombstoned before this column existed ─────────
-- Any pre-existing tombstone got this far in the OLD code, which means its
-- auth.users row purge either already succeeded (the common case, pre-045)
-- or is one of the accounts currently stuck orphaned. Mark all of them
-- pending so the new sweep re-checks every one at least once — retrying a
-- successful auth.admin.deleteUser() on an id that's already gone is a
-- harmless no-op (Supabase returns a "user not found" style error the sweep
-- treats the same as any other failure and just leaves pending), so there's
-- no harm in over-including rather than under-including here.
update deleted_accounts set auth_purge_pending = true where revived_at is null;

-- ── Verification (run after applying) ────────────────────────────────────────
--   select email, deletion_reason, auth_purge_pending, auth_purged_at
--   from deleted_accounts
--   where revived_at is null
--   order by deleted_at desc;
--     -> newly-tombstoned accounts should flip auth_purge_pending to false
--        (with auth_purged_at stamped) once the next cron run's
--        finishPendingAuthPurges() sweep succeeds against them
