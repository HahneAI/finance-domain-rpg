---
name: frontend-design
description: Process and review checklist for building NEW screens in the Authority Finance app (new panels, cards, modals, empty/error states, UI copy) inside its fixed design system. Adds a plan→review→build→verify→report loop, hierarchy and copy guidance, a phone-width render check and a required Drift Warden line. Never invents a palette or typeface; never restyles existing panels unless asked.
license: Complete terms in LICENSE.txt
---

# Frontend Design — Authority Finance edition

The visual identity is **already decided**. This skill does not design a look; it makes new UI *excellent inside the system* and makes sure nothing slips. **The rules themselves live in `.claude/CLAUDE.md` — do not restate or override them here.** Read these sections of it before you start: *UI Component Standards* (primitives, layout, button pattern, numeric inputs, animation rules), *UI Design System* (tokens, fonts, `.text-*` scale), *Persistence — Eager Save Pattern* (incl. the `readOnly` gate), *Employer Preset Naming Convention*, *Testing* (both blind spots).

Run only when asked. Never touch existing panels, `HomePanel.jsx` or `App.jsx` as a "design improvement" unless the user explicitly asked. Do not commit or push unless asked.

## Rules that are NOT in CLAUDE.md (skill-specific)

1. **Liquid Glass** (`LiquidGlass.jsx`) only for its whitelisted `purpose` values — `nav`, `pulse`, `modal`, `log-summary`, `phase-btn` — never on primary `MetricCard`s, tables or buttons.
2. **Reduced motion must be switchable.** A new entrance/animation either (a) reuses a class that already has the override — `adlib-fade-in` next to an inline `fadeSlideUp` is the sanctioned pairing (its override is `animation: none !important`; verified in a browser: computed `animation-name` becomes `none`), or (b) gets its own class plus an `@media (prefers-reduced-motion: reduce) { .your-class { animation: none !important; opacity: 1; } }` block beside the keyframes in `src/index.css`. Bare inline `animation` with no override class is the one forbidden shape. (`MetricCard`'s own inline `fadeSlideUp` predates this rule — reusing `MetricCard` is fine, don't copy the pattern.)
3. **Symbol + input stay together.** In sentence-style or label/value layouts, keep a currency symbol or unit and its input in one `white-space: nowrap` unit. A `$` wrapped away from its blank at phone width is invisible to unit tests.
4. **Claim Dates are never computed in a design** — they come from `resolveGoalFinishInfo()`. The `HomePanel` goal card body is duplicated verbatim between its mobile and desktop branches (warden §8 F177): edit as a pair.
5. **Every dollar value on an Upkeep summary row** multiplies by `perCheckFactor` with no exceptions (warden §10 F163).
6. **Pulse tokens (`--color-signal-*`) are Phase 2** — never on Flow elements; never fabricate Pulse signals.

## What this skill adds

### Start from the person and the job
Name the screen's one primary job and its audience before drawing. The audience manages real paychecks, bills and goals — often on a phone, often an hourly worker. Use real content via the existing source-of-truth functions, never invented figures.

### Hierarchy and structure
- One memorable element per screen; everything else quiet. Spend emphasis (size, teal, countup) once.
- Structure encodes information: borders, dividers, numbering only when the content is a real sequence or hierarchy. Don't chop everything into identical cards.
- Avoid template tells: all-caps eyebrow over every heading (existing `lS`/`SH` are the sanctioned exception), dot-joined meta strings, a trailing `→` on links, gradient washes, decorative icons.
- Prose lines under ~80 characters; this app is mostly numeric, so favor scannable label/value pairs.

### Copy
- Write from the user's side; plain verbs, sentence case, active voice. A CTA says exactly what happens ("Save changes", not "Submit") and keeps that name through the confirmation.
- Errors say what went wrong and how to fix it, and never apologize. Empty states point at the next action. Financial copy is specific and non-judgmental. Nothing that implies advice or a projection unless it traces to an existing computed value.

### Quality floor
Mobile-first PWA: check at 390px and desktop, 16px side gutters, no horizontal scroll, visible keyboard focus, accessible names on every control, contrast on dark surfaces, 44px touch targets.

## Process

1. **Brief** — one sentence each: the screen's job, who uses it, which primitives/panels it sits beside. If it lands in or beside a Drift-Warden-mapped area (wizard, the 5 panels, auth, login, paywall, fiscal math, persistence, entitlements, AI context, design system, admin), read that section's trigger map in `docs/drift-app-warden.md` now.
2. **Plan inside the system** — name the primitives and tokens; ASCII wireframe (mobile first, then desktop); list the copy strings. No palette, no fonts, no new components unless an existing primitive genuinely can't do the job (say why).
3. **Review the plan** against `CLAUDE.md`'s rules and the six rules above; revise anything generic or rule-breaking, and say what you changed.
4. **Build** with tokens, `.text-*`, shared primitives and the eager-save pattern. Mind CSS specificity.
5. **Verify** — `npm run lint` and `npm run test:run` (read the console for HTML-nesting warnings); `npm run build` for anything non-trivial (Vitest never runs the React Compiler); then **render it at 390px and desktop in a real browser** (Playwright + the preinstalled Chromium; fonts from Google may be blocked in the sandbox, so judge spacing and wrapping, not typeface) and look at the screenshot. With `prefers-reduced-motion: reduce`, confirm the animation computes to `none`.
6. **Report** — what you made; tokens/primitives used; what you left alone; suggestions not applied. **Always include a "Drift Warden entries consulted" line** naming the `docs/drift-app-warden.md` sections you actually read, or "none applicable" with the reason — silence is not allowed. State how you handled reduced motion.
