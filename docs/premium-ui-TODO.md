# premium-ui-TODO — Authority Finance

Curated UI polish backlog focused on "premium" treatments (Liquid Glass-inspired) for the Flow/Pulse design system. Each section bundles research goals with tactical tasks for implementation and testing.

## 1. Navigation & Layout Experiments

- [x] **Floating liquid-glass tab bar** — replace the pinned bottom nav with a floating pill (Home, Income, Budget, Benefits, Log): `backdrop-blur-md bg-white/5 border border-white/10 shadow-[0_8px_32px_rgba(0,200,150,0.08)]`, safe-area aware, hides when Life Events drawer opens.
- [x] **Contextual nav collapse** — when scrolling down on any data-heavy tab, fade/slide the nav bubble to 60% scale/opacity; restore on scroll up or when user reaches top.
- [ ] **Gesture bottom sheets** — convert deep-dive panes (week detail, goal detail) into Framer Motion sheets with snap points (33%, 66%, 100%); ensure body scroll locks while sheet is active.

**Plan addendum**

- Floating nav pulls from `BOTTOM_NAV` / `.mobile-bottom-nav` inside `src/App.jsx` (lines ~17–150). After Section 4 lands, wrap the nav list with `<LiquidGlass purpose="nav">` and position using `position:fixed; bottom: calc(12px + var(--safe-area-bottom))`. Move spacer padding into `src/index.css` utility classes so content always clears the pill.
- Contextual collapse hooks into the scroll observers already used for sticky headers (see `IncomePanel.jsx` sticky weekly table). Add a shared `useScrollDirection` hook in `src/hooks/` that updates a `isScrollingDown` ref; feed that boolean into the nav component to toggle `transform: scale(0.6)` / `opacity:0.6` while keeping pointer events active so taps still register instantly.
- Gesture bottom sheets consolidate the logic from `WeekConfirmModal.jsx` and the goal drawers inside `BudgetPanel.jsx`. Create `src/components/BottomSheet.jsx` with snap points (33/66/100) that locks body scroll (existing logic around `WeekConfirmModal`’s `useEffect` can be lifted). Use Framer Motion if available; otherwise CSS transitions. Reference `WeekConfirmModal` markup for content stacking and `BudgetPanel` detail cards to keep padding consistent.

**Dev note — 2026-04-12 (floating nav shipped)**

- `mobile-bottom-nav` in `src/App.jsx` is now a floating pill: `position:fixed; bottom: calc(12px + env(safe-area-inset-bottom,0px)); left:16px; right:16px`.
- Nav content is wrapped in `<LiquidGlass purpose="nav" tone="teal" intensity="light">` with `borderRadius:24px; height:62px; overflow:hidden`.
- Sliding teal indicator (2px bar) is preserved inside the pill, clipped by `overflow:hidden`.
- Nav fades out (`opacity:0; pointerEvents:none`) while `drawerOpen` is true.
- Content spacer bumped from `72px` → `86px` (pill 62px + 12px bottom offset + 12px gap).

---

## 2. Card Hierarchy & Data Display

- [x] **Tiered card depth** — apply “solid / glass / overlay” hierarchy: primary metrics stay solid Flow surfaces; secondary insight cards (Pulse rows, Log Effect Summary) use glass treatment; overlays use stronger blur + tint.
- [ ] **Swipeable stacks** — weekly income summaries and goal detail lists switch to horizontal swipe (snap) containers to cut vertical scrolling.
- [ ] **Large-number pairs** — ensure all hero numbers pair countup animation with contextual sub-labels (e.g., “Week 14 • Heavy rotation”). Audit for consistency.

**Plan addendum**

- Introduce a `visualTier` prop on `MetricCard` (`src/components/ui.jsx`). Primary dashboard tiles (`HomePanel.jsx`, `IncomePanel.jsx`) pass `"solid"`, Log summaries in `LogPanel.jsx` use `"glass"`, and overlays (e.g., `WeekConfirmModal`) use `"overlay"`. The tiers map to CSS tokens to land the blur/opacity values introduced in Section 4.
- Build a `ScrollSnapRow` wrapper (new component in `src/components/`) for swipeable stacks and apply it first to the weekly net sequence in `IncomePanel.jsx` and the goals detail cards in `BudgetPanel.jsx`. Use `scroll-snap-type: x mandatory` with 16px gaps, and surface pagination dots via a reusable `useSwipeStack` hook stored in `src/hooks/useSwipeStack.js`.
- While touching `HomePanel.jsx` tile definitions (lines ~58–170), feed `currentWeek` metadata into each `MetricCard` `sub` label (e.g., `Week ${currentWeek.idx} • ${currentWeek.rotation}`) so every hero number has context. Mirror that pattern in `IncomePanel`’s sticky header and `Goals` list to satisfy the “large-number pairs” consistency audit.

