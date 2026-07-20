# Drift App Warden — Authority Finance

**Status:** Foundation pass (hierarchy + doctrine). Per-section drift maps are filled in one
surgical pass at a time — see §6 stubs for what's pending.
**Created:** 2026-07-19 | **Sources cross-referenced:** `docs/active-systems.md` (all 24 systems),
full git commit history (487 commits, co-change analysis below), live export inventory of every
`src/lib/*` module.

---

## 1. Purpose & Mandate

The app has outgrown any one person's working memory. 24 live systems, ~24k lines of source,
five panels sharing one fiscal-math spine, and a paywall/entitlement layer threaded through
everything. At this size, the dominant failure mode is no longer "the new code is wrong" —
it's **drift**: a change that is locally correct but silently invalidates a distant system
that depended on the old behavior.

This document is the app's **drift ledger**. Its job is to answer one question mechanically:

> **"I am changing X. What Y must I check before I'm allowed to believe X is done?"**

Every critical formula, function, pattern, and AI-context point in the app gets an entry here,
organized under a fixed hierarchy (§4), so that a change to any of them resolves to a concrete,
finite checklist of downstream verifications.

**End state:** this document becomes the training foundation and operating manual for a
dedicated **Drift Warden agent** — an AI reviewer that is mandatory for every change the
development team ships. Every entry is therefore written to be *machine-actionable*: named
triggers, named blast radii, named verification procedures. No vibes, no "be careful around
the tax code."

**Standing rule (effective now, before the agent exists):** any PR that touches a file listed
in a section of this doc must state, in the PR description, which drift-map entries it
consulted and what was checked. "None applicable" is a valid answer; silence is not.

### Findings offload — standard process for every drift pass

A drift investigation pass regularly surfaces live code defects, not just documentation
gaps. The division of labor is fixed:

- **This doc keeps the analysis.** Each finding is written up in the owning section's
  Block 4 ("Standing findings"), with an inline ⚠ marker on the affected function's
  Block 1 entry. The write-up stays here permanently — even after the fix ships — because
  it is case law for the Warden.
- **`docs/BUG_FIX_TODO.md` gets the work item.** Every *open* finding is cross-filed
  there as a one-row `DW-n` entry (severity, blast radius, fix shape, pointer back to
  the Block 4 write-up) in the same pass that discovered it — never later, never
  optional. That file is the work queue; this file is the ledger. No analysis is
  duplicated between them.
- **On fix:** the `DW-n` row is closed out in `BUG_FIX_TODO.md`; the Block 4 entry here
  is annotated with the fixing commit and moves from "Standing findings (open)" to the
  section's fixed-precedents list. The ⚠ inline marker is removed.
- **Watch items get `DW-W` rows.** Non-defects worth queue visibility — designed-in
  debt with an owned roadmap entry, or hardening opportunities whose risk is currently
  fenced — go in `BUG_FIX_TODO.md`'s "Not bugs — but could use attention" section with
  `DW-W` numbering, so the defect rows stay unambiguous. Each row states what would
  *promote* it to a real defect.
- Doc-drift findings (D5) are the exception: those are **corrected in the same pass**
  (per the §5 maintenance covenant), not queued.

---

## 2. What Drift Is — Case Law

Drift is not hypothetical here. Every class below has already happened in this repo and is
documented in `docs/active-systems.md` or the commit history. These five incidents are the
canonical examples — each future drift-map entry cites which class it guards against.

| # | Class | Real incident (the precedent) |
|---|-------|-------------------------------|
| D1 | **Parallel-formula drift** — a second implementation of an existing calculation is written instead of reusing the authoritative one; the two answers diverge over time | `coachTriggers.js#estimateRunwayDays` re-derived runway math instead of calling `computeJobLossRunway()`; it doesn't know about `trackDuringJobLoss` or `jobLossCashOnHand` and gives different answers (active-systems §10 known gaps). Same class: aiContext once derived per-expense cost from `billingMeta` instead of `history[]` — off by double digits vs. the UI (§24, fixed 2026-07-16). |
| D2 | **Retroactive-recompute drift** — a "current value" edit silently rewrites already-elapsed history because the consumer applies config uniformly across time | `buildYear()` applies one flat `cfg` to all 52 weeks, so a mid-year pay edit distorts past-week totals and annual tax (§1 known gap); `buildLoanHistory()` has the same root cause (§5). §22's `account_history` captures changes but nothing reads it yet — the drift is *live*, only fenced. |
| D3 | **Save-path drift** — a new mutation handler relies on the 800ms debounce instead of the eager-save pattern; backgrounded mobile tabs lose the write | Caused real production data loss across setup wizard, weekly check-ins, tax-plan toggles, goals/expenses/log entries before the 2026-07-18 audit (`CLAUDE.md` Persistence section). Every new Save/Confirm/Add/Delete since must call `saveXNow(computedValue)` synchronously. |
| D4 | **Gate drift** — a feature surface checks the wrong tier flag, or a new surface forgets a gate entirely, collapsing the deliberate `is_admin` / `is_tester` / `is_investor` separation or the paywall `readOnly` fence | The tier division is explicitly documented as fragile ("never treat one as implying another", CLAUDE.md Account Tiers); the `readOnly` no-op shadow must extend to every *new* eager-save prop or an expired account bypasses the paywall through the eager path (CLAUDE.md readOnly gate). Coach's Job Loss context line shipped wired to a value `App.jsx` never passes — rendering bare `"Job Loss Mode: active"` (§10) — the wiring variant of the same class. |
| D5 | **Doc/spec drift** — the documented behavior and the shipped behavior diverge, so the *next* change is built on a false premise | TODO §15's checkbox state understated what Job Loss Mode had shipped; §21 Monetization was "almost entirely shipped" but absent from active-systems until 2026-07-07; a dead `weeklyIncome*52` fallback in HomePanel survived until §15.H11 diagnosed "This Week's Check" showing a diluted fraction of a real paycheck. |

**The Warden's definition:** drift is any state where two parts of the app (code↔code,
code↔DB, code↔doc, code↔AI-context) hold different beliefs about the same fact.

---

## 3. The Two Drift Categories

Every feature, function, formula, and theme identified in this document is assigned to
**exactly one of two main categories** — no third category will ever be added, and nothing
goes uncategorized. The category tells you *what kind of wrongness* drift produces there,
and therefore *how to hunt it*.

### Category L — LEDGER *(computation · persistence · data truth)*

Anything that **computes, stores, or transforms** money, time, or account state.
The fiscal math spine, expense/goal/loan history, save paths, migrations, entitlement
timestamp math, AI context values.

- **Drift symptom:** a number is silently wrong, or data is silently lost. The UI renders
  confidently; nothing crashes. (Case law: D1, D2, D3.)
- **Hunt method:** *cross-check against the authoritative source.* Every L entry names its
  single source-of-truth function or table. Verification means comparing the changed
  surface's output against that authority (Admin Toolkit tools — Live State Inspector,
  Week Inspector, DB Row drift badge — exist precisely for this), plus the Vitest suite
  in `src/test/`.
- **Cardinal L rule:** one fact, one function. If you need a value a UI panel already
  displays, call the exported function that panel calls (`computeGoalTimeline`,
  `getEffectiveAmountForMonth`, `computeJobLossRunway`, `getEntitlement`, …). Writing a
  local approximation is the D1 pattern and is a drift finding by definition.

### Category G — GATEWAY *(routing · gating · presentation)*

Anything that decides **who sees what, when, and how it looks**. Auth/session flow, tier
flags and entitlement *enforcement points*, app-mode routing (Job Loss Mode, paywall
`readOnly`, admin surfaces), wizard step visibility, nav, design tokens, animation rules,
Liquid Glass purposes.

- **Drift symptom:** the wrong person sees (or is denied) the wrong surface, or a surface
  violates the design system. Visible in principle — but usually only on account tiers,
  app modes, or devices the developer wasn't testing as. (Case law: D4, D5.)
- **Hunt method:** *walk the gate matrix.* Every G entry names the flags/modes that branch
  its behavior. Verification means enumerating the affected cells (base user × DHL ×
  admin × tester × investor × trial/grace/expired × jobLossMode × readOnly) and confirming
  each one still lands where intended — not just the cell you develop in.
- **Cardinal G rule:** every gate exists twice or not at all. Client-side gating is UX;
  the real gate is server/RLS-side (`api/coach.js` re-checks `canAccessAiFeatures`;
  migration 019 locks tier columns to service-role). A new gated surface that only checks
  client-side is a drift finding by definition.

**Why only two:** a reviewer (human or Warden agent) facing a diff needs one immediate fork
in the road — *"does this change what the app believes (L), or what the app shows/allows
(G)?"* — because the two demand opposite verification instincts: L-drift is invisible and
needs numeric cross-checks; G-drift is visible but combinatorial and needs matrix walks.
Most real changes touch both; the drift maps tag each entry so the split is pre-computed.

---

## 4. The Hierarchy

Ten **top-of-hierarchy sections** — the surfaces where changes land and drift is felt — plus
six **shared spines** — the cross-cutting systems the surfaces all draw from. Drift almost
always occurs at a **spine→surface boundary**: a spine changes and one of its consumer
surfaces isn't re-checked. The hierarchy exists to make every one of those boundaries
enumerable.

Mapping notation: `§N` = system number in `docs/active-systems.md` (all 24 are mapped —
nothing is orphaned).

### 4.1 Top-of-hierarchy sections (the surfaces)

| # | Top Section | Cat | Primary files | Absorbs active-systems | Spines consumed |
|---|------------|-----|---------------|------------------------|-----------------|
| T1 | **Setup Wizard** | G | `SetupWizard.jsx`, `LifeEventMenu.jsx`, `JobLossEntry.jsx`, `RateUpdateModal.jsx`, `constants/config.js` | §9 · §10 (entry flows) · §11 (employer preset convention — born here, enforced everywhere) | A, B, F |
| T2 | **Home Panel** | G | `HomePanel.jsx`, `JobLossHomePanel.jsx`, `NetWorthHealthTips.jsx`, `CoachNetWorthCard.jsx`, `ReemploymentTracker.jsx` | §14 · §10 (Job Loss home surface) · §4 (the *entire* goals surface — cards, CRUD, reorder, timeline bar; moved off Budget 2026-05-12) · §16 (sprints 3/5) | A, B, C, D, E |
| T3 | **Income Panel** | L | `IncomePanel.jsx`, `WeekConfirmModal.jsx` | §1 (display surface) · §2 · §12 · §16 (sprint 2, unshipped) | A, B, E, F |
| T4 | **Budget Panel** | L | `BudgetPanel.jsx`, `JobLossBudgetPanel.jsx`, `BulkEditPanel.jsx`, `MonthQuarterSelector.jsx`, `DueDatePicker.jsx` | §3 · §5 · §10 (Job Loss budget surface) · Tax Plan gate (§23 consumer; §4 goals moved to T2 — corrected in T4 pass) | A, B, C |
| T5 | **Account Panel** (redefined 2026-07-19 — was "Benefits Panel", see §11: `BenefitsPanel.jsx` is dead code; the fifth nav panel is Account) | G | `ProfilePanel.jsx` (all sub-views: Employment, Pay Structure cards, Retirement & Benefits `BenefitsDetail`, App Preferences, Tax Plan writers, Investor Codes, Life Events row, Account/auth actions UI) | §17 (account-management surface) · §6 (settings side; displays → T6) · Tax Plan write path (§23 consumer) | A, B, C |
| T6 | **Log Panel** | L | `LogPanel.jsx` | §8 · §7 (attendance surfaces) · §13 (per-entry admin breakdown) | A, B, F |
| T7 | **Auth System** | G | `lib/supabase.js`, `db.js` (account mapping, `loadUserData`/`saveUserData`), migrations (RLS, tier columns), `DemoAccountTree.jsx`, `InvestorRegister.jsx`, `InvestorAdminPanel.jsx` | §17 (session + identity/tier truth; the ProfilePanel UI surface is T5) · §18 · §23 | B, C |
| T8 | **Login System** | G | `LoginScreen.jsx`, `ReviveScreen.jsx`, `TrialExplainerScreen.jsx`, `api/revival-lookup.js` | §17 (auth entry) · §21 (revival detection at sign-in) | B, C |
| T9 | **Paywall System** | G | `App.jsx` (entitlement resolution + `readOnly` fencing), `UpgradeCard/Modal/Panel.jsx`, `TrialBanner.jsx`, `api/stripe-*.js`, `api/cron-subscription-lifecycle.js` + `_lifecycle*.js`, `_email.js` | §21 · §20 | B, C |
| T10 | **UI-UX** | G | `ui.jsx`, `LiquidGlass.jsx`, `index.css` (`@theme`), `useSwipeStack.js`, `PwaInstallModal.jsx`, animation rules | §15 · §16 (primitives) · §19 | E |

Notes on deliberate placements:

- **T5 Account vs. T7 Auth vs. T8 Login** — T8 is every pre-session surface (sign-in,
  sign-up, OAuth, recovery, revival detection); T7 is in-session identity/tier *truth*
  (session handling, RLS, tier flags, account mapping, investor/demo machinery); T5 is
  the Account *panel* — the ProfilePanel UI where the user edits settings and triggers
  account actions. A ProfilePanel button (T5) calling an auth/db primitive (T7) is the
  expected coupling, not drift.
  Drift between them is exactly the §21 revival flow — which is why they're separate
  sections with an explicit boundary entry, not one blob.
