# TODO — Authority Finance

*Completed work log → `docs/past-TODO-tasks.md`*

---

## 16. Priority Sprint — UX Polish & Cleanup

*Active. Remaining open items from the 2026-06-07 brain dump.*

- [ ] **Mobile PWA install tutorial** — Add a hamburger-menu option shown **only in the mobile
  browser** (not the installed PWA) that opens a tutorial teaching users how to install the PWA.
  The iOS flow already exists on our website (user will provide it); reuse that and place the
  button somewhere clean.

- [ ] **Financial alert feature — copy + AI tuneup** — Revisit the Net Worth Health
  "Financial Breakthrough" tips copy (`NetWorthHealthTips.jsx`) and upgrade it from static text to
  Coach-generated responses tied to real net worth trends. Full spec → **§18.C**.

- [ ] **Purge grey text** — Replace remaining dark-grey text across the app with the standard
  white/primary text color. Profile panel and panel headers were purged in two prior rounds;
  a final app-wide verification pass is still needed to catch any missed surfaces.

- [ ] **Verify change email + password (live round-trip)** — Code audit confirmed both flows are
  implemented in `ProfilePanel.jsx`. Still needs live Supabase + real inbox test: change email
  and confirm via the link (Secure email change dual-confirm + whitelisted redirect); change
  password then sign out and confirm old password rejected / new works; wrong-current-password
  path. Cannot be exercised from the remote dev environment.

---

## 17. Monetization — Stripe Subscriptions + 2-Week Free Trial