**Dev note — 2026-04-12 (tiered card depth shipped)**

- `MetricCard` in `src/components/ui.jsx` accepts new `visualTier` prop: `"glass"` | `"overlay"`.
- `"glass"`: `backdrop-filter:blur(12px)`, teal tint `rgba(0,200,150,0.08)`, border `rgba(0,200,150,0.20)`.
- `"overlay"`: `backdrop-filter:blur(20px)`, deeper tint `rgba(0,200,150,0.12)`, border `rgba(0,200,150,0.28)`.
- Default (no prop or `"solid"`): unchanged bg-surface behaviour.
- Log Effect Summary container in `src/components/LogPanel.jsx` is now wrapped with `<LiquidGlass purpose="log-summary" tone="teal" intensity="light">`.

---

## 3. Micro-interactions & Motion

- [ ] **Value transitions** — when totals change (wizard completion, shift log), animate numbers between previous and next values (<300 ms, ease-in-out).
- [ ] **Log confirmation pulse** — after confirming a week or log event, ripple highlight the affected card (green radial gradient, fade within 250 ms).
- [ ] **Drag feedback** — add scale + shadow pop during drag-and-drop (goals/expenses) to mimic haptic lift; ensure drop snap feels crisp.
- [ ] **Liquid goal fill** — animate goal progress bars using a subtle wave/clip-path fill rather than a linear width change; keep motion under 400 ms.

**Plan addendum**

- `MetricCard` already counts up via `rawVal`; add an `animateValueChange` prop so panels like `HomePanel` and `BenefitsPanel` can opt in/out. The animation is a brief translateY + opacity blend driven directly inside `MetricCard` when `rawVal` changes. Non-dollar figures (percentages in `BudgetPanel`) will wrap their spans in `framer-motion`’s `AnimatePresence` or a CSS class that runs a keyframe fade.
- Extend `LogPanel.jsx`’s `handleConfirmWeek` to emit the confirmed week id back up to the card grid; toggle a `.log-pulse` class, and define the radial gradient animation near the existing `goalFundedGlow` keyframes in `src/index.css`.
- Goals/expenses drag areas already exist in `BudgetPanel.jsx`; extract the styling into a `useDragStyling` hook (`src/hooks/`). While dragging, apply `scale(1.03)` + `box-shadow` via inline style and snap the placeholder into place using `Element.scrollIntoView({ block: 'center' })`.
- Replace the linear goal progress fill with a reusable `LiquidFill` SVG component (lives beside other UI primitives). Feed `completionPct` into the sine-wave mask and keep the timeline <400 ms, respecting `prefers-reduced-motion` with a fade fallback.

## 4. Liquid Glass Components

- [x] **Reusable LiquidGlass React component** — `src/components/LiquidGlass.jsx`. Props: `tone` (teal/blue/purple), `intensity` (light/strong), `withBorder`, `purpose` (required, placement-guarded). Inline blur + tint + border via inline styles; no SVG noise yet.
- [x] **Placement rules** — placement guard live. Allowed: `nav`, `pulse`, `modal`, `log-summary`. Warns in dev on violation. Banned on primary cards, tables, buttons.
- [ ] **SVG refraction experiment** — optional: test an SVG filter (`feGaussianBlur + feColorMatrix + feBlend`) for subtle distortion on Pulse cards. Benchmark on iPhone 17 Safari.

**Plan addendum**

- Implementation lives in `src/components/LiquidGlass.jsx` with tokens defined at the top of `src/index.css`. The component supports `tone`, `intensity`, `withBorder`, `noise`, and `purpose`, and warns in dev if a non-whitelisted placement tries to render it.
- Placement guard covers `nav`, `pulse`, `modal`, and `log-summary`. Any new placement must first update this doc and the guard list before code usage is allowed.
- Asset hygiene: the SVG noise texture ships as `src/assets/glass-noise.png`; switching tones simply swaps CSS vars rather than duplicating assets.
- Refraction experiment scaffolding lives in `docs/experiments/liquid-glass.html` and is toggled at runtime via `ENABLE_GLASS_REFRACTION_EXPERIMENT` in `src/constants/uiFlags.js`.

**Dev note — 2026-04-12 (values locked)**

