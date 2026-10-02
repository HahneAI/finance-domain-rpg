# Authority OS — Active Systems Reference

Living doc: what is built, how it works, known gaps — by **domain**, not ship date. Summarize; do not
transcribe. Deep detail lives in `CLAUDE.md` (architecture rules), `drift-app-warden.md` (what breaks
what), `TODO.md` (open work), `past-TODO-tasks.md` (shipped log). **Guardrail: keep under 300 lines.**
Rewritten/trimmed 2026-10-01 (was 623 lines, last touched 2026-07-16; added the systems that shipped
since: Claim Date, Ad-Lib wizard, DHL Warehouse, Beta Homebase, Money Moves, Résumé Center).

---

## System Index

| # | Domain | Key files | Status |
|---|--------|-----------|--------|
| 1 | Income & Pay Engine | `finance.js`, `App.jsx` | Live |
| 2 | Rolling Views | `rollingTimeline.js` | Live |
| 3 | Budget — Expenses | `BudgetPanel.jsx`, `finance.js` | Live |
| 4 | Budget — Goals + Claim Date | `HomePanel.jsx`, `goalFunding.js` | Live |
| 5 | Budget — Loans | `BudgetPanel.jsx`, `finance.js` | Live |
| 6 | Benefits — 401k & PTO | `LogPanel.jsx`, `ProfilePanel.jsx` | Live (`BenefitsPanel.jsx` is dead code) |
| 7 | Attendance Tracking | `finance.js`, `LogPanel.jsx` | Live |
| 8 | Log Panel | `LogPanel.jsx` | Live |
| 9 | Setup Wizards (Ad-Lib + classic) | `SetupWizardAdlib.jsx`, `SetupWizard.jsx`, `wizardComplete.js` | Live |
| 10 | Life Events & New Job Season | `LifeEventMenu.jsx`, `NewJobSeason*.jsx`, `newJobSeasonRunway.js` | Live, known gaps |
| 11 | Employer Preset Convention (+ DHL Plant/Warehouse) | all panels | Live |
| 12 | Biweekly Two-Week Check-In | `WeekConfirmModal.jsx` | Live |
| 13 | Admin Diagnostic Toolkit | `App.jsx`, `LogPanel.jsx` | Live (Phase 1; Phase 2 `isOwner` unbuilt) |
| 14 | Net Worth Health Tips | `NetWorthHealthTips.jsx` | Live |
| 15 | UI Design System — Flow + Pulse + Liquid Glass | `LiquidGlass.jsx`, `ui.jsx`, `index.css` | Live |
| 16 | Swipeable Stacks | `useSwipeStack.js` | Sprints 1/3/5 shipped · Sprint 2 not started |
| 17 | Auth & Account | `ProfilePanel.jsx`, `LoginScreen.jsx` | Live |
| 18 | Investor & Demo Accounts | `DemoAccountTree.jsx`, `InvestorRegister.jsx` | Live, dormant |
| 19 | PWA / Install | `vite.config.js`, `PwaInstallModal.jsx` | Live |
| 20 | Subscription Lifecycle Emails | `api/cron-subscription-lifecycle.js`, `_lifecycle*.js` | Live — dev sender until domain verified |
| 21 | Monetization — Trial, Paywall, Revival | `subscription.js`, `api/stripe-*.js`, `ReviveScreen.jsx` | Live |
| 22 | Master Timeline — Config History | `configHistory.js`, `db.js` | Write path live; read path mostly unbuilt |
| 23 | Beta Tester Accounts | `entitlements.js` | Live |
| 24 | AI Layer — Coach | `api/coach.js`, `coachPrompts.js`, `aiContext.js`, `AskCoachPanel.jsx` | Live, paid-tier gated |
| 25 | Beta Homebase & Money Moves | `BetaHomebase.jsx`, `ProductivityHub.jsx`, `api/admin-beta-hub.js` | Live |
| 26 | Résumé / Career Document Center | `ProfilePanel.jsx`, `resume_profile`, Storage `resumes` | v1+v2 live; v3+ ahead |
| 27 | Serverless functions & Vercel cap | `api/` | 12/12 — zero headroom |

---

## 1. Income & Pay Engine

