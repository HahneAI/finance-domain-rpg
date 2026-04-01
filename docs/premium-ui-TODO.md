# premium-ui-TODO — Authority Finance

Curated UI polish backlog focused on "premium" treatments (Liquid Glass-inspired) for the Flow/Pulse design system. Each section bundles research goals with tactical tasks for implementation and testing.

## 1. Navigation & Layout Experiments

- [ ] **Floating liquid-glass tab bar** — replace the pinned bottom nav with a floating pill (Home, Income, Budget, Benefits, Log): `backdrop-blur-md bg-white/5 border border-white/10 shadow-[0_8px_32px_rgba(0,200,150,0.08)]`, safe-area aware, hides when Life Events drawer opens.
- [ ] **Contextual nav collapse** — when scrolling down on any data-heavy tab, fade/slide the nav bubble to 60% scale/opacity; restore on scroll up or when user reaches top.
- [ ] **Gesture bottom sheets** — convert deep-dive panes (week detail, goal detail) into Framer Motion sheets with snap points (33%, 66%, 100%); ensure body scroll locks while sheet is active.

## 2. Card Hierarchy & Data Display

- [ ] **Tiered card depth** — apply “solid / glass / overlay” hierarchy: primary metrics stay solid Flow surfaces; secondary insight cards (Pulse rows, Log Effect Summary) use glass treatment; overlays use stronger blur + tint.
- [ ] **Swipeable stacks** — weekly income summaries and goal detail lists switch to horizontal swipe (snap) containers to cut vertical scrolling.
- [ ] **Large-number pairs** — ensure all hero numbers pair countup animation with contextual sub-labels (e.g., “Week 14 • Heavy rotation”). Audit for consistency.

## 3. Micro-interactions & Motion

- [ ] **Value transitions** — when totals change (wizard completion, shift log), animate numbers between previous and next values (<300 ms, ease-in-out).
- [ ] **Log confirmation pulse** — after confirming a week or log event, ripple highlight the affected card (green radial gradient, fade within 250 ms).
- [ ] **Drag feedback** — add scale + shadow pop during drag-and-drop (goals/expenses) to mimic haptic lift; ensure drop snap feels crisp.
- [ ] **Liquid goal fill** — animate goal progress bars using a subtle wave/clip-path fill rather than a linear width change; keep motion under 400 ms.

## 4. Liquid Glass Components

- [ ] **Reusable LiquidGlass React component** — props: `tone` (teal/gold), `intensity` (light/strong), `border` toggle. Internally: CSS custom props for blur, brightness, tint; optional SVG noise overlay.
- [ ] **Placement rules** — apply LiquidGlass component only to floating nav, Pulse rows, modal overlays, and Log Effect Summary per Apple/Telerik guidance. Explicitly ban on primary cards, tables, and buttons.
- [ ] **SVG refraction experiment** — optional enhancement: test an SVG filter (`feGaussianBlur + feColorMatrix + feBlend`) for subtle distortion on Pulse cards. Benchmark performance on iPhone 17 Safari.

## 5. Stack Reality & QA

- [ ] **Feasibility matrix** — maintain a quick table (feature → effort → tool) inside this file; update as experiments graduate or get cut.
- [ ] **Device QA runbook** — for each shipped premium UI change, test on: iPhone 17 Safari/Chrome, Pixel 9 Chrome, macOS Safari/Chrome (desktop + responsive mode). Document issues (e.g., sticky offset with Dynamic Island) before promoting to stable.

---

*Last updated: 2026-04-01*
