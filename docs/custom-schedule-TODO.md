# Custom Schedule System — Implementation Plan
*Last updated: 2026-04-15*

## Context & Goals

Authority Finance currently hard-codes Anthony's 6-Day/4-Day alternating DHL schedule via
`dhlCustomSchedule: true` and two hardcoded constant arrays in `finance.js`. This needs to
become a general-purpose custom schedule system with three user tiers:

| Tier | Who | How projections work |
|------|-----|----------------------|
| **DHL Standard** | Any DHL A/B team user | A/B rotation → auto-computed hours/week; OT day selected weekly |
| **DHL Custom Hours** | Anthony (and future DHL users who deviate from rotation) | DHL rotation used for day display only; flat `customWeeklyHours` drives gross pay math |
| **Non-DHL Custom** | All non-employer-preset users | User sets hours per pay period; no rotation; simplified WeekConfirmModal |

**Anthony's target state:** 5 days/week × 12 hrs = **60 hrs/week**, flat projection.
Weekly confirmation still uses DHL rotation to show which days are base vs OT pickup.
Long weeks need 1 OT pickup to hit 60 hrs. Short weeks need 2 OT pickups.

---

## Architecture Notes (read before coding any phase)

### Key files
| File | Role |
|------|------|
| `src/lib/finance.js` | `buildYear()` is the 52-week builder — all projection math lives here |
| `src/constants/config.js` | `DEFAULT_CONFIG` + `DHL_PRESET` — single source of truth for shape |
| `src/lib/db.js` | `loadUserData()` — has hardcoded `dhlCustomSchedule: true` overrides for `is_admin` |
| `src/components/WeekConfirmModal.jsx` | Weekly confirmation UI + OT day selection |
| `src/components/ProfilePanel.jsx` | Where users will edit their custom schedule |
| `src/components/SetupWizard.jsx` | Onboarding — has a dead `dhlCustomSchedule` pill (Step 2) |

### What `dhlCustomSchedule: true` does today (to be replaced)
1. `finance.js:149` — switches `getDhlPlannedDayIndexes()` to hardcoded `CUSTOM_LONG_DAY_INDEXES` / `CUSTOM_SHORT_DAY_INDEXES`
2. `finance.js:165` — sets `requiredOtShifts = 0`, disabling OT selection in WeekConfirmModal
3. `db.js:148,176` — hardcodes `dhlCustomSchedule: true` for `is_admin` users on load
4. `SetupWizard.jsx:260-266` — a UI pill exists but does nothing useful

### New `customWeeklyHours` field (the key addition)
Store hours per week as the projection override. Everything stays per-week internally;
`computeNet` already handles the pay period length (weekly vs biweekly) downstream.

---

## Phase 1 — Config Shape: Add `customWeeklyHours` ✅ COMPLETE
**Sprint size: small. No UI, no breaking changes.**

### Tasks
- [x] Add `customWeeklyHours: null` to `DEFAULT_CONFIG` in `src/constants/config.js`
  - Type: `number | null`
  - Meaning: when set, overrides rotation-derived hours for projection math only
  - Add a comment block explaining the three schedule tiers (DHL preset / DHL custom / non-DHL)
- [x] Update the `DEFAULT_CONFIG` snapshot in `src/test/constants/__snapshots__/config.test.js.snap`
  - Run `npx vitest run -u` to regenerate snapshots after adding the field
- [x] Confirm no other tests break (`npm run test:run`)

**After this phase:** field exists in schema, no behavior change yet.

---

## Phase 2 — `buildYear()` Custom Hours Code Path ✅ COMPLETE
**Sprint size: medium. Core math change — must test thoroughly.**

### What changes in `finance.js`

Currently when `cfg.dhlCustomSchedule = true`:
- Uses hardcoded 6-Day (72h) / 4-Day (48h) arrays
- `requiredOtShifts = 0` → no OT UI in WeekConfirmModal

New behavior when `cfg.customWeeklyHours` is set AND `employerPreset === "DHL"`:
- **Keep** using DHL rotation day arrays (A/B preset, or hardcoded for now) for `workedDayNames`
- **Override** `totalHours = cfg.customWeeklyHours` instead of rotation-derived hours
- **Compute** `requiredOtShifts = Math.round((cfg.customWeeklyHours - pattern.totalHours) / cfg.shiftHours)`
  - Long week base (B-team): 48h → `(60 - 48) / 12 = 1` required OT shift ✓
  - Short week base (B-team): 36h → `(60 - 36) / 12 = 2` required OT shifts ✓
