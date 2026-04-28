# Admin Toolkit — Feature Backlog

All features are `isAdmin`-gated minimum. Items marked `[OWNER]` require the separate
`isOwner` flag and are off-limits to regular admin accounts. See the final section for
the `isOwner` implementation spec.

---

## Tier 1 — High Value (build next)

### 1. Live State Inspector `[ADMIN]`
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

### 2. Week Inspector `[ADMIN]`
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

### 3. Config Snapshot / Restore `[OWNER]`
Save the full account state (config + logs + expenses + goals) as a named local snapshot.
Restore any time. Like `git stash` for the account — set a known-good baseline, run
destructive tests, snap back without touching Supabase.

**Why OWNER:** Restore overwrites live Supabase data. A bad snapshot containing a corrupt
`firstActiveIdx` or malformed `taxedWeeks` would permanently break the fiscal calendar with
no undo. Regular admins can VIEW saved snapshots but not restore them.

**Behavior:**
- Up to 5 named snapshots stored in `localStorage`
- Save: prompts for a name (e.g. "pre-raise test", "clean baseline") — available to `isAdmin`
- Restore: `isOwner` only — confirms before overwriting live state
- Delete: swipe or trash button per snapshot
- Snapshots are local-only, never pushed to Supabase

---

### 4. Config Raw View + Copy/Paste `[OWNER]`
One button dumps the live `config` object as formatted JSON to a scrollable code block.
Copy to clipboard. Paste field imports a modified JSON back — no wizard, no field-by-field
editing, direct config manipulation for scenario testing.

**Why OWNER:** Completely bypasses all validation. A developer could paste any value for
`firstActiveIdx` and shatter the fiscal calendar with a single save. Read-only view (copy
only) is safe for `isAdmin`. Write/apply is `isOwner` only.

**Behavior:**
- View + copy mode: available to `isAdmin`
- Edit/apply mode: `isOwner` only — textarea pre-filled with current config JSON, parse + apply on save
- Validates JSON before applying (catches syntax errors, shows line number)
- Does not auto-save to Supabase — requires explicit "Save to DB" confirmation

---

## Tier 2 — Medium Value

### 5. Force Supabase Sync `[ADMIN]`
Manual "Push now" / "Pull now" buttons that bypass the 800ms debounce. Certainty that a
save landed before switching devices on mobile. Current debounce means you're guessing.

**Behavior:**
- Push: triggers `saveUserData` immediately, shows success/error toast
- Pull: re-runs `loadUserData`, merges fresh data into state, shows what changed
- Both show a spinner + timestamp of last successful sync

---

### 6. Per-Entry Event Impact Breakdown `[ADMIN]`
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

### 7. Bulk Week Confirmation Seeding `[OWNER]`
In the Admin Tools section: quick-seed all past weeks to a preset confirmation pattern.
Speeds up testing the week confirmation flow from scratch.

**Why OWNER:** "Reset all" wipes the entire `weekConfirmations` object from Supabase. This
destroys all confirmation history and cannot be reversed without a snapshot restore. The
"mark all worked" preset is lower risk but still makes a broad permanent write — owner only.

**Presets:**
- "Mark all as fully worked" — all scheduled days confirmed, no misses
- "Mark all as missed" — all days toggled off
- "Reset all" — wipe all `weekConfirmations`, return to unconfirmed state

**UX:** Three buttons with confirm dialogs. Destructive action warning on reset.

---

### 8. Remaining Tax Weeks Grid `[ADMIN read / OWNER edit]`
Compact 52-cell visual grid of the fiscal year showing each week's tax status at a glance.
Faster orientation than the Tax Plan list view.

**Cell states:**
- Teal fill = taxed, future
- Dark fill = untaxed, future
- Gray = past (taxed or not)
- Gold border = current week
- Red dot = has a `pastWeekTaxStatusOverride`

**UX:** Read-only view for `isAdmin`. `isOwner` gets inline toggle on future weeks (writes
to `config.taxedWeeks`). Replaces needing to scroll the Tax Plan list to find a specific week.

---

## Tier 3 — Lower Priority

### 9. Past/Future Week Override `[ADMIN]`
Force any specific week to be treated as past or future regardless of `effectiveToday`.
Edge-case testing for the confirmation modal trigger and event log cascade path-splitting.

**Behavior:** Per-week toggle stored in a session-only override map (not persisted).
Cleared when `effectiveToday` changes or page reloads.

---

### 10. Supabase Row Viewer `[ADMIN]`
Show the raw `user_data` row exactly as it sits in the database. Catches drift between
in-memory state and what was actually persisted — the real source of subtle bugs after
a failed save or mid-session migration.

