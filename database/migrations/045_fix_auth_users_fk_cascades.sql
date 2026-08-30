-- ─────────────────────────────────────────────────────────────────────────────
-- 045_fix_auth_users_fk_cascades.sql
--
-- Root cause found live 2026-08-30: auth.admin.deleteUser() — called both by
-- api/delete-account.js / api/cron-subscription-lifecycle.js's shared
-- archiveAndDeleteAccount() (api/_accountArchive.js) AND by deleting a row
-- directly from the Supabase Studio Auth table — fails with a foreign-key
-- violation for ANY account that has ever inserted a consent_records row.
-- Since LoginScreen.jsx's signup gate writes one for every new signup
-- (migration 033), that is effectively every real account created since
-- then. consent_records.user_id REFERENCES auth.users(id) with NO
-- ON DELETE CASCADE (or any other action) — Postgres's default is to block
-- the delete outright, and this holds regardless of RLS/role, so even the
-- service-role client used by archiveAndDeleteAccount() cannot get past it.
--
-- This is why the original "Failed to delete auth account" bug happened, why
-- deleting old tester accounts directly from the Auth table errors out the
-- same way, and why a deleted account's login can resurface as an apparent
-- first-time user: archiveAndDeleteAccount() cancels the Stripe subscription,
-- writes the deleted_accounts tombstone, and deletes the user_data row BEFORE
-- its final auth.admin.deleteUser() call — so a failure there leaves the
-- auth.users row alive with no user_data row behind it. Signing back in then
-- hits the same still-valid auth account with nothing in user_data, so
-- loadUserData() falls back to DEFAULT_CONFIG (setupComplete: false) and the
-- wizard runs again — even though the account was never actually gone. If
-- that "fresh" flow leads through Stripe checkout again, it opens a brand
-- new customer/subscription — a second, separate charge — on a different
-- Stripe object than whatever was there before.
--
-- Fix: consent_records.user_id gets ON DELETE CASCADE (its content is
-- explicitly promised to go with the account on deletion — the delete-account
-- confirmation copy says "your account, profile, and stored dashboard data
-- will be permanently deleted," and an orphaned per-account consent log has
-- no standalone purpose). The other un-cascaded auth.users references
-- (admin-authored-content "created_by"/"updated_by" audit columns —
-- changelog_entries, beta_content_items, beta_scores, base_content_items) are
-- nullable and NOT meant to disappear with the row they annotate, so those
-- get ON DELETE SET NULL instead — deleting an admin's own account (Anthony's
-- account is exactly this shape) must not silently delete the changelog/beta
-- content they authored, only detach the authorship pointer.
--
-- First pass at this migration dropped/re-added by an ASSUMED constraint name
-- (Postgres's usual default, "<table>_<column>_fkey") and errored live — these
-- tables' real constraint names don't match that assumption, so
-- DROP CONSTRAINT IF EXISTS silently no-opped and ADD CONSTRAINT then
-- collided with the still-present original. This version never assumes a
-- name: each block below looks up the table/column's real FK-to-auth.users
-- constraint via pg_constraint first, drops whatever it actually finds (there
-- should only ever be one, but the loop handles more than one defensively),
-- then adds the replacement under a name of our own choosing.
--
-- api/_accountArchive.js is unaffected by this migration — same function,
-- now able to actually complete its final step instead of throwing every
-- single time.
-- ─────────────────────────────────────────────────────────────────────────────

-- consent_records.user_id — NOT NULL, cascades (see rationale above).
do $$
declare fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'consent_records'::regclass
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and att.attname = 'user_id'
  loop
    execute format('alter table consent_records drop constraint %I', fk.conname);
  end loop;
end $$;
alter table consent_records
  add constraint consent_records_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- changelog_entries.created_by — nullable audit column, detach only.
do $$
declare fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'changelog_entries'::regclass
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and att.attname = 'created_by'
  loop
    execute format('alter table changelog_entries drop constraint %I', fk.conname);
  end loop;
end $$;
alter table changelog_entries
  add constraint changelog_entries_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- beta_content_items.created_by — nullable audit column, detach only.
do $$
declare fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'beta_content_items'::regclass
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and att.attname = 'created_by'
  loop
    execute format('alter table beta_content_items drop constraint %I', fk.conname);
  end loop;
end $$;
alter table beta_content_items
  add constraint beta_content_items_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- beta_scores.updated_by — nullable audit column, detach only. (beta_scores.user_id
-- itself is the scored tester and already has ON DELETE CASCADE from migration 037.)
do $$
declare fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'beta_scores'::regclass
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and att.attname = 'updated_by'
  loop
    execute format('alter table beta_scores drop constraint %I', fk.conname);
  end loop;
end $$;
alter table beta_scores
  add constraint beta_scores_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

-- base_content_items.created_by — nullable audit column, detach only.
do $$
declare fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'base_content_items'::regclass
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and att.attname = 'created_by'
  loop
    execute format('alter table base_content_items drop constraint %I', fk.conname);
  end loop;
end $$;
alter table base_content_items
  add constraint base_content_items_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- ── Verification (run after applying) ────────────────────────────────────────
--   -- Confirm no other un-cascaded auth.users FK is still lurking:
--   select conrelid::regclass as table_name, conname, confdeltype
--   from pg_constraint
--   where confrelid = 'auth.users'::regclass and contype = 'f';
--     -> every row should show confdeltype 'c' (cascade), 'n' (set null), or a
--        table already known to require it (user_data itself has no FK to
--        auth.users at all — it's only ever queried via user_id, not enforced)
--   -- Then retry deleting a previously-stuck account (either through the app's
--   -- Delete Account flow, or directly via Supabase Studio's Auth table) — it
--   -- should now fully succeed instead of erroring with a foreign-key violation.