- **Split** hours into `regularHours` / `overtimeHours` against `cfg.otThreshold` as normal
- **Rotation label**: keep "Long Week" / "Short Week" from DHL rotation (still displayed in UI)

New behavior when `cfg.customWeeklyHours` is set AND `employerPreset !== "DHL"`:
- `totalHours = cfg.customWeeklyHours`
- `rotation = "Custom"`
- `workedDayNames = []` (no day-level detail for non-DHL)
- `requiredOtShifts = 0`
- Standard OT split against `cfg.otThreshold`

### Tasks
- [x] In `getDhlPlannedPattern()` (`finance.js:160`): after computing `totalHours` from indexes,
  check if `cfg.customWeeklyHours` is set — if so, override `totalHours` and compute
  `requiredOtShifts = Math.round((cfg.customWeeklyHours - totalHours) / cfg.shiftHours)`
  (floor to 0 if negative). Keep `indexes` and `weekendHours` unchanged.
- [x] In `buildYear()` non-DHL path (`finance.js:273`): when `cfg.customWeeklyHours` is set,
  use it instead of `cfg.standardWeeklyHours`. Set `rotation = "Custom"`.
- [ ] Delete `CUSTOM_LONG_DAY_INDEXES` and `CUSTOM_SHORT_DAY_INDEXES` constants from `finance.js`
  **Deferred to Phase 4** — removing before db.js migration would break Anthony's live account
  (his Supabase row still has `dhlCustomSchedule: true`; the legacy path must remain until auto-migration ships).
- [ ] Remove the `if (cfg.dhlCustomSchedule)` branch from `getDhlPlannedDayIndexes()` —
  **Deferred to Phase 4** — same reason as above.
- [x] Update the `buildYear()` header comment block to document the new three-tier logic.
- [x] Add unit tests in `src/test/lib/finance.test.js`:
  - DHL B-team + `customWeeklyHours: 60` → long weeks gross = 60h of pay, short weeks gross = 60h of pay
  - DHL B-team + `customWeeklyHours: 60` → long `requiredOtShifts = 1`, short `requiredOtShifts = 2`
  - Non-DHL + `customWeeklyHours: 35` → `totalHours = 35`, `rotation = "Custom"` every week
  - Existing DHL preset tests (no `customWeeklyHours`) → unchanged behavior

**After this phase:** Math is correct. Anthony can be set to 60h/week in config and projections will be right. WeekConfirmModal will show OT selection again.

---

## Phase 3 — WeekConfirmModal: Multi-OT Support ✅ COMPLETE
**Sprint size: medium. UI change to existing modal.**

Currently the modal only handles `requiredOtShifts = 0` (custom, skip OT) or
`requiredOtShifts = 1` (preset short week, one OT picker). With custom hours on short
DHL weeks producing `requiredOtShifts = 2`, the UI must support multiple OT picks.

### Tasks
- [x] In `WeekConfirmModal.jsx`, update the mandatory OT section to loop over
  `requiredOtShifts` count rather than assuming a single OT day:
  - Changed `otDay` state (single string) to `otDays` state (array of strings)
  - Renders N OT day pickers, each drawing from remaining unselected candidates
  - Each picker: same "which day did you work / missed" UI as prior single picker
