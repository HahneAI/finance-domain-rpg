import { createClient } from "@supabase/supabase-js";
import { stripe, MODE } from "./_stripeClient.js";

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
    console.error("stripe-portal missing env vars:", missing.join(", "));
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: rowError } = await adminClient
    .from("user_data")
    .select("stripe_customer_id")
    .eq("user_id", authData.user.id)
    .single();
  if (rowError || !row?.stripe_customer_id) {
    return res.status(400).json({ error: "No Stripe customer on file" });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${appUrl}/`,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("stripe-portal failed:", err.message);
    return res.status(500).json({ error: "Failed to create billing portal session" });
  }
}
