-- Life RPG: Add is_dhl and is_admin flags to user_data
-- Run in the Supabase SQL editor.

alter table user_data
  add column is_dhl   boolean not null default false,
  add column is_admin boolean not null default false;

-- ── Update your account ────────────────────────────────────────────────────
update user_data
set
  is_dhl   = true,
  is_admin = true
where user_id = 'db07a039-a917-4f32-ac66-58007485d9ec';
