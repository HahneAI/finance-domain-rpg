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

- [x] **Free trial explainer screen** — `src/components/TrialExplainerScreen.jsx`, shown once by
  `App.jsx` right after a fresh signup, ahead of first-run `SetupWizard` entry (gated on
  `wizardEntry === false` — never on a life-event re-entry string — plus `!config.isInvestor` and
  `entitlement.state === "trial"`). Breaks down the trial (full access for `trialDaysLeft` days —
  dynamic, not hardcoded, so it also reads correctly for a beta tester's longer seeded window; no
  card required; day-7 add-card reminder; the real `trial_ends_at` date when known; post-trial
  pricing) behind a required "I understand" checkbox that gates the Continue button. Reuses
  `LoginScreen.jsx`'s exported `Shell` for the standalone full-screen layout, same pattern as
  `ReviveScreen`. Not persisted server-side — local `trialExplainerAcknowledged` state only, so it
  re-prompts on a later session the same way `wizardEntry` itself does until `setupComplete` flips
  true. Disclosure-guard tested (`TrialExplainerScreen.test.jsx`) — never mentions "grace,"
  "21-day," "extra week," or "access ends."
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
- **Migration renumbering.** §H1's `017_add_coach_chats.sql` is stale — 017 through 022 are now
  taken (021 went to `021_add_is_tester_beta_flag.sql`, the beta tester flag, 2026-07-07; 022 was
  claimed by a concurrent, not-yet-pushed session); the coach_chats migration lands as
  **`023_add_coach_chats.sql`** (shipped 2026-07-10) — check `database/migrations/` before writing
  any future migration, since numbering collisions across concurrent sessions keep happening.
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
  10 tealen conversations assemble themselves before public launch instead of being invented.
- [ ] **Live State Inspector: Coach line** — admin-only "last Coach call: [type] · [model] ·
  [tokens in/out] · [cache hit?]" so cost behavior is verifiable from a phone, same pattern as
  §19's config-history line.
- [ ] **Reuse the §17 test pattern for Coach copy** — TrialBanner-style forbidden-pattern tests on
  every hardcoded Coach surface (trigger card templates, empty states): no "grace", no "21", plus
  the §C guardrails (no catastrophizing words on red-tier cards).

#### Open product questions (need your call, not research)

- [x] **Entry point — resolved 2026-07-11, gate widened 2026-07-24:** gated bottom-nav item, same
  mechanism as the existing admin-only `__tools__` slot — `effectiveBottomNav` appends a "Coach"
  tab when `canAccessAskCoachGeneral({isAdmin, isTester, entitlement})` is true (admin/tester, OR
  a real trial/grace/active entitlement — see the free-vs-paid bullet below), so a fully
  non-entitled user's nav stays unchanged at 5 items. Opens `AskCoachPanel.jsx`, a full-screen
  overlay (built 2026-07-11, Phase A scope: no persistence, no history sidebar yet).
- [x] **Free vs. paid — direction set 2026-07-11, built 2026-07-24:** the general Ask Coach Q&A
  (§B) and the Net Worth Trigger (§C) now ship as part of the regular paid subscription, trial
  included — `lib/entitlements.js`'s `canAccessAskCoachGeneral()` grants access via isAdmin/isTester
  (unchanged) OR `entitlement.isEntitled` from `lib/subscription.js`'s `getEntitlement()`, checked
  independently server-side in `api/coach.js` (never trusting a client-supplied flag). Deliberately
  a separate function from `canAccessAiFeatures`, which stays the narrow admin/tester-only gate for
  every other, not-yet-built Coach surface — the deeper, section-specific ones (Statements Insights
  §D, Job Hunt Assistant §E + Job Scout §I, Application Assistant §F, Tax Interview §J) are still
  the planned paid-conversion upsell once they exist, reusing the existing §17.E paywall/readOnly
  gate rather than inventing a separate Coach-tier flag. Full write-up:
  `docs/coach-entry-points.md` §§1–2.
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

- [x] **Entry point** — built 2026-07-11: gated bottom-nav "Coach" tab (`canAccessAiFeatures`),
  opens `AskCoachPanel.jsx` as a full-screen overlay. **Deviation:** desktop side-panel treatment
  deferred — currently full-screen on every breakpoint; fine for the isAdmin/isTester-only phase,
  revisit before general rollout.
- [x] **System prompt scope** — `ASK_COACH_SYSTEM_PROMPT` (`lib/coachPrompts.js`) built 2026-07-11:
  Coach answers questions about Authority Finance features, grounded in `buildCoachContext()`'s
  snapshot, explicitly declines general financial/tax/investment advice.