- **Job Loss Mode (§10)** is a genuine app *mode*, not a panel — its pieces are assigned to
  the surface they replace (T2/T4) and to T1 (entry flows), with `config.jobLossMode`
  routing itself owned by T2/T4's drift maps. `JobLossDashboard.jsx`/`ExpenseTriage.jsx`
  are deleted architecture; any reappearance is itself a drift finding.
- **`App.jsx`** is not a section — it is the wiring harness where nearly every
  spine→surface boundary physically lives (68 distinct commits touch it, the most of any
  file). Each section's drift map owns the `App.jsx` wiring for *its* props/state; the
  Warden treats an `App.jsx` diff as touching every section whose wiring appears in the hunk.

### 4.2 Shared spines (the cross-cutting systems)

| Spine | Cat | Files | Absorbs active-systems | One-line drift stance |
|-------|-----|-------|------------------------|----------------------|
| **A — Fiscal Math** | L | `finance.js` (40 exports), `fiscalWeek.js`, `rollingTimeline.js`, `expense.js`, `goalFunding.js`, `jobLossRunway.js`, `stateTaxTable.js` | §1 · §2 · §7 (math) · §14 (math) | The single source of numeric truth. Every panel number must trace to an export here; `buildYear → computeNet → calcEventImpact → computeGoalTimeline` is the trunk — a change to any stage re-verifies every consumer surface (T2–T6) *and* Spine D's context fields. |
| **B — Persistence & Save Integrity** | L | `db.js`, `useLocalStorage.js`, `supabase.js`, eager-save pattern (`savePersistedStateNow` + the four `saveXNow` wrappers), `configHistory.js`, `database/migrations/` | §22 | Every discrete mutation follows the eager-save pattern (D3); every sensitive config change must hit the `HISTORY_SENSITIVE_FIELDS` watcher; schema changes ride numbered migrations (BOOKMARK files are never migrations; next real number: 023 — verify against the folder, this doc does not track it). |
| **C — Entitlement & Gating** | G | `subscription.js` (`getEntitlement`), `entitlements.js` (`canAccessAiFeatures`, `canAccessTaxPlan`, `hasTesterAccess` base), tier flags (`is_admin`/`is_tester`/`is_investor`/future `is_owner`) | §23 · §18 (flag semantics) · §21 (engine) | One entitlement resolver, one gate module. `isAdmin` stays a strict superset of `isTester` *by construction* (build every new gate on `hasTesterAccess`); tester⇔investor never overlap; the day-21 `access_ends_at` grace is never disclosed in user-facing strings. |
| **D — AI Layer & Context Grounding** | L | `aiContext.js` (`buildCoachContext`), `coachPrompts.js`, `coachFeatureGuide.js`, `coachTriggers.js`, `claude.js`, `api/coach.js`, `AskCoachPanel.jsx` | §24 | Every context field resolves through the same authoritative Spine-A function the UI displays that number with — never a parallel approximation (D1). Goal labels stay excluded (privacy rule). Gate is checked client *and* server side (Spine C). `coachTriggers.js#estimateRunwayDays` is a known standing D1 violation — quarantined, cite it, don't extend it. |
| **E — Design System & Motion** | G | `index.css` `@theme` tokens, `ui.jsx` primitives, `LiquidGlass.jsx` (`ALLOWED_PURPOSES`), animation rules, numeric-input standard, Pulse token reservation | §15 · §16 (primitives) | No raw hex for accent/green/red; Pulse tokens never on Flow elements; Liquid Glass only on whitelisted purposes; no bounce/spin/scale-up, ≤500ms; string-draft numeric inputs, parse at commit only. |
| **F — Admin Diagnostic Toolkit** | G | Toolkit in `App.jsx` (8 Phase-1 tools), per-entry breakdown in `LogPanel.jsx` | §13 | The Warden's own instrument panel — drift *checks* are executed through it (Live Inspector, Week Inspector, DB Row drift badge, Config Raw View). A change that breaks a toolkit tool blinds every other drift check; Phase 2 (`isOwner`) tools are write-capable and get L-grade scrutiny when built. |

### 4.3 Empirical coupling — what the commit history proves

Co-change analysis across all 487 commits (files landing in the same non-merge commit),
strongest couplings:

| Coupling | Co-commits | Reading |
|----------|-----------|---------|
| `App.jsx` ↔ `db.js` | 13 | The wiring harness and persistence move together — Spine B boundary is the hottest in the app |
| `BudgetPanel` ↔ `HomePanel` | 11 | T4 and T2 share goals/expenses surfaces — a goal-logic change that touches only one of them is suspicious by default |
| `App.jsx` ↔ `ProfilePanel` | 11 | Account/config wiring (T5/T7) |
| `App.jsx` ↔ `finance.js` | 10 | Spine A output re-wired through the harness |
| `constants/config.js` ↔ `finance.js` | 9 | Config shape and math evolve in lockstep — a new config field almost always demands a Spine-A consumer |
| `aiContext.js` ↔ its test | 9 | Spine D churns and is test-fenced — keep it that way |
| `IncomePanel` ↔ `LogPanel` | 8 | T3/T6 share event-impact display (`calcEventImpact` consumers) |
| `HomePanel` ↔ `finance.js` | 8 | T2 leans directly on Spine A |

The Warden treats these pairs as **default-suspect**: a diff touching one side of a pair
without the other requires an explicit "checked, unaffected" statement, not silence.

---

## 5. How Drift-Map Entries Are Written (the format each section will use)

Each top section (T1–T10) and spine (A–F) gets a surgical pass producing four fixed blocks.
This is the schema the Warden agent will be trained against — deviating from it degrades
the training data, so entries follow it exactly:

**Block 1 — Critical inventory.** The section's load-bearing formulas, functions, patterns,
and AI-context points, each as: name · `file:line-anchor` · category tag (L/G) · one-line
statement of the invariant it upholds.

**Block 2 — Drift trigger map.** The core deliverable. Table rows of the form:

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|--------------------------|--------------------|--------------------------|-------|
| *the trigger: a named function, field, pattern, or file region* | *the named blast radius: every consumer that holds a belief about X* | *the verification: which test, which Admin Toolkit tool, which matrix cells, which authoritative function to diff against* | D1–D5 |

Rules: triggers are *named things*, not files ("`computeNet`'s deduction ordering", not
"finance.js"); blast radii are *exhaustive at time of writing* and dated; every row's
procedure must be executable by someone (or something) with no prior context.

**Block 3 — Gate matrix** (G-heavy sections) or **Authority table** (L-heavy sections).
G: the full flag/mode grid the section branches on, with expected outcome per cell.
L: each displayed/stored value → its single source-of-truth function → known consumers.

**Block 4 — Case law & quarantine.** Past drift incidents that occurred *in this section*
(cite commit or active-systems §), plus any standing known-drift quarantines (e.g. Spine D's
`estimateRunwayDays`) so the Warden flags extensions of them rather than rediscovering.

**Maintenance covenant:** a drift-map entry is itself subject to D5. Whenever a listed
trigger's blast radius changes, the entry is updated *in the same PR* — an entry more than
one structural change out of date is worse than no entry, because it certifies a stale
checklist. `docs/active-systems.md` stays the "what exists" doc; this doc is strictly the
"what breaks what" doc — describe systems there, map couplings here, duplicate in neither
direction.

---

## 6. Section Stubs — pending surgical passes

To be filled one at a time, in collaboration, in this order (each pass produces Blocks 1–4
for that section):

- [x] **T1 — Setup Wizard** — §7 below (surgical pass 2026-07-19)
- [x] **T2 — Home Panel** — §8 below (surgical pass 2026-07-19)
- [x] **T3 — Income Panel** — §9 below (surgical pass 2026-07-19)
- [x] **T4 — Budget Panel** — §10 below (surgical pass 2026-07-19)
- [x] **T5 — Account Panel** — §12 below (surgical pass 2026-07-19; §11 records the redefinition from the phantom "Benefits Panel" tier)
- [ ] **T6 — Log Panel**
- [ ] **T7 — Auth System**
- [ ] **T8 — Login System**
- [ ] **T9 — Paywall System**
- [ ] **T10 — UI-UX**
- [ ] **Spines A–F** (final pass — spines are written last so every spine entry's blast
  radius can point at completed surface sections, not forward references)

---

## 7. T1 — Setup Wizard Drift Map

**Pass date:** 2026-07-19. **Line anchors** are `file:line` as of this pass's commit and are
always paired with a greppable symbol name — when lines shift, grep the symbol; when the
symbol is gone, this entry is due for re-surgery (D5 on itself).
**Method note:** this is a key-function-by-key-function study, not line-by-line
documentation. Each monitored function gets its code anchor **and** a human-readable
IF/THEN statement — the IF/THEN is the drift check; the anchor is where to aim it.

**Scope:** `SetupWizard.jsx` (2,492 lines, 9 live steps), `LifeEventMenu.jsx`,
`JobLossEntry.jsx`, `RateUpdateModal.jsx`, their `App.jsx` wiring (completion handler,
config-history tagging, Back to Work), and `constants/config.js` presets they consume.

### 7.1 Block 1 — Critical inventory (function by function)

**F1 · `dateToWeekIdx(dateStr)`** — `SetupWizard.jsx:703` — **[L]**
The wizard's only date→fiscal-week formula: `ceil((date − FISCAL_YEAR_START)/7)` clamped
to `[0, 51]`. Sole writer of `firstActiveIdx` (the nuclear field), `accountCreatedIdx`,
and the jobless path's start anchors.
> **IF** the rounding, clamping, or `FISCAL_YEAR_START` consumption in `dateToWeekIdx`
> changes, **THEN** every existing account silently repositions its `firstActiveIdx` on
> next wizard open (F2 auto-recalculates it), which repositions `taxedWeeks`, check-in
> eligibility, and the entire fiscal calendar. Check: `fiscalWeek.js` helpers agree on
> week-0 semantics; Tax Weeks Grid + Week Inspector on a real account; `SetupWizard.test.jsx`.

**F2 · formData init recalc** — `SetupWizard.jsx:2252–2264` (inside the `useState`
initializer of `SetupWizard`) — **[L]**
On every wizard open, `firstActiveIdx` is re-derived from `startDate` — because Step 2's
`onChange` only fires on user edits, a re-entry keeping the existing `startDate` would
otherwise carry a stale index (this exact bug shipped once; the comment block records it).
Also: investor accounts get `employerPreset` forced to `null` here (`:2253–2254`).
> **IF** a new config field is added whose value is *derived from another field the user
> can edit* (the `startDate → firstActiveIdx` shape), **THEN** it must either be re-derived
> in this initializer or derived only at `handleComplete` — a field derived only in a step's
> `onChange` will go stale on every re-entry. Check: open the wizard as `structure_change`
> on an account where the source field already has a value; confirm the derived field matches.

**F3 · `isFirstRunJobless(d, ev)` + `STEP_DEFS`** — `SetupWizard.jsx:2119`, `:2122–2210` — **[G]**
The routing truth table. `showIf`/`isValid` per step; jobless mini-flow is step ids
10/11/12; Wrap Up (id 7) shows only for `null`(employed) / `changed_jobs` /
`structure_change`. `isFirstRunJobless` is true only on first-run (`ev === null`) with
`startedUnemployed === true` — never on any re-entry, including Back to Work.
> **IF** any step's `showIf`/`isValid` changes, or `LIFE_EVENTS` gains/loses a member,
> **THEN** walk the full path matrix (§7.3). The two standing traps: (a) `lost_job` and
> `commission_job` never see Wrap Up — a new field committed only in Wrap Up's UI silently
> never gets set on those paths (its default must live in `handleComplete`, F5); (b) the
> jobless path skips Deductions/Tax entirely — every downstream consumer must tolerate a
> `setupComplete` config with absent tax/benefit/pay fields.

**F4 · Step 0 jobless seed** — `SetupWizard.jsx:66–80` (the "Yes, unemployed" `Pill`
`onClick` in `Step0`) — **[G→L]**
One atomic patch: `startedUnemployed: true`, `jobLossMode: true`, `jobLossDate` (defaults
today), `startDate: today`, `firstActiveIdx`. Answering "No" reverses the first three.
> **IF** this patch's field set changes, **THEN** check every consumer of the seeded
> fields: `buildYear()`'s `jobLossMode` income-zeroing, `JobLossHomePanel`/
> `JobLossBudgetPanel` expectations (`jobLossDate`, `jobLossCashOnHand`), and both special
> cases in `handleWizardComplete` (F8) that test these exact flags — `skipFoodSeed`
> (`wizardEntry === false && jobLossMode`) and the H4 `startedUnemployed` clear.

