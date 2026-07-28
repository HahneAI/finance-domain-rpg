# Authority OS — Active Systems Reference

Living doc. Describes what is built, how it works, and known gaps — organized by
**domain/feature**, not by ship date. Renovated 2026-07-01: cross-referenced against
`docs/past-TODO-tasks.md` and re-verified against the live codebase section by section;
duplicate/stale entries from the old chronological version were merged or dropped.
Extended 2026-07-07: added §21 (Monetization — the paywall/entitlement/revival system, TODO §17,
was previously undocumented here despite being almost entirely shipped), §22 (Master Timeline
config-history write path, TODO §19 phase 1), and §23 (Beta Tester Accounts, TODO §18); refreshed
the §1/§5 known-gap notes to match. Extended 2026-07-16: added §24 (AI Layer — Coach, TODO §18) —
the chat panel, persona/feature-guide prompts, and context builder, plus the grounding pattern a
live testing pass surfaced (reuse the UI's own authoritative computation, never a parallel
approximation) that every future context-field addition should follow.
**Guardrail: keep under 300 lines — currently over; a trim pass is owed.** Summarize; do not transcribe.
Last updated: 2026-07-16 | App: Authority Finance (A:Fin)

---

## System Index

| # | Domain | Files | Status |
|---|--------|-------|--------|
| 1 | Income & Pay Engine | `finance.js`, `App.jsx` | Live |
| 2 | Rolling Views & Progressive Scaling | `rollingTimeline.js` | Live |
| 3 | Budget — Expenses | `BudgetPanel.jsx`, `finance.js` | Live |
| 4 | Budget — Goals | `HomePanel.jsx`, `goalFunding.js` | Live |
| 5 | Budget — Loans | `BudgetPanel.jsx`, `finance.js` | Live |
| 6 | Benefits — 401k & PTO | `LogPanel.jsx` (displays), `ProfilePanel.jsx` (settings) | Live — `BenefitsPanel.jsx` is dead code |
| 7 | Attendance Bucket Model (DHL) | `finance.js` | Live |
| 8 | Log Panel — Event Log & Effect Summary | `LogPanel.jsx` | Live |
| 9 | Setup Wizard | `SetupWizard.jsx` | Live |
| 10 | Life Events & Job Loss Mode | `LifeEventMenu.jsx`, `JobLossEntry.jsx`, `JobLossHomePanel.jsx`, `JobLossBudgetPanel.jsx`, `jobLossRunway.js` | Live, known gaps |
| 11 | Employer Preset Convention | all panels (architectural rule) | Live |
| 12 | Biweekly Two-Week Check-In | `WeekConfirmModal.jsx` | Live |
| 13 | Admin Diagnostic Toolkit | `App.jsx`, `LogPanel.jsx` | Live (Phase 1, 8 tools) |
| 14 | Net Worth Health — Financial Breakthrough Tips | `NetWorthHealthTips.jsx`, `finance.js` | Live |
| 15 | UI Design System — Pulse + Liquid Glass | `LiquidGlass.jsx`, `ui.jsx`, `index.css` | Live |
| 16 | Swipeable Stacks — Horizontal Snap Cards | `useSwipeStack.js`, `IncomePanel.jsx`, `HomePanel.jsx` | Sprints 1/3/5 shipped · Sprint 2 not started |
| 17 | Auth & Account | `ProfilePanel.jsx`, `LoginScreen.jsx` | Live |
| 18 | Investor & Demo Accounts | `DemoAccountTree.jsx`, `InvestorRegister.jsx` | Live, dormant workflow |
| 19 | PWA / Install | `vite.config.js`, `PwaInstallModal.jsx` | Live |
| 20 | Subscription Lifecycle Emails | `api/cron-subscription-lifecycle.js`, `api/_lifecycleEngine.js`, `api/_lifecycleEmails.js`, `api/_email.js` | Live (verified 2026-07-05) — dev sender only until domain verified |
| 21 | Monetization — Trial, Paywall & Account Revival | `subscription.js`, `App.jsx`, `api/stripe-*.js`, `api/revival-lookup.js`, `UpgradeCard.jsx`, `UpgradeModal.jsx`, `UpgradePanel.jsx`, `TrialBanner.jsx`, `ReviveScreen.jsx` | Live — all migrations through 020 confirmed run |
| 22 | Master Timeline — Config History | `configHistory.js`, `db.js`, `App.jsx` | Live, migration run (write path only — nothing reads it yet) |
| 23 | Beta Tester Accounts | `entitlements.js`, `db.js`, `App.jsx`, migration 021 | Live |
| 24 | AI Layer — Coach ("Ask Coach") | `api/coach.js`, `lib/claude.js`, `lib/coachPrompts.js`, `lib/coachFeatureGuide.js`, `lib/aiContext.js`, `AskCoachPanel.jsx`, `CoachNetWorthCard.jsx` | Live, admin/tester-gated |

