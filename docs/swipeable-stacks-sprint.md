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

*Created: 2026-04-13*
