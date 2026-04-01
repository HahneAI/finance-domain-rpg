# Codex Memory

## Agent Routing Reference

| Tag | Meaning |
|-----|---------|
| `[CC]` | Claude Code — multi-file, reasoning, or pipeline-touching work |
| `[CODEX]` | Codex — scoped, spec-able, single component or isolated refactor |
| `[CODEX?]` | Probably Codex — verify scope before delegating |

**Before any `[CODEX]` handoff:** confirm this file is current. CC updates it after any session touching architecture, state shape, or core logic.

---

## Test Infrastructure (read before running or writing tests)

**Runner:** Vitest 4. Config: `vitest.config.js` (Vitest auto-prefers this over `vite.config.js`).

**Correct command to run tests:**
```bash
npm run test:run
```
Do NOT use `npm run test -- --runInBand`. `--runInBand` is a Jest-only flag; Vitest silently ignores it and adds no value here.

**Reporter:** `verbose` is set in `vitest.config.js`. This is intentional — Vitest 4's default reporter misreports collection errors as "no tests / 12 failed" even when most tests ran fine. Always interpret results from the per-file and per-test lines, not just the summary line.

**Why `vitest.config.js` is separate from `vite.config.js`:**
`vite.config.js` loads `@tailwindcss/vite`, `@rolldown/plugin-babel`, and LightningCSS. All three depend on native `.node` binaries that fail with `spawn EPERM` in sandboxed environments. `vitest.config.js` omits all three — only `@vitejs/plugin-react` is loaded for tests.

**Updating snapshots:** After intentional changes to `DEFAULT_CONFIG` key order or values, run:
```bash
npx vitest run -u
```

---

## 2026-03-28 — Benefits/Deductions math wiring audit (first entry)
- Reviewed `buildYear()` and `computeNet()` to map how wizard deduction fields flow into taxable gross and take-home pay.
- Current pre-tax deduction pool in `buildYear()` only includes `cfg.ltd` and `k401kEmployee`; insurance premiums (`healthPremium`, `dentalPremium`, `visionPremium`, `stdWeekly`, `lifePremium`) and account contributions (`hsaWeekly`, `fsaWeekly`) are collected in config but not applied.
- `benefitsStartDate` is captured in wizard/profile, but no date gate currently controls benefit/HSA/FSA deduction activation in `buildYear()`.
- `otherDeductions` are collected as repeatable weekly rows, but `computeNet()` currently subtracts only `cfg.ltd + w.k401kEmployee`, so freeform entries do not affect net pay.
- Because `taxableGross` feeds federal/state withholding and annual taxable rollups, these omissions currently overstate taxable income and take-home projections relative to configured benefits.

## 2026-03-28 — Goals timeline surplus/feed audit
- Reviewed the goals forecast path end-to-end: `App.jsx` builds `futureWeekNets` from per-week `computeNet()` output (minus optional paycheck buffer), then `BudgetPanel` passes those nets into `computeGoalTimeline()`.
- Current timeline sequencing is driven by **per-check surplus**, not a flat weekly number: each loop week uses `(weeklyNets[weekOffset] - targetedFutureEventDeduction - effectiveNonTransferSpend - smearedPastLoss + smearedGain)` before funding goals in list order.
- Past log losses are intentionally smeared across remaining weeks, while current/future-week losses are applied to their exact `week.idx` via `futureEventDeductions`; this is the key split that controls where dips appear in the goal bar.
- `wN` fallback for unfunded goals still uses an average-net approximation (`remaining / avgNet`) when no completion week is found, so partial-year visual extrapolation can diverge from true week-by-week surplus under volatile checks.
- Current goal bar rendering in `BudgetPanel` is week-index based (`Wk {nowIdx}…Wk 52` with `% width = sW/wN over weeksLeft`), so the TODO “monthly notated bar with 4-week sub-divisions” will require a presentation-layer scale remap without breaking the existing weekly surplus engine.

## 2026-03-30 — Authority OS rebrand + design system alignment (Claude Code)

**Project renamed.** "Life RPG" → **Authority OS**. Finance app is now **Authority Finance (A:Fin)**. Other pillars: A:Intel, A:Perf, A:Legacy. Do not use "Life RPG" in new code or comments.