**F5 · `handleComplete()`** — `SetupWizard.jsx:2316–2338` — **[L]**
The single commit point for every wizard path (all six routes in §7.3 end here). Ordered
effects: (1) DHL enforced overrides — `payPeriodEndDay: 0`, `otThreshold: 40`,
`otMultiplier: 1.5` (`:2317–2319`); (2) buffer normalize — `paycheckBuffer ?? 50` whenever
`bufferEnabled !== false` (`:2323–2325`); (3) `taxedWeeks` derivation — `[]` if
`taxExemptOptIn`, else every `buildYear()` week with `idx >= firstActiveIdx` (`:2329–2331`);
(4) `accountCreatedIdx` stamp — preserved if already set, else today's week (`:2336`);
(5) `setupComplete: true`.
> **IF** the DHL overrides change, **THEN** check `WeekConfirmModal`'s pay-period
> assumptions, `buildYear()` OT math, and the DHL row of §7.3.
> **IF** the `taxedWeeks` formula changes, **THEN** check the Tax Plan surface, the
> `extraPerCheck` withholding-gap math, `pastWeekTaxStatusOverrides` semantics, and the
> Tax Weeks Grid (admin).
> **IF** a new Wrap-Up-only field is introduced, **THEN** its default must be applied here,
> because `lost_job`/`commission_job`/jobless paths skip Wrap Up but still run
> `handleComplete`.
> **Standing invariant:** the jobless path reaches the `buildYear(finalData)` call at
> `:2326` with *no real pay structure* — any `buildYear` change must keep tolerating that
> config shape.

**F6 · `estimateWeeklyGross` / `estimateWeeklyNet`** — `finance.js:136` / `finance.js:176` — **[L]**
The wizard's sanctioned preview approximations (Step 1/Wrap Up live net; `PaystubCalc`).
They are deliberately *not* `buildYear` — but they promise the user a number the app then
recomputes for real.
> **IF** `buildYear`/`computeNet` changes deduction ordering, any tax rule, or any benefit
> rule, **THEN** these two must change in the same commit, or the wizard's promised net
> diverges from the first rendered week — a D1 pair, permanently coupled. Check: complete
> a test wizard run and diff Wrap Up's net against Week Inspector's `computeNet` for the
> first active week.

**F7 · `StructureChangeDiff` + `DIFF_FIELDS`** — `SetupWizard.jsx:1732` / `:1714–1730` — **[G]**
Display-only "What's Changing" diff on the `structure_change` Wrap Up, compared against
the frozen `originalConfigRef` (`:2271`). Guard at `:1738`: a jobless-started account gets
a "first real pay structure" message instead of a misleading diff against
`DEFAULT_CONFIG` placeholders.
> **IF** a new sensitive pay/tax/schedule field is added to the wizard, **THEN** add it to
> **both** `DIFF_FIELDS` (or it silently vanishes from "What's Changing") **and**
> `HISTORY_SENSITIVE_FIELDS` (`configHistory.js:14`) (or it escapes `account_history`
> capture). These two lists monitor the same concept from two angles and must never
> diverge — diff them against each other whenever either changes.

**F8 · `handleWizardComplete(mergedConfig)`** — `App.jsx:1315–1357` — **[L]**
The `onComplete` consumer. Ordered effects: tags `configHistoryMetaRef` with
`source: "setup_wizard" | "life_event:<ev>"` and `effectiveFrom: startDate` (`:1318–1321`);
clears `startedUnemployed` when Back to Work's `structure_change` completes (`:1327–1329`);
skips the Food expense seed for a jobless first-run (`:1338–1339`) and restores it on Back
to Work (`:1345–1348`); eager-saves config **and** expenses in one
`savePersistedStateNow(overrides)` call (`:1352–1356`).
> **IF** wizard completion needs to write any new piece of state, **THEN** it must ride the
> same `savePersistedStateNow` overrides object — a separate `setState` + debounce is the
> D3 pattern that lost wizard data in production. Check: the overrides object contains
> every value the completion mutated.

**F9 · Config-history watcher** — `App.jsx:661–689` (`configHistoryMetaRef` +
`diffSensitiveFields` effect) — **[L]**
Diffs every config transition; wizard/life-event flows pre-tag `configHistoryMetaRef`
(one-shot — nulled every run at `:668`); untagged changes record as `"config_edit"`
effective today; `baseRate` changes also get an optimistic local append to
`baseRateHistory` (`:686–688`) so `buildYear` resolves the new rate without a reload.
> **IF** any wizard/life-event flow calls `setConfig` without setting
> `configHistoryMetaRef` immediately before, **THEN** the snapshot loses its
> `source`/`effectiveFrom` attribution — and for `baseRate`, `resolveBaseRateForWeek`'s
> point-in-time math anchors to the *wrong date*. Check: DB Row Viewer's config-history
> line shows the expected source + date after the flow runs.

**F10 · Quick Rate Update chain** — `RateUpdateModal.jsx:15` (`onActivate` contract at
`:42`) → `App.jsx:3400–3408` → F9 watcher → `saveConfigSnapshot` + optimistic append →
`extractBaseRateHistory` (`db.js:19–24`) → `baseRateHistory` state (`App.jsx:293`) →
`buildYear(config, baseRateHistory)` (`App.jsx:939`, `finance.js:481`) →
`resolveBaseRateForWeek` (`finance.js:470`) — **[L]**
**This chain is the first and only read path of `account_history`** — the §19 "narrow
slice." `extractBaseRateHistory` keeps only rows where `changed_fields` includes
`"baseRate"` *and* `snapshot.baseRate` is a real number.
> **IF** `saveConfigSnapshot`'s row shape (`changed_fields`, `snapshot`) or
> `HISTORY_SENSITIVE_FIELDS`'s spelling of `baseRate` changes, **THEN**
> `extractBaseRateHistory`'s filter silently drops every affected row and past-rate
> resolution collapses to the live rate — no error, just retroactively rewritten pay
> history (D2 re-opened). Check: `db.test.js` baseRateHistory cases + a future-dated rate
> update showing the *old* rate on weeks before the effective date (Week Inspector).

**F11 · `handleBackToWork()`** — `App.jsx:1362–1386` — **[G]**
The single reset point for leaving Job Loss Mode: auto-reactivates flagged expenses,
nulls the `jobLoss*`/unemployment/`returnToWorkDate` fields, routes into
`structure_change`.
> **IF** a new `jobLoss*` or unemployment-related config field is added anywhere, **THEN**
> it must be reset here — or it leaks into the re-employed state and every consumer that
> gates on it misfires. Check: grep new field name; confirm it appears in this reset patch.

**F12 · `LifeEventMenu` routing + `JobLossEntry` activation** — `App.jsx:3374–3382` /
`:3384–3398` — **[G]**
Three routes: `job_loss` → `JobLossEntry` modal (not the wizard), `rate_update` →
`RateUpdateModal`, anything else → `setWizardEntry(route)`. `JobLossEntry.onActivate`
tags history (`life_event:lost_job`, `effectiveFrom: jobLossDate`), computes
`nextConfig` synchronously, and eager-saves config + triaged expenses together — the
model D3-safe activation.
> **IF** a new life-event tile is added, **THEN** decide its route class explicitly
> (wizard string vs. dedicated modal), give it a `life_event:<name>` history source, and
> follow F12's synchronous-compute + single-eager-save shape. Check: kill the tab within
> 800ms of activating; reload; the change survived.

### 7.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `FISCAL_YEAR_START` (`constants/config.js`) | Every stored `firstActiveIdx`/`accountCreatedIdx`/`taxedWeeks` in the DB — F1 re-derives on wizard open, but accounts that never re-enter keep indexes anchored to the *old* year-start | Never change mid-year. If it must change: data migration for all three fields + `fiscalWeek.test.js` + Tax Weeks Grid spot-check | D2 |
| `DHL_PRESET` (`constants/config.js`) — teams, defaults, rotation | Step 1 team prefills (`SetupWizard.jsx:287–320`), rotation copy (`:375–377`), F5's enforced overrides, `buildYear` rotation math | `SetupWizard.test.jsx` + complete a DHL test run; Week Inspector on a long-week and short-week | D1 |
| `BENEFIT_OPTIONS` (`constants/config.js`) — add/remove/re-type a benefit | Step 3 `isValid`'s weekly-type required loop (`:2190–2192`), `BenefitCard`, `weeklyBenefitDeductions()` in `finance.js`, Wrap Up's benefits row | Snapshot test (`config.test.js.snap`) + wizard run selecting the changed benefit; diff Wrap Up net vs. Week Inspector | D1 |
| `buildYear` signature or week-object shape (Spine A) | F5's direct call (`:2326` — `taxedWeeks` derives from `w.idx`), F6 preview pair, F10's `baseRateHistory` param | `finance.test.js` + F6's preview-vs-week diff procedure | D1/D2 |
| A new sensitive field enters the wizard | `DIFF_FIELDS` (F7), `HISTORY_SENSITIVE_FIELDS` (`configHistory.js:14`), ProfilePanel's Pay Structure cards (T5 — same field, second editor) | Three-way grep for the field name; all three lists/surfaces present or explicitly excluded | D5 |
| `STEP_DEFS` ids or routing comment (`:2105–2113`) | CLAUDE.md SetupWizard quick reference, `SetupWizard.test.jsx`, this section's §7.3 matrix | Re-verify matrix path by path; update both docs in the same PR | D5 |
| `onComplete` payload shape (F5's spread) | F8, `db.js#saveUserData` column mapping, `docs/account-reference.json` expectations | `db.test.js` + DB Row Viewer drift badge after a wizard run | D3 |
| Wizard cancel wiring (`App.jsx:3414–3420` — `onCancel` is `undefined` for first-run non-investor) | First-run users must not be able to escape setup with `setupComplete: false` but a live session; TrialExplainerScreen gate (`App.jsx:1466`) sequencing | Manual: fresh account, attempt to dismiss the wizard every way the UI offers | D4 |
| `JobLossEntry` step contents (cash-on-hand, `trackDuringJobLoss`, due dates) | `computeJobLossRunway()` inputs (T2/T4 surfaces), F11's reset list | `jobLossFlow.test.jsx` + runway headline sanity on a test account | D1 |

### 7.3 Block 3 — Gate matrix (the six paths)

All paths commit through `handleComplete` (F5) — including the two that skip Wrap Up and
the one with no pay structure.

| Path (lifeEvent · seed) | Steps shown | Wrap Up? | Path-specific invariants |
|---|---|---|---|
| First-run employed (`null` · No) | 0 → 1 → 2 → 3 → 4 → 7 | Yes | `onCancel` undefined (non-investor) — no escape; buffer + tax-exempt offered here only |
| First-run jobless (`null` · Yes) | 0 → 10 → 11 → 12 | Own (12) | No pay structure at `buildYear` call; `jobLossMode: true`; Food seed skipped (F8); lands in Job Loss panels |
| `structure_change` | 0 → 1 → 2 → 3 → 4 → 7 + diff | Yes | Pre-filled; frozen `originalConfigRef` baseline; clears `startedUnemployed` on completion (F8); Food restored if jobless-started |
| `lost_job` (legacy wizard route) | 0 → 1 → 2 → 3 → 4 | **No** | Wrap-Up-only fields must default in F5; primary lost-job entry is now the `JobLossEntry` modal (F12), not this |
| `changed_jobs` | 0 → 1 → 2 → 3 → 4 → 7 | Yes | Full re-run against existing account data |
| `commission_job` | 0 → 1 → 2 → 3 → 4 | **No** | Commission field appears in Step 1; Wrap-Up-only fields must default in F5 |

Cross-cutting cells on top of every path: **DHL** (Step 2 shows rotation instead of
hours/pay-day; Step 1 requires `dhlTeam`; F5 overrides fire) · **biweekly/salary**
(Step 2 requires `biweeklyPayWeekParity` — `isValid:2175`) · **investor**
(`employerPreset` forced null at F2; Step 0 greets by name) · **Step 3 skippable**
(only step with `skippable: true` — a required field added to Step 3 must survive being
skipped entirely).

### 7.4 Block 4 — Case law & quarantine

**Precedents (fixed — cite, don't relearn):**
- *Stale `firstActiveIdx` on re-entry* — derived field not recomputed on wizard open;
  fixed by F2's init recalc. The general rule in F2's IF/THEN exists because of this.
- *Jobless diff against placeholders* (TODO §15.H4) — `structure_change` after a jobless
  start diffed `DEFAULT_CONFIG`'s `baseRate: 19.65` as if it were a real prior job; fixed
  by F7's `:1738` guard.
- *Transient fetch error re-opened the wizard over real data* — `db.js:170–181`: only
  PGRST116 ("no row") may fall back to `DEFAULT_CONFIG` + wizard; every other load error
  must propagate. Any change to `loadUserData` error handling re-fights this exact fire.
- *Quick Rate Update effective date didn't gate the math* (commit `955b0b3`) — the modal
  saved a date the engine ignored; fixed by the F10 chain. The whole chain exists so the
  date is load-bearing — treat any simplification of it as reopening the bug.

**Standing findings from this pass (open — decisions owed):**
1. **Soft-D3, Quick Rate Update** *(queued as DW-1 in `docs/BUG_FIX_TODO.md`)*:
   `App.jsx:3404–3407` sets `config.baseRate` with *no*
   `savePersistedStateNow` — the live rate rides the 800ms debounce. Mitigation already in
   place: the `account_history` row (fire-and-forget insert) + optimistic append mean week
   math survives a lost write after reload; but the *live* `config.baseRate` (ProfilePanel
   display, F6 previews) can silently revert. Cheap fix: eager-save in `onActivate` like
   F12 does. Flagged, not fixed — needs owner sign-off.
2. **D5, corrected in this pass:** CLAUDE.md's SetupWizard quick reference predated the
   jobless mini-flow, `structure_change`, and the `otMultiplier: 1.5` override — updated
   in this commit.
3. **D5, corrected in this pass:** `active-systems.md` §22's "nothing reads this table"
   predated the F10 read path — annotated in this commit.

---

## 8. T2 — Home Panel Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7. Function numbering continues
from §7 (F13+) so cross-references stay unambiguous.
**Git-history note:** this section was written hours after the §15.H11/H12 pair
(`2e0121a`, `10ba9af`) landed — the *newest* intentions on this surface. Those commits
replaced a four-way parallel-formula drift with two shared helpers; several entries below
exist specifically to keep that fix from un-happening.

**Scope:** `HomePanel.jsx` (1,403 lines), `JobLossHomePanel.jsx`, `ReemploymentTracker.jsx`,
`NetWorthHealthTips.jsx`, `CoachNetWorthCard.jsx` + `coachTriggers.js`, and the `App.jsx`
derivation layer that feeds them (`weeklyIncome`, `prevWeekNet`, `adjustedTakeHome`,
`remainingSpend`, `fundedGoalSpend`).

### 8.1 Block 1 — Critical inventory (function by function)

**F13 · `resolveActiveWeeksThisYear(firstActiveIdx)`** — `fiscalWeek.js:15`, consumed at
`App.jsx:1203`, `HomePanel.jsx:104`, `aiContext.js`, `DemoAccountTree.jsx` — **[L]**
Born 2026-07-19 (`2e0121a`) to kill the flat-`/52` assumption: "how many fiscal weeks is
this account actually active this year." Backs `weeklyIncome`, HomePanel's
`annualSavings`, and the Coach's stated savings figure — all four call sites deliberately
share it so they *can't* re-drift.
> **IF** any of the four call sites stops using this helper (or a fifth consumer computes
> active weeks its own way), **THEN** the §15.H11 dilution bug reopens: a mid-year
> `firstActiveIdx` makes "typical week" and "annual savings" numbers disagree between the
> Home tile, the Coach, and the Income panel. Check: grep `resolveActiveWeeksThisYear` —
> consumer count only ever grows; `fiscalWeek.test.js` + `aiContext.test.js` cover it.

**F14 · `weeklyIncome` derivation** — `App.jsx:1193–1204` — **[L]**
`(projectedAnnualNet / activeWeeksThisYear) − bufferPerWeek`. The single "typical active
week nets you" number threaded into HomePanel, Coach context, Live State Inspector, and
Job Loss surfaces. `bufferPerWeek` scales `paycheckBuffer` by `checksPerYear / 52`.
> **IF** `weeklyIncome`'s formula or its `bufferPerWeek` subtraction changes, **THEN**
> every downstream "left this week / surplus / savings rate" number shifts together —
> check HomePanel tiles (F16), `annualSavings` (F17), goal timeline surplus sequencing
> (`computeGoalTimeline` consumes `weeklyNets`), and Coach context lines. Procedure: Live
> State Inspector's `weeklyIncome` vs. Home tile vs. an Ask Coach "what do I make weekly"
> answer — all three must quote the same number.

**F15 · `resolvePrevWeekNet(...)`** — `finance.js:1392` (authoritative), consumed
`App.jsx:1212–1215`, `DemoAccountTree.jsx` — **[L]**
"This Week's Check": the specific prior active week's `computeNet` adjusted for that
week's log entries — falling back to the *current active week's real net*, never the
`weeklyIncome` average (that fallback was the §15.H11 "diluted fraction of a paycheck"
bug). Extracted to `finance.js` precisely because App.jsx and DemoAccountTree carried
duplicated inline versions.
> **IF** the fallback chain or week-selection logic here changes, **THEN** check both
> consumers **and** HomePanel's own second-layer fallback (`nextWeekDisplay`,
> `HomePanel.jsx:119–122`, which cascades `futureWeekNets[0] → prevWeekNet →
> weeklyIncome`) — a change that's correct in `finance.js` can still leave HomePanel's
> cascade quoting the old semantics. Check: `finance.test.js` resolvePrevWeekNet cases;
> a brand-new account (no prior active week) must show a full-size check on day one.

**F16 · HomePanel derived-tile layer** — `HomePanel.jsx:80–258` — **[L]**
The dense strip where every hero tile's number is computed: `perCheckFactor` (`:81`,
weekly→per-paycheck display scaling), `leftThisWeek = (prevWeekNet ?? weeklyIncome) −
avgWeeklySpend` (`:93–94`), `annualSavings = avgWeeklySurplus × activeWeeksThisYear −
fundedGoalSpend` (`:104–105`), `netWorthHealth` (`:117`), the `nextWeekDisplay` fallback
cascade (`:119–122`), and the Pulse insight builders (`:154–214`) that must return
`undefined` on insufficient data (never fabricate a signal — Spine E rule).
> **IF** any tile formula changes, **THEN** the same number's other holders must move with
> it: Coach context (`aiContext.js` quotes budget-health/savings via the same functions —
> the grounding rule), Live State Inspector, and for `annualSavings` the F13 helper.
> **IF** a new tile is added, **THEN** it must derive via the authoritative Spine-A
> function for that fact and scale by `perCheckFactor` for display — a raw weekly number
> on a biweekly account is a silent 2× lie.

