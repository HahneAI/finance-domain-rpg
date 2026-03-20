# Mobile UI Experiments — Finance RPG Dashboard

**Status:** Reference doc for future iteration sprints
**Context:** The current app uses a terminal/monospace dark aesthetic. This doc explores 4 distinct UI direction experiments for mobile, from safe incremental improvements to complete rethinks. Pick one per sprint cycle and test on device.

---

## Style A — Terminal Dark (Hardened Current)

**Premise:** Keep 100% of the current aesthetic — Courier New, gold/green/blue accents on near-black. Just fix all layout problems and add polish that the terminal theme invites.

**Changes from current:**
- All horizontal overflow issues fixed (done in this PR)
- PWA installable (done in this PR)
- Add monospace ASCII art decorators to card borders (`┌─┐ │ │ └─┘`)
- Phase tabs become single-line scrollable `<horizontal-scroll-row>` instead of wrapping
- On mobile, data tables collapse to a "record" layout: each row becomes a card with label/value pairs stacked vertically
- Summary stats use a `1-col full-bleed` layout on mobile, `2-col` at 480px+, `4-col` at 768px+
- Input fields keep the terminal box style but get larger tap targets (48px min height)

**Component sketches:**

```
Mobile Income Summary (Style A)
┌─────────────────────────────┐
│ GROSS (YEAR)                │
│ $98,400                     │
├─────────────────────────────┤
│ PROJECTED NET               │
│ $72,310  ████████░░ 73.5%   │
└─────────────────────────────┘
```

**Trade-offs:**
- Pro: Zero visual regression, existing users adapt instantly
- Pro: Fastest to implement, lowest risk
- Con: Dense data still requires horizontal scrolling in detail table views
- Con: Terminal aesthetic can feel cold on mobile vs. native app feel

**Best for:** Vercel preview testing, getting feedback on data correctness before redesigning UX

---

## Style B — Card-First Progressive Disclosure

**Premise:** Restructure every dense table into a "summary card + expand" pattern. The default mobile view shows only the most important 3-5 numbers per section. Users tap to expand for full detail.

**Key patterns:**
- Each panel (Income, Budget, Benefits, Log) gets a "hero card" at top with the single most important metric
- Secondary metrics live in a collapsible "details" section (accordion)
- Tables replaced by vertical stacked rows with `justify-content: space-between` — no horizontal scroll ever
- Tab navigation: bottom nav expands to show sub-tabs on long-press (or secondary horizontal scroll row)
- Goals and loans use a horizontal swipe card deck — one card per goal, swipe left/right

**Component sketches:**

```
Mobile Budget (Style B) — Overview
╔═══════════════════════════════╗
║  WEEKLY LEFT                  ║
║  $847.23           ▲ vs last  ║
╚═══════════════════════════════╝

  NEEDS              $1,240/wk  ›
  LIFESTYLE           $320/wk   ›
  TRANSFERS           $200/wk   ›

  [+ ADD EXPENSE]

──────────────────────────────────
  GOALS
  ┌──────────────────────────────┐
  │ Emergency Fund    ████░ 67%  │
  │ $3,350 of $5,000             │
  └──────────────────────────────┘
  ← swipe →
```

**Implementation notes:**
- Use CSS `details`/`summary` or React `useState` boolean for accordion
- Horizontal card deck: `display: flex; overflow-x: auto; scroll-snap-type: x mandatory` with `scroll-snap-align: start` on each card
- No new dependencies required
- Category rows in overview view: tap navigates to category detail (replaces current edit-inline)

**Trade-offs:**
- Pro: Best mobile UX pattern — matches what users expect from native finance apps (Mint, YNAB)
- Pro: Eliminates all table scroll issues by design
- Con: Requires rethinking the data architecture per view (2-3 sprint sessions)
- Con: Some power-user density is lost — tabular comparison across weeks requires extra taps

**Best for:** If you want the app to feel like a real mobile product to show potential customers

---

## Style C — Native App Shell + Bottom Sheet

**Premise:** Adopt the full native mobile app shell pattern: persistent bottom tab bar, full-height panels that slide in, data presented in "sheet" pattern (pull-up from bottom for context/details).

**Key patterns:**
- Bottom nav is already present — extend it with active panel icons (add SVG icons, not just text labels)
- Each panel occupies 100% height minus the nav bar — content is a scrollable list
- "Edit" and "Config" modes become bottom sheets that slide up from bottom edge (not inline)
- Number inputs get a custom large-number keypad overlay for one-thumb entry
- Pull-to-refresh on each panel triggers data recalculation
- Page transitions: iOS-style slide-left/right when switching panels

**Component sketches:**

```
Mobile App Shell (Style C)
┌─────────────────────────────┐
│ 2026 FINANCIAL DASHBOARD    │  ← sticky header 56px
├─────────────────────────────┤
│                             │
│   [panel content here]      │  ← flex-1 scrollable
│   100% height - 112px       │
│                             │
├─────────────────────────────┤
│ INCOME  BUDGET  BENEF  LOG  │  ← bottom nav 56px
└─────────────────────────────┘

Bottom sheet (edit mode):
                    ┌──────┐
                    │ ████ │  ← drag handle
┌───────────────────┴──────┴───┐
│ Edit Expense                 │
│ Car Insurance                │
│ ┌──────┐ ┌──────┐           │
│ │ P1   │ │ P2   │           │
│ │ $320 │ │ $320 │           │
│ └──────┘ └──────┘           │
│ ┌──────┐ ┌──────┐           │
│ │ P3   │ │ P4   │           │
│ │ $320 │ │ $0   │           │
│ └──────┘ └──────┘           │
│ [        SAVE        ]      │
└─────────────────────────────┘
```

