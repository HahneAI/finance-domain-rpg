-- Authority Finance: per-user unlock for the Tax Plan / tax projections feature.
-- The Tax Plan section (ProfilePanel) is gated to admins by default. This flag
-- lets you grant it to select non-admin users (e.g. trusted coworkers) on their
-- own account without making them admins.
-- Run in the Supabase SQL editor.

alter table user_data
  add column tax_projections_enabled boolean not null default false;

-- ── Unlock the Tax Plan for a specific coworker ────────────────────────────────
-- Look the user up by email so you don't need their raw auth uid.
-- Repeat for each coworker you want to grant access to.
update user_data
set tax_projections_enabled = true
where user_id = (select id from auth.users where email = 'coworker@example.com');

-- To revoke later:
-- update user_data
-- set tax_projections_enabled = false
-- where user_id = (select id from auth.users where email = 'coworker@example.com');
