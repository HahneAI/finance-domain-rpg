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
// NOT implemented here (deliberately): the day-21+7 archive-then-delete step.
// §17.I's deleted_accounts tombstone table doesn't exist yet, and deleting a
// non-payment account without archiving first would make revival impossible —
// so delete-due accounts are only counted/logged until §I lands.

import { createClient } from "@supabase/supabase-js";
import { decideLifecycleAction } from "./_lifecycleEngine.js";
import { buildLifecycleEmail } from "./_lifecycleEmails.js";
import { sendEmail, isEmailConfigured } from "./_email.js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

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
        "current_period_end, is_admin, is_investor"
    )
    .not("trial_started_at", "is", null);
  if (fetchError) {
    console.error("cron-subscription-lifecycle fetch failed:", fetchError.message);
    return res.status(500).json({ error: "Failed to load accounts" });
  }

  const now = new Date();
  const appUrl = env.APP_URL ? env.APP_URL.replace(/\/+$/, "") : "";
  const summary = { checked: rows.length, sent: 0, reset: 0, deleteDue: 0, errors: 0 };

  for (const row of rows) {
    try {
      const action = decideLifecycleAction(row, now);

      if (action.deleteDue) {
        summary.deleteDue += 1;
        // §I archive-then-delete not built — log only, never act.
        console.log(`cron-subscription-lifecycle: user ${row.user_id} is delete-due (blocked on §17.I archive)`);
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
