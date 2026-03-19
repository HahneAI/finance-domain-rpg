-- Life RPG: Initial Schema
-- Run this once in the Supabase SQL Editor.

create table user_data (
  user_id    uuid primary key,
  config     jsonb not null default '{}',
  expenses   jsonb not null default '[]',
  goals      jsonb not null default '[]',
  logs       jsonb not null default '[]',
  show_extra boolean not null default true,
  updated_at timestamptz not null default now()
);

-- RLS is disabled for now (no auth, single personal user).
-- When adding auth later:
--   alter table user_data enable row level security;
--   create policy "own row only" on user_data for all using (auth.uid() = user_id);

-- Insert your single user row — replace the UUID with your chosen one.
-- Generate a UUID at: https://www.uuidgenerator.net/
insert into user_data (user_id) values ('db07a039-a917-4f32-ac66-58007485d9ec');
