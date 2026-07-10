# TODO — Authority Finance

*Completed work log → `docs/past-TODO-tasks.md`*

---

## 17. Monetization — Stripe Subscriptions + 2-Week Free Trial

*New workstream. Authority Finance is currently free with no billing layer (`CLAUDE.md`: "No
backend server… no Stripe — yet"). This section adds a paid subscription gated behind a 14-day
free trial. The app stays a Vite/React frontend; all Stripe secret-key work lives in Vercel
serverless functions under `api/` (same pattern as `api/delete-account.js`: verify the caller
with their Supabase Bearer token, then act with the service-role client). Subscription state is the
source of truth in **Stripe**, mirrored into Supabase `user_data` via webhook so the frontend can
gate without hitting Stripe on every load.*

**Resolved decisions (2026-06-16, pricing tiers reaffirmed 2026-07-01, annual price locked in 2026-07-02):**
- **Price:** **$14.99/mo.** Annual = **flat $120/yr — exactly $10.00/mo**, chosen over the earlier
  $134.91 (9-months-for-12) figure specifically for the clean, quotable "$10 a month when you pay
  annually" line. This also happens to equate to **~4 months free** (120 / 14.99 ≈ 8.0 months
  paid), so the "months free" framing still works and is slightly more generous than before. Two
  Stripe prices: `monthly` and `annual`.
