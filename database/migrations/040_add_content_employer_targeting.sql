-- ─────────────────────────────────────────────────────────────────────────────
-- 040_add_content_employer_targeting.sql
--
-- Lets admin-authored checklist items / suggestion prompts (both
-- beta_content_items and base_content_items) optionally target a single
-- employer preset — "push this to DHL users only" — instead of always going
-- to every eligible user. Adds ONE nullable, unconstrained column per table,
-- same "DHL" | null shape CLAUDE.md's Employer Preset Naming Convention
-- already establishes for `config.employerPreset` — NOT a boolean
-- (`is_dhl`-style) column, specifically so a future second preset (Amazon,
-- FedEx, ...) is just a new string value written into the same column, zero
-- migration required. The admin UI is a single "DHL Employees Only"
-- checkbox today because DHL is the only preset that exists — the data
-- model underneath is already general.
--
-- NULL = visible to every eligible user (unchanged behavior) — every
-- existing published row in both tables defaults to NULL, so this migration
-- changes nothing about what's currently live.
--
-- get_user_employer_preset(uid) is the SQL-side read of `config.employerPreset`
-- for use inside RLS — same SECURITY DEFINER STABLE pattern
-- is_tracked_beta_tester(uid) already established (037_add_beta_homebase.sql)
-- for "let a policy cross-reference another table's row without granting
-- broader read access." `config` is JSONB, so this is a `->>'employerPreset'`
-- extraction, not a dedicated column read — `employerPreset` lives inside
-- `user_data.config`, never as its own column (the separate `is_employer_dhl`
-- BOOLEAN column, migration 014, is a different, older representation of the
-- same DHL-specific fact and is NOT what this reads).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function get_user_employer_preset(uid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select config->>'employerPreset' from user_data where user_id = uid;
$$;

-- ── beta_content_items ──────────────────────────────────────────────────────

alter table beta_content_items add column if not exists employer_preset text;

drop policy if exists "tracked beta testers can read published beta content" on beta_content_items;
create policy "tracked beta testers can read published beta content"
  on beta_content_items
  for select
  to authenticated
  using (
    published_at is not null
    and is_tracked_beta_tester(auth.uid())
    and (employer_preset is null or employer_preset = get_user_employer_preset(auth.uid()))
  );

-- ── base_content_items ───────────────────────────────────────────────────────

alter table base_content_items add column if not exists employer_preset text;

drop policy if exists "authenticated users can read published base content" on base_content_items;
create policy "authenticated users can read published base content"
  on base_content_items
  for select
  to authenticated
  using (
    published_at is not null
    and (employer_preset is null or employer_preset = get_user_employer_preset(auth.uid()))
  );

-- ── Verification (run after applying) ────────────────────────────────────────
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'beta_content_items'::regclass; -- no CHECK on employer_preset (unconstrained by design)
--   update beta_content_items set employer_preset = 'DHL' where id = '<some published checklist item>';
--   -- As a DHL user (config.employerPreset = 'DHL', tracked beta tester): row IS visible
--   -- As a non-DHL tracked beta tester: row is NOT visible
--   -- As the same DHL user against base_content_items with a base item's employer_preset = 'DHL': row IS visible
--   -- Existing rows (employer_preset still NULL): visible to everyone, same as before this migration
