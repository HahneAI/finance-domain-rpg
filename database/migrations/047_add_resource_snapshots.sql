-- ─────────────────────────────────────────────────────────────────────────────
-- 047_add_resource_snapshots.sql
--
-- TODO §22.F — the Cyborg Resource snapshot. Cyborg (a separate Authority OS
-- app) shows a few figures only this app computes: Cash on Hand (§22), the next
-- paycheck, the next Claim Date. Rather than Cyborg re-deriving them (a second
-- formula — drift-app-warden case law), this app writes one small row computed
-- by its own functions (lib/resourceSnapshot.js) and Cyborg reads it,
-- read-only, straight from Supabase under this RLS — no api/ route either side
-- (the 12-function Hobby cap is untouched).
--
-- One row per user (`user_id` is the primary key — 1:1 with an account, same
-- shape as resume_profile, 036). The figures live in one `payload` jsonb with a
-- `schema_version`, so adding a field later is a version bump, not a migration.
-- Derived output, not user data: nothing in this app reads it back.
--
-- Only accounts that publish (today: is_admin — Anthony's, linked to his Cyborg
-- account) ever have a row. Cyborg reads with that same user's own session, so
-- own-row select is the whole read surface.
-- ─────────────────────────────────────────────────────────────────────────────

create table resource_snapshots (
  user_id         uuid primary key references user_data(user_id) on delete cascade,
  schema_version  integer not null default 1,
  payload         jsonb not null,
  computed_at     timestamptz not null default now()  -- client-stamped on each write
);

alter table resource_snapshots enable row level security;

create policy "resource_snapshots own row select"
  on resource_snapshots for select to authenticated
  using (auth.uid() = user_id);

create policy "resource_snapshots own row insert"
  on resource_snapshots for insert to authenticated
  with check (auth.uid() = user_id);

create policy "resource_snapshots own row update"
  on resource_snapshots for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: the row goes with the account (cascade). A user who stops
-- publishing just stops writing; Cyborg shows the "as of" date either way.