---

## 1. Income & Pay Engine

```
SetupWizard → config
    ↓
buildYear(cfg) → allWeeks[] (52 weeks: grossPay, taxableGross, has401k, ...)
    ↓
computeNet(week, cfg, extraPerCheck) → per-check net
    ↓
eventImpact (logs, calcEventImpact) → grossDeltaByWeek, netLost/netGained
    ↓
adjustedTaxableGrossByWeek → recomputed fed/state liability → extraPerCheck (feeds computeNet)
    ↓
futureWeekNets[] → computeGoalTimeline() → goal fund sequences
```

- **Adjusted Net / Year Summary:** `logTotals.adjustedTakeHome = projectedAnnualNet +
  eventImpact.totalNetAdjustment` — IncomePanel's Year Summary card and inline breakdown
  both read this one value, no divergence risk.
- **Benefit premiums** (health/dental/vision/LTD/STD/life/HSA/FSA) are subtracted from
  taxable gross via `weeklyBenefitDeductions()` — confirmed correct; an older "not
  subtracted" gap noted here is resolved (past-TODO §6).
- **Known gap:** `cfg` is one flat object applied to every week in `buildYear`, including
  already-elapsed ones — a mid-year pay/employer-preset edit retroactively recomputes
  past weeks, distorting annual tax totals. The write-path fix now captures every
  sensitive change to `account_history` (§22), but `buildYear`/`computeNet` don't consult it
  yet — the engine still applies live config uniformly. Full fix tracked in `TODO.md` §19.

---

## 2. Rolling Views & Progressive Scaling

`src/lib/rollingTimeline.js` — three pure exports, unchanged since 2026-04:
- `deriveRollingIncomeWeeks(allWeeks, todayIso, 4)` — last 4 completed weeks + current +
  remaining through EOY (older hidden in `hiddenWeeks`, not deleted).
- `deriveRollingTimelineMonths(monthSegments, todayIso, 1)` — same idea, monthly.
- `progressiveScale(scaleProgress, 0.15)` — 1.00x at year start → 1.15x at EOY; applied
  to IncomePanel weekly row density.

---

## 3. Budget — Expenses

- **Drag-and-drop reorder** — mouse (hover + `reorderExpenseByInsert`) and touch (450ms
  hold, ghost overlay, edge auto-scroll). Cross-lane (Needs/Lifestyle) supported.
- **Pay-cycle math** — `perPaycheck = amount × 7 / cycleDays`; `monthly = perPaycheck × 4`
  (paycheck-based month, intentional — not a calendar-day bug).
- **Point-in-time history** — each expense carries `history: [{effectiveFrom, weekly}]`
  (+ optional `monthlyOverrides[monthKey]`). `getEffectiveAmount()` /
  `getEffectiveAmountForMonth()` resolve the right entry per week/month, so editing a
  bill's amount never rewrites past totals. This is the exact pattern `TODO.md` §19 wants
  to generalize to pay-structure config.
- **Save UX (shipped):** full-width "Month+ Onward" primary save action; secondary row
  offers month-only / quarter-only.
- **Collapsible categories (shipped):** chevron per category header, state in
  `sessionStorage`, defaults collapsed.
- **Budget-health helpers:** `computeRemainingSpend()` / `resolveBudgetHealthMonthBoundary()`
  in `finance.js` — monthly health re-evaluates on the 1st of each month.

---

## 4. Budget — Goals

- **Timeline grid:** `computeGoalTimeline()` (`finance.js`) runs week-by-week surplus
  sequencing against `futureWeeks`; renders as a month-labeled bar in `HomePanel.jsx`
  (the whole goals surface — cards, CRUD, reorder, timeline — moved to Home 2026-05-12;
  `BudgetPanel.jsx` no longer receives `goals` at all).
- **Reset Timeline:** `config.goalTimelineEpochIdx` — weeks before it contribute no
  surplus. The button (HomePanel Active Goals header) writes the next pay week's idx
  here, behind a confirmation modal; persists normally.
- **Funded goal absorption:** `getFundedGoalSpend()` — now lives in `src/lib/goalFunding.js`
  (moved out of `finance.js`). Sums completed goal targets as absorbed spend once, keeps
  them out of forward surplus projections.
- **Known gap:** unfunded-goal ETA falls back to `remaining / avgNet` under volatile
  checks — can diverge from true week-by-week surplus.

---

## 5. Budget — Loans

- **Quarter-safe payoff:** `buildLoanHistory()` regenerates a runway entry + a payoff
  entry effective the day *after* the quarter-end containing `computeLoanPayoffDate()` —
  a loan closing mid-quarter doesn't zero out before the quarter closes.
- **Card display:** per-paycheck amount + a 3-stat block (Payments Left / First Payment,
  Payoff Date, Term Payment); pre-first-payment loans show a "Saving" badge instead.
