# Admin Toolkit — Feature Backlog

All features are `isAdmin`-gated. Accessible from the Admin Tools section in the hamburger
menu / desktop sidebar. Mobile-first, no browser console required.

---

## Tier 1 — High Value (build next)

### 1. Live State Inspector
Collapsible floating overlay (bottom corner button) showing all key derived values in real
time. Everything you currently need devtools to see.

**Surfaces:**
- `effectiveToday` / real `today` (both, so lock offset is visible)
- `currentWeek.idx` + week label
- `futureWeeks.length`
- `taxDerived.extraPerCheck`, `taxDerived.totalGap`, `taxDerived.taxedWeekCount`
- `fundedGoalSpend`
- `unconfirmedCount`
- `bufferPerWeek`, `weeklyIncome`
- `projectedAnnualNet`

**UX:** Floating pill button → expands to a dark overlay card. Stays on top of all panels.
Values update live as state changes.

---

### 2. Week Inspector
Tap any week row in the Income timeline → admin gets a modal showing every property on that
week object. The fiscal week engine is the deepest part of the app — this surfaces everything
without a single console command.

**Shows per week:**
- `idx`, `weekStart`, `weekEnd`
- `grossPay`, `taxableGross`, `isHighWeek`, `taxedBySchedule`
- `workedDayNames`, `scheduledDays`
- `computeNet` result (live, with current config)
- Confirmation record (if any): `confirmedAt`, `dayToggles`, `netShiftDelta`
- Event log entries touching this week (list with type + net impact)
- `weekNetLookup` entry: `spendable`, `adjustedSpendable`, `adjustment`

**UX:** Long-press or admin-mode tap target on any week row. Full-screen modal, scrollable.

---

### 3. Config Snapshot / Restore
Save the full account state (config + logs + expenses + goals) as a named local snapshot.
Restore any time. Like `git stash` for the account — set a known-good baseline, run
destructive tests, snap back without touching Supabase.

**Behavior:**
- Up to 5 named snapshots stored in `localStorage`
- Save: prompts for a name (e.g. "pre-raise test", "clean baseline")
- Restore: confirms before overwriting live state
- Delete: swipe or trash button per snapshot
- Snapshots are local-only, never pushed to Supabase

---

### 4. Config Raw View + Copy/Paste
One button dumps the live `config` object as formatted JSON to a scrollable code block.
Copy to clipboard. Paste field imports a modified JSON back — no wizard, no field-by-field
editing, direct config manipulation for scenario testing.

**Behavior:**
- View mode: formatted JSON, copy-to-clipboard button
- Edit mode: textarea pre-filled with current config JSON, parse + apply on save
- Validates JSON before applying (catches syntax errors, shows line number)
- Does not auto-save to Supabase — requires explicit "Save to DB" confirmation

---

## Tier 2 — Medium Value

### 5. Force Supabase Sync
Manual "Push now" / "Pull now" buttons that bypass the 800ms debounce. Certainty that a
save landed before switching devices on mobile. Current debounce means you're guessing.

**Behavior:**
- Push: triggers `saveUserData` immediately, shows success/error toast
- Pull: re-runs `loadUserData`, merges fresh data into state, shows what changed
- Both show a spinner + timestamp of last successful sync

---

### 6. Per-Entry Event Impact Breakdown
The Log Effect Summary shows totals. Admin tap on any log entry shows the exact delta that
entry contributes — isolate a single entry's math without console work.

**Shows per entry:**
- Net lost / gained
- 401k impact (lost / match lost / gained / match gained)
- PTO hours lost
- Bucket hours affected
- Which fiscal weeks it touches
- Whether it's treated as past or future (relative to `effectiveToday`)

**UX:** Expand chevron on each log entry row, admin-only. Inline, no modal.

---

### 7. Bulk Week Confirmation Seeding
In the Admin Tools section: quick-seed all past weeks to a preset confirmation pattern.
Speeds up testing the week confirmation flow from scratch.

**Presets:**
- "Mark all as fully worked" — all scheduled days confirmed, no misses
- "Mark all as missed" — all days toggled off
- "Reset all" — wipe all `weekConfirmations`, return to unconfirmed state

**UX:** Three buttons with confirm dialogs. Destructive action warning on reset.

---

### 8. Remaining Tax Weeks Grid
Compact 52-cell visual grid of the fiscal year showing each week's tax status at a glance.
Faster orientation than the Tax Plan list view.

**Cell states:**
- Teal fill = taxed, future
- Dark fill = untaxed, future
- Gray = past (taxed or not)
- Gold border = current week
- Red dot = has a `pastWeekTaxStatusOverride`

**UX:** Read-only by default. Admin tap on a future week toggles taxed/untaxed inline
(writes to `config.taxedWeeks`). Replaces needing to scroll the Tax Plan list to find a
specific week.

---

## Tier 3 — Lower Priority

### 9. Past/Future Week Override
Force any specific week to be treated as past or future regardless of `effectiveToday`.
Edge-case testing for the confirmation modal trigger and event log cascade path-splitting.

**Behavior:** Per-week toggle stored in a session-only override map (not persisted).
Cleared when `effectiveToday` changes or page reloads.

---

### 10. Supabase Row Viewer
Show the raw `user_data` row exactly as it sits in the database. Catches drift between
in-memory state and what was actually persisted — the real source of subtle bugs after
a failed save or mid-session migration.

**Shows:**
- Raw Supabase response JSON for all columns
- `updated_at` timestamp
- Diff view: in-memory state vs. DB row (highlights fields that haven't been saved yet)

**UX:** Read-only. Refresh button to re-fetch without reloading the app.

---

## Implementation Notes

- All Tier 1 items are read-only or local-only — zero risk of corrupting live data
- Build State Inspector (#1) + Week Inspector (#2) together as a combined "Admin Debug Panel"
- Config Snapshot (#3) is the safety net that should exist before any serious scenario testing
- All items route through the existing `isAdmin` gate in App.jsx — no new auth needed
