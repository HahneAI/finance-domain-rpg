# Admin Temp Lock Date — Implementation Spec

**Feature:** Admin-only toolbar in hamburger menu. First tool: set a temporary date override
("lock date") that replaces `today` across the entire app until manually cleared.  
**Gate:** Only visible/active when `isAdmin === true` (loaded from Supabase `user_data.is_admin`).  
**Persistence:** `localStorage` key `"admin_temp_lock_date"` — survives refresh, cleared manually.

---

## Architecture Overview

### The Two-Date Model
```
today          = real wall-clock date (always ticks at midnight)
tempLockDate   = ISO string | null  (localStorage, admin-set)
effectiveToday = (isAdmin && tempLockDate) ? tempLockDate : today
```

`effectiveToday` is a `useMemo`. Every downstream computation that previously depended on
`today` is switched to `effectiveToday`. The real `today` state is untouched — the midnight
tick keeps running; it just has no visible effect while a lock is active.

Non-admin accounts are never affected: `effectiveToday` falls through to `today` even if a
stale `admin_temp_lock_date` value exists in localStorage.

---

## TODO Items

### 1. Add `tempLockDate` state + `effectiveToday` memo to App.jsx

**State (insert after line 198 `drawerOpen` state):**
```jsx
const [tempLockDate, setTempLockDate] = useState(() =>
  localStorage.getItem("admin_temp_lock_date") ?? null
);
```

**Persistence effect (insert after the midnight-tick effect, ~line 372):**
```jsx
useEffect(() => {
  if (tempLockDate) localStorage.setItem("admin_temp_lock_date", tempLockDate);
  else localStorage.removeItem("admin_temp_lock_date");
}, [tempLockDate]);
```

**`effectiveToday` memo (insert immediately after persistence effect):**
```jsx
const effectiveToday = useMemo(
  () => (isAdmin && tempLockDate) ? tempLockDate : today,
  [isAdmin, tempLockDate, today]
);
```

**Why `useMemo` and not a bare const:** Dep arrays in the downstream memos need a stable
reference that changes only when inputs change. `useMemo` gives that; a bare const
recomputes every render and can't be added to dep arrays reliably.

---

### 2. Replace all downstream `today` references with `effectiveToday` in App.jsx

Exhaustive list — every line that currently reads `today` in a memo/effect/prop:

| Location | Current | Change to |
|----------|---------|-----------|
| Line 385 — auto-confirm effect dep | `today` | `effectiveToday` |
| Line 385 — `toLocalIso(w.weekEnd) < today` | `today` | `effectiveToday` |
| Line 405 — dep array of auto-confirm effect | `today` | `effectiveToday` |
| Line 409 — futureWeeks filter | `today` | `effectiveToday` |
| Line 410 — futureWeeks dep array | `today` | `effectiveToday` |
| Line 413 — getCurrentFiscalWeek call | `today` | `effectiveToday` |
| Line 413 — currentWeek dep array | `today` | `effectiveToday` |
| Line 430 — confirmTriggerWeek filter | `today` | `effectiveToday` |
| Line 435 — confirmTriggerWeek dep array | `today` | `effectiveToday` |
| Line 442 — unconfirmedCount filter | `today` | `effectiveToday` |
| Line 444 — unconfirmedCount dep array | `today` | `effectiveToday` |
| Line 592 — `getFundedGoalSpend(goals, today)` | `today` | `effectiveToday` |
| Line 592 — fundedGoalSpend dep array | `today` | `effectiveToday` |
| Line 685 — HomePanel `today={today}` prop | `today` | `effectiveToday` |
| Line 698 — IncomePanel `today={today}` prop | `today` | `effectiveToday` |
| Line 709 — BudgetPanel `today={today}` prop | `today` | `effectiveToday` |
| Line 745 — ProfilePanel `today={today}` prop | `today` | `effectiveToday` |

LogPanel does not receive a `today` prop — it uses `futureWeeks` and `currentWeek` which are
already derived from `effectiveToday` after item 2 is done.

