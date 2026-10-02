# Setup Wizard — implementation reference

> Moved verbatim out of `.claude/CLAUDE.md` (2026-10-02 cleanup, option A) so the always-loaded file stays
> lean. **Authority order if this text and the drift map disagree:** `drift-app-warden.md` §7 (F-entries are
> dated and cited; the gate matrix §7.3 is definitive) → this file. The bullets on Tax Rates, Deductions
> and Wrap Up below were written before F134/F135/F136/F140 and are marked *(superseded)* where they now
> contradict those entries. Short summary lives in `CLAUDE.md`; per-system overview in `active-systems.md` §9.

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
instead of always step 0. Originally added so `SetupWizardAdlib.jsx` could hand off into the real
wizard's jobless mini-flow (id 10) after its own pilot pages were answered; that hand-off no
longer exists (drift-app-warden §7 F141 — the jobless mini-flow is now three native
`SetupWizardAdlib` pages, `SetupWizard.jsx` is no longer mounted anywhere), so nothing in the app
passes a non-`null` value today. Left in place as generically useful, not removed — a prop with no
current caller, not dead code that needs deleting.

**`SetupWizardAdlib.jsx` — the REAL production first-run onboarding wizard.** A
"fill-in-the-blank" reimagining of the entire first-run, employed-signup flow — all six real
`SetupWizard.jsx` steps — as cascading mad-libs pages (4 employed + 3 jobless; see the page list below) with inline `<select>`/`<input>`
blanks, instead of stacked form fields or a page-per-step flow. Page 1 (`IntakePage`) merges
Welcome + Pay Structure into one continuous sentence; page 2 (`ScheduleTaxPage`) merges Schedule
and Tax Rates onto one page, each under its own small subheader (drift-app-warden §7 F161,
2026-08-27 — both sections were consistently too short on their own, leaving ~650px of empty
viewport below the content on a real device for the thinnest accounts; the merge's combined gate,
`isScheduleTaxValid = isScheduleValid && isTaxRatesValid`, requires both sections' required fields
before Next enables, and Tax Rates now comes before Deductions in answer order since nothing in
Tax Rates reads a deduction field); page 3 (`DeductionsPage`) covers Deductions as its own page
(with a Skip button, mirroring real `STEP_DEFS id 3`'s `skippable: true`); page 4 (`WrapUpPage`)
covers Wrap Up as its own page — all in the same cascading style. `SchedulePage`/`TaxRatesPage`
still exist as their own components (unchanged internally, still each with their own
`isScheduleValid`/`isTaxRatesValid`) — `ScheduleTaxPage` just composes the two.

**Scope: the ENTIRE first-run flow (employed and jobless) plus all four life-event re-entry
strings (2026-08-11, docs/TODO.md §19.2/§19.3, now fully closed).** `App.jsx` mounts
`SetupWizardAdlib` whenever `wizardEntry !== null` — `wizardEntry === false` (first-run,
`lifeEvent={null}`, covering both the employed and jobless paths natively) or `wizardEntry` is a
life-event string (`lifeEvent={wizardEntry}`). `wizardEntry === "structure_change"` is the **only
real entry point** for any life-event re-entry — `LifeEventMenu.jsx`'s three tiles are "Pay
Structure Changed" (→ `structure_change`), "Quit My Job" (→ the unrelated `NewJobSeasonEntry`
modal), and "Rate Update" (→ the unrelated `RateUpdateModal`); there is no menu tile for
`lost_job`/`changed_jobs`/`commission_job` at all. Those three are reachable only through
`SetupWizardAdlib`'s own internal life-event pivot (`IntakePage`'s `LifeEventPivot`, see below)
once a `structure_change` wizard is already open — mirrors real `SetupWizard.jsx`'s own `Step0`
picker, which was always meant to provide this pivot but, until F140, had nowhere reachable to
pivot *to*. **`SetupWizard.jsx` is no longer mounted anywhere in the app** (drift-app-warden §7
F141) — the jobless mini-flow (unemployed at first-run — first-run only, never a life-event path)
that used to hand off into it at `STEP_DEFS` id 10 is now three native `SetupWizardAdlib` pages
(`JoblessBenefitsPage`/`JoblessDetailsPage`/`JoblessWrapUpPage`, ported line-for-line from real
`StepJoblessBenefits`/`StepJoblessDetails`/`StepJoblessWrapUp`), so every path — first-run employed,
first-run jobless, and all four life-event strings — now completes inside this one component with
no hand-off to a second component on any path. `SetupWizard.jsx` itself is retained unchanged,
purely as the source components those three pages were ported from and as `LIFE_EVENTS`/
`DIFF_FIELDS`/`StructureChangeDiff`'s shared export home (see the gate matrix in
`docs/drift-app-warden.md` §7.3 for the definitive per-path map).

