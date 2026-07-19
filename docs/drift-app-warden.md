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

- [ ] **T1 — Setup Wizard**
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
