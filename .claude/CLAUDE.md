# CLAUDE.md — Authority Finance

## Product
**Company:** Authority | **Product:** Authority OS | **Tagline:** *"You are missing out… on you."*
**This app:** Authority Finance (A:Fin) — personal finance dashboard: income modeling, budgeting, goals, event logging.
**Design system:** Flow shell (live) + Pulse overlay (Phase 2). See `docs/authority-design-system`.
**Liquid Glass UI:** `src/components/LiquidGlass.jsx` — frosted glass for nav, pills, modals. Recipe in `docs/active-systems.md` §1.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Auth + DB | Supabase (auth live, localStorage→Supabase migration path) |
| Testing | Vitest + Testing Library |
| PWA | vite-plugin-pwa (manifest + service worker active) |
| Hosting | Vercel |

**No standalone backend server** — but no longer "pure frontend": `api/` holds 12 Vercel
serverless functions (Stripe checkout/webhook/portal/revive, Coach streaming proxy, daily
subscription-lifecycle cron + email engine, delete-account, revival-lookup, admin-changelog for
the "What's New" authoring surface, `admin-beta-hub.js` for the Beta Homebase's checklist/
suggestion content + rubric scores (dispatched on `entity`: "content" | "score"), plus
`api/seed.js` — a single route dispatched on `body.type` ("beta" | "investor" | "trial") that
consolidates what used to be three separate seed-beta/seed-investor/seed-trial functions). All
privileged writes (tier flags, subscription columns, changelog entries, beta content/scores) go
through these service-role routes — the client never writes them (RLS migration 019).

**Vercel Hobby-plan function cap:** a deployment can include **at most 12 Serverless Functions**
(one per non-`_`-prefixed file in `api/`) on the free Hobby plan — exceeding it fails the build
outright ("No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan").
This repo hit 13 once (adding `admin-changelog.js` tipped it over) and was brought back under the
cap by merging seed-beta/seed-investor/seed-trial into the one `api/seed.js` above — same fix to
reach for again if a future route addition trips this same failure, rather than assuming it's a
rate limit or a real Vercel outage. **Currently sitting at 12/12 — zero headroom** (the Beta
Homebase's `admin-beta-hub.js`, 2026-08-06, spent the last free slot by design — everything
tester-facing in that feature reads/writes Supabase directly under RLS instead of adding routes).
Consolidation candidates if another route is needed: the three `stripe-*.js` routes remain the
next most mergeable group (same shape, different Stripe action).

---

## Git PR Flow

**Three-tier pipeline:** `claude/*` feature branches → `Version-control` (integration) → `master` (production). Push to feature branches; user merges to Version-control, then to master. For systematic cross-file updates (e.g. section numbering), use placeholder-based two-pass replacement (`§15` → `__SECTION_15__` → `§1`) to prevent regex overlap when replacing multiple references simultaneously.

---

## File Structure
```
src/
├── App.jsx                  — root shell, nav, auth gate, fiscal week state
├── index.css                — @theme design tokens (single source of truth)
├── components/
│   ├── ui.jsx               — shared primitives (MetricCard, NT, VT, SmBtn, SH, iS, lS)
│   ├── HomePanel.jsx        — dashboard home tiles
│   ├── IncomePanel.jsx      — income / tax / rolling weekly view
│   ├── BudgetPanel.jsx      — expenses / goals / loans
│   ├── LogPanel.jsx         — event log + Log Effect Summary
│   ├── WeekConfirmModal.jsx — weekly schedule confirmation
│   ├── TipsCommissionCheckIn.jsx — small daily check-in card (tips/commission opt-in, skinned bonus-log mechanism)
│   ├── SetupWizard.jsx      — multi-step onboarding (see §SetupWizard below)
│   ├── SetupWizardAdlib.jsx — REAL production first-run onboarding wizard, "fill-in-the-blank" style (see §SetupWizard below)
│   ├── LoginScreen.jsx      — auth shell
│   ├── BetaHomebase.jsx     — tracked-beta-tester-only page (real nav-stack view, not a modal — see App.jsx's `navigate("betaHomebase")`): rubric score, feature checklist, suggestion feed, changelog recap
│   ├── ProductivityHub.jsx  — "Money Moves": base-user counterpart to BetaHomebase (every non-tracked-tester user), same page treatment, same checklist/tips/feedback flow minus scoring; reuses BetaHomebase's exported section components
│   └── ProfilePanel.jsx     — account + employment settings
├── constants/
│   ├── config.js            — FISCAL_YEAR_START, PHASES, EVENT_TYPES, DHL_PRESET, BENEFIT_OPTIONS
│   └── stateTaxTable.js     — state tax rate table
├── hooks/useLocalStorage.js
├── lib/
│   ├── finance.js           — buildYear, computeNet, computeGoalTimeline, calcEventImpact
│   ├── rollingTimeline.js   — deriveRollingIncomeWeeks, deriveRollingTimelineMonths
│   ├── fiscalWeek.js        — FISCAL_WEEKS_PER_YEAR, week index helpers
│   ├── configHistory.js     — §3 sensitive-field whitelist + diff gating account_history capture
│   ├── db.js                — localStorage persistence
│   └── supabase.js          — Supabase client
└── test/                    — Vitest tests
docs/                        — project documentation
database/migrations/         — Supabase SQL migrations (see BOOKMARK note below)
```

---

## SetupWizard (`src/components/SetupWizard.jsx`)

Multi-step onboarding (~2500 lines). Controlled steps with conditional routing based on `lifeEvent` (null/structure_change/lost_job/changed_jobs/commission_job). Covers pay structure, schedule, deductions, tax rates, and wrap-up. Full drift map: `docs/drift-app-warden.md` §7 — consult before changes. See source file for step definitions, helper components, state management, and DHL employer preset overrides.

