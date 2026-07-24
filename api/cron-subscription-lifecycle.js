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
// the hard delete, so non-payment deletion stays revivable — this is the ONLY
// deletion path that archives; the user-initiated flow in delete-account.js
// stays a true hard delete with no archive.

import { createClient } from "@supabase/supabase-js";
import { decideLifecycleAction } from "./_lifecycleEngine.js";
import { buildLifecycleEmail } from "./_lifecycleEmails.js";
import { sendEmail, isEmailConfigured } from "./_email.js";
import { STRIPE_CLIENTS, cancelStripeSubscription } from "./_stripeClient.js";
import { isTrackedBetaTester } from "../src/lib/entitlements.js";

// docs/TODO.md §37 — beta program halfway nudge threshold. A throttle column
// (halfway_email_sent_at) makes exact-day precision unnecessary: this only
// needs to be "at least 5 weeks in and never sent before," not "exactly day 35."
const BETA_HALFWAY_MS = 5 * 7 * 24 * 60 * 60 * 1000;

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// §17.I archive-then-delete for one delete-due account (day 21+7, no card).
// Order matters for retry safety — every step throws on failure, the per-row
// catch in the handler counts it, and the next daily run retries from scratch:
//   1. resolve the auth user (email keys the tombstone),
//   2. snapshot the full user_data row,
//   3. cancel any lingering Stripe subscription (same both-mode lookup as
//      delete-account.js — a lapsed past_due sub may still exist),
//   4. upsert the tombstone (on email, so a revive → lapse → delete cycle
//      overwrites the same row instead of piling up duplicates),
//   5. only then hard-delete user_data + the auth user.
async function archiveAndDeleteAccount(adminClient, userId, now) {
  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
  const user = userData?.user;
  if (userError || !user?.email) {
    throw new Error(`archive: no auth user/email (${userError?.message ?? "auth row missing"})`);
  }

  const { data: fullRow, error: rowError } = await adminClient
    .from("user_data")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (rowError || !fullRow) {
    throw new Error(`archive: snapshot fetch failed (${rowError?.message ?? "row missing"})`);
  }

  if (fullRow.stripe_subscription_id) {
    if (STRIPE_CLIENTS.length === 0) {
      throw new Error("archive: subscription on file but no Stripe key configured");
    }
    await cancelStripeSubscription(fullRow.stripe_subscription_id, STRIPE_CLIENTS);
  }

  // Supabase reports "email" as the provider for password accounts; the
  // tombstone only records real OAuth providers (so the revival screen knows
  // to show "Continue with Google" instead of a password field).
  const provider = user.app_metadata?.provider ?? null;
  const { error: archiveError } = await adminClient.from("deleted_accounts").upsert(
    {
      email: user.email,
      former_user_id: userId,
      display_name: fullRow.display_name ?? null,
      avatar_url: fullRow.avatar_url ?? null,
      oauth_provider: provider && provider !== "email" ? provider : null,
      archived_config: fullRow.config ?? null,
      archived_expenses: fullRow.expenses ?? null,
      archived_goals: fullRow.goals ?? null,
      archived_logs: fullRow.logs ?? null,
      archived_show_extra: fullRow.show_extra ?? null,
      archived_week_confirmations: fullRow.week_confirmations ?? null,
      archived_pto_goal: fullRow.pto_goal ?? null,
      stripe_customer_id: fullRow.stripe_customer_id ?? null,
      plan: fullRow.plan ?? null,
      deletion_reason: "non_payment_dunning_expired",
      deleted_at: now.toISOString(),
      // Reopen the tombstone fresh on a second deletion cycle.
      revived_at: null,
      revival_attempt_count: 0,
      last_revival_attempt_at: null,
      last_decline_code: null,
      last_decline_message: null,
    },
    { onConflict: "email" }
  );
  if (archiveError) throw new Error(`archive: tombstone upsert failed (${archiveError.message})`);

  const { error: dataDeleteError } = await adminClient
    .from("user_data")
    .delete()
    .eq("user_id", userId);
  if (dataDeleteError) throw new Error(`archive: user_data delete failed (${dataDeleteError.message})`);

  const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (authDeleteError) throw new Error(`archive: auth delete failed (${authDeleteError.message})`);
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
  const summary = { checked: rows.length, sent: 0, reset: 0, deleteDue: 0, deleted: 0, errors: 0, betaHalfwaySent: 0 };

  for (const row of rows) {
    try {
      const action = decideLifecycleAction(row, now);

      if (action.deleteDue) {
        summary.deleteDue += 1;
        // The account is being removed — archive+delete takes precedence over
        // any same-run deletion_warning email (nothing to warn about anymore).
        await archiveAndDeleteAccount(adminClient, row.user_id, now);
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

  console.log("cron-subscription-lifecycle summary:", JSON.stringify(summary));
  return res.status(200).json(summary);
}