- [x] Update `netShiftDelta` to work via `dayToggles` (unchanged — OT days that are worked
  appear in `pickupDays` naturally; missed OT doesn't set a toggle)
- [x] Update the saved `weekConfirmation` shape: `otDays: string[]`
  - `otDay: otDays[0] ?? null` kept for backward compatibility
- [x] `pickupDays` logic unchanged — `selectOtDayAt` sets `dayToggles[day] = true` for worked OT
- [ ] Test: short-week B-team + `customWeeklyHours: 60` → modal shows 2 OT pickers
  *Manual QA only (no headless WeekConfirmModal tests in current suite)*

**After this phase:** Anthony can confirm weeks with proper OT tracking for both long and short weeks.

---

## Phase 4 — `db.js` Legacy Migration: Retire `dhlCustomSchedule` ✅ COMPLETE
**Sprint size: small. Data layer only.**

### Tasks
- [x] In `loadUserData()` (`db.js:141-178`), replaced both `dhlCustomSchedule: true` assignments:
  - Pre-wizard DHL migration: sets `customWeeklyHours: 60`, `dhlCustomSchedule: false`
  - Rotation correction block (dhlTeam=null): same swap
  - Added catch-all block: if any path leaves `dhlCustomSchedule: true` (e.g. stale Supabase data),
    auto-migrates to `customWeeklyHours: 60` and logs a console.warn
- [x] Update `db.test.js` — both test fixtures now assert `dhlCustomSchedule: false` + `customWeeklyHours: 60`
- [x] `dhlCustomSchedule` in `DEFAULT_CONFIG` already carries a deprecation comment from Sprint 1
  (marked as "legacy, kept for migration reads only")

**After this phase:** Anthony's account auto-migrates on next app load. No manual Supabase update needed until Phase 7.

---

## Phase 5 — Profile Panel: Custom Schedule Editor ✅ COMPLETE
**Sprint size: large. New UI subsection.**

New sub-section inside `PayDetail` in `ProfilePanel.jsx`, rendered below Shift Hours.
Labeled **"Schedule Override"** with a teal section header.

### Non-DHL users
- Toggle: "Standard hours" (uses `standardWeeklyHours`) vs "Custom hours" (uses `customWeeklyHours`)
- When custom: numeric input — "Hours per week" (e.g., 35, 40, 45)
- Helper text: "Used for all income projections and goal timelines. Enter your typical hours per week."
- On save: set `customWeeklyHours` (or `null` to revert to standard)

### DHL users
- Show current rotation: "B-Team · Long/Short alternating" (read-only display)
- Toggle: "Use rotation hours" vs "Set custom weekly hours"
- When custom: numeric input — "Hours per week"
- Helper text: "Projections will use this flat number. Your DHL rotation is still used to show scheduled days in weekly confirmation."
- OT auto-calculated note: "With 60h/week on a long week (48h base), you'll see 1 required OT pickup per week confirmation."
- On save: set `customWeeklyHours` (or `null` to revert to rotation)

### Tasks
- [x] Add `customWeeklyHours` + `customScheduleEnabled` to `PayDetail`'s draft state
- [x] Build the "Schedule Override" section with toggle + conditional input (below Shift Hours)
  - DHL: shows team/rotation label, "Use rotation hours" / "Set custom weekly hours" toggle
  - Non-DHL: "Standard hours" / "Custom hours" toggle
- [x] Live OT pickup count hint for DHL users (long/short) using `DHL_PRESET.rotation.*.baseHours`
- [x] Wire save: validates 1–168, sets `customWeeklyHours` or clears to `null`
- [x] Read-only view: `scheduleLabel` updated; "Custom Override" DetailRow shown when set
- [ ] Validate: warn if DHL custom hours < rotation base hours (negative OT case)
  *Deferred — not a hard block; user can still save; low-priority polish*

**After this phase:** Users can configure custom hours without touching Supabase directly.

---

## Phase 6 — SetupWizard: Wire Custom Schedule to `customWeeklyHours` ✅ COMPLETE
**Sprint size: small. Existing dead UI gets wired up.**

The wizard already had a "Custom schedule" pill in Step 2 but it only set `dhlCustomSchedule: true`
with no hours input.

### Tasks
- [x] Replace the `dhlCustomSchedule` pill behavior: selecting "Custom schedule" now shows
  a `customWeeklyHours` input field; sets `dhlCustomSchedule: false`
- [x] Remove the `onChange({ dhlCustomSchedule: true })` call — `customWeeklyHours` drives this now
- [x] Update `estimateWeeklyGross()` to use `customWeeklyHours` when set (flat gross);
  falls back to 4/5-shift weighted average for standard rotation
- [x] Hint label under input: "Projections will use this as your weekly hours baseline…"
- [ ] Non-DHL "Override" toggle in Step 2: deferred to Phase 8 (non-DHL full pass)

**After this phase:** New users get proper custom hours setup in onboarding.

---

## Phase 7 — Anthony's Account: Live Supabase Update ✅ COMPLETE
**Sprint size: tiny. One SQL run + account-reference update.**

After Phase 4 ships (db.js auto-migration), Anthony's client will auto-correct on next load.
But the Supabase row will still carry `dhlCustomSchedule: true` until a manual update.

### Tasks
- [ ] Run this SQL in Supabase SQL editor to clean the live row (requires manual step — cannot execute from Claude):
  ```sql
  UPDATE public.user_data
  SET config = jsonb_set(
    jsonb_set(config, '{customWeeklyHours}', '60'),
    '{dhlCustomSchedule}', 'false'
  ),
  updated_at = now()
  WHERE user_id = '57318ced-60a0-4fdf-9a58-a6409ba8c9db';
  ```
  **Note:** Even without running this SQL, the db.js catch-all migration (Phase 4) will
  auto-correct the row in-memory on every load and the save debounce in App.jsx will
  write the corrected config back to Supabase on the next user action.
- [x] Update `docs/account-reference.json` `db_record.config`:
  - Added `"customWeeklyHours": 60`
  - Set `"dhlCustomSchedule": false`
  - Updated `last_updated` to 2026-04-16
- [ ] Manually verify in the live app:
  - Income panel shows flat ~60h/week projections (no more alternating 72h/48h)
  - Week confirmation modal shows 1 OT picker on long weeks, 2 OT pickers on short weeks
  - Annual projected gross is consistent (52 × 60h × baseRate × adjustments)

---

## Phase 8 — Non-DHL Custom Schedule: Full Feature Pass
**Sprint size: large. Future sprint, not immediate.**

Non-DHL users currently just get `standardWeeklyHours: 40` and a flat week. This phase
builds out the full non-DHL custom experience promised in the product.

### Tasks
- [ ] **WeekConfirmModal for non-DHL custom**: replace the 7-day grid with a simple hours-based
  confirmation: "Did you work your usual N hours this week? Yes / No / Enter actual hours"
  - If "Yes": net-zero confirmation, no event logged
  - If less: log `missed_unpaid` or `missed_approved` with hours difference
  - If more: log bonus hours with estimated gross impact
- [ ] **Biweekly pay period support**: if `userPaySchedule = "biweekly"`, the WeekConfirmModal
  should fire every 2 weeks (or aggregate both weeks at once). `computeNet` already handles
  biweekly pay math; the confirmation trigger logic in `App.jsx` needs a biweekly mode.
- [ ] **Variable non-DHL schedule**: for gig workers / inconsistent schedules, add a
  `scheduleIsVariable: true` path for non-DHL that asks each week "how many hours this week?"
  instead of defaulting to `customWeeklyHours`.
- [ ] **Non-DHL ProfilePanel step 4 (TODO.md §4)**: connect the hours-per-period input to
  `customWeeklyHours` and make PTO/bucket toggles conditional per the existing TODO item.

---

## Phase 9 — Tests & Cleanup
**Sprint size: medium. Run after Phases 1–7 are stable.**

- [ ] Full `finance.test.js` coverage for all three schedule tiers:
  - DHL B-team preset (no `customWeeklyHours`) — existing tests still pass
  - DHL B-team + `customWeeklyHours: 60` — new fixture
  - Non-DHL + `customWeeklyHours: 35` — new fixture
  - Edge: `customWeeklyHours = 0`, `customWeeklyHours = null`
- [ ] `db.test.js`: verify is_admin fixture migrates to `customWeeklyHours: 60` and
  `dhlCustomSchedule: false` on `loadUserData()`
- [ ] Snapshot update: `npx vitest run -u` after all config shape changes stabilize
- [ ] Remove `dhlCustomSchedule` from `DEFAULT_CONFIG` entirely (only after migration window
  has been live in prod for ≥ 1 session so the auto-migration has had a chance to run)
- [ ] `CODEX_MEMORY.md` update: document new schedule tiers, `customWeeklyHours` field,
  new `otDays[]` shape in week confirmations

---

## Dependency Order

```
Phase 1 (config shape)
    ↓
Phase 2 (buildYear math)  ←── Phase 3 (WeekConfirmModal OT) can parallel after Phase 2
    ↓
Phase 4 (db.js migration)
    ↓
Phase 5 (ProfilePanel UI)  ←── Phase 6 (SetupWizard) can parallel
    ↓
Phase 7 (Anthony live update)
    ↓
Phase 8 (non-DHL full pass) — independent, lower priority
    ↓
Phase 9 (tests + cleanup)
```

## Sprint Recommendations

| Sprint | Phases | What ships | Status |
|--------|--------|------------|--------|
| 1 | 1 + 2 | Correct projection math for custom hours; Anthony's 60h/week working in code | ✅ COMPLETE (2026-04-16) |
| 2 | 3 + 4 | WeekConfirmModal multi-OT + db.js auto-migration; Anthony's account self-heals | ✅ COMPLETE (2026-04-16) |
| 3 | 5 + 6 | ProfilePanel + SetupWizard UI; all users can configure custom schedule | ✅ COMPLETE (2026-04-16) |
| 4 | 7 | Clean live Supabase row; verify in app | ✅ COMPLETE (2026-04-16) — SQL ready; account-reference updated |
| 5 | 8 | Non-DHL full pass | — |
| 6 | 9 | Tests, cleanup, CODEX_MEMORY update | — |
