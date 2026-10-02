# Migrations — notes moved from `.claude/CLAUDE.md` (2026-10-02 cleanup)

**Schema bookmarks:** `database/migrations/0NN_BOOKMARK_schema_snapshot_<date>.sql` files are
periodic full-schema recaps, not real migrations — never assign one the actual next migration
number in sequence expecting it to run. They exist purely so a session can read one file instead
of the entire migrations folder to understand current DB shape. The `BOOKMARK` tag and all-caps
make them impossible to mistake for a pending migration. Latest bookmark:
`038_BOOKMARK_schema_snapshot_2026-08-06.sql` — table/column defs for migrations through 035 were
verified 2026-08-06 against a live Supabase schema export; 036 and 037 were added to the same file
on 2026-08-07 per Anthony's confirmation that both had been run against production (attributed in
the file as owner confirmation, not a fresh export reconciliation — see its header for the exact
distinction). Real migrations continue past it: 023 (coach_chats), 024 (user_data write-permission fix),
025–030 (beta program — `beta_code_used`, `beta_started_at`, `beta_codes`,
`beta_halfway_email_sent_at`, `beta_activity_events` + its `feedback` event type), 031
(beta_activity_events eligibility trigger), 032 (`changelog_entries` — the admin-managed
"What's New" table, `api/admin-changelog.js`), 033 (`consent_records` — Terms of Service /
Privacy Policy consent capture, append-only, `LoginScreen.jsx`'s signup gate), 034
(beta_seat_cap — hard 40-seat cap enforced at the DB level), 035 (beta_codes_channel — lets one
link/QR code auto-assign from a named pool), 036 (resume_profile + coach_chats `resume_review`
chat_type), 037 (`beta_content_items` + `beta_checklist_completions` + `beta_scores` — the Beta
Homebase, `api/admin-beta-hub.js`, drift-app-warden §20 F123), 039 (`base_content_items` +
`base_checklist_completions` + `base_feedback_events` — Money Moves, the base-user counterpart
to the Beta Homebase, isolated tables reusing `api/admin-beta-hub.js`'s route via a new
`entity: "base_content"` branch instead of a new serverless function, drift-app-warden §20
F125), 040 (`employer_preset` column on `beta_content_items`/`base_content_items` +
`get_user_employer_preset(uid)` — lets admin-authored content target a single employer preset,
e.g. "DHL employees only," same SECURITY DEFINER pattern as `is_tracked_beta_tester`), 041
(`resume_profile` storage columns — `storage_path`/`original_filename`/`mime_type`/
`file_size_bytes` — plus the app's first Supabase Storage bucket, `resumes`, private with
own-folder RLS; §2.E1 v2, drift-app-warden §21 F124) exist —
**the next real migration is 047** (042–046 exist: `is_ai_admin`, AI-admin coach cap, `deletion_requested_at`, auth-FK cascades, `auth_purge_pending`). Verify against the folder before numbering;
this note has now gone stale five times
(drift-app-warden §14, across the beta-program migrations, across 031–032, again across 033, and
again when 032 collided with a second, independently-numbered `032_add_resume_profile.sql` on a
parallel branch — resolved by renumbering the resume_profile migration to 036 on merge).

**✅ 036 and 037 have now been run against production** — 2026-08-06's export reconciliation for
the 038 bookmark had found them missing live (`resume_profile` absent, `coach_chats.chat_type`
still lacking `resume_review`, and `beta_content_items`/`beta_checklist_completions`/`beta_scores`
all absent), but Anthony confirmed on 2026-08-07 that both have since been applied. Résumé Review
(§18.E1) and the Beta Tester Homebase should now be functional in production. The 038 bookmark's
table section has been extended to include both migrations' schema (reconstructed from the
migration files, not re-verified against a fresh export — see the bookmark's own header). Next
bookmark, if a fresh live export is pasted, should re-verify 036/037 the same way 001-035 were
originally verified.

