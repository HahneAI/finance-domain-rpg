// Daily subscription-lifecycle cron (docs/TODO.md §17.G). Registered in
// vercel.json `crons`; Vercel invokes it with GET and, when the CRON_SECRET
// env var is set, an `Authorization: Bearer <CRON_SECRET>` header — which this
// route requires, so it can't be triggered by anonymous traffic.
//
// Runs service-role over every user_data row with a seeded trial, delegates
// the what-to-do decision per row to decideLifecycleAction (_lifecycleEngine),
// and sends via Resend (_email). Throttle state (last_dunning_email_at /
// dunning_email_count) is only stamped AFTER a successful send, so a failed
// send is simply retried on the next run.
//
// Day-21+7 archive-then-delete (§17.I, wired 2026-07-06): delete-due rows are
// snapshotted into deleted_accounts (upsert-on-email, migration 017) BEFORE
// the hard delete, so non-payment deletion stays revivable.
//
// Migration 044 (user-initiated deletion never hard-fails to the user):
// delete-account.js now locks an account by stamping deletion_requested_at
// BEFORE attempting the same archiveAndDeleteAccount() below inline, and
// returns success to the user either way. If that inline attempt fails
// partway (Stripe hiccup, transient auth-admin error, etc.), the row is left
// locked-but-not-purged — sweepPendingDeletions() below finds those rows
// every run and retries the exact same archive until it succeeds, same as
// this file's own delete-due retry-by-omission pattern.
//
// Migration 046: sweepPendingDeletions() can only find rows that STILL have a
// user_data row (deletion_requested_at lives there). The specific failure
// found live 2026-08-30 — auth.admin.deleteUser() rejected by a
// consent_records foreign key (migration 045 fixed the constraint itself) —
// happens AFTER user_data is already deleted, so that flag is gone by the
// time it matters and this sweep alone could never recover it. See
// api/_accountArchive.js's finishPendingAuthPurges() (called below,
// independent of everything else in this file) for the durable fix.

import { createClient } from "@supabase/supabase-js";
import { decideLifecycleAction } from "./_lifecycleEngine.js";
import { buildLifecycleEmail } from "./_lifecycleEmails.js";
import { sendEmail, isEmailConfigured } from "./_email.js";
import { isTrackedBetaTester } from "../src/lib/entitlements.js";
import { archiveAndDeleteAccount, finishPendingAuthPurges } from "./_accountArchive.js";