**F17 · `adjustedTakeHome` (do-not-default contract)** — computed `App.jsx:1270`
(`projectedAnnualNet + eventImpact.totalNetAdjustment − fundedGoalSpend`), prop-doc
warning `HomePanel.jsx:38–43` — **[L]**
Every real caller computes and passes it. The prop comment explicitly forbids a
`weeklyIncome × 52` default — that would reintroduce the H11 dilution for any account not
active all 52 weeks (`10ba9af` purged exactly that dead fallback).
> **IF** a new HomePanel caller is added (a future demo/preview surface), **THEN** it must
> compute `adjustedTakeHome` the same way — never default it, never multiply
> `weeklyIncome` back out by 52. Check: the prop has no default in the signature; keep it
> that way.

**F18 · `computeGoalTimeline` consumption + Reset Timeline** — call at
`HomePanel.jsx:287–295` (epoch arg `:295`), reset handler `:500–510` — **[L]**
The Home goal cards run the authoritative week-by-week surplus simulation with
`config.goalTimelineEpochIdx ?? null`. Reset Timeline writes the next pay week's idx as
the new epoch **and** clears active goals' stale `dueWeek`, double eager-saving (config
via `saveConfigNow`, goals via `onSaveGoalsNow`).
> **IF** any other surface calls `computeGoalTimeline` with a different epoch argument
> (Coach context must pass the same one — a 2026-07-16 live-test bug in §24's case law),
> **THEN** the two surfaces show different goal ETAs for the same account. Check: grep
> `computeGoalTimeline(` — every call site passes the same
> `config.goalTimelineEpochIdx ?? null` expression or documents why not.
> **IF** Reset Timeline's write set changes, **THEN** both eager-saves must still cover
> the full mutation (config **and** goals) — dropping one is D3.

**F19 · Goal CRUD + reorder (eager-save cluster)** — `HomePanel.jsx:460–566` — **[L/G]**
Seven mutation sites (`saveEditGoal:462`, add `:470s`, `deleteGoal:484`,
`toggleComplete:491`, reset `:500`, `handleMarkDone:511–524`, `moveGoal:529` +
drag-drop `:555–566`), all compute-then-eager-save. `handleMarkDone` is the canonical
example of the *updater-capture* pattern (value derived inside `setGoals(prev => …)`
because a celebration `setTimeout` delays it — outer closure would be stale).
> **IF** a new goal mutation is added, **THEN** it follows compute-then-save (or
> updater-capture when delayed) and routes through `onSaveGoalsNow` — and **THEN** the
> `readOnly` shadow (F20) automatically covers it *only* if it uses the shadowed local
> names (`setGoals`/`onSaveGoalsNow`), never the `...Prop` originals. Check: grep
> `Prop` suffix usage below line 76 — should be zero.

**F20 · `readOnly` noop shadow** — `HomePanel.jsx:72–76` (and the same pattern at
`JobLossHomePanel.jsx:29–31`) — **[G]**
Paywall-expired accounts get all four mutation channels (`setGoals`, `setConfig`,
`onSaveGoalsNow`, `saveConfigNow`) shadowed to no-ops in one place.
> **IF** a new mutation-capable prop is threaded into HomePanel or JobLossHomePanel,
> **THEN** it must be added to this shadow block — otherwise an expired account bypasses
> the paywall through the new channel even though the visible setters are dead
> (the exact hole called out in CLAUDE.md's readOnly-gate rule). Check: every prop whose
> call writes anything appears in the shadow list.

**F21 · Year-End Outlook scoping** — window comment + `activeWeeksThisYear`
`HomePanel.jsx:90–105`, `yearEndGoalDraw` `:404–415` — **[L]**
Outlook is clamped to the job/fiscal-year window (never extended backward past Jan 1,
assumes work through Dec 31 — `08ea5b7`), and goal draw is scoped to the slice each goal
is *projected to fund by Dec 31* via `tl`'s `remainingAtEnd` (falling back to full target
when the year-end simulation shape omits it — `ec53450`).
> **IF** `computeGoalTimeline`'s return shape changes (especially `remainingAtEnd`
> presence/meaning), **THEN** `yearEndGoalDraw`'s fallback silently flips between
> "this-year slice" and "full target" — a wrong Outlook with no error. Check: a goal
> whose ETA lands next year must subtract only its this-year slice from Outlook.

**F22 · Job Loss home surface** — mode fork `App.jsx:1482` (Home) / `:1536` (Budget);
`JobLossHomePanel.jsx`: `commitCashOnHand:57–63`, runway consumption `:65–67` (via
`computeJobLossRunway`), `logIncome:92–103`, `removeEntry:107–110`, embedded
`ReemploymentTracker` `:225` with its `applyConfigUpdate` wrapper
(`ReemploymentTracker.jsx:104–108`) — **[G→L]**
`config.jobLossMode` *replaces* HomePanel with JobLossHomePanel (post-§15.H7 architecture
— the pre-H7 overlay components are deleted; don't resurrect). All panel numbers resolve
through `computeJobLossRunway()` / `sumJobHuntIncome()` — the one authoritative runway
pair. Every mutation eager-saves; `jobLossCashOnHand` is persisted and mandatory
(§15.H13).
> **IF** the panel needs a new burn/savings/runway number, **THEN** it comes from
> `jobLossRunway.js` — a second in-component derivation is the exact D1 shape quarantined
> in F24. **IF** a new `jobLoss*` field is added here, **THEN** it also joins
> `handleBackToWork`'s reset list (§7 F11). Check: `jobLossFlow.test.jsx`.

**F23 · Net Worth Health cue** — `netWorthHealthStatus` (`finance.js:1407`,
threshold const `:1405`), suppression `HomePanel.jsx:117–118`
(`belowThreshold && !config?.jobLossMode`), `pickTips(seed, count = 3)`
(`NetWorthHealthTips.jsx:48–51`, seeded by fiscal `weekNumber` at `HomePanel.jsx:1350`) — **[G]**
The savings-rate cue: deterministic 3-of-5 tip rotation per fiscal week; suppressed
entirely in Job Loss Mode (that mode owns its own runway UI); `aiTip` is a dormant
forward slot for a Coach-generated insight.
> **IF** the `NET_WORTH_HEALTH_THRESHOLD` or `netWorthHealthStatus` inputs change,
> **THEN** check both consumers — this cue *and* the Coach amber tier (F24 uses
> `belowThreshold` as its amber proxy) — they must fire on the same condition or the
> Coach warns about a cushion the Home tile calls healthy.

**F24 · Coach Net Worth trigger chain** — gate `HomePanel.jsx:1358` (`canAccessAiFeatures`);
`CoachNetWorthCard.jsx:48–53` (computes `runwayDays` via **quarantined**
`estimateRunwayDays`, resolves tier); `coachTriggers.js`: `estimateRunwayDays:27–49`
[quarantine], `resolveNetWorthSignalTier:56–61`, `shouldFireForTier:67–71` (one message
per tier per fiscal week) — **[G + quarantined L]**
Admin/tester-gated proactive Coach message. Red tier keys off `estimateRunwayDays` — the
app's documented standing D1 violation (independent runway math that ignores persisted
`jobLossCashOnHand` and job-hunt income; always ≤ the real runway).
> **IF** touching anything in this chain, **THEN** do not extend `estimateRunwayDays` —
> converge it on `computeJobLossRunway()` (its doc comment now says exactly this) — and
> note the *knock-on*: its too-low runway flows into `buildCoachContext`
> (`CoachNetWorthCard.jsx:78`), so the Coach can claim less runway than the Job Loss
> panel shows on the same screen. **IF** the gate changes, **THEN** it must remain
> `canAccessAiFeatures({isAdmin, isTester})` — never fold in `isInvestor` (§23 division).

