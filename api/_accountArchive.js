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
//      overwrites the same row instead of piling up duplicates) with
//      auth_purge_pending: true,
//   5. hard-delete the user_data row,
//   6. only then delete the auth.users row — and flip auth_purge_pending false
//      on success.
//
// Migration 046 — step 6 is the one step that can fail with NOTHING left to
// retry against on the old design: step 5 already deleted the row that used
// to carry the "still needs finishing" flag (user_data.deletion_requested_at,
// migration 044). deleted_accounts.auth_purge_pending is that flag's
// replacement — written in step 4, before the failure-prone step, and never
// itself deleted, so finishPendingAuthPurges() below can always find and
// retry a stuck row regardless of where the process failed. (Migration 045
// fixed the single most common cause of step 6 failing at all — a
// consent_records foreign key with no ON DELETE CASCADE — but this tracking
// fix stands on its own for any other transient failure at that step.)
import { STRIPE_CLIENTS, cancelStripeSubscription } from "./_stripeClient.js";

// Supabase's admin API reports a delete against an id that's already gone as
// a 404-shaped AuthApiError, not success — treated as "already purged" (a
// no-op we should clear the pending flag for) rather than a real failure to
// keep retrying forever. Message-substring fallback since the exact error
// shape isn't guaranteed to carry `.status` on every supabase-js version.
function isAlreadyGoneError(error) {
  if (!error) return false;
  if (error.status === 404) return true;
  return typeof error.message === "string" && /not.?found/i.test(error.message);
}

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
      // migration 046 — the durable retry signal for the final step below.
      auth_purge_pending: true,
      auth_purged_at: null,
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

  const { error: purgeStampError } = await adminClient
    .from("deleted_accounts")
    .update({ auth_purge_pending: false, auth_purged_at: now.toISOString() })
    .eq("email", user.email);
  // Not worth throwing over — the account IS fully deleted at this point;
  // finishPendingAuthPurges() below will simply re-attempt (harmlessly — a
  // repeat auth.admin.deleteUser() on an already-gone id counts as "already
  // purged" via isAlreadyGoneError) if this last bookkeeping write fails.
  if (purgeStampError) {
    console.error(`archive: auth_purge_pending stamp failed for ${user.email}:`, purgeStampError.message);
  }
}

// Migration 046 — retries the auth.users delete for every tombstoned account
// still marked auth_purge_pending, independent of whatever else the daily
// cron run is doing. This is what actually recovers an account stuck in the
// "user_data gone, auth.users still alive" state (the "logged back in like a
// first-time user" symptom) — sweepPendingDeletions() in
// cron-subscription-lifecycle.js only ever sees rows that still HAVE a
// user_data row, which this failure mode has already deleted by construction.
export async function finishPendingAuthPurges(adminClient, now) {
  const results = { checked: 0, purged: 0, errors: 0 };

  const { data: pendingTombstones, error: fetchError } = await adminClient
    .from("deleted_accounts")
    .select("email, former_user_id")
    .eq("auth_purge_pending", true)
    .is("revived_at", null);
  if (fetchError) {
    console.error("finishPendingAuthPurges: fetch failed:", fetchError.message);
    results.errors += 1;
    return results;
  }

  results.checked = pendingTombstones.length;
  for (const row of pendingTombstones) {
    if (!row.former_user_id) {
      // Nothing to delete — clear the flag so this row stops being re-checked forever.
      await adminClient
        .from("deleted_accounts")
        .update({ auth_purge_pending: false, auth_purged_at: now.toISOString() })
        .eq("email", row.email);
      continue;
    }
    try {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(row.former_user_id);
      if (deleteError && !isAlreadyGoneError(deleteError)) {
        throw new Error(deleteError.message);
      }
      const { error: stampError } = await adminClient
        .from("deleted_accounts")
        .update({ auth_purge_pending: false, auth_purged_at: now.toISOString() })
        .eq("email", row.email);
      if (stampError) throw new Error(`purge stamp failed: ${stampError.message}`);
      results.purged += 1;
    } catch (err) {
      results.errors += 1;
      console.error(`finishPendingAuthPurges: retry failed for ${row.email}:`, err.message);
    }
  }

  return results;
}
