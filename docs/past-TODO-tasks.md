# Past TODO — Authority Finance (Completed Work Log)

*Extracted from `docs/TODO.md`. Each entry is a sprint or feature group shipped and closed.
One-liner per item — see git history for full implementation detail.*

---

## DHL Warehouse Site (2026-08-09)

- [x] **`dhlSite` field ("WAREHOUSE" | "PLANT" | null)** — Plant is the fallback for anything but
  `"WAREHOUSE"`, so every existing DHL account (no `dhlSite` key at all) needs no migration and
  keeps behaving exactly as before
- [x] **`DHL_PRESET.warehouseTeams`** — Mon–Thu (`MT`) and Wed–Sat (`WS`) teams, fixed 4 days every
  single week, no long/short rotation (unlike Plant's alternating Team A/B)
- [x] **Step 1** — "Which DHL site do you work at?" right after the DHL gate; Warehouse branch asks
  team (Mon–Thu/Wed–Sat) and a real shift-length question (10 or 12 hours, user-selected, not
  hardcoded), reuses the existing night/morning-shift question unchanged; custom-rotation question
  hidden for Warehouse (v1 scope, Plant only)
- [x] **Step 2** — Short/Long Week pills hidden for Warehouse (nothing to ask beyond start date,
  `isValid` already correct for both sites unchanged)
- [x] **Step 4** — "Load DHL Preset" button hidden for Warehouse (its split rates are Plant-specific
  and would desync `fedRateHigh`/`fedRateLow` for Warehouse's single-rate schedule)
- [x] **`finance.js`** — `getDhlPlannedDayIndexes()`/`getDhlPlannedPattern()` carry a Warehouse
  branch and are the single shared source behind `buildYear()`, `projectedGross()`, and
  `calcEventImpact()` alike, so all three are correct with no per-caller duplication;
  `buildYear()` forces `isHighWeek: false` for Warehouse weeks (financially inert since
  `scheduleIsVariable: false` already guarantees `fedRateHigh === fedRateLow`)
- [x] **`ProfilePanel.jsx` T5 Employment card** — DHL Team editor and `scheduleLabel` made
  site-aware (same field, second editor, per `docs/drift-app-warden.md` §7); Schedule Override
  section hidden for Warehouse
- [x] **`configHistory.js`** — `dhlSite` added to `HISTORY_SENSITIVE_FIELDS`
- [x] Tests: `finance.test.js` (fixed-schedule fixtures for both teams, weekend-hour math,
  `isHighWeek`/`requiredOtShifts` always false/0, Plant regression guard), `SetupWizard.test.jsx`
  (site question placement, Warehouse/Plant branching, full Warehouse wizard run through
  `onComplete`), `ProfilePanel.test.jsx` (site-aware Employment card)
- [x] **Mirrored into `SetupWizardAdlib.jsx`'s ad-lib preview** — `IntakePage` asks the same
  "Which DHL site do you work at?" question before any team clause, branching to the unchanged
  Plant Team A/B clause or a new Warehouse Mon–Thu/Wed–Sat team + real shift-length (10/12h)
  clause; `SchedulePage` hides the Short/Long-Week clause for Warehouse the same way Step2 does;
  `isIntakeValid()`/`BLANK_PAY_FIELDS` extended with `dhlSite` so the mandatory-field gating and
  blank-by-default behavior cover it too

---

## §18 — Stripe Monetization (2026-07-28)

✅ **COMPLETE — all code shipped and verified in production.** Stripe subscriptions fully live with 14-day free trial (plus hidden 7-day grace). All routes verified in live mode: Checkout, portal, webhook signature verification, card declines, cancellation at period end, account deletion with Stripe subscription cancellation, and revival after non-payment deletion. Lifecycle emails (trial nudges, grace period, every-other-day deletion warnings) via Resend cron, all copy disclosure-guard tested. Trial phase gates Home/Budget to read-only on day 21+.

- [x] **Data model & migration** — `subscription_status`, `trial_started_at`, `trial_ends_at`, `access_ends_at`, `card_on_file`, `current_period_end`, `plan` added to `user_data`; migration 017 (webhook idempotency) and 018 + RLS via 019 confirmed live in Supabase (2026-07-07)
- [x] **Stripe product + two prices** — Premium $14.99/mo and $120/yr ($10/mo flat, ~4 months free); both test and live price IDs captured; webhook endpoint registered
- [x] **API routes** — `stripe-create-checkout.js` (verify user → find/create Stripe customer → session), `stripe-webhook.js` (signature verification, upsert subscription_status/plan), `stripe-portal.js` (manage card/plan), all service-role Bearer-token pattern; fixed stale-domain crash via `resolveAppOrigin(req)` deriving from request headers (2026-07-27)
- [x] **Trial logic (14-day public + 7-day hidden grace)** — `getEntitlement()` state machine: trial/grace/active/expired/none with trialDaysLeft and accessDaysLeft computed from timestamps (never Lock Date); boundary-tested day-14 and day-21 inclusive/exclusive; no double-trial reseeding; disclosure guard on UI text (21-day, grace, extra week forbidden)
- [x] **Frontend gating** — `isExpiredReadOnly` gate on App.jsx; Home/Budget render read-only (values visible, editing disabled); Income/Log fully replaced by UpgradePanel (read-only panel in content, not modal); shared `UpgradeCard` (checkout pitch + Monthly/Annual buttons) with UpgradeModal (overlay for Home/Budget notices) and UpgradePanel (full-page for Income/Log); post-checkout `?checkout=success|cancel` polling until webhook lands
- [x] **Trial + subscription UI** — `TrialExplainerScreen` (first-signup explainer, required checkbox gate), `TrialBanner` (phase-aware copy: trial/grace/expired), ProfilePanel Subscription card (status, plan, manage/upgrade buttons), admin Live State Inspector gains Sub Phase + Trial/Access/Period End + Card/Dunning visibility
- [x] **Lifecycle emails** — Resend provider, daily cron `api/cron-subscription-lifecycle.js` runs 15:00 UTC; trial day-7 + day-12 nudges, grace every-2-days, expired every-other-day deletion warnings, all copy disclosure-tested; skips admin/investor rows; throttle keyed to stored timestamps (retries survive outages, catches up at most once per send)
- [x] **Account revival (non-payment deletion recovery)** — `deleted_accounts` table (017), archive-before-delete in cron; LoginScreen `api/revival-lookup.js` on failed sign-in (email/password case) vs. App.jsx SIGNED_IN `checkRevival()` (OAuth case); ReviveScreen identity display + plan choice + revive checkout; webhook `restoreRevivedAccount()` rebuilds config/expenses/goals/logs, seeded trial in past (no second free window), stamps `revived_at`; two-way-door retry on decline (attempt tracking, cancel button reusable, no cap)
- [x] **Edge cases & security** — webhook signature verification (signed-fixture tests), card declines/`past_due` (keep access through `current_period_end`), cancellation (cancel-at-period-end), account deletion cancels Stripe sub immediately (both modes tried), clock-skew/tz (all phase math UTC-epoch-ms, wall-clock not Lock Date), disclosure tested (no raw `access_ends_at` rendered), 51 tests across `subscription.test.js`, `lifecycleEngine.test.js`, `lifecycleEmails.test.js`, `stripeWebhook.test.js`, `stripeCreateCheckout.test.js`, `deleteAccount.test.js`, `revivalLookup.test.js`, `stripeReviveCheckout.test.js`, `ReviveScreen.test.jsx`, LoginScreen revival routing
- [x] **Env vars (Vercel)** — `STRIPE_SECRET_KEY`/`_TEST`, `STRIPE_WEBHOOK_SECRET`/`_TEST`, `STRIPE_PRICE_MONTHLY`/`_ANNUAL`/`_TEST` variants, `APP_URL`, `EMAIL_API_KEY`/`RESEND_API_KEY`, `EMAIL_FROM` (optional), `CRON_SECRET` all set; distinct per-mode names; webhook handler tries live secret first then test (both modes on same endpoint)

---

## §17 — Tips / Commission Daily Check-In (2026-07-27)

- [x] **Setup Wizard opt-in** — Step 1 "Do you earn tips or commission?" (No/Tips/Commission), with a commission-only follow-up question captured for future use only (no income-math effect yet)
- [x] **Daily check-in card** — Small, dismissible, non-full-screen card (`TipsCommissionCheckIn.jsx`), weekday/date-aware ("yesterday" vs. "Wednesday, the 8th"), noon-eligibility gate mirroring the DHL Monday-6am pattern
- [x] **Backward-walking backlog queue** — Newest-unresolved-first, 10-day cutoff, same-sitting chaining after each answer or skip (session-only skip state, not persisted)
- [x] **`tips_commission` event type** — New `EVENT_TYPES` entry + `calcEventImpact` branch mirroring `bonus`; reuses all existing tax/401(k) math
- [x] **Log Panel dropdown** — New collapsible "Tips/Commission Log" section above the entry list, gated on at least one real logged day; tips-only "If you claim all tips" running extra-tax-owed total (`grossGained - netGained` per entry)
- [x] **`dateToWeekIdx` promoted** — Moved from a SetupWizard-local helper to a shared `lib/fiscalWeek.js` export so App.jsx can tag daily entries with the correct fiscal week

---

## §16 — Priority Sprint close-out (2026-07-06)

*Final four items — section closed and removed from TODO.md.*

- [x] **Mobile PWA install tutorial** — Hamburger-menu install tutorial shown only in the mobile browser (hidden in installed PWA), reusing the website's iOS flow
- [x] **Financial alert copy pass** — Net Worth Health "Financial Breakthrough" tips copy revisited; the AI/Coach-generated upgrade remains tracked in TODO §2.C (not part of this close-out)
- [x] **Purge grey text** — Final app-wide verification pass; remaining dark-grey text replaced with standard white/primary
- [x] **Verify change email + password (live round-trip)** — Live Supabase + real inbox test completed: email change dual-confirm link, password change with old-password rejection, wrong-current-password path

---

## §16 — Priority Sprint completions (2026-06)

- [x] **Budget — restructure expense save buttons** — Full-width primary "Month+ Onward" row; month/quarter/cancel in secondary row; applied to add form, edit sheet, and quarter-view branch
- [x] **Budget — collapsible category sections** — Chevron toggle per category header; sessionStorage state; defaults collapsed
- [x] **Budget — slim down loan cards** — Removed bottom-left detail block and `/mo` figure; per-paycheck amount only in overview; Loans tab unchanged
- [x] **Log panel — declutter event cards** — Title + notes elevated; lost-money events show single minus amount; other detail moved into per-event impact dropdown
- [x] **DHL short/long week naming** — Removed day-count parentheticals from all user-facing labels; internal rotation keys, `days` arrays, and day-selection logic untouched
- [x] **Goals — "Reset Timeline" button** — Global `goalTimelineEpochIdx` anchor; restarts all active goal timelines to next paycheck; confirmation modal portaled to `document.body`; persists to Supabase; honors weekly + biweekly/monthly cadence

---

## §16 — Portal Audit (iOS Safari fixed overlays)

- [x] **All un-portaled fixed overlays swept** — BudgetPanel `showCheckInfo`, HomePanel `showReorderModal`, ProfilePanel delete-account + sign-out dialogs all portaled via `createPortal(…, document.body)`; iOS Safari tap registration verified at all scroll positions; markup/styles unchanged

---

## §0 — Base User Foundation (2026-04-28)

- [x] **`maxWeeklyHours` engine redesign** — Single ceiling field replaces `standardWeeklyHours`/`longWeeklyHours`; WeekConfirmModal open 7-day selector; ceiling comparison adjusts projection when under hours
- [x] **Step 2 start-date clamp** — `firstActiveIdx` bounded to `[0, FISCAL_WEEKS_PER_YEAR − 1]`; error state shown for out-of-range dates
- [x] **PTO for base user** — PTO subsection in Step 3; `ptoRate` per-user config field (migrated from module constant); `ptoEnabled` gates BenefitsPanel PTO section
- [x] **Attendance tracker** — Threshold config (warn/terminate/balance/increment) in Step 3; status display vs. thresholds; user-supplied unit label; no payout math
- [x] **Night differential for base user** — Toggle in Step 1; engine keyed off `cfg.nightDiffEnabled`/`nightDiffRate` instead of `isEmployerDHL`
- [x] **PROGRESSIVE state tax accuracy** — `midpointRate` field per state in `stateTaxTable.js`; `handleEstimate()` uses it instead of hardcoded 5%
- [x] **Filing status / standard deduction** — Single/MFJ/HOH question in Step 4; `fedStdDeduction` derived from status ($15k/$30k/$22.5k); Tax Picture summary updated
- [x] **`otherDeductions[].weeklyAmount` → `perCheckAmount`** — Renamed across `DEFAULT_CONFIG`, `SetupWizard.jsx`, `finance.js`, `finance.test.js`; backward-compat shim in `db.js`
- [x] **"No OT" exempt path** — `otThreshold: null` toggle; engine skips OT math when null
- [x] **`shiftHours` label UX** — Helper text clarifies shift length is for event logging, not income math
- [x] **Welcome copy pass** — "Have these handy" line added to Step 0 for base users

---

## §1 — Goals Funding + Tax Exempt Projection Integrity (2026-04-03)

- [x] **Funded goal cash absorption** — Funded amounts treated as spent in all downstream totals (surplus, net worth, take-home); guardrails prevent re-entry; fixture coverage added
- [x] **Tax exempt payback withholding** — Extra withholding subtracted from taxed weeks as a real expense; propagated into forward charts and monthly rollups; consistent shared value across all views
- [x] **Goal timeline ETA sensitivity** — Timeline uses live post-expense surplus; dependency recompute triggers fixed; regression coverage for +$150/+$300/week deltas
- [x] **Goals card + timeline UI rework** — True progress-fill bar; month markers on timeline bar; liquid/glass fill prototype for premium mode

---

## §2 — Food Control Spotlight (non-priority brand feature)

- [x] **Food expense identity** — Dedicated Food card with icon; required in budget setup; default $400/mo; categorized under Needs in calculations
- [x] **Fast food buffer toggle** — On/off toggle post-first-Budget-open; excluded from paycheck surplus and goal projections when enabled

---

## §3 — Desktop Scroll Regression

- [x] **Global scrolling restored** — Smooth wheel/trackpad scrolling restored across all tabs after layout/container regression

---

## §4 — Base User Experience Sprint (superseded by §0)

- [x] **Week counter mismatch** — Superseded by §0 start-date clamp; same root cause
- [x] **Step 2 shift differential flow** — Night diff spec carried into §0; weekend diff deferred; Supabase persistence confirmed for non-standard rotations
- [x] **Step 4 paystub alignment / deductions layout / schedule expectations / pay frequency / PTO visibility** — All superseded or absorbed by §0 implementation work

---

## §5 — Auth Providers (2026-03-28)

- [x] **Google OAuth end-to-end** — `signInWithOAuth`; Supabase provider config; `user_data` row seeded on first sign-in; Google profile metadata (`display_name`, `avatar_url`) synced via migration `005`; redirect URLs whitelisted; Link Google Account in ProfilePanel
- [x] **LoginScreen OAuth layout** — Google button + divider ("or continue with")

---

## §6 — Benefits & Deductions Pipeline

- [x] **Benefit premiums wired into `buildYear()` taxable gross** — Health, dental, vision, STD, life, HSA, FSA via `weeklyBenefitDeductions()`; `benefitsStartDate` honored per-week
- [x] **`otherDeductions` wired into `computeNet()`** — After-tax subtraction in both taxed and untaxed weeks
- [x] **Wizard Step 7 preview updated** — Shows gated benefits and "start later" labels so preview matches take-home math

---

## §7 — Setup Wizard Tune

- [x] **Full walkthrough audit** — All steps audited; copy trimmed to one sentence per field; mobile layout clean at 390px; edge case inputs (0, large numbers, empty) tested; Life Event re-entry flow verified

---

## §8 — Profile & Account Management

- [x] **Profile screen** — Display name, email, account date, subscription placeholder live in ProfilePanel
- [x] **Change email** — `updateUser({ email })` + Supabase dual-confirm flow
- [x] **Change password** — `signInWithPassword` re-auth gate + `updateUser({ password })`; Google-only account guard (`hasEmailIdentity`); `ProfilePanel.test.jsx` with 4 identity-state coverage cases
- [x] **Delete account** — "Type DELETE" gate; `user_data` delete + `admin.deleteUser()` via `api/delete-account.js`
- [x] **Sign out all devices** — `signOut({ scope: 'global' })`

---

## §9 — Post-Auth Roadmap

- [x] **Fiscal week awareness** — Current week (X of 52) live app-wide; midnight tick; `FISCAL_YEAR_START` constant; per-week `computeNet()` output feeds `computeGoalTimeline()` directly
- [x] **Theoretical Tab** — What-if scenarios: job change, investment return, second job income layering
- [x] **Calendar Tab** — Visual calendar of expense due dates, loan payments, goal milestones
- [x] **Statements Tab** — Monthly/quarterly/yearly snapshots: income summary, expense breakdown, surplus/deficit, goals report, net worth delta; PDF/CSV export; Supabase persistence

---

## §10 — Authority OS Design System Migration

- [x] **Green token alignment** — `METRIC_STATUS` green fixed; `--color-teal-bright` flash token updated; `--color-accent-soft` purged from all foreground use
- [x] **Authority OS rename** — `index.html`, PWA label, `package.json`, LoginScreen "Life RPG" eyebrow updated; dead Google Fonts (DM Serif/Sans) removed
- [x] **Pulse signal layer** — Signal tokens added to `index.css`; `InsightRow` component built and exported from `ui.jsx`; `insight` prop feathered into MetricCard/Card across HomePanel, IncomePanel, BudgetPanel

---

## §11 — Optional Deductions Mapping

- [x] **Itemized deductions module** — Above-the-line deductions (401k, HSA, student loan interest, IRA) + itemized vs. standard toggle (mortgage, SALT, charitable, medical 7.5%-AGI threshold); revised AGI + federal liability fed into IncomePanel tax gap; "Standard"/"Itemized" badge on wizard; disclaimer copy matches tax-exempt gate tone

---

## §12 — Countup Animation Scope (2026-03-31)

- [x] **Countup rolled out to all dollar cards** — `rawVal` prop on every dollar-amount Card/MetricCard across all panels
- [x] **Gated to first tab visit per session** — `Set<panelName>` tracks visited panels; 0→target countup suppressed on revisit; flash-on-change still fires on data changes

---

## §13 — Income Weekly Sticky Header

- [x] **Mobile sticky header rebuilt** — Mini chart + column labels pin at `safe-area-inset-bottom`; Dynamic Island / notch clearance correct; Safari and Chrome portrait + landscape verified

---

## §14 — Mobile Navigation + Income IA + Budget / Goals Bridge (2026-04-03)

- [x] **Goals as first-class nav destination** — Goals standalone top-level tab in bottom nav and drawer; primary destinations trimmed to 5
- [x] **Income IA simplified** — Config sub-tab removed; Income config in Profile/Account settings; monthly/weekly collapsed to one view
- [x] **Budget breakdown realism** — Deductions line added as display-only; keyed to next-check cadence
- [x] **Goals timeline precision** — Weekly surplus snapshots bridge; per-week progression drives completion timing; near-term surplus deltas surfaced

---

## Earlier Summaries (pre-§1)

- [x] **Immediate Bug Fixes** — Cashflow and Goals math/layout audited after early regressions; follow-up checks documented
- [x] **Quarterly Phase Refactor** — Four named quarters across budgeting, finance, and DB layers; migrations; UI labels updated everywhere
- [x] **Attendance Bucket Model** — DHL attendance engine: monthly bonus math from event log; bucket tiers, payout projections, safety bands on dashboard
- [x] **Setup Wizard (initial)** — Six-step wizard with DHL presets, validation, migrations, and tax/benefit previews; first-run and Life Event re-entry paths
- [x] **WeekConfirmModal** — Swap logging, stricter validation, accurate pay-period labeling shipped
- [x] **Auth & Multi-User** — Supabase auth + RLS + login flows + session persistence; Anthony's data isolated; multi-account architecture ready
- [x] **Multi-User Readiness** — Employer label from `config.employerPreset`; `nightDiffRate` explicit; hardcoded FHA hint removed; `INITIAL_EXPENSES/GOALS/LOGS` cleared; `DHL_PRESET.defaults` self-contained; `PTO_RATE` removed from runtime; "MO Flat Rate" label renamed
- [x] **Event Log Rework** — `futureWeeks` prop live; inline edit; 7-day pill date picker; auto-derived `weekIdx`/`weekRotation`; Missed Work Unapproved event type; PTO accrual accuracy verified end-to-end