**Design system: Flow + Pulse (dual-layer).**
- Flow = live UI shell. Dark green surfaces, teal `#00c896` accent, Inter font. Already shipped.
- Pulse = Phase 2 intelligence overlay. Reserved tokens: `--color-signal-blue: #5B8CFF`, `--color-signal-purple: #7C5CFF`. Not yet in `index.css`. Do not use these on Flow UI elements.
- Progression term is **Momentum** — no XP, no levels, no gamification.

**Green token fix shipped.** `METRIC_STATUS.green.val` in `ui.jsx` was `--color-accent-soft` (#4ADE80 lime) — changed to `--color-green` (#22C55E). Rule is now: teal `#00c896` = interactive/identity, medium green `#22C55E` = positive financial values only. `--color-gold-bright` flash token updated from lime to `#33e0b0`.

**Reference docs updated — read these before working on the codebase:**
- `docs/active-systems.md` — verified operational summary of all 8 shipped systems (math, UX, data flow). Under 300 lines. Start here.
- `docs/authority-design-system` — Flow + Pulse color tokens, component rules, Insight Row spec, Momentum system.
- `docs/TODO.md` — prioritized backlog. Section 10 = design system migration items.
- `CLAUDE.md` (root) — live token table, status color semantics.
- `.claude/CLAUDE.md` — actual file structure, tech stack, component standards. Replaces all prior Life RPG config.

**CLAUDE.md is now accurate.** Old entries documented wrong hex values, DM Serif/DM Sans fonts, a phantom Express backend, and a monorepo structure that never existed. All corrected. Do not reference old gold `#c9a84c`, old green `#4caf7d`, DM Serif Display, or `frontend/backend/` directory paths.

**Known cleanup (low priority, do not block on):**
- `index.html` still loads DM Serif + DM Sans from Google Fonts — dead weight
- `index.html` title/PWA label still say "Finance RPG" / "2026 Financial Dashboard"
- `WeekConfirmModal.jsx`, `LoginScreen.jsx`, `ProfilePanel.jsx` have hardcoded hex colors — tokenization tracked in TODO §10

## 2026-03-28 — Goals timeline monthly/weekly refresh implemented
- Replaced the single continuous goal fill bar with a month-notated track in `BudgetPanel`: timeline now builds month segments from `futureWeeks`, applies subtle 4-part visual subdivisions per month, and labels each month on the goal card.
- Goal funding fill now renders as **discrete weekly chunks** (one chunk per funded/projection week between `sW` and `sW + wN`), preserving week-level surplus sequencing from `computeGoalTimeline()` while improving mid-month stop fidelity.
- The update is visual-only for scale/readability: no changes were made to `computeGoalTimeline()` surplus math or goal funding order.

## 2026-04-01 — Codex backlog + tooling guardrails
- Upcoming `[CODEX]` tracks (per now deleted `docs/codex-task-1…6`):
  1. **Profile tab auth flows** — finish change-email/password, destructive delete (via secure server route + Supabase admin API), and global sign-out, all surfaced in Profile tab.
  2. **Fiscal week roadmap** — unify week awareness (Week X of 52), auto-complete funded goals, weekly “worked vs projected” confirmations, and feed per-week nets directly into `computeGoalTimeline()`.
  3. **State tax audit** — classify all 50 states (none/flat/bracketed) and fix Missouri’s marginal brackets in the shared tax table + calculators.
  4. **DHL benefits pipeline** — ensure every preset payroll deduction (medical, dental, vision, LTD, STD, life, HSA/FSA, 401k, etc.) can be edited in Profile, flows through storage, and reduces pre-net pay immediately.
  5. **Tax plan relocation** — move tax strategy/planning sections out of Income tab config into Account › Tax Plan, reusing the existing form components/state.
  6. **Income weekly overview sticky header** — add a subtle pinned header row to the weekly chart/table without altering chart math.
- Vitest currently can’t run inside Codex because `vite`/`externalize-deps` tries to spawn a child process and Windows sandbox returns `EPERM`. All test runs need to happen on the host (or after relaxing sandbox) until Vite’s config can bundle without spawning.
