# Swipeable Stacks — Sprint Spec

**Branch:** `claude/swipeable-stacks-mobile-XbTrD`  
**Status:** In progress  
**Goal:** Convert weekly income rows (IncomePanel) and active goal detail cards (HomePanel) into horizontal scroll-snap stacks to cut vertical scrolling on mobile.

---

## What Ships

| Target | Current | After |
|--------|---------|-------|
| Weekly rows · `IncomePanel` | Vertical table, all rows stack | Horizontal snap cards, one week per card |
| Active goal cards · `HomePanel` | Vertical list, cards stack | Horizontal snap cards, one goal per card |
| Shared wrapper | None | `ScrollSnapRow` in `src/components/ui.jsx` |
| Pagination dots | None | `useSwipeStack` hook in `src/hooks/useSwipeStack.js` |

---

## Design Constraints (hard rules)

- CSS `scroll-snap-type: x mandatory` — **no Framer Motion**
- Gap between snap items: `16px`
- Tokens only: `--color-accent-primary`, `--color-bg-surface`, `--color-border-subtle`
- No bounce, no scale-up on mount
- Press interaction = `scale(0.97)` only, ≤ 500ms duration
- Mobile-first (sub-768px); desktop degrades gracefully to standard scroll or grid

---

## Files to Touch

```
src/
├── components/
│   ├── ui.jsx              — add ScrollSnapRow + PaginationDots exports
│   ├── IncomePanel.jsx     — replace weekly <table> rows with ScrollSnapRow
│   └── HomePanel.jsx       — wrap tl.map(...) goal cards in ScrollSnapRow
└── hooks/
    └── useSwipeStack.js    — new: tracks active snap index via IntersectionObserver
```

No changes to `App.jsx`, `finance.js`, `BudgetPanel.jsx`, or any data layer.

---

## Sprint 1 — `useSwipeStack` hook + `ScrollSnapRow`

**File:** `src/hooks/useSwipeStack.js`

```js
// useSwipeStack(count) → { containerRef, activeIndex }
// Attaches an IntersectionObserver to each snap child.
// Reports the most-visible child index as activeIndex (integer, 0-based).
// Uses threshold: 0.6 so partial-visibility doesn't fire false positives.
```

**File:** `src/components/ui.jsx` — two new exports at the bottom

```jsx
// ScrollSnapRow — horizontal snap container
// Props:
//   children    — snap items (each must be a direct child)
//   itemWidth   — CSS width string for each item (default "min(88vw, 320px)")
//   gap         — CSS gap string (default "16px")
//   showDots    — boolean, renders PaginationDots below (default true)
//   dotColor    — override dot active color (default --color-accent-primary)
//
// CSS shape:
//   display: flex
//   overflow-x: scroll
//   scroll-snap-type: x mandatory
//   -webkit-overflow-scrolling: touch
//   scrollbar-width: none  (+ ::-webkit-scrollbar { display:none })
//   gap: 16px
//   padding: 4px 0 12px   (bottom pad for dots clearance)
//
// Each child receives: scroll-snap-align: start; flex-shrink: 0; width: itemWidth

// PaginationDots — row of dot indicators
// Props: count, active, color
// Renders count dots; active dot is full opacity + accent color; rest are 0.28 opacity
```

**Acceptance:** `ScrollSnapRow` renders correctly in isolation — can be wired in `HomePanel` manually to verify before IncomePanel.

---

## Sprint 2 — Weekly rows in `IncomePanel`

**Context:** `weeklyRows` array (line ~118), currently rendered as a `<table>`. The table has 5 columns: Wk End, Gross, Take Home, Status, and a TX/EX badge. The sticky header logic is JS-driven (lines 16–55) and the "Full Detail" modal is a separate view.

**Change:** Replace the `<table>` block (lines ~398–443) with `ScrollSnapRow`.

Each snap card shape:
```
┌─────────────────────────┐
│ Wk End date  [← now]    │  ← isCurrent badge inline
│ ─────────────────────── │
│ GROSS         $1,234.56 │
│ TAKE HOME     $980.00   │  ← green if exempt, primary if taxed, disabled if past
│ ─────────────────────── │
│ 5-Day · PROJECTED       │  ← rotation display + TX/EX badge
└─────────────────────────┘
```

- Cards are `min(80vw, 260px)` wide on mobile so 1.1 cards peek at the edge
- `isCurrent` card gets `border: 1px solid var(--color-accent-primary)`
- Past weeks get `opacity: 0.65`
- Sticky header JS block (lines 16–55) and the shadow `<div>` (lines 385–397) are **removed** — no longer needed when data is horizontal
- "Full Detail" modal button stays at top-right, unchanged
- `archivedWeeklyRows.length > 0` footnote stays below the snap row

