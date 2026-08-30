// Shared archive-then-delete primitive (§17.I / migration 017's deleted_accounts
// tombstone). Originally lived only inside cron-subscription-lifecycle.js for the
// day-21+7 non-payment path; factored out (migration 044) so api/delete-account.js
// can reuse the exact same tombstone-then-purge sequence for user-initiated
// deletion instead of the old plain hard-delete-with-no-archive it used to run —
// one function, never allowed to diverge between the two callers (CLAUDE.md's
// "must never diverge" rule for anything ported/shared across call sites).
//
// Order matters for retry safety — every step throws on failure, so a caller's
// per-row/per-request catch can leave the row untouched and retry later:
//   1. resolve the auth user (email keys the tombstone),
//   2. snapshot the full user_data row,
//   3. cancel any lingering Stripe subscription (both-mode lookup — a lapsed
//      past_due sub may still exist),
//   4. upsert the tombstone (on email, so a revive → lapse → delete cycle
//      overwrites the same row instead of piling up duplicates),
//   5. only then hard-delete user_data + the auth user.
import { STRIPE_CLIENTS, cancelStripeSubscription } from "./_stripeClient.js";

export async function archiveAndDeleteAccount(adminClient, userId, now, deletionReason) {
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
      deletion_reason: deletionReason,
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