**DHL Site — Plant vs Warehouse (`dhlSite`).** DHL now has two schedule shapes, chosen in Step 1
right after "Do you work for DHL? Yes": **Plant** (`dhlSite: "PLANT"`) is the original rotating
Team A/B short/long-week alternation — unchanged. **Warehouse** (`dhlSite: "WAREHOUSE"`) is a
fixed schedule with no rotation at all — a Mon–Thu team and a Wed–Sat team (`dhlTeam: "MT" | "WS"`,
`DHL_PRESET.warehouseTeams`), each working the *same 4 days every single week*, plus a real
user-selectable shift-length question (10 or 12 hours, not hardcoded) alongside the existing
night/morning-shift question. Same bucket/PTO numbers, weekend differential, and night
differential dollar amounts as Plant. `dhlSite !== "WAREHOUSE"` is the Plant fallback — every
existing DHL account (no `dhlSite` key in its stored config at all) needs **no migration**, it
just keeps behaving exactly as before. `finance.js`'s `getDhlPlannedDayIndexes()`/
`getDhlPlannedPattern()` are the single shared source of the day-pattern for `buildYear()`,
`projectedGross()`, and `calcEventImpact()` alike — a Warehouse branch there is enough to make all
three correct, no per-caller duplication. `buildYear()` additionally forces `isHighWeek: false`
for Warehouse weeks (financially inert — `PaystubCalc` already guarantees `fedRateHigh ===
fedRateLow` whenever `scheduleIsVariable` is false, which Warehouse always sets). Site-gated UI:
Step 1 (site/team/shift-length questions, custom-rotation question hidden for Warehouse), Step 2
(Short/Long Week pills hidden for Warehouse — nothing else to ask beyond the start date), Step 4
("Load DHL Preset" hidden for Warehouse — those rates are Plant-specific), and `ProfilePanel.jsx`'s
T5 Employment card (DHL Team editor + Schedule Override, same field/second-editor pattern per
`docs/drift-app-warden.md` §7). See that doc's DHL_PRESET/`dhlSite` trigger-map rows before
touching any of this again.

`initialStepId` (optional prop, default `null`) opens the wizard on a specific `STEP_DEFS` id
instead of always step 0 — added solely so `SetupWizardAdlib.jsx` can hand off into the real
wizard's jobless mini-flow (id 10) after its own pilot pages are answered. No effect on any
existing call site that omits it.

**`SetupWizardAdlib.jsx` — the REAL production first-run onboarding wizard.** A
"fill-in-the-blank" reimagining of the entire first-run, employed-signup flow — all six real
`SetupWizard.jsx` steps — as five cascading mad-libs pages with inline `<select>`/`<input>`
blanks, instead of stacked form fields or a page-per-step flow. Page 1 (`IntakePage`) merges
Welcome + Pay Structure into one continuous sentence; page 2 (`SchedulePage`) covers Schedule as
its own page; page 3 (`DeductionsPage`) covers Deductions as its own page (with a Skip button,
mirroring real `STEP_DEFS id 3`'s `skippable: true`); page 4 (`TaxRatesPage`) covers Tax Rates as
its own page; page 5 (`WrapUpPage`) covers Wrap Up as its own page — all in the same cascading
style.

**Scope: first-run only.** `App.jsx` mounts `SetupWizardAdlib` whenever `wizardEntry === false`
(first-run) and there is no in-progress jobless mini-flow hand-off (`adlibHandoff`).
`SetupWizard.jsx` stays mounted, completely unchanged, for every life-event re-entry
(`structure_change`, `lost_job`, `changed_jobs`, `commission_job`) — those keep using the real
stacked-form wizard. The jobless mini-flow (unemployed at first-run) still hands off into the real
`SetupWizard` at `STEP_DEFS` id 10 (`onHandoff(mergedFormData, 10)`, via `App.jsx`'s
`adlibHandoff` state) for the Unemployment Benefits/Job Loss Details/Jobless Wrap Up steps — a
real, click-through continuation, not a throwaway mockup. A Back at that first handed-off step
returns the user to `SetupWizardAdlib`, pre-filled via `adlibResumeData`/`onBackBeforeStart`,
resuming on the last page they were on.

**Investor first-run** (`isInvestor` prop, threaded from `App.jsx` as `config.isInvestor`)
mirrors `SetupWizard.jsx`'s investor handling field-for-field: `IntakePage`'s Welcome clause reads
`formData.investorName`, the "who do you work for" DHL/someone-else question is skipped entirely
(investors are always base users — the page goes straight to the "I get paid…" pay-schedule
clause), and `formData`'s init override forces `employerPreset: null` with
`otThreshold`/`maxWeeklyHours` seeded from the investor's existing config. Investor first-run also
keeps a Cancel button (returns to account 1), matching `SetupWizard.jsx`'s own investor exception
to the uncancelable-first-run rule.

**Save path.** Reuses the exact same config fields and DHL-preset defaults as real
Step0/Step1/Step2/Step3/Step4/StepWrapUp (see `pickTeamPatch()` mirroring Step1's `pickTeam()`) so
there's zero drift between the two experiences on the fields they share. On an employed finish,
`formData` is run through `finalizeWizardConfig()` (`src/lib/wizardComplete.js`) — the same shared
normalizer `SetupWizard.jsx`'s `handleComplete()` calls (DHL enforced overrides, Freedom Allowance
normalize, `taxedWeeks` derivation, `accountCreatedIdx` stamp, `setupComplete: true` — see
`docs/drift-app-warden.md` §7 F5/F13/F128) — then handed to the `onComplete(finalConfig)` prop,
which `App.jsx` wires straight to `handleWizardComplete()`, the same function every real
`SetupWizard` completion uses (eager save via `savePersistedStateNow`, configHistory tagging,
food-seed logic). Cancel (`onCancel`, only present for investor first-run) has zero save side
effects, matching the real wizard's uncancelable-first-run rule for everyone else.

- **Five real pages, each internally cascading.** `PAGES = [{Component: IntakePage}, {Component:
  SchedulePage}, {Component: DeductionsPage}, {Component: TaxRatesPage}, {Component: WrapUpPage}]`,
  navigated with a page-level Next/Back via `StepSlide` (same slide transition the real wizard
  uses) — but *within* each page, clauses still cascade in as plain `formData`-gated conditionals
  (`isEmployed && (…)`, `formData.startDate && (…)`, etc.) that mount the instant their
  prerequisite answer is given, no click required. Jobless users skip pages 2–5 entirely
  (`activePages = startedUnemployed === true ? [PAGES[0]] : PAGES`), same as the real wizard's
  `isFirstRunJobless` gate skipping STEP_DEFS id 2/3/4/7 outright.
  Back is hidden on page 1 (`pageIdx > 0`) and reappears on pages 2–5, returning to the prior page
  with its answers intact — this Back is a real page-level navigation, distinct from undoing an
  earlier answer within the current page (just re-picking that blank directly). The outer
  page-count/resume machinery (`activePages`, `pageIdx`, the header's "N of M" progress display,
  resume-at-last-page via `resumeFormData`) is written generically against `PAGES.length` — adding
  a page requires no changes there, only a new `PAGES` entry and its `isXValid`/`Component` pair.
- **Each newly-revealed clause rolls in with a typed reveal, not an instant appear.** `TypedText`
  runs the clause's static wording through the `adlibType` stepped `clip-path` keyframe
  (`index.css`) — a "crisp" blocky reveal, not a smooth wipe — combined with the existing
  `fadeSlideUp` fade+lift in the same `animation` shorthand, so the clause both rolls onto the page
  and types itself out at once. `FadeIn` then fades the blank in at `delay = typeDuration(precedingText)`,
  so the select/input appears right as its introducing text finishes typing. All `TypedText` within
  the same clause use `delay=0` (they mount together the instant the clause becomes eligible, so
  they can type in parallel — no cumulative per-segment delay bookkeeping needed).
- **Blank by default, not prefilled from the account's existing config.** `formData` starts as
  `{ ...config, ...BLANK_PAY_FIELDS }` — `BLANK_PAY_FIELDS` nulls every field either page asks
  about, both the original Welcome/Pay Structure set (`startedUnemployed`, `employerPreset`,
  `dhlSite`, `dhlTeam`, `dhlNightShift`, `nightDiffRate`, `userPaySchedule`, `annualSalary`,
  `baseRate`, `shiftHours`, `otThreshold`, `otMultiplier`, `payPeriodEndDay`, `scheduleIsVariable`,
  `bucketStartBalance`, `bucketCap`, `bucketPayoutRate`, `diffRate`, `startingWeekIsLong`) and the
  Schedule additions (`startDate`, `firstActiveIdx`, `maxWeeklyHours`, `hoursUnderstood`,
  `biweeklyPayWeekParity`). Without this, an investor re-entering first-run whose config already
  has some of these answered would land on a page fully pre-filled and instantly proceed-eligible —
  silently skipping `isIntakeValid()`/`isScheduleValid()`'s required-field gating (already correct,
  mirrors STEP_DEFS id 0/1/2) since it never had a blank state to gate from. Every `InlineSelect`
  reselecting its blank `(select)` option must resolve to `null` (not a falsy default), or clearing
  back to blank would misreport as a real answer — see the explicit `v === "" ? null : …` branches
  in both pages' `onChange` handlers. Note that a DHL user's `startingWeekIsLong`/`payPeriodEndDay`
  legitimately stop being blank partway through page 1 (Team selection seeds them via
  `pickTeamPatch()`), which is intentional — it mirrors the real wizard's own Step1→Step2 default
  seeding, and `SchedulePage`'s Short/Long-Week select is deliberately not gated in
  `isScheduleValid()` for the same reason the real Step2 doesn't require it for DHL users.
