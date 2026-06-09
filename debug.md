# Safari Bug Audit — starting points

Branch: `claude/bottom-sheet-buttons-safari-DF8CP`. Notes from a Safari (mobile
browser, not PWA) survey. Item 1 is fixed; the rest are starting points only —
not yet investigated fully.

Root cause that ties most of these together: **a `position: fixed` element
rendered inside `.main-content` (the `overflow-y:auto` scroll container on
mobile) is hit-tested by iOS Safari at an offset equal to the container's
`scrollTop`.** It paints pinned to the viewport but taps land at the scrolled
document position. App-root modals (Tools sheet, admin modal) escape this; panel
modals don't.

---

## 1. Expense bottom-sheet buttons unresponsive (incl. ✕) — FIXED
Portaled the expense detail sheet + restore sheet + drag overlay to
`document.body`. Also fixed drag auto-scroll (`window.scrollBy` → `.main-content`)
and drop placement (index → insert-before-id). Commits on this branch.

## 2. Income panel "Full Detail" weekly breakdown — ✕ not working — FIXED
Portaled all 3 `IncomePanel.jsx` fixed-position modals to `document.body`
(`showWeekDetail` z1000, `showSharpener` z200, `showEventLossInfo` z210). Same
root cause / same fix as item 1.

## 3. "Touch targets need 2–3 taps / bad targets" (browser only) — COVERED ELSEWHERE
The 2–3 tap symptom is the same fixed-in-scroll hit-test offset → tracked as a
general sweep in `docs/TODO.md` §16 (portal audit). The double-tap to open an
expense card is intentional (confirmed by user), so it's not a bug.

## 4. Admin: Tools sheet — scroll hits background, touch "lost"; Tax Weeks button opened Demo accounts
- a) **Scroll lock is ineffective.** `App.jsx:264` sets
  `document.body.style.overflow = "hidden"` when `toolSheetOpen`, but the mobile
  scroller is `.main-content`, not `body` — so the dashboard behind the sheet
  still scrolls and the sheet feels like it "loses touch." **Starting point:**
  lock `.main-content` (overflow hidden, or position:fixed body technique) while
  `toolSheetOpen` / any sheet open.
- b) **"Tax plan view" launched demo accounts.** The tool is the "Tax Weeks"
  grid (App.jsx ~2478). Two hypotheses: (i) the same offset hit-test caused the
  tap to land on the adjacent "Demo {n}" buttons (App.jsx ~2536, which call
  `setAdminDemoView`); or (ii) a real wiring bug. Resolve 4a first — if the lock
  fix realigns hit-testing, this may vanish. Otherwise trace the Tax Weeks
  toggle handler vs. the Demo button handlers.
