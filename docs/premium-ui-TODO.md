# premium-ui-TODO — Authority Finance

Curated UI polish backlog for the Flow/Pulse design system. Ordered from highest ROI / fastest ship to most complex or externally dependent. All completed items removed.

---

## Tier 1 — Immediate Wins (minutes of code, major feel lift)

### 1. Haptic Feedback

Add physical feedback to interactions using `navigator.vibrate`. Dramatically increases perceived quality with near-zero complexity.

- [ ] **Light tap feedback** — `navigator.vibrate(8)` on all SmBtn and tab taps
- [ ] **Medium confirmation feedback** — `navigator.vibrate([12, 50, 12])` on week confirm and log submit
- [ ] **Strong goal funded feedback** — `navigator.vibrate([20, 60, 20])` on goal completion / funding milestone
- [ ] **Drag release feedback** — `navigator.vibrate(10)` on drop-zone release

**Implementation note:** Wrap in a `vibrate(pattern)` utility in `src/lib/haptics.js` that no-ops when the API is unavailable (desktop). Wire into `LogPanel.jsx` `handleConfirmWeek`, `BudgetPanel.jsx` goal actions, and `App.jsx` nav taps. No external deps.

---

### 2. Value Transitions

Animate numbers between previous and next values when totals change. `MetricCard` already has countup — this is a small delta.

- [ ] **Wizard / log completion number morph** — when `rawVal` changes on a `MetricCard`, translateY + opacity blend from old value to new value (<300 ms, ease-in-out). Add opt-in `animateValueChange` prop.
- [ ] **Budget panel percentage transitions** — wrap non-dollar spans in `AnimatePresence` or a CSS keyframe fade when budget totals update
- [ ] **Consistent timing audit** — review all animation durations across `index.css` and component inline styles; normalize to the token ladder: `80ms` (micro), `150ms` (flash), `300ms` (transition), `400ms` (entrance), `1200ms` (countup). Patch any outliers.

**Implementation note:** `animateValueChange` lives on `MetricCard` in `src/components/ui.jsx`. Panels that want it: `HomePanel.jsx`, `BenefitsPanel.jsx`. Define the keyframe alongside existing `fadeSlideUp` in `src/index.css`. No external deps.

---

## Tier 2 — High-Impact Interactions (self-contained components)

### 3. Gesture Bottom Sheets

Convert deep-dive panes into Framer Motion sheets with snap points. `WeekConfirmModal.jsx` already has body-scroll-lock logic that can be lifted.

- [ ] **`BottomSheet.jsx` component** — snap points at 33%, 66%, 100%; body scroll locks while sheet is active; drag handle visible; spring physics on release
- [ ] **Week detail pane** — migrate from modal to bottom sheet
- [ ] **Goal detail pane** — migrate `BudgetPanel.jsx` goal drawer to bottom sheet

**Implementation note:** Create `src/components/BottomSheet.jsx`. Lift scroll-lock `useEffect` from `WeekConfirmModal.jsx`. Use Framer Motion if available; otherwise CSS `transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1)`. Reference `WeekConfirmModal` for content stacking and `BudgetPanel` detail cards for padding consistency.

---

### 4. Smooth Tab & Panel Transitions

Tab switches currently snap instantly. Fade + slide content instead.

- [ ] **Tab content fade-slide** — on `activeTab` change in `App.jsx`, outgoing panel fades to `opacity:0` + `translateY(-6px)` (100ms), incoming panel fades in + `translateY(6px → 0)` (200ms)
- [ ] **Sub-panel view tab transitions** — same treatment for `VT`-driven sub-panels inside `IncomePanel`, `BudgetPanel`, `BenefitsPanel`

**Implementation note:** Add a `<PanelTransition>` wrapper or use CSS `animation` on the panel's root div keyed to `activeTab`. Keep total duration ≤ 300ms. No external deps.

---

### 5. Swipeable Stacks

Replace tall vertical scroll lists with horizontal snap containers to cut vertical scrolling on mobile.

- [ ] **`ScrollSnapRow` component** — `scroll-snap-type: x mandatory`, 16px gaps, pagination dots via `useSwipeStack` hook
- [ ] **Weekly net income sequence** — apply `ScrollSnapRow` to week cards in `IncomePanel.jsx`
- [ ] **Goal detail cards** — apply `ScrollSnapRow` to goal list in `BudgetPanel.jsx`

**Implementation note:** New `src/components/ScrollSnapRow.jsx` + `src/hooks/useSwipeStack.js`. Pure CSS scroll snap — no library needed. Pagination dots as small teal circles below the row.

---

### 6. Drag Feedback

Scale + shadow pop during drag to mimic haptic lift; crisp drop snap.

- [ ] **`useDragStyling` hook** — `src/hooks/useDragStyling.js`; while dragging apply `scale(1.03)` + elevated box-shadow inline; reset on drop
- [ ] **Drop snap** — call `Element.scrollIntoView({ block: 'center' })` on placeholder when item lands
- [ ] **Wire into `BudgetPanel.jsx`** — goals and expenses drag areas

**Implementation note:** Extract from existing drag logic in `BudgetPanel.jsx`. No external deps.

---

## Tier 3 — Visual Polish (moderate effort, self-contained)

### 7. Liquid Goal Fill

Replace linear progress bar width change with a subtle wave fill animation.

- [ ] **`LiquidFill` SVG component** — sine-wave mask driven by `completionPct`; animation timeline <400ms; `prefers-reduced-motion` fallback to plain width transition
- [ ] **Wire into `BudgetPanel.jsx`** — replace existing goal progress bars
- [ ] **Wire into `HomePanel.jsx`** — savings goal tile if applicable