- [x] **Feature FAQ context block** — built 2026-07-11: `lib/coachFeatureGuide.js`'s
  `COACH_FEATURE_GUIDE`, a hand-written tutorial-breakdown of the 5 main panels (Home, Income,
  Budget, Log, Account), concatenated into `ASK_COACH_SYSTEM_PROMPT` so it rides in the same
  cached system prefix as the persona. **Scope note:** covers the 5 bottom-nav panels only, not
  the setup wizard, Admin Tools, or Life Events flows yet — extend the file when those need
  covering. **Deliberate non-RAG choice:** static and hand-maintained rather than a vector/retrieval
  pipeline — the app's feature surface is small enough to hand Coach in full, and a retrieval step
  would vary the prefix per-query and break the cache the persona block already depends on.
  **2026-07-16 follow-up:** a live test asked about the Home panel's "Budget Health" tile by name
  and Coach flatly said it had no such data — the guide never named Home's three actual tile
  titles, and `buildCoachContext()` didn't carry the Budget Health % or Net Worth Trend $ figures
  at all (only the derived "Savings rate"). Fixed: the guide now names all three tiles ("Next Week
  Takehome", "Net Worth Trend", "Budget Health") explicitly, and the context block adds live
  Budget Health / Net Worth Trend lines computed with the exact same formula/thresholds as
  `HomePanel.jsx`.
  **2026-07-16, second follow-up:** wired in the goal-focused tile row too — "Left This Week",
  "Active Goals Total", "Weeks to Complete All", and a per-goal breakdown (target, projected
  weekly rate, estimated finish fiscal week) computed via the same `computeGoalTimeline()` call
  `HomePanel.jsx` makes, with the same `config.goalTimelineEpochIdx` epoch. **Per explicit
  instruction, goal names/labels are deliberately withheld from context for user privacy** — goals
  are identified only by funding-priority rank ("Goal 1 of N"); the guide tells Coach it can use a
  name back if the *user* volunteers it in their own message, but never learns it from data.
  **2026-07-16, third follow-up:** closed the "Next Week Takehome" gap flagged in live testing (a
  user question got an honest "I don't have that" hedge instead of the real figure) — added a new
  `futureWeekNets` param to `buildCoachContext()` (distinct from `timelineWeekNets`, which is the
  raw array `computeGoalTimeline()` needs) and replicated `HomePanel.jsx`'s exact fallback chain
  (confirmed/scheduled next week → last confirmed week → plain average), status thresholds, the
  "vs your average" delta, and `perCheckFactor` scaling, so the figure can't drift from the tile.
- [ ] **Benefits / 401k context — deferred, not built.** Per explicit instruction: hold off wiring
  `BenefitsPanel` (401k contribution/match, PTO accrual/usage) into Coach's context until we've
  looked closer at how a **base (non-DHL) user** onboards other forms of employer compensation —
  signing bonuses, non-DHL 401k match structures/vesting, other benefit shapes DHL's preset doesn't
  cover. Wiring benefits context in now would bake in DHL-shaped assumptions before that product
  question is settled; revisit once the base-user benefits onboarding story is clearer.
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

- [x] **Copy audit — static tips rewrite** — done 2026-07-25. All 6 tips in `NetWorthHealthTips.jsx`
  rewritten to match Coach's voice (first person, direct) and each now names a real in-app lever
  instead of a generic affirmation: Budget (trim a Lifestyle expense), Home (reorder goal
  priority), Account (paycheck buffer), Log (log a change immediately), Home again (Net Worth
  Trend direction), Income (check next week's net). The "Financial Breakthrough" eyebrow label,
  intro paragraph, and closing support-resource line were rewritten too — deliberately kept at
  near-zero boxing metaphor, mirroring `coachPrompts.js`'s Red-tier restraint, since this fires at
  exactly the kind of thin-cushion moment where plainness should outrank flavor. Copy-only, no
  API cost — the rubric's un-scored axes (directness, warmth, etc.) weren't needed for this pass.
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

**AI-gating decision resolved, 2026-07-25 (user directive) — build tracked in a separate
session, not here.** Ships behind the same narrow `canAccessAiFeatures` (`isAdmin`/`isTester`)
gate every other AI surface uses today; the plan is to move it to a paid-tier gate once the
feature is finished, mirroring the precedent Coach's own gate-flip already set
(`canAccessAskCoachGeneral`, widened 2026-07-24 — admin/tester **or** a real trial/paid
entitlement, never `isInvestor`; see `drift-app-warden.md` F24). Until that flip happens for
Job Hunt Assistant specifically, treat the checklist below as informational — the actual build
is happening in another session, so don't duplicate work here without checking in first.

*Job Loss Mode's §15.H/H7-H9 rebuild (2026-07-18) already produces most of the outputs this
feature will need to read — noting the exact files/functions now so whoever builds this doesn't
have to re-derive them or, worse, write a fourth parallel runway calc:*
- **`lib/jobLossRunway.js`** — `computeJobLossRunway({ config, expenses, effectiveToday, savings })`
  is the authoritative runway/burn function (weeklyBurn, essentialCount, benefitsRemainingWeeks,
  projectedUnemploymentTotal, withBenefits/withoutBenefits cash+days+cliff). Both `JobLossHomePanel`
  and `JobLossBudgetPanel` already read from this — grounding any Coach context in it (not a new
  calc) keeps the number Coach quotes identical to what the user sees on screen, per §24's rule.
  Also exports `firstUnemploymentPaymentDate(cfg)` and `sumJobHuntIncome(cfg)`.
- **`config.jobHuntIncomeLog`** (`{ id, amount, note, loggedAt }[]`) — gig/odd-job cash logged from
  the Home widget, already summed into runway via `sumJobHuntIncome`. Good context for "how much
  extra income have I brought in while searching."
- **`config.jobApplications`** (from the existing `ReemploymentTracker`) — target income + logged
  applications (company/role/date/status); likely direct input to prompt modes like "prep me for
  [company] interview" and "salary negotiation coaching."
- **Expense fields `trackDuringJobLoss` and `dueDateAnchor`** (`lib/expense.js`) — which bills the
  user is actually tracking/paying during the search, and real due dates via `getNextDueDate(exp,
  today)` (loan-aware — see `getExpenseDisplayAmount` for the matching amount getter). Useful for
  "how long can I be selective" framing (what's actually due before benefits run out).
- **Known drift to fix before/while building this — worse than originally flagged, re-confirmed
  during the §15.H14 birdseye review (2026-07-19):** `lib/coachTriggers.js`'s `estimateRunwayDays`
  (used by `CoachNetWorthCard.jsx` for the §18.C Red-tier trigger) is a **second, independent**
  runway calc. Its own doc comment says it "assumes $0 extra savings, the conservative floor" —
  that comment predates `jobLossCashOnHand` existing as a real persisted field (§15.H13); the
  "additional savings" input it's talking about used to be a session-only draft `JobLossBudgetPanel`
  owned, which no longer describes the current architecture at all. It also still predates the
  `trackDuringJobLoss` flag added in §15.H8/H9, so it counts bills the user unchecked from tracking.
  Two independent sources of drift on the same function now, both confirmed live: it disagrees with
  Job Loss Home/Budget on both *which bills count* and *how much cash the user actually has*. Either
  retrofit both (`trackDuringJobLoss` filter + `jobLossCashOnHand`) into it, or (cleaner) have it
  call `computeJobLossRunway` directly once this feature gives a reason to touch that file. Separate
  and worth fixing regardless of whether this feature gets built: `App.jsx` never actually passes
  `runwayDays` into `buildCoachContext` at all (`lib/aiContext.js:199-201` has the parameter and the
  context line ready, just never wired) — Coach's Job Loss Mode context today is the bare string
  `"Job Loss Mode: active"`, no numbers. Full write-up: `docs/TODO.md` §15.H14.
  **Closed, 2026-07-22 (§15.H17):** both paragraphs above are now stale — `coachTriggers.js`'s
  `estimateRunwayDays` was deleted outright (not retrofitted), and every runway consumer
  (`CoachNetWorthCard.jsx`, `App.jsx`'s `coachRunwayDays`) now calls `computeJobLossRunway()`
  directly, so there is no second drifted calc left to reconcile. `runwayDays` is also now wired
  into Coach's context (`App.jsx` → `buildCoachContext`), not the bare `"Job Loss Mode: active"`
  string. See `docs/BUG_FIX_TODO.md` DW-8/DW-9 and `drift-app-warden.md` §21 F24 for the fix
  history — this stale note is left in place (not deleted) as the historical record of the drift
  this feature would otherwise have needed to fix.

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

#### E1. Résumé upload / skill-gap analysis — scoped, 2026-07-22 — SCOPED, nothing started

*Expands the bare "Help me with my resume" bullet above into an actual spec. Flagged by §15.H14
bullet 6 as "genuinely absent as an idea" — the only prior trace anywhere in this doc was that one
unbuilt chat-prompt bullet and §15.F's "Profile store for auto-fill," which is explicitly scoped as
plain user-entered text for form auto-fill, not this. This pass answers §15.H14's three open
questions (storage, parsing, standalone vs. tied to `ReemploymentTracker`) and proposes a phased
scope — documentation only, nothing below is implemented.*

- **Storage — plain text, not a file upload, for v1.** Confirmed via grep: this codebase has zero
  existing Supabase Storage usage anywhere (`grep -rn "storage.from\|createSignedUrl"` across
  `src/` and `api/` — no matches), so a real PDF/DOCX upload path is entirely new infra: a bucket +
  its own RLS policies, a file-type/size validator, and a parsing step, for a feature that's
  currently unreachable by real users anyway (AI features are `is_admin`/`is_tester`-gated — H14
  bullet 5, still true). A "paste your resume text" textarea gets the same downstream
  skill-gap-analysis value at a fraction of the surface area: a pasted-text resume and a
  PDF-extracted-text resume look identical to the LLM call that actually does the analysis, so the
  parsing step is a wash for the common case (text-only resume) and only matters for scanned/
  image-based resumes, which are the minority. Recommend v1 = plain text; treat file upload as a
  v2 candidate once v1 has proven anyone actually uses this (see phasing below) — Storage bucket +
  client-side extraction (`pdf.js`/`mammoth.js`, to avoid yet another server route) can be added
  later without touching the analysis pipeline downstream, since that pipeline only ever sees text.
- **Parsing — not applicable in v1.** Follows directly from the storage decision: no file, no
  parsing step. Pasted text goes straight into the Coach system prompt as-is.
- **Standalone table, not a `config` field, but reads `ReemploymentTracker` data for grounding.**
  Resume text can run to several KB and doesn't belong in the `config` jsonb blob that's read/
  written on every debounced autosave (docs/TODO.md "Persistence — Eager Save Pattern") — bloats
  every save for a field that changes rarely. Model a new `resume_profile` table after
  `coach_chats` (migration `023_add_coach_chats.sql`): one row per user
  (`user_id references user_data(user_id) on delete cascade`), own-row RLS (all four CRUD ops,
  same policy shape as `coach_chats`, not `account_history`'s insert-only posture), service-role
  bypass for future admin diagnostics. Columns: `resume_text`, `target_role` (free-text override —
  see below), `last_reviewed_at`, `created_at`/`updated_at` (client-stamped, matching the
  established no-trigger pattern — see 023's own deviation note). The *analysis itself* is
  standalone data, but the skill-gap comparison needs a target role to compare against — cheapest
  version: default to the most recent `config.jobApplications` entry's `role` field (already
  captured by `ReemploymentTracker`, zero new input), with `resume_profile.target_role` as a
  free-text override when the user wants to compare against a role they haven't applied to yet.
  No change to `ReemploymentTracker.jsx` itself required for this — read-only reference.
- **AI pipeline reuses existing §18.G infra — no new serverless route.** Add `'resume_review'` to
  `coach_chats`'s `chat_type` check constraint (currently `ask_coach`, `job_scout`, `job_hunt`,
  `statement_summary`) rather than building a separate endpoint — `api/coach.js`'s existing
  auth/gating/streaming already covers this. Use Sonnet, not Haiku (§18.G's existing model split:
  Haiku for chat/FAQ/triggers, Sonnet for statement summaries and job-hunt drafts — a resume review
  is closer to the latter in depth). Store the structured skill-gap output in `coach_chats.insights`
  (already a jsonb column, already used for "statement insight keys" — no schema change needed
  beyond the chat_type enum value) alongside a written review in `messages`.
- **Entitlement gating — same `canAccessAiFeatures` gate as every other Coach surface,** no new
  gate needed. **Resolved 2026-07-25 (§E header):** stays `canAccessAiFeatures`
  (`isAdmin`/`isTester`) until Job Hunt Assistant ships, then moves to a paid-tier gate — same
  plan as the parent feature, not a separate decision for the résumé piece.
- **Recommended phasing:**
  - **v1** — `resume_profile` table + RLS; a "Resume" card in `ReemploymentTracker` (or its own
    section in the Job Loss Dashboard) with a paste-text textarea + "Get skill-gap review" button;
    `resume_review` chat_type wired through the existing `api/coach.js`; output rendered as a
    bullet list of gaps + a short written review, saved to `coach_chats`.
  - **v2 (only if v1 shows real usage)** — file upload (PDF/DOCX) via a new Supabase Storage
    bucket + client-side text extraction feeding the same v1 analysis pipeline unchanged.
  - **Not scoped even for v2:** any auto-apply / auto-tailor-resume-per-listing feature — that's a
    materially different (and higher-liability) feature than "review my resume against a role,"
    and depends on §15.F's job-board integrations existing first regardless.

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

#### H1. Migration — `023_add_coach_chats.sql` (renumbered — see §18.0's migration-renumbering note; check `database/migrations/` for the actual next-available number before writing this)

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

- [x] **Write migration** `database/migrations/023_add_coach_chats.sql` — built 2026-07-10
  (renumbered from 022 to 023 after a concurrent, not-yet-pushed session claimed 022 first).
  Two deliberate deviations from the spec above, documented in the migration's own header:
  the FK is `references user_data(user_id)`, not `user_data(id)` (the spec named the wrong
  column — `user_data`'s real PK is `user_id`); and there's no `moddatetime` trigger for
  `updated_at` — no such trigger exists anywhere in this schema today (not even on
  `user_data`, despite CLAUDE.md's mention), every table stamps it client-side instead, and
  this table matches that actual convention rather than introducing a new one.
  **Confirmed run in Supabase 2026-07-10** — `coach_chats` exists with RLS enabled
  (`relrowsecurity = true` verified) and the own-row policies hold.
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
  row). `user_id` always comes from the session, never the caller. **Wired 2026-07-25** —
  `AskCoachPanel.jsx`'s `persistChat` calls it immediately after every completed turn (eager
  save, not debounced — see §18.H drift note below).
- [x] **`deleteCoachChat(id)`** — function built (`db.js` + tests) 2026-07-10; UI wired
  2026-07-25 — a trash-icon button per history row (`AskCoachPanel.jsx`), not swipe/long-press
  as originally sketched — simpler and equally reachable at the 44px mobile tap-target standard.
- [x] **In-memory shape — deliberate deviation from the spec above.** `coachChats` is *not* a
  peer of `config`/`logs`/`goals` in `App.jsx` state; it lives entirely inside `AskCoachPanel.jsx`
  (`historyChats` state, loaded via its own `useEffect` on mount) since the panel is still the
  only consumer — hoisting it into `App.jsx` would add global state with a single reader. Revisit
  if a second surface (Job Scout, the bottom-nav badge, etc.) needs the same list.

#### H3. Chat history UI

- [x] **History list panel** — built 2026-07-25. Within the Ask Coach panel (a "Chat History"
  view toggled by a header icon), grouped by date (Today / This Week / Older); each row shows
  `title` (or first user message truncated), `summary` preview when one exists, and `created_at`
  relative date. **No `chat_type` chip** — every row is `ask_coach` today (the list explicitly
  filters to that type), so a chip would say the same word on every row; add it when a second
  type gets a UI caller (see drift-app-warden §21 F123).
- [x] **Tap to resume** — built 2026-07-25. Loads the chat's full `messages` array back into the
  active view.
- [x] **New Chat button** — built 2026-07-25. Header icon, not inline atop the history list as
  originally sketched — reachable from both the chat and history views so starting fresh doesn't
  require opening history first. Resets to `messages: []` and focuses the input.
- [ ] **Job Scout entries** — not applicable yet; Job Scout (§18.I) isn't built, so no
  `chat_type: 'job_scout'` rows exist to render.

#### H4. Summary + insight generation

- [x] **End-of-session summary — built 2026-07-25, on a different trigger than spec'd.** No
  10-minute idle timer; fires (best-effort, non-blocking) when a session actually ends from the
  user's action — panel closed, New Chat started over an in-progress conversation, or a different
  saved chat resumed. A short Haiku call (`COACH_CHAT_SUMMARY_PROMPT` in `coachPrompts.js` — its
  own narrow prompt, not `ASK_COACH_SYSTEM_PROMPT`) writes 1–3 sentences to `coach_chats.summary`.
  An idle-timeout trigger could still be added later as a belt-and-suspenders case (someone who
  leaves the tab open indefinitely without an explicit close), but user-initiated session-end
  covers the common path.
- [ ] **Statement insight extraction** — not applicable yet; no `statement_summary` chat type has
  a UI caller.
- [x] **Admin diagnostic** — built 2026-07-25. DB Row Viewer (all 3 render sites — sidebar,
  drawer, mobile sheet) → "Coach Chats: N saved chats (breakdown)" line, populated by
  `handleFetchRow` alongside the existing config-history line. Breakdown only lists chat types
  that actually have rows (today always just `ask_coach`, since job_scout/job_hunt/
  statement_summary have no UI caller) rather than the spec's fixed 3-slot format, so it stays
  accurate once a second type ships instead of needing another edit. Tapping the line expands
  the 5 most recent titles (`deriveCoachChatsMeta` in `App.jsx`).

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
  **A first narrow slice shipped 2026-07-17** — `resolveBaseRateForWeek()` / `buildYear(cfg,
  baseRateHistory)` (§15.D), covering `baseRate` only, added because Quick Rate Update's live QA
  caught the exact bug this bullet describes (a rate edit was retroactively rewriting elapsed
  weeks). The general resolver for every other whitelisted field is still unbuilt — treat this as
  proof of the pattern, not the read path being done.

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

**Resynced 2026-07-17 — §A/§B/§C were stale.** This whole section sat unchecked while the actual
feature shipped; verified against source and against `docs/active-systems.md` §10 (which already
correctly flags itself as "more built than TODO.md §15's checkbox state suggests"). Real gaps are
§D, the back half of §H, and §I — see those sections below. §A/§B/§C are collapsed to a status
note rather than re-listed here to avoid two competing specs for the same shipped code.

---

### A–C. Entry Point, Structure Overwrite Wizard, Job Loss Mode — LIVE, see `active-systems.md` §10

- **§A Entry Point** — `LifeEventMenu.jsx` (3-tile modal: Pay Structure Changed / Lost My Job /
  Quick Rate Update). Wired in `App.jsx`; also reachable from `ProfilePanel`'s "Life Events" row.
- **§B Structure Overwrite Wizard** — `SetupWizard.jsx`'s `lifeEvent="structure_change"` path:
  brief re-entry overview at Step 0, every field pre-fills from `originalConfig`, `StructureChangeDiff`
  renders on Wrap Up, DHL↔base preset switching reuses the normal Step 1 fields.
  `jobLossFlow.test.jsx` covers the flow.
- **§C Job Loss Mode (C1–C6, all live)** — `JobLossEntry.jsx` → `JobLossDashboard.jsx`
  (unemployment benefits gate/amount/duration/waiting-week, runway calculator, bill countdowns,
  with/without-unemployment scenario toggle), `ExpenseTriage.jsx` (`jobLossStatus:
  active|paused|cancelled` per expense, auto-reactivate on Back to Work), `ReemploymentTracker.jsx`
  (target income, return date, application log w/ 6 status states). `config.jobLossMode` /
  `jobLossDate` zero earned income forward in `buildYear()` (`finance.js`). Persistent amber banner
  in `App.jsx` while active; "Back to Work" clears job-loss fields and re-enters the wizard as
  `structure_change`. `jobLossFlow.test.jsx` (20 tests) + `buildYearJobLoss.test.js` cover it.
- **Don't re-spec this from scratch** — any future work here (tweaks, bugfixes, extensions) should
  read the actual files above first, not this doc.

---

### D. Quick Rate Update (non-structural raise) — BUILT 2026-07-17

*For when the pay structure stays the same but the rate changed — shouldn't require a full wizard.*

- [x] **Rate update modal** — `src/components/RateUpdateModal.jsx`: single screen, new hourly
  rate + effective date. **Dropped the "optional note" field** — there's no schema field or any
  other place for free-text notes to go on a rate change, so a note input with no destination
  would've been dead UI; cut rather than half-built.
- [x] **Effective-date handling** — **not** `firstActiveIdx` (that's the account-wide "when did
  this account start" scalar, unrelated to a single field edit). Instead uses the account_history
  mechanism §19 already shipped: the modal's date travels as `effectiveFrom` into
  `configHistoryMetaRef` exactly like `JobLossEntry`'s `jobLossDate` does, tagging the automatic
  config-history snapshot with `source: "life_event:rate_update"`. `baseRate` was already on the
  §19 historically-sensitive whitelist, so no new plumbing was needed there.
- [x] **Confirmation diff** — shows old rate → new rate + an estimated weekly net delta, computed
  via a new shared `estimateWeeklyNet()` (`src/lib/finance.js`) extracted from `SetupWizard.jsx`'s
  `StepWrapUp` live-preview formula (was duplicated logic in the wizard alone; now both callers
  read the same formula rather than risking drift).
- [x] **Wired live** — `LifeEventMenu.jsx`'s tile flipped from `comingSoon: true` to
  `route: "rate_update"`; `App.jsx` opens the modal and applies `{ baseRate }` to config on confirm.
  7 new tests in `jobLossFlow.test.jsx` (prefill, validation gate, confirm payload, cancel, Escape,
  menu routing). 1032 tests passing; lint diff-clean vs. baseline; production build green.
- **Not yet verified live** — same sandbox limitation as everything else in this repo (no
  Supabase credentials here): unit tests + build only. Needs a real click-through on a deployed
  preview to confirm the modal opens from the Life Events menu and the account_history snapshot
  actually lands with the right `effectiveFrom`.
- [x] **Point-in-time correctness fix (2026-07-17) — the effective date now actually gates the
  math.** Live-QA caught that the original ship of this feature had the effective date do nothing
  but tag the audit-trail snapshot — `buildYear()` applied the new `baseRate` uniformly to every
  week including already-elapsed ones the moment Confirm was hit, silently rewriting past months'
  reported income and every annual total (Tax Plan, goal timeline) that sums across the whole
  year. Fixed as a deliberately narrow slice of §19's deferred Master Timeline read-path — **just
  `baseRate`**, not a general point-in-time config resolver:
  - `resolveBaseRateForWeek(rateHistory, weekEnd, liveBaseRate)` (`lib/finance.js`) — mirrors
    `getEffectiveAmount`'s exact algorithm (latest entry with `effectiveFrom <= weekEnd`, else
    fall back to the live rate). `buildYear(cfg, baseRateHistory = null)` takes an optional new
    param; omitted (every call site except App.jsx's live one — SetupWizard, DemoAccountTree, the
    math-audit trace helper) behaves byte-identical to before.
  - `db.js`'s `loadUserData()` fetches `account_history` rows filtered to `baseRate` changes as an
    isolated query (same missing-table tolerance pattern as `week_confirmations`) and maps them to
    `{ effectiveFrom, baseRate }` via new `extractBaseRateHistory()`.
  - `App.jsx` threads `baseRateHistory` state through `applyLoadedData`/`handleForcePull`, passes
    it into the one live `buildYear(config, baseRateHistory)` call, and optimistically appends a
    local entry the instant a `baseRate` edit's `saveConfigSnapshot` fires — closes the gap where,
    without it, a **future-dated** effective date would misapply the new rate too early to weeks
    between today and that date, since the just-inserted DB row hasn't round-tripped into memory yet.
  - **Deliberately out of scope**: every other historically-sensitive field (schedule, tax rates,
    benefits, ...) still applies uniformly to every week as before — this is not §19's read path
    being "done," just the one field this feature surfaced. `calcEventImpact`'s own `cfg.baseRate`
    reads (Log panel per-event math) and the bucket-payout-rate fallback are untouched — those
    price a specific already-logged event against *current* config by design, not an annual grid.
  - 13 new tests (`resolveBaseRateForWeek` + `buildYear` point-in-time cases in `finance.test.js`;
    `loadUserData` baseRate-history mapping/fallback cases in `db.test.js`). 1063 tests passing;
    lint diff-clean; production build green.

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
  (user-entered) used to pre-fill application fields and feed the AI assistant context. Scoped as
  plain user-entered text for auto-fill, not a file upload or an AI-analyzed résumé — that's a
  separate feature, now scoped at **§18.E1** (résumé upload / skill-gap analysis).

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

### H. Jobless Onboarding Path — BUILT 2026-07-18 *(seeded 2026-05-15)*

*A new first-run wizard question — "Are you currently unemployed?" — was planted in Step 0.
Today both Yes and No route through the standard pay-structure steps (DHL question next),
and the answer is stored on `config.startedUnemployed`. The plan below builds that seed into
a true branched onboarding so jobless users land in a usable app from day one.*

#### H1. Branched Step 0 routing — DONE

- [x] **Persist `startedUnemployed` to Supabase** — no new plumbing needed; it was already a
  plain `DEFAULT_CONFIG` field, round-trips via the normal `config` JSONB merge same as every
  other scalar config value.
- [x] **Wizard routing** — `SetupWizard.jsx`'s `STEP_DEFS` gained a shared `isFirstRunJobless(d,
  ev) = ev === null && d.startedUnemployed === true` predicate. Steps 1–4 and the normal Wrap Up
  all now `showIf: (d, ev) => !isFirstRunJobless(d, ev)` — genuinely skipped from `activeSteps`,
  not just hidden — and three new steps (ids 10–12) show only when `isFirstRunJobless` is true.
- [x] **Re-entry guard** — `isFirstRunJobless` requires `ev === null`; any life-event re-entry
  (including `structure_change`) always gets the full normal step set regardless of
  `startedUnemployed`, confirmed by a dedicated test.

#### H2. Jobless Setup mini-flow — DONE, consolidated to 3 screens

*Built as 3 actual wizard steps rather than 5 separate screens — 0a+0b share one screen (same
fields as the already-existing `JobLossEntry.jsx` modal for the same data), 0c+0d share one
screen, 0e is its own confirm screen. Fewer taps for a "quick" onboarding without dropping any
required field.*

- [x] **Screen 1 — `StepJoblessBenefits`** (0a+0b): unemployment Y/N gate; if Yes, weekly amount,
  duration in weeks, waiting-week toggle. `isValid` requires an explicit answer (mirrors
  `JobLossEntry`'s `canActivate`).
- [x] **Screen 2 — `StepJoblessDetails`** (0c+0d): job-loss effective date, defaulted to today
  the moment "Yes" is answered at Step 0 (overridable here) — **not** deferred to this screen,
  since `firstActiveIdx`/`startDate` also need a same-instant default and there's no other step
  left to set them. Optional prior hourly rate, assumed a 40hr week, computed straight into
  `targetIncomeAnnual` (the exact field `ReemploymentTracker` already reads with priority) —
  **dropped "prior employer name"** from the original spec: there's no schema field or any
  consumer for free-text employer identity anywhere in the app (confirmed against §19's own
  parked "future fields" list), so it would've been a UI input with nowhere to go. Same
  no-dead-inputs call as Quick Rate Update's dropped "note" field.
- [x] **Screen 3 — `StepJoblessWrapUp`** (0e): plain confirm/finish summary (job loss date,
  benefits, target income if set) — no live net preview, since there's no pay structure to
  preview yet.

#### H3. Wizard completion path for jobless users — DONE

- [x] **`onComplete` payload** — no special-casing needed in `handleComplete()`: every jobless
  step writes directly into `formData` via the wizard's normal `onChange`, so `jobLossMode`,
  `jobLossDate`, and the four unemployment fields are already present by the time the generic
  `{...finalData, taxedWeeks, accountCreatedIdx, setupComplete: true}` spread runs.
  Test-verified via the full payload from a completed run.
- [x] **Land on Job Loss Dashboard** — turned out to already be free: `App.jsx` renders
  `JobLossDashboard` unconditionally whenever `config.jobLossMode` is true, above the normal
  panel switch, regardless of which nav tab is active — first paint after any jobless
  completion already shows it with zero new code.
- [x] **Skip default Food expense seeding** — `App.jsx`'s `handleWizardComplete` now sets
  `expenses: []` (passed directly into the eager-save overrides, not a separate `setExpenses`
  call, to avoid racing React's not-yet-flushed state) when `wizardEntry === false &&
  finalConfig.jobLossMode === true`.

#### H4. "Back to Work" exit for users who started jobless — DONE

- [x] **First-time pay-structure wizard** — the existing "Back to Work" button already routed
  into `structure_change`, which already walks steps 1–4 + Wrap Up in full — this bullet turned
  out to already be satisfied by reusing that flow rather than needing a separate one.
- [x] **Diff view degrades gracefully** — `StructureChangeDiff` now checks
  `originalConfig?.startedUnemployed === true` first and renders a dedicated "filling in a real
  pay structure for the first time" message instead of the field-by-field diff. Necessary
  because `DEFAULT_CONFIG`'s pay fields are real-looking non-null placeholders (e.g.
  `baseRate: 19.65`, not `null`) — without this, the diff would have shown a fabricated "before:
  $19.65/hr" as if it were the user's actual old job.
- [x] **Clear `startedUnemployed` on success** — `App.jsx`'s `handleWizardComplete` clears it to
  `false` specifically when `wizardEntry === "structure_change" && mergedConfig.startedUnemployed
  === true`, so a later real job loss doesn't incorrectly trigger the H5 "no prior pay history"
  copy once the user actually has pay history.

#### H5. App shell signals — DONE

- [x] **Banner copy** — the Job Loss Mode banner in `App.jsx` now branches on
  `config.startedUnemployed === true` to show "Started in Job Loss Mode — no prior pay history"
  instead of the normal "$0 earned income from [date] forward" copy.
- [x] **"Set up essential expenses" prompt** — new tile in `JobLossDashboard.jsx`, shown whenever
  `expenses` is empty (the exact state H3's Food-seed skip leaves a fresh jobless account in),
  routing via a new `onOpenTriage` prop `App.jsx` wires to `setExpenseTriageOpen(true)`.

**Verification:** 14 new tests (11 in `SetupWizard.test.jsx` covering step routing/collapse,
validation gates, full payload contents, and the diff empty-state; 3 in `jobLossFlow.test.jsx`
for the new dashboard prompt). 1084 tests total passing; lint diff-clean vs. baseline; production
build green. **Not covered by tests:** `App.jsx`'s `handleWizardComplete` conditionals
(Food-seed skip, `startedUnemployed` clear) — same "no component test harness" gap already noted
for the SIGNED_IN short-circuit in §15.I's parked live-verification bullet; needs a real
click-through (start signup → answer Yes → finish → confirm empty expenses + Job Loss Dashboard
→ Back to Work → confirm diff empty-state + `startedUnemployed` cleared) on a deployed preview.

#### H6. Job Loss Mode nav & panel scoping — SUPERSEDED by H7 (see below), 2026-07-18

*Live click-through of H1–H5 surfaced two real gaps not in the original spec: (1) Back to Work
left the account with zero expenses permanently — H3's Food-seed skip has no counterpart restore;
(2) the full 5-tab nav (Home/Income/Budget/Log/Account) stayed up throughout Job Loss Mode, so
Income and Log — both built entirely around an active pay structure — sat there showing
meaningless or stale figures.*

*Original fix (shipped, then explicitly rejected by the user the same day): hide the "Financial
Health" tiles inside the normal `HomePanel` and pin `JobLossDashboard` above it as a standalone
card, with expense triage in a separate `ExpenseTriage` modal. User feedback: "I believe we are
coding this in a direction away from my vision... job loss mode is seeming to be a singular
'pinned to top' component. We need to think of this as an entirely different mode the app enters."
The nav-reduction bullet (bottom nav/sidebar → Home/Budget/Account) and the Food re-seed fix were
correct and are unaffected — both carried forward as-is. The Home/Budget-panel approach itself
was replaced; see H7.*

- [x] **Back to Work restores the mandatory Food expense** — still current; see H7 for the file
  this now lives next to.
- [x] **Bottom nav (mobile) + sidebar (desktop) drop to Home/Budget/Account while `jobLossMode`
  is true** — still current, unchanged by H7.
- ~~HomePanel tile-hiding~~ / ~~ExpenseTriage modal~~ / ~~pinned JobLossDashboard card~~ — all
  **removed** in H7 in favor of dedicated mode components.

---

#### H7. Job Loss Mode as a genuinely distinct app mode (Home + Budget rebuild) — DONE 2026-07-18

*Direct response to the course-correction quoted in H6. The ask: Job Loss Mode is not the normal
Home/Budget panels with things hidden or a card slapped on top — it's a different mode the app
enters, with its own Home view and its own Budget view (savings/unemployment numbers + inline
expense triage), plus a small "log extra income" widget on the new Home feeding the runway's
savings figure. Explicitly framed by the user as phase 1 of an iterative process, not a final
design.*

- [x] **`lib/jobLossRunway.js` (new)** — pure shared calc extracted from the old
  `JobLossDashboard`'s internal logic, so Home and Budget can't drift from each other:
  `firstUnemploymentPaymentDate(cfg)`, `sumJobHuntIncome(cfg)`, and
  `computeJobLossRunway({ config, expenses, effectiveToday, savings })` →
  `{ weeklyBurn, essentialCount, benefitsRemainingWeeks, projectedUnemploymentTotal, withBenefits,
  withoutBenefits }`. Takes `savings` as a plain argument rather than owning input state, since
  both panels need to read the same number without one owning the other's UI.
- [x] **`components/JobLossHomePanel.jsx` (new)** — the mode's actual Home view, rendered by
  `App.jsx` **instead of** `HomePanel` (not layered on top of it) whenever `config.jobLossMode`.
  Runway/weekly-burn/extra-income metric cards, a "Log Extra Income" widget (amount + note,
  disabled until a positive amount is entered, recent-entries list with per-entry delete), and the
  existing `ReemploymentTracker` embedded at the bottom.
- [x] **`components/JobLossBudgetPanel.jsx` (new)** — the mode's actual Budget view, rendered
  instead of `BudgetPanel`. Savings input + benefit-scenario toggle (the numbers this mode is
  actually about), an upcoming-bills countdown, and the full expense triage list — active/paused/
  cancelled, essential/flexible, needs-coverage flag, auto-reactivate, delete, plus a bulk "Pause
  all Flexible" — all inline, no modal. Add-expense form is deliberately simpler than normal
  `BudgetPanel`'s (label/category/flat monthly amount, no quarter-scoping or history editing) —
  **scope decision:** job-loss expense management is "what do I actually owe every week right now,"
  not fine-grained budget planning, so a flat weekly-forward amount is the honest fit for this mode
  rather than a lesser version of the normal flow.
- [x] **New config field `jobHuntIncomeLog: []`** (`constants/config.js`) — `{ id, amount, note,
  loggedAt }` entries logged from the Home widget, summed by `sumJobHuntIncome` into the runway's
  savings side. Chosen over reusing the existing `logs`/event-log mechanism because that mechanism
  carries payroll-tax semantics (gross/net, 401k, fiscal-week indexing) that don't fit informal gig
  cash — a dedicated field is more honest than forcing a fit.
- [x] **Deleted `components/JobLossDashboard.jsx` and `components/ExpenseTriage.jsx`** — logic
  fully absorbed into the two new panels and the shared runway lib above; confirmed via grep no
  other file referenced either before removing.
- [x] **`App.jsx` rewiring** — new imports; `jobLossSavingsDraft`/`jobLossIncludeBenefits` state
  lifted here (session-only, matches the original "not saved to your account" behavior) so both
  new panels agree without either owning the other's state; Home/Budget render blocks now branch
  `config.jobLossMode ? <JobLoss*Panel .../> : <*Panel .../>`; the standalone pinned dashboard
  render and the `ExpenseTriage` modal render are both gone; the banner's action button is now
  "Go to Budget" (`navigateDirect("budget")`) since triage lives on the Budget panel itself, not a
  modal the banner needs to open.
- [x] **`HomePanel.jsx` tile-hiding conditional reverted** — no longer needed or accurate:
  `HomePanel` doesn't render at all during Job Loss Mode anymore (App.jsx routes to
  `JobLossHomePanel` instead), so a dead `!config?.jobLossMode` guard around the Financial Health
  tiles would misdescribe the actual control flow.
- **Not changed this round (flagged, not decided):** `ProfilePanel`'s Job Loss handling (H6's
  "Job Search" group + Back to Work row) stays as a conditional branch inside the normal
  `ProfilePanel` rather than a fully separate component — the user's correction named Home and
  Budget specifically, not Account; left as-is pending confirmation this should also split out.
- **Verification:** `jobLossFlow.test.jsx` rewritten — old `JobLossDashboard`/`ExpenseTriage`
  describe blocks replaced with `JobLossHomePanel` (6 tests) and `JobLossBudgetPanel` (6 tests)
  blocks; `HomePanel.test.jsx` trimmed back to its original 2 tests (the tile-hiding tests removed
  along with the reverted conditional). Full suite: 1091 tests passing (including the
  `DEFAULT_CONFIG` snapshot updated for `jobHuntIncomeLog`). Lint diff-clean vs. session baseline
  (one pre-existing "memoization could not be preserved" line simply moved from the deleted
  `JobLossDashboard.jsx` to `JobLossBudgetPanel.jsx`, same underlying pattern, not a new problem).
  Production build green. **Not covered by tests:** no live click-through yet on a deployed
  preview — same category of gap noted throughout this file for `App.jsx`-level wiring that has no
  component test harness.

---

#### H8. Expense review + payment-date steps, and a real due-date bug fix — DONE 2026-07-18

*User feedback on H7: entering Job Loss Mode should walk the user through which bills to keep
tracking (not silently track everything from normal mode), and each kept bill needs a real payment
date — "when you create an expense in job loss budget mode it auto assumes it's due that creation
date." Root cause: `getNextDueDate` anchored on `billingMeta.effectiveFrom`, which normal
`BudgetPanel` stamps to today on every amount edit — it's an "amount last edited" timestamp, not a
bill due date, so any recently-touched or newly-created bill always showed due "today." (The
"can't put in an amount" half of the report turned out to already be fixed — `JobLossBudgetPanel`'s
add-expense form already had a working amount field before this pass.)*

- [x] **New `dueDateAnchor` field on expenses** (`lib/expense.js`) — a dedicated due-date anchor,
  separate from `billingMeta.effectiveFrom`. `getNextDueDate` now prefers it, falling back to
  `billingMeta.effectiveFrom` for expenses that predate it so old data keeps working unchanged.
- [x] **New `trackDuringJobLoss` field on expenses** (default `true` when absent) — set by the new
  review step below. `computeJobLossRunway` (`lib/jobLossRunway.js`) and `JobLossBudgetPanel`'s
  expense list/upcoming-bills/needs-coverage logic all filter on it. Untracked expenses vanish
  from Job Loss Home/Budget entirely — normal-mode `BudgetPanel` ignores the flag completely, so
  nothing is deleted, edited, or otherwise disturbed for when the user goes Back to Work.
  **Scope decision (not re-confirmed with the user after a tool-permission timeout):** went with
  the simpler of two options — untracked bills disappear outright rather than staying listed in a
  muted "re-enable inline" state. Flagging this in case the muted/re-enable version is actually
  wanted; it's a straightforward follow-up if so.
- [x] **`WEEK_OF_MONTH_OPTIONS` + `resolveWeekOfMonthAnchor` + `resolveDueDateAnchor`**
  (`lib/expense.js`) — "1st/2nd/3rd/4th week of month" quick-picks (days 1/8/15/22, clamped for
  short months) plus a manual date fallback, resolved to a concrete ISO anchor.
- [x] **New shared `DueDatePicker` component** (`components/DueDatePicker.jsx`) — the week pills +
  custom-date input, used by both new surfaces below so they can't drift.
- [x] **`JobLossEntry` (the "Lost My Job" modal — this app's closest thing to a job-loss setup
  wizard) extended into a 3-step flow:** Step 0 is the original date/benefits form, unchanged.
  Step 1 is a new expense-review checklist — every current expense listed, all checked by default,
  unchecking sets `trackDuringJobLoss: false` without touching anything else about the expense.
  Step 2 is a new payment-date step — one `DueDatePicker` per bill that's still checked, required
  before the final Activate. **Steps 1–2 are skipped entirely when there are no expenses to
  review**, so the original single-step "Activate" flow (and every existing test for it) is
  unchanged for that case. `onActivate(configPatch, updatedExpenses?)` now takes an optional second
  argument — only passed when there were expenses to review — that `App.jsx` uses to replace
  `expenses` alongside the existing config merge.
- [x] **`JobLossBudgetPanel`'s add-expense form fixed** — now includes a required `DueDatePicker`
  instead of silently anchoring to today; new expenses get `trackDuringJobLoss: true` and a real
  `dueDateAnchor` from the picker.
- **Verification:** `jobLossFlow.test.jsx` — 2 new `JobLossEntry` tests (full checklist → due-date
  → activate walkthrough asserting `trackDuringJobLoss`/`dueDateAnchor` on the result; Back
  navigation preserves Step 0 answers) plus the existing single-step tests all still pass
  unmodified per the skip-when-empty design; `JobLossBudgetPanel`'s add-expense test split into
  "blocked without a due date" + "adds with a real anchor, not today." `expenseCycles.test.js` —
  7 new tests for `dueDateAnchor` precedence/fallback, `resolveWeekOfMonthAnchor` (including short-
  month clamping), and `resolveDueDateAnchor`. Full suite: 1102 tests passing. Lint diff-clean vs.
  session baseline (caught and fixed a genuine rules-of-hooks violation — a `useMemo` placed after
  `JobLossEntry`'s early `return null` — during this pass, simplified away rather than hoisted,
  since the memoized array is cheap and small). Production build green. **Not covered by tests:**
  no live click-through on a deployed preview, same gap as H7; the review step's copy/UX (labels,
  scroll behavior with many bills) hasn't been eyeballed in a real browser either.

---

#### H9. Loans weren't grabbed into the H8 flow at all — DONE 2026-07-18

*User caught a real gap in H8: loans live in the same `expenses` array as regular bills
(`type: "loan"`, `category: "Loans"`, a `loanMeta: { totalAmount, paymentAmount, paymentFrequency,
firstPaymentDate }` object instead of `billingMeta`) — the checklist step already listed them (it
iterates `expenses` with no type filter), but `getNextDueDate` required `billingMeta` to exist at
all, so it silently returned `null` for every loan. Loans never showed up in Upcoming Bills, never
got a "Needs Coverage" flag, and displayed no amount in the JobLossBudgetPanel card list.*

- [x] **`getNextDueDate` (`lib/expense.js`) now has a loan branch** — for `type === "loan"`,
  anchors on `loanMeta.firstPaymentDate` (or a Job-Loss-attached `dueDateAnchor` if present) and
  advances using `paymentFrequency` mapped to the same day-counts as `EXPENSE_CYCLE_OPTIONS`
  (weekly=7, biweekly=14, monthly=30). The date-advancing math itself was extracted into a shared
  `advanceAnchorToNextDue` helper so the regular-expense and loan branches can't drift.
- [x] **New `getExpenseDisplayAmount(expense)` helper** — `loanMeta.paymentAmount` for loans,
  `billingMeta.amount` otherwise. Used everywhere `JobLossBudgetPanel` and `JobLossEntry` show a
  dollar figure so loans stop rendering as "$0" or blank.
- [x] **`JobLossEntry`'s Step 2 (payment date) skips loans entirely** — a loan already has a real
  payment date on file, so re-asking would be redundant. On confirm, tracked loans get
  `dueDateAnchor: loanMeta.firstPaymentDate` attached automatically (the "date that's already been
  selected" carried forward, per the request) instead of going through the `DueDatePicker`. A new
  `keptPickableExpenses` (kept, non-loan) list drives Step 2's UI/validation/skip-logic separately
  from `keptExpenses` (kept, everything) — so a loan-only selection skips Step 2 outright, same as
  an empty one.
- [x] **"Loan" badge added** in both the Step 1 checklist row and the `JobLossBudgetPanel` expense
  card list — small teal badge matching the existing "Essential"/"Flexible"/"Needs Coverage" badge
  language already in that list. Amount display for loans shows `$X/<frequency>` (e.g. `$200/
  monthly`) instead of the regular bills' `$X/mo`, since a loan's cadence is meaningful (matches
  what normal `BudgetPanel` already does for its own loan rows).
- **Not changed:** loan burn/runway math itself — `computeJobLossRunway` already included loans
  correctly before this fix, since it sums via `getEffectiveAmount(exp, ...)` which reads
  `exp.history` (populated by `buildLoanHistory` regardless of expense type), not `billingMeta`.
  Only the due-date/display-amount layer was blind to loans.
- **Verification:** `expenseCycles.test.js` — 4 new tests for the loan branch of `getNextDueDate`
  (monthly + weekly cadence, an attached `dueDateAnchor` taking precedence over
  `loanMeta.firstPaymentDate`, and the null cases). `jobLossFlow.test.jsx` — 1 new `JobLossEntry`
  test (loan shows the badge in Step 1, is absent from Step 2's picker list with an explanatory
  line, and lands with `dueDateAnchor` set to its own `firstPaymentDate` on activate) and 1 new
  `JobLossBudgetPanel` test (badge + `$200/monthly` display). Full suite: 1108 tests passing. Lint
  diff-clean vs. session baseline. Production build green. **Not covered:** a live click-through
  with a real loan on a deployed preview, same category of gap as H7/H8.

---

#### H10. Job Loss Mode components weren't eager-saving — DONE 2026-07-19

*Caught during a discussion of the Persistence — Eager Save Pattern (CLAUDE.md, documented on
Version-control the same day). Every mutation in `JobLossHomePanel`/`JobLossBudgetPanel`/
`ReemploymentTracker`/`JobLossEntry` built across §15.H7–H9 called raw `setConfig`/`setExpenses`
with no eager-save callback — none of it would survive a backgrounded/reclaimed tab before the
800ms debounce fired, the exact production data-loss bug the pattern exists to prevent. `App.jsx`
already threads `saveConfigNow`/`onSaveExpensesNow`/`savePersistedStateNow` to every normal-mode
panel; the Job Loss rebuild in H7 never picked them up.*

- [x] **`JobLossEntry`'s activation (`App.jsx`)** — the single highest-stakes gap, since
  activating Job Loss Mode is a one-shot action carrying the whole review/due-date flow's config +
  expenses patch. Now computes `nextConfig` synchronously and calls
  `savePersistedStateNow({ config: nextConfig, expenses: updatedExpenses })` (single atomic write
  covering both fields) right alongside the existing `setConfig`/`setExpenses` calls.
- [x] **`JobLossHomePanel`** — new `saveConfigNow`/`readOnly` props, `noop`-shadowed when
  read-only (same pattern as `HomePanel`/`BudgetPanel`, §17.E). `logIncome`/`removeEntry` compute
  the next config synchronously and eager-save it.
- [x] **`ReemploymentTracker`** (embedded in `JobLossHomePanel`, predates this session's rebuild)
  — new `applyConfigUpdate(updater)` wrapper, same shape as `BudgetPanel.jsx`'s
  `applyExpenseUpdate`; all 6 mutation sites (target income set/reset, return-to-work
  date set/clear, application add/edit/delete, status change) renamed to it, no logic
  hand-transcribed.
- [x] **`JobLossBudgetPanel`** — new `onSaveExpensesNow`/`readOnly` props; new
  `applyExpenseUpdate(updater)` wrapper (identical shape to `BudgetPanel.jsx`'s); triage status,
  auto-reactivate toggle, pause-all-flexible, remove, and add-expense all renamed to it. `readOnly`
  also hides the Add Expense form, Pause-all button, and per-row status/delete controls (matching
  normal `BudgetPanel`'s `!readOnly &&` convention) rather than just silently no-op'ing them.
- **Verification:** `jobLossFlow.test.jsx` — new tests asserting `saveConfigNow`/
  `onSaveExpensesNow` are called with the correct computed value for: removing a logged income
  entry, changing an expense's triage status, removing an expense, and setting target income on
  `ReemploymentTracker`; plus 2 new `readOnly` tests (`JobLossHomePanel` shadows both callbacks;
  `JobLossBudgetPanel` shadows both callbacks *and* hides its mutation controls). Full suite: 1111
  tests passing. Lint diff-clean vs. session baseline. Production build green. **Not covered:** a
  live click-through simulating an actual backgrounded-tab reload, same category of gap as
  everything else in this file requiring a deployed preview to verify by hand.
- **Known adjacent gap, not fixed here (flagged, out of scope for this pass):**
  `RateUpdateModal`'s `onActivate` handler (`App.jsx`) has the identical missing-eager-save
  pattern — same "Life Event" one-shot-activation shape as `JobLossEntry`'s `onActivate`, just for
  Quick Rate Update instead of Job Loss Mode. Worth a follow-up pass.

---

#### H11. "This Week's Check" showing a fraction of a real paycheck after Back to Work — DONE 2026-07-19

*User report: fresh live-tested account, Back to Work into a $22/hr weekly job, 40hr/wk — Income
panel and the Budget breakdown modal both correctly showed ~$714 net for the current week, but
BudgetPanel's "This Week's Check" / "Left This Week" tiles showed $293 / $75. Diagnosed live
against the user's actual Supabase `user_data.config` + `account_history` rows (no admin-tool
access on the test account, so raw table rows were pulled instead — same data Config Raw View and
the account_history baseRate ledger would show). Root cause was NOT a stale job-loss rate leaking
forward (the first hypothesis, ruled out by the actual `account_history` rows) — it's a plain unit
mismatch that hits any account that hasn't been active all 52 weeks of the fiscal year, which is
nearly every real account.*

- [x] **Root cause #1 — `prevWeekNet`'s empty-history fallback.** `App.jsx`'s `prevWeekNet` (read by
  "This Week's Check"/"Left This Week" in both `HomePanel.jsx` and `BudgetPanel.jsx`, and by
  `aiContext.js`'s "Left this week"/Coach line) is supposed to show last week's real, finalized
  paycheck. When there's no prior active week yet — day one after Back to Work, or any brand-new
  account — it fell back to `weeklyIncome`, which is `projectedAnnualNet / 52`. For an account
  active only 24 of 52 weeks, that's the year's real income diluted by 28 weeks of $0 that haven't
  happened yet, not a paycheck. Fixed by falling back to the **current** active week's real
  computed net (already-correct math, just not what the fallback read) instead, only falling back
  to `weeklyIncome` when there's no active week to read at all (e.g. indefinite Job Loss Mode).
  New shared `resolvePrevWeekNet()` (`lib/finance.js`) replaces the duplicated inline version in
  `App.jsx` **and** `DemoAccountTree.jsx` (same bug, same copy-pasted logic, would've hit demo/
  investor accounts too).
- [x] **Root cause #2 — `weeklyIncome` itself divides by a flat 52.** Broader and more serious than
  the tile bug: `weeklyIncome = projectedAnnualNet / 52 - bufferPerWeek` assumes the account was
  active the whole fiscal year. `HomePanel.jsx`'s "Net Worth Trend" tile already tried to correct
  for this on the *annual savings* side — `annualSavings = avgWeeklySurplus * activeWeeksThisYear`
  — but `avgWeeklySurplus` is built from the still-diluted `weeklyIncome`, so the two didn't agree:
  for a 24-active-week account, `annualSavings` came out roughly diluted by another 24/52 on top of
  itself (confirmed: a synthetic 24-active-week case priced `annualSavings` at $12,000 vs. the
  mathematically correct answer — the old formula gave a materially different, wrong number, not a
  rounding difference). Separately, `aiContext.js`'s own `annualSavings`/`netWorthHealth` used a
  **hardcoded** `* 52` (not `activeWeeksThisYear` at all) — a straight-up drift from the Home tile
  it's labeled as matching, the exact anti-pattern `docs/active-systems.md` §24's grounding
  discipline exists to prevent. Fixed by scaling `weeklyIncome` by the real active-week count
  instead of a flat 52 in `App.jsx` and `DemoAccountTree.jsx` (byte-identical output for any
  `firstActiveIdx: 0` account — i.e. every existing test fixture — since 52 active weeks ÷ 52 is
  unchanged), and by giving `aiContext.js` the same `activeWeeksThisYear` derivation so the Coach
  can't state a "Home tile" figure the Home tile doesn't actually show.
- [x] **New shared `resolveActiveWeeksThisYear(firstActiveIdx)`** (`lib/fiscalWeek.js`) — one
  formula (`FISCAL_WEEKS_PER_YEAR - firstActiveIdx`, clamped to 0) now backs `App.jsx`'s
  `weeklyIncome`, `DemoAccountTree.jsx`'s `weeklyIncome`, `aiContext.js`'s `annualSavings`, and
  `HomePanel.jsx`'s own `annualSavings` (swapped from its local inline copy to the same helper) —
  four previously-independent copies of the same expression down to one, so this can't re-drift.
  `traceExpenseCalculationSteps`'s own diagnostic `weeklyIncome` mirror (`lib/finance.js`) also
  switched from `/52` to its own already-computed `activeWeeks.length`, so the audit trace explains
  the real formula instead of the one it replaced.
- [x] **Dead fallback purged, not just left inert.** `HomePanel.jsx`'s `monthlyTakehome` used to
  read `adjustedTakeHome ?? (weeklyIncome * FISCAL_WEEKS_PER_YEAR)` — the same flat-52 shape as the
  bug just fixed, confirmed dead (both live callers, `App.jsx` and `DemoAccountTree.jsx`, always
  pass a real `adjustedTakeHome`) but left in place initially. Removed outright rather than left as
  inert-but-present: dead code shaped exactly like a bug that was JUST fixed elsewhere reads as a
  pattern to copy to a future session with no memory of this investigation. Now
  `(adjustedTakeHome ?? 0) / 12`, with a comment on the `adjustedTakeHome` prop itself
  (`HomePanel.jsx` ~line 38) spelling out why re-adding that fallback would reintroduce the bug.
  Re-verified: 1128 tests passing, lint diff-clean, build green.
- **Not fixed here — real scope, deliberately deferred, not urgent (flagged 2026-07-19):** see
  §15.H12 below for the full write-up. Short version: none of H11's fix accounts for mid-year gaps
  *within* an otherwise-active year (Job Loss Mode weeks sitting inside the active range) — only
  for an account that started the year late.
- **Verification:** 9 new tests — 4 in `finance.test.js` (`resolvePrevWeekNet`: current-week
  fallback vs. the old diluted average, real-past-week case unchanged, indefinite-Job-Loss-Mode
  fallback to `weeklyIncome`, log-adjustment applied on the new fallback path too), 4 in
  `fiscalWeek.test.js` (`resolveActiveWeeksThisYear` full-year/partial-year/null/clamp cases), 1 in
  `aiContext.test.js` (Coach's `annualSavings` now scales by `activeWeeksThisYear` from
  `config.firstActiveIdx`, not a flat 52 — asserts the old drifted $26,000 does NOT appear). Full
  suite: 1128 tests passing. Lint diff-clean vs. a true `git stash`-verified baseline (not just the
  session-start snapshot — re-ran eslint against unstashed HEAD to confirm the diff is only line-
  number shifts from added code, zero new problems). Production build green. **Not covered:** no
  live click-through on a deployed preview — same category of gap as everything else in this file;
  the original report came from a real device, but confirming the *fix* still needs a redeploy.

---

#### H12. Annual pace figures don't yet exclude mid-year Job Loss gaps — SCOPED, not started

*Flagged during H11, deliberately not attempted in the same pass — H11 fixed "account started the
year late," this is the different, harder problem of "account had a gap in the middle of an
otherwise-active year." User's own framing of the target: score $20k over 4 months, 6 weeks
unemployed with no draw, score $28k over the next 2 months, then a clean job change with two
weeks' notice (no gap), finishing the year at a third job pulling $50k. The week-by-week numbers
already handle this correctly today — this gap is specifically in the *annual rollup* figures.*

**What already works (no change needed):** `buildYear()`'s own `active` flag
(`lib/finance.js:620`, `const active = idx >= cfg.firstActiveIdx && !inJobLoss;`) already zeroes
out Job Loss Mode weeks correctly, wherever they fall in the year — this is not a per-week bug.
`lib/jobLossRunway.js`'s `computeJobLossRunway()` (line 43) is the existing model for gap-aware
math done right: it takes the real week array and sums only what's actually earned, not a
count-based average. Any fix here should read the same way — derived from `allWeeks`, not from a
second `firstActiveIdx`-vs-`today` range computation.

**What doesn't yet work:** every annual-pace figure introduced or touched in H11 —
`activeWeeksThisYear` itself (`resolveActiveWeeksThisYear()`, `lib/fiscalWeek.js:15`) — is
`FISCAL_WEEKS_PER_YEAR - firstActiveIdx`, a plain range from account start to year-end. It has no
idea a chunk of that range was actually a Job Loss Mode gap with $0 real earnings. Four call sites
inherit this blind spot because they all key off the same helper:
- `App.jsx:1184-1185` — `weeklyIncome`'s divisor
- `components/DemoAccountTree.jsx:281-282` — same, demo/investor accounts
- `components/HomePanel.jsx:104` — `annualSavings`'s multiplier (Net Worth Trend tile)
- `lib/aiContext.js:98` — Coach's `annualSavings`/`netWorthHealth` copy

Concretely, for the user's own example: an account active weeks 0–51 with a 6-week Job Loss gap
mid-year currently computes `activeWeeksThisYear = 52 - 0 = 52` (job "started" week 0, so the range
looks full-year) even though only 46 weeks actually earned anything. `projectedAnnualNet` (the
numerator, from `buildYear`) is already correct — it's genuinely the sum of the 46 real weeks — but
dividing/multiplying by 52 instead of 46 means `weeklyIncome`, `annualSavings`, and the Coach's
narration of both would all be **diluted low** by exactly the size of the gap, the same shape of
bug H11 fixed, just triggered by a different condition (a gap inside the range, not a late start).

**Why this wasn't just folded into H11:** the fix isn't "swap `resolveActiveWeeksThisYear`'s
formula" — it needs `allWeeks.filter(w => w.active).length` (a value that isn't uniformly available
at every H11 call site without also threading `allWeeks` there — `aiContext.js` already receives
`allWeeks` as a prop, but `HomePanel.jsx` and `DemoAccountTree.jsx` would need it added). It also
raises a real product question H11 didn't have to answer: should a *closed* gap (the person is
back to work now, this is retrospective) pull the annual pace down permanently, or should the
Job-Loss weeks be excluded from the numerator's week-count but the *post-return* pace get its own
forward-looking read (closer to what `computeJobLossRunway`/the Coach's runway math already do
during an *active* Job Loss Mode)? That's a design call, not a bug-fix call, and worth its own
scoped pass rather than a rushed answer bolted onto H11's commit.

**Suggested shape of a future pass (not a commitment, just an entry point):** replace
`resolveActiveWeeksThisYear(firstActiveIdx)`'s four call sites with something keyed off
`allWeeks.filter(w => w.active).length` directly (thread `allWeeks` to `HomePanel.jsx`/
`DemoAccountTree.jsx` where it's missing), decide the retrospective-vs-forward-pace question above
with the user first, then re-verify `annualSavings`/`weeklyIncome` against a synthetic multi-job,
mid-year-gap fixture (`buildYear` + a `jobLossMode`/`jobLossDate`/`returnToWorkDate` window,
similar to the existing `finance.test.js` `buildYear — point-in-time baseRate` fixtures) before
touching `App.jsx`/`HomePanel.jsx`/`aiContext.js` again.

---

#### H13. Cash on hand — from session-only draft to a persisted, mandatory field — DONE 2026-07-19

*User framing: the runway calc's "accessible cash on hand" figure needed to actually stick —
persisted and eager-saved, not a draft that evaporates on reload — and needed to be *the* input
that kicks off Job Loss Mode's runway math, not an easy-to-miss optional field discovered only on
Budget. Explicitly the first of a two-part ask: get the number to persist and be prominent first;
richer uses of it (the "more interesting and useful things") are a deliberate follow-up, not
attempted here.*

- [x] **New persisted config field `jobLossCashOnHand`** (`constants/config.js`) — `null` = never
  set (pre-existing accounts only; the wizard makes it mandatory going forward), any number
  including `0` = a real answer. Replaces the old `jobLossSavingsDraft` React state that lived in
  `App.jsx` and was explicitly documented as "not saved to your account."
- [x] **Mandatory in `JobLossEntry.jsx`'s Step 0** — new "Cash on hand right now" field between the
  date and the unemployment Y/N gate. Validation (`cashOnHandValid`) accepts any finite number ≥ 0
  including 0, rejects empty — folded into `step0Valid` alongside the existing date/unemployment
  checks. Ghost placeholder is `"e.g. 1,023"` (deliberately specific, not a round number, so it
  reads as an example rather than a suggested default).
- [x] **Real red-border feedback, not just a blocked button — required fixing a click-through bug
  along the way.** The Next/Activate button already visually greys out when a step is invalid
  (`nextDisabled`), and was *also* passed as the literal `disabled` prop on the underlying
  `<button>`. A native disabled button never dispatches `onClick` at all — so the existing
  `attempted`/red-border mechanism (used for the Step 2 due-date picker too) could never actually
  fire from a click on that button; tapping it while invalid did visibly nothing, no red border, no
  message, just silence. Confirmed by writing the intended test first and watching it fail for the
  right reason. Fixed by splitting the single `nextDisabled` variable into two: `nextDisabled`
  (unchanged, still drives the grey/teal styling) and a new `nextNativeDisabled` that's `false` for
  Step 0 specifically — the button now stays genuinely clickable there, so a tap while empty
  reaches `goNext()`'s `setAttempted(true)` branch and the red border/`"↑ Required — 0 is a fine
  answer, just not empty"` message actually shows. Steps 1–2 keep the prior native-disabled
  behavior unchanged (same latent gap likely exists there too — e.g. Step 2's due-date picker error
  state — but that's pre-existing, untouched, and out of scope here; flagged, not fixed).
- [x] **Editable from both `JobLossHomePanel.jsx` (new) and `JobLossBudgetPanel.jsx` (existing input
  repointed)** — neither "owns" the field; both hold a local string draft (Numeric Input Standard:
  never coerce on `onChange`, only `parseFloat` at commit) and commit via `onBlur`, not per
  keystroke. Draft re-sync from the persisted value (e.g. edited on the other panel, then navigated
  back) uses React's documented "adjust state during render" pattern — comparing against a
  `lastSyncedCash` ref-like state and calling `setCashDraft` directly in the render body — instead
  of a `useEffect`, which would have tripped `react-hooks/set-state-in-effect` (caught by the lint
  diff check, not guessed at). `JobLossHomePanel`'s placement is directly below the Runway/Weekly
  Burn/Extra Income metric row, above Log Extra Income — the most prominent surface on the mode's
  own Home view, per the ask to make this "more present and more important than it currently is."
- [x] **Eager-saved on blur** (docs/TODO.md "Persistence — Eager Save Pattern") — both panels
  compute the parsed number synchronously and call `setConfig`/`saveConfigNow` together, skip the
  write entirely when the blurred value matches what's already persisted (no-op saves avoided).
  `JobLossBudgetPanel` didn't receive `setConfig`/`saveConfigNow` props before this pass (it only
  ever touched expenses) — threaded in from `App.jsx` for the first time, with the same `readOnly`
  no-op shadow `JobLossHomePanel` already had from §15.H10, plus `disabled={readOnly}` on the input
  itself so a paywall-expired account can't edit even though the write path is already a no-op
  (defense in depth, matching the existing convention documented in CLAUDE.md's eager-save section).
- [x] **`App.jsx` simplified** — the lifted `jobLossSavingsDraft`/`setJobLossSavingsDraft` session
  state is gone entirely; both panels independently derive their own draft from the same
  `config.jobLossCashOnHand` prop they already receive, with no cross-panel state to keep in sync
  (they're never mounted simultaneously — Home and Budget are mutually exclusive tab renders).
  `jobLossIncludeBenefits` (the benefit-scenario toggle) is untouched, still session-only by design.
- **Not attempted here (explicitly deferred by the user's own framing):** no new runway/display
  logic built on top of the persisted number beyond what already reads `manualSavings` — the ask
  was to get it to stick and be prominent *first*. Also unaddressed: Step 1/2's own pre-existing
  native-disabled click-through gap (see above), and pre-existing accounts that entered Job Loss
  Mode before this field existed will read `jobLossCashOnHand: null` → `manualSavings` treats that
  as `0`, same as an explicit zero — quietly correct behavior, not a migration, but worth knowing
  if a real account's runway looks off after this ships.
- **Verification:** 15 new/updated tests in `jobLossFlow.test.jsx` — 6 for `JobLossEntry`'s Step 0
  gate (blocks Next while empty with no red border before the first attempt, shows the red border/
  required message after a failed attempt, clears it once a valid value is entered, accepts `0`,
  persists across Back navigation, included in every existing activation test's expected payload)
  plus 4 existing tests updated to fill the now-mandatory field; 4 for `JobLossHomePanel`'s Cash On
  Hand input (pre-fills from config, eager-saves on blur only — not on every keystroke — skips the
  save when unchanged, disabled when `readOnly`); 3 equivalent for `JobLossBudgetPanel`'s existing
  input repointed to the persisted field. `DEFAULT_CONFIG` snapshot updated for the new field. Full
  suite: 1138 tests passing. Lint diff-clean vs. a true `git stash` baseline (caught and fixed two
  real new issues before landing: a `react-hooks/set-state-in-effect` error from the first draft's
  `useEffect`-based re-sync, and a `react-hooks/preserve-manual-memoization` error the render-time-
  sync rewrite exposed on `JobLossHomePanel`'s pre-existing `entries` memo — an inconsistent
  `config?.jobHuntIncomeLog` optional-chain that didn't match the rest of the file's non-optional
  `config.jobHuntIncomeLog` access; normalized to match). Production build green. **Not covered:**
  no live click-through on a deployed preview — same category of gap as everything else in this
  file; the red-border fix in particular deserves an eyeball on a real device given how it was found.

---

#### H14. Birdseye review — a full walk-through edge case, 2026-07-19 — SCOPED, nothing started

*User exercise: walk one concrete character through the whole mode — loses job with $400 cash and
a half paycheck still owed (biweekly, job loss lands mid-period), 4 Needs bills ($1,500/mo, staggered
due dates), 3 Lifestyle bills ($60/mo), keeps every bill tracked (stubborn), starts logging
applications same-day. Purpose was to find where the architecture actually falls short of "spot-on
runway, best help finding work" rather than trusting the checkbox state. Everything below is a
documentation-only pass — research and scoping, explicitly not implementation. Ordered roughly by
how directly each one touches "is the runway number on screen actually correct."*

- [ ] **No pending/final-paycheck concept in the runway calc.** `buildYear()`'s job-loss zeroing
  (`lib/finance.js:592-602`, `inJobLoss`) zeroes the *entire* fiscal week containing `jobLossDate`
  — not prorated, so days already worked that week vanish from every projection (Income panel,
  Budget breakdown, Home/Budget runway) the instant the mode activates. `computeJobLossRunway`'s
  `savings` parameter (`lib/jobLossRunway.js:43`) is only `jobLossCashOnHand + sumJobHuntIncome()`
  — there's no field, no date, no concept anywhere for "I'm still owed a paycheck that hasn't
  posted yet." For a biweekly user whose job loss lands mid-period, that's real, expected money the
  runway cliff date doesn't know about until the user manually bumps their cash-on-hand number
  after it actually lands — and nothing prompts them to do that.
  **Sketch of a minimal fix** (not committed to, needs user sign-off first): a single optional
  `jobLossPendingPaycheck: { amount, expectedDate }` pair, asked once in `JobLossEntry` Step 0
  right after cash-on-hand ("Any paycheck still coming that you haven't been paid yet?" — skippable,
  unlike cash-on-hand which stays mandatory). `computeJobLossRunway` adds `amount` to the cash pool
  only once `effectiveToday >= expectedDate` — it's a scheduled inflow, not present-day cash, so it
  shouldn't extend the runway number until it's actually landed. Deliberately **not** a general
  point-in-time proration of the job-loss week itself (way bigger, touches DHL/base scheduling core,
  and the wizard has no "which days did you actually work" input to drive it) — a bolt-on amount +
  date is the honest, small version of this.
- [ ] **Lifestyle spend is invisible in the headline runway number, with no UI callout.**
  `weeklyBurn` (`lib/jobLossRunway.js:56-65`) explicitly excludes `category === "Lifestyle"` —
  a deliberate, reasonable design choice ("focuses on survival spend," per its own code comment)
  but nothing in `JobLossBudgetPanel`/`JobLossHomePanel` tells the user this. A user who keeps every
  bill active (the "stubborn" case) sees their 3 Lifestyle bills in the tracked list, due-date
  countdown, and "Needs Coverage" flag — but the $60/mo they're still actually paying never touches
  the "Weekly Burn" tile or the runway-days countdown. Their real runway is shorter than the number
  on screen, silently. **Sketch of a minimal fix:** a one-line "+ $X/wk Lifestyle spend (not counted
  in runway above)" caption under the Weekly Burn tile — no calc change, pure transparency.
- [ ] **`coachTriggers.js`'s `estimateRunwayDays` drift, now worse than when §18.E flagged it.**
  Already documented as a known second runway calc that doesn't respect `trackDuringJobLoss`
  (§18.E, "Known drift to fix"). Confirmed during this pass: it's *also* completely blind to
  `jobLossCashOnHand` (§15.H13) — its own doc comment says it "assumes $0 extra savings, the
  conservative floor," which predates cash-on-hand existing as a real field at all. For a user with
  real cash on hand (this scenario: $400), Coach's background Red-tier "you're running low" trigger
  computes a bleaker runway than what the user's own Home/Budget screens show them. Two drift
  sources stacked on the same function now, not one.
- [ ] **Coach never actually receives Job Loss Mode's numbers, even when Coach is reachable.**
  `lib/aiContext.js:199-201` has a `runwayDays` parameter and a "Job Loss Mode: active, ~N days of
  runway" line ready to use it — but `App.jsx` never passes `runwayDays` into `buildCoachContext` at
  any call site. Grepped to confirm: zero matches. So today the line always renders as the bare
  string `"Job Loss Mode: active"` — no runway, no burn, no benefits, no cash-on-hand reach Coach's
  system prompt at all. This is a live wiring gap on an existing parameter, not a "not built yet"
  item — the cheapest of everything in this list to close once someone's in that file.
- [ ] **AI features (Coach, and by extension the unbuilt Job Hunt Assistant/Job Scout) are
  `is_admin`/`is_tester`-gated** (`canAccessAiFeatures`, `entitlements.js`). A real user living this
  exact scenario likely cannot reach any of "getting the best help" today regardless of what gets
  built — worth keeping in view as a business/rollout question, not just an engineering one, before
  investing further in §18.E/§18.I.
- [x] **Résumé upload / skill tips / skill-gap analysis — scoped 2026-07-22, see §18.E1.** Was
  genuinely absent as an idea (only trace was one unbuilt chat prompt and a passing "resume text"
  auto-fill mention in §15.F). Now has a full spec: plain-text v1 (no file upload/parsing — a
  Supabase Storage bucket is new infra this codebase doesn't have anywhere yet, and text-in/
  text-out is a wash for the LLM either way), a new standalone `resume_profile` table (not a
  `config` field — modeled on `coach_chats`'s own-row-RLS pattern) that reads `ReemploymentTracker`'s
  `jobApplications` for a default target role rather than duplicating that data, and a new
  `resume_review` `coach_chats.chat_type` reusing `api/coach.js` end to end — no new serverless
  route. File upload (PDF/DOCX via Storage + client-side extraction) deferred to a v2 gated on v1
  actually proving demand. Still blocked on the same AI-gating question as everything else in this
  list (bullet above) before it can reach a real (non-admin/tester) user.
- **Not fixed, not scoped further, deliberately left as a list — user's own framing: "pick this
  apart... but maybe not immediately."** Recommend picking off the wiring-only items first
  (`runwayDays` into Coach, the Lifestyle-spend caption) since they're small and don't require a
  design decision, before touching the pending-paycheck field or the two-runway-calc unification,
  which both need the user's input on scope/design first.
- **All four `[ ]` gaps above closed, 2026-07-22 (H15/H16/H17) — checkboxes left unticked
  intentionally, as the historical record of what this birdseye pass actually found.** Pending
  paycheck → H15. Lifestyle-spend invisibility → H16. The two-runway-calc drift → H17 deleted
  `estimateRunwayDays` outright rather than retrofitting it (cleaner than either option this list
  proposed). `runwayDays` into Coach's context → wired the same pass. Only the AI-gating/business
  question (bullet above) and the résumé spec (already `[x]`) remain genuinely open.
- **AI-gating question resolved, 2026-07-25 (user directive) — see §18.E header for the full
  note.** Stays `canAccessAiFeatures` (`isAdmin`/`isTester`) until Job Hunt Assistant ships, then
  moves to a paid-tier gate (mirrors Coach's own `canAccessAskCoachGeneral` gate-flip,
  2026-07-24). The Job Hunt Assistant build itself is being tracked in a separate session —
  checkbox above left unticked as the historical record of what was open at the time of this
  birdseye pass, not because the question is still live.

#### H15. Pending/final paycheck — the first H14 gap, built, 2026-07-22 — DONE

*User asked directly for this one (not the "wiring-only items first" ordering H14 recommended):
mimic the weekly check-in's day-picker UX to ask "what days did you work in the last pay period,"
derive the lost job's pay-period-end date from existing pay-schedule config, ask a separate
day-of-week question for "when do checks normally arrive," and feed the result into the runway
formula as both an amount and an arrival date — plus a small UI line counting down to it.*

- [x] **`lib/jobLossRunway.js`** — three new pure functions, `computeJobLossRunway` extended:
  - `resolveLastPayPeriodEnd(jobLossDateIso, payPeriodEndDay, userPaySchedule)` — first
    occurrence of `payPeriodEndDay` on/after the job-loss date (schedule-length-agnostic: weekly
    and biweekly both just repeat the same weekday, so no separate biweekly branch); `monthly`
    falls back to the calendar month's last day, since there's no day-of-week concept.
  - `resolvePendingCheckArrivalDate(periodEndDate, arrivalDow)` — first occurrence of the
    user's answered arrival weekday strictly after the period end (payroll always lands at least
    a day after the period it covers).
  - `estimatePendingCheckAmount(workedDaysCount, cfg)` — same flat-rate sketch
    `ReemploymentTracker.jsx`'s `targetWeeklyNet` uses (gross minus fed/state/FICA/401k rates
    already on file); not a full `computeNet` pass, since this covers a check `buildYear` never
    actually computes (job-loss week is zeroed, not prorated — H14's other bullet, still open).
  - `computeJobLossRunway`'s `daysFromCash` rewritten piecewise: the pending amount only enters
    the cash pool once its arrival day is reached, not lump-summed into today's cash — if cash
    dries up before the check lands, the cliff hits at the dry-out point same as if the check
    didn't exist, exactly as the user asked ("what day to add check to the runway cash on hand
    bucket"). Returns a new `pendingCheck: {amount, date, daysOut} | null` field.
- [x] **`constants/config.js`** — `jobLossPendingCheckAmount`/`jobLossPendingCheckDate` added to
  `DEFAULT_CONFIG` (both `null` by default); snapshot updated (`npx vitest run -u`).
- [x] **`components/JobLossEntry.jsx`** — new Step 1 inserted between the existing Step 0
  (date/cash/unemployment) and the expense-review steps. Skippable Y/N gate ("Any paycheck still
  coming from that job?"); Yes reveals a Mon–Sun worked-days toggle grid (0 days is a valid,
  non-blocking answer) and a single-select arrival-day grid (required once Yes is chosen — red
  border + inline error on a blocked Next, matching the existing cash-on-hand pattern) plus a
  live preview line once an arrival day is picked. Resolved once at Activate time into concrete
  `jobLossPendingCheckAmount`/`jobLossPendingCheckDate` values — raw day picks aren't stored,
  same pattern as `DueDatePicker`'s `resolveDueDateAnchor`. Reused the native-disabled-button-
  blocks-onClick fix from §15.H13 (`nextNativeDisabled` split from `nextDisabled`) so the new
  step's required-field error can still fire on a "visually disabled but genuinely clickable"
  Next/Activate button. **Deliberately scoped to a single 7-day picker regardless of pay
  schedule** — for biweekly/salary users this covers only the final week worked, not the full
  period; a full 14-day grid would overcomplicate the input for a one-time estimate, so this is a
  known, flagged limit, not silently wrong. `App.jsx` threads `config` into `JobLossEntry` so the
  new step can read `payPeriodEndDay`/`userPaySchedule`.
- [x] **UI countdown line** — `JobLossHomePanel.jsx` and `JobLossBudgetPanel.jsx` both render a
  small line under the Cash On Hand input when `dash.pendingCheck` is set: "Pending check: $X
  arriving in N days (Mon DD)" (or "arriving today" at `daysOut === 0`). Reads straight off the
  same `computeJobLossRunway` output the headline runway numbers already use — no parallel calc.
- [x] Tests — `src/test/components/jobLossFlow.test.jsx`: 6 existing `JobLossEntry` tests fixed
  for the new step (button-label/navigation changes from inserting Step 1); 6 new tests added
  under `describe('Pending/final paycheck (§15.H15)')` covering skippability, blocked-Next
  validation, 0-worked-days validity, exact amount/date computation (cross-checked directly
  against the three new lib functions), live preview rendering, and toggle-off behavior. Full
  suite: 1144 tests, 1 pre-existing unrelated flake in `LoginScreen.test.jsx` confirmed via
  `git stash` baseline (fails identically with or without this change — full-suite ordering
  issue, passes standalone). Lint diffed against a `git stash` baseline: zero new
  errors/warnings. Production build green.
- **Still open from H14, not touched by this pass:** the Lifestyle-spend invisibility caption,
  the `estimateRunwayDays`/Coach drift items — explicitly out of scope per the user ("runway bugs
  are already being worked on").

#### H16. Lifestyle spend caption — the second H14 gap, built, 2026-07-22 — DONE

*Closes the second bullet from §15.H14's birdseye review: `weeklyBurn` deliberately excludes
Lifestyle-category expenses (survival-spend focus), but nothing told a user who keeps those bills
tracked that their real burn is higher than the headline number — a "stubborn" user's runway was
silently shorter than what Home displayed. Pure transparency fix, no calc change to the existing
runway math itself.*

- [x] **`lib/jobLossRunway.js`** — `computeJobLossRunway` now also computes `lifestyleActive`
  (same active+tracked gating as `essentialActive`, just `flexible === true` instead of excluded)
  and returns `lifestyleWeeklySpend` alongside the existing `weeklyBurn`. No change to `weeklyBurn`
  itself or to the runway/cliff math — this is a separate, additive figure for display only.
- [x] **`components/JobLossHomePanel.jsx`** — a one-line caption ("+ $X/wk Lifestyle spend still
  tracked (not counted in runway above)") renders under the metric-tile grid whenever
  `dash.lifestyleWeeklySpend > 0`, right where the Weekly Burn tile lives. `JobLossBudgetPanel.jsx`
  has no equivalent Weekly Burn tile (it already badges/sorts Lifestyle rows in its own expense
  list via the pre-existing `isFlexibleCategory` helper), so no change was needed there — the gap
  H14 flagged was specifically about the headline number on Home.
- [x] Tests — `src/test/components/jobLossFlow.test.jsx`, new `describe('Lifestyle spend caption
  (§15.H16)')` under `JobLossHomePanel`: caption appears for a tracked active Lifestyle expense
  with the correct weekly amount, does not appear with no Lifestyle expenses, does not appear when
  the Lifestyle expense is untracked (`trackDuringJobLoss: false`). Full suite: 1147 tests, all
  green (including the H15 write-up's flagged `LoginScreen.test.jsx` flake — passed clean this
  run, confirming it's pure full-suite ordering, not a real regression). Lint diffed against a
  `git stash` baseline: zero new errors/warnings. Production build green.
- **Still open from H14:** the `estimateRunwayDays`/Coach drift items and the AI-gating/résumé
  scoping bullets — all explicitly out of scope per the user ("runway bugs are already being
  worked on").

#### H17. Cash On Hand card + timeline-aware decay, 2026-07-22 — DONE

*User ask, not from the H14 list: the plain Cash On Hand input "looks lame and crappy" — wanted
its own prominent card above the Runway tile, a visible pencil icon signaling it's editable, a
bottom-sheet editor matching the expense editor's up-from-bottom/slide-down animation, and —
separately — for the displayed figure to decrease automatically as Needs bills come due, feeding
that decay into the runway instead of the number silently going stale between manual updates.*

- [x] **`components/CashOnHandSheet.jsx`** (new) — single-line bottom-sheet editor shared by both
  panels. Uses the existing `useFoldTransition` hook + a new `.fold-sheet` CSS class (index.css)
  rather than BudgetPanel's own expense-detail sheet, which only ever had an entrance animation
  (`expSheetSlideUp`) and unmounted instantly on close — no matching exit. `.fold-sheet` gives this
  the first bottom sheet in the app with a real symmetric enter (up-from-bottom, matching that
  sheet's existing curve) / exit (slide back down, `--ease-fold-exit`, no bounce) pair.
- [x] **`components/JobLossHomePanel.jsx`** — the plain input + `SectionHeader` replaced with a
  full-width pressable card *above* the Runway/Weekly Burn/Extra Income grid: big tabular-nums
  dollar figure, a visible circular pencil badge (top-right, same edit-icon glyph as
  `ReemploymentTracker`'s Edit button), tap-anywhere-on-card to open the sheet (`scale(0.97)` press
  feedback, `disabled` when `readOnly` — native `disabled` blocks the click entirely, no separate
  guard needed). The pending-check line moved here from the old input's helper box (its natural
  home now).
- [x] **`components/JobLossBudgetPanel.jsx`** — same sheet, compact pressable row (value + pencil
  badge) inside the existing "Savings & Benefits" card instead of the plain input — kept visually
  smaller since Budget has no Runway-card layout context to match, but functionally identical
  (same sheet, same fields, same decay-reset-on-save behavior). Removed the old
  `cashDraft`/`lastSyncedCash` render-time resync entirely — no longer needed once cash is only
  ever committed through the sheet's explicit Save.
- [x] **`lib/jobLossRunway.js`** — timeline-aware decay, kept centralized (single source of truth,
  not duplicated per-panel per drift-app-warden D1). New `jobLossCashOnHandAsOf` config field
  (stamped by `JobLossEntry`'s Activate and both panels' `CashOnHandSheet` saves) anchors
  `sumBillsDueSince(expenses, fromExclusive, throughInclusive)` — walks each essential bill's real
  due-date occurrences one at a time via `getNextDueDate` (the underlying cycle math only exposes
  "next due on/after a date," not a closed-form occurrence count) and sums their actual payment
  amounts (`getExpenseDisplayAmount`), floored at 0 against `jobLossCashOnHand` to produce
  `effectiveCashOnHand` — the figure both cards display and the number that now feeds the
  runway/cliff math (`withBenefits`/`withoutBenefits.cash`). Falls back to `jobLossDate` as the
  decay anchor for pre-§15.H17 accounts that never got a real `jobLossCashOnHandAsOf` stamp.
  `computeJobLossRunway`'s `savings` param renamed to `extraCash` (now just gig income —
  `sumJobHuntIncome()` — since raw cash is read from `config` internally instead of pre-summed by
  the caller) — forced every call site to be touched deliberately rather than silently
  reinterpreting the same param name. Also de-duplicated three copy-pasted
  active+tracked+category filters (`essentialActive`, `lifestyleActive`, and the new bills-due
  filter) into two shared predicates, `isTrackedActiveEssential`/`isTrackedActiveLifestyle`.
- [x] **External consumers updated for the `extraCash` rename** (drift-app-warden Spine A / D1
  check — `computeJobLossRunway` is a mapped LEDGER item, cross-checked against every call site,
  not just the two panels): `components/CoachNetWorthCard.jsx`'s Red-tier runway trigger and
  `App.jsx`'s Ask Coach `coachRunwayDays` memo (both closed drift-app-warden §21 quarantines from
  earlier work) each used to pre-sum `jobLossCashOnHand + sumJobHuntIncome()` into a local
  `savings` var — both now pass `extraCash: sumJobHuntIncome(config)` only, and both automatically
  gained decay-awareness for free since `computeJobLossRunway` now reads cash internally.
- [x] **`constants/config.js`** — `jobLossCashOnHandAsOf: null` added to `DEFAULT_CONFIG`
  (snapshot updated, `npx vitest run -u`).
- [x] **`docs/active-systems.md` §10** — updated in the same pass (drift-app-warden: doc/spec drift
  is its own quarantined failure class, D5) — was still describing the pre-H15/H16 3-step wizard
  and the raw-sum `savings` formula; now reflects the 4-step wizard, the pending-check/Lifestyle-
  caption features, and the card/sheet + decay architecture.
- [x] Tests — `src/test/lib/jobLossRunway.test.js`: new `describe('sumBillsDueSince')` (8 cases —
  window boundaries, Lifestyle/paused/untracked exclusion, loan inclusion, multi-occurrence
  summing, missing-boundary guard) and `describe('computeJobLossRunway — timeline-aware cash on
  hand')` (5 cases — decay math, floor-at-0, `jobLossDate` fallback, no-decay-when-nothing-due,
  `extraCash` still additive on top). `src/test/components/jobLossFlow.test.jsx`: both panels'
  old plain-input describe blocks rewritten for the card/sheet interaction (prefill, save +
  asOf-stamp, cancel-without-saving — the cancel case needed `waitFor` since the sheet stays
  mounted through its animated exit, not an instant unmount), plus new dedicated decay describe
  blocks per panel; `JobLossEntry`'s existing Activate test extended to assert
  `jobLossCashOnHandAsOf === jobLossDate`. Full suite: 1175 tests, all green (including the
  previously-flagged `LoginScreen.test.jsx` full-suite-ordering flake, which also passed clean this
  run). Lint diffed against a `git stash` baseline: zero new errors/warnings (diff was pure
  line-number drift on pre-existing unrelated errors from removed lines above them). Production
  build green.
- **Scope note:** `sumBillsDueSince` only decays against essential (Needs + loan) bills, matching
  the same category gate `weeklyBurn` already uses — Lifestyle spend still isn't part of any cash
  figure, consistent with §15.H16's deliberate exclusion, not an oversight.

---

### I. Admin Toolkit updates for §15 work — BUILT 2026-07-25

- [x] **Live State Inspector — Job Loss Mode pill**
  - [x] Amber dot on the pill (top-right corner) when `config.jobLossMode === true`, visible without opening the card
  - [x] Three amber-highlighted rows in the expanded card: `Job Loss Date`, `Unemployment Wkly`, `Unemployment Wks Left` (the last reads `computeJobLossRunway()`'s `benefitsRemainingWeeks` via a shared `jobLossDash` memo — same call Coach's `coachRunwayDays` uses, no second derivation, per F24)
- [x] **Week Inspector — unemployment income row**
  - [x] `w.unemploymentIncome > 0` → green "Unemployment" row in the Pay section
  - [x] Job Loss window with no benefit paid that week → "Unemployment — Job Loss Mode — outside benefit window" (window boundary mirrors buildYear's `inJobLoss` check — `jobLossDate`/`returnToWorkDate` — diagnostic-only, never feeds math, same pattern as `resolveBaseRateForWeek`)
- [x] **DB Row Viewer — expense triage summary**
  - [x] "Triage: X active · Y paused · Z cancelled" line (only shown when something's actually paused/cancelled/flagged)
  - [x] Flags expense count where `autoReactivateOnIncome === false`
- [x] **Config Raw View — Life Events header**
  - [x] "Life Events" header above the JSON dump, listing only §15 fields that currently carry a value
- [x] **CLAUDE.md update**
  - [x] Appended Job Loss state (§7 in Diagnostic request templates)
  - [x] Documented per-week `unemploymentIncome` annotation on `buildYear` output (Week Inspector + template §7 entries)
- All four admin surfaces are duplicated three times in `App.jsx` (desktop sidebar, mobile
  hamburger drawer, mobile bottom sheet) — pre-existing architecture, not introduced by this
  pass. Computed once via shared memos (`jobLossDash`, `expenseTriageLine`,
  `lifeEventsConfigFields`) and rendered into all three so the triplication stays presentation-
  only, not a fourth parallel calculation. 1231 tests passing (no new tests — pure admin-only
  diagnostic surface, isAdmin-gated, no math path exercised); lint diff-clean vs. baseline;
  production build green.

---

### J. Visual Testing Checklist — foundation phase (§15.A–C5 + H seed)

*Manual smoke pass, originally scoped to run before merging the foundation phase branch — that
branch already merged and shipped (§A–C). `jobLossFlow.test.jsx` (30 tests across LifeEventMenu,
JobLossEntry, RateUpdateModal, JobLossHomePanel, JobLossBudgetPanel, ReemploymentTracker — the
latter two replaced the now-deleted `JobLossDashboard`/`ExpenseTriage` per §H7) +
`buildYearJobLoss.test.js` give equivalent automated coverage of the flows below. Kept here as an
optional manual pass, not a blocking item — no reason to re-run this by hand unless something in
§A–C regresses.*

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
  10 tealen conversations; grow it from real flagged answers. Example tealen case: given a
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

---

## 22. CPA/Tax-Ready Statement Export

*Seeded 2026-07-11. Answers "can a user hand something to their accountant" — today the app has
no export surface at all (the `[x]` "Statements Tab" entry in `docs/past-TODO-tasks.md` §9 does
not reflect working code — no component, no PDF/CSV dependency in `package.json`; treat it as
stale, not shipped). This section is the real plan. Directly depends on **§20** for tax-number
correctness and gates, and is the missing prerequisite **§18.D (Statements AI Insights)** already
assumes exists ("when a monthly/quarterly/yearly statement is generated...").*

### A. Scope — what this app can honestly hand a CPA

This is a single-employer, hourly-wage W-2 model with flat/bracket-projected withholding — not a
payroll system and not a multi-source tax engine. No 1099/Schedule C, no itemized deductions
beyond the standard deduction, no investment income, no dependents/credits beyond filing status.
The statement is the user's own modeled projection, cross-checkable against their real paystubs
and W-2 — not a replacement for either. Every exported document needs a persistent disclaimer
banner saying exactly that; wording is covered by the same accountant pass as §20.D, not invented
ad hoc here.

### B. Data already available — reuse, don't rebuild

- `buildYear()` / `computeNet()` (`finance.js`) — per-week gross, taxable gross, net.
- `deriveWeeklyPayrollDeductions()` (`finance.js`) — itemized 401k + `otherDeductions` per week.
- `taxDerived` (`App.jsx` ~line 900) — already computes the exact numbers a CPA cares about:
  `fedAGI`, `fedLiability`, `moLiability` (real bracket math via `fedTax()`/`stateTax()`, not just
  withheld-rate math), `ficaTotal`, `fedWithheldBase`, `moWithheldBase`, `fedGap`, `moGap`,
  `totalGap`, `taxedWeekCount`. This is effectively a mini safe-harbor check already — it just
  never gets rendered as a document.
- `computeGoalTimeline()`, `computeBucketModel()` (PTO/401k match), `calcEventImpact()` (Log panel
  event totals) — for the non-tax "annual financial statement" sections (goal funding, PTO
  accrual, missed/pickup day impact).
- `config.filingStatus`, `getStateConfig(config.userState)` — filer identity for the header.

### C. Proposed statement contents

1. **Header** — tax year / period, filing status, state, generated-on date, the disclaimer banner
   from §A.
2. **Income & withholding summary (period totals)** — gross pay, federal withheld, state withheld,
   FICA withheld, 401k employee contribution, net pay. Pure arithmetic on money already paid —
   no liability judgment, no accountant gate needed for this section alone.
3. **Projected liability vs. withheld (safe-harbor check)** — `fedLiability` vs `fedWithheldBase`,
   `moLiability` vs `moWithheldBase`, the resulting gap. This is the section that tells a user
   "you may owe" or "you're on track" — it does NOT ship to any user until **§20.D's accountant
   audit clears**, full stop, same gate as the rest of the withholding-catch-up mechanism.
4. **Per-pay-period detail table** — week/pay-period rows of gross, fed, state, FICA, 401k, net —
   the reconciliation table a CPA actually wants when checking a W-2 against reality.
5. **Quarterly rollups** — for estimated-payment safe-harbor context, once §B's Excerpt-1 fed/state
   split lands (until then, one blended timeline like today).
6. **401k & benefits summary** — employee + employer match, PTO accrual/usage.
7. **Life-event / log impact summary** — missed days, pickups, one-off gains/losses from the Log
   panel that materially changed the year's numbers.
8. **Goals funded from surplus** — not tax content; keep it visually separated from the tax
   sections so nothing in it reads as a tax claim.

### D. Export mechanics

- **Formats** — PDF as the primary deliverable (what someone actually emails a CPA); CSV for the
  per-period detail table (importable into a spreadsheet or accounting software).
- **PDF implementation** — no PDF library exists in `package.json` today. Cheapest path: a
  print-optimized HTML view + the browser's native "Print to PDF" (zero new dependency, works
  everywhere, ugly-ish default styling is fixable with print CSS). Alternative: a client-side lib
  (`jspdf`/`@react-pdf/renderer`) for real typographic control at the cost of bundle size. Decide
  based on how polished v1 needs to look — don't default to the heavier option without checking.
- **Period selector** — month / quarter / year-to-date / prior full year. **Real blocker, not a
  nice-to-have:** once §19's Master Timeline read-path exists, a statement covering a past period
  must resolve that period's *historical* config (rates, filing status, etc.), not today's — until
  §19's read side is built, any "prior period" statement is silently wrong the moment a user has
  edited pay/tax settings mid-year. Gate the period selector to "current period only" until §19
  lands, or disclose loudly that past periods reuse current settings.

### E. Access gating

- **Base gate:** `canAccessTaxPlan` (`isAdmin` / `isTester` / `taxProjectionsEnabled`) — the same
  population already trusted with tax numbers elsewhere in the app; no separate flag needed.
- **Internal split, mirroring the Tax Plan precedent:** §C.2/C.4/C.6/C.7/C.8 (objective totals —
  money already paid, no liability judgment) can ship to that population without further review.
  §C.3 (liability vs. withheld / safe-harbor gap) additionally requires §20.D's accountant
  sign-off before it renders for anyone, admin included — the accountant gate is about the content
  being shown, not who's allowed to see the feature.

### F. Open dependencies

- **§19** (Master Timeline read-path) — blocks honest past-period statements; see §D.
- **§20.D** (accountant audit) — blocks §C.3 specifically.
- **§20.B** (fed/state split withholding) — blocks true quarterly rollups (§C.5) until the single
  blended timeline is split.
- **State coverage** — confirm `STATE_TAX_TABLE` covers every tester's state before exposing state
  liability figures beyond the personal/admin account.

### G. Cash flow statements (modeled, not bank-reconciled)

*Seeded 2026-07-11. The app has no bank connection and no transaction feed — it never sees what a
user actually spends money on, only what they've configured (scheduled income, budgeted expenses,
logged variances). Every statement in this section is therefore named and footered as **modeled**,
never "actual" — the honest promise of this whole feature is realistic planning, not bookkeeping.
Structure borrows the operating/investing/financing shape of a real cash flow statement because it
maps cleanly onto data this app already has, not because the numbers are audit-grade.*

**Monthly Cash Flow Statement (Modeled)**
- **Operating activities** — gross pay → − FICA → − federal/state withholding (including any
  extra catch-up from `taxDerived.extraPerCheck`) → − 401k employee contribution → − Needs
  (essential) expenses = **Net Operating Cash Flow**.
- **Investing activities** — − goal contributions (this period's surplus allocated toward goals)
  → **+ Goal Funding Milestones** for any goal whose `completedAt` lands inside this period (see
  §H — this is the callout the whole section exists to support).
- **Financing activities** — − loan/debt payments (`loanWeeklyAmount`, existing loan data).
- **Discretionary** — − Lifestyle expenses, kept as its own line rather than force-fit into a
  GAAP bucket that doesn't really describe personal discretionary spend.
- **Net Change in Modeled Cash Position** — sum of all of the above.
- Mandatory footer: *"Modeled from your configured schedule and budget — not verified against a
  bank account. Log any real variance in the Log panel to keep this accurate."*

**Annual Cash Flow Statement (Modeled)** — same four sections rolled up across the fiscal year,
with quarterly subtotals (depends on §20.B's fed/state split for the tax line to be trustworthy
quarter-by-quarter, same dependency as §C.5/§F).

### H. Goal funding as a statement milestone (Authority Finance signature)

*This is the crucial differentiator the feature is really being built for — the app's entire
purpose is helping a user at any income level understand what a goal will take and hit it
realistically, so a goal crossing the finish line deserves to be a first-class event in the
paperwork, not a buried number.*

- **In-statement callout** — in both the Monthly and Annual Cash Flow Statements (§G), any goal
  whose `goal.completedAt` falls inside the covered period gets an explicit flagged line inside
  Investing Activities: *"🎯 Goal Funded — [label], $[target], funded [date]"* — the same treatment
  a real cash flow statement gives a one-time capital event, not just another number in a column.
  Data already exists for this (`goal.completedAt`, `goal.target`, `getFundedGoalSpend()`
  `lib/goalFunding.js`) — this is a rendering task, not a new computation.
- **Goal Funding Ledger** — a standalone, chronological report (separate from the cash flow
  statements) listing every goal with target, funded date, and time-to-fund — the story of a
  user's goal progress across the account, not just one period. Full accuracy for goals funded in
  a *past* period depends on §19's Master Timeline read-path the same way past cash flow periods
  do (§D); until then this ledger reflects live goal state only, not a true historical record.
- **Why this belongs to Authority Finance specifically** — no generic bank or budgeting export
  does this; it's the one document type that's inseparable from the app's stated purpose (helping
  users "understand what their goals will take and work towards them realistically") rather than a
  generic personal-finance report format borrowed from accounting.

### I. Bank/lender-facing statement suite

*For a W-2 user who needs something to hand a bank, landlord, or credit-card issuer during an
application. These must look and read as professional documents (letterhead-style Authority
Finance branding, not the app's internal UI), and every one of them needs an explicit
"self-reported, not employer/bank-verified" disclaimer — none of this replaces a real paystub,
W-2, or bank statement, and claiming otherwise would be actively harmful to a user relying on it
for a real application.*

- **Income Summary Statement** — annualized gross pay, YTD gross pay, average net pay per period.
  Positioned as *supplementary* documentation alongside real paystubs/W-2, never a replacement.
- **Debt Summary Statement** — per loan: original amount, remaining balance, payments remaining,
  projected payoff date (`computeLoanPayoffDate`, `loanPaymentsRemaining`). **Real gap to flag,
  not silently paper over:** `loanMeta` today is flat-payment only (`totalAmount`,
  `paymentAmount`, `paymentFrequency`, `firstPaymentDate`) — there is no interest rate / APR field
  anywhere in the schema, so this statement can show payoff progress but not a real
  interest/amortization breakdown. If a lender-grade debt statement is the actual goal, adding an
  optional `interestRate` to `loanMeta` is a prerequisite, not a detail — track as its own
  follow-up before promising this section is "bank ready."
- **Goal & Savings Summary** — funded + in-progress goals with targets and dates. Explicitly **not
  a net worth statement** — the app tracks configured loans and goals, not bank balances or any
  other assets/liabilities, so it cannot honestly claim to be a balance sheet. Name it accordingly
  ("Goal & Savings Summary," not "Net Worth Statement") until/unless real asset/liability tracking
  is built as its own feature.

### J. Authority Finance staple statement suite (the v1 document menu)

The actual list this section resolves to — every statement above, in one place, as what a v1
export menu should offer:

1. **Monthly Cash Flow Statement (Modeled)** — §G
2. **Annual Cash Flow Statement (Modeled)**, with quarterly subtotals — §G
3. **Goal Funding Ledger** — §H, the signature/differentiated document
4. **Income & Withholding Summary** — §C.2 (ungated beyond §E's base tax-plan access)
5. **Projected Liability vs. Withheld (Safe-Harbor Check)** — §C.3 (gated behind §20.D)
6. **Income Summary Statement** (lender-facing) — §I
7. **Debt Summary Statement** (lender-facing) — §I, pending the `interestRate` gap above

All seven share §D's export mechanics (PDF/CSV) and §E's access gating split (objective totals
open to the base tax-plan population; anything liability-flavored stays behind §20.D).

---

## 23. Multi-Year Fiscal Rollover — Beyond FY2026

*Structural/data-model workstream, not yet scoped to a sprint. Seeded 2026-07-13, surfaced while
fixing the Year-End Outlook card's date scoping (`HomePanel.jsx`, branch
`claude/year-end-outlook-scoping-v013r8`): that fix correctly bounded the outlook window to
`[max(Jan 1 of the fiscal year, job start date), Dec 31]` and stopped hardcoding "Fiscal Year
2026" as literal text, but it deliberately did **not** attempt cross-year rollover — the app's
entire fiscal-week engine is built around one hardcoded `FISCAL_YEAR_START = "2026-01-05"`
(`config.js:190`), and nothing regenerates or re-namespaces that engine when the calendar actually
crosses into a new year. `docs/FEATURE_monthly-budget-view.md`'s own "Deferred" list already flags
one narrow instance of this (`monthlyOverrides` keys); this section is the full inventory and the
open design question, not a fix.*

### A. Problem statement

`buildYear(cfg)` (`finance.js` ~406–410, 561) generates exactly one 52-week array by walking from
`FISCAL_YEAR_START` forward 52×7 days. Every week's `idx` (0–51) is a **global, absolute** index
into that one array — not a `(fiscalYear, weekOfYear)` pair. Every other config field that stores
an idx — `firstActiveIdx`, `accountCreatedIdx`, `taxedWeeks`, `goalTimelineEpochIdx`,
`week_confirmations`/`archived_week_confirmations` dictionary keys — inherits that same
single-year assumption. There is no schema-level fiscal-year identifier anywhere: `config`,
`expenses`, `goals`, `logs`, `week_confirmations`, `archived_week_confirmations` are all JSONB
blobs (confirmed against the latest schema snapshot,
`database/migrations/022_BOOKMARK_schema_snapshot_2026-07-10.sql`). If the app simply started a
"year 2" grid on top of the same idx space, year-2 week 7 would collide with year-1 week 7 in
every one of those dictionaries.

### B. Full inventory of single-fiscal-year hardcoding (file:line)

**Core engine:**
- `FISCAL_YEAR_START = "2026-01-05"` — `config.js:190`, the sole source of truth `buildYear()`
  loops from.
- `_FY_YEAR = parseInt(FISCAL_YEAR_START.split('-')[0])` — `finance.js:41`, a module-load-time
  capture used by `fiscalMonthLabel()`'s `'27` cross-year-label logic; goes stale the moment weeks
  roll past Dec 31 even without any rollover *feature* change, since it's evaluated once at
  import time against a constant that itself never changes today.
- `dateToWeekIdx()` — `SetupWizard.jsx:688–693` — converts any `startDate` into a week index
  relative to `FISCAL_YEAR_START`, clamped to `[0, FISCAL_WEEKS_PER_YEAR-1]` (line 692). A start
  date in 2027+ doesn't error — it silently clamps to week 51 of the 2026 grid, i.e. **data
  corruption** (the stored start week is simply wrong), not a crash. `docs/non-dhl-wizard-audit.md`
  documents the *earlier* unclamped version of this bug (empty `active` weeks → `-$50`
  `weeklyIncome` on Home); the clamp added since then fixed that crash but only by masking the
  underlying gap — flag any future audit of that doc's "fix" as "masked, not solved."

**Quarter/month boundaries (all 2026-literal):**
- `QUARTER_BOUNDARIES` — `config.js:194`, three of four boundaries hardcoded 2026 dates (the
  Q4→Q1 boundary is implicit/unlisted).
- `Q_REP_DATES`, `Q_REP_MONTH_KEYS`, `QUARTER_FIRST_MONTHS` — `BudgetPanel.jsx:206–211`; two more
  inline `` `2026-${...}` `` template builders at `BudgetPanel.jsx:241, 253, 815, 2386`.
- `fiscalYearEnd` fallback `"2027-01-04"` — `BudgetPanel.jsx:552`, used only when `futureWeeks` is
  empty, but still a baked-in literal.
- `isBackdated = historyStart <= "2026-01-06"` — `BudgetPanel.jsx:2380` — a magic-string heuristic
  for "was this expense-history entry backdated to fiscal-year start."
- `MONTH_KEYS` — `MonthQuarterSelector.jsx:5–9` — a fully hardcoded 12-entry `"2026-MM"` array
  driving the entire month/quarter picker UI.
- `quarterRepresentativeDates` — `finance.js:857–860` — a second, independently hardcoded
  duplicate of `BudgetPanel`'s `Q_REP_DATES`, inside the math-audit helper.
- `estimateGoalNextYear()`'s `futureMonths` loop — `finance.js:1142` — hardcoded
  `nextMonth <= "2026-12"`, i.e. "the fiscal year ends in Dec 2026" baked directly into a goal
  projection.
- `"2026 Dashboard"` — `HomePanel.jsx:135` — fallback subtitle string, separate from (and not
  touched by) the Year-End Outlook fix that just shipped.

**Idx-space fields with no rollover path:**
- `taxedWeeks` — `config.js:163` — a hand-picked flat array of week indices
  (`[7, 8, 19, 20, 21, 22, 37...52]`) chosen against the actual 2026 tax calendar. Meaningless
  outside the exact 52-week grid they were derived for; nothing regenerates them for a new year.
- `accountCreatedIdx` — `config.js:106`, stamped once at setup completion as
  `dateToWeekIdx(todayIso)` (`SetupWizard.jsx:2154`) — a single scalar idx used purely as a
  "weeks before this are auto-assumed worked" floor (`App.jsx:780, 821`). Nothing recalculates it
  at a year boundary.
- `goalTimelineEpochIdx` — `config.js:187` — same single-scalar-idx shape, same gap.
- `week_confirmations` / `archived_week_confirmations` — keyed by idx with no year disambiguation.

**Lower-priority / cosmetic:**
- `INITIAL_EXPENSES` baseline dates — `config.js:314–315`.
- `docs/account-reference.json:7` — static `"fiscal_year_start": "2026-01-05"` mirror; goes stale
  as documentation, not code.
- `src/fixtures/demo-account-1.js`, `demo-account-2.js` — every date field is a literal 2026
  value; needs regenerating for a demo year rollover, but affects only the demo/investor surface.

### C. Why this is a data-model change, not a constant swap

`idx` today is a **global, absolute** index into one 52-week array. Simply changing
`FISCAL_YEAR_START` to a new year would not "roll over" anything — it would regenerate a
*different* single 52-week grid, silently reinterpreting every already-stored idx (in
`taxedWeeks`, `accountCreatedIdx`, `goalTimelineEpochIdx`, `week_confirmations` keys, any logged
event's `weekIdx`) against the new grid's dates. That's worse than doing nothing: existing users'
data would resolve to the wrong calendar weeks the moment the constant changed. Real support needs
either a `(fiscalYear, weekIdx)` pair everywhere an idx is stored, or an explicit year-boundary
migration step that snapshots and resets the idx-space fields — this is schema and multi-file
surgery, not a one-line config edit.

### D. Design options (undecided — needs a decision before further scoping)

1. **`(fiscalYear, weekIdx)` tuple everywhere.** Most correct long-term, but touches every
   consumer of a raw `idx` across `finance.js`, `fiscalWeek.js`, `App.jsx`, `HomePanel.jsx`,
   `BudgetPanel.jsx`, `IncomePanel.jsx`, `LogPanel.jsx`, and the DB JSONB shapes. Largest blast
   radius; highest confidence of correctness.
2. **Monotonically increasing global idx that never resets** (week 53, 54, ... continuing past
   52 indefinitely instead of wrapping). Avoids the collision problem without a tuple, but breaks
   every place that currently assumes a fixed 52-week modulus: `idx % 2` parity checks (biweekly
   pay-week parity, DHL rotation long/short alternation), `weeksToChecksRemaining`,
   `getFiscalWeekNumber`'s clamp to `FISCAL_WEEKS_PER_YEAR`, and `formatPayPeriodLabel`'s
   week-of-52 display. Every one of those would need an explicit "week-of-current-year" derivation
   layered on top of the raw ever-growing idx.
3. **Keep the one-fiscal-year-at-a-time architecture, add an explicit "Roll to New Fiscal Year"
   step** (user-triggered or automatic on Jan 1) that archives the prior year's
   `week_confirmations`/`taxedWeeks`/log-linked idx data (mirroring the existing
   `archived_week_confirmations` precedent) and regenerates a fresh `buildYear()` grid + a
   fresh `taxedWeeks` for the new year, carrying forward pay structure/tax rates/benefits but
   resetting `accountCreatedIdx`/`goalTimelineEpochIdx`/`week_confirmations`. Closest to a real
   rollover without an idx-space rearchitecture, but still needs a real design pass on exactly
   what carries forward vs. resets, and how "look back at last year's data" would work afterward
   (Option 1's tuple gives that for free; Option 3 needs its own archive-read path, likely sharing
   infrastructure with §19 below).

No option is chosen yet — this needs a decision session before any implementation starts.

### E. Immediate low-risk mitigations (could ship independently of the full redesign)

- [ ] **Stop silently corrupting 2027+ start dates** — `dateToWeekIdx()`'s clamp
  (`SetupWizard.jsx:692`) should surface a wizard-level warning/error for a start date beyond the
  current fiscal year instead of silently misfiling it to week 51. Doesn't fix rollover, but stops
  the data-corruption symptom `docs/non-dhl-wizard-audit.md` already found once.
- [ ] **Derive `estimateGoalNextYear()`'s month cap from `FISCAL_YEAR_START`** (`finance.js:1142`)
  instead of the literal `"2026-12"`, same pattern `buildYear()` already uses.
- [ ] **Replace the remaining `"2026 Dashboard"` fallback string** (`HomePanel.jsx:135`) with the
  same `FY_YEAR`-derived pattern the Year-End Outlook fix just used for its header, so this one
  spot doesn't go stale independently.

### F. Related / prior art in this codebase

- **Year-End Outlook scoping fix** (2026-07-13, `claude/year-end-outlook-scoping-v013r8`) —
  bounded `HomePanel.jsx`'s `annualSavings`/outlook window to the job-start-aware single-year
  window and dropped the literal "Fiscal Year 2026" text; explicitly did not touch cross-year
  rollover. This section is the deferred follow-up that surfaced from it.
- **§19 Master Timeline** — a related but distinct gap: `buildYear`/`computeNet` apply the
  *current* config uniformly to every week including past ones (point-in-time correctness within
  a single year), not a cross-year rollover gap. Worth reviewing together before committing to
  Option 3 above — a Master Timeline redesign aimed at point-in-time correctness might naturally
  solve the year-boundary archive/read problem too, rather than building two separate
  versioning schemes.
- `docs/FEATURE_monthly-budget-view.md`'s "Deferred" list item #1 — same root cause
  (`monthlyOverrides` keyed by literal `"YYYY-MM"` assuming 2026), narrower scope; its own
  suggested fix (fiscal-year-relative month keys) should be reconciled with whichever option is
  chosen here rather than solved separately.
- `docs/non-dhl-wizard-audit.md` — documents the masked 2027+ start-date symptom referenced in §B.

### G. Out of scope for this section

- Actual tax-rate/bracket changes year-to-year (a §20 concern, not a fiscal-week-engine one).
- Demo fixture regeneration (`src/fixtures/demo-account-*.js`) — cosmetic, do last, after a real
  design is chosen.

---

## 24. Needs-Expense Shortfall Redistribution — "a missed check still owes rent"

*New workstream (2026-07-13), scoped from a user brain-dump, not yet started. Core-finance-engine
change — touches `computeGoalTimeline`, `App.jsx`'s `eventImpact`, and several downstream displays —
not a quick pass. Do not start build without re-reading this section; the surplus math it touches
feeds goal ETAs and savings projections directly.*

**The gap.** Today, when a missed-shift event (`missed_unpaid`/`missed_unapproved`) logs a
`netLost`, that loss is **smeared evenly across every remaining week of the fiscal year**, in two
places:
- `App.jsx` `eventImpact.adjustedWeeklyDelta = totalNetAdjustment / futureWeekCount` (feeds
  `logTotals.adjustedWeeklyAvg`, shown in LogPanel's Log Effect Summary card).
- `computeGoalTimeline()` (`finance.js:919`): `perWeekLost = (logNetLost - futureDeductionTotal) /
  n` — spread across all `n` future weeks before goal funding is simulated. The existing code
  comment at `App.jsx:1081-1084` calls this out explicitly: *"the money is already gone; a uniform
  budget reduction across the rest of the year is the right model."*

That's a reasonable simplification for "how much did this cost me on average," but it understates
what actually happens in a real budget: **Needs expenses (rent, utilities, insurance — the
`category: "Needs"` bucket already distinguished from `Lifestyle`/`Loans` in `BudgetPanel.jsx`)
don't get pro-rated down when a check is short — they still come due in full.** If a user misses
two days on one check in a month, the Needs dollars that check was supposed to cover don't just
quietly average away over the next 12 months; they have to come out of the *other* checks in that
*same month*, which means those other checks have measurably less real surplus to put toward goals
and savings than the current flat-average model shows.

**Explicitly not changing:** BudgetPanel's per-week "left" display. The user confirmed this is
about the *forward-looking* engine (goal timing, savings/surplus math) — not about rewriting what
already renders as this week's budget.

### A. Proposed mechanism

A new pure function, likely `computeNeedsShortfall()` in `finance.js`, run alongside (not
replacing) the existing per-week event pipeline:

1. **Group by calendar month** — reuse the existing `monthKey` bucketing already used by
   `computeRemainingSpend()`/`getEffectiveAmountForMonth()` for Needs-expense amounts, rather than
   inventing a new grouping unit. This is also schedule-agnostic (works the same whether the user
   is weekly/biweekly/monthly-paid), since Needs bills are monthly obligations regardless of pay
   frequency.
2. **Per month, compute:**
   - `monthNeedsTotal` — sum of `getEffectiveAmountForMonth(exp, monthKey, pi)` over **Needs-category
     expenses only** (Lifestyle/Loans excluded — discretionary spend doesn't force a redistribution;
     loans have their own payoff math already).
   - Each week's own actual net pay for that month, including *that week's own* directly-logged
     event impact only (not smeared) — i.e., what that specific check really paid out.
3. **Redistribute within the month first:** a week's shortfall against its Needs share is covered
   by surplus from *other, not-yet-elapsed* weeks in the same month (an already-received/spent
   check can't retroactively give more — only future-relative-to-`effectiveToday` weeks in that
   month are eligible donors).
4. **Overflow — resolved 2026-07-13:** whatever the month's remaining weeks can't absorb falls back
   to the **existing flat full-year smear**, scoped down to just the unabsorbed remainder (not the
   whole original loss). Chosen over cascading the leftover into next month's Needs obligation —
   simpler to reason about and build; a genuinely catastrophic month still gets *some* sharper
   representation (whatever the month itself could absorb) without opening a multi-month deficit-
   chain that has to be tracked and unwound as future paychecks land.
5. **Output shape:** a per-week dollar map, same shape as the existing `futureEventDeductionsByWeek`
   (`{ [weekIdx]: dollarsRedirectedToCoverAnotherWeeksNeeds }`), so it plugs into
   `computeGoalTimeline`'s per-week `surplus` calc as an additional term alongside the existing
   `weekDeduction`, rather than requiring a rewrite of the simulation loop.

### B. Build order

- [ ] **A — pure function + tests.** `computeNeedsShortfall()` in `finance.js`: month grouping,
  per-week donor/recipient resolution, overflow spillover into the residual smear pool. Unit-test
  in `src/test/lib/finance.test.js` (existing `computeGoalTimeline` describe block is the pattern
  to extend) — at minimum: single missed week fully absorbed by the same month; shortfall bigger
  than the month can cover (confirms overflow spills to the residual smear, not silently dropped or
  double-counted); a miss in the last week of the fiscal year with no future weeks left to smear
  into; multiple missed weeks competing for the same month's remaining donor surplus.
- [ ] **B — wire into the engine.** Replace the flat `perWeekLost` term in `computeGoalTimeline`
  with (shortfall-adjusted surplus) + (residual smear on whatever overflow remains). Update
  `App.jsx`'s `eventImpact`/`logTotals.adjustedWeeklyAvg` to reflect the same redistributed model
  so the Log Effect Summary card and the goal timeline never disagree with each other.
- [ ] **C — surface it.** See the ripple list below — at minimum LogPanel's Log Effect Summary
  should say *something* more intuitive than an abstract "$X/week average" once the redistribution
  exists (e.g. "this pushes $47 of this month's Needs onto your other checks" is a much more
  honest sentence than diluting it into a weekly average).
- [ ] **D — regression check.** Full `npm run test:run` pass plus a manual walk-through in the
  running app: log a `missed_unpaid` event mid-month, confirm the Active Goals timeline (HomePanel)
  and Log Effect Summary shift together, then log a second one big enough to blow through the whole
  month's remaining checks and confirm the overflow lands in the fallback smear instead of vanishing.

### C. Other places this ripples (brainstormed 2026-07-13, not yet triaged into build tasks)

- **HomePanel — Active Goals timeline.** The direct target; goal `sW`/`eW`/`wN` (start week, end
  week, weeks-needed) all derive from `computeGoalTimeline`'s surplus sequence.
- **LogPanel — Log Effect Summary card** (`adjWA`/`adjTH` in `LogPanel.jsx:73-75`, `logTotals` in
  `App.jsx`). Same surplus math, different presentation — needs the same fix, and probably new
  copy (see Build order §C above).
- **BudgetPanel — `budgetHealth` ratio** (`monthlyExpenses / monthlyNetTakeHome` in
  `computeRemainingSpend()`). Currently schedule-wide; a month with a needs shortfall arguably
  deserves a visibly worse health score for *that* month specifically, not just a diluted
  year-average nudge.
- **Admin Diagnostic Toolkit.** Every new derived model in this app gets an admin-visible
  diagnostic (see CLAUDE.md's Admin Toolkit table) — Live State Inspector and/or Config Raw View
  would want a new field surfacing "Needs shortfall this month" so it's debuggable without reading
  source. Follows the same pattern as the existing `totalGap`/`extraPerCheck` diagnostics.
- **WeekConfirmModal / event logging itself.** Right now a user finds out the downstream effect of
  a missed shift only by later checking Home/Log. A same-month cascade preview at the moment of
  logging ("this will need $47 more from your other checks this month to cover Needs") would be a
  much more honest and immediate feedback loop than the current after-the-fact averaging — worth
  considering as a v2 of this feature once the underlying engine change is stable.
- **PTO / attendance bucket math** (`computeBucketModel`, §7 in `active-systems.md`) is a
  structurally similar "targeted, not smeared" deduction that already exists for PTO accrual and
  bucket hours — good precedent to crib from for how a targeted (vs. averaged) deduction gets
  threaded through existing code, but not itself in scope here.
- **Already-funded goals in a month that gets revised.** If a missed-shift event is logged *late*
  for a week in a month that's already fully elapsed, that month has no remaining checks left to
  redistribute onto by construction — the shortfall falls straight into the residual smear (no
  special-casing needed, this resolves itself structurally rather than needing a decision). Genuine
  open question: should a goal that was already marked `completed`/funded *during* that now-revised
  month ever be reconsidered? Recommend **no** — unwinding a completed goal after the fact would be
  a much bigger, more disruptive feature (retroactive goal-completion reversal) than this section is
  scoped for; flag it here so it isn't silently assumed rather than deciding it now.
- **Job Loss Mode expense triage** (`config.jobLossMode`, `projectableExpenses` filter in
  `App.jsx:1047`). Paused/cancelled expenses already drop out of the Needs total during job loss —
  confirm `computeNeedsShortfall()` reads the same `projectableExpenses` list so it doesn't count a
  paused bill as still owed.

---

## 25. Expense Input/Editor Revamp — Mandatory Rent + Preset Categories

*Seeded 2026-07-16, not yet started. Two related but distinct threads: (A) add Rent as a second
mandatory, pinned expense alongside Food; (B/C) a broader editor revamp — quick-select preset
categories with icons for the expenses people most commonly carry. **§B is explicitly a
brainstorm-first workstream — do not design the preset category list, schema, or icon set until
that session happens.** Nothing in this section should be built ahead of that decision pass.*

### A. Mandatory Rent Expense (parallel to Food)

Today `INITIAL_EXPENSES` (`constants/config.js:306`) seeds exactly one pinned, non-deletable-feeling
expense: Food (`isFoodPrimary: true`, `isFoodHighlighted: true`, a flat `$400/mo` default via
`DEFAULT_FOOD_WEEKLY`). `BudgetPanel.jsx` reads those two flags in several places (`isFoodSheet`,
the pinned-card filter at line 1509, the "other same-category expenses" exclusion at line 1147) to
give Food special visual/behavioral treatment. Rent should get the same treatment as a second
"everyone basically has this" mandatory Needs expense — the premise being that anyone paying for a
subscription app is very likely covering at least a rent/mortgage share, roommates or not.

- [ ] **Decide the seeding default** — Food's flat `$400/mo` guess works because grocery spend is a
  fairly narrow band; rent is not (varies enormously by market, and a roommate split isn't
  guessable at all). Options: seed at `$0` and require the user to fill it in during setup/first
  visit to Budget; prompt for it explicitly as a SetupWizard question; or seed unset and just rely
  on the "mandatory, pinned, can't fully delete" treatment to draw the eye. Needs a decision, not
  an assumption.
- [ ] **`isRentPrimary` / `isRentHighlighted` flags** — mirror the Food flag pair exactly (naming
  TBD — could also be a single generalized `isPinnedPrimary` + a `pinnedKind: "food" | "rent"` if
  a third mandatory expense is ever added later; decide during implementation, not here).
- [ ] **Wire into every spot Food's flags currently gate** — `BudgetPanel.jsx`'s pinned-card
  rendering, the food-sheet detection, and the "exclude Food from this category's regular list"
  filters all need the Rent equivalent added alongside, not a parallel code path.
- [ ] **SetupWizard touchpoint** — decide whether Rent gets asked directly in the wizard (Step 3
  Deductions currently only covers benefits/other-deductions) or is left to be filled in on first
  Budget visit like Food effectively is today.
- [ ] **Copy/UI distinction from Food** — Food's visual emphasis language currently just says
  "food" implicitly via icon-free styling; Rent needs its own label/copy so the two pinned cards
  read as clearly different mandatory items, not two of the same thing.

### B. Preset Category Brainstorm — do this first, before any schema/UI work below

*Explicitly gated: §C's editor build should not start until this brainstorm has actually
happened and produced a settled list. This bullet exists so a future session doesn't skip straight
to building from an assumed category list.*

- [ ] **Hold a dedicated brainstorm pass** to collect a strong, common preset category list —
  the kind of expense lines most users actually carry beyond Food/Rent: Utilities, Car Insurance,
  Lawyer Fees, Court Fees, and others in that same "frequently-needed, non-obvious-to-type-from-
  scratch" vein. (These are ordinary expense categories, separate from — not a variant of — the
  Rent/Food mandatory-expense mechanism in §A.)
- [ ] **Resolve where presets sit in the existing schema** — today there are exactly two top-level
  `category` values (`Needs` / `Lifestyle`, `constants/config.js:333`), plus the separate `Loans`
  concept. Decide whether presets are a new sub-category/tag layer on top of `Needs`/`Lifestyle`
  (each preset still resolves to one of the two for all the existing category-driven math/UI) or
  something else — this is a real schema question, not just a UI dropdown question, and belongs in
  the brainstorm session.
- [ ] **Decide the preset's scope** — is this a fixed, curated list (simplest, matches "most
  common" framing) or does it need a user-added-custom-category escape hatch too? Settle during
  the brainstorm, not by default.

### C. Editor UI Tuneup + Icons

*Depends on §B landing first.*

- [ ] **More intuitive "add expense" editor** — today `+ ADD EXPENSE LINE` (`BudgetPanel.jsx:1755`)
  opens a bare free-text label input with a Needs/Lifestyle category toggle; no quick-select, no
  suggestions. Replace/augment with quick-select category chips seeded from §B's finalized list —
  picking one pre-fills the label (and category, if presets map to one) rather than the user typing
  a category name from scratch every time.
- [ ] **Icon set for the "most commonly had" categories** — small single-color marks (matching the
  existing icon style already used elsewhere, e.g. `EVENT_TYPES`' icon glyphs in
  `constants/config.js:324`) for whichever presets the brainstorm settles on, shown on both the
  quick-select chips and the resulting expense row so common categories are visually scannable at a
  glance rather than every row looking like an identical text line.
- [ ] **Keep the existing free-text path** — quick-select is additive; a user with an expense
  outside the preset list must still be able to type a custom label the way the editor already
  works today.

---

## 26. In-App Tutorials, Onboarding & Help

*New workstream (2026-07-22), scoped from a codebase status review — not yet started, no design
decisions made. Pure greenfield: nothing below is a partial build to finish.*

**The gap.** `SetupWizard.jsx` covers account *setup* (pay structure, schedule, deductions) but
there is no in-app system that teaches a user how to *use* the app once setup is done — no
tooltip layer, no coachmark/walkthrough, no "?" help modal anywhere in `src/components/`. The one
real step-by-step tutorial in the codebase is `PwaInstallModal.jsx`'s 5-step "Add to Home Screen"
walkthrough — install-specific, not feature education. The closest thing to a help surface is the
AI Coach (`AskCoachPanel.jsx` + `coachFeatureGuide.js`'s hand-written feature reference), but it's
gated to `isAdmin`/`isTester` only and is Q&A, not guided onboarding — not available to the
regular user population that would need it most.

- [ ] **Decide the mechanism** — first-run feature tour (coachmarks over Home/Income/Budget on
  first login post-setup), a persistent "?" help affordance per panel, or opening up
  `coachFeatureGuide.js`'s content to non-admin users through a lightweight non-AI help sheet
  (cheapest to ship — the copy already exists, written in-voice, and is prompt-cache-friendly
  precisely because it's static).
  - [ ] **Preferred first artifact — commit `coachFeatureGuide.js` to plain user copy.**
    `docs/product/help/panel-help-copy.md` is created here as the canonical draft doc, seeded
    directly from `coachFeatureGuide.js`'s five panel writeups. This is a real deliverable, not a
    placeholder: rendering that doc's content as a static "?" help sheet per panel is buildable
    without any Coach/AI gate at all, which is why it's called out ahead of the tour-vs-tooltip
    decision below — even if the interactive-tour question stays open, the copy work does not need
    to wait on it. Move product copywriting/iteration on that content into the linked doc rather
    than back into this TODO once it exists.
- [ ] **Where it would hook in** — `App.jsx` root shell already coordinates overlay modals via
  imperative refs (see `PwaInstallModal`'s `open(triggerEl)` pattern); a feature tour would follow
  the same shape. A first-run tour's natural trigger point is `SetupWizard`'s `onComplete`
  callback (`setupComplete: true` transition) rather than a separate "have you seen this before"
  flag.
- [ ] **Scope the audience** — decide whether this is truly for every user (most likely, since
  onboarding is a pre-paywall/pre-tier concern) or whether some depth is reserved behind
  `isTester`/`isAdmin` the way Coach currently is — these are different products (a UI tour vs. an
  AI explainer) and shouldn't inherit Coach's gate by default just because the content originated
  there.
- [ ] **Mobile checklist applies** — any tooltip/coachmark overlay must clear the existing Mobile
  Checklist (CLAUDE.md) — 44×44px targets, no horizontal scroll at 375/390px, safe-area insets —
  since a first-run tour is exactly the kind of feature that gets prototyped on desktop and ships
  broken on an iPhone notch.

---

## 27. Data Encryption & At-Rest Security Posture

*New workstream (2026-07-22), scoped from a codebase status review — not yet started. Read
`docs/drift-app-warden.md` §19 F120 before touching any persisted field that might fall into a
higher sensitivity class than what the app collects today — that entry is the authoritative
trigger check for this whole section.*

**The gap.** There is no field-level encryption anywhere in the app — no `pgcrypto`, no
application-layer AES/cipher, nothing beyond Supabase/Postgres's platform-level defaults.
Protection today is entirely: TLS in transit (Supabase's HTTPS endpoint, Vercel's `api/*`
functions) + RLS for access control (`019_enable_user_data_rls.sql`, 84 policy references across
`database/migrations/`) + the service-role write boundary for privileged columns (`db.js`'s
`saveUserData` destructure whitelist, CLAUDE.md's Persistence section). That's a reasonable
posture **today** because nothing currently collected (income, schedule, budget, goals) is
regulated/high-sensitivity data — but there's no infrastructure in place if that changes.

- [ ] **No action needed on current fields.** This section is a readiness/gap flag, not a
  "go encrypt `user_data`" ticket — don't build anything here speculatively (see CLAUDE.md's
  no-speculative-abstraction rule). The actionable trigger is §19 F120: a *new* field in a
  genuinely high-sensitivity class (SSN, DOB, bank account/routing, government ID).
- [ ] **If/when that trigger fires** — decide app-layer encrypt-before-write /
  decrypt-after-read (in the `db.js` write path / `loadUserData`, F67) vs. a `pgcrypto`-backed
  column via a dedicated migration, before the migration lands, not after. Update this section
  with the decision once made rather than leaving it silently resolved in a migration file only.
- [ ] **Session/token storage note (lower priority, informational only)** — `lib/supabase.js`'s
  `sharedStorage` shim dual-writes the Supabase auth session to `localStorage` **and** a
  same-origin cookie (`Secure` + `SameSite=Lax`, not `HttpOnly` — can't be, it's client-set) to
  work around iOS PWA storage-partition isolation. This is inherent to Supabase's client-side
  session model, not a defect, but worth a second look if the app's threat model ever changes
  (e.g. if XSS surface grows with third-party scripts).
- [ ] **Audit cadence** — no recurring security-posture review currently exists; consider whether
  this section should be re-visited whenever a new `user_data` field is proposed (tying it to the
  existing F110 four-site procedure checklist) rather than left as a one-time flag.

---

## 28. Irregular / Flexible Shift Hours Support

*New workstream (2026-07-22), scoped from a codebase status review — not yet started. Touches the
core fiscal engine (`finance.js` `buildYear` and friends) — read `docs/drift-app-warden.md` §18
(Spine A — Fiscal Math) before starting; this is exactly the kind of change that class of section
exists to gate.*

**The gap.** The income engine is built around a single fixed `shiftHours` value per user
(`config.shiftHours` — 12 for the DHL preset, defaults to 8 for base users); every hour
computation in `finance.js` is `shiftCount × shiftHours`, not per-day actual hours. The existing
"flexible" tiers are all still shift-count-based:
- DHL preset — rotation-derived days/hours (`DHL_PRESET.rotation`).
- DHL/base "custom hours" — a flat weekly target (`customWeeklyHours`, or the DHL-only
  `customWeeklyHoursLong`/`customWeeklyHoursShort` pair) that back-derives how many *additional
  fixed-length shifts* are needed to hit it (`finance.js` — see `getDhlPlannedPattern` and the
  `customHrs ?? maxWeeklyHours ?? standardWeeklyHours` fallback chain, several call sites e.g.
  `finance.js:162`, `:560-561`, `:1274`).
- Base user ceiling — `maxWeeklyHours`, still assuming uniform shift blocks.
- `config.scheduleIsVariable` exists but only toggles between two paystub-rate tiers (long/short
  week), not per-day hour variability.
- `WeekConfirmModal.jsx` lets users mark shifts missed/added/partial, but every override is still
  expressed in units of `config.shiftHours` (e.g. "3 shifts × 12h" — see `hoursLost`/`hoursGained`
  computations throughout the file).

**Net effect:** anyone whose real schedule doesn't decompose into whole multiples of one
`shiftHours` value — a retail/service worker logging 5.5h Monday, 3h Tuesday, 8h Thursday, or any
gig-style variable-hours pattern — doesn't fit the model today.

- [ ] **Scope the target user first** — this is a bigger product decision than a bug fix: does
  "irregular hours" mean (a) a per-day hour input replacing the shift-count model entirely for
  opted-in users, (b) a third schedule tier alongside DHL-preset/custom-weekly-hours that accepts
  a per-weekday hour array, or (c) something narrower? Needs a decision before touching
  `buildYear`.
- [ ] **Identify every `shiftHours`-multiplication call site** — `finance.js` has this pattern
  repeated across gross-pay, OT-threshold, and week-total calculations; `WeekConfirmModal.jsx` has
  it again for missed/pickup-shift hour math. A per-day-hours model would need all of these
  re-derived from a day-level source of truth instead of `shiftCount × shiftHours`, not patched
  individually (the drift risk §18 exists to catch).
- [ ] **OT-threshold interaction** — `otThreshold`/`otMultiplier` math currently assumes a known
  shift-count-derived weekly total; per-day variable hours changes how OT is detected (running
  daily/weekly total vs. a precomputed shift count) and needs its own design pass, not an
  assumption that the existing OT logic "just works" once hours become variable.
- [ ] **WeekConfirmModal UX** — the day-grid confirm flow would need a per-day hour input instead
  of (or alongside) the current missed/pickup shift-toggle UX — a real UI redesign for that
  screen, not a data-model-only change.

---

## 29. Tip Income Tracking

*New workstream (2026-07-22), scoped from a codebase status review — not yet started.*

**The gap.** There is no field, wizard question, or log-entry type for tip/gratuity income
anywhere in the app — confirmed empty across `constants/config.js`, `finance.js`,
`SetupWizard.jsx`, `WeekConfirmModal.jsx`, and `EVENT_TYPES` (`LogPanel.jsx`'s event types top out
at `bonus`/`missed_unpaid`/`pto`/etc. — no tip-shaped entry). Precedent exists for "variable income
on top of base pay" (`config.commissionMonthly` — a flat monthly average) and for one-off logged
income (`EVENT_TYPES.bonus`, and the Job-Loss-mode-only `jobHuntIncomeLog` "Log Extra Income"
widget) but neither is wired for recurring, per-shift, tax-treated tip income, and the latter is
scoped to Job Loss Mode only.

- [ ] **Decide the income shape** — tips are usually per-shift and often cash (no automatic tax
  withholding the way payroll wages have), which is a materially different tax-treatment question
  than `commissionMonthly`'s flat average. Needs a decision on whether tips flow through the same
  `computeNet`/withholding pipeline as wages or get modeled separately (e.g. logged post-tax,
  reducing `targetOwedAtFiling` headroom instead of running through `fedRateLow`/`stateRateLow`).
- [ ] **Decide the entry point** — a new `EVENT_TYPES` entry (fits the existing "log real life,
  see the dollar effect" Log panel pattern, `LogPanel.jsx`) vs. a new per-week field alongside pay
  structure in `SetupWizard`/`WeekConfirmModal` (fits if tips are a near-every-shift occurrence for
  the target user, not an occasional event). The Log-panel route is the lower-lift start given the
  existing `EVENT_TYPES`/Log Effect Summary infrastructure already generalizes to "a dollar-impact
  event type."
  - [ ] **If a new field lands in `config` or a week record** — this is a "new persisted field"
    for `docs/drift-app-warden.md` §19 F110's four-site procedure (the destructure sites, the ref,
    the drift badge) — run that checklist, don't hand-roll persistence for it.
- [ ] **Tax-plan interaction** — if tips are ever pulled into the withholding model, this needs to
  be reconciled with the existing `taxExemptOptIn`/`canAccessTaxPlan` liability-hold decision
  (`entitlements.js`, drift-app-warden §20 F111) rather than adding a second, parallel tax-estimate
  path.
- [ ] **Rolling income view** — `IncomePanel`'s week-by-week gross/net breakdown would need a line
  for tip income distinct from base gross, so the "receipt behind every dollar" framing
  (`coachFeatureGuide.js`'s own description of the Income panel) stays true once a second income
  stream exists.

---

## 30. Beta Program — Per-User Beta Window (Report Scoping)

*New workstream (2026-07-24), scoped from a codebase status review. Builds directly on the
already-shipped beta usage-tracking system (migrations `025_add_beta_code_used.sql`,
`026_add_beta_activity_events.sql`, `entitlements.js` `isTrackedBetaTester`, `api/admin-beta-report.js`)
— not a redesign, a scoping fix for it.*

**The gap.** `beta_code_used` carries no timestamp. `api/admin-beta-report.js` currently sums
**all-time** activity for every tracked beta tester, not "their 10 weeks." That's silently wrong the
moment codes go out staggered (tester A redeems week 1, tester B redeems week 4 — B's report window
should not be measured against A's calendar) or if the program's actual end date slips past 10 weeks
for some accounts. This is the single highest-value fix in this list because it's the one gap that
would quietly distort the actual scoring numbers, not just leave a nice-to-have on the table.

- [ ] **Migration `027_add_beta_started_at.sql`** — add `beta_started_at TIMESTAMPTZ` to `user_data`,
  alongside `beta_code_used` (025) and `beta_activity_events` (026). Same client-write protection as
  every other tester/admin column (never added to the `authenticated` column-grant list).
- [ ] **Auto-stamp it, don't rely on remembering a third manual field** — add a trigger mirroring
  `set_tester_trial_window()` (migration `021_add_is_tester_beta_flag.sql`'s pattern exactly): on
  `user_data` INSERT/UPDATE, when `beta_code_used` transitions from null to non-null, stamp
  `beta_started_at = now()`. This closes the same "two fields must be set together" risk that
  migration 025's own comment flags for `is_tester`/`beta_code_used` — now it's one manual field
  (`beta_code_used`) plus one trigger-derived one, not three fields to remember by hand.
- [ ] **`db.js` read mapping** — add `beta_started_at` to `loadUserData()`'s SELECT and the
  `betaStartedAt` return-object mapping, same pattern as `betaCodeUsed` (`db.js` — read-only, never in
  `saveUserData`/`flushUserDataKeepalive`'s destructure).
- [ ] **`api/admin-beta-report.js` scoping** — fetch `beta_started_at` in the existing `betaUsers`
  query (`.select("user_id, display_name, beta_code_used")` → add `beta_started_at`), then filter each
  user's event aggregation to `created_at >= beta_started_at` (and optionally
  `< beta_started_at + 10 weeks` once the program has a hard end date per user, or just `<= now()`
  while it's still running). Add a `beta_started_at`/`beta_week_number` column to the CSV output so
  the reviewer can see which week of *their* program each user is currently on at a glance.

---

## 31. Beta Program — Pre-Launch Dry Run Checklist

*New workstream (2026-07-24). Not a code change — a verification checklist to run once before
handing out any of the 40 real beta codes, using the infrastructure already shipped in this session.*

**Why this matters.** The whole usage-tracking system (migrations 025/026, the login/goal/expense
hooks in `App.jsx`/`HomePanel.jsx`/`BudgetPanel.jsx`, `api/admin-beta-report.js`) has not been
exercised against a live Supabase instance yet — the migrations haven't been run (per the prior
conversation, that's being handled separately). A silently-broken hook (a typo in an event_type, a
missed RLS grant, a report query that returns zero rows) discovered at week 10 is much worse than the
same bug caught in five minutes before day 1.

- [ ] **Run migrations 025 + 026** against the target Supabase project (tracked separately, listed
  here so this checklist isn't attempted before they've landed).
- [ ] **Manually flip one real (or disposable test) account** to the tracked-beta state:
  `update user_data set is_tester = true, beta_code_used = 'DRYRUN' where user_id = '<test account>';`
- [ ] **Sign in as that account** and confirm a `login` row appears in `beta_activity_events`
  (Supabase table editor, or `select * from beta_activity_events where user_id = '<test account>'
  order by created_at desc;`).
- [ ] **Add a goal, edit a goal, add an expense, edit an expense** — confirm all four corresponding
  event rows land (`goal_created`, `goal_updated`, `expense_created`, `expense_updated`).
- [ ] **Confirm a friends/family-style account does NOT log** — flip a second test account to
  `is_tester = true` with `beta_code_used` left `null`, repeat the actions above, confirm **zero**
  rows land for that account (`isTrackedBetaTester`'s gate working as intended).
- [ ] **Hit `api/admin-beta-report.js`** as an admin account (`Authorization: Bearer <token>`) and
  confirm the CSV includes the dry-run account with the expected counts, and excludes the
  friends/family test account entirely.
- [ ] **Clean up** the dry-run test account's rows/flags before real codes go out, so it doesn't
  pollute the real cohort's report.

---

## 32. Beta Program — Code Redemption Flow

*New workstream (2026-07-24). This is the "orchestrated later" piece explicitly deferred during the
usage-tracking build — `is_tester`/`beta_code_used` are manual-SQL-only today. Scoped here so it's
ready to pick up whenever the beta program is ready to self-serve invites instead of hand-running SQL
for 40 accounts.*

**The gap.** Every beta account currently requires a human to run `update user_data set is_tester =
true, beta_code_used = '<code>' ...` by hand. Fine for a one-time 40-person cohort, tedious and
error-prone for anything larger or repeated.

**Scoping — mirror the existing investor-code flow almost exactly** (migrations `010_add_investor_codes.sql`/
`011_add_investor_users.sql`, `InvestorRegister.jsx`, `api/seed-investor.js`, `createInvestorAccount()`
in `db.js`) — this app already has a working, tested pattern for "redeem a code, get flagged":

- [ ] **`beta_codes` table** (new migration) — `id`, `code` (unique), `label`, `is_active`, `notes`,
  `created_at`; same shape as `investor_codes`. Decide single-use vs. multi-redemption up front (an
  `is_active` toggle per code, like investor codes, is probably sufficient for 40 users on a handful
  of codes rather than one code per person).
- [ ] **Redemption UI** — either a code field added to `LoginScreen.jsx`'s sign-up flow (same spot
  the investor access code lives) or a small dedicated screen mirroring `InvestorRegister.jsx`.
- [ ] **`api/seed-beta.js`** (new service-role route, mirroring `api/seed-investor.js` and
  `api/seed-trial.js` exactly) — verifies the caller's Bearer token, re-validates the code against
  `beta_codes.is_active` server-side (never trust the client's validation), then atomically sets
  `is_tester = true`, `beta_code_used = '<code>'`, and (once §30 lands) `beta_started_at = now()` in
  one write — closing the "two/three fields set together" risk at the source instead of relying on a
  human to remember every field on every manual SQL run.
- [ ] **Client wiring** — a new `redeemBetaCode()` in `db.js` that POSTs to `api/seed-beta.js`, called
  from the redemption UI, same shape as `createInvestorAccount()`'s call to `seed-investor.js`.

---

## 33. Beta Program — In-App Feedback Channel

*Shipped 2026-07-24 (built as Option A, upgraded to Option B same day once the beta scoring rubric
made it non-optional — "Feedback Submitted — 25 pts, frequency + specificity" can't be scored from a
mailto link, which produces zero queryable data).*

- [x] **Option A: `mailto:` link** — built first, then replaced same-day.
- [x] **Option B: logged, readable submissions** — `beta_activity_events` gained a `feedback`
  event_type + nullable `note TEXT` column (migration `030_add_beta_feedback.sql`). `ProfilePanel.jsx`'s
  "Send Feedback" row now opens `BetaFeedbackDetail` (a real textarea, 4000-char client-side cap, no
  DB-level length constraint — ~40 known trusted users), which calls `logBetaFeedback()` (`db.js`) —
  same `isTrackedBetaTester` gate as everything else. `api/admin-beta-report.js` gained a
  `feedback_count` column on the summary CSV plus a separate `?format=feedback` export (one row per
  submission — free text with a possible multiple-per-user count doesn't fit the summary's
  one-row-per-user shape).
- [x] **The prompt** — "What's working (or not)?" placeholder copy; free-text, not a structured
  multi-question form. Revisit only if submissions turn out too rambling to score.

---

## 34. Beta Program — Attrition Visibility Mid-Program

*New workstream (2026-07-24). The smallest addition in this list — purely additive to
`api/admin-beta-report.js`, no schema change, no new hook points.*

**The gap.** The report already computes `lastAt` (the most recent event timestamp) per user during
aggregation — it's just not surfaced as an actionable column. Right now, spotting a tester who's gone
quiet requires eyeballing raw timestamps; nothing calls it out.

- [ ] **Add a `days_since_last_active` column** to `api/admin-beta-report.js`'s CSV output — computed
  from the `lastAt` value already tracked in the per-user aggregation loop
  (`Math.round((Date.now() - new Date(lastAt)) / 86400000)`), zero new data collection required.
- [ ] **Consider running the report weekly during the program**, not just once at week 10 — the
  column is only useful for catching a dropping-off tester in time to do something about it if it's
  actually looked at before the program ends. This is a process suggestion, not a code requirement —
  the report endpoint already supports being hit any time.
- [ ] **Optional: sort/highlight** — if the CSV is opened in a spreadsheet each week anyway, a simple
  descending sort by `days_since_last_active` puts the most-at-risk testers at the top with zero extra
  code (a spreadsheet-side sort, not an app change).

---

## 35. Beta Program — Offboarding Decision (End of Week 10)

*Resolved 2026-07-24 — superseded by an actual scoring rubric (100 pts: App Usage 50 w/ 30-pt floor,
Feedback 25, Call Attendance 15, Longevity 10 → three outcome tiers), not the earlier three
free-standing options below. Execution script shipped: `database/beta-offboarding-day71.sql`.*

**Outcome mapping, applied per-account at day 71 (not automated — run by hand once):**
- **70–100, floor met → Lifetime access + frontline feedback club.** `is_tester` stays true,
  `beta_code_used` cleared, `trial_ends_at`/`access_ends_at` pushed ~50 years out. "Feedback club" is a
  non-technical/community perk, nothing to apply in-app.
- **60–69, floor met → 6 months free.** Same shape, but `trial_ends_at`/`access_ends_at` reset to a
  *fresh* +6 months from day 71 — **not** simply left alone. Important subtlety found while building
  this: `is_tester`'s window was already stamped once on redemption day (migration 021's trigger), so
  by day 71 only ~4 months of it are left; leaving it untouched would under-deliver the reward. Also:
  `is_tester` does **not** bypass the paywall on its own — confirmed `App.jsx`'s
  `paywallBypassed = isAdmin || config.isInvestor` has no `isTester` — actual access is gated purely by
  `trial_ends_at`/`access_ends_at` via `getEntitlement()`. Toggling `is_tester` alone would not have
  delivered either reward tier; both fields must be set together.
- **Floor not met, or 0–59 → No perk.** `is_tester` off (drops AI/Tax Plan too, not just billing),
  `beta_code_used` cleared, `trial_ends_at`/`access_ends_at` set to now so nothing from the original
  window lingers.

**How to compile the per-tier account lists** — `api/admin-beta-report.js` (usage + feedback_count)
`?format=feedback` (readable feedback content for the "specificity" judgment call) + your externally-
tracked call attendance (this app has no record of scheduled calls — deliberately left external, see
§ discussion 2026-07-24). Scoring itself stays manual, matching this whole system's "reviewed by a
human" premise — no auto-scoring formula was built.

---

## 36. Beta Program — In-App "Beta Tester" Badge

*New workstream (2026-07-24). Purely cosmetic/motivational — no data flow changes, fully isolated
from the tracking system itself.*

**The idea.** A small visual acknowledgment (a pill/label near the account display name) for
participants — the kind of lightweight social signal that tends to nudge engagement quality up for
exactly zero risk, since it touches no finance logic and no persisted data.

- [ ] **Where it lives** — `ProfilePanel.jsx`, near existing account info, gated on
  `isTrackedBetaTester({ isTester, betaCodeUsed })` (already threaded as props into the panels that
  would need it, or trivially addable to `ProfilePanel` the same way `isTester` already is). Friends/
  family testers (no `beta_code_used`) should NOT see this badge — it's specifically "you're in the
  10-week program," not "you have tester access."
- [ ] **Style it as a genuinely small addition** — reuse an existing pill/tag pattern already in the
  design system (`ui.jsx`'s primitives, or the style already used for status badges elsewhere) rather
  than inventing new visual language for a one-off.
- [ ] **Decide the copy** — "Beta Tester," "10-Week Beta," or something on-brand; a two-minute decision,
  not worth its own design pass.

---

## 37. Beta Program — Week-5 "Halfway" Nudge Email

*New workstream (2026-07-24). Reuses existing lifecycle-email infrastructure rather than standing up
a new send pathway. Depends on §30 (`beta_started_at`) as the anchor date — build that first.*

**The idea.** A single motivational touchpoint at the program's midpoint, reusing the same
infrastructure that already sends trial/dunning emails (`api/_email.js`'s sender, the
`api/_lifecycleEmails.js` template pattern, `api/cron-subscription-lifecycle.js`'s daily-cron shape) —
not a new email system.

- [ ] **Scope it as an addition to the existing daily cron**, not a new standalone job —
  `api/cron-subscription-lifecycle.js` already runs daily and already reads `user_data` rows; add an
  independent check alongside its existing lifecycle-phase logic: for each row where `is_tester` and
  `beta_code_used` are both set (the tracked cohort) and `now() - beta_started_at` has just crossed the
  5-week mark, send the halfway email.
- [ ] **Avoid resending** — either a narrow enough daily window check (only fire on the exact day the
  account crosses 5 weeks, not "5 weeks or more") or, more robustly, a new `halfway_email_sent_at`
  column stamped on send and checked before sending again — same throttle pattern already used for
  `last_dunning_email_at`/`dunning_email_count` (migration `017_add_subscription_fields.sql`).
- [ ] **New template in `api/_lifecycleEmails.js`** — short, motivational, references the program by
  name; follow the existing template function pattern (`buildLifecycleEmail` or equivalent) rather than
  hand-rolling a one-off send.
- [ ] **Low priority relative to §30–34** — this is pure polish; the report and its scoping fix matter
  more to the program's actual goal (scoring 40 people against a rubric) than a reminder email does.

---

## 38. Camera / Barcode / OCR Features — Mobile-First Income & Expense Capture

*New workstream (2026-07-24), scoped from investigative pass — not yet started, no design decisions made. Pure greenfield. Six candidate features identified; all depend on shared infrastructure (BarcodeDetector API or OCR engine). This section is a parking lot for feasibility and grouping logic; buildout decisions to come.*

**The gap.** The app is currently 100% manual data entry. A smartphone has a camera and the web platform has access to it (via `getUserMedia` + device sensors); no camera-based quick-entry path exists today. Use cases: snapping a paystub to skip SetupWizard field entry, tapping a receipt to log an expense, scanning a product barcode to check affordability against the week's remaining budget.

**Infrastructure dependencies (the critical path blocker):**
- **BarcodeDetector API** (native, no new dependency) — Chrome/Edge 83+, Safari limited, Firefox no. Supports EAN-13, UPC, and others. Needed by features #1, #2.
- **OCR engine** (Tesseract.js client-side vs. cloud API decision) — all three major choices have tradeoffs:
  - **Tesseract.js** (Apache 2.0 licensed, WASM-based): ~2.3 MB minified, runs client-side, no credentials/cost, accuracy ~85–90% on clean images, slower (seconds per image on mobile). Paystub/receipt parsing will need fallback to manual entry for unusual formats.
  - **Cloud API** (Google Cloud Vision, AWS Textract, Azure): faster (100ms API call), better accuracy (95%+), but requires credentials, cost scales with usage, adds backend routing complexity. GDPR/privacy consideration if images leave the device.
  - **Hybrid:** Tesseract for quick preview/demo, cloud API for production with fallback if rate-limited.
  Needed by features #3, #4, #5.
- **ML-based text detection** (TextDetection API or TensorFlow.js) — feature #6 only, not critical path. TextDetection API unavailable in Safari/Firefox. TensorFlow.js adds ~200 MB to bundle for a model. Defer this one.

### Feature Inventory

#### 1. "Can I afford this?" Barcode Scan

*User snaps a product barcode at the shelf → app detects UPC → looks up price → checks against weekly surplus → shows "✓ Yes, $X left after" or "⚠ No, over by $Y".*

- **Mechanism:** BarcodeDetector API (native) + external UPC/product database (e.g., Barcode Lookup API, UPC database, or roll-your-own if only targeting a specific retailer).
- **T-shirt:** **S-M** (40–80 hours)
- **Tech stack:** Needs new dependency: UPC/EAN database service (API key, usage tier). BarcodeDetector is native.
- **Blocked by:** None — can build independently.
- **Unblocks:** Feature #2 (goal-linked purchase).
- **Notes:** 
  - UPC lookup is a third-party service (Barcode Lookup free tier limited, or build own DB). Cost/privacy decision needed.
  - Affordability check reuses existing weekly-surplus computation (`estimateWeeklyNet` in SetupWizard; `buildYear` in finance.js).
  - Mobile-first: assume 44×44px viewfinder button in bottom nav or Budget panel (clears Mobile Checklist).
  - Fallback: if barcode scan fails, allow manual UPC entry or product name search.

#### 2. Goal-Linked Purchase Logging

*After scanning a product barcode (feature #1), user can optionally "Log this against a goal" instead of dumping it as a generic expense category. Taps into an existing goal, reduces its "funded" amount.*

- **Mechanism:** BarcodeDetector (from #1) + goal picker UI + LogPanel entry type.
- **T-shirt:** **S-M** (20–40 hours, UI-only)
- **Tech stack:** Reuses feature #1's barcode infrastructure + existing goal list from HomePanel/BudgetPanel. New LogPanel `EVENT_TYPES` entry.
- **Blocked by:** Feature #1 (barcode scan).
- **Unblocks:** None directly, but polishes #1.
- **Notes:**
  - One new `EVENT_TYPES` entry (e.g., `goal_purchase: { label: "Goal Purchase", icon: "🎯" }`).
  - Log Effect Summary (`LogPanel.jsx`) already generalizes to arbitrary event types — no new fiscal math needed.
  - UI: "You scanned [product], found $X. Log it against which goal?" → goal chips + Confirm.
  - Stretch variant: auto-suggest the most-relevant goal (goal due soonest, or goal scope matching category — e.g., "Furniture" purchase → "Apartment Setup" goal).

#### 3. Paystub Onboarding Shortcut

*User snaps a photo of a paystub during SetupWizard. OCR extracts gross pay, tax withholding, deductions, pay date. Auto-fills the "Pay Structure" wizard step (step 1) so the user doesn't type all the numbers manually.*

- **Mechanism:** Camera snap + OCR (Tesseract.js or cloud API) + structured field extraction + SetupWizard step rewiring.
- **T-shirt:** **L** (80–160 hours)
- **Tech stack:** 
  - Tesseract.js (2.3 MB, ships with app, privacy-first) — lower cost, but accuracy risk on unusual paystub formats.
  - Cloud API (Google Vision, AWS Textract) — better accuracy, privacy tradeoff, cost/rate-limiting, needs backend routing.
  - Hybrid: Tesseract preview, cloud fallback if confidence is low.
- **Blocked by:** OCR engine decision (Tesseract vs. cloud).
- **Unblocks:** Features #4, #5 (both use same OCR).
- **Critical notes:**
  - **High format variability:** paystubs vary wildly by employer (ADP, Workday, Gusto, etc.) + international formats. OCR alone won't extract structured data reliably — needs post-OCR parsing (regex, NLP, or handcrafted field matchers per format).
  - **Fallback required:** If confidence is low or parse fails, revert to manual entry in the wizard. Do NOT auto-fill a wrong gross-pay number.
  - **SetupWizard rewiring:** Step 1 (Pay Structure) needs "Snap Paystub" button → camera snap flow → parse → auto-fill fields → let user review/correct before Next.
  - **Testing:** Will need fixtures (photos of real paystubs from major payroll providers, sanitized). Privacy concern — can't store/train on real paystubs without consent.
  - **Field extraction targets:** gross pay, net pay, tax withholding (federal, state, FICA), deductions (401k, insurance, etc.), pay period end date, pay frequency (weekly/biweekly/monthly).

#### 4. Receipt-to-Expense-Category Snap

*User snaps a receipt with their phone. OCR extracts the total amount + merchant name. Auto-fills "Add Expense" form with amount + suggested category (e.g., "Whole Foods" → Food/Dining; "CVS Pharmacy" → Pharmacy/Health).*

- **Mechanism:** Camera snap + OCR (Tesseract.js or cloud API) + merchant/amount parsing + category inference.
- **T-shirt:** **M-L** (60–120 hours)
- **Tech stack:** 
  - OCR engine (same choice as feature #3).
  - Post-OCR parsing: regex or hardcoded merchant patterns (e.g., "Whole Foods", "Trader Joe's", "Sprouts" → category "Food"). Alternatively, lightweight ML classifier or LLM call via Coach API (`api/coach.js` pattern) for one-shot inference ("What spending category is this receipt from [merchant]?").
  - BudgetPanel expense UI already exists — just pre-fill the form fields.
- **Blocked by:** OCR engine decision.
- **Unblocks:** None directly.
- **Notes:**
  - **Merchant name extraction:** not every receipt has a clear header (some print the address or website URL instead). OCR + NLP to find the merchant name. Fallback: let user confirm/correct.
  - **Amount extraction:** usually the last number on the receipt, but sales tax complicates this. Heuristic: take the largest number that looks like a dollar amount; let user confirm.
  - **Category inference:** 
    - **Option A (hardcoded):** Build a merchant-to-category lookup table (Whole Foods → "Groceries", "Starbucks" → "Food", "Exxon" → "Gas", etc.). Scales poorly.
    - **Option B (ML lightweight):** Train a small classifier or use Coach API one-shot inference: "What category is this merchant: [name]?" Falls through to manual category pick if API is unavailable/rate-limited.
    - **Option C (UI default):** Pre-fill category as "Other" or "Uncategorized", user picks from category chips. Lowest friction for MVP.
  - **Receipt image quality:** phone photos in dim lighting will OCR poorly. Consider adding a "take better photo" hint or a pre-snap UI that guides composition (frame detection).

#### 5. Pay-Cycle Change Detection

*User snaps a new paystub. OCR extracts key fields. App compares against the most recent stored paystub, flags what changed (gross pay up/down, tax rate shift, new deduction, etc.), and recalculates the income model accordingly.*

- **Mechanism:** Camera snap + OCR (same as #3) + paystub storage in `user_data` + field-level diff + `buildYear` recompute.
- **T-shirt:** **M** (40–80 hours)
- **Tech stack:** 
  - OCR engine (shared with #3, #4).
  - New field: `lastPaystubSnapshot` in `user_data` (JSON blob storing parsed paystub fields from last snap: gross, net, tax breakdown, deductions, pay date). Needs a migration.
  - Diff logic: simple field-by-field comparison (gross pay ≠ last gross? flag it).
  - Recompute: if `shiftHours`, `otThreshold`, `federalRate`, etc. changed, call `buildYear` to recompute weekly net/goals/timeline.
  - LogPanel entry type: `pay_change: { label: "Pay Changed", icon: "📊" }` with an inline diff summary.
- **Blocked by:** OCR engine decision + Tesseract's paystub field extraction (feature #3).
- **Unblocks:** None directly.
- **Drift warning:** `buildYear` is a critical fiscal engine (drift-app-warden §18 Spine A). Any change to how it's triggered needs to be audited carefully. The recompute path here is straightforward (user snappped a new paystub, we re-derived income model), but add a manual "Review Changes" step before auto-applying to `config` so the user sees what changed.
- **Notes:**
  - **Storage:** `lastPaystubSnapshot` lives in `user_data.config` JSON? Or a separate column? Leaning toward a separate column (keeps config schema clean) — requires a new migration. Follow `docs/drift-app-warden.md` §19 F110's four-site procedure (destructure + ref + drift badge + eager-save).
  - **Privacy:** storing paystub data locally. Reassure in UX: "This stays on your device and is only used to detect changes."
  - **Accuracy fallback:** if OCR confidence is low, prompt user to review extracted fields before storing.

#### 6. Shelf-Tag Price Capture (Stretch / Defer)

*User snaps printed price tags on a shelf (not barcodes — the paper tag with a price and SKU). App OCRs the price, adds to a running tally as they shop, warns if total approaches weekly budget limit. UX: "Milk ($4.29) + Bread ($2.99) + Coffee ($8.49) = $15.77 — $X left in your week."*

- **Mechanism:** Live/repeated text detection (OCR or TextDetection API) + running calculator UI.
- **T-shirt:** **L-XL** (120–240+ hours, flagged as higher friction / stretch)
- **Tech stack:** 
  - **TextDetection API** (native, like BarcodeDetector) — Chrome/Edge only, not in Safari/Firefox. Not viable as a required path.
  - **TensorFlow.js + COCO-SSD or similar** — adds ~200 MB to bundle, real-time performance risk on older mobile phones (frames drop, battery drain).
  - **Fallback:** accept numeric input + photo as proof-of-price (lower automation, higher accuracy).
- **Blocked by:** ML engine decision (TextDetection not viable; TensorFlow.js adds cost).
- **Unblocks:** None.
- **Recommendation:** **Defer this one.** It's a polish feature, not a core workflow. Start with features #1–#5 (all lower friction, higher ROI). Revisit if/when browser text-detection APIs mature or if user feedback specifically asks for in-store price tracking.
- **Notes:**
  - **Real-time performance:** Continuous camera preview + frame-by-frame OCR is battery-intensive. Require explicit "Scan Price" button per item, not continuous scanning.
  - **Accuracy:** Text detection on printed tags is harder than barcodes or clean paystubs (angles, blur, reflections, multiple prices/SKUs in frame).
  - **UX complexity:** a running total UI with "Add", "Undo", "Clear" buttons; integration with the weekly budget guardrail system.
  - **If this is prioritized later:** prototype with manual numeric input first, then layer on OCR as a time-saver.

### Implementation Roadmap (Proposed Grouping)

**Phase A: Barcode Infrastructure**
- [ ] Decide on UPC/product database service (Barcode Lookup free tier, roll-your-own, or third-party API key).
- [ ] Add `<CameraCapture>` utility component (video element + BarcodeDetector + error handling).
- [ ] Add "Can I afford this?" entry point to BudgetPanel (button in nav, triggers barcode scan, shows affordability check).
- [ ] Feature #2 (goal-linked purchase) is a free add-on once #1 lands.

**Phase B: OCR Foundation**
- [ ] **Critical decision:** Tesseract.js vs. cloud API vs. hybrid. This gates all of #3, #4, #5.
- [ ] If Tesseract: ship with app (2.3 MB added to bundle). If cloud: add backend routing (`api/ocr-proxy.js` or similar) + credential management.
- [ ] Add `<ImageCapture>` utility component (camera snap + image preview/confirm before OCR).
- [ ] Feature #3 (paystub onboarding) — integrate into SetupWizard step 1.

**Phase C: Expense & Income Automation**
- [ ] Feature #4 (receipt-to-expense) — snap flow + category inference.
- [ ] Feature #5 (pay-cycle detection) — requires `lastPaystubSnapshot` migration + diff logic.

**Phase D: Defer**
- [ ] Feature #6 (shelf-tag price capture) — revisit if user research confirms the need or browser text-detection APIs improve.

### Interdependencies & Shared Infrastructure

```
Feature #1 (Barcode)
  ├─ BarcodeDetector (native API)
  ├─ Product DB service
  └─ Affordability check (existing fiscal math)
      └─ unblocks Feature #2 (goal-linked purchase)

Feature #3 (Paystub OCR)
  ├─ OCR engine decision (Tesseract vs. cloud)
  ├─ Paystub field extraction (post-OCR parsing)
  ├─ SetupWizard integration (step 1 rewire)
  └─ unblocks Features #4 & #5

Feature #4 (Receipt snap)
  ├─ OCR engine (from #3 decision)
  ├─ Merchant/category inference
  └─ BudgetPanel form pre-fill (existing UI)

Feature #5 (Pay-cycle detection)
  ├─ OCR engine (from #3 decision)
  ├─ lastPaystubSnapshot migration
  ├─ Diff logic
  └─ buildYear recompute (drift-app-warden §18 audit required)

Feature #6 (Shelf-tag capture) — isolated, deferred
  ├─ TextDetection API (not viable) OR TensorFlow.js (high cost)
  └─ Real-time performance risk
```

---

**Next step:** Confirm OCR engine choice (Tesseract vs. cloud API) — this is the critical blocker. All feasibility estimates above assume this decision is made. Once that's settled, Phase A (barcode) can proceed in parallel with Phase B (OCR foundation).

---

## 39. UI Cohesion — Cross-Panel Header/Accent Consistency

*New workstream (2026-07-25), scoped from a design-system read + code audit requested to discuss
making the app's sections "feel more cohesive and interlocked." `docs/authority-design-system`
already specifies one repeating page-header pattern (eyebrow + big title + underline, via the
`PanelHero` component) and cites Chime/Cash App's "one primary number, everything else behind
progressive disclosure" as the Flow reference model — but two of the five tabs don't actually
follow either the component or the naming convention. Backed by UX research on why this class of
drift specifically damages first-time orientation (see Sources below) — nothing here is subjective
taste, each item is a concrete divergence from the app's own documented spec.*

**Sources consulted for this pass:**
- [What Is Progressive Disclosure in UX? (2026) — UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/) — "start simple, reveal complexity only as needed"; Chime cited as the reference pattern the app's own design doc already points to.
- [Fintech UX Best Practices 2026 — Eleken](https://www.eleken.co/blog-posts/fintech-ux-best-practices) — first-value-first onboarding for financial apps.
- [Design Consistency Guide — UXPin](https://www.uxpin.com/studio/blog/guide-design-consistency-best-practices-ui-ux-designers/) — visual/functional/verbal consistency as three distinct axes that must all hold for a product to feel "reliable."
- [Why UX design consistency matters — uxstudio](https://www.uxstudioteam.com/ux-blog/ux-design-consistency) — nav labels and page identity mismatches specifically named as trust-eroding.

### A. Home and Income don't identify themselves by their own nav label

**The gap.** All five tabs are supposed to open with the shared `PanelHero` pattern
(`src/components/ui.jsx:629` — eyebrow + big title + underline). Budget, Log, and Account do:
their hero titles are "Budget," "Event Log," and "Account" respectively, matching (or closely
matching) the `BOTTOM_NAV` label a user just tapped (`src/App.jsx:49-95`). Home and Income don't:

- **Home** (`src/components/HomePanel.jsx:613`) opens with a hero titled **"Goals"** —
  the first thing a user sees after tapping the "Home" nav icon is a page that says it's
  something else. A second, differently-styled hero further down (`:1317`) says
  **"Financial Health"** — nothing on the page ever says "Home."
- **Income** (`src/components/IncomePanel.jsx:307-309`) opens with eyebrow "Income Overview"
  and hero title **"Year Summary"** — not "Income."

**Why it matters (research-backed).** This is exactly the "functional/verbal consistency"
failure mode the UXPin/uxstudio pieces above call out as trust-damaging: the nav promises one
identity, the destination delivers another. It costs almost nothing once a user has built a
mental model of the app, but it's precisely the kind of signal that makes a *first* open feel
disorienting — and Home/Income are the two most-visited tabs, so it's the most-seen instance
of the problem, not the least.

- [ ] Give Home and Income a page-identity heading that says "Home" / "Income" (either promote
      a proper top-of-page hero above "Goals"/"Year Summary," or fold the nav-matching identity
      into the existing hero's eyebrow line) — resolve alongside item B below since both panels
      need their hero markup touched anyway.

### B. `PanelHero` exists as a shared component but Home/Income hand-roll copies that have drifted

**The gap.** `PanelHero` (`src/components/ui.jsx:629-637`) is the one component meant to render
every panel's page title. Budget (`BudgetPanel.jsx:1307`), Log (`LogPanel.jsx:578`), and Account
(`ProfilePanel.jsx:2134`) call it directly. Home and Income instead paste the same visual recipe
inline as raw JSX, and the three copies no longer agree with each other or with the real
component:

| Location | Title size | Underline width / opacity | Eyebrow present? |
|---|---|---|---|
| `PanelHero` (the real component) | 32px | 28px / 0.45 | yes (required prop) |
| Home "Goals" hero (`HomePanel.jsx:613-628`) | 52px | 40px / 0.55 | yes ("Authority Finance") |
| Home "Financial Health" hero (`HomePanel.jsx:1317-1329`) | 32px | 28px / 0.45 | **no eyebrow at all** |
| Income "Year Summary" hero (`IncomePanel.jsx:307-327`) | 32px | 28px / 0.45 | yes ("Income Overview") |

Three different title sizes and an inconsistent eyebrow presence, for what is supposed to be one
repeating pattern app-wide. This is the same class of issue `docs/drift-app-warden.md` §17
(F88, T10 UI-UX) already tracks for untokenized hex — component-copy drift instead of
raw-value drift, same root cause (a shared visual contract re-implemented by hand instead of
reused), just not yet caught because F88's grep-for-hex procedure doesn't catch duplicated JSX.

- [ ] Replace Home's and Income's hand-rolled hero markup with actual `PanelHero` calls (folding
      in whatever eyebrow/title text item A above resolves on). Removes the drift permanently
      instead of re-syncing the copies by hand.
- [ ] Decide whether Home's "Goals" section legitimately warrants the larger 52px treatment (a
      deliberate emphasis choice) or whether it should drop to the standard 32px `PanelHero` — if
      the former, that's a second, intentional "large hero" variant that `PanelHero` should grow
      a prop for (e.g. `size="lg"`) rather than staying as a one-off inline copy.

### C. Untokenized gold accent (`#c8a84b`) used five times for "current/now" semantics, never declared

**The gap.** `#c8a84b` (a gold, distinct from the design doc's teal `--color-accent-primary`
`#00C896`) appears five times in `src/App.jsx`, consistently meaning "this is the current point
in time" — not a random one-off, a real recurring semantic:
- `App.jsx:112` — desktop sidebar's active-nav-item left border (`SidebarNavItem`)
- `App.jsx:2041`, `:2694`, `:3323` — "current week" cell border in three different Tax Weeks Grid
  renderings (mobile/tablet/admin sizes)
- `App.jsx:3341` — the grid's own legend swatch for "current week"

None of these five route through `src/index.css`'s `@theme` token block, and the design doc
(`docs/authority-design-system:25-44`) doesn't list a gold token at all — `--color-gold` is
defined only as "Legacy alias — maps to accent-primary" (i.e. teal, `#00C896`), which is a
*different* color than the `#c8a84b` actually in use. This is a new instance of the same
untokenized-hex debt class `docs/drift-app-warden.md` §17 F88 already tracks for
`WeekConfirmModal.jsx`/`LoginScreen.jsx`/`ProfilePanel.jsx` (also `CLAUDE.md`'s "Known Cleanup"
list) — just not yet added to that list, and in a file (`App.jsx`) none of those three cover.

- [ ] Formalize `#c8a84b` as a real design token (e.g. `--color-time-anchor` or
      `--color-signal-gold`) in `src/index.css`'s `@theme` block, replace all five `App.jsx`
      call sites, and add it to `docs/authority-design-system`'s color table so "gold = current
      point in time, teal = active/primary" is a documented rule instead of an implicit one five
      hardcoded hex strings happen to agree on today.
- [ ] Add `App.jsx`'s five `#c8a84b` sites to the untokenized-hex debt list in `CLAUDE.md`'s
      "Known Cleanup" section and `docs/drift-app-warden.md` §17 F88 (currently lists only
      `WeekConfirmModal.jsx`/`LoginScreen.jsx`/`ProfilePanel.jsx`) in the same commit that
      resolves the token, so the drift map stays accurate per the doc's own "keep it current in
      the same PR" rule.

### D. Not yet investigated — parking lot for the next pass

Raised in the original discussion but out of scope for this pass (design-doc read + static code
audit only, no runtime/visual walkthrough performed):
- The transition/motion *feel* between tabs specifically (as opposed to the fold-motion
  *mechanics* §17 F90 already covers) — does switching Home → Income → Budget feel like moving
  through one connected app, or five independently-built screens stitched together?
- How the Setup Wizard visually hands off into Home on first completion (first-run-specific;
  the wizard itself was already decluttered per items elsewhere in this doc, but the *landing*
  moment right after "Finish" hasn't been looked at for continuity with what Home now looks like).

---

## 40. Dev Infrastructure — Claude Code on the web headless UI testing

*Built 2026-07-22: `.claude/hooks/session-start.sh` + `.claude/hooks/drive-app.mjs` (see commit
`90dc305`). Web sessions previously had no way to satisfy CLAUDE.md's "start the dev server and use
the feature in a browser" rule — the dev server booted straight into a crash (`supabaseUrl is
required`, no Supabase config anywhere in the container) and Playwright wasn't available. The hook
now installs deps, and — only once the environment variables below are configured on the Claude
Code on the web environment itself (never in this repo) — wires up a real login screen and a
headless-login driver script.*

- [ ] **Pending setup (blocks this from doing anything beyond "no crash") — configure on the
  Claude Code on the web environment (Environment settings), not in this repo or any `.env` file:**
  - [ ] `VITE_SUPABASE_URL` — same value as production. Safe to store here: it's public by design.
  - [ ] `VITE_SUPABASE_ANON_KEY` — same value as production. Also safe to store: Supabase's anon
    key is meant to be client-embedded (protected by RLS, not secrecy) — it's already sitting in
    the deployed production JS bundle today.
  - [ ] `TEST_ACCOUNT_EMAIL` / `TEST_ACCOUNT_PASSWORD` — a **dedicated test/dummy account**, not
    anthonyhahne20@gmail.com or any real user. Deliberately not `VITE_`-prefixed so these can never
    end up in the client bundle — only `drive-app.mjs` reads them, straight from `process.env`.
  - [ ] Once all four are set, confirm with: `CLAUDE_CODE_REMOTE=true .claude/hooks/session-start.sh`
    should log `.env.local` written + test account present (not the "not set" fallback lines), then
    `npm run dev &` + `node .claude/hooks/drive-app.mjs` should log in and screenshot the post-login
    shell instead of exiting with the missing-credentials error.
- [ ] **Once merged to `master`,** every future Claude Code on the web session on this repo picks
  the hook up automatically — no per-session setup beyond the one-time env vars above.
- [ ] **Test account should have Job Loss Mode data seeded** (or get it seeded once logged in) so a
  session can actually drive the §15.H15/H16 screens this hook was built to unblock testing for —
  worth doing as part of the same setup pass, not a separate task.