```
SetupWizard → config → buildYear(cfg) → allWeeks[] (52 weeks)
  → computeNet(week, cfg, extraPerCheck) → per-check net
  → eventImpact (logs, calcEventImpact) → grossDeltaByWeek, netLost/netGained
  → adjustedTaxableGrossByWeek → extraPerCheck (feeds computeNet)
  → futureWeekNets[] → computeGoalTimeline() → goal fund sequences
```
- **Adjusted Net:** `logTotals.adjustedTakeHome = projectedAnnualNet + eventImpact.totalNetAdjustment`
  — Year Summary and its inline breakdown read this one value.
- **Benefit premiums** are subtracted from taxable gross via `weeklyBenefitDeductions()`.
- **Known gap:** `cfg` is one flat object for every week, including elapsed ones — a mid-year
  pay/preset edit retroactively recomputes past weeks. Capture exists (§22); the engine doesn't
  read it yet except baseRate (§22). Fix tracked in `TODO.md` §3.

## 2. Rolling Views

`rollingTimeline.js`: `deriveRollingIncomeWeeks(allWeeks, todayIso, 4)` (last 4 + current + rest of
year), `deriveRollingTimelineMonths`, `progressiveScale(scaleProgress, 0.15)` (1.00x→1.15x row density).

## 3. Budget — Expenses

- Drag-and-drop reorder (mouse + 450ms touch hold), cross-lane Needs/Lifestyle.
- `perPaycheck = amount × 7 / cycleDays`; `monthly = perPaycheck × 4` (paycheck-month, intentional).
- **Point-in-time history:** `history: [{effectiveFrom, weekly}]` (+ `monthlyOverrides`);
  `getEffectiveAmount()`/`getEffectiveAmountForMonth()` mean editing a bill never rewrites past totals —
  the pattern `TODO.md` §3 wants to generalize to pay config.
- Save UX: "Month+ Onward" primary, month-only / quarter-only secondary. Collapsible categories
  (`sessionStorage`). `computeRemainingSpend()`/`resolveBudgetHealthMonthBoundary()` drive health.
- **Gaps:** no "Quarterly" billing cycle (`TODO.md` §21); due dates are optional/partial (§20).

## 4. Budget — Goals + Claim Date

- `computeGoalTimeline()` (`finance.js`) sequences surplus week by week; goals UI lives entirely on
  `HomePanel.jsx` (BudgetPanel gets no goals).
- **Claim Date:** cards lead with the date, plus a "Next Claim Date" hero and a `then …` funding queue.
  **Presentation only** — every date comes from `resolveGoalFinishInfo()`; never compute one elsewhere
  (`drift-app-warden.md` §8 F177; goal-card body is duplicated mobile/desktop — edit as a pair).
- Reset Timeline writes `config.goalTimelineEpochIdx`. `getFundedGoalSpend()` in `goalFunding.js`.
- **Gap:** unfunded-goal ETA falls back to `remaining / avgNet` under volatile checks.

## 5. Budget — Loans

`buildLoanHistory()` adds runway + payoff entries effective the day after the quarter-end containing
the payoff. Card shows per-paycheck amount, payments left, payoff date. **Gap:** history is regenerated
from `loanMeta` on every load, so term edits rewrite the past (`TODO.md` §3.F4).

## 6. Benefits — 401k & PTO

Displays in `LogPanel.jsx`; settings in `ProfilePanel.jsx` `BenefitsDetail`. 401k: projected
employee/employer contributions adjusted for logged events, enrollment countdown. PTO (DHL or
`ptoEnabled`): 1hr/20hrs accrual, `ptoGoal` tracker, manual override.

## 7. Attendance Tracking

DHL: `computeBucketModel(logs, cfg)` — tiered monthly bonus (Tier 1 +18h → Tier 4 +0h), overflow above
`bucketCap` (128h) pays at `bucketPayoutRate`; bands safe ≥48h / caution ≥12h / critical <12h. Base
users (opt-in `attendanceBucketEnabled`): warn/terminate thresholds, status display only.

## 8. Log Panel

Three hero cards (net loss, PTO hours lost, bucket hours lost) + Log Effect Summary (adjusted take-home,
weekly avg, projected savings vs. unfunded goals). Attendance history by month/weekday. Admin-only ▼
per-entry breakdown (`calcEventImpact` surfaced).

## 9. Setup Wizards