- **DHL Site (Warehouse vs Plant) mirrors the real Step1 exactly, same fields/functions.** Once DHL
  is chosen, `IntakePage` asks "Which DHL site do you work at?" before any team question, then
  branches: Plant keeps the original Team A/B clause unchanged (`pickTeamPatch()`); Warehouse asks
  a Mon–Thu/Wed–Sat team blank (`pickWarehouseTeamPatch()`, options built from
  `DHL_PRESET.warehouseTeams`) followed by a real shift-length blank (10/12 hours, writes
  `shiftHours` directly — the only place on this page a select writes a number). The shared
  "working the [shift], paid [schedule]" clause that follows is gated on `dhlTeamReady`, which
  additionally requires `shiftHours` for Warehouse (Plant only needs `dhlTeam`) — mirrors
  `isIntakeValid()`'s own gate exactly, which mirrors STEP_DEFS id 1's `!d.dhlSite`/`!d.dhlTeam`
  checks. `SchedulePage`'s Short/Long-Week clause is hidden entirely for Warehouse (`dhlSite !==
  "WAREHOUSE"`), matching Step2's DHL branch. Local `pickSite()` (site pick) and
  `pickWarehouseTeamPatch()` (team pick) mirror the real wizard's own `pickSite()`/
  `pickWarehouseTeam()` field-for-field.
- **`IntakePage`'s trailing clauses (Tips/Commission opt-in, base-user OT Threshold, DHL Weekend
  Differential) all share one `payStructureComplete` gate** — added 2026-08-10, mirroring the
  point in real Step1 where the core rate/hours questions are answered and Advanced Pay Rules/OT
  Threshold/tips opt-in become relevant. Tips/Commission (any employer) asks "On top of that, I
  [don't earn tips or commission / earn tips / earn commission]," with a commission-only-position
  follow-up; `tipsOrCommissionEnabledAt` stamping is handled by the shared `finalizeWizardConfig()`
  (see below), not this page. Base-user Overtime Threshold offers 40h/48h/Custom/Exempt (DHL keeps
  its fixed 40h/1.5× override from `setEmployer`, so this clause only renders for base users). DHL
  Weekend Differential is now an editable `InlineNumber` pre-filled with the `DHL_PRESET` default,
  instead of the previous hardcoded, uneditable value. None of the three gate `isIntakeValid`. See
  `docs/drift-app-warden.md` §7 F130.
- **`AdvancedPayRulesCard` (base users) and `DhlRotationCard` (DHL Plant only) — collapsible
  cards below the sentence, not inline mad-libs prose** — added 2026-08-10, mirroring real
  Step1's `AdvancedPayRules` component and its inline DHL-rotation `Field` block field-for-field,
  reshaped into this file's card+`InlineChip` idiom (real `Pill`/`Field` have no equivalent here).
  `AdvancedPayRulesCard` renders after the OT Threshold clause once `payStructureComplete`: OT
  multiplier (1.5×/2×), night differential enable+rate, weekend differential. `DhlRotationCard`
  renders after the DHL weekend-differential clause once `dhlTeamReady && isEmployerPlant`:
  Standard-vs-Custom toggle, then long/short-week hour blanks (draft-string state, mirrors real
  Step1's `longHoursDraft`/`shortHoursDraft`) once Custom is picked. Adding these fields exposed
  two pre-existing gaps in `isIntakeValid` (present since before this round, just latent because
  the fields weren't reachable yet) — now fixed: `customWeeklyHours`/`customWeeklyHoursLong`/
  `customWeeklyHoursShort` required-when-custom checks, and the base-user custom-OT-threshold-
  must-be-positive-once-entered check — both line-for-line mirrors of real STEP_DEFS id 1.
  `finalizeWizardConfig()` (`wizardComplete.js`) also gained an `otMultiplier ?? 1.5` default,
  since `BLANK_PAY_FIELDS` nulls it for base users until the card is opened (real `SetupWizard.jsx`
  never blanks it). See `docs/drift-app-warden.md` §7 F133.
- **`attempted`-driven required-field feedback + accessible names (2026-08-10).** `InlineSelect`/
  `InlineNumber`/`InlineDate` gained an `error` prop (solid `--color-deduction` border +
  `aria-invalid` + a new `RequiredNote` "↑ Required" tail) mirroring real `errBorder()`/`Field`,
  wired via `attempted && <the same condition that page's own isXValid checks>` on every required
  control. `InlineSelect`/`InlineNumber` also gained a contextual `ariaLabel` prop (threaded per
  call site); `InlineChip` gained `aria-pressed`/`aria-label`. The Next/Finish button's
  `disabled={!canProceed}` stayed unchanged — `handleNext`'s `setAttempted(true)` branch mirrors
  `SetupWizard.jsx`'s own `handleNext` exactly, including that function's own reachability quirk
  (a native `<button disabled>` blocks click dispatch in both wizards). See
  `docs/drift-app-warden.md` §7 F132.
