---
name: frontend-design
description: Checklist for building NEW screens in the Authority Finance app (panels, cards, modals, empty/error states, UI copy) inside its fixed design system. Plan, build, then verify with a real 390px render and report the Drift Warden entries consulted. Never invents a palette or typeface; never restyles existing panels unless asked.
license: Complete terms in LICENSE.txt
---

# Frontend Design — Authority Finance checklist

The look is already decided. The rules live in `.claude/CLAUDE.md` (UI Component Standards, UI Design System, Eager Save Pattern, Testing); follow them and don't restate them. Never restyle existing panels, `HomePanel.jsx` or `App.jsx` unless asked. Don't commit or push unless asked.

## Gotchas CLAUDE.md doesn't cover
1. **Liquid Glass** only for `purpose` = `nav`, `pulse`, `modal`, `log-summary`, `phase-btn` — never on primary `MetricCard`s, tables or buttons.
2. **Reduced motion must be switchable.** Reuse `adlib-fade-in` with inline `fadeSlideUp` (its override is `animation: none !important`), or give a new class its own `@media (prefers-reduced-motion: reduce)` override beside the keyframes in `src/index.css`. Bare inline `animation` with no override class is the one forbidden shape.
3. **Keep a `$` or unit and its input in one `white-space: nowrap` unit** — wrapping apart at phone width is invisible to unit tests.
4. **`perCheckFactor` scales averaged/summary values** (Upkeep summary cards, warden §10 F163), **not actual amounts due.** A real bill, paycheck or balance is shown exactly as given; only the period wording ("week"/"check") changes. If unsure whether a number is an average or an actual, say so in the report.
5. **Claim Dates come from `resolveGoalFinishInfo()`** — never computed in a design. The `HomePanel` goal card body is duplicated for mobile and desktop (warden §8 F177): edit as a pair.
6. **Pulse tokens (`--color-signal-*`) are Phase 2** — never on Flow elements.

## Process
1. **Brief** — the screen's one job, who uses it (often an hourly worker on a phone), which primitives/panels it sits beside. If it lands in or beside a Drift-Warden-mapped area, read that section's trigger map in `docs/drift-app-warden.md` now.
2. **Plan** — name primitives and tokens; sketch mobile first; list the copy. No new palette, fonts or components unless an existing primitive can't do the job.
3. **Review the plan** against CLAUDE.md and the gotchas above; fix what's generic or rule-breaking.
4. **Build** with tokens, `.text-*`, shared `ui.jsx` primitives and the eager-save + `readOnly` pattern.
5. **Verify** — `npm run lint`, `npm run test:run` (read the console for nesting warnings), `npm run build` if non-trivial (Vitest never runs the React Compiler), then **render at 390px and desktop in the preinstalled Chromium and look at it** (Google Fonts may be blocked; judge spacing and wrapping). Check reduced motion computes to `none`.
6. **Report** — what you made, what you left alone, suggestions not applied, how reduced motion was handled, and **a "Drift Warden entries consulted" line** (sections actually read, or "none applicable" and why).

## Design judgment
- One memorable element per screen; the rest stays quiet. Borders, dividers and numbering only when the content is a real hierarchy or sequence.
- Skip template tells: all-caps eyebrow over every heading (existing `lS`/`SH` excepted), dot-joined meta strings, trailing `→`, gradient washes, decorative icons.
- Copy: the user's words, plain verbs, sentence case. A CTA says exactly what happens and keeps that name through its confirmation. Errors say what failed and how to fix it, never apologize. Empty states point at the next action. No advice or projections that don't trace to an existing computed value.