### 8.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `resolveActiveWeeksThisYear` semantics or a consumer bypasses it | `weeklyIncome` (F14), Home `annualSavings` (F16), Coach `annualSavings` line (`aiContext.js`), DemoAccountTree | Grep consumer count; `fiscalWeek.test.js`, `aiContext.test.js`; mid-year `firstActiveIdx` account shows identical figures on Home tile vs. Ask Coach | D1 |
| `resolvePrevWeekNet` fallback chain | HomePanel `nextWeekDisplay` cascade (`:119–122`), DemoAccountTree, "This Week's Check" tile | `finance.test.js`; fresh account day-one shows full-size check | D1/D2 |
| `computeGoalTimeline` return shape or epoch handling (Spine A) | F18's call + epoch arg, `yearEndGoalDraw` fallback (F21), Coach goal lines, BudgetPanel timeline bar (T4) | Grep `computeGoalTimeline(` for epoch-arg parity; next-year-ETA goal subtracts only this-year slice | D1 |
| `getFundedGoalSpend` (`goalFunding.js`) | `annualSavings` (F16), `adjustedTakeHome` (F17), Live State Inspector `fundedGoalSpend` | Complete a goal; Home savings + Year Summary both absorb it exactly once (no double-count) | D2 |
| `eventImpact.totalNetAdjustment` composition (Spine A) | `adjustedTakeHome` (F17) → Home Year-End + IncomePanel Year Summary (both read `logTotals.adjustedTakeHome` — single value, keep it that way) | Log a missed shift; both panels move by the same amount | D1 |
| A new mutation prop threaded into Home/JobLossHome | F20 shadow lists | Prop appears in the shadow block; expired-account test: mutation is a no-op end-to-end | D4 |
| `netWorthHealthStatus` / threshold | F23 cue **and** F24 amber tier | Both fire on the same account state | D1 |
| `computeJobLossRunway` / `sumJobHuntIncome` signature | F22 panel consumption, `JobLossBudgetPanel` (T4), and the F24 quarantine's convergence target | `jobLossFlow.test.jsx`; runway headline equals Budget-side runway | D1 |
| `PAYCHECKS_PER_YEAR` / a new pay schedule (Spine A) | `perCheckFactor` display scaling (F16), `bufferPerWeek` (F14), Wrap Up preview (§7 F6) | Biweekly test account: tile values are 2× weekly, labels say "Check" not "Week" | D1 |

### 8.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| `config.jobLossMode` | false / true | true: `JobLossHomePanel` *replaces* HomePanel entirely (`App.jsx:1482`); Net Worth cue suppressed (F23); nav collapses to budget+profile (`App.jsx:907`); Income/Log tabs force-redirect (`:337`) |
| `readOnly` (paywall-expired) | false / true | true: all four mutation channels noop'd (F20) in both Home variants; values still render; UpgradeModal triggerable |
| `isAdmin` / `isTester` | 4 cells | Coach card renders only when `canAccessAiFeatures` — admin or tester; **never** investor (§23); non-gated tiles identical across all cells |
| Pay schedule | weekly / biweekly / salary / monthly | `perCheckFactor` 1 / 2 / 2 / ~4.33 scales every tile value + "Left This Week"→"Left This Check" label swap (`:153`) |
| Goals | empty / active / all-completed | Empty: no goal hero, `pulseGoals` undefined (no fabricated signal); completed: absorbed via `fundedGoalSpend`, hidden behind "show completed" fold |
| `netWorthHealth.belowThreshold` | false / true | true (and not jobLossMode): Breakthrough Tips cue renders with fiscal-week-rotated 3-of-5 tips |

### 8.4 Block 4 — Case law & quarantine

**Precedents (fixed — cite, don't relearn):**
- *§15.H11 dilution* (`2e0121a`, `10ba9af`, 2026-07-19) — four call sites each did their
  own active-weeks math (or divided by a flat 52); "This Week's Check" showed a fraction
  of a real paycheck for any account not active since week 0. Fix: F13 + F15 shared
  helpers + purging HomePanel's dead `weeklyIncome*52` fallback. F13/F15/F17's IF/THENs
  exist to keep this killed.
- *Year-End Outlook overreach* (`08ea5b7`, `ec53450`, 2026-07-13) — Outlook once assumed
  a full 52-week year and subtracted full goal targets regardless of fundability window;
  now clamped + scoped (F21).
- *Paywall read-only gate* (`065ec95`, §17.E) — the noop-shadow pattern (F20) was built
  here first; CLAUDE.md's readOnly rule generalizes it.
- *Pre-§15.H7 Job Loss overlay* (`7375c36`) — `JobLossDashboard.jsx`/`ExpenseTriage.jsx`
  deleted; mode now swaps whole panels. Any PR re-introducing an overlay-on-HomePanel
  Job Loss surface is reviving deleted architecture.

**Standing quarantine (open):**
1. **`estimateRunwayDays` (F24)** — known-drifted second runway formula; its too-low
   number feeds both the Red-tier trigger and Coach context. Convergence target:
   `computeJobLossRunway()`. Its doc comment now carries the quarantine notice
   (corrected this pass — it cited the deleted JobLossDashboard and called cash-on-hand
   "session-only", both stale since §15.H7/H13).
2. **`runwayDays` never wired to `AskCoachPanel`** — `App.jsx:3351–3368` passes no
   `runwayDays`, so `aiContext.js:200` renders bare "Job Loss Mode: active" (documented
   §10 known gap). When wiring it, use `computeJobLossRunway`, not the F24 quarantine —
   and then both Coach entry points must quote the same runway.

---

## 9. T3 — Income Panel Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F25+).
**Git-history note:** the newest structural intentions here are the biweekly two-week
check-in (`7f0e36d`, 2026-06-26), job-start-date alignment (`9110e5f`, 2026-06-28), and
the eager-save audit trio (`debc0cb`, `764da5b`, 2026-07-18) — the check-in confirm
handler's own comment records the production data-loss incident that motivated it.

**Scope:** `IncomePanel.jsx` (557 lines), `WeekConfirmModal.jsx` (1,488 lines), and the
`App.jsx` engine strip that feeds them: pay-period gating, confirmation eligibility, the
`taxDerived` withholding-gap engine, `projectedAnnualNet`, `weekNetLookup`, and the
check-in `onConfirm` consumer. The Week Inspector (Spine F) opens from this panel's rows.

### 9.1 Block 1 — Critical inventory (function by function)

**F25 · `isPayPeriodPast(week)`** — `App.jsx:951–966` — **[G]**
The one gate deciding "this pay period has closed" for the confirm modal and badge.
Base users: strictly after `payPeriodEndDate`'s midnight. DHL: Monday 6:01 AM (overnight
shift runs to Mon 6:00), with the hour gate bypassed under admin Lock Date so simulation
works at any wall-clock hour.
> **IF** this gate's date/hour logic changes, **THEN** every consumer shifts together:
> the auto-confirm seed (F26), eligibility chain (F27), badge count, and modal trigger.
> A week that flips eligible too early prompts users for an unfinished period; too late
> and the badge under-counts. Check: `WeekConfirmModal.test.jsx`; DHL account Monday
> before/after 6 AM; base account at midnight boundary.

**F26 · Auto-confirm seed effect** — `App.jsx:979–1004` — **[L]**
One-shot bulk write: when `weekConfirmations` is empty on load, every closed active week
*before* `accountCreatedIdx` is stamped `autoConfirmed: true` (full attendance assumed —
consistent with projections). Guarded by "runs once": any existing confirmation aborts it.
> **IF** the seed's floor (`accountCreatedIdx`, stamped by §7 F5) or its emptiness guard
> changes, **THEN** two failure shapes open up: (a) seeding *past* the floor marks weeks
> the user should have confirmed; (b) any code path that ever writes `weekConfirmations`
> to `{}` re-arms this effect and bulk-stamps everything — the Phase-2 "reset all
> confirmations" owner tool must account for this before it's built
> (`docs/admin-toolkit-todo.md`). Check: fresh account created mid-year shows zero
> unconfirmed badge for pre-creation weeks and prompts only from creation week onward.

**F27 · Confirmation eligibility chain** — `eligiblePastPayWeeks` `App.jsx:1022–1027` →
`confirmTriggerWeek` `:1031–1034` → `unconfirmedCount` `:1038–1041` — **[G]**
Eligible = `active && isPayWeek && isPayPeriodPast && idx >= accountCreatedIdx`.
`isPayWeek` comes from `buildYear` (every active week for weekly; every-other via
`biweeklyPayWeekParity` for biweekly/salary; last-of-month for monthly). The modal
surfaces the most recent unconfirmed; the badge counts all of them.
> **IF** `buildYear`'s `isPayWeek` assignment or `biweeklyPayWeekParity` semantics change
> (Spine A / §7 Step 2), **THEN** the modal starts prompting on non-paycheck weeks — and
> the paired-week auto-confirm in F31 writes records for the wrong siblings. Check: a
> biweekly account gets exactly one prompt per two-week period, on the paycheck week.

**F28 · `taxDerived` withholding-gap engine** — `App.jsx:1122–1170` — **[L]**
The panel's tax spine: recomputes full-year fed/state liability from
event-adjusted taxable gross (`adjustedTaxableGrossByWeek`, fed via `fedTax`, state via
`getStateConfig`/`stateTax` with `moFlatRate` legacy fallback), subtracts scheduled
withholding (`remediationTaxedForWeek`: past weeks honor `pastWeekTaxStatusOverrides`,
future weeks always follow `taxedBySchedule`), and spreads the remaining gap —
minus `targetOwedAtFiling` — across remaining taxed checks as `extraPerCheck`.
`extraPerCheck` then feeds `computeNet` everywhere (F29, §8 F14/F15).
> **IF** any input list changes — `taxedWeeks` derivation (§7 F5), override semantics
> (past-only!), `fedStdDeduction`, state table, `targetOwedAtFiling` — **THEN** the gap
> and every net in the app move together; verify via Live State Inspector
> (`extraPerCheck`, `totalGap`, `taxedWeekCount`) against the Tax Weeks Grid's cell
> states, and the Year Summary card.
> **⚠ Known stale-dep finding (this pass):** the memo *uses* `effectiveToday` (`:1127`,
> past/future split) but its dep array (`:1170`) lists only `today` — and `:1148` uses
> real `today` for `remainingTaxedChecks`. Under admin Lock Date, the override
> remediation split does not recompute when the lock changes (until another dep moves),
> and the two lines disagree about what "now" is. See Block 4, finding 1.

**F29 · Net derivation tiers** — `projectedAnnualNet` `App.jsx:1173–1175`,
`weekNetLookup` `:1217–1233`, `futureWeekNetsRaw`/`futureWeekNets` `:1235–1242` — **[L]**
Three deliberate tiers off one `computeNet` core: `projectedAnnualNet` (all active weeks,
no buffer), `futureWeekNetsRaw` (spendable = net − buffer; feeds goal *timeline* display),
`futureWeekNets` (adjusted-spendable including per-week event adjustments; feeds goal
*funding* simulation). `weekNetLookup` is the per-week record (baseNet / adjustment /
spendable) the admin Week Inspector's "Net Lookup" section displays verbatim.
> **IF** the raw-vs-adjusted split collapses (someone "simplifies" to one array), **THEN**
> goal ETAs double-count or ignore logged events depending on direction — the two arrays
> exist because those consumers need different answers. Check: log a missed shift; the
> goal timeline bar (raw) stays put while goal funding ETA (adjusted) moves.

**F30 · `finalizeWeek` two-week router** — `WeekConfirmModal.jsx:347–361`,
`handleSameDaysYes` `:379–394`, gate `isBiweeklyTwoWeek` `:98` — **[G→L]**
Every confirm path routes through this interceptor. Non-biweekly: pass-through. Biweekly
with an active prior week: sub-week 1 stashes its result and raises the "same days?"
prompt; "Yes" *mirrors* the selection onto the paycheck week (fresh log id, fresh
`confirmedAt`, remapped `weekEnd`/`weekIdx`/`weekRotation`); "No" re-collects week 2.
Either way `onConfirm` fires **once** with the first week bundled under
`confirmation.firstWeek`.
> **IF** the mirror copies a new field it shouldn't (or misses one it should remap),
> **THEN** week 2's log entry silently carries week 1's identity — check every field
> `handleSameDaysYes` remaps stays in sync with the log-entry shape (`LogPanel`'s event
> schema, T6). **IF** `isBiweeklyTwoWeek`'s definition changes, **THEN** salary must stay
> *excluded* (salary uses F31's paired auto-confirm fallback instead — two different
> mechanisms for the same "two weeks, one check" fact).

**F31 · Check-in `onConfirm` consumer** — `App.jsx:3287–3342` — **[L]**
The persistence half: strips `firstWeek` out of the stored paycheck record (no duplicate
log blob), stores the explicit first-week record when present, else auto-confirms the
paired prior week clean (biweekly first period + salary), fills the rest of the month for
monthly, appends up to two log entries, then **one** `savePersistedStateNow` carrying
both `weekConfirmations` and `logs`. The value is computed synchronously — the comment
records the production incident (lost check-ins on backgrounded tabs) this prevents.
> **IF** a new pay schedule (or a change to pairing/month-fill rules) is added, **THEN**
> its auto-confirm branch must write the same record shape as F26 (`autoConfirmed: true`,
> `eventId: null`, day toggles from `workedDayNames`) and stay inside this single
> eager-save — a second save call or a functional-updater rewrite reopens D3. Check:
> confirm a check-in, kill the tab immediately, reload: record + log both present.

