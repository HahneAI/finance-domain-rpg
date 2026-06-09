# TODO — Authority Finance

## 16. Priority Sprint — UX Polish & Cleanup (brain dump 2026-06-07)

*Active priority. Each item below is condensed from a raw brain dump — direction is
simplified but the original intent and constraints are preserved.*

- [ ] **Budget — restructure expense save buttons** — When adding a new expense there are three
  save buttons crammed into one horizontal row. Promote the "this month onward" save (the
  year-forward bill save) to its own **full-width primary button on its own row**. Its label
  should spell out the *currently viewed* month + "onward" (e.g. viewing September → "September+
  Onward"), reactive to whichever month is selected, not the current month. Put the remaining two
  saves — **month only** and **quarter only** — plus the **exit/cancel** button in a secondary
  horizontal row beneath the primary button.

- [ ] **Mobile PWA install tutorial** — Add a hamburger-menu option shown **only in the mobile
  browser** (not the installed PWA) that opens a tutorial teaching users how to install the PWA.
  The iOS flow already exists on our website (user will provide it); reuse that and place the
  button somewhere clean.

- [ ] **Budget — collapsible category sections** — Keep the existing Lifestyle / Needs category
  UI unchanged, but add a dropdown / collapse toggle to each colored category header so each
  expense category section can expand and collapse.

- [ ] **Budget — slim down loan cards** — Loan cards shown in the Needs category are too verbose.
  Remove the bottom-left text block (payments remaining, monthly payment amount, total left —
  including both redundant per-month labels). Leave only the **per-paycheck amount** on the
  budget/expenses view; full detail stays on the dedicated Loans tab.

- [ ] **Net worth health — financial breakthrough tips** — New feature: when net worth is below
  **10% of projected annual income**, surface a "financial breakthrough tips" feature that gently
  flags the downward trend — reassuring that it's okay to live this way but noting it's never good
  for mental health long-term. Brainstorm the right way to integrate/surface it.

- [ ] **Log panel — declutter event cards** — Event cards read like a word dump. Raise **title +
  notes** higher in the text hierarchy; for lost-money events show only a single **minus amount**
  (money lost vs. the year's projection) plus the **event type** and **notes** (if any). Move every
  other number into the existing per-event impact-breakdown dropdown. Goal: fast, subconscious
  glance-ability — understand an event without reading the fine print.

- [ ] **DHL short/long week naming correction** — Fix all references: a short week is officially
  **3 days**, and the following long week in rotation is **4 days** (currently mislabeled as 4 and
  5–6). Remove the parenthetical day-count from short/long week naming everywhere. Any text that
  helps a DHL user know which week they're logging days into should just say "short week" / "long
  week." Note: the custom-schedule feature still uses short/long week logic to pre-select days for
  weekly approval (and to project take-home on charts when no custom schedule is set) — leave that
  behavior intact; this task is **text/naming only**.

- [ ] **Purge grey text** — Replace dark-grey text across the app (especially the Account panel)
  with the standard white/primary text color used elsewhere. General text and labels should not be
  grey — purge grey text coloring.

- [ ] **Verify change email + password** — Make sure users can actually change their email and
  their password. (§8 marks these done — confirm they work end-to-end and fix if not.)

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

*Claude API integration. Contextual to the user's actual financial data — not generic career advice.*

- [ ] **Job Hunt Chat panel** — dedicated sub-view in Job Loss Dashboard; chat interface powered
  by Claude API with a system prompt that includes: current role title, prior income, runway days,
  target income, state/region, and application log summary
- [ ] **Contextual prompt modes:**
  - [ ] "Help me with my resume" — structured resume review with suggestions tied to target roles
  - [ ] "Write a cover letter for [role]" — drafts from stored job title, experience summary, and
    target application details
  - [ ] "Prep me for [company] interview" — role-specific Q&A based on company + job title
  - [ ] "Salary negotiation coaching" — uses prior income + target income + runway as context
  - [ ] "How long can I be selective?" — runway-aware guidance on how long to hold out for the
    right offer vs. needing to take something quickly
- [ ] **Financial context injection** — every chat session receives a condensed financial snapshot
  (runway, burn rate, target net, current week) so advice is grounded in real numbers
- [ ] **Prompt caching** — use Anthropic SDK prompt caching on the financial context block to
  reduce token cost across a conversation session

---

### F. Future — Job Board API Integrations *(Phase 4)*

- [ ] **Job search integration** — in-app job listing browser; sources TBD (Indeed/LinkedIn/
  ZipRecruiter APIs or aggregator); pre-seeded search from stored job title + `config.userState`
- [ ] **Salary filter by target** — filter listings by salary range anchored to target income goal
- [ ] **One-click application tracking** — "Save to tracker" button on any listing → auto-creates
  an entry in the Re-employment Tracker (C6) with company, role, and date pre-filled
- [ ] **Application assistant** — for saved listings, "Draft application" launches the AI
  assistant (E) pre-loaded with the specific job description for cover letter / prep mode
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

- [ ] **Persist `startedUnemployed` to Supabase** — currently lives in the JSON `config`
  column via the standard merge path, but is not wired into `loadUserData` / `saveUserData`
  explicitly; confirm it round-trips on reload and add an explicit projection if it doesn't
- [ ] **Wizard routing** — when `startedUnemployed === true`:
  - [ ] Skip Step 1 (Pay Structure), Step 2 (Schedule), Step 3 (Deductions), Step 4 (Tax Rates)
  - [ ] Route directly into a new "Jobless Setup" mini-flow (H2)
- [ ] **Re-entry guard** — `startedUnemployed === true` users who later run Life Events get
  full access to the structure_change wizard; that's how they first fill in pay-structure
  fields when they exit Job Loss Mode (see H4)

#### H2. Jobless Setup mini-flow

*Reuses the §15.C2 question set so the modal and the wizard branch ask the same things.*

- [ ] **Step 0a — Confirm unemployment benefits Y/N** — same UI as the JobLossEntry modal
- [ ] **Step 0b — If Yes** — weekly amount, duration in weeks, waiting-week toggle
- [ ] **Step 0c — Stand-in `jobLossDate`** — default to today; allow override (e.g. user
  signed up a few weeks after losing the job)
- [ ] **Step 0d — Optional prior pay context** — prior employer name + prior base rate,
  used as the default Target Income in the §15.C6 re-employment tracker
- [ ] **Step 0e — Wrap Up** — confirm and finish

#### H3. Wizard completion path for jobless users

- [ ] **`onComplete` payload** — sets `jobLossMode: true`, `jobLossDate`, and all four
  unemployment fields; marks `setupComplete: true`
- [ ] **Land on Job Loss Dashboard** — first paint after wizard close goes to the Job
  Loss Dashboard view (§15.C4) rather than the standard home; the dashboard is the home
  for as long as `jobLossMode` is true
- [ ] **Skip default Food expense seeding** — adding the $400/mo Food default during
  jobless onboarding muddies the runway picture; defer expense seeding to the user's
  first triage pass (§15.C3)

#### H4. "Back to Work" exit for users who started jobless

- [ ] **First-time pay-structure wizard** — Back to Work for users who started jobless runs
  the FULL pay-structure wizard (steps 1–4 + Wrap Up) since they never filled it in
- [ ] **Diff view degrades gracefully** — the §15.B structure_change "What's Changing"
  diff renders an empty-state message when there's no prior config to compare against
- [ ] **Clear `startedUnemployed` on success** — once they're employed, the flag is reset
  so future Life Events flows behave normally

#### H5. App shell signals

- [ ] **Banner copy** — when `jobLossMode && startedUnemployed`, the Job Loss banner reads
  "Started in Job Loss Mode — no prior pay history" instead of the date-anchored phrasing,
  so the entry context is unambiguous on reload
- [ ] **"Set up essential expenses" prompt** — first-paint Job Loss Dashboard tile that
  routes the user into the triage list (§15.C3) so they can populate it before they need it

---

### I. Admin Toolkit updates for §15 work

*Most §15 fields land in the `config` JSON column or on the expense rows, so the existing
admin tools surface them automatically (Config Raw View dumps the whole config; DB Row
Viewer shows the expenses array). A few targeted upgrades make the new state legible
without forcing the reviewer to grep through JSON.*

- [ ] **Live State Inspector — Job Loss Mode pill**
  - [ ] Amber pill in the bottom-right Live card when `config.jobLossMode === true`
  - [ ] Add three values: `jobLossDate`, `unemploymentWeekly`, `unemploymentRemainingWeeks`
    (computed: durationWeeks − weeks elapsed since jobLossDate − waiting-week offset)
- [ ] **Week Inspector — unemployment income row**
  - [ ] When `w.unemploymentIncome > 0`, show a "Unemployment" line in the Pay section
    alongside Gross / Taxable / Net so reviewers can see the non-taxed line directly
  - [ ] When `inJobLoss && w.unemploymentIncome === 0`, surface a small grey note:
    "Job Loss Mode — outside benefit window" (catches waiting-week and post-expiration weeks)
- [ ] **DB Row Viewer — expense triage summary**
  - [ ] One-liner above the expenses dump: "Triage: X active · Y paused · Z cancelled"
    (count derived from `jobLossStatus`, missing = active)
  - [ ] Flag any expense where `autoReactivateOnIncome === false` so the reviewer knows it
    will stay paused on Back to Work
- [ ] **Config Raw View — Life Events header**
  - [ ] Add a short header above the JSON dump listing only the §15-relevant fields with
    values: `startedUnemployed`, `jobLossMode`, `jobLossDate`, `unemploymentEnabled`,
    `unemploymentWeekly`, `unemploymentDurationWeeks`, `unemploymentWaitingWeek`
  - [ ] Lets a reviewer assess Job Loss state in one read without scrolling the full config
- [ ] **CLAUDE.md update**
  - [ ] Append the new field surface to the "Diagnostic request templates" section so
    future sessions know to ask for Job Loss state when the complaint is runway-related
  - [ ] Document the per-week `unemploymentIncome` annotation on the buildYear output so
    consumers know the engine emits a non-taxed income line

---

### J. Visual Testing Checklist — foundation phase (§15.A–C5 + H seed)

*Manual smoke pass covering everything shipped on the
`claude/startup-foundation-phase-one-A6957` branch. Run through before
merging or before declaring the foundation phase done. Mark items as
they pass; failures become bugs to file.*

#### Entry points
- [ ] Open the **Life Events** trigger from the desktop sidebar — modal opens with three
  tiles: Pay Structure Changed, Lost My Job, Quick Rate Update (Coming Soon, disabled)
- [ ] Same modal opens from the mobile drawer's Life Events button
- [ ] Backdrop click and Escape both close the modal

#### Setup wizard seed (§15.H)
- [ ] Fresh first-run wizard: Step 0 shows **"Are you currently unemployed?"** Y/N pills
  above the welcome copy
- [ ] Next is disabled until you tap Yes or No; both answers continue to the DHL question
  (no flow change)
- [ ] Re-entry flows (Pay Structure Changed, etc.) skip the Y/N question entirely

#### Pay Structure Changed wizard (§15.B)
- [ ] Tile opens the wizard in `structure_change` mode — Step 0 shows the brief overview,
  not the picker
- [ ] All wizard fields pre-fill from your existing config
- [ ] Toggling DHL ↔ Base in Step 1 surfaces an accent callout explaining preset defaults
- [ ] Wrap Up shows the **"What's Changing"** diff card listing each changed field as
  `before → after` (or empty-state copy if nothing changed)
- [ ] Final button reads **"Confirm Changes"** instead of "Finish"
- [ ] Goals, expenses, and logs are unchanged after completion

#### Job Loss entry (§15.C1 + C2)
- [ ] Lost My Job tile opens the **JobLossEntry** modal (not the wizard)
- [ ] Date picker defaults to today
- [ ] Y/N "Are you getting unemployment benefits?" required to enable Activate
- [ ] Choosing Yes reveals weekly amount, duration weeks, waiting-week toggle
- [ ] Activate flips the engine — projected weekly income drops to $0 from the date
  forward (verify in Income panel)

#### Job Loss banner
- [ ] Amber banner appears at top of every panel when in Job Loss Mode
- [ ] Reads "Projections show $0 earned income from [date] forward"
- [ ] When duration is set, appends "Unemployment runs out on [date]"
- [ ] **Triage Expenses** button opens the triage sheet
- [ ] **Back to Work** clears all job-loss + unemployment fields and launches the
  structure_change wizard
- [ ] Dismiss `×` hides the banner; reload brings it back

#### Job Loss Dashboard runway tile (§15.C4)
- [ ] Renders below the banner, only when in Job Loss Mode
- [ ] Three headline numbers: Runway days, Runway ends date, Weekly burn
- [ ] Runway/cliff color: red ≤ 30 days, amber ≤ 90, green otherwise
- [ ] "Current savings" input updates runway live; entering a value isn't persisted on reload
- [ ] Scenario toggle (With/Without unemployment) shows a side-by-side comparison strip —
  only visible when benefits are configured
- [ ] Footer line shows "N benefit weeks remaining · $X projected total"

#### Expense Triage sheet (§15.C3 + C5)
- [ ] Lists every expense, Essential rows above Flexible (Lifestyle = Flexible amber pill)
- [ ] Three-state Active / Paused / Cancelled toggle per row
- [ ] Pausing a row immediately drops weekly burn on the dashboard tile and weekly spend
  in BudgetPanel
- [ ] "Pause all Flexible (N)" button visible only when ≥1 active Lifestyle row exists
- [ ] "Auto-reactivate when I'm back to work" checkbox appears only on non-active rows
- [ ] Bills due before first unemployment payment land at the very top with red
  **Needs Coverage** badge

#### Bill countdown tiles (§15.C5)
- [ ] Upcoming Bills section in dashboard lists active expenses due within 35 days,
  sorted by days-until
- [ ] Tile color: red ≤ 7 days, gold ≤ 14, neutral past that
- [ ] Needs Coverage badge appears on tiles for bills due before first unemployment payment
- [ ] Pausing/cancelling an expense in triage removes its tile

#### Back to Work exit
- [ ] Back to Work resets the banner, runway tile, and triage filtering
- [ ] Expenses with auto-reactivate=true (default) flip back to Active automatically
- [ ] Expenses where you unchecked auto-reactivate stay Paused/Cancelled
- [ ] Lands in the structure_change wizard pre-filled with prior pay config

---

## 0. Base user Foundation — Priority Sprint

*Source: base user-wizard-audit.md full audit, 2026-04-28. All 12 items are blockers or
direct enablers for a shippable base user user experience.*

---

### [CC] Implementation Work

- [x] **`maxWeeklyHours` engine redesign** — Replace the broken `standardWeeklyHours` /
  `longWeeklyHours` short-long pair with a single ceiling field for base users.
  - [x] Add `maxWeeklyHours` (required) to Step 2 UI for base user path
  - [x] Replace `cfg.standardWeeklyHours` / `cfg.longWeeklyHours` in `buildYear` base user branch (finance.js lines 507, 1068) with `cfg.maxWeeklyHours`
  - [x] Update `estimateWeeklyGross` base user path (line 1311) to use `maxWeeklyHours * baseRate`
  - [x] Remove `scheduleIsVariable` from base user engine branch; retire the two-paystub path in Step 4 for base user (one paystub, one rate set)
  - [x] Add `maxWeeklyHours: null` to `DEFAULT_CONFIG`
  - [x] WeekConfirmModal base user: open 7-day selector (no preset rotation); compare checked days × `shiftHours` against `maxWeeklyHours` ceiling; adjust projection down if under ceiling

- [x] **Step 2 start-date clamp** — `firstActiveIdx` not bounded to fiscal year produces zero
  active weeks and `weeklyIncome = −$50` on fresh base user accounts.
  - [x] Clamp `firstActiveIdx` to `max(0, min(dateToWeekIdx(date), FISCAL_WEEKS_PER_YEAR - 1))` in Step 2 validation or on wizard completion
  - [x] Add an error state / helper text when the entered date falls outside the current fiscal year

- [x] **PTO for base user** — No PTO question exists anywhere in the wizard for base users.
  - [x] Add PTO subsection to Step 3 (Deductions): Y/N gate → accrual method (per hour / per pay period / lump sum) → accrual rate → current balance → cap
  - [x] Migrate `PTO_RATE = 19.65` from module-level constant in `config.js` to a per-user config field (`ptoRate`); update all call sites in `finance.js` and `LogPanel`
  - [x] Gate BenefitsPanel PTO section visibility on `config.ptoEnabled` (base user) instead of `isEmployerDHL`

- [x] **Attendance tracker build-out** — Base user users who answer "Yes" to attendance tracking
  have no config fields; `computeBucketModel` is already gated to DHL-only.
  - [x] In Step 3, expand below "Yes" pill: `attendanceWarnThreshold`, `attendanceTerminateThreshold`, `attendanceCurrentBalance`, optional `attendanceIncrement` (default 1)
  - [x] Wire into a simple threshold-status display (current balance vs warn/terminate thresholds) in the relevant panel — no payout math, no tier bonuses
  - [x] Unit label ("points", "hours", "occurrences") is cosmetic and user-supplied

- [x] **Night differential for base user** — `nightDiffRate` is gated behind `isDHL && dhlNightShift`
  in `finance.js`; no wizard field exists for base user workers with a night differential.
  - [x] Add night diff field to Step 1 for base user (conditional on a "Do you receive a night differential?" toggle)
  - [x] Remove `isEmployerDHL` gate from night differential in `finance.js` engine; key off `cfg.nightDiffEnabled` or a non-null `cfg.nightDiffRate` instead

- [x] **PROGRESSIVE state estimate accuracy** — `handleEstimate()` falls back to a hardcoded 5%
  for any state with progressive brackets (CA, OR, NY, MN, NJ, etc.).
  - [x] Add a bracket midpoint lookup per state to `stateTaxTable.js` (a `midpointRate` field on PROGRESSIVE entries)
  - [x] Use `stateConfig.midpointRate ?? 0.05` in `handleEstimate()` so high-rate states start closer to reality

- [x] **Filing status / standard deduction** — `fedStdDeduction: 15000` is hardcoded; no MFJ
  path exists. MFJ users' tax picture is understated by ~$15k deduction.
  - [x] Add filing status question (Single / MFJ / HOH) to Step 4 or Step 5 onboarding
  - [x] Derive `fedStdDeduction` from filing status: Single → $15,000 · MFJ → $30,000 · HOH → $22,500 (2025 values)
  - [x] Update Tax Picture summary in Step 4 and Sharpen Rates panel to reflect the correct deduction

---

### [CODEX] Rename

- [x] **`otherDeductions[].weeklyAmount` → `perCheckAmount`** — field stores a per-paycheck
  value but is misnamed; math is correct, naming misleads future developers.
  - [x] Rename in `DEFAULT_CONFIG` comment (`config.js` line 65)
  - [x] Rename in `SetupWizard.jsx` (lines 801, 876, 877, 1380)
  - [x] Rename in `finance.js` (line 174)
  - [x] Rename in `finance.test.js` (lines 548, 558, 569, 633)
  - [x] Add backward-compat shim in `db.js`: read `row.weeklyAmount ?? row.perCheckAmount` so existing saved data survives the migration

---

### Deferred / Low Priority

- [x] **"No OT" exempt path** — No "exempt / not applicable" option for salaried-exempt workers.
  Add a "No OT" toggle that sets `otThreshold: null`; update engine to skip OT math when null.
  Workaround: set threshold to 168.

- [x] **`shiftHours` label UX** — "Shift Length (hrs)" in Step 1 doesn't explain it's used for
  event logging, not income calculation. Add one helper line:
  *"Used for shift counting in event logging — income uses total weekly hours set in the next step."*

- [x] **Welcome copy pass** — Step 0 doesn't hint at what to have ready (paystub, OT policy,
  PTO details). Add a brief "have these handy" line for base users before the first step.

- [ ] **`taxExemptOptIn` wire-up** — Stored in config but nothing reads it in `App.jsx` or
  `IncomePanel`. The opt-in gate and disclaimer copy are correct; backend wire-up is deferred
  to Phase 5. No action needed until then.
  > **Note:** Before implementing, bring to an accountant's office for safe-tax feature insights.
  > The mechanics (withholding suspension + catch-up) have tax risk implications that need
  > professional sign-off before we expose them to users.

---

---

## Cross-Reference — Old List Context for New Items

The archived sections below (§1–§14) contain prior work that overlaps with or gives context
for the new §0 priority items. Use these pointers when implementing.

| §0 Priority Item | Old Section with Context |
|---|---|
| `maxWeeklyHours` engine redesign | §4 "Base user schedule expectations" — describes the original `standardWeeklyHours`-based modal pre-fill approach being replaced |
| `maxWeeklyHours` WeekConfirmModal | §4 "Base user schedule expectations" — same; the open 7-day selector supersedes the pre-fill direction described there |
| Step 2 start-date clamp | §4 "Week counter mismatch" — same root cause (`firstActiveIdx` seeding for base user accounts) |
| PTO for base user | §4 "PTO/bucket visibility" — describes the goal of hiding/showing PTO components based on wizard answers; §9 Fiscal Week Features for accrual math already live for DHL |
| Attendance tracker build-out | §4 "PTO/bucket visibility" — same; the yes/no gate and bucket-hide logic described there is the precursor to the threshold-based tracker |
| Night differential for base user | §4 "Step 2 shift differential flow" — describes the desired night/weekend diff UI for base user; the new item is a subset of that spec (night only; weekend diff remains separate) |
| PROGRESSIVE state estimate | §11 Optional Deductions Mapping — filing status and deduction accuracy are related; both improve tax projection fidelity |
| Filing status / standard deduction | §11 Optional Deductions Mapping — the itemized vs standard toggle spec there is downstream of filing status being available |
| `otherDeductions` rename | §6 Benefits & Deductions Pipeline — `otherDeductions[].weeklyAmount` wired into `computeNet()` there; rename must preserve that wiring |
| `taxExemptOptIn` wire-up | §1 "Tax exempt payback withholding" — the withholding-as-expense threading is the backend work that makes the opt-in meaningful |

---

---

> **Archived sections below — parked 2026-04-28 when §0 Base user Foundation became the active sprint.
> Items left open are preserved for context; they are not lost, just queued.**

---

## 1. Goals Funding + Tax Exempt Projection Integrity Sprint (2026-04-03)

- [x] **Funded goal cash absorption audit (no double counting after funding animation)**
  - [x] Trace current "Fund Goal" pipeline end-to-end: click handler → goal state mutation → funded list transfer → aggregate recompute path.
  - [x] Confirm funded amounts are treated as *spent* in all downstream totals: goals surplus section, surplus account, net worth, and annual take-home views.
  - [x] Add explicit guardrail checks so funded goal dollars cannot re-enter available surplus/take-home totals in later weeks.
  - [x] Validate behavior with a reproducible fixture (fund goal mid-year, confirm post-funding totals drop once and stay dropped).

- [x] **Tax exempt payback withholding should behave like a real expense in taxed weeks**
  - [x] Map where extra withholding is currently calculated and where it is displayed across weekly/monthly/year projections.
  - [x] Ensure extra withholding is subtracted from taxed weeks as an expense (not only shown as a tax note), so future planning reflects reduced usable cash.
  - [x] Propagate the same subtraction into forward-looking charts and monthly rollups (future taxed weeks and months).
  - [x] Add consistency checks so weekly table, yearly projection math, and chart datasets all use one shared withholding-adjusted net value.

- [x] **Goal timeline ETA sensitivity bug (expenses change but finish week stays static)**
  - [x] Reproduce with a controlled scenario: increase recurring expenses by ~$150/week and compare goal #2 finish week before/after.
  - [x] Audit timeline inputs to verify the predictor is using live post-expense surplus instead of stale or averaged values.
  - [x] Fix dependency/recompute triggers so editing expenses immediately updates timeline completion weeks.
  - [x] Add regression coverage for at least two deltas (e.g., +$150/week, +$300/week) to ensure ETA moves later when surplus shrinks.

- [x] **Goals card + horizontal timeline UI rework prep (premium liquid-flow direction)**
  - [x] Create a UI spec pass for goals card simplification: remove low-value text blocks and define minimum info hierarchy.
  - [x] Replace current "always full color bar" behavior with true progress-fill rendering tied to computed funding percentage.
  - [x] Evaluate removing goal color picker and standardize goals to one system color unless premium theming requires overrides.
  - [x] Bring the current + future month markers back to the goal fill bar to turn bar back into timelime bar reaching to end of fiscal year, with months that pass dropping off.
  - [x] Prototype "liquid/glass fill" interaction direction for premium mode while preserving readable fallback for standard mode.

*Last updated: 2026-04-04*

## 2. Non-Priority Brand Feature — Food Control Spotlight

- [x] **Brand-first food expense identity (non-priority)** — elevate Food as its own required expense signal so the experience reinforces our core promise: you stay in control of life math, even in everyday categories that feel easy to ignore.
  - [x] Add a dedicated Food expense card with a unique icon and visual emphasis (separate from generic Needs) while keeping it categorized under Needs in calculations.
  - [x] Require a Food expense input in budget setup and default to **$400/month for one person** as the starting value.
  - [x] Keep copy intentionally minimal in the core UI (subconscious visual emphasis over heavy explanation).

- [x] **Fast food buffer toggle (new-user budget trigger, non-priority)**
  - [x] Introduce this option only after a new user first opens the Budget tab (do not surface it earlier in onboarding).
  - [x] Add a dedicated on/off toggle modeled after the paycheck buffer behavior and placement.
  - [x] Use this exact explainer copy:
    - [x] "Similar to the paycheck buffer feature that you can turn on or off in order to match realistic lifestyle numbers when calculating your goals in life every year, we would like to add a fast food buffer to your income math. This buffer will be ignored from your paycheck formulas and specifically when calculating your extra money for goals."
  - [x] Ensure buffer math excludes the configured fast food amount from paycheck-based surplus/goal projections when enabled.


## 3. Desktop Scroll Regression

- [x] **Global scrolling** — desktop scrolling regressed again; investigate the latest global layout/container changes and restore smooth wheel/trackpad scrolling across all tabs.

---

## 4. Base user Experience Sprint

- [x] **Week counter mismatch** — superseded by §0 start-date clamp item. Root cause is the same `firstActiveIdx` seeding issue.
- [x] **Step 2 shift differential flow** — superseded by §0 night differential item (night diff) and future weekend-diff work. The UI direction is preserved in the §0 spec.
  - [x] Ask whether the user has any shift differentials; when “Yes,” animate in a multi-select with “Night” and “Weekend” options.
  - [x] For each selected option, show a rate input plus the necessary timing fields:
    - Night diff: start/end times for the higher rate window.
    - Weekend diff: choose whether weekend pay starts on Friday or Saturday, ends on Sunday or Monday, and specify the clock times for the cutoff.
  - [x] Persist these schedules in Supabase (`user_data`) so non-standard rotations survive across devices.
- [x] **Step 4 paystub alignment** — layout polish; parked behind §0 functional work.
- [x] **Deductions layout** — layout polish; parked behind §0 functional work.
- [x] **Base user schedule expectations** — superseded by §0 `maxWeeklyHours` + open 7-day modal design. The pre-fill approach described here is replaced.
- [x] **Pay frequency selection** — pay frequency is already threaded via `userPaySchedule` from Step 1. Parked.
- [x] **PTO/bucket visibility** — superseded by §0 PTO for base user and §0 Attendance tracker items.

---

## 5. Auth Providers

- [x] **Wire Google OAuth** — end-to-end Google sign-in/sign-up via Supabase OAuth
  - [x] Frontend `signInWithOAuth` call + Google button in `LoginScreen.jsx` — done
  - [x] Supabase Google provider configured (Client ID + Secret set by user in Supabase dashboard) — done
  - [x] Delete account clears OAuth identity — `admin.deleteUser()` in `api/delete-account.js` removes Supabase auth user + all linked OAuth identities (Google); already correct
  - [x] **Whitelist redirect URLs in Supabase Auth** — in Supabase Dashboard › Authentication › URL Configuration › Redirect URLs, add: `http://localhost:5173`, your Vercel production URL, and `https://*.vercel.app` wildcard; without this, OAuth redirect back to the app is blocked in prod (config step, no code change)
  - [x] **Seed `user_data` row on first Google sign-in** — add explicit upsert in App.jsx `onAuthChange` handler when `event === 'SIGNED_IN'` so new OAuth users get a `user_data` row immediately; current path relies on debounced save (works but racy on slow connections)
  - [x] **Sync Google profile metadata on sign-in** — read `user.user_metadata.full_name` and `user_metadata.avatar_url` from the Google auth payload; new migration `005_add_profile_metadata.sql` adds `display_name TEXT` and `avatar_url TEXT` columns to `user_data`; write metadata in the SIGNED_IN handler; surface display name + avatar in ProfilePanel Account view
  - [x] **Link Google OAuth to Anthony's existing email account** — add "Link Google Account" button in ProfilePanel Account sub-view (only shown when user has no Google identity linked); calls `supabase.auth.linkIdentity({ provider: 'google' })` which triggers an OAuth redirect and attaches Google to the existing account without losing data or re-running setup wizard; show currently linked providers (email / Google)
  - [x] **Test sign-up and sign-in flows end-to-end** — new Google account (no existing `user_data`) should hit setup wizard; returning Google user should go straight to dashboard; verify no flash or missing-row errors on first OAuth land
- [x] **LoginScreen layout update** — OAuth button slots + divider in place
- [x] **LoginScreen layout update** — add OAuth buttons below email/password form with a divider ("or continue with"); style per platform guidelines (Apple button must be black/white)


## 6. Benefits ? Deductions Pipeline

The setup wizard collects health, dental, vision, STD, life/AD&D, HSA, FSA premiums and freeform `otherDeductions` into `config`, but **none of them are applied to take-home math**. Only `cfg.ltd` and `k401kEmployee` are deducted in `computeNet()` and `buildYear()`.

- [x] **Wire benefit premiums into `buildYear()` taxable gross** — `healthPremium`, `dentalPremium`, `visionPremium`, `stdWeekly`, `lifePremium` now reduce taxable gross alongside `cfg.ltd` and employee 401k.
  - Audit (2026-03-28): issue confirmed fixed — helper `weeklyBenefitDeductions()` feeds `taxableGross` today.
- [x] **Wire HSA and FSA into `buildYear()` taxable gross** — both pre-tax buckets share the same helper and already reduce taxable income.
  - Audit (2026-03-28): follow-up review confirmed `hsaWeekly`/`fsaWeekly` live in the same deduction pool.
- [x] **Wire `otherDeductions` array into `computeNet()`** — `otherDeductions[].weeklyAmount` now subtracts after-tax in both taxed and untaxed weeks.
  - Audit (2026-03-28): follow-up confirmed computeNet() mirrors the wizard preview subtotal for "Other Deduct."
- [x] **Respect `benefitsStartDate`** — deductions only apply to weeks on/after `config.benefitsStartDate`; earlier weeks keep gross untouched.
  - Audit (2026-03-28): buildYear() now stamps each week with `benefitsDeduction`, and computeNet() honors the per-week amount instead of blindly subtracting benefits.
- [x] **Update wizard preview (Step 7 — Paycheck Buffer)** — Step 7 shows gated benefits (or labels them as "start later") so the preview matches take-home math.


## 7. Setup Wizard Tune

- [x] **End-to-end wizard walkthrough** — run a fresh account through every step; note any confusing copy, broken layout, or missing validation
- [x] **Step copy pass** — trim any remaining multi-sentence helper text to one sentence; ensure every step has a clear "why this matters" hook
- [x] **Mobile layout audit** — every wizard step must scroll cleanly at 390px with no clipped inputs or buttons hidden behind the keyboard
- [x] **Edge case inputs** — test 0 values, very large numbers, and empty fields at each step; verify no NaN, Infinity, or blank values leak into config
- [x] **Re-entry flow** — verify the Life Events re-entry path (lost job, changed jobs, commission) correctly diffs and re-runs only the affected steps


## 8. Profile & Account Management

> Audit run: 2026-03-28

- [x] **Profile screen** — new panel (or Settings tab) showing: display name, email, account created date, subscription status placeholder
  - Audit: **Partially live** (Profile panel + Account view exist, email shown), but display name, account created date, and subscription placeholder are not implemented.
- [x] **Change email** — `supabase.auth.updateUser({ email: newEmail })`; confirmation email flow
  - Audit: **Not live** (no change-email form/action found).
- [x] **Change password** — `supabase.auth.updateUser({ password: newPassword })`; current password confirmation before allowing change
  - Audit: **Partially live** (`updateUser({ password })` exists), but current-password confirmation gate is not implemented.
- [x] **Delete account** — destructive action with "type DELETE to confirm" gate; removes `user_data` row then calls `supabase.auth.admin.deleteUser()` (or a backend route); irreversible warning
  - Audit: **Not live** (no delete-account UI/flow found).
- [x] **Sign out all devices** — `supabase.auth.signOut({ scope: 'global' })`; useful when a device is lost
  - Audit: **Not live** (standard sign-out exists; global scope sign-out not found).


## 9. Post-Auth Roadmap

### Fiscal Week Features

- [x] **Fiscal week awareness** — app knows current week of the fiscal year (Week X of 52); `today` state ticks at midnight and cascades reactively through all panels; `FISCAL_YEAR_START` centralized constant; week badge in header, log, benefits, budget phase all in sync
  - [x] Confirmation of days worked vs. projected schedule each week
  - [x] Goal timeline surplus math — `futureWeekNets[]` (per-week `computeNet()` output, buffer-excluded) feeds `computeGoalTimeline()` directly; flat average no longer used

### Theoretical Tab

- [x] **Theoretical Tab** — new page for quick "what if" income scenarios:
  - [x] Job change / income change
  - [x] Investment return modeling
  - [x] Second job income layering
  - [x] Output: "Here's how everything could hypothetically look if..."

### Calendar Tab

- [x] **Calendar Tab** — visual calendar mapping all expense due dates, loan payment dates, and goal milestones

### Statements Tab

- [x] **Statements Tab** — personal finance statements for download and AI-powered insights:
  - [x] Statement periods: monthly, quarterly, and yearly snapshots generated from live app data
  - [x] Core statement contents:
    - [x] Income summary — gross, net, FICA, 401k contributions + match, event log adjustments
    - [x] Expense breakdown — by category, including loan payoff progress and drops-off that occurred
    - [x] Surplus / deficit — what was actually left after all spend
    - [x] Goals report — which goals were funded, completed, or missed during the period; progress % on in-flight goals
    - [x] Net worth delta — estimated change in financial position over the period
  - [x] Download formats — clean PDF and/or CSV export
  - [x] Statement storage — saved statements persist in Supabase so you can pull up any past period
  - [x] AI insights layer — end-of-period summary generated by Claude: what went well, what missed, spending patterns, goal velocity, and forward recommendations based on trajectory
  - [x] Year-end summary — deeper annual report: full goal reconciliation, total tax picture, 401k growth, biggest expense shifts, and a narrative arc of the fiscal year

---



## 10. Authority OS ? Design System Migration

This section tracks incremental migration from the old "Dark Wealth" gold-based spec to the live Flow shell + future Pulse overlay system. Work is ordered by visual impact and risk.

### Green Alignment

- [x] **`ui.jsx` — fix METRIC_STATUS green.val** — changed from `var(--color-accent-soft)` to `var(--color-green)` (#22C55E)
- [x] **`index.css` — update `--color-gold-bright` flash token** — changed from `#4ade80` to `#33e0b0`
- [x] **Audit foreground use of `--color-accent-soft`** — lime no longer used as any foreground text or value color

### Remaining Rename + Cleanup

- [x] **Finish Authority OS rename** — `index.html` title + PWA label updated, `package.json` name updated, "Life RPG" eyebrow in `LoginScreen.jsx` updated
- [x] **Remove dead Google Fonts load in `index.html`** — DM Serif Display + DM Sans removed; JetBrains Mono only remains

### Pulse Layer (when ready — Phase 2)

- [x] **Add Pulse signal tokens to `index.css`** — `--color-signal-blue: #5B8CFF`, `--color-signal-purple: #7C5CFF`, `--color-signal-glow: rgba(124,92,255,0.25)`
- [x] **Build `InsightRow` component** — trend arrow + delta + label; signal-blue/purple only; always below primary metric; export from `ui.jsx`
- [x] **Feather Pulse signals into metric cards** — `insight` prop on `MetricCard`/`Card`; wired to HomePanel, IncomePanel, BudgetPanel (overview, goals, loans); meaningful-data trigger rule enforced (signals return `undefined` on missing data)

---



## 11. Optional Deductions Mapping (Post-Setup Wizard)

- [x] **Itemized deductions module** — optional advanced setup for users who want more accurate year-end tax projections beyond the standard deduction assumption:
  - [x] Entry point: "Advanced" link shown on the Annual Tax Strategy step of the setup wizard, and accessible anytime from Settings
  - [x] **Above-the-line deductions** (reduce AGI directly):
    - [x] 401k traditional contributions (already tracked in config — auto-pull)
    - [x] HSA contributions (if applicable)
    - [x] Student loan interest paid
    - [x] IRA contributions
  - [x] **Itemized vs. standard toggle** — user selects which filing method they use; app compares their itemized total to the standard deduction and warns if standard is higher
  - [x] **Common itemized deductions** (if user chooses to itemize):
    - [x] Mortgage interest
    - [x] State + local taxes paid (SALT, capped at $10k)
    - [x] Charitable contributions
    - [x] Medical expenses exceeding 7.5% AGI threshold
  - [x] **Output:** revised projected AGI and federal tax liability fed back into the tax gap analysis in IncomePanel; "With your deductions, you're projected to owe X instead of Y"
  - [x] **Persistence:** deductions stored in user config alongside standard fields; wizard standard deduction assumption shown with a badge: "Standard" or "Itemized" indicating which mode is active
  - [x] **Disclaimer:** same tone as tax exempt gate — "This is a planning tool, not tax advice. Your actual liability depends on your full return. A CPA review before filing is always worth it."

---



## 12. Countup Animation Scope (2026-03-31)

- [x] **Countup animation rolled out to all dollar cards** — `rawVal` prop added to every dollar-amount `Card`/`MetricCard` across Income, Budget, Benefits, and Log panels. Previously only HomePanel cards animated.
- [x] **[CC] Scope countup to first tab visit per session only (non-Home tabs)** — currently the 0→target countup fires every time a non-Home tab is mounted (i.e. every tab switch). If this feels like too much motion in practice, gate the animation so it only runs on the *first* visit to each tab within a session. Implementation sketch: track a `Set<panelName>` in App-level state (or a session-scoped ref), pass a `skipCountup` boolean into each panel, and suppress `rawVal` on `Card` if the panel has already been visited this session. Home tab always animates (no gate). The `rawVal` flash-on-change behavior should still fire on data changes regardless of the gate.

---

## 13. Income Weekly Sticky Header

- [x] **Weekly subtab sticky card** — the Income tab’s Weekly view uses a sticky header/table shell that works on desktop, but on iPhone 17 the sticky row detaches ~2 cm before reaching the Dynamic Island and then snaps awkwardly. Rebuild the sticky behavior so the mini chart and column labels pin exactly at the viewport-safe-area boundary and release as expected across Safari/Chrome (test both portrait and landscape).

---

## 14. Mobile Navigation + Income IA + Budget Breakdown/Goals Bridge Discovery Notes (2026-04-03)

- [x] **Navigation: make Goals a first-class destination**
  - [x] Add Goals as a standalone top-level destination in both drawer and bottom navigation.
  - [x] Reduce mobile primary shortcuts to ~5 total destinations.
  - [x] Keep drawer and bottom-nav destinations aligned.

- [x] **Income: simplify IA before downstream budget/goal work**
  - [x] Remove the Income config sub-tab.
  - [x] Move Income configuration controls to Profile/Account settings.
  - [x] Collapse Income monthly/weekly into one unified primary view.

- [x] **Budget: improve breakdown clarity and next-check realism**
  - [x] Add a deductions line item to Breakdown as display-only.
  - [x] Keep deductions display additive only; do not change tax threading or net-calculation logic.
  - [x] Key Breakdown cashflow to next-check cadence instead of flat averages.

- [x] **Goals timeline: tighten per-week completion precision**
  - [x] Add a helper bridge that exposes weekly surplus snapshots for both Breakdown and Goals views.
  - [x] Base completion timing on per-week surplus progression, not annualized fallback-first behavior.
  - [x] Show goal-finish context with both projected horizon and near-term weekly surplus deltas.

---

## 16. Portal Audit — Fixed Overlays Inside the Scroll Container (iOS Safari)

*On mobile, `.main-content` is the scroll container (`overflow-y: auto`). iOS Safari hit-tests
a `position: fixed` element nested inside an `overflow: auto/scroll` ancestor at an offset equal
to that container's `scrollTop` — the overlay paints pinned to the viewport but taps land at the
scrolled-away document position. Buttons (incl. ✕) then need repeated taps or go dead, varying
with scroll position. Fixed so far: expense bottom sheets + restore sheet + drag overlay
(`BudgetPanel.jsx`), all three Income modals (`IncomePanel.jsx`). App-root modals (Tools sheet,
admin modal) are unaffected because they render outside `.main-content`.*

- [ ] **Sweep all panels for un-portaled fixed overlays** — grep each panel component
  (`HomePanel`, `ProfilePanel`, `LogPanel`, `BenefitsPanel`, `WeekConfirmModal`, and any others)
  for `position: "fixed"` modals/sheets/overlays rendered *inside* the panel's JSX tree.
  **Fix pattern (for consistency):** `import { createPortal } from "react-dom"` and wrap the
  overlay block as `createPortal(<…overlay…/>, document.body)` so `position: fixed` resolves
  against the viewport. Keep all styles/markup identical — only the DOM parent changes. Verify
  on real iOS Safari that the ✕/action buttons respond on the first tap regardless of scroll.

## Completed

### Completed Section Summaries

- [x] **Immediate Bug Fixes** ? Cashflow and Goals tabs were audited so their math and layouts stay accurate after the early regressions. Follow-up checks are documented so future releases catch issues faster.
- [x] **Quarterly Phase Refactor** ? All budgeting, finance, and database layers now use four named quarters (Jan?Mar, etc.) with migrations to pad historic data. UI labels and selectors match the new cadence everywhere.
- [x] **Attendance Bucket Model** ? The DHL/P&G attendance engine runs monthly bonus math straight from the event log and shows bucket tiers, payout projections, and safety bands on the dashboard.
- [x] **Setup Wizard** ? The six-step wizard handles first-run and Life Event re-entry with DHL presets, validation, migrations, and tax/benefit previews so config stays consistent.
- [x] **WeekConfirmModal ? Three Holes** ? Swap logging, stricter validation, and accurate pay-period labeling shipped in both layers so real schedule changes are captured without empty events sneaking through.
- [x] **Auth & Multi-User** ? Supabase auth with RLS, login flows, and session persistence now gate the app, keeping Anthony's data isolated while enabling future accounts.

### Multi-User Readiness (2026-03-26)
- [x] Derive App header employer label from `config.employerPreset` — removed hardcoded "DHL / P&G — Jackson MO" from sidebar, mobile header, and drawer
- [x] `nightDiffRate` explicit in wizard Step 15 — writes `1.50` (night) or `0` (morning) on shift toggle alongside `dhlNightShift` bool
- [x] Remove FHA $3,000 hardcoded hint from BenefitsPanel 401k section (Anthony-specific)
- [x] Empty `INITIAL_EXPENSES` / `INITIAL_GOALS` / `INITIAL_LOGS` — removed Anthony's personal data from unauthenticated/error fallback constants
- [x] Add `baseRate`, `diffRate`, `nightDiffRate`, `dhlNightShift` to `DHL_PRESET.defaults` — preset is now self-contained
- [x] Tax schedule tab for DHL users — pending tax research sprint (currently `isAdmin` only)

### Multi-User Readiness Stragglers (2026-03-26)
- [x] **"MO Flat Rate" label in Income config view** — renamed to "State Rate (fallback)"; hidden entirely when `config.userState` is set (field is unused once wizard assigns a state)
- [x] **`PTO_RATE` hardcoded constant removed from runtime** — `calcEventImpact()` and `computeBucketModel()` now use `cfg.baseRate` / `cfg.baseRate / 2` directly; `LogPanel` labels use `config.baseRate`; constant retained in config.js for test assertions only

---

### Event Log Rework

- [x] Pass `futureWeeks` into LogPanel and replace hardcoded `WEEKS_REMAINING = 44` so weekly unallocated and goals impact stay accurate as weeks pass
- [x] Pass live `goals` prop into LogPanel instead of using `INITIAL_GOALS` so "Goals at risk" reflects actual edited goal targets
- [x] Auto-derive `weekIdx` and `weekRotation` from the selected `weekEnd` date by matching against `allWeeks` — remove both manual inputs from the form
- [x] Add inline edit on existing log entries (not just delete) — expands in-card, pre-fills all fields, same conditional form logic as add, one open at a time
- [x] Date-level event selection — pay week dropdown replaces freeform date; 7-day pill picker selects specific days missed within the week; shiftsLost, weekendShifts, and hoursLost all auto-computed from selected days rather than estimated
- [x] New event type: **Missed Work — Unapproved** — distinct from `missed_unpaid`; day picker drives hoursLost (days × shiftHours); feeds gross loss calc AND attendance bucket tracker (`bucketHoursDeducted` in calcEventImpact, aggregated in logTotals)
- [x] **PTO accrual accuracy audit** — verified: 1hr/20 worked ✓; unpaid approved reduces accrual (`hoursLostForPTO = shiftsLost × shiftHours`) ✓; unapproved reduces accrual AND hits bucket ✓; PTO usage does NOT reduce accrual (`hoursLostForPTO = 0` for PTO events) ✓; paternity leave projection in Benefits uses `adjP = ptoBs - logPTOHoursLost / 20` ✓

---

---

---
