import { createClient } from "@supabase/supabase-js";
import { stripe, PRICE_ID_BY_PLAN, MODE } from "./_stripeClient.js";

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
    console.error("stripe-create-checkout missing env vars:", missing.join(", "));
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
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const userId = authData.user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: rowError } = await adminClient
    .from("user_data")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();
  if (rowError) {
    return res.status(500).json({ error: "Failed to load account" });
  }

  try {
    let customerId = row?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: authData.user.email,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      const { error: saveError } = await adminClient
        .from("user_data")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", userId);
      if (saveError) {
        return res.status(500).json({ error: "Failed to save Stripe customer" });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("stripe-create-checkout failed:", err.message);
    return res.status(500).json({ error: "Failed to start checkout" });
  }
}