**`lifeEvent` prop** (default `null`) mirrors `SetupWizard.jsx`'s own contract:
`null` | `"structure_change"` | `"lost_job"` | `"changed_jobs"` | `"commission_job"` — the prop
itself never changes after mount; it's the wizard's original entry point, used only for
`formData`'s pre-fill-vs-blank init and the jobless-mini-flow gates, both invariant across an
internal pivot. A non-`null` value changes three things from first-run behavior: (1) `formData`
initializes as `{ ...config }` — pre-filled from the real account config, matching real
`SetupWizard.jsx`'s own re-entry init (including its `firstActiveIdx` recompute from `startDate`
on open) — instead of `{ ...config, ...BLANK_PAY_FIELDS }`, which stays first-run-only; (2) the
employment-status question (`IntakePage`'s opening clause, `isIntakeValid`'s first check) is
skipped entirely — `isEmployed` is forced `true` so every pay-structure clause renders
immediately, mirroring real `STEP_DEFS` id 0's own `ev !== null` unconditional-valid shape; a
per-path intro clause replaces the employment-status blank (`"Let's rebuild your pay for the new
job."` for `lost_job`, `"Let's add your commission job to your pay structure."` for
`commission_job`, `"Let's set up your pay for the new job."` for `changed_jobs` — all three new
copy in a matching tone, since none has bespoke Step0 copy on the real wizard to port verbatim;
`structure_change` renders nothing here — its own bespoke intro copy is rendered separately by
`LifeEventPivot`, below); (3) `computeActivePages()` excludes Wrap Up for `lost_job`/
`commission_job` specifically — both commit through `finalizeWizardConfig()` at the end of Tax
Rates instead (real `STEP_DEFS` id 7's `showIf` excludes both paths too); `structure_change`/
`changed_jobs` both keep Wrap Up (computeActivePages' default branch). The jobless single-page
shortcut and hand-off (`onHandoff`) are both explicitly gated on `lifeEvent === null` — a
life-event account can carry a stale `startedUnemployed: true` from a prior first-run jobless
answer without that meaning anything on any re-entry path, since none of the four ask or touch
that field. `commission_job` additionally reveals a Commission Income clause in `IntakePage`
(mirrors real Step1's field, `SetupWizard.jsx:782–809`, exactly — applies to both DHL and base
users, gated on `payStructureComplete`; writes the pre-existing `commissionMonthly` field). All
four re-entry paths are cancelable (`App.jsx` passes a real `onCancel`, unlike first-run's
uncancelable `undefined`). See `docs/drift-app-warden.md` §7 F139/F140 for the full implementation
writeup.

**`LifeEventPivot` — the internal life-event pivot picker (2026-08-11, drift-app-warden §7
F140).** `SetupWizardAdlib` holds its own local `[curLifeEvent, setCurLifeEvent]` state, seeded
from the `lifeEvent` prop (mirrors real `SetupWizard.jsx`'s local `[lifeEvent, setLifeEvent]`
state, seeded from its own `initialLifeEvent` prop). Every downstream gate/page reacts to
`curLifeEvent`, not the immutable `lifeEvent` prop — `computeActivePages(formData,
curLifeEvent)`, `current.isValid(formData, curLifeEvent)`, the `<current.Component
lifeEvent={curLifeEvent} .../>` render prop, and `IntakePage`'s Commission Income gate all key off
it. `LifeEventPivot` (rendered at the very top of `IntakePage`, before its cascading pay-structure
sentence) is only shown when `onLifeEventChange` is passed down at all, which only happens when
the *original* entry was `"structure_change"` (`onLifeEventChange={lifeEvent === "structure_change"
? setCurLifeEvent : null}`) — direct entry as `lost_job`/`commission_job` (still supported,
though nothing sets `wizardEntry` to those directly today) shows no pivot block, matching last
round's behavior exactly. Two branches, both ported from real `SetupWizard.jsx`'s `Step0`
(~line 40–178): while `curLifeEvent === "structure_change"` (not yet pivoted), it shows the real
Step0 `structure_change` intro copy verbatim ("Update your pay structure." + the pre-filled/
goals-stay-put explanation + start-date guidance) plus the "What changed?" picker beneath it
(`LIFE_EVENTS.filter(ev => ev.value !== "structure_change")`, exported from `SetupWizard.jsx`
alongside `DIFF_FIELDS` and `StructureChangeDiff` rather than duplicated — drift-app-warden §7
F7's "must never diverge" rule); once pivoted, only the generic picker remains, with the active
selection highlighted, same as real Step0's own "else" branch. **One deliberate deviation from a
line-for-line Step0 port:** real Step0 returns early for `structure_change` with no picker
rendered at all — the picker only exists on a separate "step" reached once `lifeEvent` has already
changed away from `structure_change` by some other means, which the real wizard never actually
provides (making that whole branch dead code there too). Ad-lib has no separate step to show the
intro on first, so `LifeEventPivot` shows the intro **and** the picker together while still on
`structure_change`, or the pivot would have no reachable entry point at all — see the session
report's judgment-call note. `hasCommission`'s local `useState` lazy initializer only evaluates
once at mount (when `curLifeEvent` was still `"structure_change"`); a `useEffect` re-syncs it on
every `curLifeEvent` change so pivoting into `commission_job` after mount still shows the
Commission field's correct initial toggle state.

**`structure_change`'s Wrap Up diff — `StructureChangeDiff` (2026-08-11, F140).** `WrapUpPage`
gained `lifeEvent`/`originalConfig` props. `SetupWizardAdlib` captures a frozen baseline
(`useState(() => config)` at mount, mirrors real `SetupWizard.jsx`'s `useMemo(() => config, [])`)
and threads it down; `WrapUpPage` renders the shared `StructureChangeDiff` component (imported
from `SetupWizard.jsx`, not duplicated) gated on `curLifeEvent === "structure_change"` — the same
gate real `StepWrapUp` uses. The jobless-started "no prior pay structure to diff" guard
(`originalConfig?.startedUnemployed === true` → a dedicated first-time message instead of a
misleading diff against `DEFAULT_CONFIG` placeholders) comes along for free since it's the exact
same component. `changed_jobs` reaches Wrap Up too (full page set, same as first-run/
`structure_change`) but never shows this diff — correct per the gate matrix, needed zero extra
code since the render gate is already specific to `curLifeEvent === "structure_change"`.

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

- **Seven real pages total, each internally cascading — four employed + three native jobless**
  (was eight/five before Schedule and Tax Rates merged into one page, drift-app-warden §7 F161,
  2026-08-27). `PAGES = [{Component: IntakePage}, {id: "scheduleTax", Component: ScheduleTaxPage},
  {Component: DeductionsPage}, {Component: WrapUpPage}, {Component: JoblessBenefitsPage},
  {Component: JoblessDetailsPage}, {Component: JoblessWrapUpPage}]`, navigated with a page-level
  Next/Back via `StepSlide` (same slide transition the real wizard uses) — but *within* each page,
  clauses still cascade in as plain `formData`-gated conditionals (`isEmployed && (…)`,
  `formData.startDate && (…)`, etc.) that mount the instant their prerequisite answer is given, no
  click required. `computeActivePages(formData, lifeEvent)` picks which subset is active:
  first-run jobless (`lifeEvent === null && startedUnemployed === true`) gets Intake plus the
  three jobless pages only (`[PAGES[0], joblessBenefits, joblessDetails, joblessWrapUp]`), same as
  the real wizard's `isFirstRunJobless` gate skipping STEP_DEFS id 2/3/4/7 in favor of id 10/11/12
  — but natively now, not via a hand-off (F141), and unaffected by the F161 merge since this path
  never reaches Schedule/Deductions/Tax Rates at all. Everyone else gets the four employed pages
  (Intake, Schedule+Tax, Deductions, Wrap Up), minus Wrap Up for `lost_job`/`commission_job`
  (§19.2's gate matrix — now 3 pages for those two paths, down from 4). `JOBLESS_PAGE_IDS` factors
  the three jobless page ids out so `computeActivePages` never repeats the literal list.
  Back is hidden on page 1 (`pageIdx > 0`) and reappears on pages 2–4, returning to the prior page
  with its answers intact — this Back is a real page-level navigation, distinct from undoing an
  earlier answer within the current page (just re-picking that blank directly). The outer
  page-count/resume machinery (`activePages`, `pageIdx`, the header's "N of M" progress display,
  resume-at-last-page via `resumeFormData`) is written generically against `PAGES.length` — adding
  a page requires no changes there, only a new `PAGES` entry and its `isXValid`/`Component` pair.
- **A cascading clause gated on an `InlineNumber` field's value reveals only once that field is
  blurred, not on every keystroke (2026-08-27, drift-app-warden §7 F162).** A partial value
  (typing the "4" of "40") would otherwise satisfy a `> 0` check and reveal the next question
  mid-keystroke — a real reported UX complaint. `InlineNumber` gained an `onCommit` prop (fires on
  blur — works identically on mobile, whether Done/Next on the virtual keyboard or tapping
  elsewhere triggers it); each page with a numeric-gated reveal calls `useCommitTracking(seedFn)`
  (defined right after `InlineNumber`/`InlineDate`) to track which fields have been blurred at
  least once, seeded from any already-valid value present at mount so a pre-filled/resumed field
  never forces an artificial blur-wait. The gate becomes
  `{committed.has("field") && (formData.field ?? 0) > 0 && (<NextClause/>)}`. `InlineSelect`/
  `InlineDate` never needed this — both only fire `onChange` on a genuinely committed value.
  Applied to `SchedulePage`'s `maxWeeklyHours` and `IntakePage`'s `payStructureComplete` (which
  folds `annualSalary`/`baseRate`/`shiftHours` commit-tracking into one shared derivation gating
  four downstream clauses, rather than repeating the check at each call site) — every other
  `InlineNumber` field in the file was audited and found to have no downstream reveal gated on its
  own value, so it was left as plain `formData`-only. See `docs/drift-app-warden.md` §7 F162 for
  the full field-by-field audit.
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
  entirely, mirroring `Step3`'s own `!isEmployerDHL` gate. *(Superseded by F136 — Benefits Start Date, Other Recurring Deductions, Attendance and PTO details were added 2026-08-10.)* Originally scoped out of this page (mirrors none of
  `isDeductionsValid`, so omitting them can't break required-field parity): `benefitsStartDate`, the
  dynamic `otherDeductions` list, and the attendance sub-fields (unit/thresholds/balance/increment)
  — same "v1 scope" precedent as Warehouse's custom-hours question being left off page 1.
  `InlineDate`'s `label` prop (added this round) lets the same component render both "Start date"
  and "401k enrollment date" with distinct accessible names.
- **Tax Rates page is a deliberately narrower sentence than the real Step4** *(partly superseded by F134 — "Use Estimate for Now" and the DHL MO preset were later added; the paystub-calculator description below still holds)* — by explicit
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
- **Wrap Up page has no required fields at all** *(the "scoped out" notes below are superseded by F135 — tax-exempt opt-in added — and F140 — the `structure_change` diff is now shown)* — `isWrapUpValid()` mirrors `STEP_DEFS id 7`'s
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
- **Native jobless mini-flow — `JoblessBenefitsPage`/`JoblessDetailsPage`/`JoblessWrapUpPage`
  (2026-08-11, drift-app-warden §7 F141) — the last remaining hand-off path removed.** Line-for-line
  ports of real `StepJoblessBenefits`/`StepJoblessDetails`/`StepJoblessWrapUp` (`STEP_DEFS` ids
  10/11/12) into this file's cascading mad-libs idiom, with `isJoblessBenefitsValid`/
  `isJoblessDetailsValid`/`isJoblessWrapUpValid` as line-for-line mirrors of those steps'
  `isValid`. `JoblessBenefitsPage`: "I `[am/am not]` getting unemployment benefits," then — if
  "am" — "My weekly benefit is $`[amount]` for `[N]` weeks, `[with/without]` a waiting week"
  (weekly/duration required once "am" is chosen, waiting-week optional, defaults to `true` same
  as the real Pill). `JoblessDetailsPage`: a required "I lost my job on `[date]`" clause plus an
  optional "My prior rate was $`[rate]` an hour" clause computing `targetIncomeAnnual = rate * 40 *
  52` — draft-string input, commit-only-on-parse, same as the real page's own `priorRateDraft`
  local state. `JoblessWrapUpPage`: a read-only recap card (job loss date, unemployment benefits,
  target income goal if set — reuses `WrapUpPage`'s own `calcBoxStyle` treatment rather than new
  CSS) plus closing copy referencing the shared Finish Setup button; `isJoblessWrapUpValid` is
  trivially `() => true`, same as the real page's live-summary nature. The employment-status
  `InlineSelect` on `IntakePage` (`"Are you currently unemployed?"`) now seeds
  `newJobSeasonMode`/`newJobSeasonDate`/`startDate`/`firstActiveIdx` the moment "unemployed" is
  chosen — a line-for-line mirror of real `Step0`'s pill handler that this file's Intake page had
  never actually needed until the jobless pages became reachable natively (previously these fields
  were seeded by the real wizard's own `Step0`, which the old hand-off skipped past entirely by
  jumping straight to id 10 — this was a latent, never-triggered gap in the ad-lib path, caught and
  fixed while adding native completion test coverage for this round). Finish on `JoblessWrapUpPage`
  runs through the exact same shared `finish()` → `finalizeWizardConfig()` → `onComplete()` path
  every other last page in this file already uses — no jobless-specific branch needed, and
  `finalizeWizardConfig()`'s `buildYear()` call already tolerates a config with no pay structure at
  all (drift-app-warden §7 F5's standing invariant, reconfirmed here). **The `onHandoff`
  prop/mechanism, `App.jsx`'s `adlibHandoff`/`adlibResumeData` state, and the `wizardExiting`
  fold-lift-delay state it rode along with are all removed** — nothing calls `onHandoff` with a
  real `initialStepId` anymore (confirmed via full-repo grep before deleting), so `SetupWizard.jsx`
  is no longer mounted by `App.jsx` at all. `closeWizardWithAnimation()` now just calls
  `setWizardEntry(null)` synchronously — the 180ms staged exit it used to run existed only to let
  real `SetupWizard.jsx`'s `isExiting` prop fade the card out, and `SetupWizardAdlib` was never
  wired to any exit-animation prop of its own, so the delay had nothing left to wait for.
  `resumeFormData`/`onBackBeforeStart` stay as generic mid-wizard-resume machinery on both
  components (still exercised by `SetupWizardAdlib.test.jsx`'s employed-resume case) even though no
  current caller feeds them — a prop with no caller today, not dead code needing deletion, per the
  same reasoning `initialStepId` gets above.
