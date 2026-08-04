# Admin Diagnostic Toolkit — Complete Reference

**Gate:** `isAdmin` (from `user_data.is_admin`) unlocks all Phase 1 tools.
`isOwner` (`user_data.is_owner`, not yet built) unlocks Phase 2 destructive tools — never grantable via UI.

**How to use:** Ask the user to open the Admin Tools sheet (Tools icon in mobile bottom nav), run the relevant tool, and paste or describe the output.

---

## Phase 1 — isAdmin (all 9 live ✓)

### Lock Date
- **Invoke:** Tools sheet → Lock Date
- **Purpose:** Set a date to simulate a different `effectiveToday`
- **Ask for:** "set lock date to [date] and tell me what the Live Inspector shows for Effective Today, Week, and Future Weeks."

### Reopen Last Check-In
- **Invoke:** Tools sheet → Weekly Check-In
- **Purpose:** Resets the most recent confirmed pay period and reopens the weekly confirm modal as if it was never finished — a safe way to re-review the modal on demand
- **Note:** Drops that week's `weekConfirmations` record (and any log entry it created); income projections are independent of confirmations, so the model is unaffected. Disabled when no confirmed week is eligible.

### Force Sync
- **Invoke:** Tools sheet → Sync
- **Purpose:** **Push ↑** flushes in-memory state to Supabase immediately (bypasses 800ms debounce). **Pull ↓** reloads from DB into memory
- **Use when:** Before/after a save-related bug

### Config Raw View
- **Invoke:** Tools sheet → Config JSON → View ↓
- **Purpose:** Audit any config field; copy button puts it on clipboard
- **Special fields:** When any §1 field carries a value, a "Life Events" header lists: `jobLossMode`, `jobLossDate`, `jobLossCashOnHand`/`jobLossCashOnHandAsOf`, `jobLossPendingCheckAmount`/`Date`, `unemploymentEnabled`/`Weekly`/`DurationWeeks`/`WaitingWeek`, `returnToWorkDate`, and entry counts for `jobApplications`/`jobHuntIncomeLog`
- **Session insight:** Reveals full tax strategy (`taxExemptOptIn`, `targetOwedAtFiling`, `pastWeekTaxStatusOverrides`) and deduction setup in one shot — ask for this first whenever the issue could involve pay structure, tax elections, or benefit configuration

### DB Row Viewer
- **Invoke:** Tools sheet → DB Row → Fetch
- **Purpose:** Shows raw `user_data` row + `updated_at`; **Drift** badge lists any column where in-memory value ≠ DB value (`config`, `expenses`, `goals`, `logs`, `show_extra`, `week_confirmations`, `pto_goal`)
- **Ask for:** "run Fetch and paste the drift line and updated_at"
- **Session insight:** Exposes spending profile and goal inventory (the only tool that does this — essential for budget health, goal timelines, or data-match issues)
- **Also surfaces:**
  - §3 config-history line: "config history: N snapshots · latest [date] ([source]) · [changed fields]" — ask when verifying config edits captured in `account_history`
  - §2.H4 "Coach Chats" line: "N saved chats (breakdown by type)" — tap to expand 5 most recent titles; ask when verifying conversation persistence
  - §1.I "Triage" line (Job Loss): "X active · Y paused · Z cancelled" — flags any expense with `autoReactivateOnIncome === false`; ask when Job Loss Back to Work reactivation looks incomplete

### Tax Weeks Grid
- **Invoke:** Tools sheet → Tax Weeks → View ↓
- **Display:** 52-cell grid
- **Color scheme:** Teal = taxed/future · dark = untaxed/future · gray = past · teal border = current week · red dot = `pastWeekTaxStatusOverride`
- **Ask for:** "open Tax Weeks and describe any red dots or unexpected cell colors"

### Live State Inspector
- **Invoke:** Amber "Live" pill fixed bottom-right corner
- **Purpose:** Real-time status card showing:
  - `effectiveToday` (amber if lock-offset)
  - week idx + label, futureWeeks.length, unconfirmedCount
  - extraPerCheck, totalGap, taxedWeekCount, fundedGoalSpend, freedomAllowancePerWeek
  - weeklyIncome, projectedAnnualNet
  - Subscription phase (`Sub Phase` — trial/grace/active/expired/none), `Trial Ends`, `Access Ends` (hidden day-21 cutoff), `Period End`, `Card / Dunning`