- **Monthly + annual only — no weekly, no quarterly.** Considered and rejected 2026-07-01:
  **weekly billing reads as a dark pattern** (the exact "$X.99/week to obscure the real monthly
  cost" trick used by low-trust mobile subscriptions) and directly contradicts an app whose whole
  value prop is financial clarity. **Quarterly** adds a third price point/decision without adding
  real conversion value — the annual discount already exists to soften a bigger commitment; a
  third SKU just adds paradox-of-choice clutter. Two tiers, presented as a Monthly ↔ Annual
  toggle (not stacked cards), with the monthly-equivalent price always shown next to the annual
  price (e.g. "$120/yr — $10.00/mo billed annually") so the real per-month cost is never hidden
  behind a headline number.
- **No card at signup.** Card-less, **app-managed** trial; a Stripe Checkout is created only when the
  user upgrades. In-app + email nudges to add a card start **after day 7** of the trial ("add your
  card early to avoid interruption").
- **Gate strictness:** after expiry the app drops to a **read-only** experience on the **Home** and
  **Budget** panels only — see §E for the exact locked view (expense category dropdowns disabled;
  Lifestyle / Needs show title + per-check-period total only). Editing/saving is blocked everywhere.
- **Free access window:** **3 weeks total**, structured as a public 14-day trial + a **hidden 7-day
  grace**. ⚠️ **The extra week is never disclosed** — all user-facing copy and emails reference the
  **14-day** trial only. Internally, full access continues through day 21; the read-only expiry
  screen does not kick in until day 21.
- **Post-expiry deletion buffer:** once expired (day 21+) with no card on file, send an account-
  deletion warning email **every other day** until a card is added (or the account is deleted).

**Lifecycle phases (single source of truth for the engine):**

| Phase | Day (from `trial_started_at`) | App access | User sees | Notifications |
|-------|------|-----------|-----------|---------------|
| **Trial** | 0–13 | Full | "X days left in your free trial" countdown | Day 7+: in-app + email "add card to avoid interruption" |
| **Grace** *(hidden)* | 14–20 | **Full** (undisclosed) | "Trial ended — add a card to keep using the app" | Escalating add-card warnings; **never** reveals the extra week |
| **Expired** | 21+ | **Read-only** (Home + Budget, locked dropdowns) | Expiry / upgrade screen | Account-deletion warning **every other day** until card added |
| **Deletion** | 21 + 7 | — | — | Account archived + deleted if still no card after the 7-day buffer — see §I for the revival path this enables |

> Two distinct timestamps drive this: `trial_ends_at` (day 14, **user-facing** countdown + "trial
> ended" messaging) and `access_ends_at` (day 21, **internal** hard cutoff that flips the read-only
> gate). Entitlement is keyed off `access_ends_at`; the countdown UI is keyed off `trial_ends_at`.

---

### A. Data model & migration

- [x] **Migration `017_add_subscription_fields.sql`** *(renumbered — `016` was already taken by
  `016_add_tax_projections_flag.sql`)* — add to `user_data`:
  - [x] `stripe_customer_id TEXT` (nullable; set on first Checkout)
  - [x] `stripe_subscription_id TEXT` (nullable)
  - [x] `subscription_status TEXT` — mirror of Stripe status: `trialing | active | past_due |
    canceled | incomplete | unpaid`; default `null` until trial is seeded
  - [x] `trial_started_at TIMESTAMPTZ` — anchor for all phase math
  - [x] `trial_ends_at TIMESTAMPTZ` — **day 14**, user-facing trial end (countdown + "trial ended")
  - [x] `access_ends_at TIMESTAMPTZ` — **day 21**, internal hard cutoff that flips the read-only gate
    (the hidden 7-day grace; never surfaced)
  - [x] `card_on_file BOOLEAN DEFAULT false` — set true when a payment method is attached (via
    webhook / Checkout); gates the dunning + deletion logic
  - [x] `last_dunning_email_at TIMESTAMPTZ`, `dunning_email_count INT DEFAULT 0` — throttle the
    every-other-day deletion emails and the trial add-card nudges
  - [x] `current_period_end TIMESTAMPTZ` (from Stripe; when the paid period lapses)
  - [x] `plan TEXT` (nullable; `monthly` / `annual`)
  - **Run in Supabase (confirmed 2026-07-07)** — along with every migration through 020.
- [x] **Seed trial on account creation** — implemented in `src/lib/db.js` `syncUserProfile()`
  (called on every `SIGNED_IN`, same place the OAuth row is seeded, §5). Keyed off
  `trial_started_at IS NULL` rather than row-existence, since email sign-up (`LoginScreen.jsx`)
  already inserts a bare row before `SIGNED_IN` fires — this still fires exactly once and never
  re-stamps a returning user.
- [x] **`db.js` mapping** — `loadUserData()` fetches the new columns in their own isolated query
  (same pattern as `week_confirmations`, so a not-yet-migrated DB falls back to
  `DEFAULT_SUBSCRIPTION` instead of breaking the whole load) and maps them into a `subscription`
  object; kept OUT of the `config` JSON blob.
- [x] **RLS** — landed via migration `019_enable_user_data_rls.sql` (security audit
  `docs/security-audit-2026-07-04.md` finding #1) plus its two required companion moves,
  completed 2026-07-06:
  - [x] **`api/seed-trial.js`** — new service-role route. `syncUserProfile()` in `src/lib/db.js`
    now POSTs its Bearer token here instead of upserting `trial_started_at`/`trial_ends_at`/
    `access_ends_at`/`subscription_status` directly; the route re-checks `trial_started_at IS
    NULL` server-side before seeding. `display_name`/`avatar_url` stay a direct client upsert
    (still client-writable columns).
  - [x] **`api/seed-investor.js`** — new service-role route. `createInvestorAccount()` now upserts
    `user_data` without `is_investor`, then POSTs the investor code here to grant `is_investor =
    true`; the route re-validates the code against `investor_codes.is_active` itself rather than
    trusting the client. Known gap: if email confirmation is required at sign-up there's no
    session yet to call this route, so `is_investor` stays unset until a later authenticated
    sign-in seeds it — a limitation the RLS migration introduces for any unauthenticated write to
    this table, not specific to this one column.
  - Both routes + `db.js` covered by updated `db.test.js` / `dbInvestor.test.js` (fetch mocked,
    same pattern as `UpgradeCard`'s checkout call).

### B. Stripe account & product setup *(config steps, no app code)*

- [x] **Create Stripe product + two prices** in the dashboard: Premium **monthly = $14.99** and
  Premium **annual = $120** (a flat $10.00/mo, ~4 months free vs. 12× $14.99). Price IDs captured.
  No Stripe trial on the price (`trial_period_days` unused) — the trial is app-managed.
- [ ] **Configure the Customer Portal** (Billing → Customer portal) so users can cancel / update
  card / switch plan without custom UI. *(Not yet confirmed done.)*
- [x] **Register the webhook endpoint** (`/api/stripe-webhook`) and capture the signing secret.
- [ ] **Set Vercel env vars** (see env block at the bottom) — `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `APP_URL` still need to
  be added in the Vercel dashboard.

### C. Serverless API routes (`api/`, Vercel functions)

*Follow `api/delete-account.js`: reject non-POST, require `Authorization: Bearer <supabase token>`,
verify with an anon client `getUser()`, then use the service-role client for privileged writes.*

- [x] **`api/stripe-create-checkout.js`** — verify the user → find-or-create the Stripe customer
  (store `stripe_customer_id` back on `user_data`) → create a Checkout Session for the chosen price
  → return the session URL. Pass `client_reference_id = user.id` and set success/cancel URLs to
  `APP_URL` (new env var, §J).
  - [x] **Fixed (2026-07-06): stale-domain crash on checkout return.** Reported symptom — an
    expired-trial user on the `Version-control` preview deployment hit "back" from Stripe Checkout
    and landed on a flash of Home, then a stuck loading screen, at
    `authority-finance.vercel.app//?checkout=cancel`. Root cause: `success_url`/`cancel_url` (and
    `return_url` in `stripe-portal.js`) were built from a single static `APP_URL` env var, so
    Stripe always redirected back to whichever one deployment that var named — here,
    `authority-finance.vercel.app`, which (confirmed via `git show origin/master:...`) is running a
    build from before `getEntitlement`/`checkoutReturn` existed at all, so it has no idea what to do
    with a `?checkout=` param and just hangs. The double slash in the reported URL was a second,
    independent bug — `APP_URL` had a trailing slash. Fix: `api/_stripeClient.js` now exports
    `resolveAppOrigin(req)`, which derives the redirect origin from the actual request's `Origin` /
    `Referer` header (validated against an allowlist — `*.vercel.app`, `localhost`, or `APP_URL`'s
    own hostname — so this can't become an open redirect), falling back to `APP_URL` (trailing
    slash stripped) only when neither header is present. Both `stripe-create-checkout.js` and
    `stripe-portal.js` now use it instead of the static `appUrl`. `APP_URL` itself is unchanged and
    still required as the fallback/config-check value — no Vercel env var changes needed.
- [x] **`api/stripe-webhook.js`** — verify the Stripe signature with the webhook secret (use the
  **raw** request body — `bodyParser: false`). Handles `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. On each,
  upserts `subscription_status`, `stripe_subscription_id`, `current_period_end`, `plan` into
  `user_data` via service-role, keyed by `stripe_customer_id` (or `client_reference_id` for the
  first `checkout.session.completed`, since that's the only event where the customer↔user link is
  being established). Idempotent on event id via new migration `018_add_stripe_webhook_events.sql`
  — atomically claims the event id (unique-constraint insert) before doing any work, so Stripe
  retries/redeliveries can't double-process.
- [x] **`api/stripe-portal.js`** — verify the user → create a Billing Portal session for their
  `stripe_customer_id` → return the URL (for the "Manage subscription" button).
- [x] **Validated end-to-end in test mode (2026-07-03)** — both plans tested via the temporary
  Subscription buttons in `ProfilePanel` (`AccountDetail`): Checkout Session created and opened
  correctly for monthly and annual, test card `4242 4242 4242 4242` completed successfully,
  `checkout.session.completed` webhook fired and populated `stripe_customer_id`,
  `stripe_subscription_id`, and `subscription_status` on the `user_data` row (confirmed via the
  admin Config JSON / DB Row tools). §C is fully working; not yet tested against live mode.

### D. Trial logic (14-day public + 7-day hidden grace)

- [x] **Single entitlement helper** — `src/lib/subscription.js → getEntitlement(subscription, now)`
  returning `{ state, trialDaysLeft, isEntitled, accessDaysLeft }` where
  `state ∈ "trial" | "grace" | "active" | "expired" | "none"`:
  - `active` — `subscription_status === "active"` (or `trialing` w/ a real Stripe sub) → entitled.
    **Extended beyond the original spec** to also cover the §H dunning/cancellation cases as
    `active`, since leaving them out would have been a live bug against code already shipped in
    §C: `past_due` (webhook sets this on `invoice.payment_failed`) and `canceled` both stay
    entitled *while `now < current_period_end`* — matches §H "keep entitlement until
    current_period_end" / "cancel at period end" verbatim. Once that period passes, they fall
    through to the trial/grace/expired math like anyone else (which resolves to `expired` for any
    real past subscriber, since their trial window is long over).
  - `trial` — `now < trial_ends_at` → entitled; `trialDaysLeft = ceil((trial_ends_at − now)/day)`
  - `grace` — `trial_ends_at ≤ now < access_ends_at` → **still entitled**, but UI/email say "trial
    ended." `trialDaysLeft = 0`. **`accessDaysLeft` is computed but reserved for admin-only
    surfaces (Live State Inspector / Config Raw View) — never rendered to a non-admin user.**
  - `expired` — `now ≥ access_ends_at` → **not entitled** (read-only gate on)
  - `none` — no trial window seeded at all (investor/demo accounts, or a pre-migration-017 row)
  - `isEntitled = active || trial || grace`
  - `now` is always a real wall-clock `Date` (defaults to `new Date()`) — **never** the app's admin
    Lock Date / `effectiveToday` simulation, so Lock Date can't be used to extend a trial or grace.
  - Unit-tested (`src/test/lib/subscription.test.js`, 15 tests): every state, the exact day-14 and
    day-21 boundaries (inclusive/exclusive verified precisely), `past_due`/`canceled` before and
    after `current_period_end`, and the missing-timestamps/`null` defensive cases. This also
    satisfies the equivalent test bullet listed under §H.
- [x] **Lock off the internal cutoff, not the public one** — the read-only gate keys off
  `access_ends_at` (day 21). The countdown + "trial ended" banner key off `trial_ends_at` (day 14).
  Both transitions are time-derived (don't wait on a webhook to flip) — satisfied by
  `getEntitlement` computing both directly from stored timestamps vs. wall-clock `now`.
- [x] **No double trials** — already satisfied by §A's `syncUserProfile()` (keyed off
  `trial_started_at IS NULL`, not row-existence) — a returning user's trial timestamps are never
  re-seeded, so an expired/grace user who never paid always resolves to `expired`/`grace` (upgrade
  path), never gets a fresh window.
- [x] **Disclosure guard** — no UI string may reference the 21-day / grace / "extra week" concept;
  public surfaces only ever say 14 days. `src/test/components/UpgradeModal.test.jsx` and
  `UpgradePanel.test.jsx` render the actual paywall UI (both presentations of the shared
  `UpgradeCard`) and assert on rendered text (not source text — scanning source would false-positive
  on legitimate internal comments, e.g. this very codebase's `subscription.js` correctly says
  "grace" throughout as the technical term) against forbidden patterns (`21-day`, `grace`, `extra
  week`), plus a sanity check guarding against a vacuous pass on an empty/broken render. Email
  templates not built yet (§G) — covered when they exist.

### E. Frontend gating / paywall

- [x] **Entitlement gate** — `App.jsx` computes `getEntitlement(subscription, new Date())` (real
  wall-clock time, never `effectiveToday`/`tempLockDate`) and derives `isExpiredReadOnly = !(isAdmin
  || config.isInvestor) && entitlement.state === "expired"`. Investors and admins bypass the paywall
  entirely — investors aren't paying customers and admins need unrestricted access to support users.
- [x] **Expired read-only experience** — settled on a split treatment after two rounds of live
  testing (2026-07-05): **Home and Budget stay read-only-viewable** (values render, editing
  disabled); **Income and Log are fully replaced** by a dedicated Upgrade panel.
  - **Round 1** (shipped first): Income/Log fully replaced by a blocking `<UpgradeModal />`
    (`createPortal`, fixed full-viewport backdrop) with no dismiss — hard-blocked, no way to "click
    off" and keep browsing.
  - **Round 2** (correction): made Income/Log read-only-viewable too, matching Home/Budget, so
    nothing was walled off.
  - **Round 3 — final, per explicit direction**: back to fully replacing Income/Log, but *not* with
    a viewport-covering modal — with a real panel. `src/components/UpgradePanel.jsx` renders as
    ordinary content inside `.main-content` (no `createPortal`, no fixed overlay), so the header,
    hamburger menu, and bottom nav all stay exactly as they are; only the panel body changes. The
    user is never trapped (nav still works to reach Home/Budget/Account), but Income/Log
    specifically show only the upgrade pitch, not real data.
  - **Shared card, two presentations**: the checkout pitch + Monthly/Annual buttons live once in
    `src/components/UpgradeCard.jsx` (no opinion on presentation). `UpgradeModal.jsx` wraps it in a
    `createPortal` backdrop with a dismiss ✕ — used as an overlay triggered from Home/Budget's
    read-only notice button (real content behind it). `UpgradePanel.jsx` wraps it in a plain
    centered container with no dismiss — used to fully replace Income/Log (nothing behind it to
    dismiss back to).
  - **Resolved the "Confirm Income/Log/Goals" open question**: there is no separate "Goals" nav tab
    — goals live inside Home (`goals`/`setGoals` are HomePanel props, not BudgetPanel's, confirmed
    by reading `App.jsx`'s panel routing block), so Home's `readOnly` prop already covers goal
    editing; nothing separate needed for "Goals."
  - [x] **Read-only Home + Budget** — implemented as a `readOnly` prop on both panels (the "one
    switch" the TODO asked for), with a shadow-safety guarantee underneath the UI polish: each panel
    renames its mutation setter prop(s) to `...Prop` and declares a local
    `const setX = readOnly ? noop : setXProp` — every existing mutation call in that file, however
    deeply nested, is automatically a no-op in read-only mode without having to find and gate each
    call site individually. Covers `setGoals`/`setConfig` (Home), `setExpenses` (Budget). On top of
    that data guarantee, the visible entry points are hidden: "+ ADD GOAL", the per-goal action row
    (REORDER/EDIT/DONE/DEL — both mobile and desktop blocks), "Reset Timeline" (Home); "+ ADD
    EXPENSE LINE", "+ ADD LOAN", the loans-tab EDIT/DEL row (Budget). Values render, nothing
    persists. (IncomePanel/LogPanel briefly had the same `readOnly` plumbing during round 2 — reverted
    since they're now never rendered at all when expired, and dead plumbing for an unreachable prop
    value is worse than no plumbing.)
  - [x] **Locked expense categories** — `isCatExpanded = !readOnly && expandedCats.has(cat)` forces
    every category collapsed regardless of the user's remembered expand state; the header's
    `onClick`/`cursor` are disabled and the chevron `<svg>` itself is hidden when `readOnly`. Since
    loan rows render nested inside the "Needs" category's fold-out (`loanItems = cat === "Needs" ?
    loans : []`), forcing categories collapsed also hides loan row-level edit/delete in the
    Overview tab as a side effect — the standalone Loans tab needed its own separate gate (above).
  - [x] Implemented as the explicit `readOnly` prop the TODO asked for, not inline conditionals.
  - **Known gap, not covered**: "run wizard" — `SetupWizard` re-entry via `LifeEventMenu`/life-event
    flows isn't blocked yet. Exhaustively tracing every wizard entry point across the app was out of
    scope for this pass; flagging so it isn't mistaken for handled.
- [x] **Upgrade modal / screen** — Liquid-Glass styled (`purpose="modal"`, already whitelisted — no
  doc update needed for a new *usage* of an existing purpose), shows monthly ($14.99) vs. annual
  ($120, "$10.00/mo billed annually"), opens Stripe Checkout via `api/stripe-create-checkout` using
  the same `getSession()`/Bearer-token pattern as `ProfilePanel`. See the split-treatment note above
  for `UpgradeModal` vs. `UpgradePanel` vs. shared `UpgradeCard`. A minimal (non-phase-aware)
  read-only notice with an "Upgrade" button was added directly in `App.jsx` for Home/Budget —
  **not to spec**, since §F's full trial/dunning banner is the "real" version of this; added now
  only so silently-disabled buttons don't read as broken before §F ships. §F should replace/absorb
  it rather than stack alongside it.
- [x] **Post-checkout return** — `App.jsx` reads `?checkout=success|cancel` once on mount, scrubs
  the query string immediately (so a manual reload doesn't re-trigger it), shows a confirming
  banner, and polls `loadUserData()` every 2s (max 5 attempts) while `checkoutReturn === "success"`
  until `subscription.status === "active"`, updating `subscription` state each time — which
  re-evaluates `getEntitlement` and lifts the gate as soon as the webhook lands.
- **Not yet verified live**: this was built and statically verified (lint clean relative to
  baseline, full production build succeeds, full test suite green, 2 new test files covering
  `getEntitlement` boundaries and the disclosure guard) but **not exercised in a real browser
  against a live Supabase account** — this sandbox has no `.env`/Supabase credentials configured,
  so an actual login + expired-account click-through hasn't happened yet. Needs a real pass once
  deployed to a preview environment, same as §C's Stripe testing.

### F. Trial + subscription UI

- [x] **Trial/dunning banner** — `src/components/TrialBanner.jsx`, wired into `App.jsx` in place of
  the §E minimal read-only notice it was always meant to be replaced by. Phase-aware copy: **trial**
  → "N days left in your free trial" (amber/warning tone once `trialDaysLeft ≤ 3`, otherwise a
  neutral tone); **grace** → "Your trial ended — add a card to keep using the app"; **expired** →
  "Trial ended — add a card to restore full access" (red tone). Renders nothing for `active`/`none`.
  Persistent across every view except Income/Log while expired (those are already fully replaced by
  `UpgradePanel` — showing both would be redundant). Dismiss state is a plain `useState` (not
  persisted), so it re-shows on reload, same pattern as the Job Loss banner. Disclosure-guard tested
  (`TrialBanner.test.jsx`) — grace/expired copy asserted to never mention "grace," "21-day," or
  "extra week."
- [x] **ProfilePanel → Account: Subscription card** — replaces the §8 placeholder in
  `AccountDetail` (`ProfilePanel.jsx`). Status label prioritizes the **raw Stripe status**
  (`past_due`/`canceled`) over the collapsed entitlement state, but only while `getEntitlement`
  still resolves `active` (i.e. within `current_period_end`) — Trial/Active/Past Due/Canceled as
  specced; once a canceled/past-due period actually lapses it falls into the same "Trial Ended"
  bucket as any other non-entitled account (no invented fifth label — mirrors how `subscription.js`
  itself already collapses a long-lapsed real subscriber into `expired`). Investor/demo/pre-migration
  accounts (`entitlement.state === "none"`) show "N/A — no subscription required" with no
  checkout/manage buttons at all, instead of a misleading "Trial Ended." Shows plan + price when
  known. **Manage Subscription** (→ `api/stripe-portal`, same `getSession()`/Bearer pattern as
  checkout) appears once `stripe_customer_id` exists; the Monthly/Annual checkout buttons appear
  otherwise — never both. `subscription` threaded App.jsx → ProfilePanel → AccountDetail as a new
  prop. 10 tests (`AccountDetailSubscription.test.jsx`) cover every status branch and the portal
  call/error path.
- [x] **Admin visibility** — Live State Inspector gains `Sub Phase` (resolved phase + raw Stripe
  status as its sub-label), `Trial Ends`, `Access Ends` (hidden cutoff — this Inspector is
  isAdmin-gated already, so no new disclosure risk), `Period End`, `Card / Dunning`. Turned out the
  **DB Row Viewer already covers "Config Raw View"** for this — its `select("*")` was already
  pulling every subscription column before this pass; nothing to add there. CLAUDE.md's admin
  toolkit table and "Diagnostic request templates" updated to match (11 → 16 Live values, new
  template #6 pointing at DB Row + Live State together for billing/paywall issues).

---

**Handoff checkpoint (2026-07-06) — §A–F are done; picking up here in a fresh session:**
All work so far is on branch `claude/stripe-paywall-integration-d2b3sw` (repo
`HahneAI/finance-domain-rpg`), validated in Stripe test mode end-to-end including a real
manual click-through (expired user → Income/Log Upgrade panels → Checkout → back-button
return, all confirmed working). Load-bearing context for whatever's next:
- `getEntitlement()` (`src/lib/subscription.js`) is the one place phase math lives —
  trial/grace/active/expired/none. Never re-derive it inline; `now` must always be real
  wall-clock time, never the admin Lock Date simulation.
- The disclosure rule is absolute: no user-facing string (UI, email, API response) may ever
  say "grace," "21-day," "extra week," or otherwise hint the trial is longer than 14 days.
  Every surface built so far has a test enforcing this — copy that pattern for anything new
  (see `TrialBanner.test.jsx` / `UpgradeModal.test.jsx` for the shape).
- Migration `019_enable_user_data_rls.sql` (RLS) is written and both required companion
  service-role routes (`api/seed-trial.js`, `api/seed-investor.js`) already exist.
  **Resolved 2026-07-07 — confirmed run in Supabase**, along with every migration through
  020. RLS is live; the column-privilege lockdown is DB-enforced, not just app-layer.
- `api/_stripeClient.js` exports `resolveAppOrigin(req)` for any redirect URL (success/
  cancel/return) — derives the origin from the request instead of a static `APP_URL`, since
  there are multiple live deployments (preview + production) and a hardcoded URL bounces
  users to the wrong one. Use it, don't reintroduce a static URL.
- This sandbox has no live Supabase/Stripe credentials — verification here means
  `npm run test:run` (846 passing as of this checkpoint) + `npx eslint` (diff against
  `git stash` to catch only new issues — there are pre-existing baseline warnings) +
  `npm run build`. Real browser/backend verification has only ever happened via the user's
  own manual pass on the deployed preview — ask for that before marking anything "done."
- §G–K below are still italicized-intro-only or partially stale relative to what §A–F
  actually shipped; skim them for the plan but verify against the current code before
  assuming a referenced file/component doesn't exist yet.

---

### G. Notifications & lifecycle emails (Vercel Cron)

*New infra: the app has no transactional email today (only Supabase auth emails). The card-nudge,
grace, and every-other-day deletion warnings need an email provider + a scheduled job. All sends
are server-side via a daily cron route; nothing here runs on the client. Depends on §D/§F's phase
math and columns, both already shipped. Code shipped 2026-07-05 — remaining unchecked items below
are account/config steps plus the §I-blocked deletion hook.*

- [x] **Pick an email provider** — **Resend** (decided 2026-07-05). Free tier: 3,000/mo, 100/day,
  one verified domain — covers 300+ concurrent trial users at ~8–10 lifecycle emails per full
  trial→deletion cycle. SendGrid ruled out (Twilio killed the permanent free tier May 2025; 60-day
  trial then $19.95/mo minimum) and Postmark has no free production tier (~$15/mo). Sends go
  through Resend's REST API via plain `fetch` (`api/_email.js`) — no npm dependency added.
  - [x] **Create the Resend account + API key** — done 2026-07-05; key set in Vercel
    (accepted as either `EMAIL_API_KEY` or `RESEND_API_KEY`). Resend account owner email:
    anthonyhahne20@gmail.com — the only deliverable recipient until a domain is verified.
  - [ ] **Verified sender domain — deliberately deferred.** Built against Resend's shared dev
    sender (`onboarding@resend.dev`, the `EMAIL_FROM` default); it only delivers to the Resend
    account owner's own address, which is exactly right for testing. A custom domain (can't be
    `*.vercel.app` — no DNS control over it) must be verified in Resend and set as `EMAIL_FROM`
    **before real users hit day 7 of a trial**, or dunning mail lands in spam / doesn't deliver.
- [x] **`api/cron-subscription-lifecycle.js`** — scheduled daily via `vercel.json` `crons`
  (15:00 UTC ≈ morning US Central). Runs service-role over every `user_data` row with a seeded
  trial; per-row decisions live in the pure engine `api/_lifecycleEngine.js` (delegates phase math
  to `getEntitlement` — never re-derived), templates in `api/_lifecycleEmails.js`. Skips
  `is_admin`/`is_investor` rows entirely (they bypass the paywall, §E — must never be dunned).
  Throttle state is stamped only **after** a successful send, so failures retry next run; one bad
  row can't abort the run (per-row try/catch; summary JSON `{checked, sent, reset, deleteDue,
  errors}` returned + logged). User emails come from `auth.admin.getUserById` per actionable row.
  - [x] **Trial, day ≥ 7, no card** → "add your card to avoid interruption" nudge, once at day 7
    and once at day 12 (`TRIAL_NUDGE_DAYS`), keyed off `last_dunning_email_at` vs. the milestone
    timestamp — a cron outage catches up with at most one send, never two.
  - [x] **Grace (day 14–20), no card** → "trial ended — add a card to keep using the app."
    Every 2 days; **never** mentions the remaining access.
  - [x] **Expired (day 21+), no card** → account-deletion warning **every other day** (guard:
    `now − last_dunning_email_at ≥ 2 days`); increments `dunning_email_count`.
  - [x] **Past day 21 + 7, no card** → archive the account (see §I) then call the deletion path.
    **Implemented 2026-07-06** (§I item unblocked — the `deleted_accounts` table already existed
    in migration 017): the cron now acts on `deleteDue` rows via `archiveAndDeleteAccount()` —
    snapshot → cancel any lingering Stripe sub → tombstone upsert → hard delete. Takes
    precedence over the same-run deletion-warning email. See the §I archive bullet for details.
  - [x] **Card on file / active** → no lifecycle emails; resets `dunning_email_count` +
    `last_dunning_email_at` so a future lapse starts a fresh cycle.
- [x] **Idempotency / safety** — safe to run any number of times a day: every send keys off the
  stored throttle timestamps, never "did the day flip" (verified by the twice-daily-run tests).
  Route requires `Authorization: Bearer <CRON_SECRET>` — Vercel sends that header automatically on
  cron invocations when the `CRON_SECRET` env var is set; anonymous requests get 401.
- [x] **Copy review** — all templates reference the **14-day** trial only. Enforced by
  `src/test/api/lifecycleEmails.test.js`: forbidden patterns (`grace`, any `21`, `extra week`,
  `access ends`) asserted against every template's subject/html/text with a vacuous-pass guard —
  same approach as `TrialBanner.test.jsx`. Also deliberate: no "you won't be charged until your
  trial ends" phrasing anywhere, since the trial is app-managed (§B) and Checkout charges
  immediately on upgrade. Engine schedule/throttle covered by
  `src/test/api/lifecycleEngine.test.js` (26 tests total across both files).
- [x] **Verified live end-to-end (2026-07-05)** — cron registered on production
  (Vercel → Cron Jobs, `0 15 * * *`), manual Run returned 200 with a clean summary
  (`{"checked":2,"sent":0,...}` — both checked accounts correctly skipped: one active
  subscriber, one admin). A real send was then proven by temporarily backdating the
  Anthony Hahne test account (auth email = the Resend owner address) to trial day 8 and
  suspending its active status: cron produced `sent:1` and the "6 days left in your free
  trial" email delivered to the inbox with the brand template rendering correctly; account
  restored to its real active state afterward. Also verified along the way: the Resend
  dev-sender 403 path (send to a non-owner address) is caught per-row, counted in `errors`,
  and leaves the throttle unstamped for retry — exactly as designed.
- **Beta-tester exemption (2026-07-05):** the two family beta accounts (never trial-seeded —
  they haven't signed in since the paywall deployed) were flagged `is_investor = true` in
  Supabase so they bypass the paywall and lifecycle emails entirely during beta. Flip back to
  `false` when beta ends to put them on real trials (seeding fires on their next sign-in).
- [ ] **(Optional, later) Web Push** — the app is already a PWA w/ service worker; the same phase
  signals could fire push notifications. Defer behind email v1.

**Handoff checkpoint #2 (2026-07-05) — §G done and verified live; next is §H:**
Branch `claude/free-email-provider-6u3kbo` (merged to master via Version-control). Everything in
the first checkpoint below §F still applies (getEntitlement is the single source of phase math,
disclosure rule absolute, resolveAppOrigin for redirects, sandbox has no creds — 872-test baseline).
New since then:
- §G lifecycle emails are **live**: Resend key + `CRON_SECRET` set in Vercel, daily cron registered
  and verified in production, a real nudge email delivered end-to-end. Still on the resend.dev dev
  sender — domain verification for **authority-os.com** (ZenBusiness DNS) is mid-propagation and
  being finished in a separate session; once Resend shows Verified, set `EMAIL_FROM` in Vercel and
  redeploy. Until then the cron can only deliver to the Resend owner's address; other sends 403
  and retry harmlessly.
- The two family beta accounts are `is_investor = true` in Supabase (paywall + email exempt);
  flip back when beta ends.
- §H's one real code gap: `api/delete-account.js` does not yet cancel the Stripe subscription.
  Most other §H bullets are audit-and-test-only — webhook signatures and past_due/canceled
  entitlement already exist in code.
- §B leftover: Stripe Customer Portal dashboard config still unconfirmed.

### H. Edge cases, security & testing

*Mostly a hardening/audit pass over what §A–F already shipped, not new build-out — several
bullets below may already be satisfied by existing code and just need a test written or a
double-check, not fresh implementation. E.g. webhook signature verification and the past_due/
canceled entitlement handling already exist in `api/_stripeClient.js`/`subscription.js`; confirm
before treating any bullet here as starting from zero.*

***Code + audit completed 2026-07-06.** The audit confirmed exactly that split: five bullets were
already satisfied by §A–G code and needed only verification + notes; the one real code change was
the delete-account Stripe cancellation, and the new tests are the signed-fixture webhook suite,
the create-checkout token guards, and the delete-account cancellation suite. Two §A–H leftovers,
both deliberately parked for the final pre-launch pass: §B's Customer Portal dashboard config
(config-only, no code) and the live cancel-on-delete verification (last bullet below).*

- [x] **Webhook signature** — reject unsigned/invalid events; never trust client-reported status.
  **Audited 2026-07-06 — already existed** (`constructWebhookEvent` in `api/_stripeClient.js`
  verifies the raw body against both modes' secrets; `stripe-webhook.js` 400s on any failure, and
  `subscription_status` is only ever written server-side — webhook, seed-trial, lifecycle cron).
  Now also test-covered: `src/test/api/stripeWebhook.test.js` signs fixture events with Stripe's
  real `generateTestHeaderString` (real HMAC, not a mocked verifier) and asserts that a missing
  header, a wrong-secret signature, and a tampered body all reject with zero DB writes.
- [x] **Card declines / `past_due`** — keep entitlement until `current_period_end`, then lock;
  surface the Stripe-hosted update-card flow via the portal. **Audited 2026-07-06 — already
  existed**: §D's `getEntitlement` extension keeps `past_due` entitled while
  `now < current_period_end` (boundary-tested in `subscription.test.js`), the webhook sets
  `past_due` on `invoice.payment_failed` (now fixture-tested), and AccountDetail's Manage
  Subscription button opens the Stripe portal (tested in `AccountDetailSubscription.test.jsx`).
  Nothing rebuilt.
- [x] **Cancellation** — `canceled` keeps access through `current_period_end` (Stripe "cancel at
  period end"), then drops to read-only. **Audited 2026-07-06 — already existed**: same
  `getEntitlement` branch as `past_due` (tested before/after the period boundary), and
  `customer.subscription.deleted` forces status to `canceled` regardless of the event object's
  own status field (now fixture-tested). Nothing rebuilt.
- [x] **Account deletion** — **implemented 2026-07-06**: `api/delete-account.js` now looks up
  `stripe_subscription_id` and cancels the subscription **immediately** (not at period end)
  before deleting anything. Stored subscription ids don't record which Stripe mode minted them
  (preview checkout = test mode, production = live), so a new `STRIPE_CLIENTS` export in
  `_stripeClient.js` tries the deployment's own mode first, then the sibling —
  `resource_missing` means wrong mode or already gone, both safe to move past. Already-canceled
  subs are skipped; an unexpected cancel failure **aborts the deletion with a 500** so the
  request is retryable rather than leaving a deleted-but-still-billed user. Still a true hard
  delete, no archive (the archive-first path is §G's non-payment cron only, blocked on §I).
  9 tests in `src/test/api/deleteAccount.test.js`.
- [x] **Clock skew / tz** — **audited 2026-07-06**: all phase math in `getEntitlement` is
  UTC-epoch-ms comparison against the stored timestamps, and every caller — `App.jsx:1068`,
  `ProfilePanel.jsx` (AccountDetail), and the server-side `_lifecycleEngine.js` — passes real
  wall-clock `new Date()`, never `effectiveToday`/Lock Date. Boundary behavior (day-14 and
  day-21 inclusive/exclusive) pinned by `subscription.test.js`.
- [x] **Disclosure** — **audited 2026-07-06**: every rendered surface has a forbidden-pattern
  test (`UpgradeModal`/`UpgradePanel`/`TrialBanner` component tests + `lifecycleEmails.test.js`),
  and API responses expose nothing: seed-trial returns only `{seeded}`, checkout/portal only a
  URL, webhook only `{received}`. One inherent caveat, accepted per §D's design: the raw
  `access_ends_at` value does travel to the client inside `loadUserData()`'s row because the
  gate is computed client-side — it is never *rendered* on a non-admin surface, but a devtools
  user could read it. Moving the gate fully server-side is the only fix and out of scope for v1.
- [x] **Tests** — `getEntitlement` states + day-14/21 boundaries (§D, `subscription.test.js`);
  cron phase-routing + every-other-day throttle (§G, `lifecycleEngine.test.js`); webhook upsert
  mapping with signed fixture events and create-checkout missing/invalid-token rejection
  (**added 2026-07-06**: `stripeWebhook.test.js`, `stripeCreateCheckout.test.js`, plus
  `deleteAccount.test.js` for the new cancellation path — 23 new tests, 895 total).
- [ ] **Live verification: cancel-on-delete (deliberately left open until the end).** The
  delete-account cancellation is unit-tested but has never run against real Stripe — this sandbox
  has no credentials. On the preview deployment, in **test mode**: subscribe with the test card
  (`4242 4242 4242 4242`), run the "type DELETE" flow in ProfilePanel, then confirm in the Stripe
  test dashboard that the subscription shows **canceled** (not just the account gone). This is the
  last §H box and should be checked during the final pre-launch pass, alongside §B's Customer
  Portal config.

### I. Account Revival After Non-Payment Deletion

*New workstream (2026-07-01). When the day-21+7 dunning cron (§G) finally deletes an account for
non-payment, the user should still be able to come back — but coming back must require a real,
successful charge, not just re-entering the same info. This section defines that recovery path.
Depends on §G's deletion cron writing an archive record instead of a bare hard-delete — since §G
hasn't been built yet either, nothing here is actionable until that lands first. **(Update
2026-07-06: §G is live and the archive-then-delete step below is now wired in — the remaining
§I bullets, revival detection/screen/checkout/restore, are actionable.)***

**Core distinction:** the existing `api/delete-account.js` flow (user types "DELETE" in
ProfilePanel) stays a **true, unrecoverable hard delete** — that's an explicit user choice and
gets no archive. The **cron-driven non-payment deletion** (§G, day 21+7) is the only path that
archives first, specifically so revival is possible. Both still delete the live `auth.users` row
and `user_data` row — the difference is only whether a recoverable snapshot was taken first.

- [x] **Archive-then-delete in the lifecycle cron** — before `api/cron-subscription-lifecycle.js`
  hard-deletes a non-payment account, it upserts a snapshot into `deleted_accounts` (migration
  017, added below) keyed by email: `config`, `expenses`, `goals`, `logs`, `show_extra`,
  `week_confirmations`, `pto_goal`, `stripe_customer_id`, `plan`, `display_name`, `avatar_url`,
  and the OAuth provider if any (so the revival screen can say "Continue with Google" instead of
  a password field). `deletion_reason = 'non_payment_dunning_expired'`. Upsert-on-email so a
  second deletion cycle (revive → cancel again) overwrites the same tombstone rather than piling
  up duplicates.
  **Implemented 2026-07-06** — `archiveAndDeleteAccount()` in the cron, ordered for retry
  safety (any step failing leaves the account intact for the next daily run): resolve auth
  user → snapshot full row → cancel any lingering Stripe sub (shared `cancelStripeSubscription`
  helper, now exported from `_stripeClient.js` and reused by `delete-account.js`) → tombstone
  upsert (`onConflict: "email"`, explicitly resetting `revived_at`/attempt/decline fields so a
  second cycle reopens the tombstone fresh) → delete `user_data` → delete auth user. Supabase
  reports `provider: "email"` for password accounts, so only real OAuth providers are recorded.
  7 tests in `src/test/api/cronLifecycleDelete.test.js` (first coverage of the cron route
  itself) drive the real engine with day-30 fixtures: full tombstone mapping, OAuth provider,
  sub cancel, cancel-failure and archive-failure both blocking deletion, day-23 still emailing
  instead of deleting. ⚠️ **Verify in Supabase that migration 017's `deleted_accounts` table
  actually exists** (`select count(*) from deleted_accounts;`) — the §A note that 017 was
  unrun proved stale for the subscription columns, but the table half of that file hasn't been
  independently confirmed.
- [x] **Login-time detection** — `LoginScreen.jsx` needs to distinguish "wrong password" from
  "this email belongs to an archived, revivable account":
  - [x] **Email/password:** Supabase Auth intentionally returns the same generic "Invalid login
    credentials" for both wrong-password and no-such-user, so the client can't tell them apart
    from the auth error alone. On any login failure, look up the email against
    `deleted_accounts` via a server route (`api/revival-lookup.js`, service-role — never expose
    this table to anon/authenticated SELECT directly, since it holds archived financial data).
    If a match with `revived_at IS NULL` exists, route to the Revive Account screen instead of
    showing the generic error. **Implemented 2026-07-06** — `lookupRevivable()` in
    `LoginScreen.jsx` fires on every failed sign-in; a match switches to the new `"revive"` mode
    (new-password form, or "Continue with Google" when the tombstone records an OAuth provider).
    Lookup failures fall back to the generic error so a transient server problem can never block
    a normal login. Note: the unauthenticated lookup returns ONLY `{revivable, oauthProvider}` —
    never archived identity — and is deliberately an existence oracle (accepted trade-off,
    documented in the route).
  - [x] **OAuth (Google):** sign-in with a previously-deleted email transparently creates a **new**
    `auth.users` row (OAuth signup doesn't fail for "new" emails) before the app ever gets a
    chance to object. The `SIGNED_IN` handler must check `deleted_accounts` for that email
    *before* `syncUserProfile` seeds a fresh trial — if a revivable tombstone exists, short-circuit
    into the Revive Account screen and hold off on trial seeding / normal onboarding entirely.
    **Implemented 2026-07-06** — `checkRevival()` (`db.js`) runs first in App.jsx's SIGNED_IN
    handler; only when it resolves null does `syncUserProfile()` (and thus trial seeding) run.
    The authenticated lookup keys off the **session's** email (never client input) and returns
    the archived identity for the Revive screen.
- [x] **Revive Account screen** — reachable only via the redirect above (not a normal nav
  destination). Shows the archived `display_name`/`avatar_url`/email so the user recognizes their
  old account, and: **Implemented 2026-07-06** as two halves: LoginScreen's `"revive"` mode
  handles re-authentication (new password → `signUp`, or Google), and
  `src/components/ReviveScreen.jsx` (rendered by App.jsx whenever `revivalInfo` is set —
  before the wizard, panels, or anything else) handles identity display + plan choice +
  revive checkout. App clears the screen only when the post-checkout poll sees
  `subscription_status = "active"` (the webhook restore landing), then closes any wizard the
  bare pre-restore row opened and reloads the restored data.
  - Prompts for a **new password** (email/password accounts) — note in the UI copy (and here, for
    the humans building this): **there is no restriction on reusing the exact same password they
    had before cancellation** — that part is intentionally unblocked. For OAuth accounts, this
    step is just "Continue with Google" again.
  - Requires choosing a plan (monthly/annual) and entering a payment method via Stripe Checkout —
    **entering a card, even the exact same card that was on file before, does not by itself
    restore access.** Access is only restored once that card is actually **charged successfully**
    for the selected plan. No free re-entry path.
  - Reuses `stripe_customer_id` from the archive when present (same Stripe customer, new
    subscription) rather than creating a duplicate customer.
- [x] **`api/stripe-revive-checkout.js`** — like `stripe-create-checkout.js` but keyed off the
  archived tombstone rather than an existing `user_data` row: verify the new (just-created, empty)
  Supabase session belongs to the matching email, create/reuse the Stripe customer from
  `deleted_accounts.stripe_customer_id`, create a Checkout Session for the chosen plan.
  **Implemented 2026-07-06** — the tombstone is looked up by the verified session's email only
  (403 when none), so no one can revive or probe another email's archive. Sessions carry
  `metadata: { revival: "true", revival_email }` for the webhook branch, and every checkout
  attempt stamps `revival_attempt_count` + `last_revival_attempt_at`. Never touches `user_data`.
- [x] **On successful charge (webhook `checkout.session.completed` for a revival session)** —
  restore the archived `config`/`expenses`/`goals`/`logs`/`show_extra`/`week_confirmations`/
  `pto_goal` into the new `user_data` row, set `subscription_status = 'active'`, `plan`, and
  `stripe_subscription_id`, stamp `deleted_accounts.revived_at = now()` (tombstone consumed —
  next cancellation cycle starts a fresh one via the same upsert-on-email), and clear
  `revival_attempt_count`.
  **Implemented 2026-07-06** — `restoreRevivedAccount()` in `stripe-webhook.js`, branching on
  `metadata.revival`. Two deliberate details: (1) the trial window is seeded entirely **in the
  past** (`trial/access_ends_at = now`) because a revived account must never get a second free
  window — with null timestamps a later lapse would resolve entitlement `"none"`, which App.jsx
  doesn't gate, i.e. permanent free access; seeding a spent window makes a lapse resolve
  `"expired"` like any other non-payer. (2) A revival event whose tombstone was already consumed
  falls through to the plain status update, so a racing/duplicate session can't wipe restored
  data.
- [x] **Decline handling — the "two-way door"** — a declined charge must never be a dead end:
  **Implemented 2026-07-06, with one honest deviation.** Hosted Stripe Checkout handles card
  declines entirely on Stripe's page (the user retries different cards there without ever
  returning to the app), so the app never observes individual declines. What's implemented:
  attempt tracking stamps on every checkout-session creation (a superset of "on decline");
  returning with `?checkout=cancel` shows the retry guidance ("try a different payment method,
  make sure the card isn't frozen, or add funds…" — softened lead since a plain back-button
  lands on the same return) with the plan buttons immediately usable again; nothing ever routes
  the user back to re-enter password/email; no attempt cap.
  - [ ] **(Open, minor) `last_decline_code`/`last_decline_message` capture** — would need
    `payment_intent.payment_failed` webhook wiring mapped back to the tombstone; deferred until
    there's a real support need, since hosted Checkout already shows the user Stripe's own
    decline message in the moment.
- [x] **Tests** — login-failure → revival-lookup routing; OAuth new-signup → tombstone-match
  short-circuit; successful-charge → full data restore + tombstone consumed; declined-charge →
  attempt count increments and the screen remains usable; second deletion cycle after a revival
  correctly overwrites (not duplicates) the same tombstone row.
  **Added 2026-07-06 (26 tests):** `revivalLookup.test.js` (disclosure minimalism, session-email
  keying, `revived_at IS NULL` filter), `stripeReviveCheckout.test.js` (guards, customer reuse,
  revival metadata, attempt stamping), two signed-fixture revival cases in
  `stripeWebhook.test.js` (full restore + tombstone consume; consumed-tombstone fall-through),
  `ReviveScreen.test.jsx` (identity, checkout call, two-way-door retry, disclosure guard), and
  five LoginScreen revival-routing cases. Tombstone overwrite-on-second-cycle is asserted in
  `cronLifecycleDelete.test.js` (upsert on email + revival-field reset). **Not covered:** the
  App.jsx SIGNED_IN short-circuit itself (App has no component test harness) — see the parked
  live-verification bullet below.
- [ ] **Live verification: tombstoned-email Google OAuth sign-in (deliberately parked for the
  final pre-launch pass, alongside §H's cancel-on-delete bullet).** The one §I path no unit test
  can reach: App.jsx's SIGNED_IN short-circuit. On the preview deployment, with a
  `deleted_accounts` tombstone whose `oauth_provider = 'google'` and `revived_at IS NULL`
  (backdate a Google test account past day 28 and run the cron, or hand-insert a tombstone in
  the SQL editor): sign in with that Google account and confirm it lands on **ReviveScreen** —
  not the setup wizard, and with **no fresh trial seeded** (check via DB Row Viewer that
  `trial_started_at` stays null on the new `user_data` row until revival). Then complete the
  revive checkout with the test card and confirm the archived data comes back and the tombstone's
  `revived_at` is stamped. While here, also do the email/password variant (failed sign-in →
  revive password form) — same session, much cheaper than a separate pass.

**Handoff checkpoint #3 (2026-07-06) — §H + §I code-complete; branch
`claude/stripe-paywall-hardening-audit-1a9s6u`:**
Everything in checkpoints #1–2 still applies. New since then: §H shipped (delete-account cancels
the Stripe sub; signed-fixture webhook + checkout-guard tests), the §G/§I archive-then-delete cron
step is live in code, and the full §I revival flow is built (lookup route, LoginScreen routing,
App SIGNED_IN short-circuit, ReviveScreen, revive-checkout, webhook restore). 928 tests green.
Still open / needs the user:
- **Migration 019 (RLS) is confirmed NOT yet run in Supabase** (user, 2026-07-06). All §17
  privileged columns are app-layer-protected only until it runs. `deleted_accounts` (017) IS live.
- Live verification pass on the preview deployment: cancel-on-delete (§H's parked bullet), the
  §B Customer Portal config, and the full revival loop including the tombstoned-email Google
  OAuth sign-in (§I's parked bullet above — the one path unit tests can't reach).
- §I minor leftover: decline-code capture (open sub-bullet above).

### J. Env vars (Vercel)

*Reference only — all Stripe/Supabase vars listed here are already set in Vercel and working
(validated by the §C test-mode checkout pass and confirmed live by the user). `EMAIL_API_KEY` and
`CRON_SECRET` are the only two not yet set — §G's code now ships and requires both (the cron route
500s with a "Server configuration is missing" log until they exist). `EMAIL_FROM` is optional.*

```
STRIPE_SECRET_KEY=...             # LIVE server key (api/ functions)
STRIPE_SECRET_KEY_TEST=...        # TEST server key
STRIPE_WEBHOOK_SECRET=...         # LIVE webhook signing secret
STRIPE_WEBHOOK_SECRET_TEST=...    # TEST webhook signing secret
STRIPE_PRICE_MONTHLY=price_...    # LIVE — $14.99/mo
STRIPE_PRICE_MONTHLY_TEST=price_... # TEST — $14.99/mo
STRIPE_PRICE_ANNUAL=price_...     # LIVE — $120/yr ($10.00/mo flat, ~4 months free)
STRIPE_PRICE_ANNUAL_TEST=price_...  # TEST — $120/yr
APP_URL=https://...               # server only — whitelisted base URL for Checkout/Portal
                                   # success, cancel, and return URLs. Not mode-specific.
EMAIL_API_KEY=...                 # Resend API key (§G lifecycle emails; api/_email.js) —
                                   # RESEND_API_KEY (the name Resend's Vercel integration
                                   # injects) is accepted as a fallback

EMAIL_FROM=...                    # optional verified sender, e.g. "Authority Finance <no-reply@domain>"
                                   # — defaults to onboarding@resend.dev (dev-only delivery) when unset
CRON_SECRET=...                   # guards api/cron-subscription-lifecycle; Vercel auto-sends it
                                   # as the Authorization header on cron invocations
VITE_STRIPE_PUBLISHABLE_KEY=...   # client (only if using Stripe.js redirect; not needed for hosted Checkout URL)
# Reuses existing SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_* already set for delete-account.
```

**Test mode vs. live mode (2026-07-03).** The Stripe account defaults to live mode with no
visible toggle in the mobile UI — it's under account name → **Test mode** (the simple, classic
toggle; *not* "Switch to sandbox", which is Stripe's newer isolated-environment feature and is
more than this app needs). Test and live are fully separate: products, prices, customers, and
webhooks created in one never appear in the other. Both sets now exist:

| | Live mode (for launch) | Test mode (for building/testing now) |
|---|---|---|
| Product | (not captured — see live price IDs below) | `prod_UodCQD1AbN33wy` |
| Price — monthly $14.99 | `price_1TodbhD1cN4rPkqb510vKlKi` | `price_1TozwQD1cN4rPkqb1NqhIQoR` |
| Price — annual $120 | `price_1Toe4ND1cN4rPkqbf9EmRJQr` | `price_1TozwQD1cN4rPkqbahFeMbOL` |
| Webhook secret | set in Vercel, not repeated here | set in Vercel, not repeated here |
| Secret key | set in Vercel, not repeated here | set in Vercel, not repeated here |

Price/product IDs aren't secret (Stripe treats them as public identifiers — they're useless
without the secret key), so they're safe to keep here. **Webhook secrets and the Stripe secret
keys are never written to this repo** — only to Vercel env vars.

**Distinct env var names per mode, not Vercel environment scoping** (switched from the original
plan 2026-07-03 — trying to keep one key name with different values per Vercel environment scope
turned out to be more friction than it was worth). Every `STRIPE_*` var now has a `_TEST` sibling
holding the test-mode value, and both live in Vercel simultaneously regardless of environment.
`api/_stripeClient.js` picks which pair to use:
- **Checkout/Portal (routes we call outward)** — no ambiguity, so pick by `VERCEL_ENV`:
  `production` → live vars, anything else (preview/development/unset) → test vars. Defaults to
  test whenever `VERCEL_ENV` is missing, so a misconfigured/local run never silently uses live.
- **Webhook (Stripe calls us)** — this is the one case with real ambiguity: both the live and
  test webhook endpoints were registered against the *same* deployed URL, so a single running
  instance can receive events from either mode. There's no per-request mode signal except "which
  secret validates the signature," so `constructWebhookEvent()` tries the live secret first, then
  the test one, and returns whichever Stripe client actually verified it — that client (not a
  fixed one) is what's used for any follow-up Stripe API call the handler makes for that event
  (e.g. `subscriptions.retrieve`), since a test-mode object only exists in the test account.

`PLAN_BY_PRICE_ID` merges both modes' price IDs into one lookup for the same reason — an incoming
webhook event's price id could be either mode's, so there's no "pick a side" step there either.

### K. Future Ideas (not in scope for v1)

*Deliberately deferred — don't pick these up unless the user explicitly asks, even if §G–I are
finished first.*

- [ ] **Account top-off** — let a user with spare cash pre-buy extra subscription time (e.g. a
  week at a time) into a banked balance on their account, purely as a voluntary buffer against a
  future missed payment — explicitly **not** "paying the bill early," and copy must make that
  distinction clear so it doesn't read as a coerced prepayment.

---

## 18. AI Layer — Coach + Contextual Intelligence

*Authority Finance's AI layer is built around a single character: **Coach** — a financial wellness
companion with a visual mascot identity. Coach appears across the app as a contextual presence:
answering how-to questions, responding to financial stress signals, and delivering insight-rich
summaries tied to the user's real data. All AI calls run through the Claude API (Anthropic).*

*Items consolidated here from: §15.E (Job Hunt AI), §15.F (Application Assistant), §9 (Statements
AI layer), §16 (Financial alert copy + Net Worth mental health trigger).*

**⚠️ Standing constraint — all AI features are `isAdmin`/`isTester`-gated for now.** Every
Coach-facing surface (chat entry points, triggered insight cards, statement summaries, any future
§18/§21 feature) must check `canAccessAiFeatures({ isAdmin, isTester })` (`src/lib/entitlements.js`)
on both sides: client-side to hide the entry point from ungated users, and server-side in the
relevant `api/*.js` route so a request is rejected even if called directly. `is_tester`
(`user_data.is_tester`, migration `021_add_is_tester_beta_flag.sql`) is a manually-granted beta
flag — set only by Anthony via SQL on an already-existing account, never self-service — that exists
specifically so AI features can get real usage outside the personal admin account. **Beta testers
are NOT investors:** this check must never fold in `isInvestor`; see
`docs/active-systems.md` §23 (Beta Tester Accounts) and §18 (Investor & Demo Accounts) for the
full division. This is a temporary build-phase gate, not a permanent tier — lift it deliberately
(and update this note) once Coach is ready for a general rollout.

---

### §18.0 — Scaffolding pass (2026-07-06): build order, resolved technical decisions, open questions

*Added before any §18 code exists. Model/pricing/caching facts below are from the Claude API
reference (cached 2026-06-24) — re-verify against platform.claude.com before the first API call
is written, since model lineups move.*

#### Build order (dependency-driven, four phases)

1. **Phase A — Walking skeleton (§G + minimal §B).** `api/coach.js` streaming proxy +
   `lib/aiContext.js` serializer + a minimal Ask Coach chat panel with **no persistence** (history
   lives in component state, lost on close). Smallest end-to-end slice that proves auth → context
   injection → streamed response → mobile UX. Everything else in §18 layers on this.
2. **Phase B — Persistence (§H).** `coach_chats` migration + RLS, `db.js` load/save/delete,
   history list UI, end-of-session summaries. Ship only after Phase A feels right in the hand.
3. **Phase C — Coach presence (§C + §D).** Net worth trigger tiers + the `NetWorthHealthTips.jsx`
   rewrite (the §16 close-out's deferred half), then statement summaries. These reuse Phase A's
   proxy + serializer wholesale.
4. **Phase D — Job Hunt + Job Scout (§E, §I).** Needs §15.C Job Loss Mode surfaces (partially
   live already — `JobLossDashboard`/`JobLossEntry` shipped) plus a Google Places key (§I) —
   the one §18 feature with a second external vendor.
- **§A (identity) runs in parallel** — mascot mark + personality brief have no code dependency,
  but Phase A shouldn't ship to non-admin users without at least a placeholder avatar and the
  agreed voice. **§J (tax interview) stays behind §20's accountant gate** regardless of phase.
- **Gate everything behind `isAdmin` initially** — Coach ships admin-only until cost telemetry
  (below) shows per-conversation cost is acceptable, then investors, then everyone.

#### Resolved technical decisions

- **Models.** Haiku tier = `claude-haiku-4-5` ($1/$5 per MTok, 200K context) — chat answers, FAQ,
  net worth triggers, session summaries, Job Scout term generation. Sonnet tier =
  `claude-sonnet-5` ($3/$15; intro $2/$10 through 2026-08-31, 1M context) — statement narratives,
  job-hunt drafts. Two watch-outs on Sonnet 5: **omitting `thinking` runs adaptive thinking by
  default** (decide per call type — disable for short summaries, keep for narratives), and
  **non-default `temperature`/`top_p` are rejected** — voice/variety is steered by prompt, which
  suits the fixed Coach persona anyway. Exact IDs, no date suffixes.
- **Prompt-caching layout (drives real cost).** Cache is a byte-exact **prefix** match: order is
  tools → system → messages, so the request must be *frozen persona + feature-guide FAQ block in
  `system` (with `cache_control` on the last system block)* and the **per-user snapshot + question
  in `messages`, after the breakpoint** — never interpolate the user's name, date, or any live
  number into the system prompt or the cache never hits. ⚠️ **Minimum cacheable prefix on Haiku
  4.5 is 4096 tokens** — the persona + FAQ block must exceed that or caching silently no-ops
  (`cache_read_input_tokens: 0` is the tell). That's the *floor* for the feature guide, not a
  nice-to-have. 5-min TTL; writes 1.25×, reads 0.1× — a busy chat session pays for itself on the
  second message.
- **`api/coach.js` streams.** SSE pass-through from `@anthropic-ai/sdk`'s `client.messages.stream()`
  to the browser; same Bearer-token auth as `api/delete-account.js`. **Verify Vercel's
  function-duration limit on our plan supports streaming responses long enough for Sonnet
  narratives before building** — if not, statement summaries fall back to non-streaming with a
  loading state.
- **`ANTHROPIC_API_KEY` is server-side only** — plain Vercel env var, never `VITE_`-prefixed,
  never in the client bundle (same rule as `STRIPE_SECRET_KEY`).
- **`lib/aiContext.js` must exclude subscription internals.** The §17 disclosure rule extends to
  Coach: the serializer never includes `accessEndsAt`, grace state, dunning fields, or anything
  that could let Coach mention the hidden week. Enforce with a unit test on the serializer output
  (deterministic output makes this test trivial — same reason caching and the §21.E eval suite
  want determinism).
- **§19 is a Coach context source.** `account_history` (live since 2026-07-06) gives Coach the
  user's config-change timeline — life-event sequence, raises, employer switches — exactly the
  personalization hook parked in §19.D2's commented block. Phase A ships without it; wire it into
  the serializer when a real use case (e.g. "your raise in March changed this") justifies the
  tokens.
- **Migration renumbering.** §H1's `017_add_coach_chats.sql` is stale — 017 through 021 are now
  taken (021 went to `021_add_is_tester_beta_flag.sql`, the beta tester flag, 2026-07-07); the
  coach_chats migration lands as **`022_add_coach_chats.sql`** (or whatever is next when Phase B
  actually starts — check `database/migrations/` before writing it).
- **Cost controls are Phase A scope, not later.** Log call type + `usage` token counts (including
  cache read/write splits) per request from the first deployed call — §21.E's "AI cost telemetry"
  starts as a `console.log`/DB row in `api/coach.js`, not a dashboard.

#### Brainstorm additions (scoped to §18, grounded in what exists)

- [ ] **Per-user message budget** — a daily Coach message cap per user (config- or DB-backed,
  generous, invisible in normal use) so a runaway client loop or abusive user can't turn the
  Anthropic bill into an incident; return a friendly "Coach needs a breather" at the cap. Cheap
  insurance that must exist before Coach leaves admin-only.
- [ ] **Coach cites its sources in-app** — every number Coach references carries a tappable chip
  deep-linking to the panel that computes it ("weekly net → Income panel"). Turns Coach answers
  into navigation and enforces the data-grounded voice mechanically, not just by prompt.
- [ ] **Seed the eval suite from Phase A day one** — every admin-flagged bad answer during the
  admin-only phase gets saved (snapshot + question + bad answer) into a fixtures folder; §21.E's
  10 golden conversations assemble themselves before public launch instead of being invented.
- [ ] **Live State Inspector: Coach line** — admin-only "last Coach call: [type] · [model] ·
  [tokens in/out] · [cache hit?]" so cost behavior is verifiable from a phone, same pattern as
  §19's config-history line.
- [ ] **Reuse the §17 test pattern for Coach copy** — TrialBanner-style forbidden-pattern tests on
  every hardcoded Coach surface (trigger card templates, empty states): no "grace", no "21", plus
  the §C guardrails (no catastrophizing words on red-tier cards).

#### Open product questions (need your call, not research)

- [ ] **Entry point** — §B says bottom nav or floating chip; bottom nav is already 5 items (+
  admin Tools). Floating chip clashes with the admin Live pill's corner. Hamburger item is
  cheapest but buries the flagship AI feature. Decide before Phase A's UI is built.
- [ ] **Free vs. paid** — is Coach included in the $14.99 subscription, trial-gated, or a later
  premium tier? Changes the §17.E gating wiring and the unit economics (a chatty user costs real
  money; the answer decides how generous the message budget above is).
- [ ] **Mascot production** — who produces the §A mark (generated, commissioned, or hand-rolled
  SVG in the Flow palette)? Phase A can ship admin-only with a placeholder, but the public
  entry point wants the real avatar.

---

### A. Coach — Character Identity

- [ ] **Name:** Coach
- [ ] **Open question — optional surname personalization:** explore letting a user opt into a
  surname for Coach from a small curated, finance-themed list (e.g. "Coach Finn") rather than
  free-text input — no custom names, just a pre-vetted pick-list so tone/branding stays controlled.
  Purely opt-in; "Coach" alone stays the default. Not scoped or committed — needs a UX pass (where
  does the picker live — ProfilePanel? SetupWizard step 0?) and a short-list of candidate surnames
  before this becomes real work.
- [ ] **Mascot icon design** — create a recognizable, single-color mark for Coach to use as an
  avatar in chat bubbles, beside insight cards, and in triggered messages; suggestions: a stylized
  chart-and-figure silhouette, an abstract upward-momentum mark, or a minimal shield/compass — keep
  it at home in a teal-on-dark-green palette; must read at 24×24px and 48×48px
- [ ] **Personality brief** — corner-man persona (seasoned, in-your-corner, not an opponent-fighting
  hype man); speaks in the first person; concise and direct; supportive without being patronizing;
  always grounds a message in the user's actual numbers rather than generic affirmations; one
  concrete next step per message. Full voice brief, boxing-metaphor vocabulary, and the scored
  tuning rubric live in `docs/coach-personality-rubric.md` — read that before writing any Coach
  copy or system prompt.
- [ ] **Visual placement standard** — small Coach avatar chip appears beside every AI-generated
  output (chat, triggered cards, statement summaries); consistent sizing + spacing across all
  surfaces (16px avatar in inline cards; 32px in full chat header)

---

### B. General AI Chat — "Ask Coach"

*An app-scoped chat for users who want to understand how Authority Finance works. Not a general
financial advisor — Coach answers questions about the app using the user's real config as context.*

- [ ] **Entry point** — "Ask Coach" button accessible from the mobile bottom nav (or a floating
  action chip); opens a full-screen chat panel (bottom-sheet on mobile, side panel on desktop)
- [ ] **System prompt scope** — Coach answers questions about Authority Finance features (how the
  setup wizard works, what a given metric means, how to log an event, what the goals system does,
  etc.); system prompt includes a compressed snapshot of the user's config + key live metrics so
  answers are personalized ("Your current weekly net is $X — here's how that's calculated…")
- [ ] **Feature FAQ context block** — pre-seed Coach's context with a structured feature guide
  covering: setup wizard steps, log event types, goal system, Income panel math, Budget categories,
  Life Events, Admin Tools; prompt-cached so repeat questions are cheap
- [ ] **Guardrail** — Coach does not give tax advice, legal advice, or investment recommendations;
  acknowledges the disclaimer when those topics come up
- [ ] **Claude API integration** — Haiku for short conversational answers; Sonnet for richer
  multi-step responses; prompt caching on the feature guide context block
- [ ] **Conversation persistence** — chat history, Coach summaries, and key insights are saved
  per-session to Supabase via the `coach_chats` table → full schema in **§18.H**; "New Chat"
  starts a fresh record; past chats are browsable in a history list
- [ ] **Auto-summary** — at end of session (user closes chat or after 10 min idle), Coach
  generates a 1–3 sentence summary of the conversation stored in `coach_chats.summary`; surfaced
  in the history list as a preview
- [ ] **Mobile UX** — full-screen sheet; keyboard push handled cleanly with `safe-area-inset-bottom`;
  Coach avatar shown in the panel header; input pinned above keyboard

---

### C. Net Worth Trend Mental Health Trigger + Coach Response

*`NetWorthHealthTips.jsx` already exists and fires static "Financial Breakthrough" copy. This
upgrades it: Coach generates a short, context-aware message tied to the user's actual net worth
trend, and the static copy is rewritten to match Coach's voice.*

*Built 2026-07-07 as `src/lib/coachTriggers.js` (pure signal resolution + rate-limiting),
`src/lib/coachPrompts.js` (per-tier system prompts), and `CoachNetWorthCard.jsx`, wired into
`HomePanel.jsx` alongside (not replacing) the existing static tips, `isAdmin`-gated per the §18
standing constraint. Ships live API calls to Haiku via `chatWithCoach`.*

- [ ] **Copy audit — static tips rewrite** — rewrite all existing "Financial Breakthrough" tips
  in `NetWorthHealthTips.jsx` to match Coach's voice: direct, supportive, data-grounded; remove
  generic affirmations; every tip should reference a real lever the user can pull inside the app
  (adjust an expense, fund a goal, run the Budget panel, etc.) — **deferred**, copy-only, no API
  cost, can be done anytime independent of the rest of this section
- [x] **Trigger conditions (formalize)** — implemented as proxies against data that already
  exists rather than the literal candidates below, since two of them need a persisted weekly
  net-worth history this app doesn't store yet (see `src/lib/coachTriggers.js` header comment
  for the exact substitutions and `src/lib/aiContext.js`'s "Future context extensions" map for
  what a real implementation would need):
  - ~~Net worth flat or declining for ≥ 3 consecutive weeks~~ → proxied by
    `netWorthHealthStatus().belowThreshold` (thin savings cushion), a different signal that's
    close in spirit but not a trend read — **real version deferred, needs history**
  - ~~A single-period net worth drop exceeding a configurable threshold (e.g. > 10%)~~ —
    **not implemented, needs history**
  - [x] Runway cliff approaching within 30 days (Job Loss Mode) — real implementation,
    `estimateRunwayDays()` in `coachTriggers.js` (independent of JobLossDashboard's own runway
    calc, which has a session-only savings override this trigger can't see — assumes $0 extra)
  - ~~A goal falling critically behind schedule (> 4 weeks off projected finish)~~ —
    **not implemented, needs history** (§21.A's Goal ETA Drift Alerts is the fuller version)
- [x] **Signal tiers:**
  - [x] **Amber (attention)** — fires on the thin-cushion proxy above; see
    `buildNetWorthSystemPrompt("amber")` in `coachPrompts.js` for the live prompt
  - [x] **Red (critical)** — fires on `estimateRunwayDays() < 30`; message drops corner-man
    metaphor entirely per the personality rubric's own note on this tier
  - [x] **Green (recovery)** — fires when the previously-fired tier was amber/red and neither
    condition holds anymore (reads this trigger's own fire history, not an independent net-worth
    delta — see code comment)
- [x] **Coach API response** — `chatWithCoach` → `api/coach.js` → Haiku, 2–3 sentences per the
  system prompt's own instruction
- [x] **Mental health framing guardrail** — encoded directly into `COACH_PERSONA_PROMPT` in
  `coachPrompts.js`
- [x] **Rate-limiting** — `shouldFireForTier()` compares fiscal week index (not wall-clock days);
  state persisted in `localStorage` (`coachNetWorthSignal`) rather than config/Supabase — a
  session-scoped rate limiter, not a durable one; §18.H's `coach_chats` table would make this
  durable across devices once it exists
- [x] **Dismissal** — `✕` button in `CoachNetWorthCard`; dismissal keyed to `(tier, weekIdx)` so
  a new week or a tier change un-dismisses it

---

### D. Statements AI Insights *(extracted from §9)*

*Previously listed under §9 Statements Tab.*

- [ ] **End-of-period Coach summary** — when a monthly/quarterly/yearly statement is generated,
  Coach writes a 3–5 sentence narrative: what went well, what missed, key spending patterns, goal
  velocity, and one forward recommendation — all grounded in the statement's actual numbers
- [ ] **Year-end narrative arc** — deeper annual Coach summary: full goal reconciliation, total tax
  picture, 401k growth, biggest expense shifts, and a prose arc of the fiscal year
- [ ] **Prompt caching** — cache the financial context block across the statement session to reduce
  token cost on follow-up queries within the same report

---

### E. Job Hunt AI Assistant *(extracted from §15.E — Phase 3)*

*Requires Job Loss Mode (§15.C) to be live first.*

- [ ] **Job Hunt Chat panel** — dedicated sub-view in Job Loss Dashboard; powered by Coach (Claude
  API) with a system prompt including: current role title, prior income, runway days, target income,
  state/region, application log summary
- [ ] **Contextual prompt modes:**
  - [ ] "Help me with my resume" — structured resume review tied to target roles
  - [ ] "Write a cover letter for [role]" — drafts from stored job title + experience summary
  - [ ] "Prep me for [company] interview" — role-specific Q&A from company + job title
  - [ ] "Salary negotiation coaching" — uses prior income + target income + runway as context
  - [ ] "How long can I be selective?" — runway-aware guidance on holding out vs. taking a quick offer
- [ ] **Financial context injection** — every session receives a condensed snapshot (runway, burn
  rate, target net, current week) so advice is grounded in real numbers
- [ ] **Prompt caching** — cache the financial context block across the conversation session

---

### F. Application Assistant *(extracted from §15.F — Phase 4)*

*Requires Job Board integrations (§15.F) to be live first.*

- [ ] **Draft application mode** — for saved job listings, "Draft application" launches Coach
  pre-loaded with the specific job description for cover letter / interview prep mode

---

### G. Shared Infrastructure

- [x] **`lib/claude.js` wrapper** — single client: handles auth, retries, prompt caching headers;
  exports `chatWithCoach(messages, systemPrompt, contextBlock, model)` where `model` defaults to
  Haiku and callers can pass Sonnet for richer responses
- [x] **`lib/aiContext.js` serializer** — deterministic compressed financial snapshot builder for
  injection into Coach's system prompt; same output shape every call so prompt caching is effective;
  includes: weekly net, net worth delta, goal count/status, expense total, runway (if in job loss
  mode), current week + fiscal context
- [x] **`api/coach.js` serverless route** — proxies Claude API calls through a Vercel function so
  the API key stays server-side; same auth pattern as `api/delete-account.js` (verify Supabase
  Bearer token, then call Anthropic); returns streamed response for chat UX
- [x] **Cost controls** — Haiku for Coach messages, FAQ answers, and net worth triggers; Sonnet
  for statement summaries and job hunt drafts; log token counts per call type in dev
- [x] **Env vars** — add `ANTHROPIC_API_KEY` to Vercel env + CLAUDE.md env vars section
- [ ] **`coach_chats` table** — all conversation + search history lives here; schema in **§18.H**;
  load recent chats on auth via `db.js` alongside the main `user_data` fetch
- [ ] **Context serializer roadmap** — `lib/aiContext.js` keeps a running comment map of context
  fields future AI features will need (§18.D/E/J, §21.A/B/C, §21 F1–F3); extend `buildCoachContext`
  and that map together whenever one of those items gets scoped, so context-building stays
  centralized instead of growing a bespoke builder per feature
- [x] **Beta tester gate** — `user_data.is_tester` (migration `021_add_is_tester_beta_flag.sql`)
  + `canAccessAiFeatures({ isAdmin, isTester })` (`src/lib/entitlements.js`), checked in both
  `api/coach.js` and `HomePanel.jsx`'s Coach card. Manual-grant only, auto-seeds a 6-month
  app-side trial window, explicitly excluded from `is_investor`/demo-account access and from the
  lifecycle cron's dunning/deletion. Full writeup: `docs/active-systems.md` §23

---

### H. Chat & Search History Persistence (Supabase)

*Every Coach conversation and every Job Scout search is a row in `coach_chats`, linked to the
user by a foreign key. This gives users a persistent record across devices and sessions, and
gives Coach context to reference past conversations when relevant.*

#### H1. Migration — `022_add_coach_chats.sql` (renumbered — see §18.0's migration-renumbering note; check `database/migrations/` for the actual next-available number before writing this)

```sql
CREATE TABLE coach_chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES user_data(id) ON DELETE CASCADE,

  -- discriminator: what kind of record is this row?
  chat_type       TEXT NOT NULL
                  CHECK (chat_type IN ('ask_coach', 'job_scout', 'job_hunt', 'statement_summary')),

  -- human-readable label shown in history list; auto-generated, user-editable
  title           TEXT,

  -- full message thread: [{role, content, timestamp}]
  messages        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Coach-generated 1-3 sentence summary written at end of session
  summary         TEXT,

  -- structured insights extracted from the conversation (statement insight keys, etc.)
  insights        JSONB,

  -- job_scout only: the search parameters that produced this record
  search_params   JSONB,   -- { jobTitle, address, radiusMiles, searchTerms[] }

  -- job_scout only: compiled employer list
  search_results  JSONB,   -- [{ businessName, town, state, phone, category, searchTerm }]

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- fast lookup: all chats for a user, newest first
CREATE INDEX coach_chats_user_id_created_at
  ON coach_chats (user_id, created_at DESC);
```

- [x] **Write migration** `database/migrations/022_add_coach_chats.sql` — built 2026-07-10.
  Two deliberate deviations from the spec above, documented in the migration's own header:
  the FK is `references user_data(user_id)`, not `user_data(id)` (the spec named the wrong
  column — `user_data`'s real PK is `user_id`); and there's no `moddatetime` trigger for
  `updated_at` — no such trigger exists anywhere in this schema today (not even on
  `user_data`, despite CLAUDE.md's mention), every table stamps it client-side instead, and
  this table matches that actual convention rather than introducing a new one
- [x] **RLS policies** — full own-row `SELECT`/`INSERT`/`UPDATE`/`DELETE` (`user_id = auth.uid()`),
  closer to `user_data`'s own-row policy set (019) than `account_history`'s insert-only one
  (020) — chat history is user-editable/deletable, unlike an audit log
- [x] ~~`updated_at` trigger~~ — see migration deviation note above; handled client-side instead

#### H2. `db.js` integration

- [x] **`loadCoachChats(limit = 20)`** — built 2026-07-10 in `src/lib/db.js`. Signature dropped
  the spec's `userId` param — every other load/save function in this file derives the user
  from `getCurrentUserId()` internally rather than accepting it from the caller; matched that
  existing convention instead of introducing a one-off exception. Maps snake_case columns to
  camelCase. Tests: `src/test/lib/dbCoachChats.test.js`
- [x] **`saveCoachChat(chat)`** — built 2026-07-10. Upserts by `id`; omitting `chat.id` lets the
  DB generate one for a new chat (returned to the caller so it can keep upserting into the same
  row). `user_id` always comes from the session, never the caller. **Not yet wired to a
  debounced-on-append / immediate-on-close call site** — that needs the Ask Coach chat UI
  (§18.B, not built yet) to call it from
- [ ] **`deleteCoachChat(id)`** — [x] function built (`db.js` + tests), [ ] swipe-to-delete/
  long-press UI still needs §18.H3's history list to exist
- [ ] **In-memory shape** — `coachChats` array is a peer of `config`, `logs`, `goals` in App state;
  passed down only to the Coach panel — **deferred**: no Coach panel exists yet to receive it
  (§18.B); wiring `loadCoachChats()` into `App.jsx`'s auth-load effect now would be dead state
  with no consumer. Do this alongside §18.B, not before it.

#### H3. Chat history UI

- [ ] **History list panel** — within the Ask Coach panel, a scrollable list of past chats grouped
  by date (Today / This Week / Older); each row shows: `title` (or first user message truncated),
  `summary` preview, `chat_type` chip, and `created_at` relative date
- [ ] **Tap to resume** — tapping a history row loads the full `messages` array back into the
  active chat view so the user can continue the conversation
- [ ] **New Chat button** — always visible at the top of the history list; starts a fresh
  `coach_chats` row with `messages: []` and focuses the input
- [ ] **Job Scout entries** — `chat_type: 'job_scout'` rows render a compact result-count preview
  ("Found 14 employers") instead of a message preview; tapping opens the Job Scout results view
  (§18.I) rather than the chat view

#### H4. Summary + insight generation

- [ ] **End-of-session summary** — after session idle (10 min) or explicit "End Chat", fire a
  Haiku call: system prompt instructs Coach to summarize the conversation in 1–3 sentences;
  result written to `coach_chats.summary` and `updated_at` bumped
- [ ] **Statement insight extraction** — for `chat_type: 'statement_summary'` rows, write
  structured key findings into `insights` JSONB so the Statements panel can display them inline
  without re-calling the API on every render
- [ ] **Admin diagnostic** — DB Row Viewer → add a "Coach Chats" count line: "N saved chats
  (M job scout / K ask_coach / J statement)"; tapping the count shows the 5 most recent titles

---

### I. Job Scout — Location-Based Employer Search

*A specialized search that answers: "Who around me is likely to have this job opening?" — not a
job board, not a posting aggregator. Coach runs a grid of industry-category searches against a
business lookup API, compiles every result into a deduplicated employer list with phone numbers,
and saves the whole thing as a persistent "search" that the user can call from.*

*Saved as `chat_type: 'job_scout'` in `coach_chats`. Lives inside the Job Loss Dashboard (§15.C)
and the Job Hunt panel (§18.E), but the search entry point can also live in the Ask Coach panel
history sidebar for quick re-access.*

#### I1. Search input

- [ ] **Job title / type field** — free-text input; examples: "forklift operator", "warehouse
  associate", "CDL driver"; used both to generate category search terms and to label the saved search
- [ ] **Location input** — full address or city + state; geocoded on the serverless side to a
  lat/lng center point; pre-filled from `config.userState` if no address is set
- [ ] **Radius slider** — miles from the center point; range 5–100 mi; default 30 mi
- [ ] **"Run Search" button** — triggers `api/job-scout.js`; shows a loading state with a
  progress indicator per search term batch ("Searching: warehouses…")

#### I2. Search term generation (Coach-assisted)

- [ ] **Term generation** — before hitting the business API, call Claude (Haiku) with the job
  title and ask it to return 3–5 industry category labels most likely to employ someone in that
  role; examples for "forklift operator": ["warehouse", "distribution center", "lumber yard",
  "manufacturing plant", "building supply"]; adapts to any job type without hardcoded lists
- [ ] **Term override** — advanced toggle lets the user see and manually edit the generated search
  terms before running the search

#### I3. Business search API

- [ ] **Primary API choice** — Google Places API "Text Search" (`/maps/api/place/textsearch/json`)
  with query = `"[search term] near [lat,lng]"` + `radius` in meters; returns name, address
  components (city/town), and phone (via Place Details); chosen for coverage in rural/suburban areas
- [ ] **Fallback / alternative** — if Google Places is cost-prohibitive, evaluate SerpAPI
  "Local Results" or Yelp Fusion `business/search` by lat/lng + category
- [ ] **Per-term calls** — one API call per search term (3–5 calls); merge all result arrays
- [ ] **Deduplication** — deduplicate by `place_id` or normalized `(businessName, phone)` pair;
  a business surfaced under two search terms is kept once with both `searchTerms` merged
- [ ] **Fields captured per result:**
  - `businessName` · `town` · `state` · `phone` · `category` · `placeId`

#### I4. Results UI

- [ ] **Results list** — full-screen view; header card shows job title, location, radius, result
  count, search date; employer rows sorted by distance (closest first)
- [ ] **Employer row** — business name, town + state, category chip, and a **Call button**
- [ ] **Call button** — renders as `<a href="tel:+1XXXXXXXXXX">` with phone stripped to digits
  only (`replace(/\D/g, '')`); tapping triggers the native OS phone dialer — no custom
  implementation needed, the `tel:` scheme is handled by the OS; styled as a teal-filled SmBtn
  with a phone icon; label shows the formatted number ("(573) 555-0182")
- [ ] **"No phone found" state** — grey "No phone on file" badge; business name links to Google
  Maps via `maps.google.com/?q=place_id:...`
- [ ] **Filter bar** — filter by category chip; "All" default
- [ ] **Result count badge** — "14 employers found"; updates live as filters change

#### I5. Saving + revisiting

- [ ] **Auto-save** — as soon as the search completes, write a `coach_chats` row:
  `chat_type: 'job_scout'`, `title: "Forklift Operator — Perryville MO (30 mi)"`,
  `search_params`, `search_results` (full deduplicated array)
- [ ] **History list entry** — shows in the Ask Coach history sidebar as a job scout chip; tapping
  reopens the results view with no re-fetch (data is in the saved row)
- [ ] **Re-run search** — "Refresh" button re-runs the same params and overwrites `search_results`
  + `updated_at` on the existing row
- [ ] **Application tracker link** — each employer row has a secondary "Track" action that creates
  a Re-employment Tracker entry (§15.C6) pre-filled with business name and "Applied" status

#### I6. Serverless route — `api/job-scout.js`

- [ ] **Auth** — verify Supabase Bearer token (same pattern as `api/delete-account.js`)
- [ ] **Term generation call** — call Claude Haiku to produce 3–5 search terms for the given job
  title; cache the result so re-runs with the same title don't re-call Claude
- [ ] **Business API calls** — fan out 3–5 Places Text Search calls in parallel (`Promise.all`);
  fire Place Details calls for results missing a phone number
- [ ] **Assemble + return** — deduplicate, sort by distance, return the full result array; also
  write the `coach_chats` row server-side so it's persisted even if the client closes first
- [ ] **Env vars** — `GOOGLE_PLACES_API_KEY` added to Vercel env; key restricted to Places API
  only; billing alert set at a low threshold

---

### J. Tax Onboarding Interview — AI-Guided Paystub Capture & Withholding Setup

*Crossover with **§20** (Tax Accuracy). Two ideas from the same brain-dump: (1) let a user
photograph/screenshot a paystub and have an AI model pull the tax figures instead of hand-typing
them into the existing Sharpen Rates modal; (2) once split fed/state exempt tracking exists
(§20.B) and the pre-account history gap is real (§20.C), route the whole tax setup through a
short, guided Coach conversation instead of a wall of form fields — the account-variable surface
(job start date, account creation date, exempt history, split fed/state gap) is too tangled for a
generic form to ask the right follow-up questions on its own.*

- [ ] **Paystub screenshot capture** — image upload (camera roll or live camera) attached to the
  existing Sharpen Rates flow (`IncomePanel.jsx`); replaces manually typing gross/fed$/state$ with
  "upload a photo of your paystub."
- [ ] **AI extraction call** — send the image to a vision-capable Claude model with a system
  prompt scoped to extracting exactly: gross pay (this period), federal income tax withheld,
  state income tax withheld, pay period end date. Return structured JSON; reject/flag anything
  that doesn't parse as a paystub rather than silently guessing.
- [ ] **Human-confirm step, never auto-apply** — extracted numbers pre-fill the *existing* Sharpen
  Rates fields (`sg1/sf1/ss1`, etc.) rather than writing straight to config — the user still sees
  and confirms the numbers before `applySharpener()` runs, same trust boundary as today's manual
  flow.
- [ ] **Backfill target for pre-account weeks** — per §20.C, let the uploader optionally target a
  specific past `weekIdx` (for a paystub predating `firstActiveIdx`'s confirmation window) instead
  of only ever setting the current rate going forward.
- [ ] **Guided tax setup interview** — once §20.B's split fed/state schema exists, a short Coach
  conversation (reuses §18.B's "Ask Coach" infra) walks a user through questions like "Is your
  federal withholding currently on or off? What about state — same or different?" / "When did
  that change?" / "Do you have a recent paystub to scan?" — replacing a dense settings form with a
  handful of short, punchy questions. **Exact question set deferred** — flagged by product as "to
  be identified later," don't invent the final script here.
- [ ] **Context injection** — this Coach mode needs the account-variable snapshot (job start
  date/`firstActiveIdx`, account `created_at`, current `taxedWeeksFed`/`taxedWeeksState`,
  `taxHistoryReliableFrom`) so its questions are actually informed by what the app already knows —
  same `lib/aiContext.js` serializer pattern as the rest of §18.
- [ ] **Same accountant gate as §20.D** — this entire flow is downstream of the split-tracking
  schema and the disclosure boundary; it cannot ship ahead of either, and the guided interview's
  question set/copy needs the same professional review before it goes live.

---

## 19. Master Timeline — Config History & Point-in-Time Computation Integrity

*Structural/data-model workstream, not yet scoped to a sprint. Seeded 2026-07-01 — placed
right after the AI section deliberately: once §18's Coach chat history (`coach_chats`) is
live, we may fold it into the same history table this section builds rather than giving it a
permanent table of its own. Still fuzzy on exact mechanics below — this section is the
structural map to de-fuzz it before implementation, not a locked spec.*

**Original brain-dump (verbatim, for provenance):**

> We need to orchestrate a master timeline tracking system for things like when a bill is
> altered so the annual estimation of the year doesn't change when a bill is updated in June.
> When the bill was created is when it should historically affect the yearly projections and
> what's left over. This is one example but I want to identify and button up the system flow
> for a master timeline of a user's fiscal financial year. This is especially needed at the
> very least on the user changing their hours schedule in case their routine pay period hours
> change during the year at their job.

### A. What already solves this (don't rebuild it)

Expenses already have exactly the point-in-time mechanism described above — **this problem is
solved for bills specifically**, and is the pattern to generalize, not replicate from scratch:

- [ ] Each expense carries `history: [{ effectiveFrom, weekly: [q1,q2,q3,q4] }]` (+ optional
  `monthlyOverrides` for a single-month exception). Editing a bill's amount appends a new
  history entry dated from today forward; it never rewrites past entries.
- [ ] `getEffectiveAmount(expense, weekEndDate, phaseIdx)` / `getEffectiveAmountForMonth(...)`
  (`src/lib/finance.js:633`, `:652`) walk the history array and pick the entry whose
  `effectiveFrom` is the latest one on-or-before the week/month in question. A June edit only
  changes weeks from June forward — Jan–May keep the old entry's amount.
- [ ] Documented in `docs/active-systems.md` §2 ("Expense Inline Editor + Pay Cycle Math").
- [ ] **Takeaway:** the new master-timeline system should either (a) generalize this exact
  `history[]` + `effectiveFrom` + resolver-function shape to other entities, or (b) replace it
  with the new history table and reimplement `getEffectiveAmount` as a thin wrapper over it —
  decide which during design; don't end up with two competing point-in-time mechanisms.

### B. Where the gap actually is (confirmed by reading the engine)

Pay structure / employment config has **no** equivalent mechanism. `config` is one flat object,
and both engine functions apply whatever is in it *uniformly to every week in the fiscal year,
including weeks that already happened*:

- [ ] **`buildYear(cfg)`** (`src/lib/finance.js:388`) loops every fiscal week (idx 0–~52) and
  computes `grossPay` for each one from the *current* `cfg.baseRate`, `cfg.shiftHours`,
  `cfg.diffRate`, `cfg.otThreshold`/`otMultiplier`, `cfg.standardWeeklyHours` /
  `maxWeeklyHours` / `customWeeklyHours`, `cfg.employerPreset` (DHL vs. base — this decides the
  *entire rotation-hours branch*), `cfg.dhlNightShift`/`nightDiffRate`, `cfg.k401Rate` /
  `k401MatchRate` — there is no per-week snapshot of what these values *were* at that point in
  the year. Change any of them today and every past week in `allWeeks` silently recomputes too.
- [ ] **`computeNet(w, cfg, ...)`** (`src/lib/finance.js:574`) layers on the same problem for
  tax: `cfg.fedRateLow/High`, `cfg.stateRateLow/High`, `cfg.ficaRate` are likewise applied to
  every week from today's config, not the config that was active when that week's paycheck
  actually happened.
- [ ] **Confirmed blast radius:** `ProfilePanel`'s Tax Plan tab sums `computeNet`/`buildYear`
  output across the *whole year* (`fedLiability`, `moLiability`, `fedWithheldBase`, `totalGap`,
  `targetExtraTotal`, etc. in `taxDerived`) — so a mid-year pay-structure edit doesn't just
  shift future projections (expected/correct), it silently distorts the *already-elapsed*
  portion of those annual totals too (not expected/correct). This is the concrete instance of
  the brain-dump's "annual estimation of the year" complaint.
- [ ] **A second instance of the same bug class, already in production:** `buildLoanHistory(loan)`
  (`src/lib/finance.js:1028`) regenerates a loan's *entire* weekly-payment history from
  `loanMeta` every time it runs (`src/lib/db.js` calls it on every `loadUserData`). Editing a
  loan's terms (payment amount, rate, payoff date) retroactively rewrites the loan's whole
  historical payment trace the same way a pay-structure edit rewrites `buildYear`. Same root
  cause, different entity — worth fixing in the same pass.
- [ ] **Lower-risk, still worth a decision:** `goals` (`{ id, target, completed, completedAt,
  ... }`, no `history` field at all) have zero versioning today. Goal timelines are
  forward-looking by nature (mostly benign), but "what was my goal target on date X" has no
  answer if we ever need it for audit/reporting.

### C. Existing ad hoc "history-shaped" patterns already in the codebase

Don't reinvent these — fold them into (or explicitly exclude them from) the new system on
purpose, rather than ending up with four uncoordinated partial mechanisms:

- [ ] **`config.pastWeekTaxStatusOverrides`** — a bare `{ [weekIdx]: taxed }` map bolted directly
  onto `config` (`constants/config.js:166`) letting a user retroactively correct one field
  (taxed/exempt) for a specific past week. Structurally, this *is* a point-in-time override —
  just implemented as a single-purpose hack instead of a row in a general history table.
- [ ] **`weekConfirmations`** — a per-week-idx record of what was *actually* worked
  (`dayToggles`, `scheduledDays`, `missedScheduledDays`, `pickupDays`, `netShiftDelta`),
  written once per week via `WeekConfirmModal`. Closest existing analog to a real per-week
  history row, but (a) only exists for weeks the user has explicitly confirmed, (b) is never
  consulted by `buildYear`/`computeNet` for the headline gross/net numbers described in §B —
  it's a schedule-actuals record, not a config-snapshot record.
- [ ] **`logs`** — the event log (`bonus`, `missed_unpaid`, `pto`, etc., see `EVENT_TYPES` in
  `constants/config.js`) is already a discrete, point-in-time financial ledger keyed to a
  week/date, computed via `calcEventImpact`. Effectively a narrow "histories" table already —
  just stored as a JSONB array on `user_data` instead of a foreign-keyed child table.

### D. Proposed shape (still fuzzy — resolve via design pass before building)

The user-facing goal: the **active** `user_data` row stays exactly what it is today (current
config, current expenses, current goals, current logs — no schema change to the hot path), and
every historically-trackable *change* becomes a row in a new child table, foreign-keyed to the
account:

```sql
create table account_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references user_data(user_id),
  entity_type   text not null,       -- 'config' | 'pay_structure' | 'expense' | 'loan' | 'goal' | (future) 'coach_chat'
  entity_id     text,                -- expense/goal/loan id when entity_type scopes to one record; null = whole-config snapshot
  field_snapshot jsonb not null,     -- the superseded value(s)
  effective_from date not null,      -- when the OLD value(s) stopped applying / new value takes over
  changed_at    timestamptz not null default now(),
  source        text,                -- 'setup_wizard' | 'life_event:structure_change' | 'profile_pay_edit' | 'expense_edit' | ...
  created_at    timestamptz not null default now()
);
create index account_history_user_id_effective_from on account_history (user_id, effective_from desc);
```

- [ ] **Write path** — before any historically-sensitive field changes (wizard `onComplete`,
  `ProfilePanel` Pay Structure section saves, expense/loan edits, goal edits), insert a snapshot
  row capturing the *old* value(s) + the `effective_from` boundary — mirroring exactly what
  `expense.history` already does per-expense (§A), generalized to any entity/field.
- [ ] **Read path (can ship later, per user's own "connect it on edge case testing" framing)** —
  a "resolve config as of week N" function analogous to `getEffectiveAmount`, which
  `buildYear`/`computeNet` would call instead of reading the flat live `cfg` directly for weeks
  that fall before the most recent relevant `account_history` boundary. **This does not need to
  ship in the same pass as the write path** — capturing history correctly first, then wiring
  the engine to actually consult it for past weeks, is an explicit two-phase plan (see F).

### D2. Resolved decisions (2026-07-06 design discussion)

- **Snapshot shape — full new-value config snapshot per change**, not field-level diffs of
  superseded values (revises §D's `field_snapshot` sketch). "Config as of week N" then resolves
  with the exact `getEffectiveAmount` algorithm: latest row with `effective_from ≤ N`. A
  `changed_fields TEXT[]` column rides along for UI/diff display only — never load-bearing for
  resolution.
- **Storage — the `account_history` child table**, not a JSONB array on `user_data`: keeps the
  hot-path row from growing forever, stays queryable for admin diagnostics, and is the landing
  zone for the possible §18.H `coach_chats` fold-in. Rows load once at sign-in alongside
  `loadUserData`; the resolver runs fully in memory — the engine never touches the network.
- **Write path — one `commitConfigChange(oldConfig, newConfig, source, effectiveFrom?)` choke
  point**, not a wrapper around `saveConfigNow` alone: config also persists via the 800ms
  debounced autosave path in `App.jsx`, so wrapping only the immediate-save path would silently
  miss changes that flow through the debounce. The helper diffs old vs. new against the
  whitelist below, inserts a history row only when a whitelisted field actually changed, then
  persists as normal.
- **`effective_from` semantics** — stored as a **date**, never a week idx (idx is
  fiscal-year-relative and breaks across year boundaries; derive idx at read time). Defaults to
  **today** for plain ProfilePanel edits; only the wizard-driven flows (§15.B structure change,
  §15.D Quick Rate Update) pass an explicit effective/change date — no effective-date prompt on
  quick edits.
- **Backfill — clean start + seed row**: at rollout, insert one snapshot per existing account
  (current config, `effective_from` = rollout date, `source: 'rollout_seed'`) so the resolver
  always has a floor entry — no "fall back to live config" special case for pre-history weeks.
- **§C mechanisms stay as-is** — `pastWeekTaxStatusOverrides`, `weekConfirmations`, and `logs`
  are records of actuals / per-week corrections, not config versions; they are not folded in.
  Expense `history[]` also stays untouched in v1 — converging later is a cheap refactor once
  `account_history` has proven itself.
- **Loans** — a real, shipped second instance of the bug class (§B), but the cheap fix is giving
  loans their own expense-style `history[]`; scoped as a separate follow-up, not wired into
  `account_history` v1.
- **Schema drift tolerance** — snapshots capture whatever config shape existed at write time
  (e.g. pre-§20 rows won't have `taxedWeeksFed/State`); the read-path resolver must spread each
  snapshot over `DEFAULT_CONFIG` before use, same as loads already do.

**Historically-sensitive field whitelist (v1)** — `commitConfigChange` records a snapshot when
any of these change. Everything else in config (UI prefs, dismissal state, `goalTimelineEpochIdx`,
investor display fields) is noise and must **not** trigger a row:

- **Pay structure:** `baseRate`, `annualSalary`, `shiftHours`, `diffRate`, `nightDiffRate`,
  `nightDiffEnabled`, `otThreshold`, `otMultiplier`, `commissionMonthly`
- **Schedule:** `maxWeeklyHours`, `customWeeklyHours`, `customWeeklyHoursLong/Short`,
  `scheduleIsVariable`, `userPaySchedule`, `payPeriodEndDay`, `biweeklyPayWeekParity`,
  `startDate` / `firstActiveIdx`
- **Employer identity:** `employerPreset` (a DHL↔base flip swaps the entire `buildYear` branch —
  the single highest-blast-radius change there is), plus the `dhl*` fields and
  `startingWeekIsLong`
- **Tax:** `fedRateLow/High`, `stateRateLow/High`, `taxRatesEstimated`, `ficaRate`,
  `fedStdDeduction`, `filingStatus`, `userState`, `targetOwedAtFiling`, `taxedWeeks`,
  `taxExemptOptIn`
- **Deductions / benefits:** `selectedBenefits`, every per-check premium field (`healthPremium`,
  `dentalPremium`, `visionPremium`, `ltd`, `stdWeekly`, `lifePremium`, `hsaWeekly`, `fsaWeekly`),
  `otherDeductions`, `k401Rate`, `k401MatchRate`, `k401StartDate`, `benefitsStartDate`
- **Attendance / PTO / bucket:** `attendanceBucketEnabled`, `attendanceWarnThreshold`,
  `attendanceTerminateThreshold`, `attendanceIncrement`, `ptoEnabled`, `ptoAccrualMethod`,
  `ptoAccrualRate`, `ptoCap`, `bucketStartBalance`, `bucketCap`, `bucketPayoutRate`
- **Buffer / risk posture:** `bufferEnabled`, `paycheckBuffer` — cheap to keep, and a genuine
  risk-tolerance signal for Coach
- **Job loss (fields already live in `DEFAULT_CONFIG` today):** `jobLossMode`, `jobLossDate`,
  `unemploymentEnabled/Weekly/DurationWeeks/WaitingWeek`, `returnToWorkDate`,
  `targetIncomeAnnual`, `startedUnemployed` — (`jobApplications` deliberately excluded; it's
  already its own append-only log)

<!-- ── FUTURE HISTORICALLY-SENSITIVE FIELDS — no schema yet, do not implement ─────────────
Parked 2026-07-06. These become whitelist entries (or their own entity_type rows) once the
features that create them ship and their field names / data types actually exist. Kept as a
comment so the v1 whitelist stays honest about what exists in the codebase today.

Employer identity (beyond presets):
- Free-text employer name / employer history as users list actual employers over time — today
  the ONLY employer identity in config is `employerPreset` ("DHL" | null); there is no name
  field. When the §21.D preset marketplace or any "who do you work for" field lands, each
  employer change is both a history boundary and prime Coach context ("you've been at [X] for
  14 months; your last move came with a $2.10 raise").

Job Loss Mode outputs still unbuilt (§15.C):
- Per-expense triage stances (`jobLossStatus: active | paused | cancelled`) — snapshot each
  triage decision; "what did this user protect first when income stopped" is the single
  strongest signal of their real priorities Coach will ever get.
- Auto-reactivate elections, state benefit-estimator inputs — names/types TBD with §15.C.

§20 split-tax fields (blocked on the accountant gate):
- `taxedWeeksFed` / `taxedWeeksState` + the split per-week overrides — replace `taxedWeeks` in
  the whitelist wholesale when the schema splits. Exempt-status changes per lane are exactly
  the "separate independent timeline" §20.B requires — account_history can carry that timeline
  for free.

Coach/AI-context candidates (decide alongside §18, not before):
- Life-event occurrences themselves — which flow fired and when; the `source` column already
  encodes this per row ('life_event:lost_job', 'setup_wizard', …), so this may be a read-out
  of existing data rather than new capture. A user's sequence of life events is the
  highest-value personalization signal Coach can have.
- Goal target / due-date revisions (§B's "lower-risk" note) — ambition vs. follow-through
  patterns; would land as entity_type: 'goal' rows rather than config snapshots.
- Attendance/PTO *balances* over time as job-quality signals (the policy fields are already
  whitelisted above; balance trajectories are a different, noisier thing — decide with §18).

Privacy rail: anything captured here that feeds Coach context inherits §21.E's rules —
confidence labeling, the human-confirm boundary for AI writes, and (if ever used for model
training or cross-user aggregates) explicit opt-in per §21.D's benchmark privacy rules.
History rows are per-user data under the same RLS as every other table; capture is not a
license to train.
──────────────────────────────────────────────────────────────────────────────────────── -->

### E. Open questions to resolve before writing the migration

- [x] **Snapshot granularity** — resolved 2026-07-06: full **new-value** whole-config snapshot
  per change (see §D2); field-level diffs rejected as harder to reconstruct from.
- [x] **Which fields are actually in scope** — resolved 2026-07-06: the v1 whitelist in §D2,
  plus the commented-out future-fields block beneath it (employer identity, §15.C job-loss
  outputs, §20 split-tax fields, Coach/AI candidates). Expense billing amounts stay covered by
  the existing mechanism (§A); loan terms are a separate expense-style `history[]` follow-up.
- [x] **Backfill or clean start?** — resolved 2026-07-06: clean start plus one `rollout_seed`
  snapshot per existing account so the resolver always has a floor entry (§D2).
- [x] **Fold in or leave alone** — resolved 2026-07-06: leave alone. `pastWeekTaxStatusOverrides`
  / `weekConfirmations` / `logs` are actuals/corrections, not config versions; they stay as
  their own columns and only new config-history is added alongside them (§D2).
- [ ] **AI chat history hook (flagged explicitly by product)** — once §18.H's `coach_chats`
  table ships, evaluate folding it into `account_history` as `entity_type: 'coach_chat'`
  instead of keeping its own table. Don't block this section on that decision — §18 needs to
  ship first.

### F. Suggested first implementation slice

*Deliberately small — a proof of the write path, not the full system.*

- [x] **Migration** — `database/migrations/020_add_account_history.sql`: table per §D's sketch
  as revised by §D2 (new-value `snapshot` + `changed_fields TEXT[]`), RLS own-row
  select/insert only — **append-only from the client**: no update/delete policies exist and
  those privileges are revoked outright, so history can never be rewritten after the fact —
  plus the per-account `rollout_seed` snapshot. **Run in Supabase (confirmed 2026-07-07)** —
  the seed snapshot has landed for every existing account.
- [x] **One integration point** — implemented as a **config-transition watcher** in `App.jsx`
  (a `useEffect` diffing `prevConfigRef` vs. `config` via
  `diffSensitiveFields` from the new `src/lib/configHistory.js`, inserting via
  `saveConfigSnapshot` in `db.js`) rather than the literal `commitConfigChange` wrapper —
  strictly stronger than call-site routing: **no** `setConfig` site or save path (immediate
  or debounced) can bypass capture. Attributed flows tag `source`/`effectiveFrom` through
  `configHistoryMetaRef` just before their `setConfig`: `setup_wizard` /
  `life_event:<x>` (wizard, passes `startDate` as the explicit effective date),
  `life_event:lost_job` (JobLossEntry, passes `jobLossDate`), `profile_edit`
  (`saveConfigNow`), `force_pull` (admin pull, so drift re-adoption isn't logged as an edit);
  everything untagged records as `config_edit` effective today (real wall clock, never the
  admin Lock Date). Investor sandbox accounts are exempt, matching §17.G's precedent.
- [x] **Admin verification surface** — DB Row Viewer (all three render spots) now shows
  "config history: N snapshots · latest [date] ([source]) · [changed fields]" after Fetch.
  Migration 020 is confirmed run (2026-07-07), so this should read real counts, not the
  error string — worth a live Fetch to double-check on the next admin pass.
- **§17.I interaction (noted on merge, 2026-07-06):** the non-payment deletion cron
  hard-deletes the `user_data` row, and `account_history`'s FK cascades with it — the
  `deleted_accounts` tombstone does **not** archive history rows, so a revived account
  restarts with fresh history (its new floor entry is its first whitelisted edit, typically
  the wizard-complete snapshot — same as any post-rollout signup, which never gets a
  `rollout_seed` row either). Intentional: deleted account = deleted history is the right
  privacy posture; revisit only if the future read path needs pre-deletion history restored.
- [x] **Tests** — 26 new: `configHistory.test.js` (whitelist↔`DEFAULT_CONFIG` drift guard, no
  duplicates, noise-field exclusions, scalar/array/object diffs, undefined≡null tolerance) +
  `db.test.js` additions (insert shape, missing-table tolerance, meta fetch paths). 890 total
  passing; lint diff-clean vs. baseline; production build green.
- [ ] **Verify live once deployed** — run migration 020 in Supabase, then from the deployed
  app: make a pay-rate edit in ProfilePanel and confirm DB Row → Fetch shows
  "config history: 2 snapshots" (seed + edit) with `baseRate` in the changed fields.
- [ ] **Explicitly defer** — the `buildYear`/`computeNet` read-path rewrite (§D's "read path")
  is its own follow-up task once the write path has real data to test against, and the loan
  `history[]` fix is its own separate follow-up (§D2). Don't try to land any of these in the
  same PR as the write path.

---

## 15. Life Events Feature

*Life events are moments that fundamentally change a user's financial picture. The app should
meet users there — not just re-run the setup wizard, but offer purpose-built flows that understand
the emotional and practical weight of what just happened.*

**Existing infrastructure:** `SetupWizard` already accepts a `lifeEvent` prop (`"lost_job"` |
`"changed_jobs"` | `"commission_job"`). `App.jsx` has a `lifeEventMenu` dropdown that routes into
the wizard. These are the trigger points we extend — not replace.

---

### A. Entry Point & Life Event Menu

- [ ] **Upgrade the life event menu UI** — the current drawer/mobile dropdown is a plain list; give
  it weight that matches the gravity of these moments.
  - [ ] Replace inline dropdown with a bottom sheet modal (mobile) / centered card modal (desktop)
  - [ ] Two primary tiles: **"Pay Structure Changed"** and **"Lost My Job"** — large, distinct,
    icon-forward; not a text list
  - [ ] Each tile shows a one-line description of what the flow covers
  - [ ] Add a third tile: **"Quick Rate Update"** — for a raise or rate change with no structural
    change (just new `baseRate` + optional new start week; no wizard needed, single modal)
  - [ ] Preserve existing `wizardEntry` / `setWizardEntry` wiring in App.jsx — route each tile to
    the appropriate flow

---

### B. Pay Structure Change → Structure Overwrite Wizard

*Triggered by "Pay Structure Changed" tile. Covers promotion to salary, new employer, hourly→salary
switch, commission add-on. Reuses SetupWizard steps but skips goals/expenses/logs — those carry
forward untouched.*

- [ ] **Define "structure overwrite" life event type** — add `"structure_change"` to `LIFE_EVENTS`
  in SetupWizard.jsx; route it through steps 0 (brief re-entry screen), 1 (Pay Structure),
  2 (Schedule), 3 (Deductions — skippable), 4 (Tax Rates), 7 (Wrap Up)
- [ ] **Pre-fill from current config** — all wizard fields should open with existing values so the
  user only edits what actually changed (rate, pay period, employer, etc.)
- [ ] **Change-date anchor** — Step 2 start date becomes the "effective date" of the change;
  `firstActiveIdx` is set from this date; weeks before it keep the old income math in history
- [ ] **Change summary screen** — before `onComplete`, show a diff of key fields that changed
  (old rate → new rate, old schedule → new schedule, old employer → new); require explicit confirm
- [ ] **Employer preset change handling** — if user switches from base to DHL (or vice versa),
  apply full preset defaults and show a callout explaining what was auto-set
- [ ] **Preserve all history** — goals, expenses, logs, week confirmations before the change date
  are never touched; only forward-looking finance math recalculates

---

### C. Job Loss Mode

*Triggered by "Lost My Job" tile. Enters a dedicated mode that transforms the app's forward
projections to reflect $0 earned income and surfaces tools to manage the gap.*

#### C1. Job Loss Mode State & Entry/Exit

- [ ] **`jobLossMode` config flag** — boolean stored in config/Supabase; when true, alters how
  `buildYear` and `computeNet` handle future weeks (earned income = $0 from `jobLossDate` forward)
- [ ] **Job loss date** — stored as `config.jobLossDate`; weeks on/after this index get $0 gross
  from employment; unemployment income (if configured) replaces it as a separate income line
- [ ] **"Back to work" exit flow** — prominent button in Job Loss Dashboard; triggers the
  Structure Overwrite Wizard pre-loaded with previous pay config as a starting point; clears
  `jobLossMode` and `jobLossDate` on completion
- [ ] **App shell indicator** — subtle persistent banner or status pill when `jobLossMode` is
  active so the user always knows projections are in loss mode; dismissible but re-shows on reload

#### C2. Unemployment Benefits

- [ ] **Unemployment section in Job Loss Dashboard** — collapsible card
  - [ ] "Did you file for unemployment?" Y/N gate
  - [ ] If yes: weekly benefit amount (manual entry), benefit duration in weeks, waiting week
    toggle (first week unpaid in most states)
  - [ ] Wire benefit amount into forward week net calculations as a non-taxed income line
    (unemployment is federally taxable but withholding is optional — flag this with a note)
  - [ ] Benefit expiration: show a "benefits run out on [date]" warning when duration is set
  - [ ] Future: state-specific benefit estimator — pre-fill estimated weekly benefit based on
    `config.userState` + prior `baseRate` using each state's benefit formula

#### C3. Expense Triage

*Every loaded expense gets an individual stance: keep it, pause it, or cancel it. Paused expenses
leave the record intact but drop out of projections until reactivated.*

- [ ] **Per-expense triage status** — add `jobLossStatus: "active" | "paused" | "cancelled"` to
  each expense object; default `"active"`; persisted to Supabase
- [ ] **Triage UI** — dedicated sheet in Job Loss Dashboard listing all expenses with:
  - [ ] Expense name, category icon, monthly amount
  - [ ] Next due-date countdown ("due in 12 days") derived from expense billing day or history
  - [ ] Three-state toggle: Active / Paused / Cancelled per expense
  - [ ] Auto-priority badge: **Essential** (Rent, Utilities, Food, Insurance) vs. **Flexible**
    (Subscriptions, Entertainment) based on existing expense category
  - [ ] "Pause all Flexible" bulk action button
- [ ] **Projection impact** — paused and cancelled expenses are excluded from `computeNet` forward
  weeks while `jobLossMode` is active; reactivate on "Back to work"
- [ ] **"Auto-reactivate on income resume"** toggle per expense — resets `jobLossStatus` to
  `"active"` when the user exits Job Loss Mode via the Back to Work flow

#### C4. Runway Calculator

*The single most important number during job loss: how long can you survive.*

- [ ] **Runway metric** — headline card in Job Loss Dashboard: **"X days of runway"** computed as:
  `(bufferBalance + projectedUnemploymentTotal) / weeklyEssentialBurn × 7`
- [ ] **Weekly burn rate** — sum of all `"active"` essential expenses per week; updates live as
  user pauses/cancels expenses in triage
- [ ] **Runway cliff date** — calendar date when runway reaches zero at current burn rate; shown
  as "Runway ends: [Month Day]" in amber/red depending on proximity
- [ ] **Savings input** — if buffer balance doesn't capture full savings, allow a one-time
  "additional savings" override field for the runway calculation only (not persisted to main config)
- [ ] **Scenario toggle** — "With unemployment" vs. "Without unemployment" runway comparison;
  shows both numbers side by side when benefits are configured

#### C5. Bill Deadline Countdowns

- [ ] **Due-date countdown tiles** — for any expense with a known billing day, surface a
  countdown tile: "Rent due in 8 days — $1,200"
- [ ] **30 / 14 / 7-day alert tiers** — tile border/status color shifts gold at 14 days, red at 7
- [ ] **"Needs coverage" flag** — if due date falls before projected unemployment first payment,
  mark as needing immediate coverage; surfaces at top of triage list

#### C6. Re-employment Tracker (basic)

- [ ] **Target income goal** — pre-filled from `config.baseRate × maxWeeklyHours × 52`;
  user can adjust; shown as "target annual" and "target weekly net" using current tax config
- [ ] **Expected return-to-work date** — date input; when set, projects income resuming from that
  week in the Income panel's forward timeline
- [ ] **Application log** — simple list stored in Supabase:
  - [ ] Fields: company, role title, date applied, status (Applied / Screening / Interview /
    Offer / Rejected / Withdrawn)
  - [ ] Add / edit / delete entries inline
  - [ ] Status badge colors: gray (Applied), gold (Screening/Interview), green (Offer), red
    (Rejected)
  - [ ] Count summary: "X active, Y offers" shown in dashboard header

---

### D. Quick Rate Update (non-structural raise)

*For when the pay structure stays the same but the rate changed — shouldn't require a full wizard.*

- [ ] **Rate update modal** — single screen: new base rate input + effective date + optional note
- [ ] **Effective-date handling** — same `firstActiveIdx` logic as structure overwrite, applied
  only to `baseRate`; all other config fields unchanged
- [ ] **Confirmation diff** — shows old rate → new rate + estimated weekly net delta before saving

---

### E. Future — AI Job Hunt Assistant *(Phase 3)*

*Consolidated into §18.E. Requires Job Loss Mode (§15.C) to be live first.*

---

### F. Future — Job Board API Integrations *(Phase 4)*

- [ ] **Job search integration** — in-app job listing browser; sources TBD (Indeed/LinkedIn/
  ZipRecruiter APIs or aggregator); pre-seeded search from stored job title + `config.userState`
- [ ] **Salary filter by target** — filter listings by salary range anchored to target income goal
- [ ] **One-click application tracking** — "Save to tracker" button on any listing → auto-creates
  an entry in the Re-employment Tracker (C6) with company, role, and date pre-filled
- [ ] **Application assistant** — for saved listings, "Draft application" launches Coach
  pre-loaded with the specific job description for cover letter / prep mode → **§18.F**
- [ ] **Profile store for auto-fill** — stored work history summary, skills list, and resume text
  (user-entered) used to pre-fill application fields and feed the AI assistant context

---

### G. Future — Expanded Life Event Types *(Phase 3+)*

- [ ] **Medical / disability leave** — partial income mode: STD/LTD benefit amount + duration;
  expense triage carries over from Job Loss Mode infrastructure; leave end date projects income
  resuming
- [ ] **Promotion / raise (in-place)** — alias for Quick Rate Update (D) with a celebratory
  entry point; optionally prompts review of 401k contribution rate
- [ ] **Marriage / filing status change** — triggers filing status update (Single → MFJ), prompts
  review of standard deduction and combined income picture; out of scope for solo-income v1
- [ ] **New dependent** — prompts childcare expense add, dependent care FSA consideration, and
  filing status review (HOH path)
- [ ] **Side hustle / gig income** — add a secondary income stream with its own rate and schedule;
  quarterly estimated tax calculation for self-employment income (SE tax + federal/state)

---

### H. Jobless Onboarding Path *(seeded 2026-05-15)*

*A new first-run wizard question — "Are you currently unemployed?" — was planted in Step 0.
Today both Yes and No route through the standard pay-structure steps (DHL question next),
and the answer is stored on `config.startedUnemployed`. The plan below builds that seed into
a true branched onboarding so jobless users land in a usable app from day one.*

#### H1. Branched Step 0 routing

- [ ] **Persist `startedUnemployed` to Supabase** — confirm it round-trips on reload and add
  an explicit projection in `loadUserData` / `saveUserData` if it doesn't
- [ ] **Wizard routing** — when `startedUnemployed === true`:
  - [ ] Skip Step 1 (Pay Structure), Step 2 (Schedule), Step 3 (Deductions), Step 4 (Tax Rates)
  - [ ] Route directly into a new "Jobless Setup" mini-flow (H2)
- [ ] **Re-entry guard** — `startedUnemployed === true` users who later run Life Events get
  full access to the structure_change wizard; that's how they first fill in pay-structure
  fields when they exit Job Loss Mode (see H4)

#### H2. Jobless Setup mini-flow

- [ ] **Step 0a — Confirm unemployment benefits Y/N**
- [ ] **Step 0b — If Yes** — weekly amount, duration in weeks, waiting-week toggle
- [ ] **Step 0c — Stand-in `jobLossDate`** — default to today; allow override
- [ ] **Step 0d — Optional prior pay context** — prior employer name + prior base rate,
  used as the default Target Income in the re-employment tracker (§15.C6)
- [ ] **Step 0e — Wrap Up** — confirm and finish

#### H3. Wizard completion path for jobless users

- [ ] **`onComplete` payload** — sets `jobLossMode: true`, `jobLossDate`, and all four
  unemployment fields; marks `setupComplete: true`
- [ ] **Land on Job Loss Dashboard** — first paint goes to the Job Loss Dashboard view (§15.C4)
  for as long as `jobLossMode` is true
- [ ] **Skip default Food expense seeding** — defer expense seeding to the user's first triage
  pass (§15.C3)

#### H4. "Back to Work" exit for users who started jobless

- [ ] **First-time pay-structure wizard** — Back to Work runs the FULL pay-structure wizard
  (steps 1–4 + Wrap Up) since they never filled it in
- [ ] **Diff view degrades gracefully** — "What's Changing" diff renders an empty-state message
  when there's no prior config to compare against
- [ ] **Clear `startedUnemployed` on success** — flag reset so future Life Events flows behave
  normally

#### H5. App shell signals

- [ ] **Banner copy** — when `jobLossMode && startedUnemployed`, banner reads "Started in Job
  Loss Mode — no prior pay history"
- [ ] **"Set up essential expenses" prompt** — first-paint Job Loss Dashboard tile that routes
  into the triage list (§15.C3) so expenses are populated before they're needed

---

### I. Admin Toolkit updates for §15 work

- [ ] **Live State Inspector — Job Loss Mode pill**
  - [ ] Amber pill when `config.jobLossMode === true`
  - [ ] Add three values: `jobLossDate`, `unemploymentWeekly`, `unemploymentRemainingWeeks`
- [ ] **Week Inspector — unemployment income row**
  - [ ] When `w.unemploymentIncome > 0`, show "Unemployment" line in Pay section
  - [ ] When `inJobLoss && w.unemploymentIncome === 0`, surface "Job Loss Mode — outside benefit window"
- [ ] **DB Row Viewer — expense triage summary**
  - [ ] One-liner: "Triage: X active · Y paused · Z cancelled"
  - [ ] Flag any expense where `autoReactivateOnIncome === false`
- [ ] **Config Raw View — Life Events header**
  - [ ] Short header above JSON listing only §15-relevant fields with values
- [ ] **CLAUDE.md update**
  - [ ] Append Job Loss state to "Diagnostic request templates"
  - [ ] Document per-week `unemploymentIncome` annotation on `buildYear` output

---

### J. Visual Testing Checklist — foundation phase (§15.A–C5 + H seed)

*Manual smoke pass. Run before merging the foundation phase branch.*

#### Entry points
- [ ] Life Events trigger opens modal with three tiles: Pay Structure Changed, Lost My Job,
  Quick Rate Update (Coming Soon, disabled)
- [ ] Backdrop click and Escape close the modal

#### Setup wizard seed (§15.H)
- [ ] Step 0 shows "Are you currently unemployed?" Y/N pills; Next disabled until answered
- [ ] Re-entry flows skip the Y/N question entirely

#### Pay Structure Changed wizard (§15.B)
- [ ] Wizard opens in `structure_change` mode; Step 0 shows brief overview
- [ ] All wizard fields pre-fill from existing config
- [ ] DHL ↔ Base toggle surfaces accent callout explaining preset defaults
- [ ] Wrap Up shows "What's Changing" diff card; final button reads "Confirm Changes"
- [ ] Goals, expenses, and logs unchanged after completion

#### Job Loss entry (§15.C1 + C2)
- [ ] Lost My Job tile opens the JobLossEntry modal (not the wizard)
- [ ] Y/N "Are you getting unemployment benefits?" required to enable Activate
- [ ] Choosing Yes reveals weekly amount, duration weeks, waiting-week toggle
- [ ] Activate flips the engine — projected weekly income drops to $0 from the date forward

#### Job Loss banner
- [ ] Amber banner at top of every panel when in Job Loss Mode
- [ ] Reads "Projections show $0 earned income from [date] forward"
- [ ] When duration is set, appends "Unemployment runs out on [date]"
- [ ] Triage Expenses and Back to Work buttons functional; Dismiss hides + reload restores

#### Job Loss Dashboard runway tile (§15.C4)
- [ ] Three headline numbers: Runway days, Runway ends date, Weekly burn
- [ ] Color: red ≤ 30 days, amber ≤ 90, green otherwise
- [ ] "Current savings" input updates runway live (not persisted on reload)
- [ ] Scenario toggle visible only when benefits configured

#### Expense Triage sheet (§15.C3 + C5)
- [ ] Essential rows above Flexible; three-state toggle per row
- [ ] Pausing drops weekly burn and BudgetPanel weekly spend immediately
- [ ] "Pause all Flexible (N)" visible only when ≥1 active Lifestyle row
- [ ] Bills due before first unemployment payment land at top with Needs Coverage badge

#### Back to Work exit
- [ ] Resets banner, runway tile, triage filtering
- [ ] Auto-reactivate=true expenses flip back to Active; unchecked ones stay Paused/Cancelled
- [ ] Lands in structure_change wizard pre-filled with prior pay config

---

## 20. Tax Accuracy — Split Withholding, Paystub Capture & Pre-Account History Gap

*Seeded 2026-07-02 from two brain-dump excerpts (verbatim below). Consolidates the
`taxExemptOptIn` item that previously sat alone under **Deferred** with two new, closely related
problems — all three share the same accountant-sign-off gate, so they're tracked together instead
of scattered. Crossover with **§18.J** for the AI-guided capture/interview half of this work.*

**Original brain-dump excerpts (verbatim, for provenance):**

> For the specific input paystub feature to understand taxes, exactly off the rip I'm thinking
> that a screenshot image uploader would be a quick and easy way and if we have to use something,
> that's an AI tool to analyze the screenshot. Pull out the specifics for the tax numbers on the
> paystub screenshot or picture from Phone that's what we will do. We need to finish flushing out
> the paystub input for users who want to input their paystub to separate out their taxes. The
> pre-work was it featured to this is being able to separate state and federal taxes when it comes
> to turning exempt math on and off because sometimes you might just turn federal off and leave
> state on and vice versa. This math needs to be understood as separate, so it can be tracked
> separate on an independent timeline so when it comes to what extra money to withhold the user can
> actually see a down to the nearest dollar math number for what to withhold extra when they go to
> fix and catch up their tax debt.

> Problem case with the tax feature. If a user creates their account and their start date dates
> previous to the account start date, and their taxes have been exempt since a previous date, there
> is no true way to account for extra days picked up outside of the users normal schedule for any
> paychecks received before account creation — besides going through a million weekly check-in
> models and having every little bit of overtime or missed day in memory, which is not feasible.
> This is vitally important because for the user to be able to trust our extra withholding math for
> when they eventually turn taxes back on, this has to be articulated. This will go hand-in-hand
> with the paystub-uploading feature, but truly will need to be gated with a message clarifying
> that extra withholding can only read from account creation day on, as long as they log their
> money gained / money lost correctly. This is tricky — the tax feature should almost mandatorily
> go through an AI chat where the agent gets past all the user's account variables and asks a series
> of short, punchy questions (to be identified later). This must be figured out before release to
> the general public, and needs a real tax accountant to audit and poke holes in it.

### A. What already exists (don't rebuild it)

- [ ] **Sharpen Rates modal** (`IncomePanel.jsx` — `showSharpener` state, `applySharpener()`) is
  already a manual paystub-input flow: the user types gross pay + fed tax withheld + state tax
  withheld from a real paystub (`sg1/sf1/ss1`, plus a second pair `sg2/sf2/ss2` when
  `scheduleIsVariable`), and it derives `fedRateLow/High` + `stateRateLow/High` as percentages
  (`sharpenDr(gross, withheld) = withheld / gross`). This is the exact "pre-work" the first
  excerpt references — the screenshot/AI uploader (§18.J) should feed this same pipeline (gross +
  fed$ + state$ → rate) rather than inventing a parallel one.
- [ ] **Fed/state gap math is already split internally, just not surfaced separately** —
  `taxDerived` in `App.jsx` (~line 741) computes `fedGap` (`fG`) and the state gap (`mG`) as two
  separate numbers before summing them into `totalGap` (`tG`) and dividing into one blended
  `extraPerCheck`. The separate-timeline number the first excerpt wants is one field away from
  existing — the gap is presentation/schema, not a missing computation.
- [ ] **The taxed/exempt flag is one boolean per week, not two** — `config.taxedWeeks` (flat array
  of week indices, `constants/config.js:163`) and `config.pastWeekTaxStatusOverrides`
  (`{ [weekIdx]: boolean }`, `constants/config.js:166`) both store a single taxed/exempt state per
  week. There is no `taxedWeeksFed` vs. `taxedWeeksState` split today — turning federal exempt off
  while leaving state on (or vice versa) is not representable in the current schema at all. This
  is the actual blocker behind excerpt 1, not just a UI gap.
- [ ] **`taxExemptOptIn`** (`constants/config.js:15`) — stored in config, disclaimer copy exists,
  but nothing reads it yet in `App.jsx` or `IncomePanel` (the original **Deferred** item, folded
  in here). No action until §D's accountant gate clears.

### B. Excerpt 1 — Split federal/state exempt tracking + down-to-the-dollar extra withholding

- [ ] **Schema change** — split `taxedWeeks` into `taxedWeeksFed` / `taxedWeeksState` (or an
  equivalent per-week `{ fed: boolean, state: boolean }` shape); mirror the same split for
  `pastWeekTaxStatusOverrides`. `w.taxedBySchedule` (computed per week in `buildYear`) becomes two
  flags: `w.taxedByScheduleFed` / `w.taxedByScheduleState`.
- [ ] **Engine split** — `taxDerived` already computes `fG`/`mG` separately (§A); stop collapsing
  them into one `tG`/`extraPerCheck`. Expose `targetExtraFedPerCheck` and
  `targetExtraStatePerCheck` (each `Math.max(gap − target, 0) / remainingTaxedChecksForThatTax`)
  so the two timelines are independently trackable, per the excerpt's "separate independent
  timeline" requirement.
- [ ] **UI** — Tax Weeks Grid (admin) and any user-facing exempt toggle need two lanes (fed row +
  state row) instead of one cell per week; ProfilePanel's Tax Plan tab shows fed extra/check and
  state extra/check as two line items, not one blended number.
- [ ] **Rounding to the dollar** — `targetExtraFedPerCheck`/`targetExtraStatePerCheck` should
  round consistently (nearest cent for storage, nearest dollar for the user-facing "withhold an
  extra $X" instruction) — confirm the rounding direction with the accountant audit (§D); under-
  rounding compounds into a real shortfall over dozens of checks.

### C. Excerpt 2 — Pre-account-creation history gap for extra-withholding math

- [ ] **Confirm the exact blast radius** — `taxDerived` sums over every `w` in
  `allWeeks.filter(w => w.active)`, and `active = idx >= cfg.firstActiveIdx`. `firstActiveIdx` is
  derived from the *job start date* entered in the wizard, which can be — and often is — earlier
  than the Supabase account's `created_at`. `weekConfirmations` (the only record of *actual*
  worked/missed days, written by `WeekConfirmModal`) only exists for weeks the user has explicitly
  confirmed going forward from signup. Every week between `firstActiveIdx` and account creation is
  therefore counted in the fed/state gap totals using pure *scheduled* math (`w.taxedBySchedule`,
  scheduled hours), with zero ability to reflect real overtime, missed days, or pickups that
  actually happened before the app existed for that user.
- [ ] **Not fixable by more manual entry** — per the excerpt, requiring the user to reconstruct
  every pre-signup week via the weekly check-in modal is explicitly called out as infeasible. The
  fix has to be a boundary/disclosure, not a backfill UI.
- [ ] **Gating boundary field** — introduce `config.taxHistoryReliableFrom` (the *later* of account
  `created_at` or `firstActiveIdx`, since reliable actuals can't predate either), marking the
  earliest week the extra-withholding math can actually stand behind.
- [ ] **Disclosure copy — mandatory, not optional** — anywhere the app shows a fed/state "withhold
  an extra $X per check" number, if any part of the taxed-week window includes weeks before
  `taxHistoryReliableFrom`, show a clear caveat, e.g.: *"This estimate assumes your scheduled hours
  were worked exactly as planned for weeks before [date] — log any overtime or missed days from
  that period for a more accurate number, or treat this as directional until your next full year."*
  Exact copy TBD, but the gate must exist before this feature ships — this is the core "must be
  figured out before general release" requirement from the excerpt.
- [ ] **Overlaps with the paystub uploader (§18.J)** — a scanned paystub from *before* signup is
  one legitimate way to backfill real numbers into this gap without a manual week-by-week crawl —
  if the user kept an old paystub from the pre-account period, letting them upload it to correct
  that one week's actual gross/withholding closes part of the gap. Not a full fix (most users won't
  have kept every old stub), but worth wiring the uploader to accept a `weekIdx` target that
  predates `firstActiveIdx`'s normal confirmation window.

### D. Mandatory gates before public release

- [ ] **Tax accountant audit** — carried over verbatim from the original **Deferred** note: bring
  the whole withholding-suspension + catch-up mechanism (not just the exempt toggle) to an
  accountant's office for professional sign-off before any of §B/§C ships to users. Covers the
  rounding direction (§B), the disclosure boundary wording (§C), and whether split fed/state
  "extra withholding" guidance needs a disclaimer beyond what `taxExemptOptIn`'s existing copy
  covers.
- [ ] **`taxExemptOptIn` wire-up** — stays gated on the above; do not wire it into `App.jsx` /
  `IncomePanel` until the accountant pass is done.
- [ ] **§18.J's guided interview copy** — the AI-guided tax setup conversation (§18.J) ships under
  this same gate — its question set and any tax-status copy it generates needs the same review.

---

## 21. Fable Five Creative Brainstorming — Tasks & Features

*Seeded 2026-07-04 by Claude as an open idea pool: features, AI/automation intelligence, and
best practices that apps in this category should be building toward. Nothing here is committed
work — promote items into a numbered workstream when they're ready to be scoped.*

**Scope guardrail:** Authority Finance stays a *modeling and intelligence* layer. Nothing below
moves money, holds money, issues cards, or extends credit. The moat is knowing the user's income
engine better than anyone — not becoming a bank.

### A. Predictive Intelligence — know the paycheck before it lands

*Section thesis: every number the app shows should get more accurate the longer the user lives
with it — projections learn from confirmed actuals instead of trusting the schedule forever.*

- [ ] **Paycheck variance forecaster** — learn from confirmed weeks vs. scheduled weeks
  (`weekConfirmations` history) to predict this week's *actual* check, not just the scheduled
  one; show a confidence band ("likely $912–$958") instead of a single false-precision number.
  Vision: a small range chip beside the projected net on the Income panel's current-week row;
  tapping it shows the last 6 weeks of predicted-vs-actual so trust in the band is earned.
- [ ] **Seasonal pattern memory** — once 1+ fiscal years of data exist, surface recurring
  patterns: "OT usually spikes for you in November–December" / "your utilities run $40 higher
  June–August" — and fold them into forward projections automatically. Surfaces as a Coach
  insight card at the start of the affected season — never as a silent change to projections
  with no note explaining why the numbers moved.
- [ ] **Cash-flow crunch early warning** — walk projected weeks forward and flag the lowest
  upcoming spendable point ("Week 34 is your tightest week — $61 after bills") weeks before it
  arrives, with one suggested lever to pull. Example lever: "shift $25/wk into the buffer for
  the next 4 weeks and Week 34 clears with $161 instead" — always one lever, never a list.
- [ ] **Overtime ROI calculator** — the marginal, *after-tax, after-401k* value of one more OT
  hour this week, so "is Saturday worth it?" gets a real number. Cheap to build — the engine
  already computes every input. Vision: a one-line chip in the Week Inspector and the weekly
  briefing — "your next OT hour ≈ $19.40 take-home."
- [ ] **Goal ETA drift alerts** — when a goal's projected finish date slips by more than N weeks
  from its trend line, say so early, not when the due date is already blown. Example: "Truck
  fund slipped 5 weeks this month — one $240 log entry caused most of it; here's the entry."

### B. Automation Intelligence — the app does the housekeeping

*Section thesis: the user should never do bookkeeping the app could have drafted for them —
automation proposes, the human approves with one tap (see §21.E human-confirm boundary).*

- [ ] **Smart check-in prefill** — the weekly confirm modal pre-answers itself from the user's
  dominant pattern (e.g. "you've confirmed this exact schedule 9 of the last 10 weeks");
  confirming becomes one tap, correcting stays easy. Never auto-confirms without the tap.
- [ ] **Schedule drift detector** — when confirmed weeks consistently diverge from the configured
  schedule (3+ weeks of the same deviation), suggest updating the config instead of letting the
  user hand-correct forever: "Your last 4 weeks were all 36 hrs, not 40 — update your schedule?"
- [ ] **Bill-creep detector** — scan expense `history[]` for amounts that ratchet up quietly
  (subscription raised $2/mo, insurance +8% at renewal) and surface an annualized cost of the
  creep ("these 3 bills grew $312/yr combined").
- [ ] **Natural-language event logging** — type or dictate "picked up 3 extra hours Tuesday and
  spent $40 on a work boot" → Coach parses it into structured log entries, shows them for
  confirmation, then commits. Kills the #1 friction point of manual logging.
- [ ] **Rules engine (user-authored automations)** — simple if/then triggers the user composes:
  "if a week's net drops below $X, notify me" / "when goal Y hits 80%, remind me to raise the
  target." Runs client-side off already-computed state; no new infra. Vision: rules are built
  from three dropdowns (signal → comparator/threshold → action), never a formula box — think
  phone-automation-shortcut simplicity, not IFTTT scripting.
- [ ] **Calendar sync** — publish pay dates, check-in reminders, and goal milestones to the
  user's calendar (ICS feed or Google Calendar) so the app's rhythm lives where they already look.
  Example events: an all-day "Payday — projected $947" each pay Friday, and a "Confirm week 26"
  reminder the morning the weekly check-in opens.

### C. Coach Expansions — beyond chat (builds on §18)

*Section thesis: Coach stops being a chat window you visit and becomes a presence with good
timing — it shows up with the right sentence at the right moment, then gets out of the way.*

- [ ] **Weekly pre-game briefing** — proactive Monday digest from Coach: this week's projected
  check, bills due, goal contributions, and one heads-up ("holiday Thursday shifts your OT
  math"). Push notification via the existing PWA service worker; 3 sentences max.
- [ ] **What-if simulator** — a sandboxed conversation mode: "what if I drop to 32 hrs for 3
  weeks?" / "what if I get a $1.50 raise in September?" Coach runs the scenario through a cloned
  `buildYear` and answers with real deltas — never mutating live config.
- [ ] **Raise-negotiation prep** — Coach assembles the user's own case from their data: hours
  worked, OT reliability, attendance streak, tenure — a one-page brief to walk into a review
  with. Nobody else has this data shape; pure differentiation for hourly workers. Example brief
  line: "In 14 months you worked 96% of scheduled hours and covered 11 short-notice Saturdays —
  a $1.25/hr ask is defensible; here's the sentence to open with."
- [ ] **Yearly recap — "Your Fiscal Year, Wrapped"** — shareable end-of-year story: total gross,
  taxes weathered, goals funded, biggest OT week, longest confirmation streak. Emotional payoff
  for a year of logging; doubles as organic marketing.
- [ ] **Explain-this-number everywhere** — long-press any computed value (net, gap, runway) to
  get Coach's plain-English derivation of *that exact number* from the user's config. Turns the
  whole app into its own documentation. Example: long-press the $3,690 tax gap → "this is your
  projected federal + state liability minus what your 22 remaining taxed checks will withhold —
  the biggest input is your 14 exempt weeks last spring."

### D. Product & Growth Ideas

*Section thesis: growth loops that come from being genuinely useful to one workplace, household,
or crew at a time — never from engagement mechanics.*

- [ ] **Employer preset marketplace** — generalize the DHL preset pattern (per the naming
  convention in CLAUDE.md): an AI-assisted preset builder ingests a paystub photo + a few
  questions and drafts a new employer preset; vetted presets get published for other users at
  the same employer. Each preset is an acquisition channel. Vision: a new Amazon warehouse hire
  types their employer name, gets a vetted preset (shifts, diffs, OT rules pre-filled), and
  skips most of the setup wizard — the preset *is* the onboarding.
- [ ] **Lean into the RPG identity** — the repo is literally `finance-domain-rpg`: check-in
  streaks, goal-funding milestones, and levels for financial consistency. Keep it dignified
  (progress, not confetti) per the animation rules — think "quiet mastery," not slot machine.
  Example: profile titles that upgrade quietly (Apprentice → Steward → Warden of the Ledger),
  earned only by confirmed-week streaks and funded goals — never by opens, taps, or streaks of
  merely looking at the app.
- [ ] **Household mode (view-only sharing)** — invite a partner to a read-only view of selected
  panels (Home/Budget). No shared editing, no joint accounts — just shared visibility, the #1
  ask of couples budgeting apps.
- [ ] **Benchmarks without creepiness** — opt-in, anonymized cohort comparisons ("hourly workers
  in your state save a median of X% per check") computed from aggregates only; never
  individual-level sharing.

### E. Best Practices — table stakes for a trustworthy AI finance app

*Grounded in where the category is heading in 2026: forecasting over reporting, contextual
insight over raw categorization, and consolidation into fewer, smarter surfaces.*

- [ ] **Human-confirm boundary for all AI writes** — codify the §18.J paystub rule as a global
  invariant: AI may *propose* config/log/expense changes, only the user commits them. Write it
  into CLAUDE.md as a standard once the first AI-write feature ships. Vision: every AI proposal
  renders as the same diff-style confirm card (current value → proposed value, one Apply button)
  so the trust boundary looks identical everywhere it appears.
- [ ] **Confidence labeling** — every AI-generated number carries a visible basis:
  "projected" vs. "confirmed" vs. "estimated from pattern." Never let a guess cosplay as a fact
  (this is the same disclosure discipline as §20.C, generalized).
- [ ] **Coach eval suite** — a fixture set of (user snapshot → expected answer quality) cases
  run against prompt changes, so Coach regressions are caught like code regressions. Start with
  10 golden conversations; grow it from real flagged answers. Example golden case: given a
  snapshot with a $3,690 tax gap, Coach's answer must mention the gap, name the per-check extra,
  and propose exactly one action — an answer missing any of the three fails the eval.
- [ ] **AI cost telemetry** — per-feature token/cost dashboards from day one of §18 (log
  call-type + token counts, per §18.G) so a runaway prompt is a graph, not a surprise invoice.
  Implementation option worth considering instead of (or alongside) a custom dashboard: split
  `ANTHROPIC_API_KEY` into one key per feature area (net worth trigger, Ask Coach, Job Scout, …)
  — Anthropic's Console breaks down usage by API key natively, so this gets per-feature cost
  visibility with zero custom telemetry code. Premature with only one Coach feature live; revisit
  once 2–3 features are shipped and cost attribution actually matters.
- [ ] **Thumbs feedback on Coach messages** — one-tap 👍/👎 on every AI output, stored with the
  chat row (`coach_chats.insights` can hold it); the flagged set feeds the eval suite above.
- [ ] **Data export + portability** — one-tap full export (JSON + CSV) of config, logs, expenses,
  goals. Trust feature and churn-guilt-remover; also the prerequisite for the household/benchmark
  ideas above being consent-clean.
- [ ] **Offline-first resilience pass** — the PWA should degrade gracefully: log events and
  confirm weeks offline, queue writes, sync on reconnect. Hourly workers are on warehouse floors
  with bad signal — this is a core-audience feature, not an edge case.
- [ ] **Accessibility audit** — contrast check on the dark-green token palette (secondary text
  `#7fa39a` on `#112c1f` surfaces is the likely first fix), full keyboard nav, screen-reader
  labels on the metric cards. Do it before the paid tier launches, not after.

---

### F. Horizon Tier — Fable-Class Features

*Second pass, 2026-07-04 — deeper push. Everything below is a moonshot: not yet provable with
today's stack, but each idea keeps one foot on real technology (its **tether**, noted inline).
The organizing thesis: the tagline isn't just "take control of your money" — it's **take your
life back from the brain fog and the dopamine machine**. Money is where the fog does its most
expensive damage, so a finance app is a legitimate weapon in that fight. Attention is treated
here as a second currency the app helps the user stop hemorrhaging.*

#### F1. The Attention Counter-Offensive — treat attention like money

- [ ] **The Attention Ledger** — the fog made visible in dollars. Import screen-time data
  (iOS Screen Time / Android Digital Wellbeing exports — user-initiated, never scraped) and
  price doomscroll hours at the user's own after-tax rate: "You spent 11 hours in the feed
  this week — at your rate, that's $214 of your life." Not a lecture, a ledger line, in the
  same mono font as every other number in the app. *Tether: screen-time exports exist today;
  the rate math is already in the engine.*
- [ ] **The Impulse Airlock** — the anti-dopamine purchase ritual. Instead of buying, the user
  logs the *urge*: what it was, what it cost. Coach instantly translates it into their own
  units: "That $68 is 4.5 days off your truck loan, or one-third of your PTO goal week." The
  urge sits in the airlock 72 hours; buying it after that is fine and judgment-free — the win
  is the pause, not the denial. Urges that expire un-bought accumulate into a visible
  **Reclaimed** total. No money is ever held — it's a log entry with a timer. *Tether: this is
  the existing event-log system plus a countdown.*
- [ ] **Life-Force Pricing** — the *Your Money or Your Life* idea, finally automatic. Anywhere
  a dollar amount appears in the app, long-press flips it into hours-of-your-actual-shift at
  your real marginal after-tax rate ("this bill = 6.2 hours on the floor"). Later: an optional
  browser extension that overlays the same translation on shopping sites. *Tether: the
  marginal-rate math ships with §21.A's OT ROI calculator; the extension is a WebExtension
  reading DOM prices.*
- [ ] **The Fog Index** — a single 0–100 ambient-financial-anxiety score, tracked like net
  worth. Inputs: 2-tap micro check-ins ("how heavy does money feel today?"), plus behavioral
  signals the app already sees — anxious-open frequency (opening the app 9× a day without
  acting), 3am sessions, check-in streak breaks. The pitch: watch the fog number *fall* over
  months of using the app. This becomes the retention metric that matters more than DAU.
  *Tether: it's session analytics + a weekly one-question survey; the science can start as an
  honest heuristic, clearly labeled.*
- [ ] **Quiet Hours — the app that tells you to leave** — user-set hours (evenings, Sundays)
  when the app opens to a single card: "Your money is fine. Week 27 is funded. Go live." — and
  *nothing else*, no numbers, no red, no pull-to-refresh. An app that guards the user's
  attention against *itself* is the credibility move no engagement-farmed competitor can copy.
  *Tether: trivially buildable; the hard part is the discipline, which is the point.*
- [ ] **The Calm Covenant** — publish an anti-dopamine design constitution as a public page:
  no infinite scroll, no red badge counts, no variable-reward animations, no streak-shaming,
  notifications never fire to re-engage — only to inform. Wire it into CI as lint rules where
  possible (e.g. forbid badge APIs). It's the animation-rules section of CLAUDE.md, promoted
  to a brand promise. *Tether: already 80% true of the current design system.*

#### F2. Coach Becomes a Presence — AI that earns silence

- [ ] **The Graduation Curve** — Coach is designed to speak *less* over time. As the user's
  patterns stabilize (confirmations consistent, fog index falling, goals on-trend), Coach's
  cadence deliberately decays from weekly briefings to monthly to quarterly — and it *says
  so*: "You don't need me weekly anymore. That's the win." An AI whose KPI is its own growing
  silence inverts the entire engagement industry. *Tether: a cadence policy over signals §21
  already computes.*
- [ ] **Council of Future Selves** — the fable feature. Coach can stage a conversation with
  *you at 60* — but grounded: the future self's circumstances are computed from the user's
  actual projection curves (current savings velocity, loan payoff dates, 401k trajectory via
  `buildYear`), and the user can talk to *two* of them — the one their current plan creates
  and the one a 5%-better plan creates — and feel the gap as a person instead of a chart.
  Heavy disclaimer framing: this is a mirror of your own assumptions, not a prophecy.
  Example exchange — user: "was the truck worth it?" → future self: "paid off week 40 of next
  year on your current plan; I remember the Saturdays that bought it. The other me — the one
  who added $15 a week — was done by June." *Tether: persona prompting over `lib/aiContext.js`
  snapshots; the projections already exist.*
- [ ] **Shift-End Debrief (voice-first ambient logging)** — clocking out, walking to the car:
  hold the button, talk for 20 seconds — "worked over an hour, skipped lunch, grabbed $12
  food, Dave says Saturday OT is open." Coach parses it into log entries, a calendar note,
  and a heads-up for the OT decision — confirm-all with one tap at home. The app dissolves
  into the user's day instead of demanding a sit-down session. *Tether: Whisper-class
  speech-to-text + the §21.B natural-language logging pipeline.*
- [ ] **The Whisper Model (on-device Coach)** — a small local model (WebGPU / WebLLM-class)
  handles the intimate layer — urge logging, fog check-ins, quick math — entirely on the
  phone, offline, with financial details never leaving the device; the cloud Claude tier is
  reserved for heavy reasoning and is clearly marked as such. Privacy stops being a policy
  page and becomes an architecture. *Tether: on-device inference of small models in-browser
  is real today and improving fast; the split-brain routing is the new work.*
- [ ] **Burnout Sentinel** — the inverse of every hustle app: detect *unsustainable* earning.
  Six-day streaks, rising OT with rising missed-day corrections, fog index climbing while
  income climbs — Coach names it: "You've worked 19 of 21 days. The 6th day pays $96 and
  costs you the other six. Your goals survive a Saturday off — here's the math." Optional
  wearable correlation (HealthKit/Google Fit sleep + recovery) later. *Tether: the detection
  is pattern analysis over `weekConfirmations`; wearables are a documented API import.*

#### F3. The Fable Frame — the RPG made literal

- [ ] **The Domain Map** — the repo name cashes its check: the user's financial year rendered
  as a living territory. Loans are **sieges** slowly being broken (payoff progress = siege
  lines receding), goals are **expeditions** with provision lines (funding rate), the
  emergency buffer is the **keep wall**, income is the **harvest road**, and the fog itself
  is literal fog-of-war that rolls back as weeks get confirmed and unknowns become knowns.
  One glance answers "how is my kingdom?" — every element deep-links to the real panel
  underneath. Rendered in the Flow palette, calm and painterly — Ghibli, not Vegas.
  *Tether: it's a data-driven SVG/Canvas scene over state the engine already computes; the
  fog-of-war mapping to unconfirmed weeks is almost embarrassingly literal.*
- [ ] **Chronicle of the Year** — the year-end "Wrapped" (§21.C) told as an illustrated saga:
  "In the eighth week, the furnace failed — a $600 raid. You held the wall without touching
  the keep." Generated from real log entries, in Coach's voice, exportable as a keepsake.
  Emotional truth from literal data. *Tether: narrative generation over the logs table.*
- [ ] **Crews (guild mode)** — coworkers at the same employer preset form small anonymous
  crews: shared *consistency* streaks (check-ins, not balances — no income comparison, ever),
  collective siege victories ("the crew retired $11k of debt this quarter"), and one shared
  ritual: when someone's loan dies, the crew sees the banner fall. Solidarity mechanics for
  people who already cover each other's shifts. *Tether: presence + aggregate counters over
  the employer-preset relation; the §21.D benchmark privacy rules apply verbatim.*
- [ ] **Heirloom Letters** — at any goal's creation, the user can seal a note to the person
  who finishes it ("if you're reading this, the truck is paid off — I wrote this in the
  break room"). Sealed until the goal completes; delivered by Coach with ceremony. Zero AI,
  zero infra beyond a locked text column — possibly the highest emotion-per-line-of-code
  feature in this document. Delivery vision: the goal-complete screen holds one quiet beat,
  then — "you left yourself a letter when this began, 14 months ago. Ready?" — one tap opens
  it; the letter is theirs to keep, screenshot, or seal into the Chronicle.
  *Tether: a `sealed_until_complete` text field.*

#### F4. Honesty rails for the whole horizon tier

- [ ] **Label the magic** — every F-tier feature that estimates, roleplays, or narrativizes
  carries the §21.E confidence labels; the Council of Future Selves and Fog Index especially
  must never present themselves as prediction or diagnosis.
- [ ] **No dark-pattern inversions** — the attention features must never become their own
  dopamine loop (no Reclaimed-total push notifications, no fog-score shame states). Each F1
  feature gets audited against the Calm Covenant before ship.
- [ ] **Mental-health boundary** — the Fog Index and Burnout Sentinel are wellness mirrors,
  not clinical instruments; copy review with the same rigor as §20.D's accountant gate, and
  a visible hand-off line to real resources when signals are severe.

---

### G. Post-Merge Honing Pass — grounded by the 2026-07-05 master sync

*Third pass. Master landed five workstreams since §21 was seeded: the §17.D/E entitlement
state machine + read-only paywall, the security breach audit (`docs/security-audit-2026-07-04.md`)
with RLS remediation migration 019, the Google OAuth callback-failure surfacing, 157 new tests
(exposing Job Loss engine math, investor/demo account infra, and the swipe/scroll hooks as
mature systems), and Stripe §17.C validated end-to-end in test mode. Each shipment either
**sharpens an existing fable idea's tether** or **opens a door that wasn't visible before**.*

#### G1. Tethers that just got shorter (existing ideas, now cheaper)

- [ ] **Household view-only mode (§21.D) — the mechanism now exists.** The paywall pass built
  exactly the primitive this idea needed: a `readOnly` prop on Home/Budget whose noop-setter
  pattern (`setGoals = readOnly ? noop : setGoalsProp`) makes every nested mutation a no-op
  with one switch. A partner's shared view is that same prop pointed at someone else's data —
  what was a moonshot is now mostly an auth/invite problem. Promote this toward real scoping.
- [ ] **The Storm Drill — Job Loss Mode as a fire drill.** The new `buildYearJobLoss` /
  `jobLossFlow` tests confirm the engine can already recompute a whole year around a job-loss
  event. New idea on top: let a *currently-employed* user run the storm as a **drill** — "if I
  lost my job today, my runway is 11 weeks; here's the week the keep wall breaks" — sandboxed
  (cloned config, like §21.C's what-if simulator), never touching live state. Preparedness is
  the single best fog-cutter there is, and the math is already tested. On the Domain Map (F3),
  this renders literally as a storm rolling across the territory.
- [ ] **Council of Future Selves (F2) — stronger legs.** `estimateGoalNextYear` shipping with
  tests means multi-year projection is no longer hypothetical; the future-self personas can be
  seeded from a real next-year estimate instead of a hand-rolled extrapolation.
- [ ] **Impulse Airlock (F1) — the gesture already exists.** `useSwipeStack` (now under test)
  is a card-swipe interaction primitive: urge triage becomes a swipe stack — swipe one way to
  release an expired urge, the other to bank it into the Reclaimed total. The UX centerpiece
  of the airlock is a hook the codebase already ships.
- [ ] **Post-checkout polling → ambient sync.** `App.jsx` now polls `loadUserData()` after
  Stripe checkout because the webhook may lag. Supabase Realtime subscriptions could replace
  that poll *and* become the backbone for F3's Crews (live guild counters) and household mode
  (partner's view updates as the earner confirms a week) — one infra piece, three features.

#### G2. New ideas the merge surfaced

- [ ] **The Open Keep — a public trust page.** The security audit is genuinely good writing:
  it names what was broken, what was already strong, and what got locked down (RLS + column
  locks on billing/admin flags). Turn that posture into a user-facing surface: a plain-English
  "how your data is guarded" page — what we store, what we can see, what we *cannot* do
  (move money, touch accounts), when we were last audited. Financial apps hide this; an app
  about taking control back should hand the user the keys inventory. Sibling to F1's Calm
  Covenant: **Calm Covenant for attention, Open Keep for data.** Example page lines: "We cannot
  move your money. We never see your bank. Here is every column we store, and who can read it."
- [ ] **RLS regression sentinel** — promote the audit's recommendation #4 into §21.E practice:
  a standing test that signs in as user B and asserts user A's row is unreachable
  (read/write/delete all fail), so the crown-jewel protection can never silently regress.
  Cheap, permanent, and the Open Keep page can truthfully say "verified on every deploy."
- [ ] **The Playable Character — public demo world.** Investor/demo account infra
  (`demo_accounts`, `investor_codes`, now fully under test in `dbInvestor.test.js`) already
  solves "a fake account with realistic data." Generalize it: before signup, anyone can play
  a **pre-made character** — a fictional hourly worker with a year of history, goals mid-siege,
  a storm on the horizon — and poke every panel. The RPG frame makes this natural (every RPG
  lets you try a character before you build your own), it converts better than screenshots,
  and it's the §18 Coach demo stage too. The infra cost was already paid for investors.
  Vision: the login screen offers "Play a character" — you step into Sam, a forklift operator
  31 weeks into the year with a truck-loan siege half-broken and a storm on the radar — and
  signup reframes as "Create your own character."
- [ ] **Honest-failure standard** — the OAuth fix (surfacing a silently-failed Google callback
  instead of dumping the user on a blank login form) is a pattern worth codifying in §21.E:
  *no dead-end states.* Every failure the app can detect, it explains in one sentence and
  offers one next action. Fog thrives on unexplained dead ends; an app against brain fog
  never leaves the user asking "…did that work?"
- [ ] **Expired ≠ erased — the Archive promise.** The read-only expired mode (§17.E) locks
  editing, which is fair — but pair it with an explicit promise: your *history* (chronicle,
  logs, completed goals, Heirloom Letters) stays readable and exportable forever, paid or
  not. The paywall gates the engine, never the user's own memories. That single sentence of
  policy is a trust differentiator competitors structurally can't match, and it makes F3's
  Chronicle/Heirloom features safe to invest emotion in.
