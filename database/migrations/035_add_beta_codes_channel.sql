-- ─────────────────────────────────────────────────────────────────────────────
-- 035_add_beta_codes_channel.sql
--
-- Lets ONE link/QR code auto-assign any available code from a named pool,
-- instead of every physical flyer/website visitor needing a unique code baked
-- into the URL. Adds a nullable `channel` tag to beta_codes (e.g. 'flyer',
-- 'website') grouping the 20-per-channel batches already inserted.
--
-- api/seed.js's seedBeta tries an EXACT code match first (unchanged — a
-- one-off individually-distributed code, e.g. a VIP invite, still works
-- exactly as before), and falls back to treating the submitted value as a
-- channel name, auto-claiming any one available code tagged with it. Both
-- paths go through `?beta=<value>` — the app doesn't need to know or care
-- which case it is; only api/seed.js's server-side logic branches.
--
-- No index needed at this table's scale (~40-80 rows total, ever).
-- ─────────────────────────────────────────────────────────────────────────────

alter table beta_codes
  add column if not exists channel text;

-- ── Verification (run after applying) ────────────────────────────────────────
--   select channel, count(*) from beta_codes group by channel;
--     -> confirm the counts match what you expect per channel after tagging
--        your existing rows (see the follow-up UPDATE statements you were
--        given separately to set channel = 'flyer' / 'website')
