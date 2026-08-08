# Drift App Warden — Authority Finance

**Status:** **Complete** (2026-07-20) — all ten surface tiers (T1–T10, §7–§17) and all six
shared spines (A–F, §2–§9) mapped. F1–F119 catalogued in one running sequence; every entry
verified against live code at its pass date. The doc is now the full drift ledger and the
training foundation for the Drift Warden agent. Maintenance mode from here: the §5 covenant
governs — any change to a mapped file updates its entry in the same PR.
**Created:** 2026-07-19 | **Sources cross-referenced:** `docs/active-systems.md` (all 24 systems),
full git commit history (487 commits, co-change analysis below), live export inventory of every
`src/lib/*` module.

## Notation Legend (quick reference — full definitions in the cited sections)

| Prefix | Meaning | Defined in |
|--------|---------|------------|
| **D1–D5** | The five drift *classes*, each anchored to a real past incident: **D1** parallel formula · **D2** retroactive recompute · **D3** save-path (lost debounced write) · **D4** gate (wrong tier/mode/surface) · **D5** doc/spec vs. shipped code | §2 |
| **L / G** | The two categories every mapped item gets exactly one of: **L**EDGER (computes/stores truth; drift = silently wrong numbers — hunt by cross-checking the source-of-truth function) · **G**ATEWAY (routes/gates/presents; drift = wrong surface for the wrong person — hunt by walking the gate matrix) | §3 |
| **T1–T10** | Top-of-hierarchy surface tiers: T1 Setup Wizard · T2 Home · T3 Income · T4 Budget · T5 Account · T6 Log · T7 Auth · T8 Login · T9 Paywall · T10 UI-UX | §4.1 |
| **Spine A–F** | Cross-cutting shared systems: **A** fiscal math · **B** persistence & save integrity · **C** entitlements & gating · **D** AI layer/context · **E** design system & motion · **F** admin toolkit | §4.2 |
| **F1, F2, …** | Key-function entries — one running number across the whole doc (F1 = `dateToWeekIdx` in T1; numbering never resets), so "F41" is an unambiguous cross-reference from anywhere. Each carries a code anchor + a human-readable IF/THEN drift check | §5 (format), §7+ (entries) |
| **DW-n / DW-W-n** | Work-queue rows in `docs/BUG_FIX_TODO.md`: **DW-n** = confirmed defect found by a drift pass · **DW-W-n** = watch item ("not a bug, but could use attention"), with its promotion condition stated | §1 (offload protocol) |

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
| D1 | **Parallel-formula drift** — a second implementation of an existing calculation is written instead of reusing the authoritative one; the two answers diverge over time | `coachTriggers.js#estimateRunwayDays` re-derived runway math instead of calling `computeNewJobSeasonRunway()`; it doesn't know about `trackDuringNewJobSeason` or `newJobSeasonCashOnHand` and gives different answers (active-systems §10 known gaps). Same class: aiContext once derived per-expense cost from `billingMeta` instead of `history[]` — off by double digits vs. the UI (§6, fixed 2026-07-16). |
| D2 | **Retroactive-recompute drift** — a "current value" edit silently rewrites already-elapsed history because the consumer applies config uniformly across time | `buildYear()` applies one flat `cfg` to all 52 weeks, so a mid-year pay edit distorts past-week totals and annual tax (§1 known gap); `buildLoanHistory()` has the same root cause (§5). §5's `account_history` captures changes but nothing reads it yet — the drift is *live*, only fenced. |
| D3 | **Save-path drift** — a new mutation handler relies on the 800ms debounce instead of the eager-save pattern; backgrounded mobile tabs lose the write | Caused real production data loss across setup wizard, weekly check-ins, tax-plan toggles, goals/expenses/log entries before the 2026-07-18 audit (`CLAUDE.md` Persistence section). Every new Save/Confirm/Add/Delete since must call `saveXNow(computedValue)` synchronously. |
| D4 | **Gate drift** — a feature surface checks the wrong tier flag, or a new surface forgets a gate entirely, collapsing the deliberate `is_admin` / `is_tester` / `is_investor` separation or the paywall `readOnly` fence | The tier division is explicitly documented as fragile ("never treat one as implying another", CLAUDE.md Account Tiers); the `readOnly` no-op shadow must extend to every *new* eager-save prop or an expired account bypasses the paywall through the eager path (CLAUDE.md readOnly gate). Coach's New Job Season context line shipped wired to a value `App.jsx` never passes — rendering bare `"New Job Season: active"` (§10) — the wiring variant of the same class. |
| D5 | **Doc/spec drift** — the documented behavior and the shipped behavior diverge, so the *next* change is built on a false premise | TODO §1's checkbox state understated what New Job Season had shipped; §8 Monetization was "almost entirely shipped" but absent from active-systems until 2026-07-07; a dead `weeklyIncome*52` fallback in HomePanel survived until §1.H11 diagnosed "This Week's Check" showing a diluted fraction of a real paycheck. |

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
  `getEffectiveAmountForMonth`, `computeNewJobSeasonRunway`, `getEntitlement`, …). Writing a
  local approximation is the D1 pattern and is a drift finding by definition.

### Category G — GATEWAY *(routing · gating · presentation)*

Anything that decides **who sees what, when, and how it looks**. Auth/session flow, tier
flags and entitlement *enforcement points*, app-mode routing (New Job Season, paywall
`readOnly`, admin surfaces), wizard step visibility, nav, design tokens, animation rules,
Liquid Glass purposes.

- **Drift symptom:** the wrong person sees (or is denied) the wrong surface, or a surface
  violates the design system. Visible in principle — but usually only on account tiers,
  app modes, or devices the developer wasn't testing as. (Case law: D4, D5.)
- **Hunt method:** *walk the gate matrix.* Every G entry names the flags/modes that branch
  its behavior. Verification means enumerating the affected cells (base user × DHL ×
  admin × tester × investor × trial/grace/expired × newJobSeasonMode × readOnly) and confirming
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
| T1 | **Setup Wizard** | G | `SetupWizard.jsx`, `LifeEventMenu.jsx`, `NewJobSeasonEntry.jsx`, `RateUpdateModal.jsx`, `constants/config.js` | §9 · §10 (entry flows) · §11 (employer preset convention — born here, enforced everywhere) | A, B, F |
| T2 | **Home Panel** | G | `HomePanel.jsx`, `NewJobSeasonHomePanel.jsx`, `NetWorthHealthTips.jsx`, `CoachNetWorthCard.jsx`, `ReemploymentTracker.jsx`, `CashOnHandSheet.jsx` (shared with T4, §1.H17) | §14 · §10 (New Job Season home surface) · §4 (the *entire* goals surface — cards, CRUD, reorder, timeline bar; moved off Budget 2026-05-12) · §16 (sprints 3/5) | A, B, C, D, E |
| T3 | **Income Panel** | L | `IncomePanel.jsx`, `WeekConfirmModal.jsx` | §1 (display surface) · §2 · §12 · §16 (sprint 2, unshipped) | A, B, E, F |
| T4 | **Budget Panel** | L | `BudgetPanel.jsx`, `NewJobSeasonBudgetPanel.jsx`, `BulkEditPanel.jsx`, `MonthQuarterSelector.jsx`, `DueDatePicker.jsx`, `CashOnHandSheet.jsx` (shared with T2, §1.H17) | §3 · §5 · §10 (New Job Season budget surface) · Tax Plan gate (§9 consumer; §4 goals moved to T2 — corrected in T4 pass) | A, B, C |
| T5 | **Account Panel** (redefined 2026-07-19 — was "Benefits Panel", see §11: `BenefitsPanel.jsx` is dead code; the fifth nav panel is Account) | G | `ProfilePanel.jsx` (all sub-views: Employment, Pay Structure cards, Retirement & Benefits `BenefitsDetail`, App Preferences, Tax Plan writers, Investor Codes, Life Events row, Account/auth actions UI) | §17 (account-management surface) · §6 (settings side; displays → T6) · Tax Plan write path (§9 consumer) | A, B, C |
| T6 | **Log Panel** | L | `LogPanel.jsx` | §8 · §7 (attendance surfaces) · §13 (per-entry admin breakdown) | A, B, F |
| T7 | **Auth System** | G | `lib/supabase.js`, `db.js` (account mapping, `loadUserData`/`saveUserData`), migrations (RLS, tier columns), `DemoAccountTree.jsx`, `InvestorRegister.jsx`, `InvestorAdminPanel.jsx` | §17 (session + identity/tier truth; the ProfilePanel UI surface is T5) · §2 · §9 | B, C |
| T8 | **Login System** | G | `LoginScreen.jsx`, `ReviveScreen.jsx`, `TrialExplainerScreen.jsx`, `api/revival-lookup.js` | §17 (auth entry) · §8 (revival detection at sign-in) | B, C |
| T9 | **Paywall System** | G | `App.jsx` (entitlement resolution + `readOnly` fencing), `UpgradeCard/Modal/Panel.jsx`, `TrialBanner.jsx`, `api/stripe-*.js`, `api/cron-subscription-lifecycle.js` + `_lifecycle*.js`, `_email.js` | §8 · §4 | B, C |
| T10 | **UI-UX** | G | `ui.jsx`, `LiquidGlass.jsx`, `index.css` (`@theme`), `useSwipeStack.js`, `PwaInstallModal.jsx`, animation rules | §1 · §16 (primitives) · §3 | E |

Notes on deliberate placements:

- **T5 Account vs. T7 Auth vs. T8 Login** — T8 is every pre-session surface (sign-in,
  sign-up, OAuth, recovery, revival detection); T7 is in-session identity/tier *truth*
  (session handling, RLS, tier flags, account mapping, investor/demo machinery); T5 is
  the Account *panel* — the ProfilePanel UI where the user edits settings and triggers
  account actions. A ProfilePanel button (T5) calling an auth/db primitive (T7) is the
  expected coupling, not drift.
  Drift between them is exactly the §8 revival flow — which is why they're separate
  sections with an explicit boundary entry, not one blob.
