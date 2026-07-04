# Security Breach Audit — Authority Finance

**Date:** 2026-07-04
**Scope:** Supabase data layer, API routes (`api/`), client auth/gating (`src/`), migrations.
**Trigger:** Known gap — `user_data` has no RLS policies. Audit expanded to the full data-access surface.

---

## TL;DR

The known gap is the whole ballgame, and it is more severe than "policies not active yet."
`user_data` — the table holding every user's finances, PII, Stripe ids, and trial/subscription
state — has **Row Level Security disabled entirely**. The Supabase **anon key is public** (it ships
in the client bundle by design), so anyone who opens the site can point `supabase-js` at the project
and read, modify, or delete **every user's row**. That single hole also defeats the "admin-only" RLS
on the other tables (via self-granted `is_admin`) and the "app-layer" protection on the billing
columns.

The API routes (`api/stripe-*.js`, `api/delete-account.js`) are **well built** — they verify the
caller's JWT before touching the service-role key, and the webhook verifies Stripe signatures. No
secrets are committed. No XSS sinks. The rot is concentrated at the database trust boundary.

Remediation migration: `database/migrations/019_enable_user_data_rls.sql` (with required companion
code changes noted in its header).

---

## Findings (ranked)

### 1. CRITICAL — `user_data` has RLS disabled; anon key is public → full breach of all user data

**Where:** `database/migrations/001_initial_schema.sql` (RLS never enabled); no later migration
turns it on. Confirmed: only `investor_codes`, `investor_users`, `demo_accounts`,
`deleted_accounts`, `stripe_webhook_events` call `ENABLE ROW LEVEL SECURITY` — `user_data` never does.

**Why it breaks:** The client is created with `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.js:42`),
which is embedded in the shipped JS — it is public by design and safe *only when RLS enforces
per-row access*. With RLS off, Supabase's default table grants to the `anon` / `authenticated`
Postgres roles are unrestricted. Any visitor can run, from a browser console or `curl`:

- `select * from user_data` → dump **every** user's `config`, `expenses`, `goals`, `logs`,
  `week_confirmations`, `display_name`, `avatar_url`, `stripe_customer_id`, `subscription_status`,
  `trial_ends_at`, etc. Full financial profile + billing identifiers for the entire user base.
- `update user_data set ... where user_id = <anyone>` → tamper with or corrupt any account.
- `delete from user_data` → destroy all accounts.

No authentication required. This is a complete confidentiality + integrity + availability failure
for the crown-jewel table.

**Fix:** Migration 019 — enable RLS + own-row policies. This alone stops cross-user read/write/delete.

---

### 2. HIGH — Privilege escalation: any user can self-grant `is_admin`, unlocking the other tables

**Where:** `database/migrations/013_investor_admin_policies.sql`,
`015_add_demo_accounts.sql` — every "admin" policy gates on
`EXISTS (SELECT 1 FROM user_data WHERE user_id = auth.uid() AND is_admin = true)`.

