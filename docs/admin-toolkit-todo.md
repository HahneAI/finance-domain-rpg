# Admin Toolkit — Feature Backlog

Two phases. Phase 1 is everything available to any `isAdmin` account. Phase 2 is
everything restricted to `isOwner` — the separate owner flag that can only be granted
via a database migration, never through the app UI.

Within each phase, items run from quickest to build → deepest sprint.

---

# Phase 1 — isAdmin Tools

---

### 1. Force Supabase Sync
**Effort: Quick win**

Two buttons in the Admin Tools section that bypass the 800ms debounce. When testing
across devices on mobile you have no certainty a save actually landed. This fixes that.

- **Push now** — triggers `saveUserData` immediately, shows success/error toast + timestamp
- **Pull now** — re-runs `loadUserData`, merges fresh data into state, shows what changed
- Both show a spinner while in flight

---

### 2. Config Raw View + Copy
**Effort: Quick win**

Dumps the live `config` object as formatted JSON into a scrollable code block with a
copy-to-clipboard button. Read-only. No write path — that's owner territory.

- One button to expand/collapse the view
- Copy button puts the JSON on the clipboard
- Useful for sharing your config state when debugging or handing off to a developer

---

### 3. Supabase Row Viewer
**Effort: Quick win**

Shows the raw `user_data` row exactly as it sits in the database. Catches drift between
in-memory state and what was actually persisted — the source of subtle bugs after a failed
save or a mid-session migration.

- **Fetch** button re-queries `supabase.from("user_data").select("*")` for the current user
- Displays full JSON response in a scrollable block
- Shows `updated_at` timestamp
- Highlights any columns whose in-memory value doesn't match the DB row (diff view)
- Read-only

---

### 4. Tax Weeks Grid — Read Only
**Effort: Medium**

Compact 52-cell visual grid of the full fiscal year showing each week's tax status at a
glance. Much faster than scrolling the Tax Plan list to orient yourself.

**Cell states:**
- Teal fill — taxed, future
- Dark fill — untaxed, future
- Gray — past (taxed or not)
- teal border — current week
- Red dot — has a `pastWeekTaxStatusOverride`

Cells are display-only for `isAdmin`. Edit capability is owner-only (Phase 2).

---

### 5. Live State Inspector
**Effort: Medium**

Floating pill button fixed to the bottom corner of the screen, always visible when
`isAdmin`. Tapping it expands into an overlay card showing every key derived value
in real time — everything you'd normally need devtools to see.

**Surfaces:**
- `effectiveToday` and real `today` side by side (so lock offset is obvious)
- `currentWeek.idx` + week label
- `futureWeeks.length`
- `taxDerived.extraPerCheck`, `taxDerived.totalGap`, `taxDerived.taxedWeekCount`
- `fundedGoalSpend`
- `unconfirmedCount`
- `bufferPerWeek`, `weeklyIncome`
- `projectedAnnualNet`

Values update live as state changes. Overlay stays on top of all panels.

---

### 6. Per-Entry Event Impact Breakdown
**Effort: Medium**

The Log panel today shows totals only. This adds an expand chevron to each individual
log entry (admin-only) that reveals exactly what that one entry contributes to the math.
Inline, no modal.

**Shows per entry:**
- Net lost / gained
- 401k impact (lost, match lost, gained, match gained)
- PTO hours lost
- Bucket hours affected
- Which fiscal weeks it touches
- Whether it's classified as past or future relative to `effectiveToday`

`calcEventImpact` is already imported in LogPanel — this is purely a display add.

---

### 7. Week Inspector
**Effort: Deeper sprint**

Long-press (or admin-mode tap) on any week row in the Income timeline opens a full-screen
modal showing every property on that week object. The fiscal week engine is the most
complex part of the app — this surfaces it completely on mobile without a single console
command.

**Shows per week:**
- `idx`, `weekStart`, `weekEnd`
- `grossPay`, `taxableGross`, `isHighWeek`, `taxedBySchedule`
- `workedDayNames`, `scheduledDays`
- `computeNet` result (live with current config)
- Confirmation record if any: `confirmedAt`, `dayToggles`, `netShiftDelta`
- All event log entries touching this week with type + net impact each
- `weekNetLookup` entry: `spendable`, `adjustedSpendable`, `adjustment`

Requires a callback from App.jsx → IncomePanel + a modal rendered at App level.

---

# Phase 2 — isOwner Tools

The `isOwner` flag must be implemented before any tool in this phase is built.
See the implementation spec at the bottom of this file.

---

### 1. isOwner Flag — Foundation
**Effort: Quick win (prerequisite for everything below)**

New `is_owner` column in Supabase. Seeded by migration with a hardcoded user ID.
Cannot be granted through the app — only via direct DB/migration access.

