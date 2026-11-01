import { createClient } from "@supabase/supabase-js";
import { stripe, PRICE_ID_BY_PLAN, MODE, resolveAppOrigin } from "./_stripeClient.js";

// §17.I — Checkout for reviving a non-payment-deleted account. Like
// stripe-create-checkout.js but keyed off the deleted_accounts tombstone
// rather than an existing user_data row: the caller is a freshly-created,
// empty Supabase account whose email matches an open tombstone. Access is
// only restored when the charge actually succeeds — the webhook's revival
// branch (metadata.revival) does the data restore; this route never touches
// user_data at all.

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = env.APP_URL;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL/SUPABASE_URL",
    !anonKey && "VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    !stripe && `STRIPE_SECRET_KEY${MODE === "live" ? "" : "_TEST"} (MODE=${MODE})`,
    !appUrl && "APP_URL",
  ].filter(Boolean);
  if (missing.length) {
    console.error("stripe-revive-checkout missing env vars:", missing.join(", "));
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const priceId = PRICE_ID_BY_PLAN[req.body?.plan];
  if (!priceId) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id || !authData.user.email) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const userId = authData.user.id;
  const email = authData.user.email;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The session's own email keys the tombstone — a caller can never revive
  // (or probe) someone else's archive.
  const { data: tombstone, error: tombstoneError } = await adminClient
    .from("deleted_accounts")
    .select("email, stripe_customer_id, revival_attempt_count")
    .eq("email", email)
    .is("revived_at", null)
    .maybeSingle();
  if (tombstoneError) {
    console.error("stripe-revive-checkout tombstone lookup failed:", tombstoneError.message);
    return res.status(500).json({ error: "Failed to load archived account" });
  }
  if (!tombstone) {
    return res.status(403).json({ error: "No revivable account for this email" });
  }

  try {
    // Reuse the archived Stripe customer so billing history stays linked;
    // only create a new one if the archive predates any checkout.
    let customerId = tombstone.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      const { error: saveError } = await adminClient
        .from("deleted_accounts")
        .update({ stripe_customer_id: customerId })
        .eq("email", email);
      if (saveError) {
        return res.status(500).json({ error: "Failed to save Stripe customer" });
      }
    }

    const origin = resolveAppOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      // The webhook's checkout.session.completed handler branches on this to
      // restore the archived data instead of a plain status update.
      metadata: { revival: "true", revival_email: email },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    // Attempt tracking (§I "two-way door"): stamped per checkout attempt, and
    // only reset by a successful charge (webhook). Card-level decline codes
    // aren't visible here — hosted Checkout handles per-card retries entirely
    // on Stripe's page — so last_decline_code stays webhook territory.
    const { error: stampError } = await adminClient
      .from("deleted_accounts")
      .update({
        revival_attempt_count: (tombstone.revival_attempt_count ?? 0) + 1,
        last_revival_attempt_at: new Date().toISOString(),
      })
      .eq("email", email);
    if (stampError) {
      console.warn("stripe-revive-checkout attempt stamp failed:", stampError.message);
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("stripe-revive-checkout failed:", err.message);
    return res.status(500).json({ error: "Failed to start checkout" });
  }
}