**Desktop fallback (≥768px):** keep the existing `<table>` layout — wrap both renders in a width check or CSS media query using a `useMediaQuery` or inline `window.innerWidth` check on mount.

---

## Sprint 3 — Goal cards in `HomePanel`

**Context:** `tl` array (derived from `computeGoalTimeline`), rendered starting line ~543. Each card has: label, target $, timeline fill bar with month markers, finish-week label, action buttons (↑ ↓ EDIT ✓DONE ✕).

**Change:** Wrap `{tl.map((g, i) => ...)}` in `ScrollSnapRow`.

Each snap card is the existing card body verbatim — no restructuring of content. Only the container changes from vertical `marginBottom: 12px` stacking to horizontal snap.

Card width: `min(88vw, 340px)` — wide enough to show the full timeline bar without truncation.

- Drag-and-drop (`draggable`, `onDragStart`, etc.) **removed from card props** when inside snap row — reorder handled by ↑ ↓ buttons only on mobile
- `editGoalId === g.id` inline edit form still works — card expands in-place
- `celebrating === g.id` pulse still fires — only that card's fill flashes green

**Desktop fallback (≥768px):** keep vertical list layout unchanged.

---

## Sprint 4 — Cleanup + QA

- [ ] Run mobile checklist (390px, 375px) — no horizontal bleed on app shell
- [ ] Verify `scroll-snap-type` doesn't conflict with main-content scroll container
- [ ] Confirm iOS Safari momentum scrolling works (`-webkit-overflow-scrolling: touch`)
- [ ] Test with 1 goal, 3 goals, 0 goals (empty state should show plain "no active goals" — no ScrollSnapRow)
- [ ] Test weekly rows: 5 rows, 20 rows, 1 row
- [ ] Verify "Full Detail" modal still opens from IncomePanel weekly view
- [ ] Verify goal inline edit form still usable inside snap card
- [ ] Run `npm run test:run` — no regressions in data logic

---

## Dot Counter Logic (reference)

```js
// useSwipeStack.js skeleton
import { useRef, useState, useEffect } from "react";

export function useSwipeStack(count) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0) return;
    const children = Array.from(container.children);
    const obs = new IntersectionObserver(
      (entries) => {
        let best = { ratio: 0, idx: 0 };
        entries.forEach((entry) => {
          const idx = children.indexOf(entry.target);
          if (idx !== -1 && entry.intersectionRatio > best.ratio) {
            best = { ratio: entry.intersectionRatio, idx };
          }
        });
        if (best.ratio > 0) setActiveIndex(best.idx);
      },
      { root: container, threshold: [0.6] }
    );
    children.forEach((child) => obs.observe(child));
    return () => obs.disconnect();
  }, [count]);

  return { containerRef, activeIndex };
}
```

---

## Token Reference (no raw hex)

| Use | Token |
|-----|-------|
| Card background | `var(--color-bg-surface)` |
| Card border default | `var(--color-border-subtle)` |
| Card border active | `var(--color-accent-primary)` |
| Dot active | `var(--color-accent-primary)` |
| Dot inactive | `rgba(0, 200, 150, 0.28)` |
| Past row text | `var(--color-text-disabled)` |
| Exempt net | `var(--color-green)` |

---

## Sprint 5 — Goal Number Identity + Reorder Modal

### 5a. Large ordinal number on each goal card (top-right)

Each active goal card gets a large, exaggerated ordinal number anchored to the top-right corner of the card. It is purely presentational — position `absolute` inside the card's `position: relative` container so it never shifts content.

```
Visual spec:
  font-size:   96px  (desktop) / 72px (mobile, <768px)
  font-weight: 900
  color:       rgba(255, 255, 255, 0.09)   ← white, ghosted behind content
  font-family: var(--font-display)
  line-height: 1
  position:    absolute
  top:         -8px
  right:       12px
  pointer-events: none
  user-select: none
  z-index:     0   ← card content sits on z-index: 1
```

The number is intentionally large enough to bleed slightly out of the card top edge (`top: -8px`) and feel like a magazine-style ordinal — readable but not competing with the label or target figure. The low opacity keeps it subtext-level on dark backgrounds.

**Goal 1** shows `1`, **Goal 2** shows `2`, etc. — derived from the `i` index in `tl.map((g, i) => ...)`. The index is 0-based so display as `i + 1`.

Card container needs `position: relative; overflow: hidden` to clip the number if it bleeds.

---

### 5b. Reorder button on each card