Full spec in the **isOwner Implementation** section at the bottom.

---

### 2. Lock firstActiveIdx Behind isOwner
**Effort: Quick win (one gate change)**

`firstActiveIdx` is the nuclear field — setting it wrong repositions the entire fiscal
calendar retroactively. Currently editable by any `isAdmin` in the Tax Plan editor.

Change: make that specific field in ProfilePanel render as read-only for `isAdmin`,
editable only when `isOwner`. One conditional on the input element.

---

### 3. Tax Weeks Grid — Edit Toggle
**Effort: Quick win (builds on Phase 1 #4)**

Once the read-only grid exists (Phase 1 #4), add `onClick` to future week cells for
`isOwner` only. Tapping a cell toggles it in `config.taxedWeeks` and triggers a config
save. Admins see the same grid but cells don't respond to tap.

---

### 4. Bulk Week Confirmation Seeding
**Effort: Medium**

Three preset buttons in the Admin Tools section that bulk-write `weekConfirmations` to
Supabase. Each requires a confirmation dialog.

- **Mark all as fully worked** — all scheduled days confirmed, no misses
- **Mark all as missed** — all days toggled off
- **Reset all** — wipes `weekConfirmations` entirely, returns to unconfirmed state

"Reset all" permanently deletes history and cannot be reversed without a snapshot restore.

---

### 5. Config Raw JSON Apply
**Effort: Medium (builds on Phase 1 #2)**

Extends the Config Raw View (Phase 1 #2) with a write path for `isOwner`. A textarea
pre-filled with the current config JSON becomes editable. On save: validates JSON,
shows any syntax errors with line numbers, then applies and optionally persists to Supabase.

- Validate before apply (catches bad JSON, missing required fields)
- Apply to in-memory state immediately
- Separate "Save to DB" confirmation to persist
- Does not bypass the `firstActiveIdx` guard — that field is still owner-gated even here

---

### 6. Config Snapshot / Restore
**Effort: Deeper sprint**

Full save/restore system for the complete account state: config + logs + expenses + goals.
Like `git stash` for the account. Set a known-good baseline before any destructive test,
restore in one tap.

- Up to 5 named snapshots in `localStorage`
- **Save** (isAdmin can save) — prompts for a name, stores full state snapshot
- **Restore** (isOwner only) — confirms before overwriting live in-memory state and Supabase
- **Delete** — trash button per snapshot, no confirmation needed
- Snapshots never auto-push to Supabase — restore is the only Supabase write path
- Restoring a snapshot containing a corrupt `firstActiveIdx` still goes through the owner gate

---

## isOwner Implementation Spec

**Migration** — new file `database/migrations/016_add_is_owner.sql`:
```sql
ALTER TABLE user_data ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;
UPDATE user_data SET is_owner = true
WHERE user_id = 'db07a039-a917-4f32-ac66-58007485d9ec';
```
Same pattern as `is_admin` in `003_add_flags.sql`. Hardcoded by user ID.

**`db.js` — load:**
- Add `is_owner` to the SELECT columns in `loadUserData()`
- Return `isOwner: data.is_owner ?? false` in the return object

**`db.js` — save:**
- Do NOT include `is_owner` in the `saveUserData()` upsert payload
- It must never be writable through the app — only via migration

**`App.jsx` — state:**
```jsx
const [isOwner, setIsOwner] = useState(false);
// in loadUserData().then():
setIsOwner(data.isOwner);
```
Pass `isOwner` as a prop wherever needed (ProfilePanel for Tax Plan gate, Admin Tools sections).

**Admin Tools UI:**
When `isOwner` is true, show "Owner" instead of "Admin" in the Admin Tools section header.

---

## Security Audit Summary

**Cross-user risk: NONE.** Every write flows through `saveUserData()` which always
resolves `getCurrentUserId()` and upserts only to that row. A developer with `isAdmin`
can only affect their own account, never another user's.

**Structural caveat:** Supabase RLS is currently disabled. Client-side user ID scoping
is the only enforcement. Acceptable for a single-owner app; becomes a risk at multi-user
scale. Track as a separate backlog item.

**Permanently destructive fields (require isOwner):**

| Field | Risk |
|-------|------|
| `firstActiveIdx` | Repositions the entire fiscal calendar. Cannot be undone without a migration. |
| `taxedWeeks` (bulk edit) | Corrupted array breaks all withholding math. |
| `weekConfirmations` (reset) | Wipes confirmation history permanently. |
| Config Raw JSON Apply | Bypasses all field validation — same blast radius as the above combined. |
| Config Snapshot Restore | Can restore any of the above bad values in a single tap. |