- **Known gap:** `buildLoanHistory()` regenerates a loan's *entire* history from
  `loanMeta` on every load — editing terms retroactively rewrites past weeks, same root
  cause as the Income Engine gap above. Not yet covered by §22's `account_history` write
  path — loans get their own expense-`history[]`-style follow-up (`TODO.md` §19).

---

## 6. Benefits — 401k & PTO

**Files:** `LogPanel.jsx` (displays — ported from the retired standalone panel; marker
comment at `LogPanel.jsx:86`) + `ProfilePanel.jsx` `BenefitsDetail` (settings — the
Account tab's "Retirement & Benefits" sub-view). **`BenefitsPanel.jsx` itself is dead
code** — unrendered for the repo's entire visible history (no import, no nav entry);
deletion tracked in CLAUDE.md Known Cleanup. Corrected 2026-07-19 (Drift Warden T5 pass,
`docs/drift-app-warden.md` §11).
- **401k:** projected employee/employer contributions (adjusted for logged loss/gain
  events), month-by-month breakdown table with running total, enrollment countdown
  banner when `k401StartDate` is in the future.
- **PTO** (DHL, or base users with `config.ptoEnabled`): accrual at 1hr/20hrs worked;
  goal tracker (`ptoGoal`: label, hours needed, target date, negative-balance cap)
  projects whether accrued + cap covers the need by the target date; manual balance
  override supported.

---

## 7. Attendance Tracking (DHL bucket + base-user tracker)

- **DHL bucket model:** `computeBucketModel(logs, cfg)` in `finance.js` — tiered monthly
  bonus: Tier 1 (0 misses, +18h) → Tier 4 (>24h missed, +0h). Overflow above `bucketCap`
  (128h) pays out at `bucketPayoutRate`. Status bands: safe (≥48h) / caution (≥12h) /
  critical (<12h).
- **Base-user tracker (opt-in):** separate, simpler mechanism — `config.attendanceBucketEnabled`
  + warn/terminate thresholds set in wizard step 3; no payout math, just a status display
  in `LogPanel.jsx` vs. the configured thresholds.

---

## 8. Log Panel — Event Log & Effect Summary

**File:** `LogPanel.jsx`.
- Three hero cards (net loss, PTO hours lost, bucket hours lost) + one Log Effect
  Summary card (adjusted take-home, adjusted weekly avg, projected savings vs.
  unfunded goals).
- Attendance history: absence-type logs grouped by month, day-of-week miss frequency.
- **Admin-only per-entry breakdown:** tap the ▼ chevron on any log entry to expand
  gross/net/401k/PTO/bucket impact plus fiscal week + past/future classification for
  that one event (`calcEventImpact` output surfaced directly).

---

## 9. Setup Wizard

**File:** `SetupWizard.jsx`. Steps (`STEP_DEFS`, ids not sequential — 7 is reserved for
Wrap Up):

| id | Title | Shown for |
|----|-------|-----------|
| 0 | Welcome | always |
| 1 | Pay Structure | always |
| 2 | Schedule | always |
| 3 | Deductions (skippable) | always |
| 4 | Tax Rates | always |
| 7 | Wrap Up | only `null` (first-run) · `changed_jobs` · `structure_change` |

- **Life events (`LIFE_EVENTS`):** `structure_change` · `lost_job` · `changed_jobs` ·
  `commission_job`. `lost_job` and `commission_job` finish after step 4 (no Wrap Up);
  `structure_change` pre-fills from current config and adds a "what's changing" diff to
  Wrap Up.
- **Employer preset:** `employerPreset === "DHL"` unlocks team/rotation fields in step 1,
  forces `payPeriodEndDay: 0 / otThreshold: 40 / otMultiplier: 1.5` on completion.
- **Re-entry:** sidebar/drawer "Life Events" menu, and (as of 2026-07) the Account
  panel — see §10.

---

## 10. Life Events & Job Loss Mode

Live, not scaffolding — more built than `docs/TODO.md` §15's checkbox state suggests. As of the
§15.H7 rebuild (2026-07-18), Job Loss Mode is a genuinely distinct app mode, not a card layered on
the normal panels — `App.jsx` renders `JobLossHomePanel`/`JobLossBudgetPanel` **instead of**
`HomePanel`/`BudgetPanel` while `config.jobLossMode` is true. `JobLossDashboard.jsx`/
`ExpenseTriage.jsx` (the pre-H7 architecture) are deleted — don't resurrect that pattern.

- **`LifeEventMenu.jsx`** — modal, 3 tiles: Pay Structure Changed →
  `SetupWizard(lifeEvent="structure_change")`; Lost My Job → `JobLossEntry.jsx`; Quick Rate
  Update → `RateUpdateModal.jsx`.
- **`JobLossEntry.jsx`** — up to 4-step modal: (0) date + mandatory `jobLossCashOnHand` (§15.H13,
  persisted, accepts 0; stamps `jobLossCashOnHandAsOf` alongside it, §15.H17) + unemployment
  benefits; (1) pending/final paycheck (§15.H15) — skippable "any check still coming?" gate, a
  worked-days grid, and an arrival-day picker, resolved once into a concrete
  `jobLossPendingCheckAmount`/`jobLossPendingCheckDate`; (2) expense review checklist, all bills
  checked by default, unchecking sets `trackDuringJobLoss: false` without touching anything else
  about the expense; (3) due-date assignment (`DueDatePicker`) for kept non-loan bills — loans
  auto-attach `loanMeta.firstPaymentDate`. Step 1 always runs; steps 2–3 skip entirely when there
  are no expenses. `config.jobLossMode` zeroes earned income from `jobLossDate` forward in
  `buildYear()` — **not prorated**: the entire fiscal week containing `jobLossDate` zeroes out,
  including days already worked that week (the pending-check step is the bolt-on fix for that, not
  a general proration).
- **`lib/jobLossRunway.js`** — `computeJobLossRunway()` is the one authoritative runway/burn
  function; both panels, `CoachNetWorthCard`, and `App.jsx`'s Ask Coach wiring all read it —
  `coachTriggers.js`'s old independent `estimateRunwayDays()` was deleted outright rather than
  patched, closing that drift source for good. `weeklyBurn` only sums **Needs** (and loan)
  expenses — Lifestyle-category bills are tracked and shown but
  deliberately excluded from the burn number, surfaced instead as a separate `lifestyleWeeklySpend`
  caption on Home (§15.H16). Cash is timeline-aware (§15.H17): `effectiveCashOnHand` = the
  persisted `jobLossCashOnHand` snapshot minus every essential bill's due-date occurrence that has
  landed since `jobLossCashOnHandAsOf` (`sumBillsDueSince()`, falls back to `jobLossDate` for
  accounts predating this field) — the displayed figure decreases on its own as bills come due
  instead of going stale until the user re-checks their balance. `extraCash` (just
  `sumJobHuntIncome()`, gig income logged via Home's "Log Extra Income" widget) adds on top,
  uncounted by the decay. A pending/final paycheck (§15.H15) is folded in piecewise — it only
  extends the runway once its own arrival date is reached, not lump-summed into today's cash.
- **`JobLossHomePanel.jsx`** — a pencil-badged Cash On Hand card sits above the runway tiles;
  tapping it (or the equivalent row on Budget) opens `CashOnHandSheet.jsx`, a shared bottom-sheet
  editor (up-from-bottom entrance / slide-down exit via the `.fold-sheet` CSS class, index.css) —
  confirming a value there always re-stamps `jobLossCashOnHandAsOf` to reset the decay clock.
  Runway headline, Log Extra Income widget, embeds `ReemploymentTracker` (target income,
  return-to-work date, application CRUD with 6 statuses). **`JobLossBudgetPanel.jsx`** — the same
  Cash On Hand row/sheet, benefit-scenario toggle, upcoming-bills countdown, full expense triage
  (active/paused/cancelled) inline, simplified add-expense form. Both eager-save every mutation
  (§15.H10).
- **App shell:** persistent amber banner while `jobLossMode` is true; "Back to Work" re-enters the
  wizard as `structure_change` and restores the mandatory Food expense if it was skipped at
  first-run. Entry point also lives in the Account panel (`ProfilePanel` "Life Events" row → same
  `LifeEventMenu`).
- **Known gaps** (full write-up: `docs/TODO.md` §15.H14, closed items now in §15.H15–H17):
  Job Hunt Assistant and Job Scout are still unbuilt entirely (see `docs/coach-entry-points.md`,
  and note the Job Hunt Assistant build is now tracked in a separate session, not this doc's
  worklist); résumé/skill-gap analysis is scoped (§18.E1) but not built. **Stale-note correction
  (2026-07-25):** Coach itself is no longer `is_admin`/`is_tester`-only — its gate widened to
  `canAccessAskCoachGeneral` (admin/tester **or** a real trial/paid entitlement, never
  `isInvestor`) on 2026-07-24. Job Hunt Assistant/Job Scout/résumé review stay behind the
  narrower `canAccessAiFeatures` (`isAdmin`/`isTester`) gate until each ships, then move to the
  same paid-tier gate Coach already has — a resolved decision (`docs/TODO.md` §18.E), not an open
  question. **Earlier stale-note correction (2026-07-24):** this list previously also named
  four gaps that have since closed and should no longer be treated as open — a pending/final
  paycheck is now modeled in the runway calc (§15.H15, `lib/jobLossRunway.js`); Lifestyle spend gets
  an explicit UI callout instead of silently vanishing from `weeklyBurn` (§15.H16); the independent,
  drifted `coachTriggers.js#estimateRunwayDays` was deleted outright, not just fixed — every caller
  now goes through `computeJobLossRunway()`/`resolvePrimaryRunwayDays()`; and Coach's Job Loss
  context line receives a real, computed `runwayDays` from `App.jsx` (`coachRunwayDays`), not a bare
  `"Job Loss Mode: active"` string. See `docs/BUG_FIX_TODO.md`'s Fixed table (DW-8, DW-9) and
  `drift-app-warden.md` §21 F24 for the fix history.

---

## 11. Employer Preset Convention — `isEmployerDHL` / `isBaseUser`

Architectural rule (see `CLAUDE.md`), not a single system — but widely enforced (~80
occurrences across 11+ files: `App.jsx`, `SetupWizard.jsx`, `WeekConfirmModal.jsx`,
`ProfilePanel.jsx`, `BenefitsPanel.jsx`, `LogPanel.jsx`, `finance.js`, `db.js`, tests).
Every gating component declares `const isEmployerDHL = config.employerPreset === "DHL"`
and `const isBaseUser = !isEmployerDHL` locally. Supabase column: `is_employer_dhl`.

---

## 12. Biweekly Two-Week Check-In

**File:** `WeekConfirmModal.jsx`. A biweekly base user works two 7-day weeks per pay
period but is paid once — the modal collects both (Week 1 of 2 → "same days again?" →
Yes mirrors, No opens Week 2 of 2) before firing one `onConfirm`. Salary and biweekly's
first period fall back to auto-confirming the paired week clean. Non-two-week schedules
unaffected.

---

## 13. Admin Diagnostic Toolkit

isAdmin-gated, all 8 Phase 1 tools live in `App.jsx` (+ per-entry breakdown in
`LogPanel.jsx`, §8): Lock Date, Reopen Last Check-In, Force Sync (push/pull), Config Raw
View, DB Row Viewer (+ drift badge), Tax Weeks Grid, Live State Inspector (bottom-right
pill), Week Inspector (tap any Income week row). **Full tool-by-tool spec lives in
`CLAUDE.md` — don't duplicate it here.** Phase 2 (`isOwner`) not yet built.

---

## 14. Net Worth Health — Financial Breakthrough Tips

`netWorthHealthStatus(annualSavings, annualIncome)` (`finance.js`) flags a savings rate
< 10% (`NET_WORTH_HEALTH_THRESHOLD`). `NetWorthHealthTips.jsx` renders a collapsed teal
cue on HomePanel, expanding to 3 tips rotated by fiscal week + a forward `aiTip` slot for
a future Coach-generated insight. Suppressed entirely in Job Loss Mode (owns its own
runway UI).

---

## 15. UI Design System — Pulse + Liquid Glass

- **Pulse tokens** (`index.css`): `--color-signal-blue`, `--color-signal-purple`.
  **`InsightRow`** (`ui.jsx`) renders arrow+delta+label under any `MetricCard`/`Card` via
  the `insight` prop; returns `undefined` (renders nothing) when backing data is
  insufficient — signals must never be fabricated.
- **Liquid Glass** (`LiquidGlass.jsx`): `tone` (teal/blue/purple) × `intensity`
  (light/strong) × `purpose`. **`ALLOWED_PURPOSES` has grown to 5:** `nav`, `pulse`,
  `modal`, `log-summary`, `phase-btn` (previously 3). Dev-mode console warning if
  `purpose` isn't whitelisted. Never applied to primary MetricCards, tables, or buttons.
- **`MetricCard`/`Card` `visualTier`** prop (`"glass"`/`"overlay"`) — same tint recipe
  without a wrapper element.

---

## 16. Swipeable Stacks — Horizontal Snap Cards

`useSwipeStack.js` + `ScrollSnapRow`/`PaginationDots` (`ui.jsx`). CSS scroll-snap, no
Framer Motion.

| Sprint | Status |
|---|---|
| 1 — core primitives | Shipped |
| 2 — IncomePanel weekly rows → snap cards | **Not started** — desktop table unchanged; mobile has a separate month-card `ScrollSnapRow` view, not a weekly-row conversion |
| 3 — HomePanel goal cards → snap cards | **Shipped** |
| 4 — QA + cleanup | Follows Sprint 3, not separately tracked |
| 5 — ghost ordinal + REORDER button + Reorder Modal | **Shipped** — drag-and-drop on desktop, tap+arrows on touch, reuses `moveGoal()` |

---

## 17. Auth & Account

- **Auth:** Supabase email/password + Google OAuth (`LoginScreen.jsx`); RLS live.
- **`ProfilePanel.jsx`** — Account list → sub-views: Job & Pay (4 independently
  editable pay cards — Base Pay / Differentials / Overtime Rules / Weekly Hours &
  Schedule Override — plus the Employment card merged into this view 2026-07-06 and the
  Life Events entry at its foot; neither is a standalone row anymore), Retirement &
  Benefits, App Preferences, Tax Plan (gated), Investor Codes (admin), plus Account
  (email/password, link Google, sign out, delete account, §17.F Subscription card).
  In Job Loss Mode the Work & Pay group is replaced by a single "Back to Work" row.
  Full drift map: `drift-app-warden.md` §12.

---

## 18. Investor & Demo Accounts

Real, but no active roadmap item — dormant/developer-facing. `DemoAccountTree.jsx`
(admin-editable mock accounts), `InvestorRegister.jsx` (signup path), `InvestorAdminPanel.jsx`
+ `createInvestorAccount()` (`db.js`) seed `investor_users` + `user_data` rows.

**Still two separate account tiers for account-tier purposes — see §23.** `is_investor`
unlocks the Demo Account Tree and the investor code signup path; `is_tester` unlocks the
beta-tester-specific surfaces (usage tracking, the beta report). Neither flag implies the
other for *those* surfaces. **One deliberate overlap as of 2026-07-25:** both flags (plus
`is_admin`) now bypass every paid wall, AI features included — see §23's note and
`entitlements.js`'s `hasPrivilegedAccess`. That's a shared "paid wall" exemption, not a
merging of the two account tiers.

---

## 19. PWA / Install

`vite-plugin-pwa` (`vite.config.js`) — `registerType: 'prompt'` (changed from autoUpdate
2026-07-15, `8c50ff0`: with skipWaiting/clientsClaim, autoUpdate force-reloaded every open
tab mid-session the instant a deploy landed; updates now surface via `onNeedRefresh` →
`UpdateAvailableBanner`, reload strictly user-initiated), workbox network-first caching
for app shell + Supabase API. `PwaInstallModal.jsx` detects `beforeinstallprompt` and shows a
dismissible install banner/tutorial; entry points in the mobile drawer and Account panel
("Install on home screen"), hidden when already running standalone.

---

## 20. Subscription Lifecycle Emails (Cron)

Server-side only — nothing runs on the client. Full paywall/trial context in
`docs/TODO.md` §17; §17.G is this system.

- **Provider:** Resend REST API via plain `fetch` (`api/_email.js`, no npm dep).
  `EMAIL_FROM` defaults to the dev-only `onboarding@resend.dev` sender until a custom
  domain is verified — swap before real users hit day 7 of a trial.
- **`api/cron-subscription-lifecycle.js`** — daily Vercel cron (`vercel.json`, 15:00 UTC),
  guarded by `Authorization: Bearer <CRON_SECRET>`. Service-role scan of trial-seeded
  `user_data` rows; skips `is_admin`/`is_investor`/`is_tester` (§23 — testers must never be
  dunned or auto-deleted if their 6-month window lapses unrenewed).
- **`api/_lifecycleEngine.js`** — pure per-row decision (phase math delegated to
  `getEntitlement`): trial nudges at day 7 + 12, grace/expired warnings every 2 days,
  `deleteDue` flag at day 21+7. Throttle keys off `last_dunning_email_at`, stamped only
  after a successful send — idempotent, self-retrying.
- **`api/_lifecycleEmails.js`** — templates; disclosure rule (14-day copy only, never the
  hidden grace) enforced by `src/test/api/lifecycleEmails.test.js`; schedule/throttle by
  `src/test/api/lifecycleEngine.test.js`.
- **On `deleteDue`:** `archiveAndDeleteAccount()` (§21) now actually runs — the archive
  step was the one piece missing here; it's no longer log-only.

---

## 21. Monetization — Trial, Paywall & Account Revival

Full spec, resolved decisions, and build history live in `docs/TODO.md` §17 — this entry only
orients where the code lives and what state it's really in (§17 is almost entirely `[x]` but had
no representation here until this pass).

- **Entitlement engine:** `getEntitlement(subscription, now)` (`lib/subscription.js`) resolves
  `trial | grace | active | expired | none` from two stored timestamps — `trial_ends_at` (day 14,
  user-facing countdown) and `access_ends_at` (day 21, internal hard cutoff). The 7-day gap
  between them is a **hidden grace period, never disclosed** in any user-facing string; `now` is
  always real wall-clock time, never the admin Lock Date simulation. `past_due`/`canceled` stay
  entitled until `current_period_end`.
- **Data model:** Stripe/trial columns on `user_data` (migration 017) kept OUT of the `config`
  JSON blob — `db.js` maps them to a `subscription` object. RLS (migration 019) locks those
  columns to service-role-only writes. **Confirmed run in Supabase 2026-07-07** — DB-enforced,
  not just app-layer.
- **Serverless routes** (`api/`, service-role, same Bearer-token pattern as `delete-account.js`):
  `stripe-create-checkout.js`, `stripe-webhook.js` (signature-verified, idempotent via migration
  018's event-id table), `stripe-portal.js`. `_stripeClient.js`'s `resolveAppOrigin()` derives
  redirect URLs from the request instead of a static env var (multiple live deployments).
- **Frontend gating:** `App.jsx` computes `isExpiredReadOnly` from the entitlement. Home/Budget
  go `readOnly` (values render, mutations no-op via a `setX = readOnly ? noop : setXProp` pattern
  per panel); Income/Log are fully replaced by `UpgradePanel.jsx`. The shared checkout pitch lives
  once in `UpgradeCard.jsx` — `UpgradeModal.jsx` wraps it as a dismissible overlay (triggered from
  Home/Budget), `UpgradePanel.jsx` as a non-dismissible full replacement. `TrialBanner.jsx` is the
  persistent countdown/warning strip, hidden only where `UpgradePanel` already replaces the view.
- **Lifecycle emails:** own entry, §20.
- **Account revival:** a non-payment deletion (cron, day 21+7) tombstones the row into
  `deleted_accounts` (migration 017) before deleting — the *only* delete path that archives first;
  the user-initiated "type DELETE" flow stays a true, unrecoverable hard delete. `LoginScreen.jsx`
  + `api/revival-lookup.js` detect a revivable email on a failed sign-in or a fresh Google
  sign-up (checked *before* trial seeding); `ReviveScreen.jsx` + `api/stripe-revive-checkout.js`
  require an actual successful charge (reusing the archived Stripe customer, never a free
  re-entry) before `stripe-webhook.js` restores the archived config/expenses/goals/logs/
  weekConfirmations/ptoGoal and stamps `deleted_accounts.revived_at`.
- **Known gaps:** Stripe Customer Portal dashboard config unconfirmed; two live-verification-only
  items parked for the pre-launch pass (cancel-on-delete Stripe cleanup, the tombstoned-email
  Google OAuth sign-in path — neither reachable by unit tests).

---

## 22. Master Timeline — Config History (write path only)

- **What it solves:** `buildYear`/`computeNet` apply the *current* config uniformly to every
  fiscal week, including already-elapsed ones — a mid-year pay/tax edit silently rewrites past
  totals (the gap noted in §1 and §5). This system captures the change; it does **not** yet fix
  the engine's read side.
- **`account_history` table** (migration 020) — append-only: RLS grants own-row select/insert
  only, update/delete privileges are revoked outright. Each row is a **full new-value config
  snapshot** + `changed_fields` (display-only) + `effective_from` (date) + `source`. One
  `rollout_seed` row exists per pre-existing account as a resolver floor.
- **Write path:** a config-transition watcher in `App.jsx` (not a call-site wrapper) diffs every
  `config` change against the whitelist in `lib/configHistory.js`
  (`HISTORY_SENSITIVE_FIELDS`/`diffSensitiveFields`) and inserts via `saveConfigSnapshot`
  (`db.js`) whenever a whitelisted field actually changed — so no `setConfig` call site or save
  path (immediate or debounced) can bypass capture. Wizard/life-event flows tag `source` +
  `effectiveFrom`; investor sandbox accounts are exempt.
- **Admin surface:** DB Row Viewer → Fetch shows "config history: N snapshots · latest [date]
  ([source]) · [changed fields]" (`fetchConfigHistoryMeta`, `db.js`).
- **Known gap (by design — mostly unstarted):** almost nothing reads this table. One narrow
  read slice is live (§15.D Quick Rate Update): `db.js#extractBaseRateHistory` filters
  `account_history` rows to baseRate changes → `App.jsx` `baseRateHistory` state →
  `buildYear(cfg, baseRateHistory)` → `resolveBaseRateForWeek` per week. The general
  read-path resolver (an analog of expenses' `getEffectiveAmount` for all sensitive fields)
  and the loan-history equivalent fix remain explicit, separate follow-ups. Full design
  record in `docs/TODO.md` §19. Drift map for the live slice: `docs/drift-app-warden.md` §7 F10.

---

## 23. Beta Tester Accounts

`user_data.is_tester` (migration `021_add_is_tester_beta_flag.sql`) — set manually by
Anthony via the Supabase SQL editor on an already-existing account. No signup flow, no
self-service opt-in, no client write path (locked the same way as `is_admin`/`is_investor`
since migration 019's RLS column grants).

- **What it grants:** `canAccessAiFeatures({ isAdmin, isTester, isInvestor })` (`entitlements.js`)
  — the single gate every AI feature (`api/coach.js` server-side, `HomePanel.jsx` client-side)
  checks — and, via the shared `hasTesterAccess` base, `canAccessTaxPlan({ isAdmin,
  taxProjectionsEnabled, isTester })` (`BudgetPanel.jsx`, `ProfilePanel.jsx`). Nothing else —
  no Admin Diagnostic Toolkit, no other admin-only surface. `hasTesterAccess` (admin/tester
  only, no `isInvestor` param) still backs `canAccessTaxPlan`; `canAccessAiFeatures` and
  `canAccessAskCoachGeneral` build on the wider `hasPrivilegedAccess` (admin/tester/investor)
  instead, per the paid-wall decision below — the two bases are deliberately different sizes,
  not a drift.
- **Auto trial window:** a Postgres trigger on `user_data` seeds `trial_started_at` /
  `trial_ends_at` / `access_ends_at` to a 6-month window the moment `is_tester` flips
  false→true — one-time, not renewed on subsequent saves. This routes the account through
  the real app-side trial state machine (`getEntitlement`, §17's Monetization system, §21)
  instead of a hardcoded bypass, so it "behaves like a free trial account" per spec, just on
  a 6-month clock with no Stripe billing behind it.
- **Still a crucial division, narrowed 2026-07-25:** beta testers are still NOT investors for
  account-tier purposes — see §18. `is_tester` must never grant Demo Account Tree access or
  the investor code path, and `is_investor` must never grant the beta-tester-specific surfaces
  (`isTrackedBetaTester` usage tracking, the beta report, etc.). What changed: **every paid-wall
  gate** (`canAccessAiFeatures`, `canAccessAskCoachGeneral` — AI features specifically, not the
  account-tier features just listed) now treats admin/tester/investor as one "bypasses the paid
  wall" tier (`hasPrivilegedAccess`, `entitlements.js`) — investor/demo accounts need the full
  feature set for pitch/demo purposes, same reasoning as admin. `canAccessTaxPlan` was
  deliberately left out of this widening; see its own docstring.
- **Lifecycle cron:** bypassed the same as admin/investor (§20) — testers are never dunned
  or auto-deleted if the 6-month window lapses before renewal.

---

## 24. AI Layer — Coach ("Ask Coach")

Coach is an in-app AI companion — corner-man persona, full voice brief and scored tuning rubric
in `docs/coach-personality-rubric.md` — that answers questions about how Authority Finance works,
grounded in the user's real data. Gated behind `canAccessAiFeatures({isAdmin, isTester})` (§23)
client **and** server side; every AI surface stays admin/tester-only until Coach leaves its
build-out phase (`docs/TODO.md` §18 standing constraint).

- **Pieces:** `api/coach.js` (Vercel function; streams Anthropic SSE through; re-checks the gate
  server-side; prod/test key split via `ANTHROPIC_API_KEY`/`ANTHROPIC_API_KEY_TEST`, same MODE
  pattern as Stripe) · `lib/claude.js` (`chatWithCoach()`, thin client) · `lib/coachPrompts.js`
  (`COACH_PERSONA_PROMPT` shared voice + `buildNetWorthSystemPrompt`/`ASK_COACH_SYSTEM_PROMPT`)
  · `lib/coachFeatureGuide.js` (`COACH_FEATURE_GUIDE`, hand-written panel tutorial, concatenated
  into the Ask Coach system prompt) · `lib/aiContext.js` (`buildCoachContext()`, the per-user data
  snapshot) · `components/AskCoachPanel.jsx` (chat UI; gated bottom-nav entry mirrors the admin
  `__tools__` pattern; no persistence yet) · `components/CoachNetWorthCard.jsx` (§C's proactive
  Net Worth Trend trigger, rate-limited to once/tier/fiscal-week).
- **Grounding pattern — the rule to follow when extending this:** every context field must resolve
  through the *same* authoritative function the UI itself displays that number with, never a
  parallel approximation. Concretely: per-expense weekly cost goes through
  `getEffectiveAmountForMonth()`/`getPhaseIndex()` (what `computeRemainingSpend()` uses), and
  per-goal timeline data goes through `computeGoalTimeline()` with the same
  `config.goalTimelineEpochIdx` epoch `HomePanel.jsx` passes. A 2026-07-16 live-testing pass found
  and fixed three real bugs from skipping this: a per-expense estimate derived from `billingMeta`
  instead of `history` that disagreed with the real number by double digits; an ambiguous
  "M/N completed" goals line the model misread as "no goals set"; and a flat "I don't have that
  data" on the Home "Budget Health" tile, which context simply never carried. Reuse the exported
  pure function — don't hand-derive a shortcut.
- **Privacy:** goal labels are deliberately excluded from `buildCoachContext()` — goals are
  identified only by funding-priority rank ("Goal 1 of N"). Coach may use a name back only if the
  *user* volunteers it in their own message; it never learns one from data.
- **Known gaps:** chat history persistence exists at the data layer (`coach_chats` table, migration
  023 live, `db.js` load/save/delete functions) but isn't wired into `App.jsx`/`AskCoachPanel` yet
  (§18.H). Benefits/401k context is intentionally not wired — blocked on a product decision about
  how base (non-DHL) users onboard other employer comp.
- Full build log, deviations, and open questions: `docs/TODO.md` §18.
