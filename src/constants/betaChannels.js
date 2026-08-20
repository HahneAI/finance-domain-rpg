// ─────────────────────────────────────────────────────────────
// Beta program invite channels (database/migrations/035_add_beta_codes_channel.sql)
//
// Two pools of 20 seats each in Supabase's `beta_codes` table, distinguished
// by the `channel` column: one fed by the marketing website's signup button,
// one fed by physical flyer QR codes. Each pool's individual code rows are
// generated from a base word + random digits (e.g. "glass042", "clarity802")
// — that word is a human-naming convention only, applied when a batch is
// inserted into Supabase; application code never parses or validates it.
// The only thing api/seed.js's seedBeta() actually matches on is the
// `channel` column (see claimFromChannel there) — never the code's prefix.
//
// A visitor reaches signup via a link shaped like
// "https://<app>/?beta=<value>" (captured by App.jsx, see its
// PENDING_BETA_CODE_STORAGE_KEY comment for the full capture-then-redeem
// flow). api/seed.js tries `<value>` as an exact one-off code first, then
// falls back to treating it as a CHANNEL name and auto-claiming any one
// still-available code from that channel's pool. So both the website button
// and the flyer QR code should link with `?beta=website` / `?beta=flyer`
// (the channel name below) — never a literal glass/clarity code — unless an
// individually-distributed one-off (e.g. a VIP invite) is being handed out.
// ─────────────────────────────────────────────────────────────
export const BETA_CHANNELS = {
  WEBSITE: "website",
  FLYER: "flyer",
};

// Documentation/tooling only — the server matches on the `channel` column,
// never on this prefix. Keep in sync with whatever base word a new batch of
// beta_codes rows is generated from for a given channel (see the
// `beta_codes` INSERT this pool was seeded from, channel: 'website' →
// "glass" prefix, channel: 'flyer' → "clarity" prefix).
export const BETA_CHANNEL_CODE_PREFIX = {
  [BETA_CHANNELS.WEBSITE]: "glass",
  [BETA_CHANNELS.FLYER]: "clarity",
};

// Seats per channel at last seed (20 "glass*"/20 "clarity*" rows inserted
// 2026-07-27, plus two now-inactive legacy one-off rows that don't count
// against either pool). This is NOT enforced anywhere in code — the real
// cap is simply how many is_active=true rows exist per channel in Supabase;
// once a channel's pool is exhausted, claimFromChannel() naturally returns
// null and seedBeta() 403s with "Invalid or inactive beta code," same as an
// invalid code. This constant exists purely so app/doc code that wants to
// reference "the current per-channel seat count" has one place to update if
// a future batch changes the split — it is never read by any capacity check.
export const BETA_CHANNEL_SEED_SEATS = {
  [BETA_CHANNELS.WEBSITE]: 20,
  [BETA_CHANNELS.FLYER]: 20,
};
