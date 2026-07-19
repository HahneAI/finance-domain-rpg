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
| T2 | **Home Panel** | G | `HomePanel.jsx`, `JobLossHomePanel.jsx`, `NetWorthHealthTips.jsx`, `CoachNetWorthCard.jsx`, `ReemploymentTracker.jsx` | §14 · §10 (Job Loss home surface) · §4 (goal display/reorder) · §16 (sprints 3/5) | A, B, C, D, E |
| T3 | **Income Panel** | L | `IncomePanel.jsx`, `WeekConfirmModal.jsx` | §1 (display surface) · §2 · §12 · §16 (sprint 2, unshipped) | A, B, E, F |
| T4 | **Budget Panel** | L | `BudgetPanel.jsx`, `JobLossBudgetPanel.jsx`, `BulkEditPanel.jsx`, `MonthQuarterSelector.jsx`, `DueDatePicker.jsx` | §3 · §4 · §5 · §10 (Job Loss budget surface) · Tax Plan gate (§23 consumer) | A, B, C |
| T5 | **Benefits Panel** | L | `BenefitsPanel.jsx` | §6 | A, B |
| T6 | **Log Panel** | L | `LogPanel.jsx` | §8 · §7 (attendance surfaces) · §13 (per-entry admin breakdown) | A, B, F |
| T7 | **Auth System** | G | `ProfilePanel.jsx`, `lib/supabase.js`, `db.js` (account mapping), migrations (RLS, tier columns), `DemoAccountTree.jsx`, `InvestorRegister.jsx`, `InvestorAdminPanel.jsx` | §17 (account management) · §18 · §23 | B, C |
| T8 | **Login System** | G | `LoginScreen.jsx`, `ReviveScreen.jsx`, `TrialExplainerScreen.jsx`, `api/revival-lookup.js` | §17 (auth entry) · §21 (revival detection at sign-in) | B, C |
| T9 | **Paywall System** | G | `App.jsx` (entitlement resolution + `readOnly` fencing), `UpgradeCard/Modal/Panel.jsx`, `TrialBanner.jsx`, `api/stripe-*.js`, `api/cron-subscription-lifecycle.js` + `_lifecycle*.js`, `_email.js` | §21 · §20 | B, C |
| T10 | **UI-UX** | G | `ui.jsx`, `LiquidGlass.jsx`, `index.css` (`@theme`), `useSwipeStack.js`, `PwaInstallModal.jsx`, animation rules | §15 · §16 (primitives) · §19 | E |

Notes on deliberate placements:

- **T7 Auth vs. T8 Login** are split on the session boundary: T8 is every pre-session
  surface (sign-in, sign-up, OAuth, recovery, revival detection); T7 is in-session identity
  truth (account settings, tier flags, RLS, delete-account, investor/demo machinery).
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
| `App.jsx` ↔ `ProfilePanel` | 11 | Account/config wiring (T7) |
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
- [ ] **T2 — Home Panel**
- [ ] **T3 — Income Panel**
- [ ] **T4 — Budget Panel**
- [ ] **T5 — Benefits Panel**
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
| A new sensitive field enters the wizard | `DIFF_FIELDS` (F7), `HISTORY_SENSITIVE_FIELDS` (`configHistory.js:14`), ProfilePanel's Pay Structure cards (T7 — same field, second editor) | Three-way grep for the field name; all three lists/surfaces present or explicitly excluded | D5 |
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
1. **Soft-D3, Quick Rate Update:** `App.jsx:3404–3407` sets `config.baseRate` with *no*
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
