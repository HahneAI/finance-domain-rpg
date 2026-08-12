-- ─────────────────────────────────────────────────────────────────────────────
-- 041_add_resume_profile_storage.sql
--
-- §2.E1 v2 (docs/TODO.md, scoped 2026-08-11 per user directive) — résumé
-- becomes a persistent, retrievable account asset via real file upload, not
-- just pasted text. First real Supabase Storage usage in this codebase (see
-- §2.G's note) — no existing bucket/policy pattern to copy, built from
-- scratch here.
--
-- File metadata rides on the existing 036_add_resume_profile.sql row (one row
-- per user already); the file itself lives in a new private 'resumes' bucket,
-- one object per user at `<user_id>/resume.<ext>` — uploading a new file
-- overwrites the previous one (upsert on that fixed path) rather than
-- versioning, matching the v2 scoping note.
-- ─────────────────────────────────────────────────────────────────────────────

alter table resume_profile
  add column storage_path      text,   -- e.g. '<user_id>/resume.pdf' — null until a file is uploaded
  add column original_filename text,   -- as picked by the user, e.g. 'John_Smith_Resume.pdf'
  add column mime_type         text,
  add column file_size_bytes   bigint;

-- ── Storage bucket — private, RLS-gated, not the public CDN path ────────────
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- ── Storage RLS — own-folder access, keyed by the path's first segment ─────
-- Every object this app writes is namespaced `<user_id>/...`, so
-- storage.foldername(name))[1] = auth.uid()::text is equivalent in spirit to
-- resume_profile's own-row `auth.uid() = user_id` policies (019/036
-- precedent), just expressed via Storage's path-based policy mechanism
-- instead of a row column — storage.objects RLS can't reference our
-- resume_profile table directly.

create policy "resumes own folder select"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes own folder insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes own folder update"
  on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes own folder delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Verification (run after applying) ────────────────────────────────────────
--   select column_name from information_schema.columns
--     where table_name = 'resume_profile' and column_name like '%storage%' or column_name like '%file%';
--     -> storage_path, original_filename, mime_type, file_size_bytes
--   select id, public from storage.buckets where id = 'resumes';
--     -> public should be FALSE
--   select policyname from pg_policies where tablename = 'objects' and policyname like 'resumes own folder%';
--     -> 4 rows (select/insert/update/delete)
--   Signed in as user A, attempt: select * from storage.objects
--     where bucket_id = 'resumes' and (storage.foldername(name))[1] <> auth.uid()::text;
--     -> must return 0 rows