- **`TaxRatesPage` gained the two real Step4 fallback paths (2026-08-10).** "Use Estimate for
  Now" (`handleEstimate()`, 10%/12% federal flat + state flat/midpoint/0 via `STATE_TAX_TABLE`,
  `taxRatesEstimated: true`) sits next to "Apply These Rates" inside the paystub reveal, always
  available. The DHL Missouri preset button (`loadDHLPreset()`, `DHL_PRESET.defaults`' rates)
  renders above the calculator once filing status + state are answered, same gate as real Step4
  (`isEmployerDHL && dhlSite !== "WAREHOUSE" && !hasRates && userState === "MO"`). Both are
  straight function copies of the real wizard's own. See `docs/drift-app-warden.md` §7 F134.
- **`WrapUpPage` gained the real Wrap Up's Tax-Exempt Week Projections opt-in (2026-08-10).**
  Renders below the buffer sentence: static disclosure copy + a "coming soon" placeholder once
  `formData.taxExemptOptIn === true`, both exact copies of real `StepWrapUp`'s components
  (nothing to ground live — the feature is a placeholder on both wizards). Doesn't gate
  `isWrapUpValid`. See `docs/drift-app-warden.md` §7 F135.
- **`DeductionsPage` gained Benefits Start Date, Other Recurring Deductions, Attendance Policy
  Details, and PTO (2026-08-10) — closes out §19.1.A's last Deductions gaps.** Benefits Start
  Date is an inline `InlineDate` clause. The other three are block-level cards below the
  sentence (don't fit one-blank mad-libs prose): `OtherDeductionsList` (add/edit/remove row
  list), `AttendanceDetailsCard` and `PtoDetailsCard` (collapsible, default-expanded if already
  answered, mirrors real `DetailsDisclosure`). None gate `isDeductionsValid`. Fixed two
  pre-existing `HISTORY_SENSITIVE_FIELDS` gaps found in the process (`attendanceUnit`/
  `attendanceCurrentBalance`/`ptoCurrentBalance` were missing even for the real wizard). See
  `docs/drift-app-warden.md` §7 F136.
- **`TypedText` types per word, not per clause (2026-08-10 fix).** A clause used to render as one
  `display:inline-block; white-space:pre` span — an atomic box that can't wrap internally, so a
  long real clause overflowed horizontally on narrow viewports. Now chunks into per-word
  `inline-block` spans joined by ordinary breakable spaces in a normal-flow wrapper, so the browser
  wraps between words like plain text while each word still steps in via the same `adlibType`
  clip-path keyframe, staggered left-to-right. `typeDuration(text)` still describes a clause's
  total duration. `Inline*` controls gained `max-width: 100%`; `BLANK_FONT` uses
  `clamp(18px, 4.2vw, 26px)`; `prefers-reduced-motion` is handled via `.adlib-typed-word`/
  `.adlib-fade-in` (`index.css`). `SetupWizardAdlib.test.jsx` gained a `byText()` helper (matches
  recursive `textContent`) since a word-chunked clause is no longer one continuous text node. See
  `docs/drift-app-warden.md` §7 F129.
- **Deductions page mirrors real Step3, with a new `InlineChip` control for the one multi-select
  field.** `isDeductionsValid()` is a line-for-line mirror of `STEP_DEFS id 3`: base users must
  answer the attendance-tracking question, DHL users have no required field at all (zero-interaction
  valid), and any selected benefit must have its dollar amount (or, for `k401`, both rate and
  enrollment date) filled in. A single "Right now, I have/don't have benefits…" gate reveals a row
  of `InlineChip` toggles — one per `BENEFIT_OPTIONS` entry — since a native `<select>` blank can't
  represent an independently-toggleable multi-select inside the sentence-flow metaphor; each
  selected chip then reveals its own inline "`<Benefit>` costs $___ a week" (or, for the `k401`
  type, "I put ___% into 401k, starting ___") clause directly beneath the chip row, matching
  `BenefitCard`'s real fields exactly (`k401Rate`/`k401MatchRate` stored as decimals, displayed
  ×100 as a whole-number percentage — same `+(rate * 100).toFixed(2)` / `/ 100` conversion as
  `Step3`). Deselecting a chip zeroes its field(s) the same way real `Step3`'s benefit toggle does,
  so re-selecting starts blank again rather than resurrecting a stale amount. `attendanceBucketEnabled`
  is asked only for base users (`isBaseUser = formData.employerPreset !== "DHL"`), gated on the
  benefits question having been answered either way (`benefitsGate !== null`) — DHL users skip it
  entirely, mirroring `Step3`'s own `!isEmployerDHL` gate. Scoped out of this page (mirrors none of
  `isDeductionsValid`, so omitting them can't break required-field parity): `benefitsStartDate`, the
  dynamic `otherDeductions` list, and the attendance sub-fields (unit/thresholds/balance/increment)
  — same "v1 scope" precedent as Warehouse's custom-hours question being left off page 1.
  `InlineDate`'s `label` prop (added this round) lets the same component render both "Start date"
  and "401k enrollment date" with distinct accessible names.