**F32 · Reopen Last Check-In (admin)** — `reopenableWeekIdx` `App.jsx:1046–1049`,
`handleReopenLastCheckIn` `:1055–1068` — **[G]**
Deletes the most recent confirmed record (and its spawned log entry) so the modal
reopens; projections are independent of confirmations so the model is untouched.
> **IF** confirmation records ever gain model-affecting weight (they currently don't),
> **THEN** this tool's "safe to drop" premise breaks — re-read its CLAUDE.md description
> before extending. **⚠ Soft-D3 finding (this pass):** both deletes are bare
> `setState` calls with no eager save — see Block 4, finding 2.

**F33 · IncomePanel display layer** — `gN` wrapper `IncomePanel.jsx:65`, rolling view
`:100–103`, Year Summary `:93`/`:263`, TX/EX chips `:411–412` etc. — **[L]**
Pure consumer: `gN(w) = computeNet(w, config, extraPerCheck, showExtra)` for every row;
`deriveRollingIncomeWeeks(allWeeks, today, 4)` splits visible vs. `hiddenWeeks` archive
(never deletes); `progressiveScale` densifies rows toward EOY; the Year Summary card
displays `adjustedTakeHome` — the *same single value* HomePanel and LogPanel read
(`logTotals.adjustedTakeHome`, §8 F17) — by design, no local recomputation. TX/EX chips
read `w.taxedBySchedule` (schedule truth), not the F28 remediation view.
> **IF** any row/summary number here stops flowing through `gN`/`adjustedTakeHome` and
> grows a local formula, **THEN** that's D1 by definition — this panel deliberately owns
> zero math. Check: Year Summary equals Home's year figure to the cent; a week row's net
> equals Week Inspector's `computeNet` for that week.

**F34 · Sharpen Rates modal** — `applySharpener` `IncomePanel.jsx:41–57` — **[L]**
The post-wizard rate refinement: derives effective fed/state rates from a real paystub,
writes `fedRateLow/High` + `stateRateLow/High` **and** the legacy `w1/w2` mirrors in the
same patch, clears `taxRatesEstimated`, compute-then-eager-saves (compliant).
> **IF** a rate field is renamed or the legacy mirror dropped, **THEN** F28's fallback
> chain (`fedRateLow ?? w1FedRate`, `:1141–1144`) must change in the same commit — and
> the three-way sensitive-field rule (§7 F7: `DIFF_FIELDS` + `HISTORY_SENSITIVE_FIELDS`)
> applies to every rate field this writes. Check: after Sharpen, DB Row Viewer's config
> history shows the rate change captured; Wrap Up preview (§7 F6) uses the new rates.

### 9.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `buildYear` week fields consumed here (`isPayWeek`, `payPeriodEndDate`, `taxedBySchedule`, `workedDayNames`, `isHighWeek`, `taxableGross`) | F25–F31 all key off them; Week Inspector field display | `finance.test.js` week-shape cases; one biweekly + one DHL manual pass through a check-in | D1/D2 |
| `computeNet` signature/ordering (Spine A) | `gN` (F33), F29's three tiers, `resolvePrevWeekNet` (§8 F15), Wrap Up preview pair (§7 F6) | Week Inspector Pay vs. Net Lookup sections agree; row net = inspector net | D1 |
| `pastWeekTaxStatusOverrides` write path (Tax Plan toggles, `debc0cb`) | F28's past-only remediation; Tax Weeks Grid red dots; eager save on each toggle | Toggle a past week; `extraPerCheck` shifts; kill-tab test survives | D3 |
| `taxedWeeks`/`taxExemptOptIn` (§7 F5) | F28 gap math; TX/EX chips (F33); `remainingTaxedChecks` divisor — zero taxed checks must yield `extraPerCheck: 0`, not `NaN` | Tax-exempt account: gap card shows liability with $0/check spread, no NaN | D1 |
| `accountCreatedIdx` stamping (§7 F5) | F26 seed floor, F27 eligibility floor | Mid-year fresh account: no pre-creation prompts | D2 |
| Log-entry schema (T6) | F30's mirror remap fields, F31's append, `record.eventId` linkage used by F32's delete | Reopen tool removes exactly the check-in's own entry, nothing else | D1 |
| `deriveRollingIncomeWeeks` / `progressiveScale` (Spine A) | F33 visible/archive split; HomePanel's month timeline (same module, §8) | `rollingTimeline` unchanged-since-2026-04 note in active-systems §2 — update it if touched | D5 |
| UpgradePanel replacement gating (§21, T9) | This panel has **no** internal `readOnly` shadow — it relies on being fully replaced when expired | If expired-mode ever renders IncomePanel, every mutation (F34, tax toggles) is live — the shadow must be added first | D4 |

### 9.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| Pay schedule | weekly / biweekly / salary / monthly | Prompt cadence: every week / paycheck weeks only (parity) / paycheck weeks with silent paired auto-confirm / one prompt + month-fill. Two-week collection UI: biweekly only (F30); salary explicitly excluded |
| Employer | DHL / base | DHL: Mon 6:01 AM trigger, rotation labels on rows; base: midnight-after-`payPeriodEndDay` |
| `isAdmin` | false / true | true: Week Inspector on row tap (`onWeekInspect`, `App.jsx:1533`), Reopen tool, Lock Date hour-gate bypass (F25); false: rows inert, no reopen |
| Entitlement | entitled / expired | Expired: entire panel replaced by `UpgradePanel` (T9) — no partial render, no internal readOnly gate exists |
| `jobLossMode` | false / true | true: Income tab removed from nav and force-redirected (`App.jsx:337`) — panel unreachable |
| Lock Date | unset / set | Set: `effectiveToday` drives F25–F27 and displays; F28's stale-dep finding means tax remediation may lag the lock (Block 4.1) |

### 9.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Lost check-ins on backgrounded tabs* — the original D3 incident; F31's comment block
  is the in-code memorial. Kill-tab-and-reload is the canonical regression test.
- *Income projections misaligned to job start* (`9110e5f`, 2026-06-28) — projections once
  ignored `firstActiveIdx`; alignment now flows from §7 F1/F5. Any new "annual" figure
  must scope to active weeks (same family as §8's H11 dilution).
- *Biweekly two-week collection* (`7f0e36d`) — one check, two weeks, one `onConfirm`;
  the salary-vs-biweekly mechanism split in F30/F31 is deliberate, not an inconsistency.
- *Tax-toggle eager saves* (`debc0cb`) — per-week taxed/exempt toggles were on the
  debounce; now every toggle saves immediately.

**Standing findings from this pass (open — decisions owed):**
1. **Stale memo dep in `taxDerived` (F28)** *(queued as DW-2 in `docs/BUG_FIX_TODO.md`)*:
   uses `effectiveToday` at `App.jsx:1127` but
   deps at `:1170` list only `today`; `:1148` independently uses real `today`. Under
   admin Lock Date the remediation split lags until an unrelated dep changes, and
   "remaining taxed checks" ignores the lock entirely — the Lock Date tool's core promise
   (simulate a date and read these exact numbers) is weakened. Admin-only blast radius.
   Fix candidates: add `effectiveToday` to deps and decide whether `:1148` should honor
   it; needs owner intent on Lock Date's scope over tax math.
2. **Reopen Last Check-In lacks eager save (F32)** *(queued as DW-3 in
   `docs/BUG_FIX_TODO.md`)*: deletion of the confirmation record +
   its log entry rides the 800ms debounce (bare functional `setState`s, `App.jsx:1059–1065`),
   contrary to the CLAUDE.md rule that Delete-shaped actions eager-save. Worst case is
   mild (admin-only; a lost delete resurrects a valid confirmation), but it's the only
   confirmed rule exception on this surface. Cheap fix: compute both next values
   synchronously and pass through one `savePersistedStateNow`.

---

## 10. T4 — Budget Panel Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F35+).
**Git-history note:** the governing intentions here are the June-16 trilogy (`d8c475a`,
`d42c118`, `6fb0619`) that implemented the **locked Decisions 1–3** on expense-save
semantics (decision record preserved in `docs/BUG_FIX_TODO.md`'s archived section — do
not re-litigate without sign-off), the `764da5b` eager-save wrapper, and the July
Job Loss rebuild (`7375c36`, `cd0480f`, `6a3e406`). Goals are *not* on this surface —
they moved wholly to Home 2026-05-12 (`50c1243`); this pass corrected active-systems §4
and the §4.1 hierarchy rows accordingly.

**Scope:** `BudgetPanel.jsx` (2,579 lines), `JobLossBudgetPanel.jsx`, `BulkEditPanel.jsx`,
`MonthQuarterSelector.jsx`, `DueDatePicker.jsx`, and the `expense.js` helper layer
(Spine A) they consume.

### 10.1 Block 1 — Critical inventory (function by function)

**F35 · `applyExpenseUpdate(updater)`** — `BudgetPanel.jsx:96–100`, twin at
`JobLossBudgetPanel.jsx:53–56` (and `ReemploymentTracker`'s `applyConfigUpdate`, §8 F22) — **[L]**
The canonical eager-save wrapper: captures the functional updater's result and passes
the same value to `setExpenses` **and** `onSaveExpensesNow`. Every expense/loan mutation
in both files routes through it — that's what makes the whole surface D3-safe with ~30
call sites unchanged internally.
> **IF** any new mutation calls `setExpenses` directly instead of `applyExpenseUpdate`,
> **THEN** that one action silently rides the debounce — D3 reopened on exactly one
> button. Check: grep `setExpenses(` in both files — only the wrapper (and the readOnly
> shadow declaration) may reference it.

**F36 · `displayMonthKey` + `displayEffective`** — `BudgetPanel.jsx:241–242` — **[L]**
The display anchor: `activeMonth ?? (current quarter ? currentMonthKey :
QUARTER_FIRST_MONTHS[ap])`. The current-quarter clamp to *current month* is the Bug-2
fix (`d42c118`) — quarter cards once read elapsed April and showed $0 for June-onward
adds. Every card total and the headline flow through `displayEffective` →
`getEffectiveAmountForMonth`.
> **IF** the anchor logic changes (or any display surface reads `history` directly
> again), **THEN** the same expense shows different numbers across cards vs. projections
> — the exact incident class Decisions 1–3 closed. Check: fresh account, quarter view,
> add an expense "Month+ Onward" — card must show the amount, not $0; `expense.test.js`.

**F37 · The save-scope writer family** — adds `addExpFromMonthForward:704` /
`addExpAllQuarters:730`; saves `saveThisMonth:780` / `saveFromMonthForward:791` /
`saveThisQuarterOnly:820` / `saveAllQuarters:845` / `saveAllQuartersFull:870`; clears
`:892–930`; `restoreExpense:951–960` — all via pure helpers in `expense.js`
(`applyMonthEdit*`, `applyQuarterForward`, `applyAllQuarters`, `clearMonth*`,
`onwardStartMonthKey`) — **[L]**
Governed by the locked decisions: **(1)** broad saves overwrite finer overrides in
range; **(2)** "Onward" = current month → Dec, elapsed months untouched; **(3)**
`monthlyOverrides` is the authoritative layer, `history` the baseline. Every button
writes the *precise* month-key set its label promises.
> **IF** a new save scope is added or a helper's month-window changes, **THEN** re-walk
> the decision table in `BUG_FIX_TODO.md` (archived section) — the failure mode is a
> save that silently loses to a shadowing override, or one that back-dates
> `effectiveFrom` into elapsed months. Check: `expense.test.js`'s scope-precision cases
> (each button's exact month set) must be extended, not just pass.

**F38 · `getEffectiveAmountForMonth` resolution contract** — `finance.js:749` (Spine A),
consumed by F36, `computeRemainingSpend`, budget health, Coach context — **[L]**
Override-first, `history` fallback. The single resolver for "what does this bill cost in
month M" — Coach context and the panel must both resolve through it (§24 grounding
case law: a `billingMeta`-derived estimate once disagreed by double digits).
> **IF** resolution order or fallback rules change, **THEN** every consumer moves:
> panel cards, `computeRemainingSpend` (spend/goal projections), budget health, Coach's
> per-expense lines. Check: one expense with both an override and a history entry —
> all four surfaces quote the same number.

**F39 · Mandatory Food floor** — `MIN_FOOD_WEEKLY` `BudgetPanel.jsx:106–107`,
`belowFloor` gate `:2470–2471` (disables all five save buttons) — **[G]**
$75/week scaled by `perCheckFactor`. The Food expense is the app's only mandatory
expense; the floor blocks edits below it. Couples to §7 F8: jobless first-runs skip the
Food seed; Back to Work restores it (`ensureInitialFoodExpense`).
> **IF** the floor value, the mandatory-expense set, or the seed/restore pair changes,
> **THEN** all three places move together (wizard seed logic, this floor gate, restore
> path) — a Food expense deleted through a gap here breaks the "budget always has food"
> product invariant. Check: `jobLossFlow.test.jsx` + attempt to save Food below floor.

**F40 · Drag-and-drop reorder** — `reorderExpenseByInsert` `BudgetPanel.jsx:1046+`,
drop sites `:1427`/`:1569` — **[L/G]**
Mouse + touch (450ms hold) reorder with cross-lane (Needs↔Lifestyle) support. Persists
via F35 **once, on drop** — deliberately not on `dragover`.
> **IF** reorder persistence is ever attached to a continuous event (dragover, live
> preview), **THEN** it fires a network write per pixel — the exact anti-pattern
> CLAUDE.md's eager-save section forbids. Check: one drag = exactly one save call.
> Cross-lane moves also rewrite `category` — verify Lifestyle↔Needs affects
> `weeklyBurn` in Job Loss Mode (F44) and budget-health splits.

**F41 · Loans cluster** — `editLoan` `:1272–1274`, `addLoan` `:1285–1288`, `deleteLoan`
`:1293`; math: `computeLoanPayoffDate` `finance.js:1119`, quarter-safe
`buildLoanHistory` `finance.js:1129`, `loanPaymentsRemaining`, `loanWeeklyAmount` — **[L]**
Loans are expenses with `loanMeta`; **every edit regenerates the entire `history` from
`loanMeta`** (`history: buildLoanHistory(meta)`) — the documented D2 exemplar (§5 known
gap: editing terms retroactively rewrites past weeks). Quarter-safe payoff: the runway
entry ends the day *after* the quarter-end containing the payoff date.
> **IF** touching loan math, **THEN** know you are inside the app's standing D2 zone:
> do not add new consumers of regenerated history that assume it's point-in-time
> truthful for past weeks. The planned fix is an expense-style `history[]` follow-up
> (TODO §19) — extend that, not the regeneration. Check: a mid-quarter payoff keeps
> paying through quarter close; past-week spend totals unchanged after a term edit is
> the *aspiration*, currently violated by design.

**F42 · Bulk edit (ADV. EDIT)** — `BulkEditPanel.jsx:16` (pure collector), wired at
`BudgetPanel.jsx:1310–1318`, commits through `saveAdvancedEdit` →
`buildAdvancedEditPayload` (`expense.js:316`) → F35 — **[L]**
Multi-expense edit/delete/add in one pass, anchored to `displayMonthKey`'s month.
> **IF** the payload builder's scope semantics diverge from the single-expense buttons
> (F37), **THEN** the same edit made two ways produces different override sets. Check:
> edit one expense via sheet and via bulk with identical inputs — identical stored shape.

**F43 · Tax Plan gate (consumer)** — `taxFeatureUnlocked` `BudgetPanel.jsx:82`, used
`:2103` — **[G]**
`canAccessTaxPlan({isAdmin, taxProjectionsEnabled, isTester})` — display-only here
(tax-exempt week info). The *writers* (per-week taxed/exempt toggles →
`pastWeekTaxStatusOverrides`) live in **ProfilePanel** (T5, eager-saved since
`debc0cb`); the math consumer is F28 (T3). `a430fbf`: the unlock is manual-only
(liability hold) — setup's tax-exempt opt-in alone never surfaces it to a normal user.
> **IF** this gate's inputs change, **THEN** BudgetPanel and ProfilePanel must gate
> identically (same function, same args) and `isAdmin` must remain a structural
> superset of `isTester` (`a643153`, built on `hasTesterAccess`). Check: tester
> account sees Tax Plan in both places; plain user with `taxExemptOptIn` sees neither.

**F44 · Job Loss budget surface** — `JobLossBudgetPanel.jsx`: triage `setStatus:152`,
`toggleAutoReactivate:153`, `pauseAllFlexible:156`, `removeExpense:159`, inline add
`:171–176` (stamps `trackDuringJobLoss: true` + `dueDateAnchor`); `upcomingBills`
`:116–130` (due-date countdowns, active bills only); runway via `computeJobLossRunway`
`:91`; benefit-scenario toggle `includeBenefits` lifted to App state (**session-only,
deliberately unpersisted**, shared with JobLossHomePanel so both quote one scenario) — **[G→L]**
> **IF** triage status values (`active`/`paused`/`cancelled`) or `trackDuringJobLoss`
> semantics change, **THEN** check every reader: `weeklyBurn` (Needs-only, active-only —
> `jobLossRunway.js`), `upcomingBills` filter, Back to Work auto-reactivation (§7 F11),
> and the F24 quarantine's filter drift. **IF** `includeBenefits` is ever persisted,
> **THEN** that's a product decision reversal — its session-only nature is documented
> intent (`:23` comment), not an oversight. Check: toggling the scenario on one panel
> changes the other; kill-tab keeps triage states but resets the scenario toggle.

### 10.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `expense.js` cycle/conversion helpers (`toMonthlyCost`, `perPaycheckFromCycle`, `CHECKS_PER_MONTH`, `normalizeCycle`) | Every card amount, `minFoodPerCheck` scaling, breakdown displays (`bddeb04`/`8e669e3` fixed over-counting here once), Coach per-expense lines | `expense.test.js`; a monthly-cycle bill shows the same cost on card, breakdown, and Ask Coach | D1 |
| `getEffectiveAmountForMonth` / `getPhaseIndex` (Spine A) | F36/F38 consumers + `computeRemainingSpend` + budget health month boundary + Coach grounding | One expense with override + history: all surfaces agree | D1 |
| `monthlyOverrides`/`history` storage shape | F37's five writers + F42 bulk payload + restore sheet + DB `expenses` column shape | `expense.test.js` round-trip case; DB Row drift badge clean after each save scope | D2/D3 |
| Expense `category` values (Needs/Lifestyle) | F40 cross-lane rewrite, Job Loss `weeklyBurn` (Needs-only), budget-health splits, `pauseAllFlexible`'s flexible-category filter | Move a bill across lanes; runway + health both shift accordingly | D1 |
| `loanMeta` fields / `buildLoanHistory` regeneration | F41 zone — payoff cards, Job Loss due-date attach (`loanMeta.firstPaymentDate`, §7 F12), quarter-close behavior | `finance.test.js` loan cases; mid-quarter payoff manual check | D2 |
| `jobLossStatus`/`trackDuringJobLoss` flags | F44 readers + JobLossEntry's review step (§7 F12) + Back to Work reactivation (§7 F11) | `jobLossFlow.test.jsx` | D1/D4 |
| `canAccessTaxPlan` inputs (Spine C) | F43 here + ProfilePanel's Tax Plan section — identical gating | Tester/admin/plain × opt-in matrix | D4 |
| A new mutation-capable prop into either panel | readOnly noop shadows (`:87–89`, JLBP `:43–47`) | Prop in shadow list; expired-account no-op test | D4 |

### 10.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| `readOnly` (paywall-expired) | false / true | true: F35 wrapper noop'd in both panels; categories force-collapsed and headers inert (`:1415`/`:1455`); add/edit UI hidden (`:1744`, `:1995`) |
| `config.jobLossMode` | false / true | true: `JobLossBudgetPanel` replaces BudgetPanel (`App.jsx:1536`); triage inline; simplified add form stamps `trackDuringJobLoss` |
| View mode | overview / month (`activeMonth`) / quarter (`ap`) | Save-button sets differ (month buttons vs Q buttons, `:2494–2506`); `displayMonthKey` anchor per F36; current quarter clamps to current month |
| `taxFeatureUnlocked` | false / true | true (admin, tester, or manual `taxProjectionsEnabled`): tax-exempt week info at `:2103`; false: invisible even with `taxExemptOptIn` (`a430fbf`) |
| Expense kind | regular / mandatory Food / loan | Food: floor-gated saves, cannot delete (restored on Back to Work); loan: separate CRUD, history regenerated from `loanMeta`, excluded from regular breakdown rows |
| Pay schedule | weekly / biweekly / salary / monthly | `cpm` (4/2/2/1) drives per-check math; `perCheckFactor` scales floor + displays; "/wk" vs "/check" labels |

### 10.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Bugs 1–2 + Decisions 1–3* (June 16 trilogy `d8c475a`/`d42c118`/`6fb0619`) — the
  fullest decision record in the repo, archived in `BUG_FIX_TODO.md`. Quarter saves once
  wrote only `history` and lost to shadowing overrides; display anchored to elapsed
  months showed $0. The locked decisions govern every future F37 change.
- *Breakdown over-counting* (`8e669e3`, `bddeb04`, 2026-06-23) — monthly/yearly bills
  double-counted in the budget breakdown until displays were rooted on 30-day cost.
- *Per-week storage normalization* (`6e9fbda`, 2026-05-15) — expense weekly amounts are
  stored per-week for **all** pay schedules; display scales by `cpm`/`perCheckFactor`.
  Any writer storing a per-check amount raw re-breaks biweekly accounts.
- *iOS sheet/drag fixes* (`95c449c`, `4f23df8`, `c0224ce`) — bottom-sheet buttons and
  drag auto-scroll needed portal + hit-test work; regressions here resurface as
  "buttons don't respond on iPhone".
- *Tester gate + structural superset* (`a643153`) and *manual-unlock liability hold*
  (`a430fbf`) — F43's two governing commits.

**Standing findings from this pass:** none new — every mutation site on this surface
verified through F35's wrapper (the `764da5b`/`cd0480f` audits hold), and the readOnly
shadows cover all threaded mutation props. The D5 corrections (goals location in
active-systems §4 + this doc's §4.1 hierarchy rows) were applied in-pass per protocol.
The F41 loan D2 zone remains the surface's known open debt, already tracked as
TODO §19's loan follow-up — not filed as a DW defect since it's a designed-in gap with
an owned roadmap entry, but queue-visible as watch item **DW-W1** in
`BUG_FIX_TODO.md`.

---

## 11. T5 — Redefinition Record: "Benefits Panel" → Account Panel

**Pass date:** 2026-07-19. T5 was investigated for a full surgical pass as "Benefits
Panel" (the foundation pass's guess at the fifth panel) and found to be a phantom —
then redefined per owner correction: **the five nav panels are Home, Income, Budget,
Log, Account**, so T5 is the **Account Panel** (`ProfilePanel.jsx`), and its full
surgical pass is still pending (§6 checklist). T-numbering is preserved; this section
records the investigation so the dead-code findings survive as case law.

### 11.1 What the investigation found

- **`BenefitsPanel.jsx` (553 lines) is dead code.** It is imported by no module and
  reachable from no nav entry (`NAV_ITEMS`/`BOTTOM_NAV`, `App.jsx:40–45`, have no
  benefits key). The repo's visible history begins at PR #333 (2026-05-04) and the file
  was *already orphaned then* — no commit in 487 visible commits ever rendered it. Its
  only touches since are blanket sweeps: the press-feedback rollout (`973c399`) and the
  coverage pass (`12f5441`), which added tests to what was already dead code.
- **The living benefits features split across two surfaces:**
  - **Displays** — 401k projected employee/employer contributions (event-adjusted),
    enrollment countdown, and the PTO accrual/goal tracker — live in **`LogPanel.jsx`**
    (ported; see the marker comment at `LogPanel.jsx:86` and the `k401`/`ptoGoal` block
    `:87–97+`). These get their F-entries in the **T6 pass**.
  - **Settings** — benefit enrollment, rates, start dates (`BenefitsDetail`,
    `ProfilePanel.jsx:1295+`, the Account tab's "Retirement & Benefits" sub-view) —
    belong to the **T5 (Account Panel) pass**.
- **Doc drift corrected in-pass (D5):** `active-systems.md` §6 listed
  `BenefitsPanel.jsx` as the system's live file; CLAUDE.md's file-structure map carried
  the same claim. Both now point at the real surfaces and flag the dead file.

### 11.2 Standing redirect

Any future "benefits drift" question routes to: **T6** for a number shown about 401k/PTO
(LEDGER — cross-check `allWeeks`' `k401kEmployee`/`k401kEmployer` sums and
`calcEventImpact`'s 401k/PTO deltas), **T5 (Account Panel)** for who can edit which
benefit setting and how it saves (GATEWAY + eager-save). The shared config fields
(`selectedBenefits`, `k401Rate`, `k401MatchRate`, `k401StartDate`, `benefitsStartDate`,
weekly premium fields) are written by the wizard (§7, Step 3) and by `BenefitsDetail`
(T5), and read by Spine A (`weeklyBenefitDeductions`, `buildYear`) and LogPanel (T6) —
that write-two-read-two square is the drift surface that remains real.

### 11.3 Cleanup queued

Deleting `BenefitsPanel.jsx` (and its coverage tests) is the owner's call — queued as
**DW-4** in `docs/BUG_FIX_TODO.md` (owner-scheduled dead-code cleanup pass: delete the
file + tests and import-graph-sweep for any other orphans in the same investigation)
and mirrored in CLAUDE.md's Known Cleanup list. The risk being managed isn't runtime —
it's someone "fixing" or extending the dead file believing it ships.

---

## 12. T5 — Account Panel Drift Map

**Pass date:** 2026-07-19 (same day as the §11 redefinition — this is the true T5 pass).
Same anchor + method rules as §7; numbering continues (F45+).
**Git-history note:** the governing recent intentions are the structural merge
(`75ab021` — Employment folded into Job & Pay; `e6800ec` — Pay Structure split into
independently editable cards + Life Events entry), the wrong-field fix (`44c0538` — the
cleanest specimen of legacy-field drift in the repo), the Tax Plan unlock chain
(`342d2ae` → `09c7609` → `a430fbf` → `a643153`), and the §17.F subscription surface
(`30bd1be`, `a7573df`). Active-systems §17's sub-view list predated the merge —
corrected in-pass.

**Scope:** `ProfilePanel.jsx` (2,079 lines): the sub-view router, the five Job & Pay
cards, `BenefitsDetail`, `PreferencesDetail`, `TaxPlanDetail`, `AccountDetail` (auth
actions + subscription card), and the Investor Codes entry. The auth/db primitives
these call are T7's scope; the boundary rule is §4.1's three-way note.

### 12.1 Block 1 — Critical inventory (function by function)

**F45 · Sub-view router + Job Loss swap** — `ProfilePanel.jsx:1929–1946` (routes),
`:1959–1993` (mode swap) — **[G]**
`activeSection` state routes to six sub-views. Two gate styles coexist: `taxplan`
re-checks its gate *at the route* (`activeSection === "taxplan" && canSeeTaxPlan`,
`:1941`); `investorcodes` gates only the ListRow (`isAdmin`, `:2019`) — the route
itself (`:1944`) trusts that state can only be set by tapping the row. In Job Loss
Mode the whole Work & Pay group is replaced by one "Back to Work" row (`:1959`) —
deliberate: Job & Pay / Retirement figures would be stale or misleading with no income.
> **IF** `activeSection` ever becomes settable by anything other than a row tap (deep
> link, restored nav state, URL param), **THEN** `investorcodes` needs the same
> route-level re-check `taxplan` has — today's asymmetry is safe only because state is
> tap-only. **IF** the Job Loss swap's row set changes, **THEN** re-check §7 F11
> (`handleBackToWork` is the row's target) and that no hidden row leaks stale figures.

**F46 · The compute-then-save card pattern** — every save site: `EmploymentCard:604`,
`BasePayCard:776`, `DifferentialsCard:890`, `OvertimeCard:995`, `ScheduleCard:1129`,
`BenefitsDetail:1335`, `PreferencesDetail:1507`, `TaxPlanDetail:1596` + `:1604` — **[L]**
All eight follow `const newConfig = {...config, ...patch}; setConfig(newConfig);
onSaveConfig?.(newConfig)` — the file is the reference implementation CLAUDE.md's
eager-save section cites. `onSaveConfig` is `saveConfigNow` threaded from App. Every
save here also transits the config-history watcher (§7 F9) as `"config_edit"`
(effective today) — pay-rate edits additionally get the optimistic `baseRateHistory`
append (§7 F10).
> **IF** a new card or field editor is added to this panel, **THEN** it uses this exact
> shape (computed value to both calls — never a bare functional updater), and **THEN**
> if its field is pay/tax/schedule-sensitive it must appear in
> `HISTORY_SENSITIVE_FIELDS` + `DIFF_FIELDS` (the §7 F7 three-way rule). Check: DB Row
> Viewer's config-history line captures the edit; kill-tab test survives.

**F47 · ScheduleCard field-priority contract** — `ScheduleCard:1045–1129`; case law
`44c0538` — **[L]**
The weekly-hours editor reads/writes **`maxWeeklyHours` first**; `standardWeeklyHours`
is legacy, kept in sync on write only. The fixed bug: the editor once read/wrote the
legacy field while the finance engine and the read-only label prioritized
`maxWeeklyHours` — an edit that visibly "took" in the form but never reached the math.
Also DHL-gated: the Schedule Override toggle is hidden from base users (`f7ca4ef`).
> **IF** any editor touches a config field that has a legacy twin (`maxWeeklyHours`/
> `standardWeeklyHours`, `fedRateLow`/`w1FedRate`, `stateRateLow`/`w1StateRate`…),
> **THEN** it must read the *primary* field first and write *both* — editing only the
> legacy twin is the exact `44c0538` failure. Check: edit the field, confirm the change
> lands in Week Inspector math, not just the form's own display.

**F48 · Job & Pay composition** — `PayDetail:1265–1275` — **[G]**
Renders the four pay cards + `EmploymentCard` + the Life Events entry point. Employment
and Life Events are *not* standalone Account rows (merge `75ab021`; router comment
`:1973–1977`) — Life Events is otherwise reachable via the sidebar/drawer only.
> **IF** a new pay-structure field is added, **THEN** it belongs in exactly one card
> (they're independently editable — two cards writing one field race each other's
> `config` snapshots), and the wizard's Step 1/2 (§7) remains the other editor of the
> same field — keep both in the §7 F7 three-way lists. Check: edit in card, re-open
> wizard as `structure_change`: value carries; edit in wizard: card shows it.

**F49 · `BenefitsDetail`** — `:1295–1490s`, save at `:1335` — **[L]**
The settings half of the benefits square (§11.2): writes `selectedBenefits`,
`k401Rate`, `k401MatchRate` (base users; DHL derives via `dhlEmployerMatchRate`),
`k401StartDate`, `benefitsStartDate`, and weekly premium fields. Read by Spine A
(`weeklyBenefitDeductions`, `buildYear`'s 401k columns) and displayed by T6
(LogPanel's ported 401k/PTO sections, which honor the same
`k401StartDate || benefitsStartDate` fallback — `LogPanel.jsx:91–92`).
> **IF** the start-date fallback order or any benefit field changes, **THEN** the same
> fallback must hold in all three readers (this card's display `:1300–1305`, LogPanel
> `:91–92`, Spine A) — and the wizard's Step 3 (§7, `BENEFIT_OPTIONS` loop) writes the
> same fields. Check: set only `benefitsStartDate`; LogPanel countdown and this card
> both label it "(benefits start)".

**F50 · `TaxPlanDetail` writers** — `setPastStatus:1587–1597` (past-week
`pastWeekTaxStatusOverrides`), `toggleWeek:1599–1605` (**direct `config.taxedWeeks`
mutation** for future weeks), plus the `showExtra` switch — **[L]**
The only user-facing writers of the two fields F28 (T3) consumes. Both eager-saved
(`debc0cb`). Note the asymmetry is *by design*: past weeks are overridden via the
overrides map (schedule stays intact); future weeks edit `taxedWeeks` itself —
diverging it from §7 F5's wizard derivation is user intent, not drift.
> **IF** either writer's field shape changes, **THEN** F28's remediation logic
> (past-only override honor) and the admin Tax Weeks Grid's red-dot rendering both
> read the same shapes — walk both. **IF** a re-run of the wizard recomputes
> `taxedWeeks` (§7 F5 does!), **THEN** know that manual `toggleWeek` edits are
> *overwritten by design* on wizard completion while `pastWeekTaxStatusOverrides`
> survive (separate field) — any change to that survivorship split is a product
> decision, surface it.

**F51 · `PreferencesDetail`** — `:1494–1567`; buffer save `:1503–1509` — **[G/L]**
Buffer editor (On/Off + amount, clamped 0–200 — same `BUFFER_MAX` cap as the wizard's
Wrap Up, §7 F5's `?? 50` default) and the Tax Exempt display row (lock icon when the
tax feature is locked, `d6bfecf`; label deliberately says "Standard withholding" for
everyone locked, since `taxExemptOptIn` without the unlock is ignored by the math).
> **IF** the buffer cap/default changes here or in the wizard, **THEN** both editors
> and `bufferPerWeek` (§8 F14) move together — three sites, one number. Check: set
> $200 here, Wrap Up shows $200; Live Inspector `bufferPerWeek` matches schedule
> scaling.

**F52 · `AccountDetail` auth actions** — `:86–345`: change email `:120–135`, change
password `:171` (hidden for Google-only accounts — no email identity, `6e123e8`,
`:113–117`), link Google `:198`, global sign-out `:186–193`, **hard delete**
`:317–345` (type-DELETE confirmation → `POST /api/delete-account` with bearer token →
global sign-out) — **[G]**
The delete here is the **true, unrecoverable** path — server-side it does *not*
tombstone into `deleted_accounts`; only the cron's non-payment deletion archives first
(§21). The two delete paths' difference is a product invariant.
> **IF** the delete flow is touched, **THEN** preserve the archive asymmetry (user
> delete = hard, cron delete = tombstone) or escalate it as a product decision — and
> the confirmation text contract (`confirmationText` body field) must match
> `api/delete-account`'s server-side check. **IF** identity-gating changes, **THEN**
> re-walk the Google-only × email-only × linked matrix — the password form must never
> show where re-auth can't succeed.

**F53 · Subscription card + checkout/portal** — `:206–315`: `handleCheckout:210`
(→ `/api/stripe-create-checkout`), `handleManageSubscription:241` (→
`/api/stripe-portal`), status resolution `:269–315` — **[G]**
§17.F surface. Status resolution order is deliberate: raw Stripe `past_due`/`canceled`
take display precedence over the resolved entitlement, and `getEntitlement` is called
with **real wall-clock `new Date()`** — never `effectiveToday`/Lock Date (same rule as
the paywall gate; the comment at `:269–277` records it).
> **IF** anything here starts passing a simulated date into `getEntitlement`, **THEN**
> that's the exact drift the §21 rule forbids (Lock Date must not extend trials or the
> hidden grace); **IF** plan labels/prices change, **THEN** they must match
> `UpgradeCard` (T9's shared pitch) and the Stripe dashboard's real prices — three
> surfaces, one truth. Check: Live State Inspector's Sub Phase vs. this card vs.
> TrialBanner agree on the same account.

### 12.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| A pay/tax/schedule field edited by any card | §7 F7 three-way lists (`DIFF_FIELDS`, `HISTORY_SENSITIVE_FIELDS`), the wizard's step editors, F28's fallback chains (`fedRateLow ?? w1FedRate`) | Three-way grep; edit → config-history line captured; Week Inspector reflects it | D1/D5 |
| Legacy-twin field pairs | F47's read-primary/write-both contract | Edit via card → engine math moves (not just the form) | D1 |
| `canAccessTaxPlan` inputs or unlock flags (Spine C) | F45's `taxplan` route gate + BudgetPanel's F43 consumer + PreferencesDetail's lock icon — all three surfaces | Tester/admin/`taxProjectionsEnabled`/plain matrix across all three | D4 |
| `pastWeekTaxStatusOverrides` / `taxedWeeks` shape | F50 writers ↔ F28 math ↔ Tax Weeks Grid rendering ↔ §7 F5 wizard recompute survivorship | Toggle past + future week; grid dots + `extraPerCheck` move; wizard re-run keeps overrides, resets `taxedWeeks` | D1 |
| Benefits fields / start-date fallback | F49's three readers + wizard Step 3 | Set `benefitsStartDate` only; all surfaces agree | D1 |
| Buffer cap/default | F51 + wizard Wrap Up (§7 F5) + `bufferPerWeek` (§8 F14) | $200 here ↔ Wrap Up ↔ Live Inspector | D1 |
| `api/delete-account` contract or archive semantics | F52's hard-delete invariant vs. §21's cron tombstone path; revival flow (T8/T9) must keep finding only *cron-deleted* accounts revivable | `db.test.js` + revival lookup on a user-deleted email returns nothing | D4 |
| Stripe plan labels/prices/status precedence | F53 ↔ `UpgradeCard` ↔ TrialBanner ↔ Live Inspector Sub Phase | One account, four surfaces, same story | D5 |
| `subscription` prop shape (`db.js` mapping, T7) | F53's status resolution + `getEntitlement` inputs | `db.test.js` subscription mapping cases | D1 |

### 12.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| `config.jobLossMode` | false / true | true: Work & Pay group → single "Back to Work" row (F45); Account/Preferences/admin rows unchanged |
| `canSeeTaxPlan` | false / true | true (admin, tester, or manual flag — never wizard opt-in alone, `a430fbf`): Tax Plan row + route; false: row hidden, route dead-ends, Preferences shows lock icon |
| `isAdmin` | false / true | true: Investor Codes row (row-gated only — F45's asymmetry note) |
| Identity providers | email-only / Google-only / linked | Google-only: password form hidden (`6e123e8`), link-Google hidden; email-only: link offer shown |
| Employer | DHL / base | DHL: Schedule Override toggle visible (`f7ca4ef`), match rate derived via `dhlEmployerMatchRate`; base: manual `k401MatchRate` |
| Entitlement | entitled / expired | **No readOnly gate by design** — expired users need this panel to reach checkout, manage billing, and delete; nothing here mutates the fiscal model except config edits, which remain intentionally live |

### 12.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Wrong-field write* (`44c0538`) — the repo's cleanest legacy-twin drift specimen;
  F47's contract generalizes it.
- *Employment/Life Events merge* (`75ab021`, `e6800ec`) — sub-view structure is one
  level deep by intent; active-systems §17 lagged it until this pass (D5, corrected).
- *Tax Plan unlock chain* (`342d2ae`→`09c7609`→`a430fbf`→`a643153`) — manual-only
  unlock, wizard opt-in never reveals, `isAdmin` structurally ⊇ `isTester`.
- *Dropped-prop crash* (`04b246c`) — `onInstallClick` was dropped in a refactor and
  crashed the whole Account tab; ProfilePanel's 18-prop signature makes it the most
  prop-fragile component in the app — treat any App.jsx wiring change here as
  crash-risk until rendered once.
- *Google-only password form* (`6e123e8`) — identity-gated forms, F52.

**Standing findings from this pass:** none filed as DW defects. The `investorcodes`
route-gate asymmetry (F45) is a hardening note, not a live defect — `activeSection` is
tap-only state and the InvestorAdminPanel's data calls are RLS-gated server-side; it
becomes a real gap only if sub-view state ever gains an external setter, which its
IF/THEN now guards. Queue-visible as watch item **DW-W2** in `BUG_FIX_TODO.md`. The
D5 correction (active-systems §17 sub-view list) was applied in-pass per protocol.
