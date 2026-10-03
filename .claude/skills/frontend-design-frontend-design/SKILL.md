---
name: frontend-design
description: Design guidance for NEW screens and layout/copy decisions in the Authority Finance app, working strictly inside its fixed design system (Flow tokens, two-font system, .text-* scale, motion rules). Use for new panels/cards/modals, hierarchy, layout, empty/error states and UI copy. Never invents a new palette or typeface; never restyles existing panels unless asked.
license: Complete terms in LICENSE.txt
---

# Frontend Design — Authority Finance edition

This repo's visual identity is **already decided**: the Flow shell (dark green-black surfaces, teal accent), Titillium Web + Rajdhani, a fixed token set and a fixed motion vocabulary. The upstream version of this skill tells you to invent a distinct palette and typefaces per brief. **Here that is forbidden.** Your job is to make new UI *excellent inside the system* — clear hierarchy, honest structure, specific copy, accessible and mobile-first — not to re-skin it.

Run only when asked. Do not touch existing panels, `HomePanel.jsx`/`App.jsx`, or any Drift-Warden-mapped area as a "design improvement" unless the user explicitly requested that change. Do not commit or push unless asked.

## Hard rules (override anything else in this file)

1. **Colors: tokens only.** Use `--color-*` from `src/index.css` `@theme`; never raw hex for accent, green or red. Teal = accent/CTA, green = positive/income, red = risk, `--color-deduction` = soft deduction rows, warning = attention. Status vocabulary: `green` ahead · `teal` attention/mixed · `red` behind. Do not propose a new palette, gradients-as-decoration, or the upstream "4–6 named hex values" step.
2. **Pulse tokens (`--color-signal-*`) are Phase 2** and reserved for the AI insight overlay — never on Flow elements. Never fabricate Pulse signals.
3. **Fonts: variables only.** `var(--font-display)` (Titillium Web) for headings/hero/large numeric emphasis; `var(--font-sans)` (Rajdhani) for everything else including every button, tab, chip and form field; `var(--font-mono)` only for read-only data display, never a form field. Never name a font family, never add a typeface.
4. **Type scale: the five `.text-*` classes** (`text-2xs` 11 · `xs` 12 · `sm` 13 · `base` 14 · `md` 15px) for all label/body copy. No raw inline `fontSize` for non-numeric text (`src/test/lib/textUtilityClassAudit.test.js` fails the suite on a new literal). Never wrap the `.text-*` block in `@layer`. Heading weights/spacing: hero 900 / 0.04em / 1.15, secondary 800 / 0.02em / 1.15; not for numeric emphasis.
5. **Use the shared primitives** from `src/components/ui.jsx` before building new ones: `MetricCard`/`Card`, `NT`, `VT`, `SmBtn`, `SH`, `iS`, `lS`, `PanelHero`, `SectionHeader`. Layout: card gap 12px, section `marginBottom` 20px, card padding `18px 16px` (static) / `16px 18px` + `minHeight: 88px` (interactive). Buttons: CANCEL = bg-raised/text-secondary/border-subtle, radius 12px; SAVE = teal/green fill, bg-base text, radius 12px.
6. **Liquid Glass** (`LiquidGlass.jsx`) is only for its whitelisted `purpose` values (`nav`, `pulse`, `modal`, `log-summary`, `phase-btn`) — never on primary MetricCards, tables or buttons.
7. **Motion rules are fixed.** Entrance stagger = `entranceIndex` → `fadeSlideUp` 400ms, 80ms/card, capped 400ms; countup = `rawVal` 0→target 1200ms; value flash teal 150ms. **No bounce, no spin, no scale-up on mount; press = `scale(0.97)` only; everything ≤ 500ms except countup.** (The upstream "avoid fade-and-slide-up entrances" advice does **not** apply — that *is* the house entrance. Still: no extra decorative motion beyond it.) **Reduced motion is part of the rule, not a nicety:** a new entrance/animation must be switchable off by `prefers-reduced-motion`. Either (a) reuse an existing class that already has the override — `adlib-fade-in` alongside an inline `fadeSlideUp` is the sanctioned pairing (its override is `animation: none !important`, verified in a browser with reduced motion on: computed `animation-name` becomes `none`), or (b) give the element its own class and add an `@media (prefers-reduced-motion: reduce) { .your-class { animation: none !important; opacity: 1; } }` block next to the keyframes in `src/index.css`, as `.wc-modal-in` and `.coach-focus` do. Bare inline `animation` with **no** override class is the one forbidden shape. (Existing inline `fadeSlideUp` in `ui.jsx`'s `MetricCard` predates this rule; reusing `MetricCard` is fine, but don't copy the inline pattern.)
8. **Numeric inputs:** never coerce on `onChange`; string draft state (`field ?? ""`), `parseFloat` at commit; required fields use an `attempted` flag → red label + border + `↑ Required`. Any new Save/Confirm/Add/Delete control must call the matching eager-save callback with the same synchronously-computed value passed to `setState` (`saveConfigNow`, `onSaveGoalsNow`, `onSaveExpensesNow`, `onSaveLogsNow`, `onSavePtoGoalNow`); components with a `readOnly` (paywall) gate must no-op the new callback too.
9. **Vocabulary:** the Budget panel is **Upkeep** in all user-visible copy; goals lead with the **Claim Date** (`CLAIM DATE`, `✓ CLAIM IT`). Source of every Claim Date is `resolveGoalFinishInfo()` — never compute one in a design. Employer gating uses `isEmployerDHL` / `isBaseUser`; copy says "base user", not "non-DHL".
10. **Mapped areas need the drift check.** If a new screen lands in or beside a Drift-Warden-mapped area (wizard, the 5 panels, auth, login, paywall, fiscal math, persistence, entitlements, AI context, design system, admin), read that section's trigger map in `docs/drift-app-warden.md` first and say which entries you consulted. The goal card body is duplicated verbatim between the mobile and desktop branches of `HomePanel` — edit as a pair.
11. **Never break React rules the suite can't catch:** no block-level (`<div>`) children inside a `<p>`; keep `"use no memo";` where it exists; no `api/` additions (12/12 Vercel cap).