**Implementation notes:**
- Bottom sheet: `position: fixed; bottom: 0; left: 0; right: 0; transform: translateY(100%)` animated via CSS transition or React spring
- Drag handle + touch drag-to-dismiss: `touchstart/touchmove/touchend` handlers on the handle element
- Panel slide transitions: wrap panels in a container with `overflow: hidden` and translate X on `topNav` change
- Custom number input overlay: overlay `position: fixed` with a grid of `<button>` elements (0-9, decimal, backspace)
- No new dependencies — pure React + CSS

**Trade-offs:**
- Pro: Feels the most like a native app — best "install to home screen" experience
- Pro: Bottom sheet pattern is extremely familiar to iOS users
- Con: Highest implementation effort (3-5 sprint sessions for full fidelity)
- Con: Pull-to-refresh semantics don't map cleanly to a "recalculate" action
- Con: Custom number keypad is a significant scope addition

**Best for:** Post-launch polish sprint once you have paying customers to justify the investment

---

## Style D — Dashboard Tile Grid

**Premise:** Think Apple Health / Robinhood home screen. Replace panel navigation with a home dashboard of metric "tiles" in a masonry/grid layout. Each tile is tappable to drill into detail. Navigation is depth-first (home → detail) rather than breadth-first (tab → section).

**Key patterns:**
- Home screen: 2-column tile grid showing live numbers for key metrics across all panels
- Tiles vary in size (1×1, 2×1, 1×2) based on importance
- Color-coded by status: green tiles = healthy, gold = watch, red = action needed
- Tapping a tile navigates to the full panel for that metric
- No top-level tab nav — single home + back arrow navigation pattern
- Numbers use large, legible display font (SF Mono or system monospace at 28-36px)

**Component sketches:**

```
Home Dashboard (Style D)
┌─────────────┬─────────────┐
│ TAKE HOME   │ WEEKLY LEFT │
│ $72,310/yr  │ $847.23/wk  │
│ ↑ on track  │ ██████░░░   │
├─────────────┴─────────────┤
│ BUDGET HEALTH             │
│ Needs 64%  ████████░░░░   │
│ Lifestyle 17%  ██░░░░░░   │
│ Transfers 10%  █░░░░░░░   │
├─────────────┬─────────────┤
│ EMERGENCY   │ GOALS       │
│ $3,350      │ 2 active    │
│ ██████░ 67% │ ~14 wks out │
├─────────────┴─────────────┤
│ NEXT WEEK                 │
│ 4-Day · Exempt · $1,247   │
└───────────────────────────┘
```

**Implementation notes:**
- CSS Grid with named areas for the variable-size tiles
- Each tile is a `<button>` that calls `navigate(panelKey)` — reuses existing navigation
- Tile grid uses `grid-template-columns: 1fr 1fr` with some tiles spanning 2 cols via `grid-column: span 2`
- Color status logic: simple conditionals on metric values (already computed in App.jsx)
- Back navigation: add a `[viewStack, setViewStack]` state in App.jsx — push/pop pattern

**Trade-offs:**
- Pro: Best "at a glance" financial health overview — high value for daily check-ins
- Pro: Tiles naturally adapt to any screen width — no overflow issues possible
- Pro: Feels premium and intentional — strong visual identity
- Con: Requires adding a home/overview screen as a 5th top-level view
- Con: Some metrics (tax schedule, week toggles) don't tile well — still need a table fallback
- Con: 2-3 sprint sessions for the home tile screen + wiring up navigation

**Best for:** Making the app feel polished and distinct from "another finance spreadsheet" — good for the landing page screenshot/demo

---

## Recommendation Order

| Priority | Style | When to attempt |
|----------|-------|-----------------|
| 1 | **A — Terminal Hardened** | Now (done in this PR) — ship it |
| 2 | **B — Card-First** | Next major sprint when adding more panels |
| 3 | **D — Tile Dashboard** | Before public launch — makes great screenshots |
| 4 | **C — Native Shell** | Post-launch with paying users, if mobile is primary use case |

---

## Mobile Testing Checklist

Before shipping any style:

- [ ] No horizontal scroll at 390px (iPhone 14/15/16/17 width)
- [ ] No horizontal scroll at 375px (iPhone SE width)
- [ ] Bottom nav clears home indicator (safe-area-inset-bottom)
- [ ] All tap targets ≥ 44×44px
- [ ] Inputs don't trigger iOS zoom (font-size ≥ 16px)
- [ ] PWA installs from Safari share sheet → "Add to Home Screen"
- [ ] Standalone display mode (no browser chrome when launched from home screen)
- [ ] App works offline (service worker caches JS/CSS)
- [ ] Orientation lock to portrait works on iOS
- [ ] Android Chrome: "Add to Home Screen" prompt appears or manual install works
- [ ] Dark status bar on iPhone (black-translucent status bar style)
- [ ] Dynamic Island / notch area not obscured by content

---

*Last updated: 2026-03-20*