**Implementation note:** New component alongside other primitives in `src/components/ui.jsx` or as its own file. SVG `clipPath` with animated `<path>` using a sine wave formula. Keep the math simple — one cycle of a sine at low amplitude is sufficient for the visual effect.

---

### 8. Empty State Illustrations

Remove "dead" screens; give context when no data exists. CSS/SVG only — no external asset creation needed for these abstract versions.

- [ ] **No goals** — faint progress bar outline + "Add your first goal" prompt
- [ ] **No logs** — minimal timeline line + "Log your first week" prompt
- [ ] **No income config** — flat waveform or neutral bar graph outline + setup CTA

**Implementation note:** Inline SVG or CSS-only illustrations. Place in each panel's empty branch. Keep visuals at `opacity:0.25` using `--color-border-subtle` so they recede behind real data. Do not use in data-heavy states.

---

## Tier 4 — QA & Infrastructure

### 9. Feasibility Matrix

- [ ] **Add table to this file** — columns: Feature · DRI · Effort (S/M/L) · Tooling · Status. Keep updated as experiments graduate or get cut.

---

### 10. Device QA Runbook

- [ ] **Create `qa/premium-ui.md`** — device/browser matrix: iPhone 17 Safari + Chrome, Pixel 9 Chrome, macOS Safari + Chrome (desktop + responsive mode)
- [ ] **Manual test steps** — nav hover, swipe stacks, drag/drop, log confirm pulse, haptic patterns, bottom sheet snap
- [ ] **`npm run qa:premium`** — add to `package.json` once Playwright config exists; scope to `src/components/ui.jsx` and `src/index.css` change paths

---

## Tier 5 — Complex / External Dependencies

### 11. SVG Refraction Experiment

Optional Pulse card distortion. Needs real-device benchmark before committing.

- [ ] **Scaffold `docs/experiments/liquid-glass.html`** — SVG filter: `feGaussianBlur + feColorMatrix + feBlend` for subtle distortion on Pulse cards
- [ ] **Benchmark on iPhone 17 Safari** — confirm 60fps under load before promoting
- [ ] **Gate behind `ENABLE_GLASS_REFRACTION_EXPERIMENT` flag** in `src/constants/uiFlags.js`

---

### 12. Icon System

Requires sourcing or designing a unified icon set. External design work gating this.

- [ ] **Select icon set** — one library or custom SVG set; consistent 1.5px stroke, 20×20 grid
- [ ] **Active vs inactive states** — inactive: thin outline; active: filled or heavier weight
- [ ] **Audit all current icons** — replace any mismatched icons app-wide
- [ ] **Nav icons** — swap bottom nav icons first (highest visibility)
- [ ] **Consistent sizing token** — `--icon-size-sm: 16px` · `--icon-size-md: 20px` · `--icon-size-lg: 24px` in `src/index.css`

**Blocked on:** icon set selection / custom asset creation.

---

### 13. Design Taste Research Loop

Ongoing process — not a one-shot code task. Structure the habit.

- [ ] **Monthly review session** — 30 min: screenshot 3–5 premium financial apps (Monarch, Copilot, Robinhood), log one actionable pattern per session to `docs/TODO.md`
- [ ] **Pattern → PR pipeline** — each observation becomes a tagged backlog item before it enters the sprint

---

## Reference — Glass Sheen Recipe

5-layer raised Apple-style glass effect. Apply as `style` prop overrides on `<LiquidGlass>` + one child sheen div.

```jsx
// Layer 1+2 — tint and border
background: "rgba(0, 200, 150, 0.15)"
border:     "1px solid rgba(0, 200, 150, 0.40)"

// Layer 3+4+5 — boxShadow
boxShadow: "0 8px 32px rgba(0, 200, 150, 0.22),
            0 4px 16px rgba(0, 0, 0, 0.55),
            inset 0 1px 0 rgba(255, 255, 255, 0.10)"

// Layer 6 — sheen div (first child, pointerEvents:none, zIndex:1)
background: "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, transparent 100%)"
height: "45%", position: "absolute", top:0, left:0, right:0
```

| Preset | Outer glow α | Sheen α | Tint α | Border α | When to use |
|--------|-------------|---------|--------|----------|-------------|
| Subtle | 0.10 | 0.05 | 0.10 | 0.24 | Background glass, log-summary |
| **Standard** (nav) | **0.22** | **0.09** | **0.15** | **0.40** | Floating nav — current shipped |
| Prominent | 0.28 | 0.12 | 0.18 | 0.48 | Modal overlays, focus surfaces |
| Dark/muted | — | 0.05 | 0.10 | 0.20 | Pulse rows on dark cards |

| Tone | Tint | Border | Use |
|------|------|--------|-----|
| `teal` | `rgba(0, 200, 150, 0.10)` | `rgba(0, 200, 150, 0.24)` | Flow surfaces, nav |
| `blue` | `rgba(91, 140, 255, 0.16)` | `rgba(91, 140, 255, 0.35)` | Directional Pulse signals |
| `purple` | `rgba(124, 92, 255, 0.10)` | `rgba(124, 92, 255, 0.26)` | Warning / AI Pulse signals |

Blur: `light = 12px` · `strong = 20px`

- Blur values are hardcoded in the JS lookup table — `blur(var(--glass-blur-light))` does NOT resolve in inline styles.
- Blue tint opacity (0.16) is intentionally higher than teal/purple (0.10) so blue pills read clearly on dark backgrounds.
- `noise`, `withNoise`, and `ENABLE_GLASS_REFRACTION_EXPERIMENT` are not yet implemented.

---

*Last updated: 2026-04-22 — merged upgrade-TODO, removed completed items, re-ordered by ROI*