- **New Job Season (§10)** is a genuine app *mode*, not a panel — its pieces are assigned to
  the surface they replace (T2/T4) and to T1 (entry flows), with `config.newJobSeasonMode`
  routing itself owned by T2/T4's drift maps. `NewJobSeasonDashboard.jsx`/`ExpenseTriage.jsx`
  are deleted architecture; any reappearance is itself a drift finding.
  **Naming note (2026-08-04):** "Job Loss Mode" was rebranded to "New Job Season" across the
  app in two passes. Pass 1 covered every user-visible string, component/file name
  (`NewJobSeasonHomePanel.jsx`, `NewJobSeasonBudgetPanel.jsx`, `NewJobSeasonEntry.jsx`,
  `newJobSeasonRunway.js`, `computeNewJobSeasonRunway`), and non-persisted local variable. Pass
  2 (same day) closed the remaining gap: the persisted config/expense keys themselves —
  `jobLossMode` → `newJobSeasonMode`, `jobLossDate` → `newJobSeasonDate`,
  `jobLossCashOnHand[AsOf]` → `newJobSeasonCashOnHand[AsOf]`,
  `jobLossPendingCheckAmount/Date` → `newJobSeasonPendingCheckAmount/Date`,
  `expense.jobLossStatus` → `expense.newJobSeasonStatus`,
  `expense.trackDuringJobLoss` → `expense.trackDuringNewJobSeason` — via the same
  backward-compat migration pattern as §2's `paycheckBuffer` → `freedomAllowance` rebrand
  (`db.js`'s `loadUserData`, plus a parallel per-expense migration for the two expense-level
  fields since they don't live on `config`). The rebrand is now complete end-to-end; no
  `jobLoss*`-named identifier should remain live in the codebase (historical/dead-code
  mentions in TODO.md's completed-item log, e.g. the old pre-`newJobSeasonCashOnHand`
  `jobLossSavingsDraft` state, are deliberately left as-is — they document what used to exist,
  not current code).
- **`App.jsx`** is not a section — it is the wiring harness where nearly every
  spine→surface boundary physically lives (68 distinct commits touch it, the most of any
  file). Each section's drift map owns the `App.jsx` wiring for *its* props/state; the
  Warden treats an `App.jsx` diff as touching every section whose wiring appears in the hunk.

### 4.2 Shared spines (the cross-cutting systems)

| Spine | Cat | Files | Absorbs active-systems | One-line drift stance |
|-------|-----|-------|------------------------|----------------------|
| **A — Fiscal Math** | L | `finance.js` (40 exports), `fiscalWeek.js`, `rollingTimeline.js`, `expense.js`, `goalFunding.js`, `newJobSeasonRunway.js`, `stateTaxTable.js` | §1 · §2 · §7 (math) · §14 (math) | The single source of numeric truth. Every panel number must trace to an export here; `buildYear → computeNet → calcEventImpact → computeGoalTimeline` is the trunk — a change to any stage re-verifies every consumer surface (T2–T6) *and* Spine D's context fields. |
| **B — Persistence & Save Integrity** | L | `db.js`, `useLocalStorage.js`, `supabase.js`, eager-save pattern (`savePersistedStateNow` + the four `saveXNow` wrappers), `configHistory.js`, `database/migrations/` | §5 | Every discrete mutation follows the eager-save pattern (D3); every sensitive config change must hit the `HISTORY_SENSITIVE_FIELDS` watcher; schema changes ride numbered migrations (BOOKMARK files are never migrations; next real number: 023 — verify against the folder, this doc does not track it). |
| **C — Entitlement & Gating** | G | `subscription.js` (`getEntitlement`), `entitlements.js` (`canAccessAiFeatures`, `canAccessAskCoachGeneral`, `canAccessTaxPlan`, `hasTesterAccess`/`hasPrivilegedAccess` bases), tier flags (`is_admin`/`is_tester`/`is_investor`/future `is_owner`) | §9 · §2 (flag semantics) · §8 (engine) | One entitlement resolver, one gate module, two bases (2026-07-25). `isAdmin` stays a strict superset of `isTester` *by construction* either way; tester⇔investor never overlap for account-tier surfaces (Demo Tree, investor code, beta tracking) but **do** overlap by design on paid-wall gates (`hasPrivilegedAccess`); the day-21 `access_ends_at` grace is never disclosed in user-facing strings. |
| **D — AI Layer & Context Grounding** | L | `aiContext.js` (`buildCoachContext`), `coachPrompts.js`, `coachFeatureGuide.js`, `coachTriggers.js`, `claude.js`, `api/coach.js`, `AskCoachPanel.jsx` | §6 | Every context field resolves through the same authoritative Spine-A function the UI displays that number with — never a parallel approximation (D1). Goal labels stay excluded (privacy rule). Gate is checked client *and* server side (Spine C). `coachTriggers.js#estimateRunwayDays` — the runway D1 violation this table used to flag — was deleted outright (`3267286`, 2026-07-22); Coach's runway now converges on `computeNewJobSeasonRunway` like every other consumer. |
| **E — Design System & Motion** | G | `index.css` `@theme` tokens, `ui.jsx` primitives, `LiquidGlass.jsx` (`ALLOWED_PURPOSES`), animation rules, numeric-input standard, Pulse token reservation | §1 · §16 (primitives) | No raw hex for accent/green/red; Pulse tokens never on Flow elements; Liquid Glass only on whitelisted purposes; no bounce/spin/scale-up, ≤500ms; string-draft numeric inputs, parse at commit only. |
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
(cite commit or active-systems §), plus any standing known-drift quarantines (e.g. Spine A's
flat-config `buildYear` zone, §2.4) so the Warden flags extensions of them rather than
rediscovering. Move an entry from quarantine to case-law the moment it closes, with the
closing commit — Spine D's `estimateRunwayDays` sat mislabeled "open" for three days past
its actual fix (`3267286`) before a later pass caught it; don't repeat that.

**Maintenance covenant:** a drift-map entry is itself subject to D5. Whenever a listed
trigger's blast radius changes, the entry is updated *in the same PR* — an entry more than
one structural change out of date is worse than no entry, because it certifies a stale
checklist. `docs/active-systems.md` stays the "what exists" doc; this doc is strictly the
"what breaks what" doc — describe systems there, map couplings here, duplicate in neither
direction.

---

## 6. Section Index — all passes complete

Filled one surgical pass at a time, in this order (each pass produced Blocks 1–4 for that
section). **All sixteen are done** (T1–T10 surface tiers 2026-07-19; Spines A–F 2026-07-20):

- [x] **T1 — Setup Wizard** — §7 below (surgical pass 2026-07-19)
- [x] **T2 — Home Panel** — §8 below (surgical pass 2026-07-19)
- [x] **T3 — Income Panel** — §9 below (surgical pass 2026-07-19)
- [x] **T4 — Budget Panel** — §10 below (surgical pass 2026-07-19)
- [x] **T5 — Account Panel** — §12 below (surgical pass 2026-07-19; §11 records the redefinition from the phantom "Benefits Panel" tier)
- [x] **T6 — Log Panel** — §13 below (surgical pass 2026-07-19)
- [x] **T7 — Auth System** — §14 below (surgical pass 2026-07-19)
- [x] **T8 — Login System** — §1 below (surgical pass 2026-07-19)
- [x] **T9 — Paywall System** — §16 below (surgical pass 2026-07-19; found DW-7, the investigation's highest-severity defect — fixed 2026-07-22)
- [x] **T10 — UI-UX** — §17 below (surgical pass 2026-07-19)
- [x] **Spine A — Fiscal Math** — §2 below (spine pass 2026-07-20)
- [x] **Spine B — Persistence & Save Integrity** — §3 below (spine pass 2026-07-20)
- [x] **Spine C — Entitlement & Gating** — §4 below (spine pass 2026-07-20)
- [x] **Spine D — AI Layer & Context Grounding** — §8 below (spine pass 2026-07-20)
- [x] **Spine E — Design System & Motion** — §5 below (spine pass 2026-07-20)
- [x] **Spine F — Admin Diagnostic Toolkit** — §9 below (spine pass 2026-07-20)

(Spines are written last so every spine entry's blast radius can point at completed
surface sections, not forward references.)

---

## 7. T1 — Setup Wizard Drift Map

**Pass date:** 2026-07-19. **Line anchors** are `file:line` as of this pass's commit and are
always paired with a greppable symbol name — when lines shift, grep the symbol; when the
symbol is gone, this entry is due for re-surgery (D5 on itself).
**Method note:** this is a key-function-by-key-function study, not line-by-line
documentation. Each monitored function gets its code anchor **and** a human-readable
IF/THEN statement — the IF/THEN is the drift check; the anchor is where to aim it.

**Scope:** `SetupWizard.jsx` (2,492 lines, 9 live steps), `LifeEventMenu.jsx`,
`NewJobSeasonEntry.jsx`, `RateUpdateModal.jsx`, their `App.jsx` wiring (completion handler,
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
One atomic patch: `startedUnemployed: true`, `newJobSeasonMode: true`, `newJobSeasonDate` (defaults
today), `startDate: today`, `firstActiveIdx`. Answering "No" reverses the first three.
> **IF** this patch's field set changes, **THEN** check every consumer of the seeded
> fields: `buildYear()`'s `newJobSeasonMode` income-zeroing, `NewJobSeasonHomePanel`/
> `NewJobSeasonBudgetPanel` expectations (`newJobSeasonDate`, `newJobSeasonCashOnHand`), and both special
> cases in `handleWizardComplete` (F8) that test these exact flags — `skipFoodSeed`
> (`wizardEntry === false && newJobSeasonMode`) and the H4 `startedUnemployed` clear.

**F5 · `handleComplete()`** — `SetupWizard.jsx:2316–2338` — **[L]**
The single commit point for every wizard path (all six routes in §7.3 end here). Ordered
effects: (1) DHL enforced overrides — `payPeriodEndDay: 0`, `otThreshold: 40`,
`otMultiplier: 1.5` (`:2317–2319`); (2) Freedom Allowance normalize — `freedomAllowance ?? 50` whenever
`freedomAllowanceEnabled !== false` (`:2323–2325`); (3) `taxedWeeks` derivation — `[]` if
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
**This chain is the first and only read path of `account_history`** — the §3 "narrow
slice." `extractBaseRateHistory` keeps only rows where `changed_fields` includes
`"baseRate"` *and* `snapshot.baseRate` is a real number.
> **IF** `saveConfigSnapshot`'s row shape (`changed_fields`, `snapshot`) or
> `HISTORY_SENSITIVE_FIELDS`'s spelling of `baseRate` changes, **THEN**
> `extractBaseRateHistory`'s filter silently drops every affected row and past-rate
> resolution collapses to the live rate — no error, just retroactively rewritten pay
> history (D2 re-opened). Check: `db.test.js` baseRateHistory cases + a future-dated rate
> update showing the *old* rate on weeks before the effective date (Week Inspector).

**F11 · `handleBackToWork()`** — `App.jsx:1454–1478` — **[G]**
The single reset point for leaving New Job Season: auto-reactivates flagged expenses,
nulls the `newJobSeason*`/unemployment/`returnToWorkDate` fields, routes into
`structure_change`.
> **IF** a new `newJobSeason*` or unemployment-related config field is added anywhere, **THEN**
> it must be reset here — or it leaks into the re-employed state and every consumer that
> gates on it misfires. Check: grep new field name; confirm it appears in this reset patch.

**F12 · `LifeEventMenu` routing + `NewJobSeasonEntry` activation** — `App.jsx:3526–3531` /
`:3533–3548` — **[G]**
Three routes: `job_loss` → `NewJobSeasonEntry` modal (not the wizard), `rate_update` →
`RateUpdateModal`, anything else → `setWizardEntry(route)`. `NewJobSeasonEntry.onActivate`
tags history (`life_event:lost_job`, `effectiveFrom: newJobSeasonDate`), computes
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
| `NewJobSeasonEntry` step contents (cash-on-hand, `trackDuringNewJobSeason`, due dates) | `computeNewJobSeasonRunway()` inputs (T2/T4 surfaces), F11's reset list | `newJobSeasonFlow.test.jsx` + runway headline sanity on a test account | D1 |

### 7.3 Block 3 — Gate matrix (the six paths)

All paths commit through `handleComplete` (F5) — including the two that skip Wrap Up and
the one with no pay structure.

| Path (lifeEvent · seed) | Steps shown | Wrap Up? | Path-specific invariants |
|---|---|---|---|
| First-run employed (`null` · No) | 0 → 1 → 2 → 3 → 4 → 7 | Yes | `onCancel` undefined (non-investor) — no escape; Freedom Allowance + tax-exempt offered here only |
| First-run jobless (`null` · Yes) | 0 → 10 → 11 → 12 | Own (12) | No pay structure at `buildYear` call; `newJobSeasonMode: true`; Food seed skipped (F8); lands in New Job Season panels |
| `structure_change` | 0 → 1 → 2 → 3 → 4 → 7 + diff | Yes | Pre-filled; frozen `originalConfigRef` baseline; clears `startedUnemployed` on completion (F8); Food restored if jobless-started |
| `lost_job` (legacy wizard route) | 0 → 1 → 2 → 3 → 4 | **No** | Wrap-Up-only fields must default in F5; primary lost-job entry is now the `NewJobSeasonEntry` modal (F12), not this |
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
- *Jobless diff against placeholders* (TODO §1.H4) — `structure_change` after a jobless
  start diffed `DEFAULT_CONFIG`'s `baseRate: 19.65` as if it were a real prior job; fixed
  by F7's `:1738` guard.
- *Transient fetch error re-opened the wizard over real data* — `db.js:170–181`: only
  PGRST116 ("no row") may fall back to `DEFAULT_CONFIG` + wizard; every other load error
  must propagate. Any change to `loadUserData` error handling re-fights this exact fire.
- *Quick Rate Update effective date didn't gate the math* (commit `955b0b3`) — the modal
  saved a date the engine ignored; fixed by the F10 chain. The whole chain exists so the
  date is load-bearing — treat any simplification of it as reopening the bug.

**Standing findings from this pass:**
1. **Soft-D3, Quick Rate Update — fixed.** *(DW-1 in `docs/BUG_FIX_TODO.md`)*:
   `App.jsx`'s `RateUpdateModal.onActivate` set `config.baseRate` with *no*
   `savePersistedStateNow` — the live rate rode the 800ms debounce. Mitigation was already in
   place: the `account_history` row (fire-and-forget insert) + optimistic append meant week
   math survived a lost write after reload; but the *live* `config.baseRate` (ProfilePanel
   display, F6 previews) could silently revert. Fixed by mirroring F12's compute-then-eager-save
   shape: `onActivate` now computes `nextConfig` synchronously and calls
   `savePersistedStateNow({ config: nextConfig })` in the same handler.
2. **D5, corrected in this pass:** CLAUDE.md's SetupWizard quick reference predated the
   jobless mini-flow, `structure_change`, and the `otMultiplier: 1.5` override — updated
   in this commit.
3. **D5, corrected in this pass:** `active-systems.md` §5's "nothing reads this table"
   predated the F10 read path — annotated in this commit.

---

## 8. T2 — Home Panel Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7. Function numbering continues
from §7 (F13+) so cross-references stay unambiguous.
**Git-history note:** this section was written hours after the §1.H11/H12 pair
(`2e0121a`, `10ba9af`) landed — the *newest* intentions on this surface. Those commits
replaced a four-way parallel-formula drift with two shared helpers; several entries below
exist specifically to keep that fix from un-happening.

**Scope:** `HomePanel.jsx` (1,403 lines), `NewJobSeasonHomePanel.jsx`, `ReemploymentTracker.jsx`,
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
> active weeks its own way), **THEN** the §1.H11 dilution bug reopens: a mid-year
> `firstActiveIdx` makes "typical week" and "annual savings" numbers disagree between the
> Home tile, the Coach, and the Income panel. Check: grep `resolveActiveWeeksThisYear` —
> consumer count only ever grows; `fiscalWeek.test.js` + `aiContext.test.js` cover it.

**F14 · `weeklyIncome` derivation** — `App.jsx:1193–1204` — **[L]**
`(projectedAnnualNet / activeWeeksThisYear) − freedomAllowancePerWeek`. The single "typical active
week nets you" number threaded into HomePanel, Coach context, Live State Inspector, and
New Job Season surfaces. `freedomAllowancePerWeek` scales `freedomAllowance` by `checksPerYear / 52`.
> **IF** `weeklyIncome`'s formula or its `freedomAllowancePerWeek` subtraction changes, **THEN**
> every downstream "left this week / surplus / savings rate" number shifts together —
> check HomePanel tiles (F16), `annualSavings` (F17), goal timeline surplus sequencing
> (`computeGoalTimeline` consumes `weeklyNets`), and Coach context lines. Procedure: Live
> State Inspector's `weeklyIncome` vs. Home tile vs. an Ask Coach "what do I make weekly"
> answer — all three must quote the same number.

**F15 · `resolvePrevWeekNet(...)`** — `finance.js:1392` (authoritative), consumed
`App.jsx:1212–1215`, `DemoAccountTree.jsx` — **[L]**
"This Week's Check": the specific prior active week's `computeNet` adjusted for that
week's log entries — falling back to the *current active week's real net*, never the
`weeklyIncome` average (that fallback was the §1.H11 "diluted fraction of a paycheck"
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
> (Coach context must pass the same one — a 2026-07-16 live-test bug in §6's case law),
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
`NewJobSeasonHomePanel.jsx:46–48`) — **[G]**
Paywall-expired accounts get all four mutation channels (`setGoals`, `setConfig`,
`onSaveGoalsNow`, `saveConfigNow`) shadowed to no-ops in one place.
> **IF** a new mutation-capable prop is threaded into HomePanel or NewJobSeasonHomePanel,
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

**F22 · New Job Season home surface** — mode fork `App.jsx:1570` (Home) / `:1630` (Budget);
`NewJobSeasonHomePanel.jsx`: `dash` runway memo `:56–58` (via `computeNewJobSeasonRunway`,
`extraCash: huntIncome`), `saveCashOnHand:65–69` (writes `newJobSeasonCashOnHand` +
`newJobSeasonCashOnHandAsOf`, called from the pencil-badged Cash On Hand card + its shared
`CashOnHandSheet.jsx` editor — §1.H17), `logIncome:94–105`, `removeEntry:109–113`,
embedded `ReemploymentTracker:264` with its `applyConfigUpdate` wrapper
(`ReemploymentTracker.jsx:104–108`), embedded `CoachNetWorthCard:267` (DW-8 fix,
`docs/BUG_FIX_TODO.md`) behind `canAccessAskCoachGeneral` — **[G→L]**
`config.newJobSeasonMode` *replaces* HomePanel with NewJobSeasonHomePanel (post-§1.H7 architecture
— the pre-H7 overlay components are deleted; don't resurrect). All panel numbers resolve
through `computeNewJobSeasonRunway()` / `sumJobHuntIncome()` — the one authoritative runway
pair; `computeNewJobSeasonRunway` itself reads `newJobSeasonCashOnHand` internally now and decays it
by every essential bill's due-date occurrence since `newJobSeasonCashOnHandAsOf`
(`sumBillsDueSince()`, §1.H17) — the displayed `effectiveCashOnHand` is not the raw
persisted number. Every mutation eager-saves; `newJobSeasonCashOnHand` is persisted and
mandatory (§1.H13); `newJobSeasonCashOnHandAsOf` is re-stamped every time it's edited.
> **IF** the panel needs a new burn/savings/runway number, **THEN** it comes from
> `newJobSeasonRunway.js` — a second in-component derivation is the exact D1 shape F24
> quarantined and closed (`3267286`). **IF** a new `newJobSeason*` field is added here,
> **THEN** it also joins `handleBackToWork`'s reset list (§7 F11) — note
> `newJobSeasonCashOnHand`/`newJobSeasonCashOnHandAsOf`/`newJobSeasonPendingCheck*` are deliberately
> **not** in that list today (left stale/unused once `newJobSeasonMode` flips false, since
> `computeNewJobSeasonRunway` short-circuits on `!config.newJobSeasonMode` before ever reading
> them) — that's existing precedent, not an oversight to "fix" reflexively. Check:
> `newJobSeasonFlow.test.jsx`, `newJobSeasonRunway.test.js`.

**F23 · Net Worth Health cue** — `netWorthHealthStatus` (`finance.js:1407`,
threshold const `:1405`), suppression `HomePanel.jsx:117–118`
(`belowThreshold && !config?.newJobSeasonMode`), `pickTips(seed, count = 3)`
(`NetWorthHealthTips.jsx:48–51`, seeded by fiscal `weekNumber` at `HomePanel.jsx:1350`) — **[G]**
The savings-rate cue: deterministic 3-of-5 tip rotation per fiscal week; suppressed
entirely in New Job Season (that mode owns its own runway UI); `aiTip` is a dormant
forward slot for a Coach-generated insight.
> **IF** the `NET_WORTH_HEALTH_THRESHOLD` or `netWorthHealthStatus` inputs change,
> **THEN** check both consumers — this cue *and* the Coach amber tier (F24 uses
> `belowThreshold` as its amber proxy) — they must fire on the same condition or the
> Coach warns about a cushion the Home tile calls healthy.

**F24 · Coach Net Worth trigger chain** — gate `HomePanel.jsx`/`NewJobSeasonHomePanel.jsx`
(`canAccessAskCoachGeneral` — widened from `canAccessAiFeatures` in the Coach gate-flip,
2026-07-24: admin/tester/investor **or** a real trial/paid entitlement, per
`hasPrivilegedAccess({isAdmin, isTester, isInvestor})` as of 2026-07-25 — see F111);
`CoachNetWorthCard.jsx` computes `runwayDays` via `computeNewJobSeasonRunway()` +
`resolvePrimaryRunwayDays()` directly (`newJobSeasonRunway.js`) — **not** a local estimate;
`coachTriggers.js`: `resolveNetWorthSignalTier`, `shouldFireForTier` (one message per
tier per fiscal week) — **[G + L, both converged]**
Proactive Coach message, now reachable from both `HomePanel` (Amber/Green/Red) and
`NewJobSeasonHomePanel` (Red only — DW-8 fix, `docs/BUG_FIX_TODO.md`; Amber/Green need
`netWorthHealth`, a normal-mode-only concept not threaded through the New Job Season mount).
Red tier's runway number is guaranteed to equal the New Job Season panels' own headline —
same function, same call — since the standing quarantine below closed (commit
`3267286`, 2026-07-22). **§15.I (2026-07-25):** `App.jsx`'s `coachRunwayDays` memo now
derives from a shared `newJobSeasonDash` memo (one `computeNewJobSeasonRunway()` call per render,
not two) — the Live State Inspector's three new New Job Season rows (`New Job Season Date`,
`Unemployment Wkly`, `Unemployment Wks Left`) read `newJobSeasonDash.benefitsRemainingWeeks`
from that same memo, isAdmin-gated diagnostic display only, no new call site.
> **IF** touching anything in this chain, **THEN** do not reintroduce a second runway
> formula — everything routes through `computeNewJobSeasonRunway()`/`resolvePrimaryRunwayDays()`
> (Spine A), now including the admin Live State Inspector via the shared `newJobSeasonDash`
> memo. **IF** the gate changes, **THEN** note it must stay `canAccessAskCoachGeneral` —
> `isInvestor` now **is** folded in via `hasPrivilegedAccess` (2026-07-25), superseding
> this entry's older "never fold in isInvestor" language; see F111. Check:
> `newJobSeasonFlow.test.jsx`'s "Coach presence (DW-8 fix)" block, `CoachNetWorthCard.test.jsx`.

### 8.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `resolveActiveWeeksThisYear` semantics or a consumer bypasses it | `weeklyIncome` (F14), Home `annualSavings` (F16), Coach `annualSavings` line (`aiContext.js`), DemoAccountTree | Grep consumer count; `fiscalWeek.test.js`, `aiContext.test.js`; mid-year `firstActiveIdx` account shows identical figures on Home tile vs. Ask Coach | D1 |
| `resolvePrevWeekNet` fallback chain | HomePanel `nextWeekDisplay` cascade (`:119–122`), DemoAccountTree, "This Week's Check" tile | `finance.test.js`; fresh account day-one shows full-size check | D1/D2 |
| `computeGoalTimeline` return shape or epoch handling (Spine A) | F18's call + epoch arg, `yearEndGoalDraw` fallback (F21), Coach goal lines, BudgetPanel timeline bar (T4) | Grep `computeGoalTimeline(` for epoch-arg parity; next-year-ETA goal subtracts only this-year slice | D1 |
| `getFundedGoalSpend` (`goalFunding.js`) | `annualSavings` (F16), `adjustedTakeHome` (F17), Live State Inspector `fundedGoalSpend` | Complete a goal; Home savings + Year Summary both absorb it exactly once (no double-count) | D2 |
| `eventImpact.totalNetAdjustment` composition (Spine A) | `adjustedTakeHome` (F17) → Home Year-End + IncomePanel Year Summary (both read `logTotals.adjustedTakeHome` — single value, keep it that way) | Log a missed shift; both panels move by the same amount | D1 |
| A new mutation prop threaded into Home/NewJobSeasonHome | F20 shadow lists | Prop appears in the shadow block; expired-account test: mutation is a no-op end-to-end | D4 |
| `netWorthHealthStatus` / threshold | F23 cue **and** F24 amber tier | Both fire on the same account state | D1 |
| `computeNewJobSeasonRunway` / `sumJobHuntIncome` / `sumBillsDueSince` signature | F22/F44 panel consumption (both now read `effectiveCashOnHand`, not raw `newJobSeasonCashOnHand`), `CoachNetWorthCard`/`App.jsx`'s Ask Coach wiring (F24), admin Live State Inspector's New Job Season rows (§15.I, via the same `newJobSeasonDash` memo as Ask Coach — no separate call) | `newJobSeasonFlow.test.jsx`, `newJobSeasonRunway.test.js`; runway headline equals Budget-side runway; a tracked essential bill's due date passing decreases the Cash On Hand card by the same amount on both panels | D1 |
| `PAYCHECKS_PER_YEAR` / a new pay schedule (Spine A) | `perCheckFactor` display scaling (F16), `freedomAllowancePerWeek` (F14), Wrap Up preview (§7 F6) | Biweekly test account: tile values are 2× weekly, labels say "Check" not "Week" | D1 |

### 8.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| `config.newJobSeasonMode` | false / true | true: `NewJobSeasonHomePanel` *replaces* HomePanel entirely (`App.jsx:1482`); Net Worth cue suppressed (F23); nav collapses to budget+profile (`App.jsx:907`); Income/Log tabs force-redirect (`:337`) |
| `readOnly` (paywall-expired) | false / true | true: all four mutation channels noop'd (F20) in both Home variants; values still render; UpgradeModal triggerable |
| `isAdmin` / `isTester` / `isInvestor` | 8 cells | Coach card renders when `canAccessAskCoachGeneral` — admin, tester, investor (all three per `hasPrivilegedAccess`, 2026-07-25), or a real trial/paid entitlement; non-gated tiles identical across all cells |
| Pay schedule | weekly / biweekly / salary / monthly | `perCheckFactor` 1 / 2 / 2 / ~4.33 scales every tile value + "Left This Week"→"Left This Check" label swap (`:153`) |
| Goals | empty / active / all-completed | Empty: no goal hero, `pulseGoals` undefined (no fabricated signal); completed: absorbed via `fundedGoalSpend`, hidden behind "show completed" fold |
| `netWorthHealth.belowThreshold` | false / true | true (and not newJobSeasonMode): Breakthrough Tips cue renders with fiscal-week-rotated 3-of-5 tips |

### 8.4 Block 4 — Case law & quarantine

**Precedents (fixed — cite, don't relearn):**
- *§1.H11 dilution* (`2e0121a`, `10ba9af`, 2026-07-19) — four call sites each did their
  own active-weeks math (or divided by a flat 52); "This Week's Check" showed a fraction
  of a real paycheck for any account not active since week 0. Fix: F13 + F15 shared
  helpers + purging HomePanel's dead `weeklyIncome*52` fallback. F13/F15/F17's IF/THENs
  exist to keep this killed.
- *Year-End Outlook overreach* (`08ea5b7`, `ec53450`, 2026-07-13) — Outlook once assumed
  a full 52-week year and subtracted full goal targets regardless of fundability window;
  now clamped + scoped (F21).
- *Paywall read-only gate* (`065ec95`, §17.E) — the noop-shadow pattern (F20) was built
  here first; CLAUDE.md's readOnly rule generalizes it.
- *Pre-§1.H7 New Job Season overlay* (`7375c36`) — `NewJobSeasonDashboard.jsx`/`ExpenseTriage.jsx`
  deleted; mode now swaps whole panels. Any PR re-introducing an overlay-on-HomePanel
  New Job Season surface is reviving deleted architecture.
- *`estimateRunwayDays` quarantine, closed* (`3267286`, 2026-07-22) — the second,
  independent runway formula that ignored persisted `newJobSeasonCashOnHand` and job-hunt
  income (always ≤ the real runway, so Coach could claim less runway than the New Job Season
  panels on the same account) was **deleted outright**, not patched — `coachTriggers.js`
  no longer exports it. `CoachNetWorthCard.jsx` now calls `computeNewJobSeasonRunway()` +
  the new shared `resolvePrimaryRunwayDays()` (`newJobSeasonRunway.js`) directly, same
  function the two New Job Season panels use. Same commit also closed the sibling quarantine
  below (`runwayDays` wiring) — filed and fixed together since both converge on the
  same target function.
- *`runwayDays` wired to `AskCoachPanel`, closed* (`3267286`, 2026-07-22) — `App.jsx`
  now computes `coachRunwayDays` via `computeNewJobSeasonRunway()`/`resolvePrimaryRunwayDays()`
  (using the real `newJobSeasonIncludeBenefits` toggle, not a hardcoded default) and passes
  it into `AskCoachPanel`'s `runwayDays` prop → `aiContext.js`'s New Job Season context line
  now renders the real number instead of a bare `"New Job Season: active"` string.
  **Drift-in-drift correction (2026-07-25):** this section previously listed both items
  above as "Standing quarantine (open)" for three days after they'd actually closed —
  a live instance of the exact D5 pattern this document exists to prevent, caught while
  investigating an unrelated New Job Season documentation pass. If you find a warden
  entry that looks stale, verify against the code before trusting the doc's own
  "open"/"closed" label.

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
> **Stale-dep finding — fixed.** The memo *uses* `effectiveToday` (past/future split) but
> its dep array listed only `today`, and `remainingTaxedChecks` used real `today` outright
> — so under admin Lock Date the override-remediation split didn't recompute when the lock
> changed, and the two lines disagreed about what "now" was. Fixed per F118's own rule
> ("every 'now'-derived number reads `effectiveToday` unless it's entitlement/billing" —
> tax withholding isn't): `remainingTaxedChecks` now filters on `effectiveToday`, and the
> dep array lists `effectiveToday` (not `today`, which the body no longer reads). Lock
> Date now fully — and consistently — simulates the Tax Plan gap calc, same as every
> other schedule-derived number in the app. See Block 4, finding 1.

**F29 · Net derivation tiers** — `projectedAnnualNet` `App.jsx:1173–1175`,
`weekNetLookup` `:1217–1233`, `futureWeekNetsRaw`/`futureWeekNets` `:1235–1242` — **[L]**
Three deliberate tiers off one `computeNet` core: `projectedAnnualNet` (all active weeks,
no Freedom Allowance deducted), `futureWeekNetsRaw` (spendable = net − Freedom Allowance; feeds goal *timeline* display),
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
> before extending. **Soft-D3 finding (fixed):** both deletes now compute their next values
> synchronously and ride one `savePersistedStateNow` call alongside the `setState`s — see
> Block 4, finding 2.

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
| UpgradePanel replacement gating (§8, T9) | This panel has **no** internal `readOnly` shadow — it relies on being fully replaced when expired | If expired-mode ever renders IncomePanel, every mutation (F34, tax toggles) is live — the shadow must be added first | D4 |

### 9.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| Pay schedule | weekly / biweekly / salary / monthly | Prompt cadence: every week / paycheck weeks only (parity) / paycheck weeks with silent paired auto-confirm / one prompt + month-fill. Two-week collection UI: biweekly only (F30); salary explicitly excluded |
| Employer | DHL / base | DHL: Mon 6:01 AM trigger, rotation labels on rows; base: midnight-after-`payPeriodEndDay` |
| `isAdmin` | false / true | true: Week Inspector on row tap (`onWeekInspect`, `App.jsx:1533`), Reopen tool, Lock Date hour-gate bypass (F25); false: rows inert, no reopen |
| Entitlement | entitled / expired | Expired: entire panel replaced by `UpgradePanel` (T9) — no partial render, no internal readOnly gate exists |
| `newJobSeasonMode` | false / true | true: Income tab removed from nav and force-redirected (`App.jsx:337`) — panel unreachable |
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

**Standing findings from this pass:**
1. **Stale memo dep in `taxDerived` (F28) — fixed.** *(DW-2 in `docs/BUG_FIX_TODO.md`)*:
   used `effectiveToday` for the past/future remediation split but
   deps listed only `today`; `remainingTaxedChecks` independently used real `today`. Under
   admin Lock Date the remediation split lagged until an unrelated dep changed, and
   "remaining taxed checks" ignored the lock entirely — the Lock Date tool's core promise
   (simulate a date and read these exact numbers) was weakened. Admin-only blast radius.
   Resolved per F118's rule (tax math isn't entitlement/billing, so it should honor the
   simulated date like everything else does): `remainingTaxedChecks` now filters on
   `effectiveToday`, and the dep array lists `effectiveToday` in place of `today`.
2. **Reopen Last Check-In lacks eager save (F32) — fixed.** *(DW-3 in
   `docs/BUG_FIX_TODO.md`)*: deletion of the confirmation record +
   its log entry rode the 800ms debounce (bare functional `setState`s), contrary to the
   CLAUDE.md rule that Delete-shaped actions eager-save. Worst case was mild (admin-only;
   a lost delete resurrects a valid confirmation), but it was the only confirmed rule
   exception on this surface. Fixed: `handleReopenLastCheckIn` now computes both next
   values (`nextLogs`, `nextWeekConfirmations`) synchronously and passes both through one
   `savePersistedStateNow({ weekConfirmations, logs })` call, alongside the `setState`s.

---

## 10. T4 — Budget Panel Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F35+).
**Git-history note:** the governing intentions here are the June-16 trilogy (`d8c475a`,
`d42c118`, `6fb0619`) that implemented the **locked Decisions 1–3** on expense-save
semantics (decision record preserved in `docs/BUG_FIX_TODO.md`'s archived section — do
not re-litigate without sign-off), the `764da5b` eager-save wrapper, and the July
New Job Season rebuild (`7375c36`, `cd0480f`, `6a3e406`). Goals are *not* on this surface —
they moved wholly to Home 2026-05-12 (`50c1243`); this pass corrected active-systems §4
and the §4.1 hierarchy rows accordingly.

**Scope:** `BudgetPanel.jsx` (2,579 lines), `NewJobSeasonBudgetPanel.jsx`, `BulkEditPanel.jsx`,
`MonthQuarterSelector.jsx`, `DueDatePicker.jsx`, and the `expense.js` helper layer
(Spine A) they consume.

### 10.1 Block 1 — Critical inventory (function by function)

**F35 · `applyExpenseUpdate(updater)`** — `BudgetPanel.jsx:96–100`, twin at
`NewJobSeasonBudgetPanel.jsx:55–58` (and `ReemploymentTracker`'s `applyConfigUpdate`, §8 F22) — **[L]**
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
month M" — Coach context and the panel must both resolve through it (§6 grounding
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
> product invariant. Check: `newJobSeasonFlow.test.jsx` + attempt to save Food below floor.

**F40 · Drag-and-drop reorder** — `reorderExpenseByInsert` `BudgetPanel.jsx:1046+`,
drop sites `:1427`/`:1569` — **[L/G]**
Mouse + touch (450ms hold) reorder with cross-lane (Needs↔Lifestyle) support. Persists
via F35 **once, on drop** — deliberately not on `dragover`.
> **IF** reorder persistence is ever attached to a continuous event (dragover, live
> preview), **THEN** it fires a network write per pixel — the exact anti-pattern
> CLAUDE.md's eager-save section forbids. Check: one drag = exactly one save call.
> Cross-lane moves also rewrite `category` — verify Lifestyle↔Needs affects
> `weeklyBurn` in New Job Season (F44) and budget-health splits.

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
> (TODO §3) — extend that, not the regeneration. Check: a mid-quarter payoff keeps
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

**F44 · New Job Season budget surface** — `NewJobSeasonBudgetPanel.jsx`: triage `setStatus:138`,
`toggleAutoReactivate:139`, `pauseAllFlexible:142`, `removeExpense:145`, inline add
`:157–162` (stamps `trackDuringNewJobSeason: true` + `dueDateAnchor`); `upcomingBills:102–116`
(due-date countdowns, active bills only); runway via `computeNewJobSeasonRunway:68–70`
(`extraCash: huntIncome`); the same pencil-badged Cash On Hand row + shared
`CashOnHandSheet.jsx` as F22 (`saveCashOnHand:74–78`, §1.H17 — writes
`newJobSeasonCashOnHand` + re-stamps `newJobSeasonCashOnHandAsOf`, so editing from *either* panel
resets the decay clock identically); benefit-scenario toggle `includeBenefits` lifted to
App state (**session-only, deliberately unpersisted**, shared with NewJobSeasonHomePanel so
both quote one scenario) — **[G→L]**
> **IF** triage status values (`active`/`paused`/`cancelled`) or `trackDuringNewJobSeason`
> semantics change, **THEN** check every reader: `weeklyBurn` **and** `sumBillsDueSince`'s
> essential-bill filter (both `newJobSeasonRunway.js`, kept in sync via the shared
> `isTrackedActiveEssential` predicate — do not let a future edit fork them back apart),
> `upcomingBills` filter, Back to Work auto-reactivation (§7 F11). F24's runway
> quarantines are closed (`3267286`) — no filter-drift risk from that direction anymore.
> **IF** `includeBenefits` is ever persisted, **THEN** that's a product decision reversal
> — its session-only nature is documented intent, not an oversight. Check: toggling the
> scenario on one panel changes the other; kill-tab keeps triage states but resets the
> scenario toggle; editing Cash On Hand from Budget updates Home's card figure and vice
> versa (single source of truth, `newJobSeasonFlow.test.jsx`).

### 10.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `expense.js` cycle/conversion helpers (`toMonthlyCost`, `perPaycheckFromCycle`, `CHECKS_PER_MONTH`, `normalizeCycle`) | Every card amount, `minFoodPerCheck` scaling, breakdown displays (`bddeb04`/`8e669e3` fixed over-counting here once), Coach per-expense lines | `expense.test.js`; a monthly-cycle bill shows the same cost on card, breakdown, and Ask Coach | D1 |
| `getEffectiveAmountForMonth` / `getPhaseIndex` (Spine A) | F36/F38 consumers + `computeRemainingSpend` + budget health month boundary + Coach grounding | One expense with override + history: all surfaces agree | D1 |
| `monthlyOverrides`/`history` storage shape | F37's five writers + F42 bulk payload + restore sheet + DB `expenses` column shape | `expense.test.js` round-trip case; DB Row drift badge clean after each save scope | D2/D3 |
| Expense `category` values (Needs/Lifestyle) | F40 cross-lane rewrite, New Job Season `weeklyBurn` (Needs-only), budget-health splits, `pauseAllFlexible`'s flexible-category filter | Move a bill across lanes; runway + health both shift accordingly | D1 |
| `loanMeta` fields / `buildLoanHistory` regeneration | F41 zone — payoff cards, New Job Season due-date attach (`loanMeta.firstPaymentDate`, §7 F12), quarter-close behavior | `finance.test.js` loan cases; mid-quarter payoff manual check | D2 |
| `newJobSeasonStatus`/`trackDuringNewJobSeason` flags | F44 readers + NewJobSeasonEntry's review step (§7 F12) + Back to Work reactivation (§7 F11) | `newJobSeasonFlow.test.jsx` | D1/D4 |
| `canAccessTaxPlan` inputs (Spine C) | F43 here + ProfilePanel's Tax Plan section — identical gating | Tester/admin/plain × opt-in matrix | D4 |
| A new mutation-capable prop into either panel | readOnly noop shadows (`:87–89`, JLBP `:43–47`) | Prop in shadow list; expired-account no-op test | D4 |

### 10.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| `readOnly` (paywall-expired) | false / true | true: F35 wrapper noop'd in both panels; categories force-collapsed and headers inert (`:1415`/`:1455`); add/edit UI hidden (`:1744`, `:1995`) |
| `config.newJobSeasonMode` | false / true | true: `NewJobSeasonBudgetPanel` replaces BudgetPanel (`App.jsx:1536`); triage inline; simplified add form stamps `trackDuringNewJobSeason` |
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
TODO §3's loan follow-up — not filed as a DW defect since it's a designed-in gap with
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

### 11.3 Cleanup — done

**DW-4 (fixed).** `BenefitsPanel.jsx` and its coverage tests (`panels.test.jsx`'s
`describe('BenefitsPanel', ...)` block) are deleted, on owner sign-off. Before deleting,
re-ran the import-graph sweep the finding called for across all of `src/components/`
(35 files) and `src/lib/` (18 files) — `BenefitsPanel.jsx` was the only module reachable
from nothing but its own test; no other orphans turned up. (Noted in passing, not part of
this fix: `formatFiscalWeekLabel` — a `fiscalWeek.js` export superseded per its own
in-file comment — is imported-but-uncalled in four files, `App.jsx`/`LogPanel.jsx`/
`BudgetPanel.jsx`/`HomePanel.jsx`, though still genuinely called from
`DemoAccountTree.jsx`. That's dead-import cruft on a still-live export, a different and
smaller class than DW-4's whole-module orphan — left for a future lint-debt pass.)
CLAUDE.md's file-structure map and Known Cleanup list updated in the same commit.

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

**F45 · Sub-view router + New Job Season swap** — `ProfilePanel.jsx:1929–1946` (routes),
`:1959–1993` (mode swap) — **[G]**
`activeSection` state routes to six sub-views. Two gate styles coexist: `taxplan`
re-checks its gate *at the route* (`activeSection === "taxplan" && canSeeTaxPlan`,
`:1941`); `investorcodes` gates only the ListRow (`isAdmin`, `:2019`) — the route
itself (`:1944`) trusts that state can only be set by tapping the row. In New Job Season
Mode the whole Work & Pay group is replaced by one "Back to Work" row (`:1959`) —
deliberate: Job & Pay / Retirement figures would be stale or misleading with no income.
> **IF** `activeSection` ever becomes settable by anything other than a row tap (deep
> link, restored nav state, URL param), **THEN** `investorcodes` needs the same
> route-level re-check `taxplan` has — today's asymmetry is safe only because state is
> tap-only. **IF** the New Job Season swap's row set changes, **THEN** re-check §7 F11
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

**F51 · `PreferencesDetail`** — `:1494–1567`; Freedom Allowance save `:1503–1509` — **[G/L]**
Freedom Allowance editor (On/Off + amount, clamped 0–200 — same `FREEDOM_ALLOWANCE_MAX` cap as the wizard's
Wrap Up, §7 F5's `?? 50` default) and the Tax Exempt display row (lock icon when the
tax feature is locked, `d6bfecf`; label deliberately says "Standard withholding" for
everyone locked, since `taxExemptOptIn` without the unlock is ignored by the math).
> **IF** the Freedom Allowance cap/default changes here or in the wizard, **THEN** both editors
> and `freedomAllowancePerWeek` (§8 F14) move together — three sites, one number. Check: set
> $200 here, Wrap Up shows $200; Live Inspector `freedomAllowancePerWeek` matches schedule
> scaling.

**F52 · `AccountDetail` auth actions** — `:86–345`: change email `:120–135`, change
password `:171` (hidden for Google-only accounts — no email identity, `6e123e8`,
`:113–117`), link Google `:198`, global sign-out `:186–193`, **hard delete**
`:317–345` (type-DELETE confirmation → `POST /api/delete-account` with bearer token →
global sign-out) — **[G]**
The delete here is the **true, unrecoverable** path — server-side it does *not*
tombstone into `deleted_accounts`; only the cron's non-payment deletion archives first
(§8). The two delete paths' difference is a product invariant.
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
> that's the exact drift the §8 rule forbids (Lock Date must not extend trials or the
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
| Freedom Allowance cap/default | F51 + wizard Wrap Up (§7 F5) + `freedomAllowancePerWeek` (§8 F14) | $200 here ↔ Wrap Up ↔ Live Inspector | D1 |
| `api/delete-account` contract or archive semantics | F52's hard-delete invariant vs. §8's cron tombstone path; revival flow (T8/T9) must keep finding only *cron-deleted* accounts revivable | `db.test.js` + revival lookup on a user-deleted email returns nothing | D4 |
| Stripe plan labels/prices/status precedence | F53 ↔ `UpgradeCard` ↔ TrialBanner ↔ Live Inspector Sub Phase | One account, four surfaces, same story | D5 |
| `subscription` prop shape (`db.js` mapping, T7) | F53's status resolution + `getEntitlement` inputs | `db.test.js` subscription mapping cases | D1 |

### 12.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| `config.newJobSeasonMode` | false / true | true: Work & Pay group → single "Back to Work" row (F45); Account/Preferences/admin rows unchanged |
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
  crashed the whole Account tab; ProfilePanel's prop signature (18 at this pass, now 19
  after `betaCodeUsed` was added 2026-07-24) makes it the most prop-fragile component in
  the app — treat any App.jsx wiring change here as crash-risk until rendered once.
- *Google-only password form* (`6e123e8`) — identity-gated forms, F52.

**Standing findings from this pass:** none filed as DW defects. The `investorcodes`
route-gate asymmetry (F45) is a hardening note, not a live defect — `activeSection` is
tap-only state and the InvestorAdminPanel's data calls are RLS-gated server-side; it
becomes a real gap only if sub-view state ever gains an external setter, which its
IF/THEN now guards. Queue-visible as watch item **DW-W2** in `BUG_FIX_TODO.md`. The
D5 correction (active-systems §17 sub-view list) was applied in-pass per protocol.

**Cross-reference (2026-07-24, beta program work):** two new sub-views added —
`betaredeem` (`BetaRedeemDetail`) and `betafeedback` (`BetaFeedbackDetail`), routed the
same tap-only way as every other `activeSection` case. `betaredeem`'s row is intentionally
**always visible** (not `isAdmin`-gated like `investorcodes`) — same "always-visible
regardless of invite" posture LoginScreen's investor-code box already uses; reachability
carries no privilege since `api/seed-beta.js` re-validates the code server-side regardless
of how the form was opened. `betafeedback`'s row IS gated (`isBetaTester` only), inheriting
the exact F45/DW-W2 asymmetry already accepted for `investorcodes` — not a new instance to
track separately. The real boundary for both is server-side (`api/seed-beta.js`'s
re-validation; migration 031's insert-eligibility trigger for feedback), consistent with
why DW-W2 was filed as a watch item, not a defect.

---

## 13. T6 — Log Panel Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F54+).
**Git-history note:** governing recent intentions are the eager-save audit (`764da5b` —
log entries covered), the rolling pay-week dropdown (`7532c86`, `e7e5faa`), and the
base-user-friendly per-entry breakdown (`11da9c7`). This section also absorbs the
401k/PTO display entries promised by §11.2's redirect (ported from the dead
BenefitsPanel).

**Scope:** `LogPanel.jsx` (1,293 lines) and its App.jsx feed: the `eventImpact` memo,
`logTotals` threading, `bucketModel`, and `ptoGoal` state.

### 13.1 Block 1 — Critical inventory (function by function)

**F54 · Log Effect Summary** — `LogPanel.jsx:73–86` — **[L]**
**DW-5 (fixed).** The summary card's `adjTH`/`adjWA`/`projS` were re-derived from a local
`logs.reduce` calling `calcEventImpact(e, config)` — **without `weekMeta`** — while the
values Income/Home display come from App's `eventImpact` memo (`App.jsx:1075–1119`),
which resolves each event's real week (`weekMeta.isHighWeek`, actual `grossPay`).
Second divergence vector: App's `totalNetAdjustment` counted only events with a real
(non-`""`/`null`) `weekIdx`; the local reduce counted everything. A third, undocumented
until this fix: `adjTH` never subtracted `fundedGoalSpend` even though Income's
`adjustedTakeHome` does and LogPanel already receives that prop. Fixed by converging on
one fact per number: `adjustedTakeHome`, `logNetLost`, `logNetGained` are now threaded
down from `App.jsx`'s `logTotals` (same pattern as the existing `logK401kLost` props) and
consumed directly — "Adjusted Take-Home," "Total Net Lost," "401k Lost," and "PTO Accrual
Lost" all read the authoritative prop, not a local recomputation. Only `grossLost`/
`grossGained`/`bucketHoursDeducted` (no App-level aggregate exists for these) stay locally
reduced — but now via `resolveEventWeekMeta(e, allWeeks)` (F57), so they use the event's
real week when one exists.
> **IF** a new Log Effect Summary tile is added, **THEN** it must consume the matching
> `logTotals.*` prop if App already computes an equivalent aggregate — a fresh local
> reduce reopens DW-5. If no App-level equivalent exists, resolve `weekMeta` via
> `resolveEventWeekMeta` rather than omitting it. Check: `LogPanel.test.jsx` "Log Effect
> Summary — reads authoritative props" + "Total Gross Lost — resolves the real week."

**F55 · Event CRUD cluster** — add `:275–290`, `saveEdit:299–314`, delete `:753`,
entry schema (`blank`, `:45–50`), type filter `:399–404` — **[L/G]**
All three mutations compute-then-eager-save via `onSaveLogsNow` (compliant). The
event-type dropdown filters by capability gates: bucket types
(`missed_unapproved`/`pto_unapproved`) DHL-only; PTO types need `hasPTO`. Entry ids are
`Date.now()` — the same id scheme WeekConfirmModal's spawned entries use (§9 F30/F31),
and the check-in linkage (`record.eventId`) depends on id uniqueness.
> **IF** the entry schema gains/renames a field, **THEN** every `calcEventImpact`
> branch, the WeekConfirmModal Layer-2 pre-fill (which "mirrors LogPanel's blank event
> shape" — `WeekConfirmModal.jsx:135`), and the F30 mirror's remap list must move
> together — three writers of one schema. Check: `newJobSeasonFlow`/`WeekConfirmModal`
> tests + log an event of each type.

**F56 · Pay-week dropdown + `resolveWeek`** — rolling window ordering (`7532c86`),
"Week of start–end" labels (`e7e5faa`), `handleEditWeekEndChange:298` (resets
`missedDays`/hours when the week changes) — **[G]**
> **IF** week identity fields (`weekEnd`/`weekIdx`/`weekRotation`) can be edited
> without resetting day-resolution fields, **THEN** stale `missedDays` from the old
> week silently mis-price the event — the reset in `handleEditWeekEndChange` is
> load-bearing, keep it on any new week-changing path.

**F57 · `calcEventImpact` consumption contract** — authoritative: `finance.js:1264`
(3-arg, `weekMeta` grounds `isWeek2` + `baseGross`); resolver: `resolveEventWeekMeta(event,
allWeeks)` (`finance.js`, added for the DW-5 fix — "" and null `weekIdx` return `null`,
never coerce to week 0 via `Number()`); every caller (App's `eventImpact` memo, LogPanel's
`tot` reduce and its per-entry `imp` — F62, `App.jsx`'s Week Inspector `weekLogs` filter,
`DemoAccountTree.jsx`'s mirrored `eventImpact`) now goes through it — **[L]**
`calcEventImpact` itself also had the same `Number(event.weekIdx)` coercion bug internally
(its `pastWeekTaxStatusOverrides`/`taxedWeeks` lookup), fixed in the same pass: an event
with no real week no longer borrows week 0's tax status.
> **IF** a new caller reads `event.weekIdx`, **THEN** it must go through
> `resolveEventWeekMeta` rather than `Number(e.weekIdx)` directly — that's the one place
> "does this event have a real week" is answered (CLAUDE.md's cardinal L rule). Check:
> `finance.test.js`'s `resolveEventWeekMeta` suite + the "weekIdx must not be coerced to
> week 0" `calcEventImpact` suite; per-entry breakdown (admin chevron) matches the hero
> cards for the same entry.

**F58 · 401k display block (ported)** — `:86–98`; gates `has401k:159` (DHL: enrollment
**and** rate; base: rate only) — **[L]**
Sums `allWeeks`' `k401kEmployee`/`k401kEmployer` columns (Spine A truth), adjusts by
the `logTotals` aggregates App threads in (`:1581–1585` — weekMeta-aware, correct
side of DW-5), honors the `k401StartDate || benefitsStartDate` fallback shared with
T5's `BenefitsDetail` (§12 F49).
> **IF** the fallback order or the enrollment-gate asymmetry changes, **THEN** T5's
> card, this block, and Spine A must move together (the F49 three-reader rule).
> Check: base user with rate but no enrollment sees 401k here; DHL user without
> enrollment doesn't.

**F59 · PTO balance model** — `:99–153`: projected-accrual model (`ptoBs`, active-week
hours ÷ 20) vs. manual-override model (`ptoHoursOverride` + confirmed-weeks earnings −
consumption − accrual losses since `ptoOverrideWeekIdx`); goal projection
(`goalPtoProjected`) deliberately sums *all* active weeks to the goal date, not just
confirmed; `negCap` extends availability — **[L]**
Override Save is eager-saved (`:1043`, compliant).
> **IF** accrual rate (÷20), the consumption split (`pto` uses `ptoHours`,
> `pto_unapproved` uses `hoursLost`), or the override arithmetic changes, **THEN**
> both models and the goal tracker must stay consistent — and `calcEventImpact`'s
> `hoursLostForPTO` (accrual-only, no direct draws — the `:107–110` comment) remains
> a *different* quantity than `ptoUsedAll`. Confusing those two double-counts PTO.
> Check: log a `pto` event and a missed shift; balance drops by draw + accrual-loss
> exactly once each.

**F60 · `ptoGoal` CRUD** — `saveForm:187–198`, Clear `:1105`; App wiring
`App.jsx` (`onSavePtoGoalNow` prop → `savePersistedStateNow({ ptoGoal: next })`) — **[L]**
**DW-6 (fixed).** Save and Clear are discrete actions but rode the 800ms debounce — App
passed no eager-save wrapper for `ptoGoal` (the only un-eager-saved discrete mutation
on this surface; the CLAUDE.md eager-save table had no `ptoGoal` row, so the `764da5b`
audit's coverage claim had a gap). Fixed: `onSavePtoGoalNow(next)` prop added to App
(mirrors `saveConfigNow`'s shape), threaded to `LogPanel`, and called in both `saveForm`
and Clear alongside `setPtoGoal` with the same computed value. CLAUDE.md's eager-save
table now has a `ptoGoal` row. Regression-tested in `LogPanel.test.jsx` ("PTO Goal —
eager save").
> Check: kill-tab after Save; goal survives reload.

**F61 · Attendance surfaces** — DHL bucket: `bucketModel` prop (computed in App via
`computeBucketModel`, Spine A), bucket balance override Save/Reset `:1194`/`:1210`
(both eager-saved); base-user tracker `:1247+` (`attendanceBucketEnabled === true` +
thresholds, display-only vs. configured warn/terminate) — **[L/G]**
> **IF** `computeBucketModel`'s tiers/cap/payout change, **THEN** this display, the
> bucket-hours hero card, and `calcEventImpact`'s `bucketHoursDeducted` move together.
> **IF** the base tracker gains any payout math, **THEN** it stops being the
> deliberately-simpler mechanism active-systems §7 documents — product decision,
> surface it.

**F62 · Admin per-entry breakdown** — `:653` (chevron-expanded `calcEventImpact`
output per entry, now via `resolveEventWeekMeta`), `isAdmin`-gated — **[G]**
**DW-5 (fixed, same commit as F54/F57).** Previously shared F57's weekMeta-less caveat.
The breakdown is the Warden's own instrument for event-impact verification (Spine F) —
its numbers must match the hero-card aggregates, and now do: the same
`resolveEventWeekMeta(entry, allWeeks)` call that grounds the aggregate reduce (F54)
grounds this per-entry call too.

### 13.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `calcEventImpact` signature/branches (Spine A) | F54/F57/F62 callers, App's `eventImpact`, WeekConfirmModal Layer-2 pre-fills, per-week `weeklyNetAdjustments` → goal funding (§9 F29) | `finance.test.js` + one event of each type; hero cards = per-entry breakdown = Income delta | D1 |
| Event schema (`blank` shape) | F55's three writers (LogPanel CRUD, check-in spawns, F30 mirror), `record.eventId` linkage, `sumJobHuntIncome` (reads `jobHuntIncomeLog`, *separate* log — don't conflate) | Schema greps + `WeekConfirmModal.test.jsx` | D1 |
| `EVENT_TYPES` (`constants/config.js`) | F55 filter gates, `calcEventImpact` branch coverage, hero-card groupings, attendance history month grouping | Add/rename type → every switch handles it or explicitly ignores | D1 |
| `logTotals` threading (`App.jsx:1578–1587`) | F58's adjusted 401k figures + F54's net/adjustedTakeHome figures (widened by the DW-5 fix) | Prop list vs. `eventImpact` return shape — `DemoAccountTree.jsx`'s mirrored `<LogPanel>` call must carry the same prop set | D3 |
| `ptoGoal`/`ptoHoursOverride`/bucket override fields | F59/F60/F61 + `db.js` `pto_goal` column + DB Row drift badge | Kill-tab tests per mutation; drift badge clean | D3 |
| `allWeeks` 401k columns (`k401kEmployee`/`k401kEmployer`, Spine A) | F58 sums + Week Inspector's 401k display + the known `$14.96 match with matchRate 0` incident class (CLAUDE.md Week Inspector notes) | Week Inspector vs. this block on one week | D1 |
| UpgradePanel replacement (T9) | Like Income (§9), this panel has **no readOnly shadow** — replaced wholesale when expired (`App.jsx:1570`) | If expired-mode ever renders LogPanel, every mutation is live | D4 |

### 13.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| Employer | DHL / base | DHL: bucket types + bucket card + rotation labels; `has401k` needs enrollment+rate. Base: no bucket types, `has401k` on rate alone, attendance tracker only if opted in |
| `hasPTO` | DHL / base+`ptoEnabled` / neither | PTO event types + PTO section gated; neither: no PTO surface |
| `isAdmin` | false / true | true: per-entry impact chevron (F62); false: cards only |
| Entitlement | entitled / expired | Expired: whole panel replaced by `UpgradePanel` (`App.jsx:1570`) — no internal gate exists |
| `config.newJobSeasonMode` | false / true | true: Log tab removed from nav + force-redirected (`App.jsx:337`) — unreachable |
| `ptoHoursOverride` | null / set | Set: rolling-balance model + "(manual)" tag; null: projected-accrual model |

### 13.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *BenefitsPanel port* (§11) — the 401k/PTO blocks here are the living descendants;
  the marker comment at `:86` is the lineage record.
- *Base-friendly breakdown* (`11da9c7`) + *extra-day PTO gain* (`a8b9bf0`) — the
  per-entry breakdown and PTO gain semantics were tuned for base users; DHL-flavored
  assumptions regressing into them is the watch.
- *Rolling pay-week dropdown* (`7532c86`, `e7e5faa`) — dropdown order/labels are
  deliberate UX; the week-change reset (F56) shipped with it.
- *Parallel adjusted-take-home derivation (F54/F57/F62), fixed* — `DW-5`: LogPanel
  re-derived net totals weekMeta-less while Income/Home read App's weekMeta-aware
  `logTotals` — same-screen disagreement was possible, plus a third undocumented
  divergence (Log's `adjTH` never subtracted `fundedGoalSpend`). Fixed by threading
  `logTotals.adjustedTakeHome`/`netLost`/`netGained` down (the 401k aggregates already
  set the pattern) and by extracting `resolveEventWeekMeta` (`finance.js`) so every
  `calcEventImpact` caller — App's `eventImpact`, LogPanel's aggregate and per-entry
  calls, the Week Inspector's `weekLogs` filter, `DemoAccountTree.jsx`'s mirrored
  `eventImpact` — resolves the same real week the same way. Also fixed a sharper sibling
  bug found while tracing this: `Number("")` and `Number(null)` both evaluate to `0`, so
  the old `Number(e.weekIdx)` coercion (in App's `eventImpact`, the Week Inspector filter,
  and inside `calcEventImpact`'s own tax-status lookup) silently misattributed an
  unresolved-week event to week 0 instead of excluding it. `resolveEventWeekMeta` closes
  that for good — `""`/`null` now resolve to `weekIdx: null`, never `0`.

**Standing findings from this pass:**
1. **`ptoGoal` lacks eager save (F60) — fixed** *(DW-6)*: Save/Clear rode the
   debounce; it was the only rule exception on this surface, and a gap in the `764da5b`
   audit's coverage. `onSavePtoGoalNow` added to App + CLAUDE.md's eager-save table;
   both call sites now eager-save.

---

## 14. T7 — Auth System Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F63+).
**Git-history note:** this surface is where the repo's hardest-won race-condition case
law lives — nearly every guard in the boot chain has an in-code memorial comment naming
the production bug it fixed: the Google double-select bug (INITIAL_SESSION gate), the
visibility-re-emit data-loss bug (SIGNED_IN dedup), the wizard-re-trigger-over-real-data
bug (`cc227ad`), the dropped unload write (`168cc4b`), the RLS write-permission trigger
failure (`8f34def`→`a93dcad`→migration 024). Two D5s corrected in-pass: CLAUDE.md's
"No backend server / no Stripe — yet" Tech Stack claim (14 serverless functions exist)
and its "next migration is 023" note (023/024 exist; next is 025).

**Scope:** `lib/supabase.js`, `lib/db.js` (load/save/flush/investor/demo/revival),
the `App.jsx` auth boot chain, tier flags + RLS migrations, and the investor/demo
machinery (`DemoAccountTree.jsx`, `InvestorRegister.jsx`, `InvestorAdminPanel.jsx`).
The ProfilePanel UI that *calls* these primitives is T5 (§12); pre-session surfaces are
T8.

### 14.1 Block 1 — Critical inventory (function by function)

**F63 · `sharedStorage` dual-write session shim** — `supabase.js:12–40` — **[G]**
iOS Safari PWAs run in an isolated storage partition: localStorage set in the browser
tab is invisible to the home-screen app, but cookies are shared. Sessions dual-write
localStorage + cookie (skipping the cookie when the encoded session exceeds ~3800
bytes), and reads prefer a *validated* cookie (JSON.parse before trusting).
> **IF** the storage shim, cookie size guard, or key handling changes, **THEN** the
> failure is invisible on desktop and total on iOS PWA: users signed in via Safari
> appear signed out in the installed app. Check: Safari sign-in → install → launch
> standalone → still signed in; and a session > 4KB still works via localStorage.

**F64 · `cachedAuthSnapshot`** — `supabase.js:61–71` — **[L]**
An `onAuthStateChange` listener keeps `{accessToken, userId}` current so
`flushUserDataKeepalive` (F68) can read credentials **synchronously** — unload handlers
get no time to await `getSession()`.
> **IF** anything makes the flush path async before its `fetch()` dispatch, **THEN**
> the keepalive hardening silently stops working (the page tears down first) — the
> exact class `168cc4b` fixed. The snapshot must stay listener-maintained, never
> promise-fetched at flush time.

**F120 · `getCurrentUserId` session fallback** — `supabase.js:50–70` — **[L]**
The identity primitive every `db.js` load/save/flush path resolves through. It probes
`auth.getUser()` first (a `/auth/v1/user` network round-trip) but **falls back to the
persisted session (`getSession()`, a local read) when `getUser()` returns a null user
without throwing** — which is exactly what happens right after a deploy reload, when the
access token is mid-refresh or the round-trip transiently fails. This is the **third
door** to the `cc227ad` wizard-reset failure, alongside F66's load-failure path and
`db.js:170–181`'s PGRST116 query rule: a transiently-null `userId` sends `loadUserData`
into its `if (!userId)` branch (`db.js:103–118`) → `DEFAULT_CONFIG` (`setupComplete:false`)
→ setup wizard reopens for a signed-in user, overwriting the real row if completed. The
build/deploy reload is the trigger that opened this door in production; the getUser→session
fallback closes it because the load effect only runs once `authedUser` (session-derived) is
set, so the session is always in storage by then.
> **IF** this probe order changes, or a caller starts trusting `getUser()`'s null
> directly, **THEN** the wizard-reset-over-real-data bug returns through the identity
> layer even with F66 and the PGRST116 rule intact. The `getUser()`-succeeds path must
> stay behaviorally unchanged (session fallback is null-only); only a genuinely absent
> session (real SIGNED_OUT — supabase-js clears storage) may resolve null. Check:
> `supabaseAuth.test.js`'s three cases (normal id, null-user→session fallback, both empty).

**F65 · Auth boot chain** — `App.jsx:422–479` (`onAuthChange` effect) — **[G]**
Four load-bearing guards, each with its own incident history:
(1) **No `getSession()` pre-check** — INITIAL_SESSION is the `authChecked` gate,
because `getSession()` resolves before the OAuth code exchange and once overwrote a
signed-in user back to null (the Google double-select bug).
(2) **SIGNED_IN dedup** (`signedInChainRanForRef`) — GoTrueClient re-emits SIGNED_IN
with the same session on every hidden→visible transition; before the guard, each
re-emit force-reloaded from DB, overwriting in-memory edits and flashing the loading
screen.
(3) **Revival-first ordering** — `checkRevival()` must run before `syncUserProfile()`:
an OAuth sign-in with a tombstoned email would otherwise silently seed a fresh free
trial instead of routing to ReviveScreen; a lookup *failure* falls back to the normal
flow so a server blip can't lock a real user out.
(4) **Post-seed `reloadTrigger` bump** — `loadUserData` races the seeding chain on
brand-new signups and usually wins, reading all-null trial fields; without the bump,
`getEntitlement` would permanently report "none".
> **IF** any event handling, ordering, or guard in this chain changes, **THEN** re-test
> all four incident scenarios by name: Google first-sign-in (single select), mobile
> app-switch during an unsaved edit (edit survives), tombstoned-email OAuth sign-in
> (ReviveScreen, no trial seed), brand-new signup (trial countdown appears without a
> manual reload). This is the highest-density incident zone in the app — nothing here
> is decorative.

**F66 · Load effect + `applyLoadedData`** — `App.jsx:517–581` — **[L]**
Deps are `[authedUser?.id, reloadTrigger]` — *id*, not the object, so TOKEN_REFRESHED
can't re-trigger a stale overwrite. `applyLoadedData` skips the debounce-writable
fields when `pendingSaveRef` is set (a load must not revert an edit made in the last
800ms) but always applies tier flags/subscription. Failure path: retry once after
1.5s, **never fall back to defaults** — conflating failure with "new account" is the
`cc227ad` wizard-re-trigger bug (and `db.js:170–181`'s PGRST116 rule is the same law
on the query side; F120's `getCurrentUserId` session fallback is the same law on the
identity side — three doors, one failure).
> **IF** the dep list, the pending-save guard, or the retry policy changes, **THEN**
> walk the same incident set as F65 plus: transient offline reload on an existing
> account must show a retry/loading state, never the setup wizard. Check:
> `db.test.js`'s PGRST116 cases.

**F67 · `loadUserData` migration gauntlet** — `db.js:98–380` — **[L]**
Ordered, idempotent, load-time normalization: DEFAULT_CONFIG merge (new fields reach
existing rows — `:227–232`); expense migrations (legacy `weekly`→`history`, Q4
back-fill, loan history regeneration `:204–225` — the F41/DW-W1 zone's load-side);
DHL one-time corrections (pre-wizard preset, rotation, baseRate/diffRate value fixes);
`startDate`→`firstActiveIdx` sync with a **direction guard — only ever moves the
boundary *earlier*** (`:310–319`; moving later would delete modeled income);
`taxExemptOptIn` clears `taxedWeeks` (`:328–330`, `b8ca233`); tier-flag mapping
(`is_admin`/`is_tester`/`is_investor`/`tax_projections_enabled` → camelCase, `:370–378`).
> **IF** a migration step is added/reordered, **THEN** it must stay idempotent (every
> load runs the whole gauntlet) and respect the ordering comments (rename-before-
> correction at `:270–277` exists because the reverse order re-broke the value). The
> `firstActiveIdx` inline formula (`:313–316`) is a duplicate of the wizard's
> `dateToWeekIdx` (§7 F1) — see DW-W3. Check: `db.test.js` migration cases; a
> legacy-shaped row loads to the same numbers twice in a row.

**F68 · `saveUserData` + `flushUserDataKeepalive`** — `db.js:396–423` / `:443–482` — **[L]**
The only two writers of `user_data`'s client-writable columns. Both write the identical
field set; both derive `is_employer_dhl` from `config.employerPreset` at write time;
**neither accepts subscription/tier columns** (service-role only — the destructure *is*
the whitelist). The flush bypasses supabase-js to hit PostgREST directly with
`keepalive: true`, reading credentials from F64; a synchronous throw (64KB keepalive
body limit) falls back to the normal upsert.
> **IF** a new persisted field is added, **THEN** it must be added to *both* writers'
> field sets + `savePersistedStateNow`'s `latestPersistedStateRef` + the DB Row
> Viewer's drift-badge columns — four sites, one shape (DW-6's `ptoGoal` gap shows
> what a partial wiring looks like). **IF** anyone adds a subscription/tier field
> here, **THEN** that's a privilege-escalation path RLS would reject in prod and
> silently "work" in tests — the whitelist-by-destructure is a security boundary,
> not a style choice.

**F69 · Tier flags & RLS boundary** — migrations `019` (RLS + column grants), `021`
(`is_tester` + 6-month trial trigger), `024` (user_id UPDATE-grant fix); service-role
routes (`60a4b17`) — **[G]**
The three flags are independent by construction (CLAUDE.md Account Tiers): client
reads them via F67's mapping, *never* writes them; every AI/tax gate builds on
`hasTesterAccess` so `isAdmin` ⊇ `isTester` structurally. Migration 024 is the
case-law reminder that a migration can pass in SQL and still break writes (the
UPDATE grant was missing `user_id`, failing every upsert's conflict path).
> **IF** a new tier flag or privileged column is added, **THEN** the full checklist
> is: migration with RLS column grant + service-role write route + F67 read mapping +
> F68 exclusion + entitlements gate built on the existing base functions + lifecycle
> cron exemption decision (§4's skip list). Miss any one and you get either a
> privilege hole or a `024`-style silent write failure. Check: after the migration,
> a plain client upsert still succeeds and the new column rejects client writes.

**F70 · Investor & demo machinery** — `createInvestorAccount` (`db.js:641`),
`validateInvestorCode` (`supabase.js:94`), `saveInvestorActiveAccount`/`loadDemoAccount`/
`saveDemoAccount` (`db.js:730–852`), `InvestorAdminPanel`, `DemoAccountTree` — **[G]**
The dormant-but-live investor path: code validation (case-insensitive, active-only) →
registration → `investor_users` + `user_data` seeding → demo-account tree (accounts
1–2 demo data, 3 = wizard-driven sandbox; admin-editable via `saveDemoAccount`).
Investor accounts are exempt from config-history capture (§7 F9) and the lifecycle
cron. **As of 2026-07-25, `is_investor` grants AI features** (`hasPrivilegedAccess`,
F111) — supersedes this entry's older "grants no AI" claim; the account-tier firewall
(§9) is unchanged for Demo Tree/beta-cohort surfaces specifically.
> **IF** demo-account storage or the account-3 wizard route changes, **THEN** check
> the isolation contract — demo edits must never touch real `user_data` rows
> (`f9ed2ba`'s isolation docs) — and F66's `investorSession` race guard
> (`App.jsx:551–553`) that keeps the wizard from firing before investor config lands.

**F71 · Sign-in side-effect chain** — `syncUserProfile` (`db.js:854`), `/api/seed-trial`,
`checkRevival` (`db.js:892–908`) — **[G→L]**
Runs once per signed-in user id (F65 guard): revival lookup (bearer-authed, fails
open to normal flow), then profile sync + trial seeding, then the reload bump. The
trial seed is what routes every new account through the real entitlement state
machine instead of a hardcoded bypass.
> **IF** seeding moves, gains conditions, or the revival contract changes, **THEN**
> re-verify the F65 ordering invariants and T8/T9's consumers (ReviveScreen inputs,
> trial countdown on first render). Check: fresh email signup, fresh Google signup,
> and tombstoned-email Google signup — three different landings, all correct.

### 14.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| supabase-js upgrade (GoTrueClient behavior) | F63 storage contract, F65's event semantics (INITIAL_SESSION timing, SIGNED_IN re-emit behavior — both are *undocumented internals* the guards depend on) | Full F65 incident-scenario walk on a staging build before shipping the bump | D4 |
| `user_data` column set (any migration) | F67 mapping, F68 both writers + drift badge + `latestPersistedStateRef`, BOOKMARK freshness, CLAUDE.md migration-number note | The F69 new-column checklist; regenerate/append bookmark | D2/D5 |
| `DEFAULT_CONFIG` shape (`constants/config.js`) | F67's merge (new fields flow to existing rows), snapshot tests, wizard `formData` spread (§7 F2) | `config.test.js.snap` update is *expected* — an unchanged snapshot after adding a field means the merge missed it | D1 |
| Load-time migration steps (F67) | Idempotency + ordering; `db.test.js` migration cases; the §5 read slice (`extractBaseRateHistory` runs in the same load) | Load a legacy-shaped fixture twice; identical output both times | D2 |
| `checkRevival`/`revival-lookup` contract | F65 ordering, T8's ReviveScreen inputs, T5 F52's hard-delete invariant (user-deleted emails must NOT be revivable) | Three-signup walk (F71) + user-deleted email returns `revivable: false` | D4 |
| Trial seeding (`/api/seed-trial`, migration 021 trigger) | F71 → `getEntitlement` inputs (T9), tester 6-month window semantics (§9), lifecycle cron's skip list | New signup shows 14-day countdown; `is_tester` flip seeds 6-month window once | D1/D4 |
| Investor code/demo storage | F70 isolation contract + investor exemptions (config-history, cron) | Demo edit writes demo rows only; investor account generates no `account_history` rows | D4 |

### 14.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| Session storage context | desktop browser / iOS Safari tab / iOS installed PWA | All three share one session (F63); PWA launch after Safari sign-in is the canary cell |
| Auth event | INITIAL_SESSION / SIGNED_IN (first per id) / SIGNED_IN (re-emit) / TOKEN_REFRESHED / SIGNED_OUT / PASSWORD_RECOVERY | Only first-per-id SIGNED_IN runs the F71 chain; re-emits and refreshes must be no-ops for data; PASSWORD_RECOVERY routes to reset form; SIGNED_OUT clears the dedup ref |
| Account state at sign-in | existing row / no row (new) / tombstoned email / investor code session | Load & go / seed trial + reload / ReviveScreen, no seed / registration flow, wizard deferred to account 3 |
| Load outcome | row found / PGRST116 zero-row / query failure | Normal / defaults + wizard (only legitimate case) / retry once then error state — **never** defaults |
| Tier flags | none / admin / tester / investor (and combos) | Each unlocks only its documented account-tier surface; admin ⊇ tester structurally; investor grants AI features (2026-07-25, `hasPrivilegedAccess`) but not Demo-Tree-adjacent account-tier surfaces beyond its own; combos never interact beyond that |
| Write path | debounced / eager (`savePersistedStateNow`) / unload flush (keepalive) / service-role route | First three write the identical client field set; privileged columns only via the fourth |

### 14.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Google double-select* — `getSession()` racing the OAuth code exchange; F65 guard (1).
- *Visibility re-emit data loss* — SIGNED_IN re-runs overwriting in-memory edits; F65
  guard (2) + F66's pending-save guard are the two ends of the same fix.
- *Wizard re-trigger over real data* (`cc227ad` + `db.js` PGRST116 rule) — only a
  confirmed zero-row may ever mean "new account".
- *Dropped unload writes* (`168cc4b`) — F64/F68's keepalive design; the sync-dispatch
  constraint is the invariant.
- *Migration 024* (`8f34def`, `a93dcad`) — the UPDATE grant missing `user_id` broke
  every upsert conflict path while reads worked fine; "migration ran" ≠ "writes work".
- *RLS hardening* (`60a4b17`, migration 019) — privileged writes moved server-side;
  F68's whitelist-by-destructure is the client half.

**Standing findings from this pass:**
1. **Duplicated week-index formula** *(queued as watch item DW-W3)*: `db.js:313–316`
   inlines the `dateToWeekIdx` formula (§7 F1) because the original is file-private to
   SetupWizard. Both copies are identical today; they drift the day one changes. Fix
   shape: extract to `fiscalWeek.js` and import in both.
2. **Two D5s corrected in-pass** (CLAUDE.md Tech Stack "no backend/no Stripe" claim;
   migration-numbering note now self-warns and points here).

---

## 15. T8 — Login System Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F72+).
**Git-history note:** a young, fast-moving surface — mode crossfades landed *today*
(`d7e3269`), the trial explainer six days ago (`3fd8896`), the revival flow two weeks ago
(`1d65770`). The session boundary rule (§4.1): everything here is pre-session; the
moment SIGNED_IN fires, T7's boot chain (§14 F65) owns the flow.

**Scope:** `LoginScreen.jsx` (570 lines, 6 modes), `ReviveScreen.jsx`,
`TrialExplainerScreen.jsx`, `api/revival-lookup.js`, and App.jsx's pre-session render
ladder (`:1429–1478`).

### 15.1 Block 1 — Critical inventory (function by function)

**F72 · LoginScreen mode machine** — `LoginScreen.jsx:125` (`mode`:
`signin | signup | forgot | revive`, plus the `info` interstitial and the
`recoveryMode` prop variant) — **[G]**
Six visual states, crossfaded (`d7e3269`). `recoveryMode` is not a `mode` value — it's
a prop set by App when PASSWORD_RECOVERY fires, rendering the set-new-password form.
> **IF** a mode is added or transitions change, **THEN** every escape hatch must stay
> reachable (each mode's "← Back to sign in") and the crossfade must not strand focus
> or double-submit during the fade. Check: `LoginScreen.test.jsx` (the revival test's
> input-timing fix `6e2ca11` exists because the fade delayed input mounting).

**F73 · Sign-in revival intercept** — `handleSubmit`, `LoginScreen.jsx:211–251`
(intercept at `:230–243`) — **[G]**
A non-payment-deleted account fails `signInWithPassword` *exactly like a wrong
password* (the auth user is gone), so every failed sign-in probes
`lookupRevivable(email)` before surfacing the error; a match flips to `revive` mode
(carrying `oauthProvider` for copy), a lookup failure falls through to the generic
error — the probe can never block a regular login.
> **IF** the error-handling order changes, **THEN** the tombstone check must stay
> *before* the error display and stay fail-open. Check: wrong-password on a live
> account still shows the normal error (no revival flash); tombstoned email lands in
> revive mode.

**F74 · Revive replacement signup** — `handleReviveSignUp`, `LoginScreen.jsx:259–284` — **[G]**
Creates a brand-new auth user for the tombstoned email (the old one was hard-deleted).
Deliberate design: on success (or after email confirmation + sign-in), T7's SIGNED_IN
chain runs `checkRevival()` and routes to ReviveScreen — this handler does *not* route
anywhere itself, so the confirmation-required detour loses nothing.
> **IF** anyone adds direct post-signup routing here, **THEN** it races T7 F65's
> revival-first ordering — the chain is the single router by design. Check: revive
> signup with email confirmation ON still lands on ReviveScreen after confirming.

**F75 · Client-side row seeding on signup** — `LoginScreen.jsx:224` / `:278`
(`supabase.from("user_data").insert({ user_id })`) — **[L]**
Both signup paths insert a bare `user_data` row (own-row RLS insert). The real
seeding (profile metadata, trial window) happens later in T7 F71's chain — this bare
insert just guarantees a row exists so `loadUserData` doesn't take the zero-row path.
> **IF** RLS insert policy or the row's default column values change, **THEN** check
> the interplay: bare row now + `syncUserProfile`/`seed-trial` upsert later must
> converge to the same shape as an OAuth signup (which has no client insert at all
> and relies wholly on the chain). Check: email signup and Google signup produce
> identical rows post-chain.

**F76 · OAuth entry + failed-callback surface** — `signInWithOAuth`
`LoginScreen.jsx:162`; stale-code detection `App.jsx:500–511` (T7 boundary);
`oauthCallbackFailed`/`onOauthRetry` props — **[G]**
supabase-js never surfaces a failed PKCE exchange through `onAuthStateChange`
(`0e0c4b1`) — the app detects the stranded `?code=`/`error` params itself, cleans the
URL, and tells LoginScreen to explain rather than showing a silently blank form.
> **IF** OAuth flow or redirect handling changes, **THEN** re-test the failure cell
> explicitly (a first-time sign-in with a cold code-verifier is the known trigger) —
> success-path testing alone re-hides this bug class.

**F77 · Investor code entry** — `handleInvestorSubmit`, `LoginScreen.jsx:286–299` →
`onInvestorVerified` → `investorSession` → `InvestorRegister` (T7 F70) — **[G]**
Case-insensitive, active-only validation; the verified code becomes the pre-session
`investorSession` that suppresses the wizard until account-3 selection (§14 F66's
race guard).
> **IF** the code contract changes, **THEN** `validateInvestorCode` (fail-closed on
> error) and `createInvestorAccount`'s `codeUsed` stamp must agree on normalization
> (trim + lowercase, both ends).

**F78 · Pre-session render ladder** — `App.jsx:1429–1478` — **[G]**
Fixed precedence: `pendingPasswordReset` → `revivalInfo` (ReviveScreen — "no app, no
wizard, no trial") → no-session LoginScreen → `loading` → entitlement resolution
(real wall-clock, §12 F53's rule) → **TrialExplainerScreen gate** (`:1470`: first-run
wizard entry ∧ not investor ∧ `entitlement.state === "trial"` ∧ not yet acknowledged —
the required "I understand" checkbox gates entry into setup, `3fd8896`).
> **IF** ladder order changes, **THEN** walk every rung's capture: a revivable user
> must never see the wizard or trial explainer; a recovery click must beat everything;
> the explainer must show exactly once and only to fresh trial signups (never
> life-event re-entries — `wizardEntry === false` is that discriminator, §7 F8's
> source/tagging depends on the same value).

**F79 · Revival lookup + ReviveScreen contract** — `api/revival-lookup.js` (dual-mode:
unauthenticated email probe for F73, session-verified probe for T7's `checkRevival`;
only `revived_at IS NULL` tombstones count); `ReviveScreen.jsx:24–51`
(`stripe-revive-checkout`, restore only via webhook after a real charge) — **[G]**
**Documented accepted risk:** the unauthenticated path is deliberately an existence
oracle ("this email had an account deleted for non-payment") — the file's own comment
owns that trade-off; it returns flags + provider, never archived data.
> **IF** the lookup's filter or response shape changes, **THEN** both callers (F73's
> email probe, T7 F65's session probe) and the T5 F52 invariant (user-deleted emails
> return nothing — only cron tombstones exist in `deleted_accounts`) must hold; a
> consumed tombstone (`revived_at` set) behaves like any other email. Check: the
> three-signup walk (§14 F71) + a revived account signing in normally afterward.

### 15.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `deleted_accounts` schema / tombstone semantics (T9's webhook writes `revived_at`) | F73/F79 probes, T7 `checkRevival`, ReviveScreen restore copy | Three-signup walk + post-revival sign-in | D4 |
| `getEntitlement` states or trial seeding timing (Spine C / T7 F71) | F78's explainer condition (`state === "trial"`) — a seeding race regression makes the explainer silently never show (the §14 F65 guard-4 race, same symptom) | Fresh signup: explainer appears before wizard | D4 |
| `wizardEntry` sentinel values (§7) | F78's `wizardEntry === false` discriminator — the same value T1 uses for history-source tagging | Life-event re-entry never shows the explainer | D4 |
| Supabase auth settings (email confirmation on/off, password policy) | F74's confirmation detour, F75's row seeding timing, info-mode copy | Both signup paths with confirmation ON and OFF | D4 |
| LoginScreen visual modes / crossfade timing | Focus/submit integrity during fades; test timing (`6e2ca11` precedent) | `LoginScreen.test.jsx` | D5 |

### 15.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| Render ladder rung | recovery / revivable / no-session / loading / trial-explainer / app | Strict precedence per F78 — each rung fully captures its state |
| Sign-in outcome | success / wrong password (live account) / tombstoned email / lookup failure | App boot / normal error / revive mode / normal error (fail-open) |
| Signup path | email+password / Google OAuth / revive replacement / investor code | Bare row + chain / chain only / chain routes to ReviveScreen / InvestorRegister, wizard deferred |
| Email confirmation | off / on | Immediate session vs. info interstitial; revival detour unaffected (F74) |
| OAuth callback | success / failed PKCE exchange | Signed in / cleaned URL + explanatory error + retry (F76) |
| Trial explainer condition | fresh trial signup / investor / life-event re-entry / non-trial state | Shown once with required checkbox / never / never / never |

### 15.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Silent OAuth callback failure* (`0e0c4b1`) — supabase-js hides failed PKCE
  exchanges; the app's own detection (F76) is the only surface for it.
- *Revival flow build* (`1d65770`) — the wrong-password/deleted-account ambiguity is
  inherent (auth user is gone); F73's probe order is the resolution.
- *Crossfade test timing* (`6e2ca11`) — mode fades delay input mounting; tests await
  the input, not the mode flip.
- *Google double-select + boot races* — owned by T7 (§14); T8 hands off at SIGNED_IN.

**Standing findings from this pass:** none — no DW items. The existence-oracle
trade-off in F79 is documented-accepted in the API's own comments (revisit only if the
product's privacy posture changes). Known Cleanup already tracks LoginScreen's
hardcoded hex colors (Spine E debt, TODO §10).

---

## 16. T9 — Paywall System Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F80+).
**Git-history note:** the whole system shipped in one dense week (§17 build,
2026-07-03→07-07): the state machine (`765eebc`), real replacement panels over covering
modals (`3a2e04f`), request-derived redirect origins (`1a12dd6`), the lifecycle cron
(`97d1ee4`), archive-then-delete wiring (`1f94022`), and cancel-on-delete hardening
(`8a2683c`). This pass found the investigation's most serious defect — **DW-7**, the
dead tester exemption in the cron (F86) — since fixed (§16.4).

**Scope:** `lib/subscription.js` (the Spine-C engine's enforcement half),
`App.jsx` gating + checkout-return plumbing, `UpgradeCard/Modal/Panel.jsx`,
`TrialBanner.jsx`, `api/_stripeClient.js`, `api/stripe-*.js`,
`api/cron-subscription-lifecycle.js`, `api/_lifecycleEngine.js`,
`api/_lifecycleEmails.js`, `api/_email.js`.

### 16.1 Block 1 — Critical inventory (function by function)

**F80 · `getEntitlement(subscription, now)`** — `subscription.js:27–77` — **[L]**
The one state machine: `active | trial | grace | expired | none`. Load-bearing rules:
(1) **`now` is real wall-clock, never Lock Date** — the header comment names the
exploit (a simulated date would grant free access); every caller (App gate, banners,
Sub card, cron engine) obeys. (2) **Live-subscription precedence** — `active`,
`trialing`-with-sub-id, and `past_due`/`canceled` *within the paid period* are entitled
regardless of trial timestamps (Stripe's retry schedule gets room to work). (3) The
day-14→21 gap is a **hidden grace**: `state: "grace"` pins `trialDaysLeft` to 0 and
`accessDaysLeft` exists for admin surfaces only. (4) Unseeded rows (investor/demo,
pre-017) are `none` — not a paywall case.
> **IF** states, precedence, or timestamps change, **THEN** every consumer moves at
> once: F81's fork, TrialBanner copy, T5 F53's Sub card, T8 F78's explainer condition,
> the cron engine (F85), and the admin Live Inspector's Sub Phase. Check:
> `subscription.test.js` + one account walked through all five states across the
> surfaces — same story everywhere. **Never** thread `effectiveToday` into any caller.

**F81 · Paywall enforcement fork** — `App.jsx` + consumers — **[G]**
`paywallBypassed = isAdmin || isTester || config.isInvestor` (**widened 2026-07-25** — was
`isAdmin || config.isInvestor` only, deliberately excluding `isTester`). Old rationale, now
superseded: testers used to ride the real trial machine on a 6-month window (§9) instead of
an unconditional bypass, relying on the cron exemption (F86 — see DW-7) as their real
protection. **Current rule**: testers are now the same "bypasses every paid wall" tier as
admin/investor (`hasPrivilegedAccess`, F111) — the 6-month trial window still gets seeded on
the `is_tester` false→true flip, but it no longer does the enforcement work; the paywall
simply never triggers for a tester regardless of where that window sits. `isExpiredReadOnly`
still splits enforcement by surface for the accounts that *do* hit it: Home/Budget (and Job
Loss panels) get `readOnly` prop-shadowing (§8 F20, §10 F35); Income/Log are *replaced* by
`UpgradePanel`; Account (T5) stays fully live so expired users can pay, manage, or delete.
> **IF** the bypass set or the per-surface split changes, **THEN** re-walk all three
> enforcement styles per tier — the known trap: a new panel added to nav gets *no*
> enforcement unless wired into one of the three styles explicitly. **IF** the bypass set is
> touched again, **THEN** re-verify against the 2026-07-25 locked decision (`hasPrivilegedAccess`
> in `entitlements.js`) before removing anyone from it. Check: expired non-admin/non-tester/
> non-investor account visits every tab; nothing mutates, checkout is reachable. A tester
> account, even with an expired-looking trial window, never sees the paywall at all.

**F82 · Upgrade surfaces** — `UpgradeCard.jsx` (shared pitch + checkout POST),
`UpgradeModal.jsx` (dismissible wrapper, Home/Budget), `UpgradePanel.jsx`
(non-dismissible replacement + per-tab tagline, `ee784c2`), `TrialBanner.jsx`
(persistent countdown; session-only dismiss `App.jsx:315`; suppressed exactly where
UpgradePanel already occupies the view, `:2168`) — **[G]**
> **IF** plan labels/prices change, **THEN** the §12 F53 three-surface parity rule
> applies (Card ↔ Sub card ↔ Stripe dashboard). **IF** banner suppression cells
> change, **THEN** verify no state shows *two* upgrade pitches stacked (banner +
> panel) or zero (dismissed banner on a replaced tab).

**F83 · Post-checkout return + poll** — `App.jsx:583–631` — **[G→L]**
Reads `?checkout=success|cancel` once and scrubs the URL (reload-safe); on success,
polls `loadUserData` up to 5×2s because the webhook may not have landed; the revival
variant (`:603–609`) clears ReviveScreen only when the restored subscription reads
`active`, closes the wizard the bare pre-restore row opened, and forces a reload.
> **IF** poll cadence/exit conditions change, **THEN** check both consumers — normal
> checkout (banner flips without manual reload) and revival (ReviveScreen exits to the
> *restored* account, not the bare row's wizard). The wizard-close line is load-bearing:
> without it a revived user lands in setup over their restored data.

**F84 · Stripe server routes** — `_stripeClient.js#resolveAppOrigin:118` (redirects
derive from the requesting deployment — `1a12dd6`); `stripe-create-checkout` /
`stripe-portal` / `stripe-revive-checkout` (bearer-token pattern);
`stripe-webhook.js`: signature verification + **idempotency via
`stripe_webhook_events`** (migration 018, `:122`), event cases (`:134–181`), and
`restoreRevivedAccount:42–86` (matches tombstone `revived_at IS NULL`, upserts the
archived blobs, stamps `revived_at`) — **[L/G]**
> **IF** webhook event handling changes, **THEN** idempotency must hold (Stripe
> retries deliver duplicates) and the revival restore must stay inside
> `checkout.session.completed`'s metadata match — a restore that fires on subscription
> events double-applies. **IF** redirect handling changes, **THEN** test from a
> preview deployment, not just prod (`resolveAppOrigin`'s whole reason). Check:
> replay a captured webhook event twice — one restore, one no-op.

**F85 · Lifecycle engine** — `_lifecycleEngine.js#decideLifecycleAction:38–90` — **[L]**
Pure per-row decision, delegating phase math to F80: exemption gate (`:44`) → card/
active/none clears leftover dunning state (`reset`) → trial nudges at days 7/12 since
trial start → grace/expired warnings on a 2-day throttle keyed off
`last_dunning_email_at` (never calendar-day flips) → `deleteDue` at
`access_ends_at + 7d`. Stamped only after successful send — idempotent, self-retrying.
> **IF** cadence, templates, or the exemption set change, **THEN**
> `lifecycleEngine.test.js`/`lifecycleEmails.test.js` encode the contract — including
> the **disclosure rule: user-facing copy references the 14-day trial only, never the
> hidden grace** (test-enforced; breaking it leaks §17's core secret). And **THEN**
> the cron's SELECT must supply every column the engine reads — see DW-7.

**F86 · Cron shell** — `cron-subscription-lifecycle.js`: `CRON_SECRET` bearer auth
(`:110–114`), the row SELECT (`:133–139`), per-row loop with
`archiveAndDeleteAccount:38` taking precedence over a same-run deletion warning
(`:153–160`), summary counters — **[G]**
**DW-7 (fixed).** The SELECT fetched `is_admin, is_investor` but **not `is_tester`** — the
engine's tester exemption read `undefined` and never fired. A tester's lapsed 6-month
window → real dunning → archive+delete. The engine is unit-tested with hand-built rows;
the select list sat outside that seam, which is how it slipped. Fixed by adding `is_tester`
to the SELECT (`:137`) plus `src/test/api/cronLifecycleSelectColumns.test.js`, a structural
regression test that reads the real runtime `.select()` argument and asserts it's a superset
of every `row.*` field `_lifecycleEngine.js` reads — kills the class, not just the instance.
> **IF** the engine gains any new row-field read, **THEN** the SELECT must grow in the
> same commit, or `cronLifecycleSelectColumns.test.js` fails — the field-coverage test this
> entry called for now exists and enforces this automatically.

**F87 · Email layer** — `_lifecycleEmails.js` (templates; disclosure rule per F85),
`_email.js` (Resend via plain fetch; `RESEND_API_KEY` fallback name `71d2692`;
`EMAIL_FROM` defaults to the dev-only `onboarding@resend.dev` sender) — **[G]**
> **IF** launch approaches, **THEN** the dev sender swap is a **launch blocker**
> already flagged in §4 ("swap before real users hit day 7") — first real trial
> nudge from a resend.dev address lands in spam or looks like phishing. Check:
> `EMAIL_FROM` set to the verified domain in prod env.

### 16.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `getEntitlement` shape/states (Spine C) | F81 fork, F85 engine, TrialBanner/Sub-card/explainer copy, Live Inspector Sub Phase | One account through all five states; all surfaces agree; `subscription.test.js` | D1 |
| `subscription` column set (migration 017+) | `db.js#mapSubscription`, the cron SELECT (F86/DW-7 class), webhook writers, admin DB Row viewer | `cronLifecycleSelectColumns.test.js` (the F86 field-coverage test); `db.test.js` mapping cases | D2/D4 |
| Trial/grace timestamps or seeding (`seed-trial`, migration 021 trigger) | F80 phase math, F85 nudge days, T8 explainer, tester 6-month semantics | Fresh signup + tester flip walked through day-7/12/14/21/28 with a clock mock | D1 |
| Tier bypass semantics (§9) | F81's deliberate tester **non**-bypass vs F86's cron exemption — two halves of one promise; breaking either strands testers (paywall) or deletes them (cron) | Expired tester account: sees paywall, never dunned/deleted | D4 |
| Webhook event set / Stripe API version | F84 cases + idempotency table + revival restore path | Replay-twice test; Stripe CLI fixture run | D2 |
| `deleted_accounts` restore blob shape | F84's `restoreRevivedAccount` upsert vs `archiveAndDeleteAccount`'s archive write (F86) — writer and reader of one shape in two files | Archive → revive round-trip restores every field (config/expenses/goals/logs/weekConfirmations/ptoGoal) | D1 |
| Redirect/origin handling | `resolveAppOrigin` candidates; checkout/portal/revive all three routes | Checkout from a preview deployment returns to that deployment | D4 |

### 16.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| Entitlement state | trial / grace / active / expired / none | Banner countdown / banner "ended" copy (no grace mention) / nothing / enforcement fork / nothing (unseeded) |
| Tier at expiry | plain / admin / investor / tester | Enforcement / bypassed / bypassed / **enforced** (real paywall, by design §9) — cron-side protection fixed (DW-7) |
| Surface under `isExpiredReadOnly` | Home / Budget / Income / Log / Account | readOnly shadow / readOnly shadow / UpgradePanel replace / UpgradePanel replace / fully live |
| Checkout return | success (webhook landed) / success (webhook late) / cancel | Immediate flip / poll up to 10s then flip / cancel notice, no state change |
| Revival | tombstone match + charge / tombstone consumed / no tombstone | Restore + `revived_at` stamp / normal account behavior / normal checkout |
| Cron row | admin/investor / tester / carded / active / trial day 7/12 / grace / expired / expired+7d | none / **none (DW-7 fixed)** / reset-or-none / reset-or-none / nudge / 2-day warnings / 2-day warnings / archive+delete |

### 16.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Replacement panels, not covering modals* (`3a2e04f`) — a dismissible modal over
  Income/Log was escapable; UpgradePanel replacement is the enforcement, which is
  exactly why those panels carry no internal readOnly gate (§9/§13 Block 2 rows).
- *Redirects to the wrong deployment* (`1a12dd6`) — static APP_URL broke preview
  checkouts; `resolveAppOrigin` derives from the request.
- *Cancel-on-delete* (`8a2683c`) — account deletion cancels the Stripe sub so ghosts
  don't keep billing; live-verification items parked in §8's known gaps.
- *Archive-then-delete wiring* (`1f94022`) — the cron's delete is the only archiving
  delete (T5 F52's invariant is the other half).
- *Dead tester exemption in the cron (F86), fixed in this pass* — `DW-7`, this
  investigation's highest-severity defect: the SELECT omitted `is_tester`, so the
  engine's exemption gate read `undefined` and lapsed beta testers were dunned and
  due for auto-deletion on the real schedule ~6 months after flag flip. Fixed by
  adding `is_tester` to the SELECT plus `cronLifecycleSelectColumns.test.js`, a
  structural field-coverage test (not a one-off assertion) that fails on any future
  engine read the cron's SELECT doesn't cover.

**Standing findings from this pass:** none open. DW-7 (above) was this pass's one
defect and is now fixed.

**Cross-reference (2026-07-24, beta program work):** the day-71 outcome-application script
(`database/beta-offboarding-day71.sql`, docs/TODO.md §19) explicitly resets
`trial_ends_at`/`access_ends_at` for every tier rather than toggling `is_tester` alone —
confirmed while building it that this is required, not optional, precisely *because* F81
already establishes `is_tester` doesn't bypass the paywall. Cited here as the concrete
artifact proving F81's design intent held under a real, separate feature built later — not a
new finding, a confirmation.

---

## 17. T10 — UI-UX Drift Map

**Pass date:** 2026-07-19. Same anchor + method rules as §7; numbering continues (F88+).
**Git-history note:** two governing waves — the press-feedback system rollout
(`4ca9437`→`ed7705c`→`973c399`, 2026-06-28: press became the *default* via `Pressable`,
not per-component opt-in) and the fold-motion architecture (`8752cd4`→`453060a`→
`bb35349`→`bf49c06`, 2026-07-14/15, still extending through the wizard/login work of
07-17/19). Plus the PWA auto-update fix (`8c50ff0`) — the one UI commit with data-loss
stakes. Two D5s corrected in-pass: CLAUDE.md's Liquid Glass pointer (§13 → §1) and
active-systems §3's stale `autoUpdate` claim.

**Scope:** `ui.jsx` (808 lines, the primitive library), `LiquidGlass.jsx`,
`index.css` (`@theme` tokens + every keyframe), `hooks/useSwipeStack.js`,
`PwaInstallModal.jsx`, `UpdateAvailableBanner.jsx`, `vite.config.js` (PWA), and the
CLAUDE.md animation/color/input standards this tier enforces app-wide.

### 17.1 Block 1 — Critical inventory (function by function)

**F88 · `@theme` design tokens** — `index.css:3–50` — **[G]**
The single source of color/font truth. Two reserved-token rules: the Pulse signal set
(`--color-signal-blue/purple/glow`, `:46–48`) is for the Phase-2 AI overlay only —
never on Flow elements; and no raw hex for accent/green/red anywhere in components.
Known standing debt: `WeekConfirmModal`/`LoginScreen`/`ProfilePanel` carry untokenized
hex (CLAUDE.md Known Cleanup, TODO §10).
> **IF** a token's value or name changes, **THEN** grep both the var *and* its raw hex
> value — the three debt files bypass the token and will silently keep the old color,
> splitting the palette. **IF** a new component uses a signal token outside the Pulse
> overlay, **THEN** that's the reserved-token violation Spine E exists to catch.

**F89 · Press feedback system** — `usePressFeedback:70`, `pressScaleStyle:100`,
`PressFlashOverlay:169`, `Pressable:193` (`ui.jsx`) — **[G]**
Press is the *default* interaction system: `Pressable` wraps and derives its press fill
from the target's own background color family (`ed7705c` — lighter same-family, iOS
style), scale confined to 0.94–0.97. New interactive elements use `Pressable`, not
hand-rolled `:active` styles.
> **IF** press timing/scale/fill derivation changes, **THEN** it changes *everywhere at
> once* — that's the design; verify against CLAUDE.md's animation rules (press =
> `scale(0.97)` only, no bounce/spin). **IF** a new button hand-rolls feedback,
> **THEN** it forks the system — the rollout commits exist because per-component
> feedback drifted before.

**F90 · Fold motion architecture** — `useFoldTransition:251`, `FoldSwitch:282`,
`StepSlide:326` (`ui.jsx`); keyframes + `data-fold` state classes
(`index.css:345–384`); **`prefers-reduced-motion` kill switch `:380`** — **[G]**
One vocabulary for enter/exit: pages (`fold-lift`), dropdowns (`fold-scale`), modals
(`fold-modal` — close must read as *upward* fold travel, `bb35349`), backdrops. The
hook keeps components mounted through exit (`useFoldTransition`'s whole purpose);
`FoldSwitch`/`StepSlide` sequence sibling swaps (wizard steps, login modes).
> **IF** durations/easings/keyframes change, **THEN** every consumer moves together
> (that's the point), but check the two known traps: exit-before-unmount timing (a
> shortened exit that outlives its `setTimeout` unmount flashes; T8's `6e2ca11` test
> precedent is the same class) and the reduced-motion block must keep covering every
> new `data-fold` variant. All ≤500ms per CLAUDE.md rules.

**F91 · `MetricCard`/`Card` contract** — `ui.jsx:446–553` (alias `:553`) — **[G/L]**
The workhorse: `entranceIndex` staggered `fadeSlideUp` (80ms/card, capped 400ms),
`rawVal` 0→target countup (1200ms — the one sanctioned >500ms animation), `status`
(green/teal/red semantics), `visualTier` (glass/overlay tint without a wrapper),
`insight` → `InsightRow:668` — which **returns `undefined` and renders nothing when
backing data is insufficient**: signals are never fabricated (Spine E's data-honesty
rule, shared with §8 F16's Pulse builders).
> **IF** the card's prop contract changes, **THEN** every panel moves — this is the
> most-consumed component in the app; snapshot tests + one visual pass per panel.
> **IF** `InsightRow`'s undefined-on-insufficient-data behavior changes, **THEN**
> fabricated-signal drift opens across every tile that passes a computed `insight`.

**F92 · `LiquidGlass` purpose whitelist** — `LiquidGlass.jsx:27`
(`ALLOWED_PURPOSES`: `nav, pulse, modal, log-summary, phase-btn`), dev-mode warn
`:55–58` — **[G]**
Frosted glass is scarce by design — never on primary MetricCards, tables, or buttons.
Extending usage means extending the whitelist *deliberately* (the file's own comment
says so), and the warn only fires in DEV.
> **IF** a new purpose is added, **THEN** update active-systems §1's count in the same
> commit (it went stale at "3" once — corrected during the T4-era passes) and confirm
> the surface isn't one of the forbidden classes. Prod silently accepts any purpose —
> the whitelist is only as strong as DEV-time discipline.

**F93 · Swipe/snap primitives** — `ScrollSnapRow:764`, `PaginationDots:709` (`ui.jsx`),
`hooks/useSwipeStack.js` — **[G]**
CSS scroll-snap, no animation library. Consumers: Home goal cards (§16 sprint 3),
Income mobile month cards, goal reorder modal (sprint 5). **Sprint 2 (Income weekly
rows → snap cards) is NOT started** — active-systems §16's table is the truth; don't
assume the desktop table converted.
> **IF** snap/scroll behavior changes, **THEN** test on touch (450ms-hold drag
> interplay, §10 F40) — the drag-and-drop and snap-scroll systems share gesture space
> on the same cards; a change to one can eat the other's gestures.

**F94 · PWA update + install flow** — `vite.config.js:15–22` (`registerType: 'prompt'`
+ the comment naming why), `:57` (`skipWaiting`), `UpdateAvailableBanner.jsx`
(user-initiated reload only), `PwaInstallModal.jsx` (`beforeinstallprompt` capture,
hidden when standalone), app identity rename `1692c6a` — **[G]**
The `8c50ff0` case law: with skipWaiting/clientsClaim, `autoUpdate` force-reloaded
every open tab the instant a deploy landed — mid-check-in, mid-wizard — a UI-layer
change with D3-grade consequences. Updates now wait for the user.
> **IF** anyone "simplifies" back to `autoUpdate` or removes the banner, **THEN**
> that's the same incident re-shipped; the vite.config comment is the tripwire. **IF**
> caching strategy changes, **THEN** re-verify a deploy → update → reload cycle
> preserves in-flight state (the eager-save net catches what the debounce would lose,
> but only for completed actions).

**F95 · Input/label standards** — `iS`/`lS` style objects (`ui.jsx:42–44`) — **[G]**
`iS`: 16px font (blocks iOS auto-zoom), 44px min-height (tap target), JetBrains Mono.
`lS`: 10px/2px-tracking uppercase labels. Every input/select spreads these; the
numeric-input standard (string drafts, parse at commit, `attempted` error styling) is
§7 F-territory but renders through these objects.
> **IF** `iS` font-size drops below 16px or min-height below 44px, **THEN** iOS zooms
> on focus / tap targets fail the mobile checklist — the two hard numbers in these
> objects are compliance, not taste.

### 17.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| Any `@theme` token | The three untokenized-hex debt files (they won't follow), Pulse reservation, status-color semantics (green/teal/red meanings in CLAUDE.md) | Grep var name + raw hex; visual pass in the debt files | D5 |
| `Pressable`/press-system internals | Every interactive element app-wide (it's the default), CLAUDE.md animation rules | One press per panel; nothing bounces/spins/scales-up | D1 |
| Fold keyframes/durations (`index.css:345–384`) | All `useFoldTransition`/`FoldSwitch`/`StepSlide` consumers; exit-vs-unmount timings; reduced-motion coverage | Wizard step, login mode, modal close, dropdown — all four fold shapes; `prefers-reduced-motion` on | D1 |
| `MetricCard` props/animation values | Every panel's tiles; entrance/countup caps in CLAUDE.md | Snapshot tests + per-panel visual pass | D1 |
| `ALLOWED_PURPOSES` | active-systems §1's count (went stale once), forbidden-surface rule | Same-commit doc update; DEV console clean | D5 |
| PWA config (`vite.config.js`) | `8c50ff0`'s prompt-mode invariant, workbox caching of app shell + Supabase, install modal's standalone detection | Deploy → open old tab → banner (no forced reload); install flow from Safari | D4 |
| CLAUDE.md animation/color/input standards text | This section + Spine E — the standards ARE the spec; code and doc must move together | The §5 covenant | D5 |

### 17.3 Block 3 — Gate matrix

| Dimension | Cells | Expected behavior |
|---|---|---|
| Motion preference | default / `prefers-reduced-motion` | Full fold/press/countup vocabulary / all `data-fold` animations none'd (`index.css:380`); press scale is the one retained affordance |
| Display context | browser tab / iOS standalone PWA / Android standalone | Install modal shown / hidden / hidden; safe-area insets honored; dark status bar |
| Build mode | DEV / prod | LiquidGlass purpose warn fires / silent (whitelist unenforced) |
| SW update state | none / waiting | Nothing / UpdateAvailableBanner, reload only on tap |
| Card interactivity | static / `onClick` | 18px/16px padding variants, `minHeight: 88px` interactive; press feedback only on interactive |
| Insight data | sufficient / insufficient | InsightRow renders / renders nothing (`undefined`) — never a fabricated signal |

### 17.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *PWA auto-update mid-session reload* (`8c50ff0`) — the UI commit with data-loss
  stakes; `registerType: 'prompt'` + user-initiated reload is the invariant.
- *Press-feedback unification* (`4ca9437` series) — feedback was per-component and
  inconsistent; `Pressable` made it systemic. Hand-rolled feedback is regression.
- *Fold close reading as a fade* (`bb35349`) — modal close must show visible upward
  travel; "fold" is a direction, not just an opacity curve.
- *iOS hit-test portals* (`c0224ce`, `95c449c`, `e9f55cc`) — fixed overlays must
  portal to body on iOS Safari or buttons go dead; any new fixed overlay follows.
- *ALLOWED_PURPOSES doc lag* — the §1 count went stale at 3 while code grew to 5;
  caught and corrected during this investigation's earlier passes.

**Standing findings from this pass:** none filed — no new DW items. The untokenized-hex
debt is already owned (TODO §10 + Known Cleanup); the DEV-only whitelist enforcement is
noted in F92's IF/THEN rather than filed (it's a discipline boundary, not a defect).
Two D5s corrected in-pass (CLAUDE.md Liquid Glass pointer §13→§1; active-systems §3
`autoUpdate`→`prompt` with the `8c50ff0` rationale).

---

## 18. Spine A — Fiscal Math Drift Map

**Pass date:** 2026-07-20 (spine pass — written last so every blast radius below points at
a *finished* surface section, not a forward reference). Same anchor + method rules as §7;
numbering continues (F96+).
**Git-history note:** the newest structural intentions on this spine are the §1.H11
dilution kill (`2e0121a`, `10ba9af` — F13/F15 shared helpers, active-weeks scoping), the
Quick Rate Update point-in-time `baseRate` slice (`d9dfd93`→`955b0b3` — `resolveBaseRateForWeek`,
the §5 narrow read-path), and the June expense-save trilogy (`d8c475a`/`d42c118`/`6fb0619`
— the `expense.js` pure helpers). This section is the **authority record** for the numeric
truth every surface consumes; it states each contract *once* and reverse-indexes the surface
F-entries (F1–F95) that already cover the consumers rather than restating them.

**Scope:** `finance.js` (40 exports, 1,413 lines), `fiscalWeek.js`, `rollingTimeline.js`,
`expense.js`, `goalFunding.js`, `newJobSeasonRunway.js`, `stateTaxTable.js`. Absorbs
active-systems §1 (income engine), §2 (rolling timeline), §7 (attendance/bucket math),
§14 (home math).

**The trunk (memorize this):**
`buildYear(cfg, baseRateHistory)` → per-week objects → `computeNet(w, cfg, extraPerCheck,
showExtra)` → `calcEventImpact(event, cfg, weekMeta)` adjusts a week → `computeGoalTimeline(
goals, futureWeeks, weeklyNets, …)` projects the surplus. A change to any stage re-verifies
every consumer surface (T2–T6) **and** Spine D's context fields. The cardinal L rule (§3)
lives here: one fact, one function — if a surface needs a number a panel already shows, it
calls that panel's exported function, never a re-derivation.

### 18.1 Block 1 — Critical inventory (spine-internal machinery)

New F-entries below are for machinery **no surface pass covered** — `buildYear`'s internal
stages, the week-object shape, the DHL/bucket helpers, the `expense.js` conversion layer,
the point-in-time resolvers, loan internals, and the tax primitives. Consumers are
reverse-indexed to their existing F-entries.

**F96 · `buildYear(cfg, baseRateHistory)` — the trunk head** — `finance.js:481–669` — **[L]**
Emits one object per fiscal week (idx 0…51) by walking `FISCAL_YEAR_START` forward in 7-day
steps. Ordered internal stages, each a drift surface of its own: (1) **schedule resolution** —
DHL alternating long/short from `firstActiveIdx` parity (`:509–555`, F99 helpers) vs. base
flat `customWeeklyHours ?? maxWeeklyHours ?? standardWeeklyHours ?? 40` (`:556–566`);
(2) **OT split** — `regularHours`/`overtimeHours` against `otThreshold ?? totalHours`, with
weekend differential hours pushed past the threshold at OT rate (`:568–586`);
(3) **point-in-time baseRate** — `resolveBaseRateForWeek(baseRateHistory, weekEnd, cfg.baseRate)`
(`:582`, F98-adjacent) so a rate edit only recomputes weeks from its effective date forward
(the §5 narrow slice — every *other* historically-sensitive field still applies uniformly,
the live D2 zone); (4) **New Job Season boundary** — `inNewJobSeason` zeroes earned income on/after
`newJobSeasonDate`, closing at `returnToWorkDate` (`:588–602`); (5) **unemployment income**
(`:604–618`, non-taxed, added by `computeNet`); (6) **active/benefit/401k/taxable gates**
(`:620–632`); (7) **pay-week flag** — weekly=every active week, biweekly/salary=`idx % 2 ===
biweeklyParity`, monthly=last active week of the calendar month (`:635`, `:660–667`).
> **IF** any stage's inputs or ordering change, **THEN** the entire consumer set moves at
> once — this is the single most blast-heavy function in the app. Named checks: F5 (wizard's
> `buildYear` call derives `taxedWeeks` from `w.idx`), F6 preview pair (must track deduction
> ordering), F10 (`baseRateHistory` param), F25–F31 (Income: `isPayWeek`/`payPeriodEndDate`/
> `taxedBySchedule`), F28 (`taxableGross` feeds the withholding-gap engine), F58 (401k
> columns), plus the §2.3 authority table row for the changed field. Procedure:
> `finance.test.js` week-shape cases + one DHL + one biweekly manual pass through Week
> Inspector. **Standing invariant:** the jobless path reaches this call with *no real pay
> structure* (F5) — every stage must tolerate that config shape.

**F97 · The week-object field contract** — `finance.js:636–657` (the `weeks.push({…})`) — **[L]**
The shape a dozen surface F-entries read by name. Grouped: **identity** (`idx`, `weekEnd`,
`weekStart`, `payPeriodEndDate`); **schedule** (`isPayWeek`, `rotation`, `isHighWeek`,
`adminRotationTag`, `rotationLabel`, `requiredOtShifts`, `workedDayNames`, `totalHours`/
`regularHours`/`overtimeHours`/`weekendHours`); **pay** (`grossPay`, `taxableGross`,
`active`); **benefits/401k** (`has401k`, `k401kEmployee`, `k401kEmployer`, `benefitsDeduction`,
`benefitsActive`, `payrollDeductions:{benefits,k401Employee,total}`); **tax** (`taxedBySchedule`);
**job-loss** (`unemploymentIncome`). `grossPay`/`taxableGross` are **zeroed for inactive
weeks** at emit time — consumers must not re-derive gross for an inactive week.
> **IF** a field is added, renamed, or its zeroing rule changes, **THEN** grep every reader
> before shipping: Week Inspector displays the whole object verbatim (Spine F, §9); F28 reads
> `taxableGross`/`taxedBySchedule`; F29's three net tiers read `active`/`grossPay`; F33's `gN`
> reads the row; F58 sums `k401kEmployee`/`k401kEmployer`; F25/F27 read `isPayWeek`/
> `payPeriodEndDate`; `calcEventImpact`'s `weekMeta` path reads `isHighWeek`/`grossPay` (F57).
> A new field with no reader is dead weight; a renamed field with a missed reader is silent
> `undefined` math. Check: `finance.test.js` shape assertions; Week Inspector on one active +
> one inactive week.

**F98 · `computeNet(w, cfg, extraPerCheck, showExtra)` — the net tiers** — `finance.js:671–691` — **[L]**
The one net formula, in deduction order: inactive week → returns `unemploymentIncome` only
(`:677`); FICA on `grossPay`; `deriveWeeklyPayrollDeductions` total (benefits + employee 401k,
`:238–257`); `otherPostTaxDeductions` (post-tax rows, `:265–272`). **Untaxed week** returns
`gross − fica − ded − otherPostTax + unemployment` (`:682`); **taxed week** additionally
subtracts fed (`taxableGross × (isHighWeek ? fedHigh : fedLow) + (showExtra ? extraPerCheck :
0)`) and state, using generalized `fedRateLow/High`/`stateRateLow/High` with legacy
`w1/w2` fallbacks (`:684–690`). The `showExtra`-gated `extraPerCheck` is the **only** place
F28's withholding-gap spread enters a net.
> **IF** the deduction ordering, the taxed/untaxed fork, the rate-field fallback chain, or
> the `extraPerCheck` gating changes, **THEN** every net in the app moves together. Named
> checks: F6 preview pair (deliberately-separate approximations that must track this), F29's
> three tiers, F33's `gN`, F15's `resolvePrevWeekNet`, F57's `weekNetWithLogAdjustments`
> (`:1369–1378`, folds `calcEventImpact` onto a `computeNet` base). Procedure: Week Inspector
> Pay vs. Net Lookup sections agree; `finance.test.js` net cases. **Legacy-twin trap:** the
> `fedRateLow ?? w1FedRate` fallbacks couple to F34 (Sharpen Rates) and F47 (ScheduleCard's
> read-primary/write-both rule) — a renamed rate field breaks the fallback silently.

**F99 · DHL schedule/rotation helper cluster** — `finance.js`: `getDhlPlannedPattern:345`,
`resolveDhlWeeklyHours:338`, `getDhlPlannedDayIndexes:326`, `getStandardDhlOtDay:311`,
`getDhlRotationLabel:333`, `dhlWeekendHoursForDate:274`/`…PerDayName:281`/`…PerDayIndex:303`/
`…FromDays:292`/`…FromShiftCount:369` — **[L]**
The file-private engine behind DHL's alternating rotation, weekend-differential hour
accounting, and OT-shift trimming. `getDhlPlannedPattern` returns `{indexes, weekendHours,
rotationLabel, totalHours, requiredOtShifts}` consumed by both `buildYear` (F96 stage 1) and
`projectedGross`/`calcEventImpact` (F57) — so the *projection* and the *actual week* share one
rotation source.
> **IF** any DHL helper's day-index convention, weekend-hour boundary (Sat 00:00→Mon 06:00),
> or hour-resolution (`resolveDhlWeeklyHours`: custom hours override the preset) changes,
> **THEN** F96 (real weeks), F57 (`calcEventImpact` projection + `projectedGross`), and the
> §7 F5 DHL enforced-override contract all shift — a base-user account must be unaffected
> (every helper early-returns or is gated on `employerPreset === "DHL"`). Check:
> `finance.test.js` DHL long/short cases; Week Inspector on one long + one short week; a
> base account's numbers unchanged.

**F100 · `computeBucketModel(logs, cfg)`** — `finance.js:1185–1263` — **[L]**
DHL-exclusive attendance-bucket engine: tiered accrual, 18h/month perfect-attendance bonus,
cap (`bucketCap ?? 128`), overflow payout at `bucketPayoutRate ?? baseRate/2`, and the
`bucketBalanceOverride` + `bucketOverrideMonth` rolling-start mechanic. The comment at `:1182`
is load-bearing: **do not port `payoutRate`/tiers to base-user attendance** (F61's base
tracker is deliberately simpler — active-systems §7).
> **IF** tiers, cap, or payout change, **THEN** F61 (LogPanel bucket display + override
> Save/Reset), the bucket-hours hero card, and `calcEventImpact`'s `bucketHoursDeducted`
> (F57) move together. **IF** anyone gives the base tracker payout math, **THEN** that's a
> product decision (F61's IF/THEN), not a consistency fix. Check: `finance.test.js` bucket
> cases; Week Inspector / LogPanel bucket card agree.

**F101 · `expense.js` cycle-conversion layer** — `toMonthlyCost:110`, `fromMonthlyCost:119`,
`perPaycheckFromCycle:133`, `cycleAmountFromPerPaycheck:136`, `monthlyFromPerPaycheck:153`,
`breakdownMonthlyEquiv:149`, `normalizeCycle:15`, `roundToQuarter:108`, `CHECKS_PER_MONTH:13` — **[L]**
The unit-conversion spine for expenses: every card amount, breakdown row, and per-check
scaling routes through these. `CHECKS_PER_MONTH = {weekly:4, biweekly:2, monthly:1, salary:2}`
is the divisor; `roundToQuarter` is the display-rounding rule. The `8e669e3`/`bddeb04`
incident (breakdown over-counting monthly/yearly bills) lives here.
> **IF** a conversion factor or `CHECKS_PER_MONTH` changes, **THEN** F36/F37/F42 (Budget
> writers/display), `minFoodPerCheck` scaling (F39), breakdown rows, and Coach per-expense
> lines (Spine D) all move — a monthly-cycle bill must show the same cost on card, breakdown,
> and Ask Coach. Check: `expense.test.js` conversion cases; §10.2's monthly-bill parity row.

**F102 · Point-in-time expense resolvers** — `getEffectiveAmount(exp, weekEndDate, phaseIdx):730`,
`getPhaseIndex(weekEndDate):722`, `phaseIdxForMonth(monthKey):742`, `getEffectiveAmountForMonth`
(F38) — `finance.js` — **[L]**
The quarter/date → amount resolvers. `getPhaseIndex` maps a date to quarter 0–3 via
`QUARTER_BOUNDARIES`; `getEffectiveAmount` walks `history` for the latest `effectiveFrom ≤
weekEnd` (same algorithm as `resolveBaseRateForWeek` — one point-in-time pattern, not two);
`getEffectiveAmountForMonth` (F38) layers `monthlyOverrides` on top (override wins). The
**week-based** `getEffectiveAmount` is what `computeGoalTimeline` (`:1042` via
`getEffectiveAmountForMonth`) and `newJobSeasonRunway.weeklyBurn` (`:63`) call; the **month-based**
F38 is the Budget-panel resolver.
> **IF** the resolution order (override-first), the `history` walk, or the quarter boundaries
> change, **THEN** F38's four consumers (Budget cards, `computeRemainingSpend`, budget health,
> Coach) **and** `computeGoalTimeline`'s per-week spend **and** `computeNewJobSeasonRunway`'s burn
> all move — the §6 grounding case law (a `billingMeta` estimate once disagreed by double
> digits) is exactly this resolver being bypassed. Check: one expense with both override and
> history; all resolvers agree; `expense.test.js` + `finance.test.js`.

**F103 · Loan math internals** — `loanWeeklyAmount:1102`, `loanRunwayStartDate:1111`,
`computeLoanPayoffDate:1119`, `buildLoanHistory:1129`, `loanPaymentsRemaining:1140`,
`DAYS_PER_FREQ:1079`, `getQuarterEndIsoForDate:1088` — `finance.js` — **[L]**
The loan primitives F41 (Budget loans cluster) consumes. **`buildLoanHistory` regenerates the
entire `history` from `loanMeta` on every edit** — the app's standing **D2 exemplar**
(DW-W1): editing terms retroactively rewrites past weeks' spend. Quarter-safe payoff: the
`weekly:[0,0,0,0]` zero entry starts the day *after* the quarter-end containing the payoff
(`:1132–1136`), so a mid-quarter payoff keeps paying through quarter close.
> **IF** touching loan math, **THEN** you are inside the D2 zone (DW-W1) — do **not** add a
> consumer that treats regenerated `history` as point-in-time truth for past weeks; the
> planned fix is an expense-style `history[]` (TODO §3). Named checks: F41 (Budget CRUD +
> `computeLoanPayoffDate` cards), §7 F12 (NewJobSeasonEntry due-date attach reads
> `loanMeta.firstPaymentDate`), the load-side regeneration in F67 (`db.js:204–225`). Check:
> `finance.test.js` loan cases; a mid-quarter payoff manual check.

**F104 · Tax primitives** — `fedTax:389`, `stateTax:397`, `getStateConfig:414`,
`stateTaxTable.js` — **[L]**
The withholding-liability core F28 (Income tax engine) calls: `fedTax` (bracket schedule),
`stateTax(income, stateConfig)` (flat/bracketed per state), `getStateConfig(userState)` with
the `moFlatRate` legacy fallback for the DHL Missouri preset. These compute *annual liability*
(the gap numerator), distinct from `computeNet`'s *per-week withholding* (the F98 rate fields).
> **IF** a bracket, the state table, or `getStateConfig`'s fallback changes, **THEN** F28's
> `taxDerived` gap math moves — `extraPerCheck` shifts and every net follows (F98). Check:
> Live State Inspector `totalGap`/`extraPerCheck` vs. the Tax Weeks Grid; `finance.test.js`
> tax cases; a Missouri DHL account still resolves `moFlatRate`.

**Reverse index — surface F-entries already covering Spine-A consumers (do not restate):**
F1 (`dateToWeekIdx`/`firstActiveIdx`), F5 (wizard `buildYear` call + `taxedWeeks` derivation),
F6 (`estimateWeeklyGross`/`estimateWeeklyNet` preview pair), F10 (`resolveBaseRateForWeek`
chain), F13 (`resolveActiveWeeksThisYear`), F14 (`weeklyIncome`), F15 (`resolvePrevWeekNet`),
F18/F21 (`computeGoalTimeline` consumption + `remainingAtEnd`), F22/F44 (`computeNewJobSeasonRunway`/
`sumJobHuntIncome`), F23 (`netWorthHealthStatus`), F28 (`taxDerived`), F29 (net tiers),
F33 (`gN` + `deriveRollingIncomeWeeks`), F38 (`getEffectiveAmountForMonth`), F41 (loans),
F57 (`calcEventImpact` weekMeta contract), F58 (401k columns), F59 (PTO model), F67 (load-side
migrations that touch expense/loan history).

### 18.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `buildYear` week-object shape (F97) — add/rename/re-zero a field | Every reader: Week Inspector (Spine F), F28 (`taxableGross`), F29 (net tiers), F33 (`gN`), F58 (401k), F25/F27 (`isPayWeek`), F57 (`weekMeta`) | Grep the field name across `src/`; `finance.test.js` shape cases; Week Inspector on active + inactive week | D1 |
| `computeNet` deduction ordering / taxed-fork / rate fallbacks (F98) | F6 preview pair, F29 tiers, F33 `gN`, F15 `resolvePrevWeekNet`, F57 `weekNetWithLogAdjustments` | Week Inspector Pay vs Net Lookup agree; row net = inspector net; `finance.test.js` | D1 |
| `resolveBaseRateForWeek` filter / `baseRateHistory` shape (F96 stage 3) | F10 chain (`extractBaseRateHistory` in `db.js`), past-week rate resolution | A future-dated rate update shows the *old* rate on weeks before its effective date (Week Inspector); `db.test.js` baseRateHistory cases | D2 |
| DHL helper conventions (F99) — day-index, weekend boundary, hour resolution | F96 real weeks, F57 `calcEventImpact`/`projectedGross`, §7 F5 DHL overrides | `finance.test.js` DHL long/short; base account unaffected; Week Inspector both rotations | D1 |
| `getEffectiveAmount`/`getEffectiveAmountForMonth`/`getPhaseIndex` resolution (F102/F38) | F38's four consumers + `computeGoalTimeline` per-week spend + `computeNewJobSeasonRunway` burn + Coach grounding | One expense (override + history): all surfaces + goal ETA + runway agree | D1 |
| `expense.js` conversion factors / `CHECKS_PER_MONTH` (F101) | F36/F37/F42 Budget, F39 food floor, breakdown rows, Coach per-expense lines | `expense.test.js`; monthly-cycle bill same cost on card/breakdown/Coach | D1 |
| `computeGoalTimeline` epoch handling / return shape (`remainingAtEnd`) | F18 (Home cards + epoch arg), F21 (`yearEndGoalDraw` fallback), Coach goal lines, T4 timeline bar | Grep `computeGoalTimeline(` for epoch-arg parity; next-year-ETA goal subtracts only this-year slice | D1 |
| `calcEventImpact` branch/fallback (F57) | App `eventImpact` memo, F54 (Log summary — now weekMeta-grounded via `resolveEventWeekMeta`, DW-5 fixed), F62 (per-entry breakdown), goal-funding `weeklyNetAdjustments` (F29) | `finance.test.js` one event per type; hero cards = per-entry breakdown = Income delta | D1 |
| `buildLoanHistory` regeneration (F103) | F41 zone (DW-W1) — Budget cards, NewJobSeasonEntry due-date, F67 load regen | `finance.test.js` loan cases; mid-quarter payoff manual check; **do not** add past-week-truth consumer | D2 |
| Tax primitives (`fedTax`/`stateTax`/state table, F104) | F28 gap math → `extraPerCheck` → every net (F98) | Live Inspector `totalGap`/`extraPerCheck` vs Tax Weeks Grid; MO DHL resolves `moFlatRate` | D1 |
| `resolveActiveWeeksThisYear` (F13) / `FISCAL_WEEKS_PER_YEAR` | F14 `weeklyIncome`, F16 `annualSavings`, Coach savings line, DemoAccountTree — all four share it | Grep consumer count (only grows); mid-year `firstActiveIdx` account: Home tile = Ask Coach | D1 |
| `FISCAL_YEAR_START` (`constants/config.js`) | Loop bounds in F96, `dateToWeekIdx` (F1), `getPhaseIndex` boundaries, every stored `firstActiveIdx`/`taxedWeeks` | Never change mid-year; if forced: migrate all three fields + `fiscalWeek.test.js` + Tax Weeks Grid | D2 |

### 18.3 Block 3 — Master authority table (every displayed number → its one source → consumers)

The L-spine deliverable: for each user-visible fiscal number, the **single source-of-truth
function** and the surfaces that must quote it. A surface computing any of these locally
instead of calling the named function is a D1 finding by definition (§3 cardinal L rule).

| Displayed number | Source-of-truth function (`finance.js` unless noted) | Surface consumers (F-entry) |
|---|---|---|
| Per-week gross / hours / rotation | `buildYear` week object (F96/F97) | Income rows (F33), Week Inspector (Spine F) |
| Per-week net take-home | `computeNet` (F98) | Income `gN` (F33), F29 tiers, `resolvePrevWeekNet` (F15), Week Inspector |
| "This Week's Check" | `resolvePrevWeekNet` (F15) | Home tile (F16), DemoAccountTree |
| "Typical weekly income" | `weeklyIncome` = `projectedAnnualNet / activeWeeksThisYear − freedomAllowancePerWeek` (F14, App.jsx) | Home (F16), Coach (Spine D), Live Inspector, New Job Season panels |
| Projected annual net | `projectedAnnualNet` (App.jsx, sums `computeNet` over active weeks) (F29) | Home Year-End (F17), Income Year Summary (F33) |
| Active weeks this year | `resolveActiveWeeksThisYear` (`fiscalWeek.js`, F13) | `weeklyIncome` (F14), `annualSavings` (F16), Coach, DemoAccountTree |
| Adjusted take-home (event-folded) | `logTotals.adjustedTakeHome` from App `eventImpact` memo (F17/F33) — **one value** | Home Year-End (F17), Income Year Summary (F33), Log summary (F54, threaded down directly since the DW-5 fix) |
| Withholding gap / `extraPerCheck` | `taxDerived` (App.jsx, F28) over `fedTax`/`stateTax` (F104) | Income tax card, Tax Weeks Grid, `computeNet` `showExtra` term (F98) |
| Event net impact (missed/PTO/bonus) | `calcEventImpact` (F57) | App `eventImpact`, Log cards (F54), per-entry breakdown (F62), goal funding (F29) |
| Expense cost in month M | `getEffectiveAmountForMonth` (F38/F102) | Budget cards (F36), `computeRemainingSpend`, budget health, Coach |
| Expense unit conversions | `expense.js` layer (F101) | Budget cards/breakdown (F37/F42), food floor (F39), Coach |
| Goal ETA / funding week | `computeGoalTimeline` (F18) with `config.goalTimelineEpochIdx ?? null` | Home goal cards (F18), Year-End draw (F21), Coach goal lines, T4 bar |
| Completed-goal spend | `getFundedGoalSpend` (`goalFunding.js`) | `annualSavings` (F16), `adjustedTakeHome` (F17), Live Inspector |
| New Job Season runway / burn | `computeNewJobSeasonRunway` + `sumJobHuntIncome` (`newJobSeasonRunway.js`) | NewJobSeasonHome (F22), NewJobSeasonBudget (F44), Coach (`CoachNetWorthCard`, `AskCoachPanel` — F24, both converged since `3267286`) |
| Net-worth health status | `netWorthHealthStatus` + `NET_WORTH_HEALTH_THRESHOLD` (F23) | Home cue (F23), Coach amber tier (F24) |
| 401k employee / employer | `buildYear` `k401kEmployee`/`k401kEmployer` (F97), `dhlEmployerMatchRate` | LogPanel 401k block (F58), Week Inspector |
| Bucket balance / hours | `computeBucketModel` (F100) | LogPanel bucket (F61), hero card, `calcEventImpact` `bucketHoursDeducted` (F57) |
| Loan payoff date / weekly | `computeLoanPayoffDate`/`loanWeeklyAmount`/`buildLoanHistory` (F103) | Budget loan cards (F41), NewJobSeasonEntry due-date (§7 F12) |
| Pay-period label / next check | `fiscalWeek.js` (`formatPayPeriodLabel`, `getNextPayWeek`, `getPayPeriodBounds`) | App header chip, Income/Home countdowns |
| Rolling visible/archive weeks | `deriveRollingIncomeWeeks`/`deriveRollingTimelineMonths` (`rollingTimeline.js`) | Income rolling view (F33), Home month timeline |

### 18.4 Block 4 — Case law & quarantine

**Precedents (fixed — cite, don't relearn):**
- *§1.H11 dilution* (`2e0121a`, `10ba9af`) — four call sites each did their own
  active-weeks math or `/52`; killed by F13 + F15 shared helpers. F13/F14/F15's IF/THENs and
  the authority table's "active weeks" row exist to keep it dead.
- *Quick Rate Update effective date* (`955b0b3`) — a saved rate the engine ignored; fixed by
  the `resolveBaseRateForWeek` slice (F96 stage 3 / F10). The whole point-in-time chain exists
  so the date is load-bearing — simplifying it reopens the bug.
- *Expense-save Decisions 1–3* (`d8c475a`/`d42c118`/`6fb0619`) — the `expense.js` pure helpers
  (F101/F37) and override-first resolution (F102/F38); decision record archived in
  `BUG_FIX_TODO.md`, do not re-litigate.
- *Breakdown over-counting* (`8e669e3`/`bddeb04`) — monthly/yearly bills double-counted until
  rooted on 30-day cost (F101).

**Standing quarantines (open — cite, don't extend):**
1. **Flat-config D2 in `buildYear` (F96)** — one `cfg` applies to all 52 weeks, so a mid-year
   pay/schedule/tax edit distorts *past-week* totals and annual tax. Only `baseRate` has the
   point-in-time slice (F10); every other historically-sensitive field is still uniform.
   `account_history` (§5) captures the changes but only `extractBaseRateHistory` reads them —
   the drift is *live, fenced*. Convergence target: a general point-in-time config resolver
   (deferred Master Timeline, TODO §3). Do not add a consumer assuming past-week accuracy.
2. **`buildLoanHistory` regeneration D2 (F103)** — same root cause, loan side; tracked as
   **DW-W1**. Convergence target: expense-style `history[]` (TODO §3).

**Closed since this pass:** *`estimateRunwayDays` D1 (F24, `coachTriggers.js`)* — the second
runway formula that ignored persisted `newJobSeasonCashOnHand`/job-hunt income was deleted outright
(commit `3267286`, 2026-07-22), not patched. `CoachNetWorthCard.jsx` now calls this spine's
`computeNewJobSeasonRunway()` directly. Owned in Spine D (§8) — full write-up there.

**Standing findings from this pass:** none new. The two D2 zones above are pre-existing,
owned, and queue-visible (DW-W1 + the §5/Master-Timeline roadmap); no new DW defect surfaced
— every Spine-A export traces to a named consumer through the authority table, and the
surface passes (T1–T10) already verified those consumers call the exports rather than
re-deriving. No D5 corrections owed: `active-systems.md` §1/§2/§7/§14 describe these systems,
this section maps their couplings — the §5 covenant boundary holds.

---

## 19. Spine B — Persistence & Save Integrity Drift Map

**Pass date:** 2026-07-20 (spine pass). Same anchor + method rules as §7; numbering
continues (F105+).
**Git-history note:** the governing intentions are the 2026-07-18 eager-save audit trio
(`debc0cb`/`764da5b` + the general-primitive refactor that turned `saveConfigNow` into a
thin wrapper over `savePersistedStateNow`), the keepalive unload-flush hardening
(`168cc4b`), and the `account_history` write path (migration 020, `d9dfd93`). This is the
**authority record** for how a mutation reaches durable storage; T7 (§14) already mapped
the load/boot/RLS half (F63–F71) and the surfaces mapped their own eager-save call sites
(F8, F35, F46, F55, F60/DW-6) — this section owns the App.jsx save *primitive*, the
debounce/flush machinery, the localStorage hook, the config-history pure layer, the
migration-folder rules, and the four-site new-field procedure.

**Scope:** `App.jsx` save layer (`savePersistedStateNow`/`attemptSave`/debounce/
`latestPersistedStateRef`/`pendingSaveRef` + SaveFailedBanner retry), `db.js`
(`saveUserData`/`flushUserDataKeepalive`/`saveConfigSnapshot` — the write half of F67/F68),
`hooks/useLocalStorage.js`, `lib/configHistory.js`, `database/migrations/`. Absorbs
active-systems §5 (account history).

**The five write paths (memorize — every mutation uses exactly one):**
1. **Debounced autosave** — 800ms after any `config`/`expenses`/`goals`/`logs`/`showExtra`/
   `weekConfirmations`/`ptoGoal` change (`App.jsx:642–651`). For continuous edits (typing,
   sliders). Console-only failure handling.
2. **Eager save** — `savePersistedStateNow(overrides, historySource)` (F105). For discrete
   Save/Confirm/Add/Delete actions. Retries once at 3s; user-visible `SaveFailedBanner` on
   double-failure.
3. **Keepalive unload flush** — `flushUserDataKeepalive` on `visibilitychange`/`pagehide`/
   `beforeunload` (F106; F64/F68 own the db.js side). Synchronous credential read, direct
   PostgREST `fetch(keepalive:true)`.
4. **Force Sync (admin)** — `handleForcePush`/pull (Spine F). Bypasses the debounce.
5. **Service-role routes** — `api/*` for privileged columns (tier/subscription) the client
   whitelist-by-destructure (F68) deliberately excludes. Spine C owns these.
   Plus a **sixth, device-local** channel: `useLocalStorage` (F107) — browser-only UI/signal
   state that never reaches Supabase at all.

### 19.1 Block 1 — Critical inventory (spine-internal machinery)

**F105 · `savePersistedStateNow` + `attemptSave` + retry/banner path** — `App.jsx:740–777` — **[L]**
The general eager-save primitive every `saveXNow` wrapper (F8/F35/F46, the inline
`onSaveGoalsNow`/`onSaveExpensesNow`/`onSaveLogsNow` at `:1501/1543/1572`) funnels through.
Ordered effects: (1) `historySource` sets `configHistoryMetaRef` via `??=` (`:755` — keeps a
more-specific wizard/life-event tag a caller already set); (2) cancels the pending debounce
**and** any pending retry, clears `pendingSaveRef` (`:756–758`); (3) `attemptSave` merges
`overrides` onto `latestPersistedStateRef.current` into a **complete row**, updates the ref,
calls `saveUserData`, and sets `saveError` from the *real* Supabase message (`:740–748`);
(4) on failure schedules one retry at 3s (`:760`). `retryFailedSave` (banner "Retry") and
`dismissSaveError` (hides banner, does **not** drop data — the next debounce re-persists)
complete the surface.
> **IF** the merge-onto-latest-ref shape, the retry cadence, or the error-surfacing changes,
> **THEN** the eager-save promise (a completed action survives a backgrounded/reclaimed tab)
> weakens for *every* call site at once — the D3 class the whole 2026-07-18 audit closed.
> Named checks: F8 (wizard completion), F31 (check-in `onConfirm`), F35 (Budget wrapper),
> F46 (ProfilePanel cards), the F12 NewJobSeasonEntry activation. **Invariant:** overrides is a
> *partial patch* merged onto the full ref — never pass a functional updater, and never call
> the bare `setState` alone for a discrete action (the CLAUDE.md eager-save rule). Check:
> kill the tab within 800ms of a discrete Save; reload; the change survived. **Security note:**
> `attemptSave` routes through `saveUserData`, whose destructure is the client-writable
> whitelist (F68) — `savePersistedStateNow` cannot smuggle a tier/subscription column even if
> an overrides object contains one; it's silently dropped, not written.

**F106 · Debounce + `latestPersistedStateRef` + flush trio** — `App.jsx:635–651`, `:691–720` — **[L]**
`latestPersistedStateRef.current` is rebuilt **synchronously during render** (`:639`, not in
an effect) from the seven persisted fields, so the unload flush always reads current state
even if the tab backgrounds before effects commit. `pendingSaveRef` marks "a debounced write
is owed"; the 800ms timer clears it and calls `saveUserData`. The flush trio
(`visibilitychange:hidden`/`pagehide`/`beforeunload`) fires `flushUserDataKeepalive` **only
when `pendingSaveRef` is set** — a clean state doesn't flush.
> **IF** the ref stops updating synchronously (moved into a `useEffect`), **THEN** the
> keepalive flush reads stale state and silently drops the last edit — the exact `168cc4b`
> class, and it couples to F64 (the credential snapshot must *also* be synchronous). **IF**
> the seven-field list in the ref (`:639`) diverges from the debounce dep array (`:651`) or
> `saveUserData`'s destructure, **THEN** a field either never autosaves or never flushes.
> Check: this is site 3 of the F110 four-site checklist; `db.test.js` + a kill-tab test per
> field.

**F107 · `useLocalStorage(key, initialValue)`** — `hooks/useLocalStorage.js:3–20` — **[L/G]**
**Stale as of this pass (2026-07-25) — now orphaned, not "not dead legacy."** This entry
previously named `CoachNetWorthCard.jsx:40`'s `coachNetWorthSignal` key as the hook's one
live consumer, with the New Job Season/Home Coach message throttle being device-local as a
result. That was fixed by **DW-9** (`docs/BUG_FIX_TODO.md`): the signal state moved to
`config.coachSignalState`, eager-saved through the normal `setConfig`/`saveConfigNow`
channel — durable per-account like every other config field, no longer device-scoped.
`grep -rln "useLocalStorage(" src/components/ src/hooks/` now returns **only the hook's
own file** — zero consumers anywhere in `src/`. The hook is dead code (same shape as
**DW-4**'s `BenefitsPanel.jsx` finding) as of this reading, not yet filed as its own DW
item — flagged here rather than deleted outright, since removing a hook is a smaller
decision than removing a whole panel but still deserves its own pass rather than a
drive-by deletion during a documentation sweep.
> **IF** a future change reintroduces a `useLocalStorage(` consumer, **THEN** re-verify
> it's genuinely device-local/ephemeral state (dismissals, UI throttles) — never account
> truth — before relying on it; the original warning still holds for *any future* use,
> it's just that none exists today. **IF** no consumer appears before the next cleanup
> pass, **THEN** delete `useLocalStorage.js` + `useLocalStorage.test.js` and drop this
> entry, mirroring DW-4's procedure exactly (confirm via the same import-graph grep before
> deleting).

**F108 · `configHistory.js` — whitelist + `diffSensitiveFields`** — `configHistory.js:14–63` — **[L]**
The pure half of the config-history watcher (F9 owns the App.jsx effect). `HISTORY_SENSITIVE_FIELDS`
(70 fields across pay/schedule/employer/tax/benefits/attendance/freedom-allowance/job-loss) is the
whitelist; `diffSensitiveFields` returns changed whitelisted fields with two deliberate
semantics: `undefined`/`null` compare **equal** (`a ?? null` — so `DEFAULT_CONFIG` spreading a
new field onto an old row never fabricates a snapshot) and arrays/objects compare
**structurally** (`JSON.stringify`). Everything *not* listed (UI prefs, `goalTimelineEpochIdx`,
investor display fields, wizard gate flags) is noise and must never trigger a row.
> **IF** a sensitive pay/tax/schedule field is added to the wizard or a ProfilePanel card
> (§7 F7, F47, F50 three-way rule), **THEN** it must join this list **and** `DIFF_FIELDS`
> (SetupWizard) — the two lists watch the same concept from two angles and drift silently if
> one grows alone. **IF** the null-coalescing or structural-compare rule changes, **THEN**
> either every load fabricates spurious history rows (undefined→null noise) or a real
> array/object edit (`taxedWeeks`, `otherDeductions`) stops being captured. This feeds the
> §5 read slice: only `baseRate` rows are read today (F10/`extractBaseRateHistory`), but the
> capture is broad by design (Master Timeline, TODO §3). Check: `configHistory.test.js`; DB
> Row Viewer's config-history line after a sensitive edit.

**F120 · Encryption trigger — no field-level encryption exists today** — `configHistory.js`
(`HISTORY_SENSITIVE_FIELDS`), `database/migrations/`, `lib/supabase.js`, `db.js` — **[G]**
Every persisted `user_data` field (§3.3 authority table) currently relies entirely on TLS in
transit (Supabase's HTTPS endpoint) + RLS for access control (migration 019) — there is no
field-level encryption anywhere in the stack: no `pgcrypto`, no application-layer AES/cipher, no
encrypted column of any kind. This is a **documented-intended current gap, not a defect** — every
field the app collects today (income, schedule, budget, goals, deductions) sits below the
sensitivity threshold where RLS-only protection is inadequate. Full writeup and TODO tracking:
`docs/TODO.md` §11.
> **IF** a new persisted field is proposed that falls into a genuinely high-sensitivity class —
> SSN, date of birth, bank account/routing number, government ID, or anything else a reasonable
> user would expect encrypted-at-rest beyond Supabase's platform default — **THEN** it must NOT
> simply join `HISTORY_SENSITIVE_FIELDS` (F108) or ride the plain F110 four-site procedure like an
> ordinary field. An explicit encryption decision is required *before* the migration lands:
> application-layer encrypt-before-write / decrypt-after-read (the `db.js` write path /
> `loadUserData`, F67) or a `pgcrypto`-backed column via a dedicated migration — never a bare
> `TEXT`/`JSONB` column relying on RLS alone. Name the sensitivity class in the migration's own
> comment, and update CLAUDE.md's Persistence section with a pointer back to this entry (kept
> current the same way the migration-number note is, per F109 below). Check: before any field in
> that class is added, confirm an explicit encryption decision was documented — "column exists,
> RLS covers it" is not sufficient for this class of data.

**F109 · Migration-folder rules** — `database/migrations/` — **[G]**
Ordered, numbered SQL. **BOOKMARK files are never migrations** — `022_BOOKMARK_schema_snapshot_2026-07-10.sql`
is a full-schema recap (schema state through 021) that exists so a session reads one file
instead of the whole folder; the `BOOKMARK` tag + all-caps make it unmistakable, and assigning
one the next real number expecting it to run is the trap CLAUDE.md warns about. Real migrations
continue past it: **023** (`coach_chats`, wired 2026-07-25 — Spine D F123), **024** (`user_data` write-
permission fix — the F69 case law). **The next real migration is 025** — verify against the
folder before numbering; this note has gone stale once already (this doc's own §14 caught it).
> **IF** a migration is added, **THEN** it (a) takes the next real number skipping BOOKMARKs
> (025 now), (b) if it touches `user_data` columns, runs the F69 new-column checklist (RLS
> grant + service-role route + F67 read mapping + F68 write exclusion + drift-badge column),
> and (c) if it changes schema shape, a fresh BOOKMARK should be appended and the CLAUDE.md
> "latest bookmark / next migration" note updated **in the same PR** (D5 otherwise). Check:
> `ls database/migrations/` — the highest non-BOOKMARK number + 1 is the next; migration 024
> is the reminder that "SQL ran" ≠ "writes work".

**F110 · The four-site new-persisted-field procedure** — cross-file — **[L]**
Codifying F68's sketch as a named check. A new field that must persist to `user_data` has to
appear at **all four** sites or it silently half-works (DW-6's `ptoGoal` gap, now fixed, was
the specimen — it reached React state but had no eager-save wrapper, so discrete saves rode
the debounce):
1. **`saveUserData` destructure** (`db.js:396`) — the debounced/eager writer.
2. **`flushUserDataKeepalive` destructure** (`db.js:443`) — the unload writer (identical field
   set to #1 by contract).
3. **`latestPersistedStateRef.current`** (`App.jsx:639`) + the debounce dep array (`:651`) —
   so eager merges and the flush see it.
4. **DB Row Viewer drift-badge column list** (Spine F) — so the admin tool can detect its
   in-memory≠DB drift.
Plus, if the field is a *discrete* mutation (Save/Confirm/Add/Delete), a `saveXNow` eager
wrapper and its `readOnly` no-op shadow (F20/F35 gate). And `loadUserData` (F67) must map it
back on read, with a `DEFAULT_CONFIG` default so old rows get it.
> **IF** a field lands at some-but-not-all four sites, **THEN** the failure is silent and
> path-specific: miss #1/#2 and it never durably saves; miss #3 and eager saves drop it; miss
> #4 and the drift badge lies. The DW-7 fix's remedy (a test asserting the engine's reads
> appear in the query) is the template — a `db.test.js` case asserting the two destructures
> and the ref share one field set would make this class structural. Check: kill-tab test on
> the new field's discrete action; DB Row drift badge clean after save.

**F121 · Beta program fields — a DIFFERENT category than F110, not a variant of it** —
`user_data.beta_code_used`/`beta_started_at`/`halfway_email_sent_at` (migrations
025/027/029), `beta_activity_events`, `beta_codes` — **[L]**
F110's four-site procedure governs fields the **client writes** via the debounce/eager-save
machinery. None of these fields are client-written at all: `beta_code_used` is set only by
manual SQL or `api/seed-beta.js` (service role); `beta_started_at`/`halfway_email_sent_at`
are trigger/cron-stamped; `beta_activity_events` rows are inserted directly by the client
(`db.js` `logBetaEvent`/`logBetaFeedback`) but never touch `saveUserData`/
`flushUserDataKeepalive` at all — a wholly separate write path from the F105/F106 primitive.
Running F110's checklist against these fields would be checking the wrong procedure entirely.
> **IF** a new beta-program field is added, **THEN** the correct checklist is: (a) is it
> client-writable? If yes, it needs a RLS policy AND a column grant, and probably belongs in
> F110 after all. If no (privileged/derived), it must be **excluded** from
> `saveUserData`/`flushUserDataKeepalive`'s destructure (same as `is_tester`/`is_admin`) and
> present in `loadUserData`'s read mapping (F67) with a safe default. (b) if it's written by a
> trigger, does the trigger run `SECURITY DEFINER`? 021's original trigger shipped without it
> and needed migration 024 to fix — 027's and 031's triggers got it right from the start by
> citing that exact precedent in their own migration comments. (c) if it's an
> `beta_activity_events` write gated by a client-side predicate
> (`isTrackedBetaTester`), **THEN** per §4's cardinal rule ("every gate exists twice or not
> at all") the real boundary must also exist server-side — migration 031's
> `check_beta_activity_event_eligibility` trigger is that boundary; a future write path to
> this table that bypasses the trigger (e.g. a new service-role route inserting on a user's
> behalf without re-checking) would silently reopen the gap the trigger closed. Check:
> attempt an insert as a non-tracked authenticated user (own `user_id`, no tester flags) —
> must fail with the trigger's raised exception, not silently succeed.

**Reverse index — surface F-entries already covering Spine-B consumers (do not restate):**
F8 (wizard `savePersistedStateNow`), F9/F10 (config-history watcher effect + baseRate read
chain), F35 (`applyExpenseUpdate` wrapper), F46 (ProfilePanel card pattern), F31 (check-in
single eager save), F55/F60 (Log CRUD + `ptoGoal`/DW-6), F63 (`sharedStorage` shim),
F64 (`cachedAuthSnapshot`), F66 (`applyLoadedData` pending-save guard), F67 (`loadUserData`
migration gauntlet — the read half), F68 (`saveUserData`/keepalive whitelist — the write half),
F20 (readOnly noop shadow).

### 19.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| A new persisted `user_data` field | The F110 four sites + eager wrapper + readOnly shadow + F67 read map | Four-site grep; kill-tab test; DB Row drift badge clean | D3 |
| `savePersistedStateNow`/`attemptSave` merge or retry shape (F105) | Every `saveXNow` wrapper + inline eager caller (F8/F31/F35/F46) | Kill-tab within 800ms of a discrete Save; SaveFailedBanner on a forced failure | D3 |
| `latestPersistedStateRef` sync-render update or the flush trio (F106) | Keepalive path (F64/F68), pending-save guard (F66) | Background the tab mid-edit; edit survives reload; ref list = debounce deps = destructure | D3 |
| `HISTORY_SENSITIVE_FIELDS` / `diffSensitiveFields` semantics (F108) | F9 watcher, `DIFF_FIELDS` (§7 F7), §5 read slice (F10) | Sensitive edit → DB Row config-history line; undefined→null edit records nothing; `configHistory.test.js` | D5/D2 |
| `saveConfigSnapshot` row shape (`snapshot`/`changed_fields`/`effective_from`) | `extractBaseRateHistory` filter (F10, `db.js:19`), Master-Timeline future readers | A `baseRate` edit produces a readable row; future-dated rate shows old rate pre-effective (Week Inspector) | D2 |
| `useLocalStorage` scope (F107) | Currently no consumer (DW-9 moved the Coach signal throttle to `config.coachSignalState`) — hook is dead code as of this pass, candidate for a DW-4-style deletion | Grep keys stay ephemeral if a consumer returns; no account truth added; `useLocalStorage.test.js` | D3 |
| A new beta-program field/write path (F121) | Client-writable → F110 instead; privileged/derived → excluded from F68 destructure + present in F67 read map; trigger-written → `SECURITY DEFINER`; gated table insert → server-side trigger enforcement, not just client JS | Confirm which category before applying any checklist; non-eligible insert attempt must fail server-side | D3/D4 |
| `user_data` column set (any migration, F109) | F110 sites, BOOKMARK freshness, CLAUDE.md migration-number note, RLS grants (F69) | Next number skips BOOKMARKs (025); append BOOKMARK + update note same PR; F69 checklist | D2/D5 |
| A new field carrying regulated/high-sensitivity data — SSN, DOB, bank/routing, gov ID (F120) | Must NOT reuse the plain F110 four-site procedure alone; needs an explicit encryption decision first | Confirm app-layer or `pgcrypto` encryption chosen and documented before the migration lands; CLAUDE.md Persistence section updated; `docs/TODO.md` §11 | D2/D5 |
| Debounce interval / dep array (F106) | Continuous-edit persistence; must NOT gain a discrete-action dependency that should be eager instead | 800ms after typing writes once; a Save button does not rely on it | D3 |

### 19.3 Block 3 — Authority table (persisted field → write paths → readers)

The seven client-writable `user_data` payload fields, each with the paths that write it and
the load-side reader. A field missing from any write column silently loses that path.

| Field | Debounce (F106) | Eager (F105) | Keepalive (F68) | Drift badge (Spine F) | Load reader (F67) |
|---|---|---|---|---|---|
| `config` | ✅ | `saveConfigNow`/`savePersistedStateNow` | ✅ | `config` | `loadUserData` + DEFAULT_CONFIG merge |
| `expenses` | ✅ | `onSaveExpensesNow` (F35) | ✅ | `expenses` | migration gauntlet (`weekly`→`history`, loans) |
| `goals` | ✅ | `onSaveGoalsNow` (F18/F19) | ✅ | `goals` | direct |
| `logs` | ✅ | `onSaveLogsNow` (F55) | ✅ | `logs` | direct |
| `showExtra` | ✅ | via `savePersistedStateNow` overrides | ✅ | `show_extra` | direct |
| `weekConfirmations` | ✅ | check-in `onConfirm` (F31), Reopen (F32/DW-3 fixed) | ✅ | `week_confirmations` | auto-confirm seed (F26) |
| `ptoGoal` | ✅ | `onSavePtoGoalNow` (F60/DW-6 fixed) | ✅ | `pto_goal` | direct |

**Privileged columns (never in the client payload — service-role only):** tier flags
(`is_admin`/`is_tester`/`is_investor`/`is_employer_dhl` — the last *derived* at write time from
`employerPreset`, not stored client-authored), subscription columns (`subscription_status`/
`trial_ends_at`/`access_ends_at`/`current_period_end`/`card_on_file`/`plan`),
`tax_projections_enabled`. Writable only through Spine C's `api/*` routes; the F68
destructure is the enforcing whitelist (migration 019 RLS is the server half).

**Separate table (not `user_data`):** `account_history` (migration 020, write-only via
`saveConfigSnapshot`, read-only via `extractBaseRateHistory` — the §5 narrow slice);
`coach_chats` (migration 023, wired — Spine D F123); `stripe_webhook_events` (migration 018,
idempotency — Spine C/T9); `deleted_accounts` (cron tombstones — T9).

### 19.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Production data loss on backgrounded tabs* (pre-2026-07-18 audit) — setup wizard, check-ins,
  tax toggles, goals/expenses/logs all rode the debounce and vanished when mobile Safari
  reclaimed the tab. Closed by the eager-save pattern (F105) + the CLAUDE.md rule. F31's
  in-code comment is the memorial.
- *Dropped unload writes* (`168cc4b`) — a plain `fetch` aborted at unload; `flushUserDataKeepalive`
  + the synchronous ref/credential reads (F106/F64) are the fix; sync-dispatch is the invariant.
- *Eager-save general-primitive refactor* (2026-07-18) — `saveConfigNow` became a thin wrapper
  over `savePersistedStateNow` so config, goals, expenses, logs, weekConfirmations all share
  one retry/banner path.
- *Migration 024* (`8f34def`/`a93dcad`) — the UPDATE grant missing `user_id` broke every upsert
  conflict path while reads worked; "migration ran" ≠ "writes work" (F109/F69).

**Standing findings from this pass:** none new filed. **DW-6** (`ptoGoal` lacked an eager-save
wrapper — surfaced in the T6 pass, authority table above marked the gap) is fixed: it was the
live proof of the F110 four-site procedure's necessity and is now the reference example of the
procedure closing a gap end-to-end (App wrapper + prop + both call sites + CLAUDE.md table +
regression test). No D5 corrections owed — `active-systems.md` §5 already carries the
F10 read-path annotation applied during the T7 pass, and the migration-number note in CLAUDE.md
now self-warns (T7 pass). `useLocalStorage`'s device-local scope (F107) was documented-intended
(the localStorage→Supabase vestige) when this note was first written — **stale as of
2026-07-25**: DW-9 moved its one real consumer (the Coach signal throttle) to
`config.coachSignalState`, so the hook is now genuinely orphaned rather than just
scoped-on-purpose. Still not filed as its own DW row (deletion is a smaller, lower-risk
call than a defect fix), but see F107's own entry for the DW-4-style cleanup this now
sets up.

**No field-level encryption exists today (F120)** — every persisted field currently relies on
TLS + RLS only, no `pgcrypto`/application-layer encryption anywhere. Documented-intended for the
app's current data surface (no SSN/DOB/bank/gov-ID fields collected) — filed as a standing note,
not a DW row, same treatment as F107 above. It would **promote to a defect** the moment a field in
that sensitivity class is added without an explicit encryption decision (see F120's IF/THEN and
`docs/TODO.md` §11).

---

## 20. Spine C — Entitlement & Gating Drift Map

**Pass date:** 2026-07-20 (spine pass). Same anchor + method rules as §7; numbering
continues (F111+).
**Git-history note:** the governing intentions are the tester-gate chain
(`ec72a07` — `is_tester` flag → `09c7609` → `a430fbf` liability hold → `a643153` — Tax Plan
extended + `isAdmin` made a structural superset of `isTester`) and the paywall week
(§17 build, `765eebc`→`8a2683c`), which the T9 pass (§16) already mapped in depth. This is
the **authority record** for *who is allowed to see/do what*: one entitlement resolver
(`getEntitlement`, F80), one gate module (`entitlements.js`), three independent tier flags.
T9 (§16) owns the paywall *enforcement* surface (F80–F87); T5/T4 own the tax-plan gate
*consumers* (F43/F50); this section owns the gate module itself and the **one-page gate
registry** — every gate function mapped to its client and server call sites.

**Scope:** `entitlements.js` (`hasTesterAccess`/`canAccessTaxPlan`/`canAccessAiFeatures`),
`subscription.js` (`getEntitlement` — the F80 state machine), the three tier flags
(`is_admin`/`is_tester`/`is_investor` + the manual `tax_projections_enabled` and future
`is_owner`), and the enforcement fork (`paywallBypassed`/`isExpiredReadOnly`, F81). Absorbs
active-systems §9 (beta testers), §2 (flag semantics), §8 (engine).

**The two cardinal G-rules this spine enforces (§3):**
1. **Every gate exists twice or not at all.** Client-side gating is UX; the *real* gate is
   server/RLS-side. `api/coach.js` re-checks `canAccessAiFeatures`; migration 019 locks tier
   columns to service-role. A gated surface checked only client-side is a drift finding.
2. **`isAdmin` is a strict superset of `isTester` — by construction, not by convention.**
   **Two bases now, not one (locked decision, 2026-07-25):** account-tier gates
   (`canAccessTaxPlan`) still build on `hasTesterAccess` (`isAdmin || isTester`, no investor);
   paid-wall gates (`canAccessAiFeatures`, `canAccessAskCoachGeneral`) build on the wider
   `hasPrivilegedAccess` (`isAdmin || isTester || isInvestor`). Either way `isAdmin` stays a
   superset of `isTester` structurally. **`is_tester` and `is_investor` still never overlap for
   account-tier surfaces** (Demo Tree, investor code path, beta-cohort tracking) — the paid-wall
   class is the one deliberate, documented exception, not a general merging of the two tiers.

### 20.1 Block 1 — Critical inventory (spine-internal machinery)

**F111 · `entitlements.js` gate module** — `entitlements.js:11–` — **[G]**
Four pure functions, two bases (revised 2026-07-25 — was three functions/one base):
- **`hasTesterAccess({isAdmin, isTester})`** — `Boolean(isAdmin || isTester)`. The narrower
  base; still backs only `canAccessTaxPlan` today.
- **`hasPrivilegedAccess({isAdmin, isTester, isInvestor})`** — `Boolean(isAdmin || isTester ||
  isInvestor)`. New 2026-07-25. The "bypasses every paid wall" base — backs
  `canAccessAiFeatures` and `canAccessAskCoachGeneral`. Investor/demo accounts need the full
  feature set for pitch/demo purposes, same reasoning as admin; this was a locked product
  decision, not a refactor of convenience.
- **`canAccessTaxPlan({isAdmin, taxProjectionsEnabled, isTester})`** —
  `hasTesterAccess(…) || Boolean(taxProjectionsEnabled)`. **Deliberately untouched by the
  2026-07-25 widening** — still no `isInvestor` param at all. **`config.taxExemptOptIn` is
  deliberately NOT a grant path** (`a430fbf` liability hold — the wizard's "Unlock
  projections" must never reveal tax-plan UI to a normal user until an accountant reviews the
  withholding math). Re-enabling the wizard path is a one-line change *here* — the rule that
  the check lives in exactly one place is the whole point.
- **`canAccessAiFeatures({isAdmin, isTester, isInvestor})`** — `hasPrivilegedAccess(…)`.
  **Supersedes the old "CRUCIAL — isInvestor deliberately NOT in the OR" rule** this entry used
  to document (`is_tester` used to grant AI only, never demo-account access; that account-tier
  separation is untouched, but `is_investor` now *does* grant AI, on purpose).
- **`canAccessAskCoachGeneral({isAdmin, isTester, isInvestor, entitlement})`** —
  `hasPrivilegedAccess(…) || Boolean(entitlement?.isEntitled)`. Same 2026-07-25 widening.
> **IF** a new gated feature is added, **THEN** decide explicitly which base it needs —
> account-tier (`hasTesterAccess`, no investor) or paid-wall (`hasPrivilegedAccess`, admin/
> tester/investor) — and never re-derive either OR inline (that's how the superset drifts).
> **Paid-wall is the default assumption going forward** unless the feature is genuinely
> account-tier-specific like Tax Plan. **IF** the `taxExemptOptIn` non-grant is touched, **THEN**
> it is a product/liability decision, not a refactor — surface it. Check: `entitlements.test.js`
> (asserts investor DOES now grant AI features, investor does NOT grant Tax Plan, opt-in≠
> tax-plan, and the truthiness edge cases); an investor account sees AI features but not Tax
> Plan, Demo Tree access is unaffected either way.

**F112 · Server-gate column-supply invariant (the DW-7 generalization)** — `api/coach.js:63`,
`api/_lifecycleEngine.js:44` vs `api/cron-subscription-lifecycle.js:133–139` — **[G]**
A server-side gate is only as strong as the query that feeds its inputs. Two server gates read
tier flags off a fetched row: `api/coach.js` gates AI on `userRow.is_admin`/`is_tester`
(its SELECT supplies both — correct); the lifecycle engine exempts `row.is_admin ||
row.is_investor || row.is_tester` (`:44`) and the **cron's SELECT once omitted `is_tester`**
(`:135–137`), so the tester exemption read `undefined` and never fired — **DW-7**, this
investigation's highest-severity defect (silent auto-deletion of testers ~6 months after
flag flip), fixed in this pass.
> **IF** any server gate reads a row field, **THEN** the SELECT that produced the row MUST
> include that column — a gate whose input column is missing evaluates against `undefined`
> and silently fails *open or closed* with no error. The fix template DW-7 applied: add
> `is_tester` to the cron SELECT **and** a shell-level test (`cronLifecycleSelectColumns.test.js`)
> asserting every column the engine destructures appears in the query string, making the class
> structural rather than whack-a-mole. Check: grep each `api/*` gate's field reads against its
> own `.select(...)` string; unit tests that hand-build rows (as `lifecycleEngine.test.js` does)
> will NOT catch this — the seam is the query, not the pure function — which is exactly why
> the fix is a runtime test against the actual `.select()` call, not another hand-built-row test.

**F122 · `isTrackedBetaTester` — a tracking-eligibility predicate, not a feature gate** —
`entitlements.js` — **[G]**
Deliberately does NOT build on `hasTesterAccess` (F111's rule — "every feature gate is built
on `hasTesterAccess`" — applies to *feature-access* gates; this isn't one). It decides
whether an account's activity gets logged to `beta_activity_events`
(`isTester && betaCodeUsed`), not whether a feature is visible. `isAdmin` does NOT grant this
on its own — the function doesn't even accept an `isAdmin` param — because admin accounts
aren't part of the scored beta cohort, unlike every other gate in this file where `isAdmin`
is structurally a superset. Client-side callers: `App.jsx` (login event), `HomePanel.jsx`
(goal events), `BudgetPanel.jsx` (expense events), `ProfilePanel.jsx`'s `BetaFeedbackDetail`
(feedback events). Server-side enforcement: migration `031`'s
`check_beta_activity_event_eligibility` trigger re-derives the same
`is_tester AND beta_code_used IS NOT NULL` condition directly against `user_data`, closing
the gap where — until that migration — this predicate was checked only in client JS
(§4's cardinal rule 1 violation, found and fixed in the same drift pass that added this
entry).
> **IF** a new client call site logs to `beta_activity_events`, **THEN** it must gate through
> `isTrackedBetaTester` (never re-derive `isTester && betaCodeUsed` inline — same
> inline-re-derivation drift F111 already warns about for `hasTesterAccess`) — but note the
> client-side gate is now UX-only, not the real boundary; migration 031's trigger is. **IF**
> the trigger's eligibility condition changes, **THEN** `isTrackedBetaTester` must change to
> match — two expressions of one rule, in two languages (JS + plpgsql), with no shared source;
> a future edit to one without the other silently reopens either a false-reject (trigger
> stricter than the client checks for, legitimate testers' events start failing) or the
> original client-only-gate gap (trigger looser than intended). Check: `entitlements.test.js`
> covers the JS half; migration 031's own verification block covers the SQL half — no single
> automated test spans both today.

**F123 · Beta Homebase — three tables, three different write postures, don't blur them** —
`database/migrations/037_add_beta_homebase.sql`, `api/admin-beta-hub.js`, `db.js`,
`App.jsx`/`ProfilePanel.jsx`/`BetaHomebase.jsx` — **[G] for the icon/content gate, [L] for the
rubric scores as a source of truth for the tester's own displayed total**
Introduced with the Beta Tester Homebase (docs/TODO.md §12) — the icon next to the
notification bell, gated `isTrackedBetaTester` (F122's predicate reused as-is, not
re-derived). Three new tables, three DIFFERENT write postures — conflating any two of them
is the drift this entry exists to prevent:
- **`beta_content_items`** (checklist items + suggestion prompts) — admin-write-only via
  `api/admin-beta-hub.js`'s service-role client (`entity: "content"`). Tester read is a direct
  RLS-scoped client select (`published_at IS NOT NULL AND is_tracked_beta_tester(auth.uid())`)
  — no API round trip, same posture `changelog_entries` (F-adjacent, migration 032) already
  established for this exact "read is safe direct, write is admin-only" split.
- **`beta_checklist_completions`** — the ONE tester-writable table in this set. A tester's own
  checkbox state is a direct client insert/delete (RLS `user_id = auth.uid()` **plus** a
  SECURITY DEFINER `BEFORE INSERT` trigger re-checking `is_tracked_beta_tester(NEW.user_id)`,
  mirroring migration 031's `check_beta_activity_event_eligibility` pattern exactly — same
  reasoning: RLS alone proves "this row is mine," not "I'm actually a tracked beta tester").
- **`beta_scores`** — admin-write-only via `api/admin-beta-hub.js` (`entity: "score"`).
  **Deliberately NOT auto-computed** — docs/TODO.md §12.L's "scoring stays manual, reviewed by
  a human" decision (Call Attendance in particular has zero in-app data source). `admin_notes`
  on this table must NEVER be selected by a tester-facing query — it's admin's own reasoning,
  not tester-visible content; the RLS SELECT policy returns the whole row, so any new
  tester-facing read of this table must explicitly project columns, not `select("*")`.
- **`is_tracked_beta_tester(uid)`** (new SQL function, `SECURITY DEFINER STABLE`) — the SQL-side
  twin of `entitlements.js`'s `isTrackedBetaTester`, now reused across three RLS
  policies/the trigger instead of inlining the same subquery repeatedly. Still "two languages,
  no shared source" at the JS/SQL boundary (F122's existing warning), but now consolidated to
  ONE place on the SQL side instead of growing a second/third inline copy.
- **Header badge (`App.jsx`'s `loadBetaHomebaseBadge`, added 2026-08-08)** — a SECOND caller of
  the same read-only tester-facing fetchers `BetaHomebase.jsx` itself uses
  (`fetchBetaChecklistItems`/`fetchMyChecklistCompletions`/`fetchBetaSuggestions`/
  `fetchMyBetaScore`/`fetchPublishedChangelogEntries`) — deliberately the SAME functions, not a
  second query written against the same tables, so this stays "one authoritative read, called
  twice" rather than a parallel approximation (the distinction `active-systems.md` §6 draws for
  Coach context grounding applies here too). Unchecked-count math (`items` minus
  `completedIds`) is done independently in both places since there's no shared component to put
  it in, but both start from the identical fetched rows. "New since last opened" (changelog/
  suggestion/score) has NO server-side read-marker — it's a device-local `localStorage` timestamp
  (`betaHomebaseLastViewedAt:<user_id>`, stamped on open, same pattern as the sitewide changelog
  bell's `lastSeenChangelogId`), so a tester who reads on one device still sees the badge on
  another. That's an accepted gap, not an oversight — this app has no other read-receipt/
  notification-state table, and the checklist half of the badge (the only part with real
  per-tester DB state) isn't affected by it.
> **IF** a new Beta Homebase surface is added, **THEN** classify its write path against the
> three postures above before writing a migration — do not default to "admin route" or
> "direct client write" out of habit; the posture follows from *who legitimately produces the
> data* (admin content vs. a tester's own action vs. admin judgment about a tester). **IF**
> `is_tracked_beta_tester(uid)` or `isTrackedBetaTester` (JS) changes, **THEN** change both
> (F122's rule, now with a third consumer). **IF** a new field is added to `beta_scores`,
> **THEN** decide explicitly whether it's tester-visible or admin-only before exposing it
> through `fetchMyBetaScore` — `admin_notes` is the existing admin-only precedent. **IF** the
> header badge's "new" definition changes (a new content kind should count, or an existing one
> shouldn't), **THEN** update `loadBetaHomebaseBadge` in `App.jsx` only — never add a second,
> differently-shaped fetch for the same data just to feed the badge. Check:
> `dbBetaHomebase.test.js` (client read/write shape + gating), `adminBetaHub.test.js` (server
> auth + entity dispatch), `adminBetaReport.test.js` (the score/checklist joins the admin
> scoresheet reads); migration 037's own verification block covers the RLS/trigger boundary —
> no single automated test spans the JS+SQL boundary, same gap F122 already flags.

**F125 · Money Moves (base-user Productivity Hub) — deliberately ISOLATED from the Beta
Homebase, not a variant of it** — `database/migrations/039_add_base_productivity_hub.sql`,
`api/admin-beta-hub.js`, `db.js`, `App.jsx`/`ProfilePanel.jsx`/`ProductivityHub.jsx`,
`BetaHomebase.jsx` — **[G] for the icon/content gate, [L] for nothing — there is no
score/ledger half here, unlike F123**
Added 2026-08-08 as the base-user counterpart to the Beta Tester Homebase (F123) — same
checklist/tips/feedback flow, different audience (every signed-in user who ISN'T a tracked
beta tester, per `!isTrackedBetaTester`) and different purpose (self-service productivity,
not a scored path to a reward). Three decisions this entry exists to keep from drifting apart
next time either surface changes:
- **Separate tables, on purpose (`base_content_items`/`base_checklist_completions`/
  `base_feedback_events`), not a reuse of the beta_* ones.** `beta_checklist_completions`
  (037) and `beta_activity_events` (031) both carry `SECURITY DEFINER` triggers that
  hard-reject any insert from a non-tracked-beta-tester — reusing them for base users would
  have meant loosening the exact triggers protecting the live cohort's scoring data mid-
  program. New tables cost nothing against the Vercel Hobby serverless-function cap (that cap
  is per `api/*.js` FILE, F123 already established this) — no scarcity pressure pushed toward
  reuse the way there was for the API route below. `base_checklist_completions` therefore has
  **no eligibility trigger at all** — there's no "tracked cohort" concept for base users, RLS's
  own `user_id = auth.uid()` check is the whole gate. `base_feedback_events` is its own table
  rather than a second event_type on `beta_activity_events` (030's pattern) for the same
  reason F123's `beta_scores.admin_notes` rule protects tester-only data: that table
  specifically feeds `api/admin-beta-report.js`'s scoring aggregation, and mixing non-cohort
  rows in would corrupt its "~40 known testers" scope.
- **Admin route IS shared — `api/admin-beta-hub.js` grew an `entity: "base_content"` branch**
  instead of a new file, the opposite call from the tables above. `CONTENT_TABLES` maps
  `content` → `beta_content_items` and `base_content` → `base_content_items`; every handler
  (`handleContentGet`/`Save`/`Delete`) is parametrized on `table` and shared by both. This
  repo is at 12/12 Hobby-plan functions (CLAUDE.md) — a second near-identical route would
  either force consolidating something else first or fail the build outright.
- **Frontend presentation IS shared too — `ChecklistSection`/`SuggestionsSection`/
  `WhatsNewSection` are exported from `BetaHomebase.jsx` and imported by
  `ProductivityHub.jsx`**, not duplicated. Neither component has beta-specific logic inside;
  `title` props let each caller relabel. `ScoreSection` is explicitly NOT reused/exported —
  scoring stays beta-program-only, `ProductivityHub.jsx` has no score concept at all.
- **The header badge is a fourth+fifth consumer of the "one authoritative read, called
  twice" pattern F123's addendum already established** — `loadProductivityHubBadge` in
  `App.jsx` calls the exact same base-audience fetchers `ProductivityHub.jsx` itself uses
  (`fetchBaseChecklistItems`/`fetchMyBaseChecklistCompletions`/`fetchBaseSuggestions`/
  `fetchPublishedChangelogEntries` — the last one shared verbatim with the BETA badge, since
  the changelog is global to begin with), own `localStorage` key namespace
  (`productivityHubLastViewedAt:<user_id>`, separate from `betaHomebaseLastViewedAt:<user_id>`
  so the two badges' read state never collides for a user who was once a tracked tester and
  later isn't, or vice versa). Same accepted per-device-only gap as F123's badge — no new
  read-receipt table added to close it.
- **The two icons are mutually exclusive in `App.jsx`, gated on the same `isTrackedTester`
  boolean in opposite directions** (`isTrackedTester &&` for the beta icon, `!isTrackedTester
  &&` for the Money Moves icon) — a user is never shown both, and never shown neither.
> **IF** `base_content_items`'s shape diverges from `beta_content_items`'s (a field added to
> one but not the other), **THEN** `CONTENT_TABLES`' shared handlers in `api/admin-beta-hub.js`
> break silently for whichever entity lacks the field — either add it to both tables or split
> the handlers, don't patch around a mismatch inline. **IF** a new field is added to
> `base_content_items`/a new base-only content kind is introduced, **THEN** decide whether
> `ChecklistSection`/`SuggestionsSection` still fit as-is (they're generic over `items`/
> `title` today) before extending them — don't fork a near-duplicate component. **IF** the
> Money Moves badge's "new" definition changes, **THEN** update `loadProductivityHubBadge`
> only, same rule F123 already states for its beta counterpart. **IF** `isTrackedBetaTester`'s
> definition changes, **THEN** the icon-exclusivity condition in `App.jsx` (both `isTrackedTester
> &&` and `!isTrackedTester &&`) picks up the change automatically since both read the same
> `isTrackedTester` constant — but re-verify a user is still never shown both/neither icons.
> Check: `dbBaseProductivityHub.test.js` (client read/write shape, no tracked-tester gating),
> `adminBetaHub.test.js`'s `entity=base_content` block (server dispatch to the right table) —
> no automated test covers the App.jsx icon-exclusivity/badge wiring, same gap F123 already
> flags for its own badge.

**Reverse index — surface F-entries already covering Spine-C consumers (do not restate):**
F80 (`getEntitlement` state machine + real-clock rule), F81 (`paywallBypassed`/
`isExpiredReadOnly` enforcement fork), F82 (upgrade surfaces), F85/F86 (lifecycle engine +
cron shell / DW-7), F43 (BudgetPanel `taxFeatureUnlocked`), F50 (ProfilePanel Tax Plan
writers), F45 (ProfilePanel `taxplan` route gate + `investorcodes` asymmetry / DW-W2),
F24 (Coach card AI gate), F69 (tier flags & RLS boundary), F70 (investor/demo machinery),
F71 (trial seeding), F78 (TrialExplainer gate).

### 20.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `hasTesterAccess`/`hasPrivilegedAccess` or any gate function built on either (F111) | Every gate consumer (registry below) — the relevant superset relationship moves for all at once | `entitlements.test.js`; walk the tier matrix (§4.3) | D4 |
| A new gated feature added | Must build on `hasTesterAccess` (account-tier) or `hasPrivilegedAccess` (paid-wall) — decide which explicitly; client gate **and** server/RLS gate both present | Grep the new gate for inline `isAdmin || isTester` (forbidden); confirm a server re-check exists | D4 |
| A server gate's row-field reads (F112) | The feeding SELECT must include every column — DW-7 class | Grep gate field reads vs `.select(...)`; add the field-coverage test | D4 |
| `getEntitlement` states/precedence/timestamps (F80) | F81 fork, TrialBanner/Sub-card copy, F78 explainer condition, lifecycle engine (F85), Live Inspector Sub Phase | One account through all five states; `subscription.test.js`; **never** thread `effectiveToday` | D1 |
| `paywallBypassed` set or per-surface split (F81) | Home/Budget readOnly shadows (F20/F35), Income/Log replacement (F81), Account fully-live rule; a **new nav panel gets no enforcement unless wired** | Expired non-admin visits every tab; nothing mutates, checkout reachable | D4 |
| Tier-flag mapping (`is_admin`/`is_tester`/`is_investor` → camelCase, F67) | Client reads via mapping, never writes; every gate's inputs; `config.isInvestor` (paywall bypass) vs `row.is_investor` (cron) — two spellings of one fact | `db.test.js` mapping cases; DB Row Viewer tier columns | D1/D4 |
| Tester 6-month window semantics (§9, migration 021 trigger) | **Stale as written — corrected 2026-07-25.** Testers no longer "ride the real paywall": `paywallBypassed` now includes `isTester` (same locked decision as F111's `hasPrivilegedAccess`), closing the asymmetry where testers relied only on the trial window. F86 cron exemption (DW-7) is unaffected — still exempts testers from dunning/deletion regardless. | Expired tester: paywall never triggers in-app (bypassed, not just surviving on window math); never dunned/deleted by cron | D4 |
| A new tier flag / privileged column | F69 full checklist (migration RLS grant + service-role route + F67 read map + F68 write exclusion + gate on `hasTesterAccess` + cron exemption decision) | Post-migration: plain client upsert still works, new column rejects client writes | D4 |
| `isTrackedBetaTester`'s eligibility condition (F122) | Migration 031's trigger — same rule, two languages, no shared source | Change both together; non-eligible insert attempt still fails after either-side edit | D4 |
| `isTrackedBetaTester`'s eligibility condition, again (F123) | Migration 037's `is_tracked_beta_tester(uid)` SQL function AND `check_beta_checklist_completion_eligibility` trigger — third consumer of the same rule | Change JS + SQL function together; non-eligible insert attempt still fails after either-side edit | D4 |
| A new `beta_content_items`/`beta_scores` field (F123) | Decide tester-visible vs admin-only BEFORE adding it to any tester-facing `fetch...` in `db.js` — `beta_scores.admin_notes` is the existing admin-only precedent | Grep `db.js`'s tester-facing selects for the new column; confirm it's absent unless deliberately exposed | D1 |
| `beta_content_items` shape changes (column added/renamed, F125) | `api/admin-beta-hub.js`'s shared `handleContentGet`/`Save`/`Delete` also serve `base_content_items` via the same `table` param — a beta-only field change breaks the base path silently unless `base_content_items` gets it too or the handlers split | Exercise both `entity: "content"` and `entity: "base_content"` in `adminBetaHub.test.js` after the change | D1 |
| `isTrackedBetaTester`'s eligibility condition, again (F125) | `App.jsx`'s Beta Homebase icon (`isTrackedTester &&`) and Money Moves icon (`!isTrackedTester &&`) are two ends of the same boolean — a user must never see both or neither | Toggle a test account's tracked-tester status; confirm exactly one icon renders | D4 |

### 20.3 Block 3 — The one-page gate registry

Every gate in the app, its definition, and **both** sides (client + server). A row with an
empty "Server / RLS gate" cell is a client-only gate — acceptable *only* when the data it
guards is itself RLS-protected server-side (noted per row); a genuinely privileged action
with no server gate is a D4 finding.

| Gate | Definition | Tier inputs | Client call sites | Server / RLS gate |
|---|---|---|---|---|
| **`canAccessAiFeatures`** | `isAdmin \|\| isTester \|\| isInvestor` (`hasPrivilegedAccess`, 2026-07-25) | `is_admin`, `is_tester`, `is_investor` | `NewJobSeasonHomePanel.jsx` (Job Hunt Assistant + Résumé Review entry points, F124) | Job Hunt/Résumé Review reuse `api/coach.js`'s wider `canAccessAskCoachGeneral` server-side, not this function directly — see F124's "known gap" note; no per-surface server re-check exists yet |
| **`canAccessAskCoachGeneral`** | `isAdmin \|\| isTester \|\| isInvestor \|\| entitlement.isEntitled` (`hasPrivilegedAccess`, 2026-07-25) | `is_admin`, `is_tester`, `is_investor`, subscription columns | `App.jsx` (Ask Coach panel + bottom-nav item), `HomePanel.jsx`/`NewJobSeasonHomePanel.jsx` (Net Worth card) | `api/coach.js:93` — re-checks on `userRow.is_admin`/`is_tester`/`is_investor` + server-derived `entitlement` before streaming (the real model gate for every surface that shares this route, Job Hunt/Résumé Review included) |
| **`canAccessTaxPlan`** | `isAdmin \|\| isTester \|\| taxProjectionsEnabled` — deliberately no `isInvestor` | `is_admin`, `is_tester`, `tax_projections_enabled` | `BudgetPanel.jsx:82` (`taxFeatureUnlocked`, F43), `ProfilePanel.jsx:1900` (`canSeeTaxPlan`, F45/F50) | none direct — tax writes go through `config` (F50), RLS-owned via migration 019; the gate is display-only. **No server action to re-gate** (writes are the user's own config row) |
| **`getEntitlement` → `paywallBypassed`** | `isAdmin \|\| isTester \|\| config.isInvestor` (F81, widened 2026-07-25 — was `isAdmin \|\| config.isInvestor` only, testers used to just ride the trial window) | `is_admin`, `is_tester`, `is_investor` | `App.jsx:1463` → `isExpiredReadOnly` fork (F81) drives readOnly shadows + panel replacement | Server side is Stripe/webhook truth + the lifecycle cron (F85/F86); the client fork is UX over server-authoritative subscription columns |
| **Lifecycle exemption** | `is_admin \|\| is_investor \|\| is_tester` (`_lifecycleEngine.js:44`) | all three flags | — (server-only) | **the gate itself** — SELECT now supplies `is_tester` (DW-7 fixed, F112/F86); field-coverage regression test enforces it stays that way |
| **`isAdmin` toolkit** | `user_data.is_admin` (F67 map) | `is_admin` | Admin Tools sheet, Week Inspector, Reopen, per-entry breakdown (Spine F) | Data the tools read is the user's own RLS-scoped row; write-capable Phase-2 tools are `isOwner`-gated (not built) |
| **`isAdmin` investor codes** | `user_data.is_admin` | `is_admin` | `ProfilePanel.jsx:2019` (ListRow), route `:1944` (**row-gate only** — DW-W2) | `InvestorAdminPanel` data calls are RLS-gated server-side (why DW-W2 is unexploitable today) |
| **`isInvestor` demo tree** | `user_data.is_investor` / `config.isInvestor` | `is_investor` | `DemoAccountTree`, investor signup path (F70) | `createInvestorAccount`/demo storage RLS-scoped; unaffected by the 2026-07-25 paid-wall decision — `is_investor` now **does** grant AI features (F111), but that's a separate gate, not this one |
| **Tier flag writes** | — | all flags + subscription columns | client **never** writes (F68 whitelist-by-destructure) | migration 019 RLS + service-role `api/*` routes only |

**Tier matrix (the cells every G-change must walk):**

| Flag combo | AI features | Tax Plan | Demo tree / investor path | Paywall at expiry | Admin toolkit |
|---|---|---|---|---|---|
| plain user | ✗ | ✗ (opt-in alone ✗) | ✗ | **enforced** | ✗ |
| `taxProjectionsEnabled` | ✗ | ✓ | ✗ | enforced | ✗ |
| `is_tester` | ✓ | ✓ | ✗ (firewall, account-tier surfaces only) | **bypassed** (2026-07-25 — was "enforced, real 6-mo trial" until `paywallBypassed` widened; cron-exempt regardless — DW-7 fixed) | ✗ |
| `is_investor` | ✓ (2026-07-25 — was ✗ firewall) | ✗ | ✓ | bypassed | ✗ |
| `is_admin` | ✓ | ✓ | ✗ (unless also investor) | bypassed | ✓ |
| `is_owner` (future) | ✓ | ✓ | — | bypassed | ✓ + Phase-2 write tools |

### 20.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *Tax Plan tester gate + structural superset* (`a643153`) — the moment `hasTesterAccess`
  became the shared base; before it, each gate re-derived the OR and could drift. F111's
  IF/THEN exists to keep every new gate on that base.
- *Liability hold on the wizard unlock* (`a430fbf`/`09c7609`) — `taxExemptOptIn` was demoted
  from a grant path to a no-op; the check lives once, in `entitlements.js`, never scattered.
- *Beta tester ≠ investor firewall, narrowed 2026-07-25* (`ec72a07`, §9) — originally
  `is_tester` granted AI only, never Demo Tree/investor path, and `is_investor` granted no AI;
  the CRUCIAL comment in `canAccessAiFeatures` was the in-code guard. **Superseded for the
  AI-features half**: `is_investor` now grants AI features too (`hasPrivilegedAccess`, F111) —
  the account-tier half (Demo Tree, investor code path, beta-cohort tracking) is unchanged and
  still firewalled.
- *RLS hardening* (`60a4b17`, migration 019) — privileged writes moved server-side; F68's
  whitelist-by-destructure is the client half.
- *Migration 024* (`8f34def`/`a93dcad`) — a tier/permission migration can pass in SQL and
  still break writes; F69's checklist item.

**Standing findings from this pass:** none new filed. **DW-7** (the cron SELECT once omitted
`is_tester`, killing the lifecycle exemption) — surfaced in the T9 pass, generalized here into
F112 as a *class* (server gate vs. its feeding query) rather than a one-off, and now fixed
(SELECT + `cronLifecycleSelectColumns.test.js`) — is restated in the gate registry and tier
matrix so the tester row's "enforced / cron-exempt (DW-7 fixed)" status is unmissable.
**DW-W2** (the `investorcodes` route lacking the
route-level re-check `taxplan` has) remains queue-visible and is captured in the registry's
"row-gate only" note; it is not promoted because `activeSection` is tap-only state and the
underlying data is RLS-gated (F45's IF/THEN is the tripwire). No D5 corrections owed — the
`a643153` structural-superset claim was verified against live code (both gates call
`hasTesterAccess`) and holds.

---

## 21. Spine D — AI Layer & Context Grounding Drift Map

**Pass date:** 2026-07-20 (spine pass). Same anchor + method rules as §7; numbering
continues (F113+).
**Git-history note:** the governing intentions are the grounding-rediscovery series
(`bcc8a6a` — per-expense cost resolved from `history` not `billingMeta`; `1c7b086` — Coach
grounded in Home's actual tile names/figures; `e1d3c90` — goal tiles wired in *minus names*;
`44e8a30` — Next Week Takehome gap closed; `836921d` — week/period mentions paired with real
dates; `2e0121a` — active-weeks scoping), each of which fixed a Coach line that had drifted
from the UI it describes. This spine's **whole game** is §6's grounding rule: *every context
field resolves through the same authoritative Spine-A function the UI itself uses* — never a
parallel approximation (D1). This is the authority record for that contract.

**Scope:** `aiContext.js` (`buildCoachContext`), `coachPrompts.js`, `coachFeatureGuide.js`,
`coachTriggers.js`, `claude.js`, `api/coach.js`, `AskCoachPanel.jsx`, `CoachNetWorthCard.jsx`,
the dormant `coach_chats` db layer. Absorbs active-systems §6.

### 21.1 Block 1 — Critical inventory (spine-internal machinery)

**F113 · `buildCoachContext` grounding contract** — `aiContext.js:72–204` — **[L]**
The single Coach context builder. Its defining property: **every line resolves through the
exact Spine-A function the corresponding UI tile uses**, and each line carries an in-code
"Matches HomePanel.jsx's X tile exactly" comment naming its twin. Verified groundings:
`activeWeeksThisYear` → `resolveActiveWeeksThisYear` (F13, not a flat 52); `annualSavings`/
`netWorthHealth` → `netWorthHealthStatus` (F23); Budget Health `spendRatio` → same <50%/<75%
thresholds as F16; `leftThisWeek` → `(prevWeekNet ?? weeklyIncome) − avgWeeklySpend` (F15/F16);
goal timeline → `computeGoalTimeline(…, config?.goalTimelineEpochIdx ?? null)` — **the same
epoch arg as HomePanel (F18)**, the exact parity a 2026-07-16 live-test bug violated; per-
expense cost → `getEffectiveAmountForMonth`/`getEffectiveAmount` (F38/F102, the `bcc8a6a`
fix); period labels → `payPeriodUnit`/`weekNumToPaycheckNum`/`getPayPeriodBounds` (Spine A,
schedule-aware — never hardcode "week"); `perCheckFactor` = `52/checksPerYear` scaling.
> **IF** a context line is added or changed, **THEN** it MUST call the authoritative Spine-A
> function its UI twin calls — writing a local approximation is the D1 pattern §6 exists to
> catch (the `billingMeta` estimate once disagreed by double digits; the flat-52 double-
> diluted savings). **IF** a Spine-A signature the context consumes changes (F13/F15/F18/F23/
> F38/F102), **THEN** this builder is a named consumer in that entry's blast radius. Check:
> `aiContext.test.js` (grounding regressions are test-fenced — the `aiContext.js ↔ its test`
> co-change coupling is #6 in §4.3); Ask Coach a "what do I make / when do goals finish"
> question and diff the answer against the Home tile. **Purity invariant:** `buildCoachContext`
> is a pure function of its args (no hooks, no fetches) — `aiContext.test.js` asserts
> idempotency and no-throw on empty input; keep it that way.

**F114 · The privacy split (labels sent, goal names withheld)** — `aiContext.js:187`, `:196` — **[G/L]**
A deliberate asymmetry: **expense labels ARE sent** to Coach (`exp.label ?? "Unnamed"` in the
Expense breakdown line, `:187`) but **goal names are withheld** — the goal breakdown is
"ranked by funding priority — goal names withheld for privacy" (`:196`), sending only rank +
target + ETA, never `goal.label`. Goals are treated as more sensitive than bills (aspirations
vs. recurring obligations).
> **IF** the goal breakdown line is touched, **THEN** it must never interpolate `goal.label`/
> `goal.name` — the privacy rule is a product commitment, not a formatting choice; the "names
> withheld" copy in the string is the in-context reminder. **IF** a new context line surfaces
> goal data, **THEN** it inherits the same withholding. Check: `aiContext.test.js` asserts the
> goal breakdown contains no goal name; grep the builder for `goal.label`/`g.label` (should be
> zero in emitted strings). *(Note the asymmetry when adding new entity types: bills follow
> the expense-label precedent, aspirational/personal entities follow the goal precedent —
> decide explicitly, don't default.)*

**F115 · `api/coach.js` server gate + trust boundary** — `api/coach.js` — **[G]**
The server proxy, the ONE gate every Coach surface funnels through (Ask Coach, Net Worth card,
and — as of F124 — Job Hunt Assistant/Résumé Review too, since they share this route): (1)
**re-gates** access server-side — `SELECT is_admin, is_tester, is_investor, ...` then
`canAccessAskCoachGeneral({isAdmin, isTester, isInvestor, entitlement})` — **corrected
2026-07-25**, this entry previously said `canAccessAiFeatures({isAdmin, isTester})`, which was
already stale (the 2026-07-24 gate split moved this route onto the wider
`canAccessAskCoachGeneral`) and is now doubly so (that function itself widened to include
`isInvestor` the same day as this correction) — the Spine-C "every gate twice" rule satisfied
(and F112-correct: the SELECT supplies every column the gate reads, unlike DW-7);
(2) keeps `ANTHROPIC_API_KEY` server-side (test/live split mirrors `_stripeClient.js`);
(3) reads `{messages, systemPrompt, contextBlock, model}` from the request body, maps `model`
through `MODEL_IDS` (default `haiku`), applies `cache_control: ephemeral` to the system +
context blocks (prompt caching), and streams. **Trust boundary:** the context block is built
*client-side* (F113) and POSTed — the server re-gates *access* but does not re-derive the
context; it trusts the block's content. **Known gap (F124):** because this one route serves
every Coach surface on the *same* wide gate, Job Hunt Assistant/Résumé Review's narrower
client-side `canAccessAiFeatures` gate has no matching server-side enforcement — see F124's own
note.
> **IF** the gate's SELECT changes, **THEN** it must keep supplying every column
> `canAccessAskCoachGeneral` reads (F112 class). **IF** anything security-sensitive is ever
> driven by the client-supplied `contextBlock` (it is currently display grounding only, sent to
> the model, never used for authorization), **THEN** that's a new trust-boundary crossing —
> re-derive it server-side instead. **IF** the model default or `MODEL_IDS` map changes,
> **THEN** confirm callers still pass a valid key (`AskCoachPanel` passes `"haiku"`,
> `JobHuntChatPanel`/`ResumeReviewCard` pass `"sonnet"`). Check: a non-admin/non-tester/
> non-investor/non-entitled request returns 403 before any Anthropic call; the client cannot
> escalate access by editing the POST body.

**F116 · `coach_chats` persistence layer — now wired (superseded, see F123)** — `db.js:531–620`
(`loadCoachChats`/`saveCoachChat`/`deleteCoachChat`), migration `023_add_coach_chats.sql` —
**[L/G]**
Was dormant as of the 2026-07-20 spine pass (unit-tested, zero UI callers). **As of 2026-07-25,
`AskCoachPanel.jsx` is a live caller** of all three functions — multi-turn Ask Coach chats now
persist, and a chat-history list resumes a saved conversation. This entry's own IF/THEN fired
and was actioned: see **F123** for the earned drift-map entry covering the wiring itself. Kept
here only so anything still citing "F116 dormant" gets redirected instead of relying on a stale
fact.

**F123 · `AskCoachPanel` chat persistence + retention (activates F116)** — `AskCoachPanel.jsx`
(`persistChat`, `refreshHistory`, `finalizeSummary`, `endCurrentSession`), `coachPrompts.js`
(`COACH_CHAT_SUMMARY_PROMPT`) — **[L/G]**
Each completed Ask Coach turn (success *or* the request failing mid-stream) is upserted into
`coach_chats` immediately after the turn resolves — an eager save, not a debounce, per the
same reasoning as Spine B's config/goals/expenses/logs sites (F110 class), because a
backgrounded tab could otherwise lose an in-progress exchange. `chatType` is hardcoded
`"ask_coach"` — this entry does not cover `job_scout`/`job_hunt`/`statement_summary`, none of
which have a UI caller yet. Retention is capped at the 3 most recent `ask_coach` rows
(`MAX_SAVED_CHATS`); `refreshHistory` prunes anything older, **except** the row the user
currently has open, which is never deleted out from under an active session even if it's the
oldest of the three. A short Haiku-generated summary (`COACH_CHAT_SUMMARY_PROMPT`, a separate,
narrower prompt than `ASK_COACH_SYSTEM_PROMPT` — no feature guide, third-person, history-row
voice, never user-facing) is written best-effort when a session ends (panel closed, New Chat
started over an in-progress chat, or a different saved chat resumed) — never blocks the UI
action that triggered it. Gate: unchanged — persistence rides on the same
`canAccessAskCoachGeneral` mount-time gate as the rest of Ask Coach (§2 F115); no separate
entitlement check was added because saving a conversation isn't a new surface, just durability
for an already-gated one. RLS: `coach_chats`'s own-row `SELECT`/`INSERT`/`UPDATE`/`DELETE`
policies (migration 023) were verified against this new call pattern — the client never
supplies `user_id`, `saveCoachChat` always writes it from the session (F69-class own-row
scoping holds).
> **IF** a second `chat_type` (`job_scout`, etc.) gets a UI caller, **THEN** it needs its own
> retention/summary decision — do not assume `MAX_SAVED_CHATS = 3` or the summary trigger
> generalize automatically; `AskCoachPanel`'s history list also filters to `chatType ===
> "ask_coach"` explicitly and will silently hide any other type until taught about it. **IF**
> `saveCoachChat`'s payload shape changes (new column, renamed field), **THEN** `persistChat`
> and `finalizeSummary` are both named callers — update both or they'll upsert an incomplete
> row. **IF** the retention cap or the "never prune the active chat" guard is touched, **THEN**
> re-verify a chat open in one tab can't be deleted by a save happening in another (the guard
> keys off `activeChatIdRef`, not anything server-enforced — this is a UI-level courtesy, not a
> hard guarantee across concurrent sessions). Check: `AskCoachPanel.test.jsx` covers persistence
> after a turn (success and failure paths), chat-id reuse across turns, retention pruning that
> spares the active chat, resume-from-history, and delete.

**F124 · Job Hunt Assistant + Résumé Review — first sections-4+ surfaces to actually ship**
(§18.E/E1) — `JobHuntChatPanel.jsx`, `ResumeReviewCard.jsx`, `aiContext.js`
(`buildJobHuntContext`), `coachPrompts.js` (`JOB_HUNT_SYSTEM_PROMPT`,
`RESUME_REVIEW_SYSTEM_PROMPT`), migration `032_add_resume_profile.sql` — **[L/G]**
Built 2026-07-25. First real occupants of the "sections 4+" admin/tester/investor-only tier the
doc comments in `entitlements.js` have described since the Ask Coach/Net Worth gate split — both
gate **client-side** on `canAccessAiFeatures({isAdmin, isTester, isInvestor})`, the narrow gate
(`hasPrivilegedAccess`, same day). **Server-side is a different story — see F115's "known gap"**:
both modes' actual network calls run through `api/coach.js`, which gates on the *wider*
`canAccessAskCoachGeneral` (shared by every Coach surface), not this narrower function — so the
UI hides these two modes from a plain trial/paid user, but nothing server-side currently stops
that same user from reaching the model by crafting a raw request. **Grounding:**
`buildJobHuntContext()` is a *separate* function from
`buildCoachContext` (F113), not a branch on it — reads `computeNewJobSeasonRunway`/
`resolvePrimaryRunwayDays`/`sumJobHuntIncome` (same functions `NewJobSeasonHomePanel` itself reads,
never a parallel estimate) plus `config.targetIncomeAnnual`/`jobApplications`/
`returnToWorkDate` directly. **Deliberate privacy asymmetry, the opposite of F114's goal-name
rule:** application company/role names are sent in full, not withheld — Job Hunt Assistant's
whole point is company-specific coaching ("prep me for the Acme interview"), so withholding the
name would break the feature rather than protect the user the way withholding a goal name does.
**Rubric-scored** (docs/coach-personality-rubric.md, 2026-07-25): Job Hunt Chat's own
`JOB_HUNT_ADDENDUM` dials Metaphor Intensity down to 2 ("trace") from the 3 default — an active
search under runway pressure gets a lighter touch, mirroring the same "urgency/plainness over
flavor at a vulnerable moment" pattern already established for the Red tier and
`NetWorthHealthTips.jsx`; Résumé Review stays at the 3 default, no override, since it reads
closer to Ask Coach's own tactical register. **Storage:** `resume_profile` (one row per user,
`user_id` itself is the primary key — genuinely 1:1, unlike `coach_chats`'s 1:many) holds only
the résumé input; the *review* is a `coach_chats` row (`chat_type: 'resume_review'`, added to
that table's check constraint by the same migration) via the existing `saveCoachChat` path — no
new serverless route, both modes reuse `api/coach.js` on Sonnet (§18.G's cost split). **v1
scope, deliberately incomplete:** both panels are single-session — no chat-history/retention
system yet, the same stage `AskCoachPanel` was in before F123 landed persistence for it.
> **IF** either mode's gate is ever changed off `canAccessAiFeatures`, **THEN** the locked
> decision (`coach-entry-points.md`, 2026-07-25) is **paid-only for everyone else, not
> trial-included** — a real post-card-charge subscription (`entitlement.state === "active"`) for
> accounts outside admin/tester/investor, never bare `canAccessAskCoachGeneral`, which also
> opens for trial/grace and would silently hand a paid-conversion feature to every trial user.
> Admin/tester/investor keep bypassing unconditionally regardless — `hasPrivilegedAccess` is
> layered under the new check, not replaced by it. This needs a new, narrower entitlement
> function (or an explicit `state === "active"` check ORed with `hasPrivilegedAccess`) plus the
> same splitting-checklist treatment `coach-entry-points.md` describes for sections 1–2 — never a
> silent copy-paste of either existing gate function. **IF** `buildJobHuntContext`'s
> fields are extended, **THEN** they must resolve through the same authoritative function the
> on-screen New Job Season panels use, per F113's rule — this function is exempt from `buildCoachContext`
> itself but not from the grounding rule that governs it. **IF** persistence/retention/summary
> generation is added for `job_hunt` or `resume_review` chat types, **THEN** it earns its own
> entry (or an extension of F123) rather than assuming `AskCoachPanel`'s `MAX_SAVED_CHATS = 3`
> and `ask_coach`-only history filter generalize automatically — F123's own IF/THEN already flags
> this. Check: `aiContext.test.js`'s `buildJobHuntContext` block, `JobHuntChatPanel.test.jsx`,
> `ResumeReviewCard.test.jsx`, `newJobSeasonFlow.test.jsx`'s gate-verification block (confirms a real
> trial entitlement, not just admin/tester, is correctly refused).

**Reverse index — surface F-entries already covering Spine-D consumers (do not restate):**
F24 (Coach net-worth trigger chain, converged on `computeNewJobSeasonRunway` +
`resolveNetWorthSignalTier`/`shouldFireForTier`), F22/F44 (`computeNewJobSeasonRunway` — the
convergence target both Coach entry points and the two New Job Season panels share), F13
(`resolveActiveWeeksThisYear`), F15 (`resolvePrevWeekNet`), F18
(`computeGoalTimeline` epoch parity), F23 (`netWorthHealthStatus`), F38/F102 (expense
resolvers), F81/F111 (the AI gate, Spine C).

### 21.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| A `buildCoachContext` line's source function (F113) | The UI tile it "Matches … exactly" — they must move together | `aiContext.test.js`; Ask Coach the question, diff vs. the named Home/Income tile | D1 |
| Any Spine-A signature the context reads (F13/F15/F18/F23/F38/F102) | `buildCoachContext` is a named consumer in that entry's blast radius | The Spine-A entry's own procedure + `aiContext.test.js` | D1 |
| `computeGoalTimeline` epoch handling (F18) | Coach goal line **and** Home goal cards — both pass `config?.goalTimelineEpochIdx ?? null` | Grep `computeGoalTimeline(` for epoch-arg parity; goal ETA on card = Coach answer | D1 |
| Goal breakdown line / any goal-surfacing line (F114) | The privacy rule — no `goal.label` interpolation | `aiContext.test.js` no-goal-name assertion; grep builder for label refs | D5/privacy |
| `canAccessAiFeatures` inputs or `api/coach.js` SELECT (F115) | Server gate must supply every column the gate reads (F112); client callers pass a valid `model` key | Non-entitled request → 403 pre-Anthropic; `entitlements.test.js` | D4 |
| `computeNewJobSeasonRunway`/`resolvePrimaryRunwayDays` signature (converged target — both former F24 quarantines closed `3267286`, 2026-07-22) | `CoachNetWorthCard.jsx` (Red tier) and `App.jsx`'s `coachRunwayDays` → `AskCoachPanel` both call it directly now — a signature change must be verified against both, not just the two New Job Season panels | `newJobSeasonFlow.test.jsx`'s "Coach presence (DW-8 fix)" block + `CoachNetWorthCard.test.jsx`; New Job Season Home headline, Coach card, and Ask Coach's stated runway must all agree on one account | D1 |
| `coach_chats` db functions get a second `chat_type` UI caller (F116/F123) | Retention cap, summary trigger, and the history-list filter are `ask_coach`-specific and won't generalize on their own | Confirm the new type gets its own retention/summary decision; grep `AskCoachPanel.jsx` for `"ask_coach"` filters | D3/D4 |
| `saveCoachChat`'s payload shape (columns, field names) | `persistChat` and `finalizeSummary` (F123) — both build the upsert payload independently | Update both call sites together; `AskCoachPanel.test.jsx` persistence assertions | D1 |
| `EVENT_TYPES`/`PAYCHECKS_PER_YEAR` (`constants/config.js`) | The context's most-recent-log label (`:178`) and `checksPerYear`/`perCheckFactor` scaling | Add/rename a type → context label resolves; biweekly account → per-check scaling correct | D1 |
| `buildJobHuntContext`'s source functions (F124) — `computeNewJobSeasonRunway`/`resolvePrimaryRunwayDays`/`sumJobHuntIncome` | `JobHuntChatPanel` context must keep matching `NewJobSeasonHomePanel`'s own runway tile | `aiContext.test.js`'s `buildJobHuntContext` block; ask Job Hunt Assistant the runway and diff vs. the Home tile | D1 |
| `canAccessAiFeatures` gate on `JobHuntChatPanel`/`ResumeReviewCard` (F124) | Must stay narrow (admin/tester/investor, no entitlement-based path) — never silently swapped for `canAccessAskCoachGeneral` | `newJobSeasonFlow.test.jsx`'s gate block: a real trial entitlement alone must NOT render either | D4 |

### 21.3 Block 3 — Authority table (context line → source function → UI twin it must match)

The L-spine deliverable for Spine D: every Coach context line, the Spine-A function it grounds
through, and the on-screen tile it is documented to match. A line computing its number any
other way is a §6 grounding violation (D1) by definition.

| Coach context line | Source-of-truth function | UI twin it must match |
|---|---|---|
| Weekly net income / surplus | `weeklyIncome` (F14), `avgWeeklySpend` | Home "typical week" tile (F16) |
| Next week takehome | `futureWeekNets[0]` → fallback `prevWeekNet` → `weeklyIncome` (F15/F29) | Home "Next Week Takehome" tile (F16) |
| Left this week | `(prevWeekNet ?? weeklyIncome) − avgWeeklySpend` (F15) | Home "Left This Week" tile (F16) |
| Savings rate / Net worth trend | `netWorthHealthStatus`, `annualSavings` over `activeWeeksThisYear` (F13/F23) | Home Net Worth cue (F23) |
| Budget Health | `spendRatio` = `avgWeeklySpend/weeklyIncome`, <50/<75 (F16) | Home "Budget Health" tile (F16) |
| Goals / funded / target | `getFundedGoalSpend` (`goalFunding.js`), goal targets | Home goal cards (F18/F19) |
| Weeks to complete all goals | `computeGoalTimeline(…, epochIdx)` `lastGoalEW` (F18) | Home goal ETA (F18) |
| Goal breakdown (rank + ETA, **no names**) | `formatGoalTimelineEntry` over `computeGoalTimeline` (F18/F114) | Home goal cards (rank only) |
| Expense breakdown (label + cost) | `getEffectiveAmountForMonth`/`getEffectiveAmount` (F38/F102) | Budget cards (F36/F38) |
| Current period / periods left | `getFiscalWeekNumber`, `weeksToChecksRemaining`, `payPeriodUnit`, `getPayPeriodBounds` (`fiscalWeek.js`) | App header chip, Income period label |
| Most recent log | `EVENT_TYPES[type].label`, `fmtFullDate` | Log panel entries (T6) |
| New Job Season runway | `runwayDays` → `computeNewJobSeasonRunway`/`resolvePrimaryRunwayDays` (F22/F44) | New Job Season Home headline (F22) — converged since `3267286` (2026-07-22) |

### 21.4 Block 4 — Case law & quarantine

**Precedents (fixed — cite, don't relearn):**
- *`billingMeta` per-expense estimate* (`bcc8a6a`, §6) — Coach derived per-expense cost from
  `billingMeta` instead of `history[]`, off by double digits vs. the UI. The grounding rule
  (F113) is the generalized fix; every context line's "Matches … exactly" comment is the
  in-code enforcement.
- *Flat-52 double dilution* (`2e0121a`, §1.H11) — the Coach's savings figure divided by a
  flat 52 on top of `weeklyIncome`'s own per-active-week average; fixed by `resolveActiveWeeksThisYear`
  (F13) shared with Home.
- *Goal-name privacy* (`e1d3c90`) — goal tiles were wired into context deliberately *without*
  names; F114 is the standing rule.
- *Week-vs-check terminology* (`836921d`) — context lines hardcoded "week" regardless of pay
  schedule until routed through `payPeriodUnit`; date mentions widened for larger pay periods.
- *New Job Season mechanism fabrication* (2026-07-25) — asked "tell me about job loss mode,"
  Coach invented a plausible-sounding auto-trigger ("activates automatically when your Income
  panel shows zero or negative income") that doesn't exist anywhere in the app. Root cause: a
  variant of D1, but for **static feature knowledge, not a computed context line** —
  `coachFeatureGuide.js` had a `runwayDays` *data point* wired in (`aiContext.js:199-200`) but
  zero prose describing the feature itself, so the model filled the gap with an invented
  mechanism instead of admitting it didn't know. The real mechanism (`NewJobSeasonEntry.jsx`,
  `active-systems.md` §10): the user deliberately switches it on via Life Events → "Lost My
  Job," never automatically off a low/zero paycheck. Fix: `coachFeatureGuide.js` now carries a
  short, plain "## New Job Season" section stating the real trigger and exit path, plus an
  explicit instruction to keep answers on this topic brief — test-fenced in
  `coachFeatureGuide.test.js`. **Generalized rule:** a data point wired into `buildCoachContext`
  (F113) is not a substitute for the corresponding feature description in
  `coachFeatureGuide.js` — if Coach can be asked "how does X work" about a feature whose data
  reaches the context block, that feature needs its own guide paragraph before the data point
  ships, not after a live fabrication surfaces one.
- **Both F24 runway quarantines, closed** (`3267286`, 2026-07-22) — 1) `estimateRunwayDays`
  (`coachTriggers.js`), the second runway formula that ignored `newJobSeasonCashOnHand`/job-hunt
  income and always ran ≤ the real runway, was deleted outright; `CoachNetWorthCard.jsx` now
  calls `computeNewJobSeasonRunway()` directly. 2) `runwayDays` is now actually threaded into
  `AskCoachPanel` — `App.jsx`'s `coachRunwayDays` (using the real `newJobSeasonIncludeBenefits`
  toggle) feeds `aiContext.js`'s New Job Season context line, which no longer renders the bare
  `"New Job Season: active"` string. New shared `resolvePrimaryRunwayDays()`
  (`newJobSeasonRunway.js`) is what keeps all three call sites (two panels + Coach) from
  independently drifting on which of the with/without-benefits figures is "the" runway.
  **This entry itself was stale for three days** — the *New Job Season mechanism fabrication*
  precedent immediately above was logged 2026-07-25 still citing both quarantines as open,
  three days after `3267286` closed them; caught during an unrelated New Job Season
  documentation investigation on the same date. Full write-up: §8.4 (T2 Home Panel pass).

**Standing findings from this pass:** none new filed. Both former quarantines above are
closed and converged on the same Spine-A function (`computeNewJobSeasonRunway`) — Spine A's §2.4
now marks its own pointer closed too. The `coach_chats` layer (F116) is no longer dormant —
wired 2026-07-25 per F123, which is now the live entry for its eager-save/gate/RLS shape.
No further D5 corrections owed this pass beyond the quarantine staleness just corrected above
— `active-systems.md` §6 already documents the grounding pattern and was reconciled during
the surface passes.

---

## 22. Spine E — Design System & Motion Drift Map

**Pass date:** 2026-07-20 (spine pass). Numbering continues (F117).
**Deliberately thin.** T10 (§17, F88–F95) *is* substantially this spine — it mapped the
`@theme` tokens, press/fold motion, `MetricCard`, `LiquidGlass` whitelist, swipe primitives,
PWA flow, and input standards, all with full IF/THEN checks. This section is the **authority
statement plus a reverse index**; it does not re-map what T10 already owns. Per the handoff:
a thin honest spine beats a duplicated one.

**Scope:** `index.css` (`@theme`), `ui.jsx`, `LiquidGlass.jsx`, `hooks/useSwipeStack.js`,
animation rules — all mapped in §17. New here: the CLAUDE.md UI-standards tables and
`docs/authority-design-system` as **enforceable spec**, not just prose. Absorbs
active-systems §1, §16 (primitives).

**Authority statement — the six invariants this spine guards (all enforced in §17):**
1. **No raw hex for accent/green/red** in components — reference `@theme` tokens (F88).
   Standing debt: `WeekConfirmModal`/`LoginScreen`/`ProfilePanel` carry untokenized hex
   (TODO §10 + CLAUDE.md Known Cleanup).
2. **Pulse signal tokens** (`--color-signal-blue/purple/glow`) are Phase-2 AI-overlay only —
   never on Flow elements (F88).
3. **Liquid Glass** only on `ALLOWED_PURPOSES` (`nav, pulse, modal, log-summary, phase-btn`) —
   never on primary MetricCards, tables, or buttons; DEV-only warn (F92).
4. **Motion:** press = `scale(0.97/0.94)` only, no bounce/spin/scale-up; all ≤500ms except the
   1200ms countup; `prefers-reduced-motion` nulls every `data-fold` animation (F89/F90/F91).
5. **Data honesty:** `InsightRow`/Pulse builders return `undefined` on insufficient data —
   signals are never fabricated (F91, shared with §8 F16).
6. **Numeric inputs:** string drafts, `parseFloat` at commit only; `iS` = 16px font (blocks
   iOS zoom) + 44px min-height (tap target); `lS` = 10px/2px uppercase labels (F95).

### 22.1 Block 1 — Critical inventory (what T10 scoped out)

**F117 · The UI standards as enforceable spec** — CLAUDE.md ("UI Component Standards",
"Color Tokens", "Animation Rules"), `docs/authority-design-system` (Flow color table + motion
rules) — **[G]**
T10's F88–F95 map the *code*; the standards *text* is the **spec that code is measured
against** — the color-token table, the button pattern (CANCEL/SAVE recipes), the entrance/
countup caps, the numeric-input standard. Under the §5 covenant these move with the code:
a token value change, a new animation, or a new primitive must update the standards tables in
the same PR, or the next author builds against a false spec. `docs/authority-design-system` is
the design *vision* (Flow dominates, Pulse assists, Momentum-not-XP, the pillar roadmap) that
CLAUDE.md operationalizes — its concrete claims (the "live in `src/index.css`" Flow color
table) are subject to D5 like any other doc.
> **IF** an `@theme` token, animation value, or primitive contract changes, **THEN** update
> CLAUDE.md's matching table **and** (if it restates the value) `docs/authority-design-system`
> in the same PR — F88/F91/F95's IF/THENs already require this for the code side; this entry
> extends it to the two spec docs so all three stay one truth. Check: grep the changed token/
> value across CLAUDE.md and `docs/authority-design-system`; the §5 covenant. **IF** a new
> component uses a Pulse signal token outside the AI overlay, or Liquid Glass outside
> `ALLOWED_PURPOSES`, **THEN** that's the reserved-token/whitelist violation F88/F92 exist to
> catch — this spine's job is that those two rules have exactly one home each.

**Reverse index — surface F-entries that ARE this spine (do not restate):**
F88 (`@theme` tokens + Pulse reservation), F89 (press feedback / `Pressable`), F90 (fold
motion + reduced-motion kill switch), F91 (`MetricCard`/`InsightRow` data-honesty), F92
(`LiquidGlass` `ALLOWED_PURPOSES`), F93 (swipe/snap primitives), F94 (PWA update/install),
F95 (`iS`/`lS` input standards).

### 22.2 Block 2 — Drift trigger map (cross-boundary)

This spine's cross-boundary triggers are enumerated in §17.2 (the T10 trigger map) — every
row there is a Spine-E row. The only additions this pass surfaces are the two spec-doc
couplings:

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| Any `@theme` token value/name | §17.2's debt-file row **plus** CLAUDE.md Color Tokens table **plus** `docs/authority-design-system` Flow color table | Grep the token + its raw hex across `src/`, CLAUDE.md, and the design-system doc | D5 |
| Animation value / new primitive contract | §17.2's `MetricCard`/press/fold rows **plus** CLAUDE.md Animation Rules + UI Component Standards text | The §5 covenant — code and both spec docs in one PR | D5 |
| (everything else) | See §17.2 in full — not duplicated here | Per §17's procedures | — |

### 22.3 Block 3 — Gate matrix

The design-system gate matrix is §17.3 (motion preference, display context, build mode, SW
update state, card interactivity, insight-data sufficiency). Not duplicated. The one G-fact
worth restating as the spine's headline: **`prefers-reduced-motion` must cover every new
`data-fold` variant** (F90) and **DEV-only** LiquidGlass enforcement means the whitelist is
"only as strong as DEV-time discipline" (F92) — prod silently accepts any purpose.

### 22.4 Block 4 — Case law & findings

**Precedents:** all in §17.4 (PWA auto-update mid-session reload `8c50ff0`; press-feedback
unification `4ca9437`; fold-close-as-fade `bb35349`; iOS hit-test portals `c0224ce`;
ALLOWED_PURPOSES doc lag). Not duplicated.

**Standing findings from this pass:**
1. **D5, corrected in this pass:** `docs/authority-design-system`'s "Flow Color Tokens (live
   in `src/index.css`)" table carried stale hex — `--color-bg-base #07130F`, `bg-surface
   #0D1F19`, `bg-raised #123027`, and the gradient stops — while `index.css` has `#05100c`/
   `#112c1f`/`#163828`/`#091a11→#05100c`. The table also omitted `--color-deduction` (the
   active red token) and mislabeled `--color-red` as the live danger color when it is the
   unused split-test value. Corrected to match `index.css` in this commit — the table now
   reflects the real Flow palette. (CLAUDE.md's token table was already correct.)
2. No DW defects. The untokenized-hex debt (three files) is already owned (TODO §10 + Known
   Cleanup, cited in F88); the DEV-only whitelist enforcement is a discipline boundary noted
   in F92, not a defect. This spine adds no new queue items — its risk surface is fully
   covered by T10's F88–F95 plus the spec-doc covenant above.

---

## 23. Spine F — Admin Diagnostic Toolkit Drift Map

**Pass date:** 2026-07-20 (spine pass — the closing section). Same anchor + method rules as
§7; numbering continues (F118+).
**Git-history note:** the toolkit is built inline in `App.jsx` (the tool sheet, Week Inspector
modal, Live State Inspector pill) rather than as standalone components; its Phase-2 spec lives
in `docs/admin-toolkit-todo.md`. Its defining property for the Warden: **the toolkit is the
Warden's own instrument panel** — nearly every L-entry's "Check:" procedure in this doc
executes *through* one of these tools. A change that breaks a tool doesn't just lose a feature;
it **blinds every drift check that depends on it**, which is why a broken tool gets L-grade
scrutiny even though the toolkit itself is a Gateway.

**Scope:** the 8 Phase-1 `isAdmin` tools in `App.jsx` (Lock Date, Reopen Last Check-In, Force
Sync, Config Raw View, DB Row Viewer, Tax Weeks Grid, Live State Inspector, Week Inspector),
the per-entry impact breakdown in `LogPanel.jsx`, and the unbuilt Phase-2 `isOwner` tools
(`docs/admin-toolkit-todo.md`). Absorbs active-systems §13.

### 23.1 Block 1 — Critical inventory (spine-internal machinery)

**F118 · Toolkit integrity invariant + the `effectiveToday` simulation fork** — `App.jsx:863–865`
(`effectiveToday = (isAdmin && tempLockDate) ? tempLockDate : today`) + the tool reads below — **[G]**
`effectiveToday` is the **simulation spine**: the Lock Date tool overrides it, and it flows
into `isPayPeriodPast` (F25), the auto-confirm/eligibility chain (F26/F27), `taxDerived`'s
past/future split (F28), `futureWeeks`, `currentWeek`, `fundedGoalSpend`, and every displayed
"now"-relative number. This is what makes Lock Date a *general* date simulator, not a cosmetic
label. **Hard boundary:** `getEntitlement` and the Stripe/subscription surfaces are called with
**real `new Date()`, never `effectiveToday`** (F53/F80 — a simulated date must never grant free
access or extend the hidden grace).
> **IF** a new "now"-derived number is added, **THEN** it should read `effectiveToday` (so Lock
> Date can simulate it) **unless** it's entitlement/billing (which must read real wall-clock —
> the F53/F80 rule). **IF** a tool's read source drifts from what it claims to show, **THEN**
> every drift check that "asks the user to run [tool]" is now reading a lie — DW-2 was the
> specimen: `taxDerived` (F28) *used* `effectiveToday` but its dep array omitted it, so the Lock
> Date tool's tax-simulation promise silently broke (fixed — see F28). **The instrument-panel rule:** any change
> to a tool's read path re-verifies every F-entry that names that tool in its "Check:" (the
> §9.3 registry is that index). Check: set Lock Date; Live Inspector's Effective Today +
> `extraPerCheck` + week idx all move together and match the Tax Weeks Grid / Week Inspector.

**F119 · Phase-2 `isOwner` pre-build warnings** — `docs/admin-toolkit-todo.md` Phase 2 — **[G]**
The unbuilt owner tools are **write-capable** and get L-grade scrutiny when built — they mutate
the exact fields the whole fiscal model hangs on. The prebuild landmines, each already flagged
in a surface F-entry:
- **Lock `firstActiveIdx`** (the nuclear field) — repositions the entire fiscal calendar
  retroactively (§7 F1/F2). The load-side sync only ever moves the boundary *earlier* (F67);
  an owner edit that moves it later deletes modeled income.
- **Tax Weeks Grid edit** — toggling `config.taxedWeeks` corrupts withholding math if misused;
  wizard re-run recomputes `taxedWeeks` (F5) while `pastWeekTaxStatusOverrides` survive (F50) —
  the owner tool must respect that survivorship split.
- **Bulk Week Confirmation Seeding / reset-all** — writing `weekConfirmations` to `{}`
  **re-arms the F26 auto-confirm seed effect**, which then bulk-stamps every closed week;
  "reset all confirmations" must account for this before it ships (F26's IF/THEN is the flag).
- **Config Raw JSON Apply / Snapshot-Restore** — same blast radius as every field combined;
  restore overwrites config+logs+expenses+goals in one write and must ride the eager-save/
  four-site contract (F110), not a bare `setState`.
> **IF** any Phase-2 tool is built, **THEN** it is an L-change (it writes truth): the `isOwner`
> flag gets the full F69 tier-flag checklist (migration + RLS + read map + write path), and
> each write tool inherits the eager-save pattern (Spine B) and the specific landmine above.
> **IF** the reset-confirmations tool is built without disarming F26, **THEN** it silently
> re-seeds the whole year. Check: `docs/admin-toolkit-todo.md`'s per-tool spec + the cited
> surface F-entry before writing a line.

**Reverse index — surface F-entries that wire/verify through the toolkit (do not restate):**
F25 (Lock Date hour-gate bypass in `isPayPeriodPast`), F26 (auto-confirm seed — the reset-all
landmine), F28 (`taxDerived` — DW-2 fixed, stale-dep no longer weakens Lock Date), F32 (Reopen Last Check-In —
DW-3 fixed), F57/F62 (per-entry breakdown — DW-5 fixed, now weekMeta-grounded), F68/F110 (DB Row drift
badge columns), F9/F10 (config-history line in DB Row viewer), F53/F80 (Live Inspector Sub
Phase — real-clock rule), plus the Week Inspector "Check:" in F15/F29/F96/F97/F98/F99/F103 and
the Live Inspector "Check:" in F14/F51.

### 23.2 Block 2 — Drift trigger map (cross-boundary)

| If X is updated/altered… | …check Y for drift | How (concrete procedure) | Class |
|---|---|---|---|
| `effectiveToday` fork or a tool's read source (F118) | Every F-entry naming that tool in its "Check:" (§9.3 registry) | Set Lock Date; the tool's displayed values move consistently and match a second tool | D4 |
| A tool stops reading the authoritative function it displays | The tool becomes a lying instrument — DW-2 (Lock Date/`taxDerived`) and DW-5 (per-entry breakdown) are the fixed specimens | The tool's value = the authoritative function's value on the same account | D1 |
| A new persisted field (F110) | DB Row drift-badge column list — the 4th of the four sites | DB Row Fetch shows the new column in the drift comparison | D3 |
| `getEntitlement`/subscription surfaces | Must stay on real `new Date()`, never `effectiveToday` (F53/F80/F118 boundary) | Live Inspector Sub Phase unaffected by Lock Date; billing card uses wall-clock | D4 |
| Week-object shape (F97) / `computeNet` (F98) | Week Inspector displays the object + Net Lookup verbatim — it must render every field | Tap a week; Pay + Net Lookup sections show the real fields, no `undefined` | D1 |
| `weekConfirmations` ever written to `{}` (Phase-2 reset, F119) | F26 auto-confirm seed re-arms and bulk-stamps | Any reset tool must guard the seed's emptiness check first | D2 |
| Config-history row shape (F9/F10) | DB Row viewer's config-history line ("N snapshots · latest…") | After a sensitive edit, the line shows source + date + changed fields | D5 |

### 23.3 Block 3 — The instrument registry (tool → what it reads → which F-entries verify through it)

The Spine-F deliverable: each tool, its read source, and the drift checks that depend on it.
A change that breaks the "reads" column blinds every entry in the "verifies" column.

| Tool | What it reads | F-entries that verify through it |
|---|---|---|
| **Lock Date** (`effectiveToday` override) | `tempLockDate` → `effectiveToday` (F118), fed into F25/F26/F27/F28/futureWeeks | F25 (hour-gate bypass), F26/F27 (eligibility sim), F28 (tax split — **DW-2 fixed**, `remainingTaxedChecks` and the dep array both honor it now) |
| **Reopen Last Check-In** | `reopenableWeekIdx` + `weekConfirmations[idx]` + its spawned log entry | F32 (**DW-3 fixed**: deletes now eager-save), F26 (projections independent of confirmations premise) |
| **Force Sync** (push/pull) | `handleForcePush`/`handleForcePull` — flush/reload `latestPersistedStateRef` | Any save-path check (Spine B F105/F106); before/after a save bug |
| **Config Raw View** | full `config` JSON | F7 (three-way sensitive-field audit), F43/F50 (tax elections), F49 (benefit config) |
| **DB Row Viewer** | raw `user_data` row + `updated_at` + drift badge (in-memory ≠ DB per column) + config-history line + Coach Chats line (2026-07-25, F123) | F67/F68/F110 (drift-badge = 4th save site), F9/F10 (history line), F34/F46 (edit captured), F123 (Coach Chats count/breakdown — reads `loadCoachChats()` directly, a separate table from `user_data`, so its own fetch call in `handleFetchRow`, not a `user_data` column), **DW-6 fixed** (`ptoGoal` now eager-saves; no more drift-badge exposure) |
| **Tax Weeks Grid** | `taxedWeeks` (teal/dark) + `pastWeekTaxStatusOverrides` (red dots) + current-week border | F28 (schedule vs remediation), F50 (override writers), F104 (liability inputs) |
| **Live State Inspector** | ~16 live values: `effectiveToday`, week idx, `extraPerCheck`, `totalGap`, `taxedWeekCount`, `weeklyIncome`, `freedomAllowancePerWeek`, `projectedAnnualNet`, Sub Phase/Trial/Access Ends… | F14 (`weeklyIncome`), F28 (`extraPerCheck`/`totalGap`), F51 (`freedomAllowancePerWeek`), F53/F80 (Sub Phase — real clock), F113 (Coach numbers cross-check) |
| **Week Inspector** | one week object verbatim: schedule, pay (`grossPay`/`taxableGross`/deductions/401k), live `computeNet`, net lookup (baseNet/adjustment/spendable), confirmation record, log entries | F15 (prev-week net), F29 (net tiers), F57 (per-entry vs hero), F58 (401k match), F96/F97/F98 (week shape/net), F99 (DHL rotation), F103 (loan) |
| **Per-entry breakdown** (LogPanel chevron) | per-event `calcEventImpact` output, via `resolveEventWeekMeta` | F57/F62 (**DW-5 fixed**: matches the hero-card aggregates) |

**Gate matrix (who sees the toolkit):**

| Dimension | Cells | Expected behavior |
|---|---|---|
| `isAdmin` | false / true | true: tool sheet (mobile nav Tools icon), Week Inspector on row tap, Reopen, Live pill, per-entry chevron; false: none render |
| `isOwner` (future) | false / true | true (never grantable via UI): Phase-2 write tools (F119); false: Phase-1 read/sim tools only |
| Lock Date | unset / set | set: `effectiveToday` drives all "now"-relative reads (F118); **billing stays real-clock** (F53/F80) |
| Tool integrity | tool reads authoritative fn / tool has drifted | drifted = the instrument lies (DW-2, DW-5 — both fixed) — an L-grade defect despite the toolkit being a Gateway |

### 23.4 Block 4 — Case law & findings

**Precedents (fixed — cite, don't relearn):**
- *401k match display bug* (`$14.96 match with `k401MatchRate: 0`) — isolated *by* the Week
  Inspector (CLAUDE.md Week Inspector notes); the tool doing its job as an instrument.
- *`ALLOWED_PURPOSES` / count drift* and other doc lags — surfaced because the tools exposed
  the real state; the toolkit is how many D5s in this investigation were caught.

**Standing findings from this pass:** none new filed. Three DW items were
**tool-integrity defects** — the toolkit's own instruments lying — and are restated here so the
"a broken tool blinds every check" stance is concrete:
1. **DW-2 — fixed.** `taxDerived`'s stale memo dep (F28) meant the **Lock Date** tool's tax
   simulation didn't recompute when the lock changed; the instrument silently disagreed with
   the Tax Weeks Grid it's meant to be cross-checked against. Also fixed the accompanying
   design gap — `remainingTaxedChecks` now honors `effectiveToday` too, per F118's own rule
   that only entitlement/billing gets the real-clock carve-out.
2. **DW-3 — fixed.** **Reopen Last Check-In** (F32) deleted without an eager save; the tool
   could lose its own mutation on a backgrounded tab. Now computes both next values
   synchronously and eager-saves them alongside the `setState`s.
3. **DW-5 — fixed.** The **per-entry breakdown** (F62) was weekMeta-less, so the admin's own
   event-impact instrument could disagree with the hero cards it's used to verify — "the
   diagnostic tool the last liar in the room" (F62's phrasing). Now grounded via
   `resolveEventWeekMeta`, same as every other `calcEventImpact` caller.
No new defect surfaced; the Phase-2 landmines (F119) are pre-build warnings, not live bugs (the
tools don't exist yet). No D5 corrections owed — CLAUDE.md's Admin Diagnostic Toolkit section
and active-systems §13 both describe the tools accurately; this section maps how the Warden
*uses* them, which is new coupling information, not a restatement.
