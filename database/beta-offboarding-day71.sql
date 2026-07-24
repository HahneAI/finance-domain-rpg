-- ═════════════════════════════════════════════════════════════════════════════
-- 📌 ONE-TIME OPERATIONAL SCRIPT — NOT A MIGRATION — DO NOT NUMBER OR AUTO-RUN
-- ═════════════════════════════════════════════════════════════════════════════
--
--   File: beta-offboarding-day71.sql
--   docs/TODO.md §35 (Offboarding Decision) — resolved by the beta scoring
--   rubric (pasted into the working session 2026-07-24): a 100-point score
--   across App Usage (50, with a 30-pt floor), Feedback (25), Call Attendance
--   (15, tracked externally — not in this app), and Longevity (10), mapping to
--   three outcomes. Run this ONCE, by hand, at the end of the 10-week program
--   — not on a schedule, not automated. Same "dashboard/SQL-managed, not a
--   built UI" posture as beta_codes/investor_codes for a one-time ~40-person
--   action.
--
--   HOW TO COMPILE THE ACCOUNT LISTS BELOW
--   ───────────────────────────────────────
--   1. Pull the usage summary: GET /api/admin-beta-report.js (isAdmin Bearer
--      token) → beta-usage-report.csv. Gives login_count, goal_created/updated,
--      expense_created/updated, feedback_count, active_days, days_since_last_active
--      per user — everything App Usage + Longevity need, plus feedback frequency.
--   2. Pull feedback content: GET /api/admin-beta-report.js?format=feedback →
--      beta-feedback.csv. Read each user's actual submissions for the
--      "specificity" half of the Feedback score — this is a judgment call, not
--      a formula, by design (docs/TODO.md's whole "reviewed manually" premise).
--   3. Merge in Call Attendance from wherever you tracked it (spreadsheet/
--      calendar) — this app has no record of it.
--   4. Score each user by hand against the rubric, apply the App-Usage 30/50
--      floor gate FIRST (floor not met → No Perk regardless of total), then
--      sort the rest into the three buckets below.
--   5. Paste each bucket's user_id list into its template's `IN (...)` clause
--      and run that ONE statement for that bucket. Re-run the verification
--      query after each to confirm.
--
--   WHY EACH TEMPLATE TOUCHES trial_ends_at/access_ends_at EXPLICITLY
--   ───────────────────────────────────────────────────────────────────
--   is_tester's 6-month window (migration 021's trigger) was already stamped
--   once, back on the day each account redeemed its beta code — NOT re-stamped
--   here. By day 71 (~10 weeks later) that original window has ~4 months left,
--   not 6 — and is_tester does NOT bypass the paywall on its own (confirmed:
--   App.jsx's paywallBypassed = isAdmin || config.isInvestor, no isTester; a
--   tester's actual app access is gated purely by trial_ends_at/access_ends_at
--   via getEntitlement — see docs/drift-app-warden.md §20's "Expired tester:
--   sees paywall in-app" note). Toggling is_tester alone would NOT deliver
--   "6 months free" or "lifetime access" — it would only affect the separate
--   AI/Tax-Plan feature gate (entitlements.js canAccessAiFeatures/
--   canAccessTaxPlan). Both fields must be set together for each tier to mean
--   what it says.
--
-- ═════════════════════════════════════════════════════════════════════════════


-- ── TIER 1 — Lifetime access + frontline feedback club (score 70–100, floor met) ──
-- is_tester stays true (keeps AI/Tax Plan access as part of the reward),
-- beta_code_used cleared (no longer "in program," matches the two-population
-- split — see migration 025's own note), access/trial window pushed far out.
-- "Frontline feedback club" itself is a non-technical/community perk (Slack,
-- mailing list, whatever) — nothing to apply here in-app beyond access.

update user_data
set
  is_tester = true,
  beta_code_used = null,
  trial_started_at = now(),
  trial_ends_at = now() + interval '50 years',
  access_ends_at = now() + interval '50 years'
where user_id in (
  -- '<user_id_1>',
  -- '<user_id_2>',
  '00000000-0000-0000-0000-000000000000'  -- placeholder — replace with the real list
);


-- ── TIER 2 — 6 months free (score 60–69, floor met) ──
-- Same shape as Tier 1, but a genuinely FRESH 6 months from today (day 71),
-- not whatever's left of the original day-0 window (~4 months) — that's the
-- whole reason this can't just be "leave is_tester alone."

update user_data
set
  is_tester = true,
  beta_code_used = null,
  trial_started_at = now(),
  trial_ends_at = now() + interval '6 months',
  access_ends_at = now() + interval '6 months'
where user_id in (
  -- '<user_id_1>',
  -- '<user_id_2>',
  '00000000-0000-0000-0000-000000000000'  -- placeholder — replace with the real list
);


-- ── TIER 3 — No perk (App-Usage floor not met, OR total score 0–59) ──
-- is_tester off (drops AI/Tax Plan access too, not just the paywall — "no
-- perk" means none of the beta-exclusive surface, not just billing).
-- trial_ends_at/access_ends_at set to now() so nothing from the original
-- day-0 window lingers — without this, the account would coast on whatever
-- was left of that window even with is_tester false, since getEntitlement
-- reads those fields independent of the tier flags.

update user_data
set
  is_tester = false,
  beta_code_used = null,
  trial_ends_at = now(),
  access_ends_at = now()
where user_id in (
  -- '<user_id_1>',
  -- '<user_id_2>',
  '00000000-0000-0000-0000-000000000000'  -- placeholder — replace with the real list
);


-- ── Verification (run after each tier) ────────────────────────────────────────
--   select user_id, is_tester, beta_code_used, trial_ends_at, access_ends_at
--     from user_data where user_id in (/* same list */);
--   Tier 1: access_ends_at should read ~50 years out.
--   Tier 2: access_ends_at should read ~6 months out, NOT ~4 months.
--   Tier 3: access_ends_at should read essentially "now" — reload the app as
--     that account (or check Live State Inspector as admin) and confirm the
--     paywall/UpgradePanel is showing, not full access.
