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

Sprint 5 is broken into four execution sprints plus a QA pass. Each sprint is independently committable.

**Dependency order:** 5.1 → 5.2 → 5.3 → 5.4 → 5.5 (QA)
5.1 has no dependencies. 5.2 delivers the modal shell. 5.3 and 5.4 add interaction modes to the modal independently (5.3 touch, 5.4 desktop drag — either can ship first).

---

## Sprint 5.1 — Ghost ordinal numbers on goal cards

**Scope:** `src/components/HomePanel.jsx` only. Zero state changes. Zero logic changes.

**What changes:**
- Both card branches (mobile snap + desktop list): add `position: "relative"` and `overflow: "hidden"` to the outer card `<div>` style
- Wrap all card content in an inner `<div style={{ position: "relative", zIndex: 1 }}>` so it sits above the ghost number
- Add a ghost ordinal `<div>` as the first child inside each card container (sibling to the content wrapper, not inside it)

**Ghost ordinal spec:**
```
font-size:      isMobile ? "72px" : "96px"
font-weight:    900
font-family:    var(--font-display)
color:          rgba(255, 255, 255, 0.09)
line-height:    1
position:       absolute
top:            -8px
right:          12px
pointer-events: none
user-select:    none
z-index:        0
```

Value: `i + 1` from the existing `tl.map((g, i) => ...)` index. Apply identically in both mobile and desktop card branches.

`overflow: hidden` on the card clips the top bleed intentionally — the number peeks above the card top edge by 8px in the visual design.

**Does NOT change:** label, target $, timeline bar, edit form, DONE/DEL buttons, celebrating flash, drag props (desktop branch keeps them for now — drag removal is Sprint 5.2).

**Agent tag:** `[CODEX]` — fully specified, single file, zero cross-file impact.

**Acceptance:**
- [ ] Ghost number visible on both mobile snap card and desktop list card
- [ ] Number does not shift label or $ target layout
- [ ] `overflow: hidden` clips top bleed on card container

---

## Sprint 5.2 — Reorder button + modal shell (no interaction)

**Scope:** `src/components/HomePanel.jsx` only.

**New state:**
```js
const [showReorderModal, setShowReorderModal] = useState(false);
```

**Card changes (both mobile and desktop branches):**
- Remove `↑` `↓` SmBtn pair
- Remove `draggable`, `onDragStart`, `onDragEnd`, `onDragOver` props from the desktop card branch (drag moves to the modal in 5.4)
- Add single REORDER button in their place (left of EDIT in the footer action row):
```jsx
{activeGoals.length > 1 && (
  <SmBtn onClick={() => setShowReorderModal(true)} c="var(--color-text-secondary)">
    ⠿ REORDER
  </SmBtn>
)}
```
Only renders when there are 2+ active goals. Single-goal and zero-goal states show no REORDER button.

**`moveGoal` and `reorderGoalByDrag`:** keep both functions — they will be called from the modal in 5.3/5.4.

**Modal chrome (read-only, no reorder yet):**

```
Overlay:
  position: fixed, inset: 0, zIndex: 300
  background: rgba(0,0,0,0.82)
  display: flex, alignItems: flex-end, justifyContent: center

Inner panel:
  width: 100%, maxWidth: 560px
  background: var(--color-bg-surface)
  border-radius: isCoarsePointer ? "20px 20px 0 0" : "16px"
  padding: 20px 20px 32px
  maxHeight: 80vh, overflow: hidden
```

`isCoarsePointer` state (read-once on mount, same pattern as BudgetPanel):
```js
const [isCoarsePointer] = useState(() =>
  typeof window !== "undefined" ? window.matchMedia("(pointer: coarse)").matches : false
);
```

**Modal header:**
- Left: `REORDER GOALS` label (10px, 2px tracking, uppercase, var(--color-gold))
- Right: `✕` close button → `setShowReorderModal(false)`
- Backdrop click → `setShowReorderModal(false)`

**Modal mini-cards (display only this sprint):**

Render `activeGoals` in a `ScrollSnapRow itemWidth="min(40vw, 140px)"`:

```
Each mini-card:
  height:          80px
  background:      var(--color-bg-surface)
  border:          1px solid var(--color-border-subtle)
  border-radius:   12px
  padding:         10px 12px
  position:        relative
  overflow:        hidden
  display:         flex
  flex-direction:  column
  justify-content: space-between

Ghost ordinal (top-right):
  font-size:   32px, font-weight: 900
  color:       rgba(255,255,255,0.12)
  position:    absolute, top: 4px, right: 8px
  pointer-events: none, z-index: 0

Label:
  font-size:   12px, font-weight: bold
  color:       var(--color-text-primary)
  position:    relative, z-index: 1
  overflow: hidden, display: -webkit-box
  -webkit-line-clamp: 2, -webkit-box-orient: vertical
```

No tap/drag handling yet — mini-cards are display only.

**Agent tag:** `[CC]` — requires cross-branch awareness and careful prop removal from both card branches.

**Acceptance:**
- [ ] REORDER button appears only when activeGoals.length > 1
- [ ] Modal opens from any card, closes on ✕ and backdrop tap
- [ ] Bottom-sheet radius on mobile, centered radius on desktop
- [ ] Mini-cards render with label + ghost ordinal, horizontally swipeable
- [ ] Desktop card branch no longer has draggable/onDrag* props