Three tones ship — `"teal"`, `"blue"`, `"purple"`. `"gold"` is not a tone; gold is a legacy alias for teal in this system.

---

### Glass Sheen Reference (2026-04-12 starting point)

The 5-layer recipe that produces the raised Apple-style glass effect. Applied as `style` prop overrides on `<LiquidGlass>` plus one child sheen div. Adjust the α values (opacity knobs) to hit different intensity levels:

```jsx
// Layer 1 + 2 — tint and border override (pass in style prop)
background: "rgba(0, 200, 150, 0.15)"          // default teal tint is 0.10
border:     "1px solid rgba(0, 200, 150, 0.40)" // default teal border is 0.24

// Layer 3 + 4 + 5 — boxShadow (pass in style prop)
boxShadow: "0 8px 32px rgba(0, 200, 150, 0.22),  // outer teal glow
            0 4px 16px rgba(0, 0, 0, 0.55),       // dark lift shadow
            inset 0 1px 0 rgba(255, 255, 255, 0.10)" // inner top rim

// Layer 6 — sheen div (first child, pointerEvents:none, zIndex:1)
background: "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, transparent 100%)"
height: "45%", position: "absolute", top:0, left:0, right:0
```

**Variation presets:**

| Preset | Outer glow α | Sheen α | Tint α | Border α | When to use |
|--------|-------------|---------|--------|----------|-------------|
| Subtle | 0.10 | 0.05 | 0.10 | 0.24 | Background glass, log-summary |
| **Standard** (nav) | **0.22** | **0.09** | **0.15** | **0.40** | Floating nav — current shipped |
| Prominent | 0.28 | 0.12 | 0.18 | 0.48 | Modal overlays, focus surfaces |
| Dark/muted | — | 0.05 | 0.10 | 0.20 | Pulse rows on dark cards (no color glow) |

| Tone | Tint | Border | Use |
|------|------|--------|-----|
| `teal` | `rgba(0, 200, 150, 0.10)` | `rgba(0, 200, 150, 0.24)` | Flow surfaces, nav |
| `blue` | `rgba(91, 140, 255, 0.16)` | `rgba(91, 140, 255, 0.35)` | Directional Pulse signals |
| `purple` | `rgba(124, 92, 255, 0.10)` | `rgba(124, 92, 255, 0.26)` | Warning / AI Pulse signals |

Blur: `light = 12px` · `strong = 20px`.

- Blur values are hardcoded in the JS lookup table — `blur(var(--glass-blur-light))` does NOT resolve in inline styles. The `@theme` CSS tokens exist for future CSS-level rules only.
- Blue tint opacity (0.16) is intentionally higher than teal/purple (0.10) so blue pills read as clearly blue on the dark card backgrounds.
- `InsightRow` in `ui.jsx` uses `tone="blue"` for `variant="blue"` and `tone="purple"` for `variant="purple"`. Do not use `"teal"` for Pulse signal rows.
- Pill shape: `inline-flex`, `borderRadius: 6px`, `padding: 3px 8px 3px 6px` — never stretches full card width.
- `noise`, `withNoise`, and `ENABLE_GLASS_REFRACTION_EXPERIMENT` flag are **not yet implemented** — planned for the SVG refraction experiment task above.

## 5. Stack Reality & QA

- [ ] **Feasibility matrix** — maintain a quick table (feature → effort → tool) inside this file; update as experiments graduate or get cut.
- [ ] **Device QA runbook** — for each shipped premium UI change, test on: iPhone 17 Safari/Chrome, Pixel 9 Chrome, macOS Safari/Chrome (desktop + responsive mode). Document issues (e.g., sticky offset with Dynamic Island) before promoting to stable.

**Plan addendum**

- Add a Markdown table under this section summarizing feature name, DRI, effort (S/M/L), and tooling (e.g., Framer Motion, Playwright). Keep it in this file so status updates ride with roadmap edits.
- Create `qa/premium-ui.md` outlining required device/browser combos plus manual steps (nav hover, swipe stacks, drag/drop, log confirm pulse). Each checklist should capture pass/fail plus screenshot links stored under `/qa/reports`.
- Wire up `npm run qa:premium` in `package.json` once Playwright config exists; GH Actions can run this script whenever `src/components/ui.jsx` or `src/index.css` change (use `paths:` filter). Store reference screenshots to compare future runs.

---

*Last updated: 2026-04-13 — Section 1 floating nav + contextual nav collapse + Section 2 tiered card depth shipped*