**Known limitation (acceptable for MVP):** Two standalone functions inside `finance.js` (lines
~933 and ~994) call `toLocalIso(new Date())` directly when invoked without a `today` argument.
These paths are not reached through the main App.jsx memos and have no visible effect on the
core date override. Document and defer.

---

### 3. Admin section — Desktop Sidebar

**Where:** After the Life Events submenu `</div>` (line 962), before the sidebar's closing `</div>` (line 964).

**Render gate:** `{isAdmin && ( ... )}`

**Visual design:**
```
─────────────── (1px border-subtle divider) ───────────────
ADMIN TOOLS                                    (10px, teal, uppercase, lock icon left)

Lock Date                                      (label, 9px, text-secondary, uppercase)
[ date input       ] [Set] [Clear]
  or when active:
[ 2026-04-15 ✓ ]                [Clear ×]
```

**Specifics:**
- Divider: `borderTop: "1px solid var(--color-border-subtle)", marginTop: "8px", paddingTop: "8px"`
- Section label: `fontSize: "10px"`, `letterSpacing: "2px"`, `color: "var(--color-accent-primary)"`, teal left-bar 3px
- Date input: uses `iS` spread from `ui.jsx`, `type="date"`, `value={tempLockDate ?? ""}`, full width
- Set button: gold/teal bg, 10px uppercase, disabled if no value in draft
- Clear button: only shown when `tempLockDate` is set; bg-raised, text-secondary, red on hover
- Local draft state within this section: `dateInputDraft` (string) — follows numeric input standard, no coerce on change
- On "Set": validate it's a parseable date, call `setTempLockDate(dateInputDraft)`
- On "Clear": `setTempLockDate(null)`, reset `dateInputDraft` to `""`

**State for the date input draft:**
The desktop sidebar is not a separate component — it lives directly in App.jsx JSX.
Add a single `useState` near top of App function:
```jsx
const [adminDateDraft, setAdminDateDraft] = useState("");
```

---

### 4. Admin section — Mobile Drawer

**Where:** Before the "Active section indicator" div at bottom of drawer (~line 1188).

**Content:** Identical to desktop sidebar admin section. Same `adminDateDraft` state,
same `setTempLockDate` handler. Both surfaces share the same state — editing in one
reflects in the other after re-render.

---

### 5. Header badge — Mobile (when `isAdmin && tempLockDate`)

**Where:** Inside the title block div (lines 1022–1030), as a second row below the
employer label / fiscal week badge row.

**Visual:**
```
[ DHL / P&G ]  [ Wk 16 ]
[ 🔒 Apr 15 ——————— × ]   ← new row, only when tempLockDate is set
Authority Finance
```

**Pill style:**
- Background: `rgba(245,158,11,0.15)` (warning amber, tinted)
- Border: `1px solid rgba(245,158,11,0.4)`
- Color: `var(--color-warning)` for text/icon
- BorderRadius: `4px`
- Padding: `2px 6px 2px 8px`
- FontSize: `9px`, uppercase, letterSpacing `1px`
- Display: `inline-flex`, alignItems `center`, gap `6px`

**Content:** `🔒` icon + formatted short date (e.g. `Apr 15`) + `×` button
- `×` button: `onClick={() => setTempLockDate(null)}`, transparent bg, no border, cursor pointer, color `var(--color-warning)`
- Formatted date: `new Date(tempLockDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })` — the `T12:00:00` prevents UTC-midnight timezone shift

---

### 6. Header badge — Desktop Sidebar (when `isAdmin && tempLockDate`)

**Where:** After the unconfirmed weeks badge (~line 915), before `</div>` closing the sidebar header.

**Visual:** Same pill as mobile but full-width, matches sidebar badge style:
```
🔒 Locked: Apr 15                          [×]
```
- Block-level pill button (same width as unconfirmed badge)
- Warning amber color to distinguish from fiscal week (green) and unconfirmed (red)
- `×` click → `setTempLockDate(null)`

---

### 7. Hamburger admin button state

In the mobile drawer, when `tempLockDate` is active, the "Admin Tools" section header
shows a live indicator:
```
⚠ ADMIN TOOLS — LOCKED: Apr 15
```
Color stays teal for the section label; append the date in gold/warning to indicate an
active override.