**Why it breaks:** Because `user_data` is writable by anyone (Finding #1), an attacker sets
`is_admin = true` on their own (or any) row, and now satisfies all of these policies. They can then:

- `investor_users` — read **all** investor registrations (names, companies, cities, code used) — PII.
- `investor_codes` — read/insert/toggle access codes.
- `demo_accounts` — overwrite the demo data every investor sees.

**Subtle point that outlives Finding #1:** enabling RLS with a plain own-row
`FOR ALL USING (auth.uid() = user_id)` policy does **not** fix this — an own-row policy still lets a
user write *any column of their own row*, including `is_admin`. Column-level protection is required.
Migration 019 §(B) revokes client write on `is_admin` (and `is_investor`, `tax_projections_enabled`)
so the flag can only be set server-side / via SQL.

---

### 3. HIGH — Billing/trial columns are forgeable → paywall bypass

**Where:** `database/migrations/017_add_subscription_fields.sql` header and `src/lib/db.js`
comments claim the Stripe/trial columns are "protected at the app layer" because
`saveUserData()` doesn't write them.

**Why it breaks:** App-layer omission is not a security control. The attacker doesn't call
`saveUserData()` — they issue their own `supabase.from("user_data").update({...})`. With RLS off (or
with own-row RLS but no column protection) they can set `subscription_status = 'active'`,
`card_on_file = true`, `trial_ends_at`/`access_ends_at` far in the future, `plan = 'annual'` — free
premium forever, and self-extending trials. The paywall isn't wired into `App.jsx` yet, so impact is
latent today, but the columns are already forgeable.

**Fix:** Migration 019 §(B) locks all `stripe_*` / `subscription_status` / `trial_*` /
`access_ends_at` / `card_on_file` / `*dunning*` / `current_period_end` / `plan` columns to
service-role only. **Companion change required:** `syncUserProfile()` (`src/lib/db.js:580`) currently
seeds `trial_*` + `subscription_status` with the anon key on first login — that seeding must move to a
service-role route (or a `SECURITY DEFINER` function) before the lock is applied, or first-login trial
seeding will fail. Documented in the migration header.

---

### 4. MEDIUM — Investor access codes are readable and weak

**Where:** `database/migrations/010_add_investor_codes.sql` — `SELECT` policy grants `anon,
authenticated` read of every row where `is_active = true`, with no column restriction.
`validateInvestorCode()` (`src/lib/supabase.js:76`) does client-side validation.

**Why it breaks:** Because the SELECT policy exposes whole rows, an unauthenticated visitor can run
`select code from investor_codes where is_active = true` and dump every valid code — no guessing
needed. The seed code is also `success` (migration 010), trivially guessable on its own. The investor
gate only unlocks demo views, so severity is bounded, but it is effectively no gate.

**Fix options:** move code validation behind a server route (RPC / `SECURITY DEFINER` function that
takes a candidate code and returns only a boolean, exposing no code values), and replace weak seed
codes with high-entropy ones. Retire `success`.

---

### 5. LOW — Session token in a JS-readable cookie (XSS would be full account takeover)

**Where:** `src/lib/supabase.js:12` `sharedStorage` dual-writes the auth session (access + refresh
token) to `localStorage` and a `SameSite=Lax` cookie for the iOS-PWA storage-partition workaround.

**Why it's noted, not urgent:** the cookie holds the same value already in `localStorage`, so it is
no *new* exposure, and there are currently **no XSS sinks** in the codebase (no
`dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` — verified). But it means any future
XSS escalates directly to refresh-token theft → full takeover. This is inherent to Supabase's browser
model; the mitigation is a strict Content-Security-Policy and continued discipline about injection
sinks, not a code change here.

---

## What's already good (no action)

- **API routes verify the caller before privileged work.** `stripe-create-checkout`, `stripe-portal`,
  `delete-account` all resolve the JWT via a user-scoped client (`auth.getUser()`) and only then use
  the service-role key, scoped to that `user_id`. `delete-account` also requires the literal
  `"DELETE"` confirmation body.
- **Stripe webhook verifies signatures** (`_stripeClient.js` `constructWebhookEvent`) and claims each
  event id in `stripe_webhook_events` for idempotency before processing.
- **Later tables use default-deny correctly.** `deleted_accounts` and `stripe_webhook_events` enable
  RLS with **no** policies — only the service-role key reaches them. This is exactly the posture
  `user_data` should have had.
- **No secrets committed.** `.env` / `.env.local` are gitignored; no `sk_live`/`sk_test`/service-role
  keys anywhere in `src/`, `public/`, or `index.html`.
- **No client-side XSS sinks.**

---

## Recommended order of remediation

1. **Now:** apply the companion code changes in the header of `019_enable_user_data_rls.sql`
   (move `syncUserProfile` trial-seed and `createInvestorAccount` `is_investor` write to service-role),
   then run migration 019. This closes Findings #1, #2, #3.
2. **Next:** move `validateInvestorCode` behind a boolean-returning RPC and rotate/retire weak codes
   (Finding #4).
3. **Hardening:** add a Content-Security-Policy header on the Vercel deployment (Finding #5).
4. **Regression guard:** add a test that asserts, for a signed-in user B, a read/write of user A's
   row returns zero rows / fails — so RLS can never silently regress.