## What this skill is still for (within those rules)

### Start from the person and the job
Name the screen's one primary job and its audience before drawing anything. The audience is a person managing real paychecks, bills and goals — often on a phone, often a DHL or other hourly worker. Real content drives the layout: use their actual figures and labels (via the existing source-of-truth functions), not lorem ipsum or invented numbers.

### Hierarchy and structure
- One memorable element per screen; everything around it quiet. Spend emphasis (size, teal, countup) once.
- Structure encodes information: use borders, dividers, numbering or step markers only when the content is genuinely a sequence or hierarchy. Don't chop everything into identical cards — vary weight by importance, using the existing `MetricCard` interactive vs static treatments.
- Avoid template tells that don't fit the brand: tracked-out all-caps eyebrow above every heading (the existing `lS`/`SH` styles are the sanctioned exception where the system already uses them), meta strings joined with `·`, a trailing `→` on every link.
- Line length under ~80 characters for prose; this app is mostly numeric, so favor scannable label/value pairs.

### Copy
- Write from the user's side: name things by what they do ("Paycheck buffer", "Claim Date"), not how they are built. Plain verbs, sentence case, active voice, one job per element.
- A CTA says exactly what happens ("Save changes", not "Submit"); the same action keeps one name through the whole flow, including its confirmation.
- Errors say what went wrong and how to fix it, and never apologize. Empty states point at the next action. Financial copy is specific and non-judgmental.
- Don't invent claims or figures. Anything that implies advice or a projection must trace to an existing computed value.

### Quality floor
Mobile-first (this is a PWA; verify at phone width, 16px side gutters, no horizontal scroll), visible keyboard focus, accessible contrast on the dark surfaces, accessible names on every control, `prefers-reduced-motion` respected via a class + `index.css` override (rule 7), 16px min input font to avoid iOS zoom (the shared `iS` already does this). In sentence-style or label/value layouts, keep a currency symbol or unit and its input in one `white-space: nowrap` unit — a `$` that wraps away from its blank at phone width is invisible to unit tests and only shows in a real phone-width render, so look at one.

## Process

1. **Brief** — one sentence each: the screen's job, who uses it, which existing primitives/panels it sits beside. If it affects a mapped area, do the drift check now.
2. **Plan inside the system** — name the primitives and tokens you will use; sketch the layout in an ASCII wireframe (mobile first, then desktop); list the copy strings. No palette, no fonts, no new components unless an existing primitive genuinely can't do the job (then say why).
3. **Review the plan** against the hard rules above and against the brief; revise anything that reads as a generic default or breaks a rule, and say what you changed.
4. **Build** with tokens, `.text-*` classes, shared primitives and the eager-save pattern. Mind CSS specificity (type selectors vs class selectors cancelling padding/margin).
5. **Verify** — `npm run lint` and `npm run test:run` (read the console for HTML-nesting warnings; `textUtilityClassAudit` must stay green). For anything non-trivial also `npm run build` (Vitest never runs the React Compiler) and look at it in a browser at phone width if the environment allows.
6. **Report** — what you made, which tokens/primitives you used, what you deliberately left alone, and any suggestion you did not apply. **Always include a "Drift Warden entries consulted" line** naming the `docs/drift-app-warden.md` sections you actually read (e.g. "§8 trigger map, F177"), or "none applicable" with the reason. Silence is not allowed. Also state how you handled reduced motion (class + `index.css` override, or "no animation added").
