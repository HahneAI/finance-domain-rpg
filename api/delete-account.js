import { createClient } from "@supabase/supabase-js";
import { STRIPE_CLIENTS } from "./_stripeClient.js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// The stored subscription id doesn't say which Stripe mode created it, so try
// each configured client in turn. "resource_missing" means either wrong mode
// or the subscription is already gone — both fine to move past; anything else
// must abort the deletion, or the user would keep being billed.
async function cancelStripeSubscription(subscriptionId) {
  for (const client of STRIPE_CLIENTS) {
    try {
      const subscription = await client.subscriptions.retrieve(subscriptionId);
      if (subscription.status !== "canceled") {
        await client.subscriptions.cancel(subscriptionId);
      }
      return;
    } catch (err) {
      if (err?.code === "resource_missing") continue;
      throw err;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: "Server auth configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const confirmationText = req.body?.confirmationText;
  if (confirmationText !== "DELETE") {
    return res.status(400).json({ error: "Invalid delete confirmation" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const userId = authData.user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // §17.H — cancel any Stripe subscription before deleting the account so a
  // deleted user isn't billed again. This stays a true hard delete (no
  // archive — that's only the §I non-payment cron path); the cancel happens
  // first so a failure leaves the account intact and the request retryable.
  const { data: subRow, error: subRowError } = await adminClient
    .from("user_data")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (subRowError) {
    return res.status(500).json({ error: "Failed to load account" });
  }

  if (subRow?.stripe_subscription_id) {
    if (STRIPE_CLIENTS.length === 0) {
      console.error("delete-account: subscription on file but no Stripe key configured");
      return res.status(500).json({ error: "Server configuration is missing" });
    }
    try {
      await cancelStripeSubscription(subRow.stripe_subscription_id);
    } catch (err) {
      console.error("delete-account failed to cancel Stripe subscription:", err.message);
      return res.status(500).json({ error: "Failed to cancel subscription" });
    }
  }

  const { error: userDataDeleteError } = await adminClient
    .from("user_data")
    .delete()
    .eq("user_id", userId);

  if (userDataDeleteError) {
    return res.status(500).json({ error: "Failed to delete account data" });
  }

  const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return res.status(500).json({ error: "Failed to delete auth account" });
  }

  return res.status(200).json({ ok: true });
}