Replace the existing `↑` / `↓` `SmBtn` pair on the card footer with a single **REORDER** button. Tapping it opens the Reorder Modal (Sprint 5c). The button sits at the left of the existing footer action row, before EDIT and DONE.

```jsx
<SmBtn onClick={() => setShowReorderModal(true)} c="var(--color-text-secondary)">
  ⠿ REORDER
</SmBtn>
```

The drag handles and `draggable` props on the card itself are also removed — reordering is modal-only. Existing ↑/↓ arrow logic (`moveGoal`) is kept but called from inside the modal instead.

---

### 5c. Reorder Modal — horizontal mini-cards

**State:** `showReorderModal` boolean in `HomePanel`. One modal for the whole goals list — opened from any card's REORDER button.

**What the modal shows:**

```
┌──────────────────────────────────────────────────────┐
│  REORDER GOALS                              [✕ close] │
│                                                       │
│  ← drag or tap arrows to reorder ─────────────────→  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   1      │  │   2      │  │   3      │            │
│  │ Car Note │  │ Laptop   │  │ Vacation │  …          │
│  └──────────┘  └──────────┘  └──────────┘            │
│                                                       │
│  [← ↑] [↓ →] buttons appear below the active card    │
└──────────────────────────────────────────────────────┘
```

**Mini-card spec (inside modal):**

```
width:           min(40vw, 140px)
height:          80px
background:      var(--color-bg-surface)
border:          1px solid var(--color-border-subtle)
border-radius:   12px
padding:         10px 12px
display:         flex
flex-direction:  column
justify-content: space-between

Top-right: ordinal number
  font-size:   32px
  font-weight: 900
  color:       rgba(255,255,255,0.12)
  position:    absolute top 4px right 8px

Label:
  font-size:   12px
  font-weight: bold
  color:       var(--color-text-primary)
  max 2 lines, text-overflow: ellipsis
  overflow: hidden
```

The mini-cards are wrapped in `ScrollSnapRow` (from Sprint 1) so the list is horizontally swipeable inside the modal. The active/focused card (last tapped or centered) gets `border-color: var(--color-accent-primary)`.

**Reorder interaction — two modes:**

1. **Drag (desktop / coarse-pointer = false):** mini-cards are `draggable`. Uses existing `onDragStart/onDragEnd/onDrop` pattern already proven in BudgetPanel expense drag. Drop target highlights with accent border.

2. **Tap-to-select + arrow buttons (touch / coarse-pointer = true):** tap a mini-card to select it (accent border), then use `← →` buttons rendered below the scroll row to shift it left or right. Each tap on an arrow calls `moveGoal(g.id, direction)`. No hold-to-drag required on mobile.

**Pointer detection:** reuse `isCoarsePointer` state pattern from `BudgetPanel` — `window.matchMedia("(pointer: coarse)")`.

**Modal chrome:**

```
position: fixed
inset: 0
z-index: 300
background: rgba(0,0,0,0.82)
display: flex
align-items: flex-end          ← bottom sheet on mobile
justify-content: center

Inner panel:
  width: 100%
  max-width: 560px
  background: var(--color-bg-surface)
  border-radius: 20px 20px 0 0   ← on mobile
  border-radius: 16px            ← on desktop (centered, not bottom sheet)
  padding: 20px 20px 32px
  max-height: 80vh
  overflow: hidden
```

**No new data.** The modal only calls `moveGoal` (already exists) and reads the existing `activeGoals` array. No new state shape.

---

### 5d. What does NOT change on the goal cards

- Label, target $, timeline fill bar, month markers, finish-week label — all unchanged
- EDIT inline form — unchanged
- ✓ DONE, ✕ delete — unchanged, stay in card footer
- Celebrating flash animation — unchanged
- `computeGoalTimeline` / `deriveRollingTimelineMonths` — untouched

The only card-level changes are:
1. Add `position: relative; overflow: hidden` to card container
2. Add ghost ordinal `<div>` (absolute, pointer-events none)
3. Replace `↑` `↓` SmBtns with single REORDER SmBtn

---

### 5e. QA checklist for Sprint 5

- [ ] Ordinal number is visible but does not obscure label or $ target at any card width
- [ ] Modal opens from any card's REORDER button
- [ ] Arrow buttons shift goal position correctly on touch (coarse pointer)
- [ ] Drag reorder works correctly on desktop
- [ ] Modal closes on ✕ and on backdrop tap
- [ ] After reorder, snap row reflects new order immediately
- [ ] Empty state (0 goals) — no REORDER button rendered, no modal
- [ ] Single goal (1 goal) — REORDER button renders but arrows are both disabled/no-op
- [ ] Inline EDIT form still opens inside snap card correctly after Sprint 5 changes

---

*Updated: 2026-04-13*