- **Job Loss indicator:** Amber dot on pill when `config.jobLossMode` is true; expanded card shows `Job Loss Date`, `Unemployment Wkly`, `Unemployment Wks Left`
- **Ask for:** "open Live and paste all values, noting whether the Job Loss dot is showing"
- **Session insight:** Quick snapshot of all key financial values — use early in any diagnostic about displayed numbers

### Week Inspector
- **Invoke:** Tap any week row in Income panel
- **Display:** Full-screen modal showing every week field
  - Schedule: workedDayNames, hours, OT, weekend
  - Pay: grossPay, taxableGross, deductions, 401k, live computeNet
  - Net Lookup: baseNet, adjustment, spendable
  - Confirmation record + all log entries for that week with net impact
- **Job Loss note:** Pay section adds `Unemployment` row when `w.unemploymentIncome > 0`; shows "Job Loss Mode — outside benefit window" if no benefit that week
- **Ask for:** "tap week [N] and describe the Pay and Net Lookup sections"
- **Session insight:** Use for specific wrong numbers on paychecks or weeks, or to rule out income math as root cause

### Beta Report
- **Invoke:** Tools sheet → Beta Report → Usage CSV / Feedback CSV
- **Purpose:** Downloads `api/admin-beta-report.js` exports (per-user usage summary; raw feedback submissions) with current admin session token
- **Note:** Only in-app trigger for this endpoint — same as hitting it directly with Bearer token
- **Ask for:** When scoring beta program against the rubric (`docs/TODO.md` §12, `database/beta-offboarding-day71.sql`)

### Per-Entry Impact Breakdown
- **Invoke:** Tap ▼ chevron on any log entry (admin-only) in Log panel
- **Shows:** Impact breakdown — gross, net, 401k employee + match, PTO hours, bucket deduction, fiscal week idx, past/future classification

---

## Phase 2 — isOwner (not yet built)

Full spec in `docs/admin-toolkit-todo.md`

| Tool | Purpose | Risk |
|------|---------|------|
| **isOwner flag** | Migration + `db.js` + App state — prerequisite for everything below | — |
| **Lock `firstActiveIdx`** | Makes this nuclear field read-only for isAdmin, editable only for isOwner | Repositions entire fiscal calendar retroactively |
| **Tax Weeks Grid edit** | Tap a future cell to toggle `config.taxedWeeks` | Corrupts withholding math if misused |
| **Bulk Week Confirmation Seeding** | Mark all weeks as worked / missed / reset all | Reset permanently deletes confirmation history |
| **Config Raw JSON Apply** | Edit + apply config JSON directly | Same blast radius as all fields combined |
| **Config Snapshot / Restore** | Save/restore full account state (config + logs + expenses + goals) | Restore overwrites everything in one tap |

---

## Diagnostic Request Templates

When filing a bug or building a feature that touches fiscal math, ask the user to run these:

1. **Config dump** — Config JSON → Copy to Clipboard → paste here
2. **Drift check** — DB Row → Fetch → report `updated_at` + any drift columns
3. **Date context** — Live State Inspector → paste Effective Today + Week values
4. **Tax grid** — Tax Weeks → View ↓ → screenshot or describe red dots + current week position
5. **Week deep-dive** — tap the suspect week row in Income → describe Pay + Net Lookup + Log Entries sections
6. **Subscription/billing** — DB Row → Fetch (surfaces `subscription_status`/`trial_ends_at`/`access_ends_at`/`card_on_file`/`current_period_end`/`plan`) + Live State Inspector (adds resolved phase). Ask for both when issue involves paywall, trial countdown, or billing state.
7. **Job Loss state (§1.I)** — Live State Inspector (confirm amber Job Loss dot + paste values) + DB Row Fetch (paste Triage line) + Config JSON (paste Life Events header). Ask for all three when issue involves runway, benefits, or expense triage during Job Loss Mode.