- **Tax Rates page is a deliberately narrower sentence than the real Step4** — by explicit
  instruction, not an oversight: just "I officially file `[filing status]`, living in the state of
  `[state]`." (`filingStatus` + `userState`, the same two fields `isTaxRatesValid()` mirrors from
  `STEP_DEFS id 4`'s `isValid` — `d.fedRateLow > 0 && d.userState != null`), with a single
  "Recalculate Using Paystub" button as the last thing to fade in, once both selectors are answered
  (`formData.filingStatus && formData.userState`). Real Step4's second path to a valid rate — "Use
  Estimate for Now" — and its DHL Missouri preset button are both intentionally left off this page;
  only the paystub path is ad-libbed. Clicking the button reveals a small paystub calculator (one
  box for a fixed schedule, two — "Shorter"/"Longer Week Paystub" — for `scheduleIsVariable`, same
  as real `PaystubCalc`) with its own plain labeled number inputs (`CalcField`, not sentence blanks
  like `InlineNumber` — this is a utility calculator, not mad-libs prose) for gross pay and
  fed/state withheld; `dr()` (withheld ÷ gross, mirrors `PaystubCalc`'s own helper exactly) derives
  the rate live under each box, and "Apply These Rates" (shown once the first box's fed rate is
  computable) writes `fedRateLow`/`stateRateLow`/`fedRateHigh`/`stateRateHigh`/
  `taxRatesEstimated: false` and collapses the calculator — satisfying `isTaxRatesValid` the same
  way the real wizard's paystub path does. State Withheld is hidden for a no-income-tax state
  (`STATE_TAX_TABLE[userState]?.model === "NONE"`), matching real Step4/`PaystubCalc`'s `isNoTax`
  gate.
- **Wrap Up page has no required fields at all** — `isWrapUpValid()` mirrors `STEP_DEFS id 7`'s
  `isValid: () => true` exactly, matching real Wrap Up's own nature as a live summary, not a form.
  Renders the same authoritative `estimateWeeklyNet(formData)` breakdown (Gross Pay, Federal/State
  Tax, FICA, 401(k), Benefits, Other Deduct., Net, all scaled to the pay schedule's per-check basis
  via `PAYCHECKS_PER_YEAR`) real `StepWrapUp` shows — never a parallel approximation, per
  `docs/active-systems.md` §6's grounding rule. Paycheck Buffer is the one interactive piece,
  ad-libbed as an inline sentence ("I `[want/don't want]` a paycheck buffer of $`[amount]` per
  check") writing the same `freedomAllowanceEnabled`/`freedomAllowance` fields as real Step7 (`?? true`
  default display, matching — not writing — until touched, and the same $200 cap real `BUFFER_MAX`
  enforces). The Tax-Exempt Week Projections opt-in gate is scoped out (v1 — it doesn't gate
  `isValid` either, on this page or the real one, so omitting it can't break required-field
  parity), as is the `structure_change`-only diff section (this component has no life-event re-entry
  concept at all — it's first-run only).
- **This is now the entire first-run flow, so the hand-off boundary changes shape for an employed
  user.** For the jobless mini-flow, Back at the real `SetupWizard`'s first handed-off step (id 10)
  still returns to this component exactly as before. But an employed user's `onHandoff` now passes
  `initialStepId: null` — Wrap Up was the real wizard's last step too, so there is no real step left
  to hand off to at all, and `App.jsx`'s `onHandoff` callback returns immediately without ever
  setting `adlibHandoff`/mounting `SetupWizard`, so `onBackBeforeStart`'s whole mechanism is now only
  reachable via the jobless path. `App.jsx` wires the jobless case to reopen `SetupWizardAdlib` via
  its `resumeFormData` prop, which skips `BLANK_PAY_FIELDS` and seeds `formData` directly from the
  in-progress answers, resuming on the last page (Wrap Up for an employed resume, since resuming
  always lands on `pages.length - 1` regardless of that page's own validity — Wrap Up has none to
  satisfy anyway) — a real resume, not a restart. `adlibResumeData` (`App.jsx`) is cleared on both
  Cancel and a fresh forward hand-off, so a deliberate new investor first-run always starts
  blank again.

---

## Employer Preset Naming Convention

**Adopted 2026-04-29.** DHL is the first employer preset; the pattern generalizes to future partners (Amazon, FedEx, etc.).

| Variable | Meaning | Derived from |
|----------|---------|--------------|
| `isEmployerDHL` | User has the DHL employer preset | `config.employerPreset === "DHL"` |
| `isBaseUser` | User has no employer preset | `!isEmployerDHL` (currently; more precisely `!config.employerPreset`) |
| `isEmployerAmazon` | (future) User has Amazon preset | `config.employerPreset === "AMAZON"` |

**Rules:**
- Every component/function that gates on employer type must declare `const isEmployerDHL = config.employerPreset === "DHL"` locally (or receive it as a prop).
- Every component that gates base-user behavior must also declare `const isBaseUser = !isEmployerDHL` immediately after.
- Prop names follow the same pattern: `isEmployerDHL={isEmployerDHL}` (not `isDHL`).
- The Supabase column was renamed from `is_dhl` → `is_employer_dhl` via migration `014_rename_is_dhl_to_is_employer_dhl.sql`. In JS, `loadUserData()` maps it to the `isEmployerDHL` property.
- Source-code comments say "base user" (not "non-DHL"). Doc files use whatever phrasing is clearest.

---

## UI Component Standards

### Shared Primitives (`src/components/ui.jsx`)
| Export | What it is | Key props |
|--------|-----------|-----------|
| `MetricCard` / `Card` | Static + interactive metric card | `label`, `val`, `sub`, `status` (`green\|teal\|red`), `onClick`, `rawVal`, `entranceIndex`, `span` |
| `NT` | Nav tab | `label`, `active`, `onClick` — teal fill when active |
| `VT` | View tab | Same as NT, smaller padding |
| `SmBtn` | Inline utility button | `children`, `onClick`, `c`, `bg` |
| `SH` | Section header | `children`, `color`, `right` — teal left-bar + uppercase |
| `iS` | Input style object | Spread onto `<input>` / `<select>` — JetBrains Mono, 16px |
| `lS` | Label style object | Spread onto `<label>` — 10px, 2px tracking, uppercase |

**Layout:** card gap `12px` · section `marginBottom` `20px` · card pad `18px 16px` (static) / `16px 18px` + `minHeight: 88px` (interactive).

**Button pattern:** CANCEL — bg-raised, text-secondary, border-subtle, radius 12px, pad 7px 14px, 10px uppercase. SAVE — bg-teal/green, color bg-base, radius 12px, pad 8px 16px, 10px bold uppercase.

### Numeric Input Standard
**Never coerce on `onChange`.** Use string draft state (`field ?? ""`); only `parseFloat` at commit (blur/save). For required fields, pass `attempted` bool — show red label + border + `↑ Required` when `attempted && fieldEmpty`. Reference implementation: `Field` + `errBorder` in SetupWizard.

### Animation Rules
- Entrance stagger: `entranceIndex` on MetricCard → `fadeSlideUp` 400ms, 80ms/card, capped 400ms
- Countup: `rawVal` → 0→target 1200ms on mount/change · value flash → teal 150ms, fades 600ms
- **No bounce, no spin, no scale-up on mount. Press = `scale(0.97)` only. All ≤ 500ms except countup.**

---

## UI Design System — Color Tokens (`src/index.css` `@theme`)
**Never use raw hex for accent, green, or red. Always reference tokens.**

| Token | Value | Role |
|-------|-------|------|
| `--color-bg-base` | `#05100c` | App shell background |
| `--color-bg-surface` | `#112c1f` | Card background |
| `--color-bg-raised` | `#163828` | Elevated surfaces, button hover |
| `--color-bg-gradient` | `linear-gradient(180deg, #091a11, #05100c)` | Header gradient |
| `--color-teal` / `--color-accent-primary` | `#00c896` | Active tabs, CTAs, section bars |
| `--color-green` | `#22c55e` | Income values, positive status |
| `--color-red` | `#ef4444` | Spend, negative, risk |
| `--color-deduction` | `#f4a4a4` | Soft deduction rows — same H=0° hue as `--color-red`, lightness ~80%; not harsh on dark. Candidate to replace `--color-red` in low-emphasis negative contexts. |
| `--color-warning` | `#f59e0b` | Warning / attention |
| `--color-text-primary` | `#e6f4ef` | Body text |
| `--color-text-secondary` | `#7fa39a` | Labels, sublabels |
| `--color-text-disabled` | `#4a645c` | Inactive / disabled |
| `--color-border-subtle` | `#1f3b31` | Card borders |
| `--color-border-accent` | `rgba(0,200,150,0.28)` | Accent borders |
| `--font-display` | `'Titillium Web'` | All headings (h1–h6), page/section titles, hero/headline text, large numeric emphasis on metric cards |
| `--font-sans` | `'Rajdhani'` | Everything else — body copy, nav links, labels, ALL interactive components (buttons, links-as-buttons, tabs, toggles, badges, chips), and ALL form inputs/selects/textareas |
| `--font-mono` | `'JetBrains Mono'` | Read-only numeric/data display only — data table cells, computed-value readouts (tabular-figure alignment). No longer used on any form field. |

**Typography — two-font system (adopted 2026-08-09).** Titillium Web (400/600/700/900) is the
display/headline font; Rajdhani (400/500/600/700) is the body/interactive font. Both load via
Google Fonts `<link>` in `index.html` (same pattern as the pre-existing JetBrains Mono load).
Never hardcode a font-family — always reference `var(--font-display)` / `var(--font-sans)` /
`var(--font-mono)`. **2026-08-10:** all inputs/selects/textareas (global CSS rule, shared `iS`
style in `ui.jsx`, and every component-local `inputStyle` object) moved from `--font-mono` to
`--font-sans` — mono is now reserved for read-only data display (data tables, computed-value
readouts), never form fields.

**Header weight/spacing (2026-08-10, ported from the main site).** Heavy weight + negative
letter-spacing + tight line-height reads as cramped. Two tiers, both in `src/index.css` and
`ui.jsx`'s `PanelHero`/`SectionHeader`: hero/primary headings are `font-weight: 900`,
`letter-spacing: 0.04em`, `line-height: 1.15`; secondary page headers are `font-weight: 800`,
`letter-spacing: 0.02em`, `line-height: 1.15`. Letter-spacing is em-based so it scales with
font-size. `.heading-xl`/`.heading-lg` utility classes added to `src/index.css` for parity with
the site (unused here — A:Fin headers are inline styles or the `PanelHero`/`SectionHeader`
components, not a class system). Does **not** apply to numeric emphasis (MetricCard values,
dollar totals) — those are data display, not headline text, and kept their existing styling.
See `docs/authority-design-system`'s Typography section for the full file list touched.

**Body-text size scale (2026-08-10).** Non-numeric text (labels, sublabels, descriptions, list
summaries) should use one of `src/index.css`'s five `text-*` classes instead of a hardcoded
inline `fontSize`: `.text-2xs` 10px, `.text-xs` 11px, `.text-sm` 12px, `.text-base` 13px,
`.text-md` 14px (the two smallest are +1px over their old raw values — small body copy read
cramped after the Rajdhani switch). Numeric emphasis is out of scope. All of `ui.jsx`'s shared
primitives (`Card`/`MetricCard`, `SH`, `PanelHero`, `SectionHeader`, `NT`, `VT`, `SmBtn`, `lS`,
`InsightRow`) are migrated; individual panels still carry their own unmigrated one-off
`fontSize` literals — future text-sizing work in a panel should convert what it touches to
these classes rather than adding another raw px value.

**Status:** `green` = positive/ahead · `teal` = attention/mixed · `red` = risk/behind

**Pulse tokens (Phase 2 — not in index.css):** `--color-signal-blue` `#5B8CFF` · `--color-signal-purple` `#7C5CFF` · `--color-signal-glow` `rgba(124,92,255,0.25)` — reserved for AI insight overlay, do not use on Flow elements.

---

## Persistence — Eager Save Pattern
**Every new Save/Confirm/Add/Delete action must call an eager save, not rely solely on the debounce.** `App.jsx` also runs a background debounced autosave (800ms after any `config`/`expenses`/`goals`/`logs`/`weekConfirmations` change) — that's fine for continuous edits (typing, live sliders), but a discrete "I'm done with this action" gesture that only relies on it can lose the change if the tab gets backgrounded/reclaimed before the debounce fires (mobile Safari does this aggressively). This caused real data loss in production (setup wizard, weekly check-ins, tax-plan toggles, goals/expenses/log entries) before every action below was audited and fixed — don't reintroduce the gap in new code.

**The rule:** any handler for a button whose label is essentially "Save," "Confirm," "Add," "Delete," or a per-item toggle (not a live-typing field) must compute the new value *synchronously* and pass that same value to both the local `setState` and the matching eager-save callback — never rely on a bare `setState(prev => ...)` alone for one of these.

| Field | Eager-save callback | Defined in |
|-------|---------------------|------------|
| `config` | `saveConfigNow(newConfig)` | `App.jsx`, threaded to `ProfilePanel`/`IncomePanel`/`LogPanel`/`HomePanel` |
| `goals` | `onSaveGoalsNow(newGoals)` | `App.jsx`, threaded to `HomePanel` |
| `expenses` | `onSaveExpensesNow(newExpenses)` | `App.jsx`, threaded to `BudgetPanel` |
| `logs` | `onSaveLogsNow(newLogs)` | `App.jsx`, threaded to `LogPanel` |
| `ptoGoal` | `onSavePtoGoalNow(newPtoGoal)` | `App.jsx`, threaded to `LogPanel` |

All five are thin wrappers over `savePersistedStateNow(overrides, historySource)` (`App.jsx`) — the general eager-save primitive: cancels the pending debounce, merges `overrides` onto the latest known full state, writes immediately, retries once on failure, and surfaces `SaveFailedBanner` (with the real Supabase error text) if the retry also fails.

**Pattern:**
```js
const handleSave = () => {
  const next = { ...currentValue, ...patch };   // or newArray.map/filter/concat — computed, not a functional updater
  setTheState(next);
  onSaveXNow?.(next);
};
```
For a value only reachable inside a `setState` updater (e.g. a handler delayed via `setTimeout`, where the outer closure's value could be stale by the time it fires), capture the computed result *through* the updater instead of bypassing it:
```js
let next;
setTheState(prev => { next = /* derive from prev */; return next; });
onSaveXNow?.(next);
```
For a file with many call sites mutating the same field (see `BudgetPanel.jsx`'s `applyExpenseUpdate`), wrap `setState` once in a helper that captures and eager-saves the updater's result, then convert each call site by renaming the outer function call only — don't hand-transcribe complex per-item transformation logic.

**Do NOT** add eager save to:
- Plain text/number input `onChange` — stays on the debounce, that's what it's for.
- Continuous/high-frequency events (`dragover`, live drag preview) — verify a reorder handler fires once on drop/dragend before wiring it up, not on every pointer move, or it'll fire a network write per pixel.
- `useEffect`-driven derived-state sync (e.g. auto-recalculating a goal's projected due date whenever the timeline changes) — that's recomputed automatically from other data on every relevant render, not a user action; if a write is ever lost it just recomputes the same correct value again next load.

**readOnly gate:** `HomePanel`/`BudgetPanel` shadow their setters (and now their eager-save callbacks) with no-ops when `readOnly` (paywall-expired) is true — see the `noop` pattern near the top of each. Any new eager-save prop threaded into a component with this gate must be shadowed the same way, or a read-only account could bypass the paywall via the eager-save path even though the local `setState` is a no-op.

**Encryption at rest:** no persisted field has field-level encryption today — protection is TLS + RLS only (migration 019). That's fine for everything currently collected, but a future field carrying regulated/high-sensitivity data (SSN, DOB, bank/routing, government ID) must NOT just ride the ordinary four-site persisted-field procedure — see `docs/drift-app-warden.md` §3 F120 for the required trigger check, and `docs/TODO.md` §11 (Data Encryption) for the open tracking item.

---

## Drift App Warden — MANDATORY drift check before believing a change is done

**`docs/drift-app-warden.md`** is the app's drift ledger: for every critical formula,
function, pattern, and AI-context point it answers *"I am changing X — what Y must I check
before X counts as done?"* It exists because the app's dominant failure mode is no longer
locally-wrong code but **drift** — a locally-correct change that silently invalidates a
distant system (six documented real incidents are catalogued there as case law: parallel
formulas, retroactive recompute, lost saves, gate bypass, stale docs, and a React-Compiler
miscompilation invisible to the entire test suite — §12.4).

- **Before changing** anything under a mapped section (Setup Wizard, the 5 panels —
  Home, Income, Budget, Log, Account — Auth, Login, Paywall, UI-UX, or the shared
  spines — fiscal math, persistence, entitlements, AI context, design system, admin
  toolkit), read that section's drift trigger map and run its checks. State in the commit/PR which entries were consulted; "none applicable" is valid,
  silence is not.
- **Two categories, one fork:** every mapped item is either **LEDGER** (L — computes/stores
  truth; drift = silently wrong numbers; hunt via cross-check against the single
  source-of-truth function) or **GATEWAY** (G — routes/gates/presents; drift = wrong
  surface for the wrong tier/mode; hunt via walking the full gate matrix).
- **Keep it current in the same PR** — a stale drift-map entry certifies a false checklist,
  which is worse than none. `active-systems.md` describes what exists; the warden doc maps
  what breaks what — never duplicate between them.
- This document is the foundation for a future **Drift Warden AI agent** that will be
  mandatory for all development-team changes — write entries machine-actionable (named
  triggers, named blast radii, executable procedures), never as prose warnings.

---

## Development Workflow
**30-min sprints, 4×/week.** Before: state the task clearly. After: commit + one-sentence summary.
- `docs/active-systems.md` — how every live system works. **Working on Coach/AI context?** Read
  §6 first — it documents the grounding pattern (every context field must resolve through the
  same authoritative function the UI itself uses, e.g. `computeGoalTimeline()`,
  `getEffectiveAmountForMonth()` — never a parallel approximation) that live testing had to
  rediscover through several real bugs. Skipping it reintroduces those bugs.
- `docs/TODO.md` — prioritized backlog (open items only)
- `docs/past-TODO-tasks.md` — completed work log (one-liner per shipped item, for historical context)
- `docs/account-reference.json` — Anthony's primary account ground truth

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
e.g. "DHL employees only," same SECURITY DEFINER pattern as `is_tracked_beta_tester`) exist —
**the next real migration is 041.** Verify against the folder before numbering;
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

---

## Account Reference (`docs/account-reference.json`)
Three tiers: `db_record` (raw Supabase columns) → `computed_expectations` (what finance.js derives) → `ui_assertions` (what each panel displays). Derive `computed_expectations` from `db_record` — never fabricate. Update `last_updated` whenever config or account data changes.

---

## Testing
Runner: **Vitest**. Tests in `src/test/`. `vitest.config.js` is sandbox-safe — omits `@tailwindcss/vite`, `@rolldown/plugin-babel`, CSS processing (avoids native `.node` failures in CI).
```bash
npm run test:run      # single pass — use this to verify changes
npm test              # watch mode
npx vitest run -u     # update snapshots after DEFAULT_CONFIG changes
```
Reporter is `verbose` — Vitest 4's default misreports suite failures as "no tests." Do not use `-- --runInBand` (Jest flag, ignored by Vitest).

**Blind spot: omitting `@rolldown/plugin-babel` means Vitest never exercises the React
Compiler** — a real production-only miscompilation (drift-app-warden §12.4) crashed 3 admin
panels on their first render with zero test failures. A `useState`-heavy component whose
`cancelEdit`/`handleSave`-shaped handlers close over a shared `draft` object is the known
trigger; the fix is `"use no memo";` as the component's first statement (see
`ChangelogAdminDetail`/`BetaContentAdminDetail`/`BetaScoresAdminDetail` in
`ProfilePanel.jsx`) plus wrapping its render site in `AdminDetailErrorBoundary` — the app has
no top-level error boundary, so an uncaught render crash anywhere blanks the whole page.
`npm run test:run` passing is **not sufficient evidence** this class of bug is absent; a real
`vite build` + browser render is the only way to catch it.

---

## Environment Variables
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...       # server-side only — api/coach.js (§2.G Coach infra)
ANTHROPIC_API_KEY_TEST=...  # optional — preview/dev builds use this if set, same MODE
                            # split pattern as STRIPE_SECRET_KEY_TEST in _stripeClient.js
```

## Naming Conventions
Files: kebab-case · Components: PascalCase · Utilities/hooks: camelCase · Database: snake_case

---

## Account Tiers

Three flags on `user_data`:

| Flag | Unlocks | Set via |
|------|---------|---------|
| `is_admin` | Full Admin Toolkit + AI features + Tax Plan + bypasses paywall | Manual SQL |
| `is_tester` | AI features + Tax Plan + bypasses paywall | Manual SQL; auto-seeds 6-month trial on false→true |
| `is_investor` | Demo Account Tree + investor signup path + AI features + bypasses paywall | `createInvestorAccount()` |

All three bypass the paid wall — none should ever need a real subscription. See `docs/active-systems.md` §2 & §9 for full detail on Investor, Demo Accounts, and Beta Testers.

---

## Admin Diagnostic Toolkit

Full reference: `docs/admin-toolkit-reference.md`. **Gate:** `isAdmin` unlocks 9 Phase 1 tools (Lock Date, Reopen Check-In, Force Sync, Config View, DB Viewer, Tax Grid, Live Inspector, Week Inspector, Beta Report); `isOwner` unlocks Phase 2 (not yet built). Diagnostic templates for common issues included in reference file.