This gives a second visible cue inside the drawer itself so the user knows the lock is on
without needing to scroll to the admin section.

---

## Edge Cases & Guards

| Scenario | Behavior |
|----------|----------|
| Lock date = today | No visible change; `effectiveToday === today`. Badge still appears (visual reminder). |
| Lock date in the past | Past-week classification widens. More weeks appear unconfirmed. `currentWeek` points back in time. Working as designed. |
| Lock date in the future | `futureWeeks` shrinks. `currentWeek` jumps forward. Unconfirmed count may drop to 0. Working as designed. |
| Lock date = before `FISCAL_YEAR_START` | All fiscal weeks are "future". App shows empty/week-0 state. No crash — just empty. Admin knows what they're doing. |
| Non-admin account logs in (stale localStorage) | `effectiveToday = today` because `isAdmin` is false. Badge never shows. No impact on data. |
| User clears from badge ×  | `setTempLockDate(null)`. Snap-back is immediate (next render). `effectiveToday` reverts to real `today`. |
| User clears from drawer | Same `setTempLockDate(null)` call. Identical outcome. |
| Page refresh with lock active | `localStorage.getItem("admin_temp_lock_date")` re-hydrates `tempLockDate` in `useState` initializer. Lock survives refresh. |
| Sign-out | `tempLockDate` stays in localStorage. On sign-in, if `isAdmin` is true again, lock resumes. If not admin, lock is inert. Clear on sign-out is intentionally NOT done — admin controls their own tool. |
| Invalid date string in localStorage | `useState` initializer reads it as a non-null string. `effectiveToday` will be an invalid ISO string. Add a guard in the initializer: check `Date.parse(val) > 0` before accepting. |
| Midnight tick fires while lock is active | `setToday(...)` runs, `today` updates, but `effectiveToday` stays as `tempLockDate`. No visible change. |
| Admin sets lock then navigates panels | All panels receive `effectiveToday`. No panel has a local `new Date()` call that bypasses this (panels use the `today` prop). |
| Date input draft left blank and Set clicked | Button is disabled (`disabled={!adminDateDraft}`). No action. |

---

## Files Touched

| File | Changes |
|------|---------|
| `src/App.jsx` | State, effect, memo, sidebar section, drawer section, mobile header badge, desktop sidebar badge. All changes. |
| `src/constants/config.js` | None. |
| `src/lib/db.js` | None. Not persisted to Supabase (intentionally local). |
| `database/migrations/` | None. |
| `src/components/ui.jsx` | None. Reuse `iS`/`lS` primitives. |

---

## Implementation Order (this file's TODO list)

1. **[DONE when checked] Add `tempLockDate` state + persistence effect + `effectiveToday` memo to App.jsx**
   - Insert state near line 198
   - Insert persistence effect after midnight-tick effect (~line 372)
   - Insert `effectiveToday` useMemo immediately after

2. **Replace all `today` → `effectiveToday` in downstream memos and panel props**
   - 17 substitutions across App.jsx (see table in item 2 above)
   - Add `effectiveToday` to dep arrays; remove bare `today` from those same arrays

3. **Add `adminDateDraft` state to App.jsx**
   - Single `useState("")` near the top of the App function, below `isAdmin` state

4. **Add Admin Tools section to desktop sidebar**
   - After Life Events block (~line 962), inside nav
   - Gated by `isAdmin`

5. **Add Admin Tools section to mobile drawer**
   - Before "Viewing:" indicator at bottom (~line 1188)
   - Gated by `isAdmin`

6. **Add lock date badge to mobile header title block**
   - Inside lines 1022-1030, second row under employer/week labels
   - Gated by `isAdmin && tempLockDate`
   - Includes `×` clear button

7. **Add lock date badge to desktop sidebar header**
   - After unconfirmed badge (~line 915)
   - Gated by `isAdmin && tempLockDate`
   - Includes `×` clear button

8. **Add localStorage guard in `tempLockDate` initializer**
   - Validate stored string is a parseable date before using it

9. **Run tests**
   - `npm run test:run` — ensure no regressions

10. **Commit and push to `claude/admin-temp-lock-date-5Wqdc`**