- **`SetupWizardAdlib.jsx` is the only mounted wizard** — a fill-in-the-blank, cascading mad-libs flow:
  4 employed pages (Intake, Schedule+Tax merged, Deductions, Wrap Up) + 3 native jobless pages.
  Covers first-run (employed + jobless + investor) and all four life-event strings
  (`structure_change` is the only menu entry; `lost_job`/`changed_jobs`/`commission_job` via its
  internal `LifeEventPivot`). `App.jsx` mounts it whenever `wizardEntry !== null`.
- **`SetupWizard.jsx`** is no longer mounted; retained as the source of `LIFE_EVENTS`/`DIFF_FIELDS`/
  `StructureChangeDiff` exports. Both funnel through `finalizeWizardConfig()` (`wizardComplete.js`)
  then `handleWizardComplete()` (eager save, configHistory tag, food seed).
- **Key behaviors:** blank-by-default (`BLANK_PAY_FIELDS`); number-gated reveals fire on blur
  (`useCommitTracking`); per-word typed reveal; `attempted`-driven required-field feedback.
- Full implementation reference: `setup-wizard-reference.md`; gate matrix: `drift-app-warden.md` §7.3.

## 10. Life Events & New Job Season

NJS is a distinct app mode: while `config.newJobSeasonMode`, `App.jsx` renders `NewJobSeasonHomePanel`/
`NewJobSeasonBudgetPanel` **instead of** Home/Budget (the old Dashboard/ExpenseTriage are deleted —
don't resurrect).
- **`LifeEventMenu.jsx`** — 3 tiles: Pay Structure Changed → Ad-Lib `structure_change`; Quit My Job →
  `NewJobSeasonEntry`; Rate Update → `RateUpdateModal`.
- **`NewJobSeasonEntry.jsx`** — up to 4 steps: date + mandatory cash on hand + unemployment benefits;
  pending/final paycheck; expense review (unchecking sets `trackDuringNewJobSeason: false`); due-date
  assignment (loans auto-attach `firstPaymentDate`). `buildYear()` zeroes earned income from
  `newJobSeasonDate` forward — **not prorated** (whole fiscal week zeroes; pending-check step is the patch).
- **`newJobSeasonRunway.js`** — `computeNewJobSeasonRunway()` is the one runway/burn function (both
  panels, Coach card, Coach wiring). `weeklyBurn` = Needs + loans only; Lifestyle shown as a caption.
  Cash decays with bills landing since `newJobSeasonCashOnHandAsOf` (`sumBillsDueSince()`); gig income
  adds on top; the pending check extends runway only once its arrival date passes.
- **Panels:** Cash On Hand card → `CashOnHandSheet.jsx` (re-stamps the decay clock); runway headline,
  Log Extra Income, `ReemploymentTracker`; Budget side has benefit-scenario toggle, upcoming-bills
  countdown, inline triage. All eager-save. Amber banner; "Back to Work" re-enters as `structure_change`.
- **Known gaps / open work:** deleted/inactive expenses leak into NJS bills + runway (`TODO.md` §24 — bug);
  no "Mark as Paid" (§25), no per-bill cadence (§23), no week-of-month detection (§26); annual pace
  ignores mid-year gaps (§1.H12); Job Hunt Assistant/Job Scout unbuilt (stay on `canAccessAiFeatures`).

## 11. Employer Preset Convention

Every gating component declares `const isEmployerDHL = config.employerPreset === "DHL"` and
`const isBaseUser = !isEmployerDHL`; DB column `is_employer_dhl`. **DHL Site:** `dhlSite: "PLANT"`
(rotating Team A/B) or `"WAREHOUSE"` (fixed Mon–Thu / Wed–Sat `dhlTeam`, 10/12h shift); absent key =
Plant, no migration. `getDhlPlannedDayIndexes()`/`getDhlPlannedPattern()` in `finance.js` are the single
day-pattern source for `buildYear`, `projectedGross`, `calcEventImpact`.

## 12. Biweekly Two-Week Check-In

`WeekConfirmModal.jsx` collects both weeks of a biweekly base user's pay period ("same days again?")
before one `onConfirm`. Salary and a biweekly's first period auto-confirm the paired week.

## 13. Admin Diagnostic Toolkit

`isAdmin` only: Lock Date, Reopen Last Check-In, Force Sync, Config Raw View, DB Row Viewer, Tax Weeks
Grid, Live State Inspector, Week Inspector, Beta Report. Tool spec: `docs/admin-toolkit-reference.md`.

## 14. Net Worth Health Tips

`netWorthHealthStatus()` flags savings rate <10%; `NetWorthHealthTips.jsx` shows a collapsed cue on
Home → 3 tips rotated by fiscal week + a future `aiTip` slot. Suppressed in NJS.

## 15. UI Design System

Flow shell live; Pulse overlay (`--color-signal-*`, `InsightRow` — never fabricate signals) Phase 2.
Liquid Glass `purpose` whitelist: `nav`, `pulse`, `modal`, `log-summary`, `phase-btn` (never on primary
MetricCards/tables/buttons). Two-font system (Titillium Web display / Rajdhani body; mono = read-only
data). Body text uses `.text-2xs…md` classes, enforced by `textUtilityClassAudit.test.js`. Rules:
`CLAUDE.md`; token values: `design-system-source-of-truth.md`.

## 16. Swipeable Stacks

`useSwipeStack.js` + `ScrollSnapRow`/`PaginationDots`. Shipped: S1 primitives, S3 Home goal cards,
S5 reorder modal. **Not started:** S2 (Income weekly rows → snap cards).

## 17. Auth & Account

Supabase email/password + Google OAuth, RLS live. `ProfilePanel.jsx`: Job & Pay (4 cards + Employment +
Life Events entry), Retirement & Benefits, App Preferences, Tax Plan (gated), Investor Codes (admin),
Account (email/password, Google link, sign out, delete, subscription). NJS swaps Work & Pay for "Back to Work".

## 18. Investor & Demo Accounts

Dormant/developer-facing: `DemoAccountTree.jsx`, `InvestorRegister.jsx`, `InvestorAdminPanel.jsx`,
`createInvestorAccount()`. `is_investor` ≠ `is_tester` for account-tier surfaces (Demo Tree vs. usage
tracking/beta report), but both plus `is_admin` bypass every paid wall via `hasPrivilegedAccess`.

## 19. PWA / Install

`vite-plugin-pwa`, `registerType: 'prompt'` (autoUpdate force-reloaded tabs mid-session) →
`UpdateAvailableBanner`; workbox network-first for shell + Supabase. `PwaInstallModal.jsx` handles
`beforeinstallprompt`; entry in drawer and Account, hidden when standalone.

## 20. Subscription Lifecycle Emails

Server-only. Resend via `fetch` (`api/_email.js`; `EMAIL_FROM` is the dev sender until a domain is
verified). `api/cron-subscription-lifecycle.js` — daily 15:00 UTC, `CRON_SECRET`-guarded, skips
admin/investor/tester. `_lifecycleEngine.js`: nudges day 7 + 12, grace/expired every 2 days,
`deleteDue` at 21+7; throttle by `last_dunning_email_at` after a successful send. Disclosure rule (14-day
copy only) tested in `lifecycleEmails.test.js`. `deleteDue` runs `archiveAndDeleteAccount()`.

## 21. Monetization — Trial, Paywall, Revival

- `getEntitlement(subscription, now)` → `trial | grace | active | expired | none` from `trial_ends_at`
  (day 14) and `access_ends_at` (day 21). The 7-day gap is a **hidden grace — never disclosed**; `now`
  is wall-clock, never the admin Lock Date.
- Stripe/trial columns on `user_data` (migration 017), service-role-only writes (RLS, 019). Routes:
  `stripe-create-checkout`, `stripe-webhook` (signature-verified, idempotent), `stripe-portal`,
  `stripe-revive-checkout`.
- Gating: `isExpiredReadOnly` → Home/Budget read-only (`noop` setter shadowing — new eager-save props must
  be shadowed too), Income/Log replaced by `UpgradePanel`; `UpgradeCard`/`UpgradeModal`/`TrialBanner`.
- **Revival:** both dunning-expiry and user "type DELETE" tombstone to `deleted_accounts`; revival
  requires a real charge (`ReviveScreen` + `revival-lookup`). User deletion stamps `deletion_requested_at`
  first and archives best-effort; the daily `sweepPendingDeletions()` retries. Migrations 045/046 fixed a
  FK that orphaned accounts and added `auth_purge_pending` (`drift-app-warden.md` §12 F52).
- **Gaps:** Stripe Portal dashboard config unconfirmed; cancel-on-delete cleanup and tombstoned-email
  Google sign-in are live-verification-only.

## 22. Master Timeline — Config History

`account_history` (migration 020) is append-only (RLS select/insert only): full config snapshot +
`changed_fields` + `effective_from` + `source`. A watcher in `App.jsx` diffs every `config` change against
`HISTORY_SENSITIVE_FIELDS` (`configHistory.js`) and inserts via `saveConfigSnapshot` — no save path can
bypass it. Investor sandboxes exempt. **Read side:** only baseRate (`extractBaseRateHistory` →
`buildYear(cfg, baseRateHistory)`); the general resolver and the loan fix remain open (`TODO.md` §3.F3–F4).

## 23. Beta Tester Accounts

`user_data.is_tester` (migration 021), set manually in SQL; trigger seeds a 6-month trial window on
false→true. Grants `canAccessTaxPlan` (admin/tester) and, via `hasPrivilegedAccess`, AI features.
Never grants Demo Tree/investor paths; cron never dunns testers. Seat cap and channel pools: migrations
034/035.

## 24. AI Layer — Coach

Corner-man persona (`docs/coach-personality-rubric.md`). Open to everyone with `trial`/`grace`/`active`
entitlement (+ admin/tester/investor/AI-admin) via `canAccessAskCoachGeneral`, enforced client **and**
server. Unbuilt AI surfaces stay on `canAccessAiFeatures`.
- **Pieces:** `api/coach.js` (streams SSE; `ANTHROPIC_API_KEY`/`_TEST` split) · `claude.js` · `coachPrompts.js`
  · `coachFeatureGuide.js` · `aiContext.js` `buildCoachContext()` · `AskCoachPanel.jsx` · `CoachNetWorthCard.jsx`
  (rate-limited once/tier/fiscal-week).
- **Persistence:** every completed turn eager-saves to `coach_chats` (023); last 3 chats kept with a
  Coach-written summary.
- **Grounding rule:** every context field resolves through the same function the UI uses
  (`getEffectiveAmountForMonth()`, `computeGoalTimeline()` with `goalTimelineEpochIdx`,
  `computeNewJobSeasonRunway()`) — never a parallel approximation. Prompt-text tests can't catch a model
  that stops obeying; only a live call can (`authority-finance-coach-live-test` skill).
- **Open (DW-19):** broad-question "≤3 numbers" cap still not holding — likely needs a few-shot example.
- **Privacy:** goal labels are excluded from context (rank only). Benefits/401k context intentionally unwired.
- Roadmap: `TODO.md` §2 (Show-Me tour B1, hub-aware context K, eval harness L).

## 25. Beta Homebase & Money Moves

`BetaHomebase.jsx` (tracked beta testers only; nav-stack view): rubric score, feature checklist,
suggestion feed, changelog recap. `ProductivityHub.jsx` ("Money Moves") is the base-user twin — same
sections minus scoring, reusing Homebase components. Content/scores are authored through
`api/admin-beta-hub.js` (`entity`: content | score | base_content); completions/feedback write directly
under RLS (migrations 037, 039; 040 adds `employer_preset` targeting). "What's New" is
`changelog_entries` (032) via `api/admin-changelog.js`.

## 26. Résumé / Career Document Center

v1 (`resume_profile`, `resume_review` chat type; migration 036) and v2 (any-file-type storage: migration
041 columns + private `resumes` Storage bucket with own-folder RLS) are live behind
`canAccessAiFeatures`. v3+ and the Job Hunt Assistant remain in `TODO.md` §2.E/E1.

## 27. Serverless Functions & the Vercel Hobby Cap

12 functions max (one per non-`_` file in `api/`). **Currently 12/12.** Merge candidates if another is
needed: the three `stripe-*.js` routes; `admin-beta-hub.js`/`admin-changelog.js` dispatch on a body field
as precedent (`api/seed.js` already merged three seeds). A build failing on "No more than 12 Serverless
Functions" is this, not an outage. Next migration number is **047** (verify against `database/migrations/`;
`038_BOOKMARK_*` is a snapshot, not a migration).