---

## Sprint 5.3 — Touch reorder (tap-select + ← → arrows)

**Scope:** `src/components/HomePanel.jsx` — adds interaction to the modal from 5.2.

**New state:**
```js
const [reorderSelectedId, setReorderSelectedId] = useState(null);
```
Tracks which mini-card is currently selected for arrow-button moves. Reset to `null` when modal closes.

**Mini-card tap:** on `onClick`, set `reorderSelectedId` to `g.id`. Selected card gets `border: 1px solid var(--color-accent-primary)`.

**Arrow buttons** — rendered below the ScrollSnapRow, visible only when `isCoarsePointer === true`:

```jsx
<div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "12px" }}>
  <SmBtn
    onClick={() => reorderSelectedId && moveGoalInActiveList(reorderSelectedId, -1)}
    c={canMoveLeft ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
  >←</SmBtn>
  <SmBtn
    onClick={() => reorderSelectedId && moveGoalInActiveList(reorderSelectedId, +1)}
    c={canMoveRight ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
  >→</SmBtn>
</div>
```

**`moveGoalInActiveList(id, dir)` — bounds-safe wrapper around `moveGoal`:**

> ⚠️ `moveGoal` operates on the raw `goals` array (active + completed). Calling it with `dir=+1` on the last active goal would swap it into the completed section. The arrows must guard using the active-only index.

```js
const moveGoalInActiveList = (id, dir) => {
  const idx = activeGoals.findIndex(g => g.id === id);
  if (idx === -1) return;
  const next = idx + dir;
  if (next < 0 || next >= activeGoals.length) return;
  moveGoal(id, dir);
};
```

`canMoveLeft`: `activeGoals.findIndex(g => g.id === reorderSelectedId) > 0`
`canMoveRight`: `activeGoals.findIndex(g => g.id === reorderSelectedId) < activeGoals.length - 1`

After move: `reorderSelectedId` stays on the moved goal — the card follows the selection visually.

**Agent tag:** `[CODEX]` — fully specified, self-contained within the modal section.

**Acceptance:**
- [ ] Tap mini-card → accent border, deselects previous
- [ ] ← arrow disabled (visually) when goal is first in active list
- [ ] → arrow disabled (visually) when goal is last in active list
- [ ] Move updates goal order immediately in the snap row behind the modal
- [ ] Arrow buttons hidden on non-coarse pointer (desktop)

---

## Sprint 5.4 — Desktop drag reorder in modal

**Scope:** `src/components/HomePanel.jsx` — adds drag interaction to modal mini-cards for fine-pointer (desktop) users.

**Pointer gate:** render drag props only when `!isCoarsePointer`.

**Drag state** — reuse existing `draggingGoalId`, `dragOverGoalId`, `goalInsertRef`, `goalDragFinalizedRef` (already in HomePanel state). No new state needed.

**Mini-card drag props** (fine-pointer only):

```jsx
draggable={!isCoarsePointer}
onDragStart={() => onGoalDragStart(g)}
onDragEnd={onGoalDragEnd}
onDragOver={(e) => {
  e.preventDefault();
  setDragOverGoalId(g.id);
  const activeIndex = activeGoals.findIndex(goal => goal.id === g.id);
  goalInsertRef.current = { targetId: g.id, insertIndex: activeIndex === -1 ? 0 : activeIndex };
}}
```

Drop target styling: when `dragOverGoalId === g.id`, override border to `var(--color-accent-primary)` (same pattern as desktop card list).

`onDragEnd` fires `reorderGoalByDrag` (already handles active/completed separation) — no changes needed to the existing handler.

**Cursor:** `cursor: isCoarsePointer ? "pointer" : "grab"` on mini-cards.

**Agent tag:** `[CODEX]` — contained to modal mini-card props, reuses all existing drag infrastructure.

**Acceptance:**
- [ ] Drag-and-drop reorders goals on desktop (fine pointer)
- [ ] Drop target shows accent border on hover
- [ ] No drag affordance on touch/coarse pointer
- [ ] `reorderGoalByDrag` correctly preserves completed goals below active

---

## Sprint 5.5 — QA checklist

- [ ] Ordinal number visible but does not obscure label or $ target at any card width
- [ ] REORDER button absent for 0 goals and 1 goal; present for 2+ goals
- [ ] Modal opens from any card's REORDER button
- [ ] Modal closes on ✕ and backdrop tap
- [ ] Touch (coarse pointer): tap-select + ← → arrows shift position correctly
- [ ] → arrow disabled on last active goal; ← arrow disabled on first
- [ ] After touch move, snap row behind modal reflects new order immediately
- [ ] Desktop (fine pointer): drag reorder in modal works correctly
- [ ] Drop target accent border shows on desktop drag hover
- [ ] After drag, snap row behind modal reflects new order immediately
- [ ] Ghost ordinal does not shift layout at any card width (mobile + desktop)
- [ ] Inline EDIT form still opens inside snap card after Sprint 5 changes
- [ ] ✓ DONE and ✕ delete still work on cards
- [ ] Celebrating flash animation still fires correctly
- [ ] `npm run test:run` — zero regressions in data logic

---

*Updated: 2026-04-13*