**Shows:**
- Raw Supabase response JSON for all columns
- `updated_at` timestamp
- Diff view: in-memory state vs. DB row (highlights fields that haven't been saved yet)

**UX:** Read-only. Refresh button to re-fetch without reloading the app.

---

## Security Audit Findings

**Audited:** All current admin features + all 10 planned toolkit items.

### Cross-user data risk: NONE
Every write path flows through `saveUserData()` in `src/lib/db.js`, which always resolves
the current user's ID from `getCurrentUserId()` and aborts if unauthenticated. The Supabase
upsert uses `onConflict: "user_id"` — there is no code path that accepts a target user ID
as a parameter or writes to any row other than the logged-in user's own row.

A developer with `isAdmin` can only ever affect their own account, not any other user's.

**One structural caveat:** Supabase RLS is currently disabled (migration 001). Security relies
entirely on client-side userId scoping. This is acceptable for a single-owner app but becomes
a risk if the platform ever opens to multiple users. Adding RLS is a separate backlog item.

### Fields that are permanently destructive if set wrong

| Field | Location | Risk | Assigned to |
|-------|----------|------|-------------|
| `firstActiveIdx` | Tax Plan editor | **Nuclear.** Repositions the entire fiscal calendar. All weeks before the new index become inactive — no taxes, no 401k, no gross pay counted. DHL rotation flips. Cannot be meaningfully undone without a migration. | `[OWNER]` only |
| `taxedWeeks` | Tax Plan editor / Tax Weeks Grid | Corrupted or cleared array breaks all withholding math. Manually reversible via UI toggles but tedious. | Grid edit → `[OWNER]` |
| `pastWeekTaxStatusOverrides` | Tax Plan editor | Per-week retroactive overrides. Wrong values silently shift past withholding amounts. Recoverable by re-toggling. | Tax Plan stays `[ADMIN]` |
| `fedStdDeduction` | Tax Plan editor | Setting to 0 inflates federal tax liability by thousands. Recoverable. | Tax Plan stays `[ADMIN]` |
| `moFlatRate` | Tax Plan editor | Setting to 0 erases all state withholding. Setting high overstates it. Recoverable. | Tax Plan stays `[ADMIN]` |
| `targetOwedAtFiling` | Tax Plan editor | Math-layer gated on `isAdmin` already. Extreme values (negative, 999999) break `extraPerCheck`. Recoverable. | Tax Plan stays `[ADMIN]` |
| Config Snapshot Restore | Planned #3 | Can restore a snapshot containing any of the above bad values in a single tap. | `[OWNER]` only |
| Config Raw JSON Apply | Planned #4 | Bypasses all field-level validation. Same blast radius as the above combined. | `[OWNER]` only |
| Bulk Confirmation Reset | Planned #7 | Wipes `weekConfirmations` from Supabase permanently. | `[OWNER]` only |

---

## New Todo: Create `isOwner` Flag

Separate flag from `isAdmin`. Owner = full control. Admin = elevated visibility +
non-destructive tooling only. An admin cannot self-promote to owner through any app UI.

### Implementation spec

**1. Supabase migration**
```sql
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;
UPDATE user_data SET is_owner = true
WHERE user_id = 'db07a039-a917-4f32-ac66-58007485d9ec';
```
Seed is hardcoded by user ID — same pattern as `is_admin` in `003_add_flags.sql`.
Owner status can ONLY be granted via a migration, never through the app UI.

**2. `db.js` — load + save**
- Add `is_owner` to the SELECT in `loadUserData()`
- Return `isOwner: data.is_owner ?? false` from the load
- Do NOT include `is_owner` in the upsert payload in `saveUserData()` — it must never
  be writable through the app, only through direct DB/migration access

**3. `App.jsx` — state**
```jsx
const [isOwner, setIsOwner] = useState(false);
// In loadUserData().then():
setIsOwner(data.isOwner);
```
Pass `isOwner` as a prop to ProfilePanel (Tax Plan) and use inline in App.jsx admin sections.

**4. Gate the spicy tools**
Replace `isAdmin` with `isOwner` on:
- `firstActiveIdx` field in Tax Plan editor (ProfilePanel.jsx ~line 1350)
- Config Snapshot Restore action (planned #3)
- Config Raw JSON apply/save action (planned #4)
- Bulk Week Confirmation Seeding (planned #7)
- Tax Weeks Grid edit toggle (planned #8)

`isAdmin` retains access to all read-only and session-only tools.

**5. Admin Tools UI label**
When `isOwner` is true, show "Owner" instead of "Admin" in the Admin Tools section header
so the distinction is visible at a glance on the device.

---

## Access Matrix

| Tool | isAdmin | isOwner |
|------|---------|---------|
| Temp Lock Date | ✓ | ✓ |
| Live State Inspector | ✓ | ✓ |
| Week Inspector | ✓ | ✓ |
| Per-Entry Event Impact | ✓ | ✓ |
| Force Supabase Sync | ✓ | ✓ |
| Past/Future Week Override | ✓ | ✓ |
| Supabase Row Viewer (read) | ✓ | ✓ |
| Config Raw View + Copy | ✓ | ✓ |
| Tax Plan Editor (most fields) | ✓ | ✓ |
| Tax Weeks Grid (read) | ✓ | ✓ |
| Config Snapshot Save | ✓ | ✓ |
| Tax Weeks Grid (edit) | — | ✓ |
| `firstActiveIdx` edit | — | ✓ |
| Config Raw JSON Apply | — | ✓ |
| Config Snapshot Restore | — | ✓ |
| Bulk Week Confirmation Seeding | — | ✓ |

---

## Implementation Notes

- Build State Inspector (#1) + Week Inspector (#2) together as a combined "Admin Debug Panel"
- Config Snapshot (#3 save) is the safety net that should exist before any serious scenario testing
- `isOwner` migration must be written before any `[OWNER]` tools are built — gate exists before feature
- No RLS is the one systemic risk that sits outside this flag system — track separately