*New workstream. Authority Finance is currently free with no billing layer (`CLAUDE.md`: "No
backend server… no Stripe — yet"). This section adds a paid subscription gated behind a 14-day
free trial. The app stays a Vite/React frontend; all Stripe secret-key work lives in Vercel
serverless functions under `api/` (same pattern as `api/delete-account.js`: verify the caller
with their Supabase Bearer token, then act with the service-role client). Subscription state is the
source of truth in **Stripe**, mirrored into Supabase `user_data` via webhook so the frontend can
gate without hitting Stripe on every load.*

**Resolved decisions (2026-06-16):**
- **Price:** **$14.99/mo.** Annual = **3 months free** → 12 months for the price of 9 =
  **$134.91/yr** (effective ~$11.24/mo). Two Stripe prices: `monthly` and `annual`.
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
| **Deletion** | 21 + N | — | — | Account data deleted if still no card after the buffer (**N = confirm**) |

> Two distinct timestamps drive this: `trial_ends_at` (day 14, **user-facing** countdown + "trial
> ended" messaging) and `access_ends_at` (day 21, **internal** hard cutoff that flips the read-only
> gate). Entitlement is keyed off `access_ends_at`; the countdown UI is keyed off `trial_ends_at`.
> **Open question:** how many days after expiry (`N`) before actual account deletion.

---

### A. Data model & migration

- [ ] **Migration `016_add_subscription_fields.sql`** — add to `user_data`:
  - [ ] `stripe_customer_id TEXT` (nullable; set on first Checkout)
  - [ ] `stripe_subscription_id TEXT` (nullable)
  - [ ] `subscription_status TEXT` — mirror of Stripe status: `trialing | active | past_due |
    canceled | incomplete | unpaid`; default `null` until trial is seeded
  - [ ] `trial_started_at TIMESTAMPTZ` — anchor for all phase math
  - [ ] `trial_ends_at TIMESTAMPTZ` — **day 14**, user-facing trial end (countdown + "trial ended")
  - [ ] `access_ends_at TIMESTAMPTZ` — **day 21**, internal hard cutoff that flips the read-only gate
    (the hidden 7-day grace; never surfaced)
  - [ ] `card_on_file BOOLEAN DEFAULT false` — set true when a payment method is attached (via
    webhook / Checkout); gates the dunning + deletion logic
  - [ ] `last_dunning_email_at TIMESTAMPTZ`, `dunning_email_count INT DEFAULT 0` — throttle the
    every-other-day deletion emails and the trial add-card nudges
  - [ ] `current_period_end TIMESTAMPTZ` (from Stripe; when the paid period lapses)
  - [ ] `plan TEXT` (nullable; `monthly` / `annual`)
- [ ] **Seed trial on account creation** — in the App.jsx `SIGNED_IN` first-row upsert (same place
  the OAuth row is seeded, §5), set `trial_started_at = now()`, `trial_ends_at = now() + 14 days`,
  `access_ends_at = now() + 21 days`, `subscription_status = "trialing"` when the row is brand new.
  Never overwrite on returning users.
- [ ] **`db.js` mapping** — load the new columns into a `subscription` object on the in-memory
  user model; keep them OUT of the `config` JSON blob (they're authoritative columns, not user prefs).
- [ ] **RLS** — users may `SELECT` their own subscription columns but must **not** `UPDATE` them
  (writes happen only via service-role in the webhook). Add/verify column-safe policies.

### B. Stripe account & product setup *(config steps, no app code)*

- [ ] **Create Stripe product + two prices** in the dashboard: Premium **monthly = $14.99** and
  Premium **annual = $134.91** (3 months free vs. 12× $14.99). Capture both `price_…` IDs for env
  config. No Stripe trial on the price (`trial_period_days` unused) — the trial is app-managed.
- [ ] **Configure the Customer Portal** (Billing → Customer portal) so users can cancel / update
  card / switch plan without custom UI.
- [ ] **Register the webhook endpoint** (`/api/stripe-webhook`) and capture the signing secret.
- [ ] **Set Vercel env vars** (see env block at the bottom).

### C. Serverless API routes (`api/`, Vercel functions)

*Follow `api/delete-account.js`: reject non-POST, require `Authorization: Bearer <supabase token>`,
verify with an anon client `getUser()`, then use the service-role client for privileged writes.*

- [ ] **`api/stripe-create-checkout.js`** — verify the user → find-or-create the Stripe customer
  (store `stripe_customer_id` back on `user_data`) → create a Checkout Session for the chosen price
  → return the session URL. Pass `client_reference_id = user.id` and set success/cancel URLs to
  whitelisted app routes.
- [ ] **`api/stripe-webhook.js`** — verify the Stripe signature with the webhook secret (use the
  **raw** request body — disable body parsing for this route). Handle: `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. On each,
  upsert `subscription_status`, `stripe_subscription_id`, `current_period_end`, `plan` into
  `user_data` via service-role, keyed by `stripe_customer_id`. Idempotent on event id.
- [ ] **`api/stripe-portal.js`** — verify the user → create a Billing Portal session for their
  `stripe_customer_id` → return the URL (for the "Manage subscription" button).

### D. Trial logic (14-day public + 7-day hidden grace)

- [ ] **Single entitlement helper** — `lib/subscription.js → getEntitlement(subscription, now)`
  returning `{ state, trialDaysLeft, isEntitled, accessDaysLeft }` where
  `state ∈ "trial" | "grace" | "active" | "expired" | "none"`:
  - `active` — `subscription_status === "active"` (or `trialing` w/ a real Stripe sub) → entitled
  - `trial` — `now < trial_ends_at` → entitled; `trialDaysLeft = ceil((trial_ends_at − now)/day)`
  - `grace` — `trial_ends_at ≤ now < access_ends_at` → **still entitled**, but UI/email say "trial
    ended." `trialDaysLeft = 0`. **Do not expose `accessDaysLeft` anywhere user-visible.**
  - `expired` — `now ≥ access_ends_at` → **not entitled** (read-only gate on)
  - `isEntitled = active || trial || grace`
- [ ] **Lock off the internal cutoff, not the public one** — the read-only gate keys off
  `access_ends_at` (day 21). The countdown + "trial ended" banner key off `trial_ends_at` (day 14).
  Both transitions are time-derived (don't wait on a webhook to flip).
- [ ] **No double trials** — a returning/non-new user never re-seeds trial timestamps; an
  expired/grace user who never paid sees the upgrade path, not a fresh window.
- [ ] **Disclosure guard** — add a lint/test note: no UI string or email template may reference the
  21-day / grace / "extra week" concept. Public surfaces only ever say 14 days.

### E. Frontend gating / paywall

- [ ] **Entitlement gate** — wrap the gated surface in App.jsx using `getEntitlement`. While
  `isEntitled` (trial/grace/active), the app behaves normally. When `expired`, switch to the
  read-only experience below.
- [ ] **Expired read-only experience** — adapt Home + Budget for the locked state:
  - [ ] **Navigation** — only **Home** and **Budget** are reachable read-only; **Account/Profile**
    must stay reachable so the user can add a card. Other tabs (Income, Log, Goals) route to the
    upgrade screen instead of their panel. *(Confirm Income/Log/Goals handling.)*
  - [ ] **Read-only Home + Budget** — all edit affordances hidden/disabled (add/edit/delete goal,
    expense, loan; run wizard; log events; Force Sync write; reorder; reset timeline). Values render
    but no mutations persist.
  - [ ] **Locked expense categories** — the §16 collapsible category sections are **forced collapsed
    and non-expandable**: chevron disabled, only the category **title + total per check period** for
    **Lifestyle** and **Needs** shown. No row-level expense detail, no dropdown expansion.
  - [ ] Build this as an explicit `expired`/read-only mode the panels read (e.g. a `readOnly` /
    `entitlement` prop), not a pile of inline conditionals — one switch, testable.
- [ ] **Upgrade modal / screen** — Liquid-Glass styled (`LiquidGlass.jsx`), Pulse signal accent
  allowed (premium surface); shows monthly ($14.99) vs. annual ($134.91, "3 months free") and opens
  Stripe Checkout via `api/stripe-create-checkout`. Honors the mobile portal pattern
  (`createPortal`, see §16 portal audit in past-TODO-tasks.md).
- [ ] **Post-checkout return** — success route shows a confirming state and refetches the
  `user_data` row (webhook may lag; poll/refetch `subscription_status` briefly), then lifts the gate.

### F. Trial + subscription UI

- [ ] **Trial/dunning banner** — slim persistent banner (mirrors the Job Loss banner pattern),
  copy by phase: **trial** → "X days left in your free trial" (amber at ≤3 days); **grace** →
  "Your trial ended — add a card to keep using the app" (must NOT hint that access continues);
  **expired** → "Trial ended — add a card to restore full access." Always carries an Add Card /
  Upgrade button. Dismissible, re-shows on reload.
- [ ] **ProfilePanel → Account: Subscription card** — replaces the §8 "subscription status
  placeholder." Shows state (Trial · N days left / Active · renews [date] / Past due / Canceled),
  plan + price, and a **Manage Subscription** button → `api/stripe-portal`. Add Card / Upgrade
  button (monthly vs. annual) when not yet subscribed. In `grace`/`expired` this is the primary
  conversion surface.
- [ ] **Admin visibility** — Live State Inspector / Config Raw View: surface `subscription_status`,
  the resolved **phase** (`trial`/`grace`/`expired`), `trial_ends_at`, `access_ends_at` (admin-only
  — the hidden cutoff), `card_on_file`, `dunning_email_count`, `current_period_end` so a diagnostic
  session can read billing + lifecycle state at a glance. Add to CLAUDE.md "Diagnostic request
  templates."

### G. Notifications & lifecycle emails (Vercel Cron)

*New infra: the app has no transactional email today (only Supabase auth emails). The card-nudge,
grace, and every-other-day deletion warnings need an email provider + a scheduled job. All sends
are server-side via a daily cron route; nothing here runs on the client.*

- [ ] **Pick an email provider** — Resend / Postmark / SendGrid (Resend is the lightest Vercel fit).
  Add `EMAIL_API_KEY` + a verified sender domain.
- [ ] **`api/cron-subscription-lifecycle.js`** — scheduled daily via `vercel.json` `crons`. Runs
  service-role, recomputes each user's phase from `trial_started_at` / `trial_ends_at` /
  `access_ends_at` / `card_on_file`, and acts:
  - [ ] **Trial, day ≥ 7, no card** → "add your card to avoid interruption" nudge. Throttle to a
    sane cadence (e.g. once at day 7, again ~day 12) via `last_dunning_email_at`.
  - [ ] **Grace (day 14–20), no card** → "trial ended — add a card to keep using the app."
    Escalating but **never** mentions the remaining access. ~every 2 days.
  - [ ] **Expired (day 21+), no card** → account-deletion warning **every other day** (guard:
    `now − last_dunning_email_at ≥ 2 days`); increment `dunning_email_count`.
  - [ ] **Past day 21 + N, no card** → call the deletion path (reuse/extend `delete-account` logic
    server-side). **N = confirm.**
  - [ ] **Card on file / active** → no lifecycle emails; reset `dunning_email_count`.
- [ ] **Idempotency / safety** — cron must be safe to run twice a day; key all sends off the
  throttle timestamps, never off "did the day flip." Protect the route (Vercel cron secret / header).
- [ ] **Copy review** — all templates reference the **14-day** trial only; no template, subject, or
  preview text reveals the grace week.
- [ ] **(Optional, later) Web Push** — the app is already a PWA w/ service worker; the same phase
  signals could fire push notifications. Defer behind email v1.

### H. Edge cases, security & testing

- [ ] **Webhook signature** — reject unsigned/invalid events; never trust client-reported status.
- [ ] **Card declines / `past_due`** — keep entitlement until `current_period_end`, then lock;
  surface the Stripe-hosted update-card flow via the portal.
- [ ] **Cancellation** — `canceled` keeps access through `current_period_end` (Stripe "cancel at
  period end"), then drops to read-only.
- [ ] **Account deletion** — extend `api/delete-account.js` to also cancel the Stripe subscription
  so a deleted user isn't billed.
- [ ] **Clock skew / tz** — all phase math in UTC against `trial_ends_at` / `access_ends_at`; do not
  use the client's local lock-date offset (admin Lock Date must not extend a trial or the grace).
- [ ] **Disclosure** — no client string, email template, or API response exposes `access_ends_at` or
  the grace concept to a non-admin user (covered by a test).
- [ ] **Tests** — unit-test `getEntitlement` across trial/grace/active/expired/past_due/canceled and
  the exact day-14 and day-21 boundaries; cron phase-routing + every-other-day throttle; webhook
  upsert mapping with a signed fixture event; create-checkout rejects missing/invalid tokens.

### I. Env vars (Vercel)

```
STRIPE_SECRET_KEY=...            # server only (api/ functions)
STRIPE_WEBHOOK_SECRET=...        # server only (signature verify)
STRIPE_PRICE_MONTHLY=price_...   # $14.99/mo
STRIPE_PRICE_ANNUAL=price_...    # $134.91/yr (3 months free)
EMAIL_API_KEY=...                # transactional email provider (Resend/Postmark/SendGrid)
CRON_SECRET=...                  # guards api/cron-subscription-lifecycle
VITE_STRIPE_PUBLISHABLE_KEY=...  # client (only if using Stripe.js redirect; not needed for hosted Checkout URL)
# Reuses existing SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_* already set for delete-account.
```

---

## 18. AI Layer — Coach + Contextual Intelligence

*Authority Finance's AI layer is built around a single character: **Coach** — a financial wellness
companion with a visual mascot identity. Coach appears across the app as a contextual presence:
answering how-to questions, responding to financial stress signals, and delivering insight-rich
summaries tied to the user's real data. All AI calls run through the Claude API (Anthropic).*

*Items consolidated here from: §15.E (Job Hunt AI), §15.F (Application Assistant), §9 (Statements
AI layer), §16 (Financial alert copy + Net Worth mental health trigger).*

---

### A. Coach — Character Identity

- [ ] **Name:** Coach
- [ ] **Mascot icon design** — create a recognizable, single-color mark for Coach to use as an
  avatar in chat bubbles, beside insight cards, and in triggered messages; suggestions: a stylized
  chart-and-figure silhouette, an abstract upward-momentum mark, or a minimal shield/compass — keep
  it at home in a teal-on-dark-green palette; must read at 24×24px and 48×48px
- [ ] **Personality brief** — Coach speaks in the first person; concise and direct; supportive
  without being patronizing; always grounds a message in the user's actual numbers rather than
  generic affirmations; one concrete next step per message
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

- [ ] **Copy audit — static tips rewrite** — rewrite all existing "Financial Breakthrough" tips
  in `NetWorthHealthTips.jsx` to match Coach's voice: direct, supportive, data-grounded; remove
  generic affirmations; every tip should reference a real lever the user can pull inside the app
  (adjust an expense, fund a goal, run the Budget panel, etc.)
- [ ] **Trigger conditions (formalize)** — define the exact signal conditions that fire a Coach
  response; candidates:
  - Net worth flat or declining for ≥ 3 consecutive weeks
  - A single-period net worth drop exceeding a configurable threshold (e.g. > 10%)
  - Runway cliff approaching within 30 days (Job Loss Mode)
  - A goal falling critically behind schedule (> 4 weeks off projected finish)
- [ ] **Signal tiers:**
  - [ ] **Amber (attention)** — net worth flat/down ≤ 3 consecutive weeks; brief check-in from
    Coach: "Your net worth has been flat for 3 weeks — here's one thing worth looking at."
  - [ ] **Red (critical)** — runway < 30 days OR net worth down > 10% in one period; urgent but
    not alarming; message ends with one deep-link action (Triage Expenses, Review Goals, Life
    Events); never catastrophizes
  - [ ] **Green (recovery)** — net worth up after a red/amber streak; Coach acknowledges the
    turnaround with a brief, specific data point: "Up $X since last week — you turned it around."
- [ ] **Coach API response** — instead of (or alongside) static copy, call the Claude API with
  the user's actual net worth delta, runway, and goal status; response is 2–3 sentences; Haiku
  model for cost efficiency
- [ ] **Mental health framing guardrail** — messages acknowledge the emotional weight of financial
  stress without dramatizing or lecturing; every message ends with one concrete action the user
  can take in the app right now
- [ ] **Rate-limiting** — at most one Coach net worth message per week per signal tier; track
  `lastCoachTriggerAt` in config or session state; don't fire on every re-render
- [ ] **Dismissal** — each Coach card has a `✕` dismiss; dismissed cards don't re-fire until the
  signal condition changes (e.g. a new week's data shifts the trend)

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

- [ ] **`lib/claude.js` wrapper** — single client: handles auth, retries, prompt caching headers;
  exports `chatWithCoach(messages, systemPrompt, contextBlock, model)` where `model` defaults to
  Haiku and callers can pass Sonnet for richer responses
- [ ] **`lib/aiContext.js` serializer** — deterministic compressed financial snapshot builder for
  injection into Coach's system prompt; same output shape every call so prompt caching is effective;
  includes: weekly net, net worth delta, goal count/status, expense total, runway (if in job loss
  mode), current week + fiscal context
- [ ] **`api/coach.js` serverless route** — proxies Claude API calls through a Vercel function so
  the API key stays server-side; same auth pattern as `api/delete-account.js` (verify Supabase
  Bearer token, then call Anthropic); returns streamed response for chat UX
- [ ] **Cost controls** — Haiku for Coach messages, FAQ answers, and net worth triggers; Sonnet
  for statement summaries and job hunt drafts; log token counts per call type in dev
- [ ] **Env vars** — add `ANTHROPIC_API_KEY` to Vercel env + CLAUDE.md env vars section
- [ ] **`coach_chats` table** — all conversation + search history lives here; schema in **§18.H**;
  load recent chats on auth via `db.js` alongside the main `user_data` fetch

---

### H. Chat & Search History Persistence (Supabase)

*Every Coach conversation and every Job Scout search is a row in `coach_chats`, linked to the
user by a foreign key. This gives users a persistent record across devices and sessions, and
gives Coach context to reference past conversations when relevant.*

#### H1. Migration — `017_add_coach_chats.sql`

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

- [ ] **Write migration** `database/migrations/017_add_coach_chats.sql`
- [ ] **RLS policies** — users may `SELECT`, `INSERT`, `UPDATE`, `DELETE` their own rows
  (`user_id = auth.uid()`); no public access; service-role bypasses for admin diagnostic
- [ ] **`updated_at` trigger** — add `moddatetime` trigger so `updated_at` auto-updates on row change
  (same pattern as `user_data`)

#### H2. `db.js` integration

- [ ] **`loadCoachChats(userId, limit = 20)`** — fetches the N most recent rows for the user on
  sign-in; stored in a `coachChats` array alongside the existing in-memory state
- [ ] **`saveCoachChat(chat)`** — upserts a single row by `id`; called on every message append
  (debounced 1s) and on session close (immediate)
- [ ] **`deleteCoachChat(id)`** — hard-deletes a single history row; exposed via swipe-to-delete
  or long-press in the history list
- [ ] **In-memory shape** — `coachChats` array is a peer of `config`, `logs`, `goals` in App state;
  passed down only to the Coach panel

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

## Deferred

- [ ] **`taxExemptOptIn` wire-up** — Stored in config but nothing reads it in `App.jsx` or
  `IncomePanel`. The opt-in gate and disclaimer copy are correct; backend wire-up is deferred
  to Phase 5. No action needed until then.
  > **Note:** Before implementing, bring to an accountant's office for safe-tax feature insights.
  > The mechanics (withholding suspension + catch-up) have tax risk implications that need
  > professional sign-off before we expose them to users.