// docs/TODO.md §37 — beta program halfway nudge threshold. A throttle column
// (halfway_email_sent_at) makes exact-day precision unnecessary: this only
// needs to be "at least 5 weeks in and never sent before," not "exactly day 35."
const BETA_HALFWAY_MS = 5 * 7 * 24 * 60 * 60 * 1000;

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Retries archiveAndDeleteAccount() for every row delete-account.js locked
// (deletion_requested_at set) but couldn't fully purge inline — a transient
// Stripe/auth-admin failure at request time, or the request's own function
// timing out. Runs every cron pass, independent of the trial-lifecycle rows
// query below (a locked row may have no trial_started_at at all — an
// investor or admin account, say — so it can't ride that query's filter).
async function sweepPendingDeletions(adminClient, now, summary) {
  const { data: pendingRows, error: pendingFetchError } = await adminClient
    .from("user_data")
    .select("user_id")
    .not("deletion_requested_at", "is", null);
  if (pendingFetchError) {
    console.error("cron-subscription-lifecycle: pending-deletion sweep fetch failed:", pendingFetchError.message);
    summary.errors += 1;
    return;
  }

  for (const row of pendingRows) {
    try {
      await archiveAndDeleteAccount(adminClient, row.user_id, now, "user_requested");
      summary.deleted += 1;
      console.log(`cron-subscription-lifecycle: user ${row.user_id} archived + deleted (user-requested retry)`);
    } catch (err) {
      // Left locked for the next run to retry — same as the delete-due path.
      summary.errors += 1;
      console.error(`cron-subscription-lifecycle: pending-deletion retry failed for ${row.user_id}:`, err.message);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!env.CRON_SECRET) {
    console.error("cron-subscription-lifecycle: CRON_SECRET is not set");
    return res.status(500).json({ error: "Server configuration is missing" });
  }
  if (req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL/SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    !isEmailConfigured() && "EMAIL_API_KEY",
  ].filter(Boolean);
  if (missing.length) {
    console.error("cron-subscription-lifecycle missing env vars:", missing.join(", "));
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error: fetchError } = await adminClient
    .from("user_data")
    .select(
      "user_id, subscription_status, stripe_subscription_id, trial_started_at, trial_ends_at, " +
        "access_ends_at, card_on_file, last_dunning_email_at, dunning_email_count, " +
        "current_period_end, is_admin, is_investor, is_tester, beta_code_used, beta_started_at, " +
        "halfway_email_sent_at"
    )
    .not("trial_started_at", "is", null);
  if (fetchError) {
    console.error("cron-subscription-lifecycle fetch failed:", fetchError.message);
    return res.status(500).json({ error: "Failed to load accounts" });
  }

  const now = new Date();
  const appUrl = env.APP_URL ? env.APP_URL.replace(/\/+$/, "") : "";
  const summary = { checked: rows.length, sent: 0, reset: 0, deleteDue: 0, deleted: 0, errors: 0, betaHalfwaySent: 0, authPurgesFinished: 0 };

  for (const row of rows) {
    try {
      const action = decideLifecycleAction(row, now);

      if (action.deleteDue) {
        summary.deleteDue += 1;
        // The account is being removed — archive+delete takes precedence over
        // any same-run deletion_warning email (nothing to warn about anymore).
        await archiveAndDeleteAccount(adminClient, row.user_id, now, "non_payment_dunning_expired");
        summary.deleted += 1;
        console.log(`cron-subscription-lifecycle: user ${row.user_id} archived + deleted (non-payment, day 21+7)`);
        continue;
      }

      // docs/TODO.md §37 — independent of the trial/grace/deletion action above;
      // a row can get both its own lifecycle email this run AND the beta
      // halfway nudge, since they're unrelated concerns for the same account.
      if (
        isTrackedBetaTester({ isTester: row.is_tester, betaCodeUsed: row.beta_code_used })
        && row.beta_started_at
        && !row.halfway_email_sent_at
        && (now.getTime() - new Date(row.beta_started_at).getTime()) >= BETA_HALFWAY_MS
      ) {
        try {
          const { data: betaUserData, error: betaUserError } = await adminClient.auth.admin.getUserById(row.user_id);
          const betaEmail = betaUserData?.user?.email;
          if (betaUserError || !betaEmail) {
            throw new Error(`no email for user: ${betaUserError?.message ?? "auth row missing"}`);
          }
          const halfwayMessage = buildLifecycleEmail("beta_halfway", { appUrl });
          await sendEmail({ to: betaEmail, ...halfwayMessage });
          const { error: halfwayStampError } = await adminClient
            .from("user_data")
            .update({ halfway_email_sent_at: now.toISOString() })
            .eq("user_id", row.user_id);
          if (halfwayStampError) throw new Error(`halfway stamp failed: ${halfwayStampError.message}`);
          summary.betaHalfwaySent += 1;
        } catch (err) {
          // Independent failure — must not abort this row's own lifecycle action below.
          summary.errors += 1;
          console.error(`cron-subscription-lifecycle: beta halfway email failed for ${row.user_id}:`, err.message);
        }
      }

      if (action.type === "reset") {
        const { error: resetError } = await adminClient
          .from("user_data")
          .update({ last_dunning_email_at: null, dunning_email_count: 0 })
          .eq("user_id", row.user_id);
        if (resetError) throw new Error(`reset failed: ${resetError.message}`);
        summary.reset += 1;
        continue;
      }

      if (action.type !== "email") continue;

      const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(row.user_id);
      const email = userData?.user?.email;
      if (userError || !email) {
        throw new Error(`no email for user: ${userError?.message ?? "auth row missing"}`);
      }

      const message = buildLifecycleEmail(action.template, {
        trialDaysLeft: action.trialDaysLeft,
        appUrl,
      });
      await sendEmail({ to: email, ...message });

      // Stamp throttle state only after the send succeeded — a failure above
      // leaves the row untouched so the next run retries it.
      const { error: stampError } = await adminClient
        .from("user_data")
        .update({
          last_dunning_email_at: now.toISOString(),
          dunning_email_count: (row.dunning_email_count ?? 0) + 1,
        })
        .eq("user_id", row.user_id);
      if (stampError) throw new Error(`throttle stamp failed: ${stampError.message}`);
      summary.sent += 1;
    } catch (err) {
      // One bad row must not abort the whole run.
      summary.errors += 1;
      console.error(`cron-subscription-lifecycle: user ${row.user_id} failed:`, err.message);
    }
  }

  // Runs after the trial-lifecycle loop so any row deleteDue already purged
  // above is naturally gone from this query and never double-processed.
  await sweepPendingDeletions(adminClient, now, summary);

  // Migration 046 — independent of everything above: retries the final
  // auth.users purge for any tombstone still marked auth_purge_pending,
  // regardless of whether that account got there via this cron's own
  // delete-due path or delete-account.js's user-initiated one. Never let a
  // problem here abort the run — same "one bad thing doesn't sink the whole
  // pass" posture as every other step in this file.
  try {
    const purgeResults = await finishPendingAuthPurges(adminClient, now);
    summary.authPurgesFinished = purgeResults.purged;
    summary.errors += purgeResults.errors;
  } catch (err) {
    summary.errors += 1;
    console.error("cron-subscription-lifecycle: finishPendingAuthPurges failed:", err.message);
  }

  console.log("cron-subscription-lifecycle summary:", JSON.stringify(summary));
  return res.status(200).json(summary);
}
