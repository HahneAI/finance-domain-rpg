# Admin Diagnostic Toolkit — Complete Reference

**Gate:** `isAdmin` (from `user_data.is_admin`) unlocks all Phase 1 tools.
`isOwner` (`user_data.is_owner`, not yet built) unlocks Phase 2 destructive tools — never grantable via UI.
`isAiAdmin` (`user_data.is_ai_admin`) unlocks a slimmed, read-only subset of Phase 1 for AI-agent-team
accounts — see "AI Admin" below.

**How to use:** Ask the user to open the Admin Tools sheet (Tools icon in mobile bottom nav), run the relevant tool, and paste or describe the output.

---

## AI Admin — `isAiAdmin` (7 diagnostic tools + full front-line feature access)

**Gate:** `isAiAdmin` (from `user_data.is_ai_admin`, migration
`042_add_is_ai_admin_flag.sql`) — a narrower sibling to `isAdmin`, intended for accounts used by
an AI agent team to diagnose their own account's data AND exercise the product like a real user.
Two separate things it grants, kept deliberately distinct:

1. **Admin Tools (diagnostic-only).** Rendered as a separate "AI Admin Tools" block
   (`src/App.jsx`), shown only when `isAiAdmin && !isAdmin` (a full admin already sees everything
   in the regular Admin Tools block, so the two never double up). Combined internally via
   `const isDiagnosticAdmin = isAdmin || isAiAdmin` for the tools shared with Phase 1 (Live State
   Inspector, Week Inspector, Per-Entry Impact Breakdown, and the `isAdmin` prop passed into
   `IncomePanel`/`LogPanel`, which only ever gates read-only display in those two components).
2. **Front-line feature access (2026-08-24).** `isAiAdmin` is a full tester-tier peer in
   `src/lib/entitlements.js` — `hasTesterAccess`/`hasPrivilegedAccess` both OR it in alongside
   `isAdmin`/`isTester`/`isInvestor`, so `canAccessTaxPlan`, `canAccessAiFeatures`, and
   `canAccessAskCoachGeneral` all pass for an AI Admin account exactly as they would for a real
   beta tester — Tax Plan, Job Hunt Assistant/Résumé Review, Ask Coach, the Net Worth Check-In
   card. `App.jsx`'s `paywallBypassed` includes it too, so an AI Admin account never hits the
   paywall. This is verified server-side in `api/coach.js` (never trusted from the client) exactly
   like the other three tiers.

**AI Admin Coach usage cap (migration `043_add_ai_admin_coach_usage_cap.sql`).** Unlike a human
beta tester, an AI agent can loop an Ask Coach conversation far faster than any person would,
which could burn through the shared Anthropic API budget during routine feature testing.
`api/coach.js` enforces a rudimentary daily call cap — default 25/day (`AI_ADMIN_COACH_DAILY_LIMIT`
env var to override) — tracked via `user_data.ai_admin_coach_calls_date` /
`ai_admin_coach_calls_count`, written only through a service-role client (same pattern as
`api/delete-account.js`; the client itself has no write grant on these columns). Scoped
**exclusively** to `is_ai_admin` accounts — admin/tester/investor/real trial-paid callers never
touch this code path or these columns. Over the cap returns HTTP 429 before calling Anthropic.

**Zero elevated DB privilege.** Every tool below reads only the signed-in account's own
`user_data` row, which default per-row RLS already permits — `is_ai_admin` is never referenced by
any RLS policy (unlike `is_admin`, which is checked directly in migrations 013/032/037 for
investor codes, changelog, and beta content). It is an app-level UI gate only.

**Included (identical to their Phase 1 versions — see each tool's own section above for
detail):** Lock Date · Force Sync — **Pull only** · Config Raw View · DB Row Viewer · Tax Weeks
Grid (view) · Live State Inspector · Week Inspector · Per-Entry Impact Breakdown.

**Deliberately excluded, and why:**

| Tool | Why excluded |
|------|--------------|
| Force Sync — **Push** | Writes the current in-memory state to the DB immediately |
| Reopen Last Check-In | Deletes a `weekConfirmations` record + its log entry |
| Demo Account editing (1/2) | Writes to demo account rows |
| Beta Report CSV (Usage/Feedback) | Reads other users' aggregated data, not the caller's own account |
| Changelog / Beta Content / Beta Scores admin panels (`ProfilePanel.jsx`) | Write published, user-facing content via service-role routes |
| Phase 2 / `isOwner` tools | Destructive by design — already excluded from Phase 1 too |

If a future Phase 1 tool is added, it must be explicitly triaged into this table (included or
excluded, with a reason) rather than silently inherited by either gate.

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
- **Special fields:** When any §1 field carries a value, a "Life Events" header lists: `newJobSeasonMode`, `newJobSeasonDate`, `newJobSeasonCashOnHand`/`newJobSeasonCashOnHandAsOf`, `newJobSeasonPendingCheckAmount`/`Date`, `unemploymentEnabled`/`Weekly`/`DurationWeeks`/`WaitingWeek`, `returnToWorkDate`, and entry counts for `jobApplications`/`jobHuntIncomeLog`
- **Session insight:** Reveals full tax strategy (`taxExemptOptIn`, `targetOwedAtFiling`, `pastWeekTaxStatusOverrides`) and deduction setup in one shot — ask for this first whenever the issue could involve pay structure, tax elections, or benefit configuration

### DB Row Viewer
- **Invoke:** Tools sheet → DB Row → Fetch
- **Purpose:** Shows raw `user_data` row + `updated_at`; **Drift** badge lists any column where in-memory value ≠ DB value (`config`, `expenses`, `goals`, `logs`, `show_extra`, `week_confirmations`, `pto_goal`)
- **Ask for:** "run Fetch and paste the drift line and updated_at"
- **Session insight:** Exposes spending profile and goal inventory (the only tool that does this — essential for budget health, goal timelines, or data-match issues)
- **Also surfaces:**
  - §3 config-history line: "config history: N snapshots · latest [date] ([source]) · [changed fields]" — ask when verifying config edits captured in `account_history`
  - §2.H4 "Coach Chats" line: "N saved chats (breakdown by type)" — tap to expand 5 most recent titles; ask when verifying conversation persistence
  - §1.I "Triage" line (New Job Season): "X active · Y paused · Z cancelled" — flags any expense with `autoReactivateOnIncome === false`; ask when New Job Season Back to Work reactivation looks incomplete

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
- **New Job Season indicator:** Amber dot on pill when `config.newJobSeasonMode` is true; expanded card shows `New Job Season Date`, `Unemployment Wkly`, `Unemployment Wks Left`
- **Ask for:** "open Live and paste all values, noting whether the New Job Season dot is showing"
- **Session insight:** Quick snapshot of all key financial values — use early in any diagnostic about displayed numbers

### Week Inspector
- **Invoke:** Tap any week row in Income panel
- **Display:** Full-screen modal showing every week field
  - Schedule: workedDayNames, hours, OT, weekend
  - Pay: grossPay, taxableGross, deductions, 401k, live computeNet
  - Net Lookup: baseNet, adjustment, spendable
  - Confirmation record + all log entries for that week with net impact
- **New Job Season note:** Pay section adds `Unemployment` row when `w.unemploymentIncome > 0`; shows "New Job Season — outside benefit window" if no benefit that week
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
7. **New Job Season state (§1.I)** — Live State Inspector (confirm amber New Job Season dot + paste values) + DB Row Fetch (paste Triage line) + Config JSON (paste Life Events header). Ask for all three when issue involves runway, benefits, or expense triage during New Job Season.
