import { createClient } from "@supabase/supabase-js";
import { stripe, PLAN_BY_PRICE_ID } from "./_stripeClient.js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

// Vercel must not pre-parse this body — Stripe's signature is computed over
// the exact raw bytes.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(globalThis.Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Stripe (2025+ API versions) moved the current billing period onto the
// subscription item rather than the subscription itself — try both so this
// doesn't silently break on whichever API version the account is pinned to.
function periodEndOf(subscription) {
  const seconds = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function planOf(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  return priceId ? (PLAN_BY_PRICE_ID[priceId] ?? null) : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseUrl || !serviceRoleKey || !stripe || !webhookSecret) {
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe-webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Claim this event id atomically before doing any work — Stripe retries on
  // non-2xx responses and occasionally redelivers already-processed events.
  const { error: claimError } = await adminClient
    .from("stripe_webhook_events")
    .insert({ id: event.id, type: event.type });
  if (claimError) {
    if (claimError.code === "23505") {
      return res.status(200).json({ received: true, duplicate: true });
    }
    console.error("stripe-webhook failed to claim event:", claimError.message);
    return res.status(500).json({ error: "Failed to record webhook event" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (userId && session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await adminClient
            .from("user_data")
            .update({
              stripe_customer_id: session.customer,
              stripe_subscription_id: subscription.id,
              subscription_status: subscription.status,
              plan: planOf(subscription),
              current_period_end: periodEndOf(subscription),
              card_on_file: true,
            })
            .eq("user_id", userId);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : subscription.status;
        await adminClient
          .from("user_data")
          .update({
            stripe_subscription_id: subscription.id,
            subscription_status: status,
            plan: planOf(subscription),
            current_period_end: periodEndOf(subscription),
          })
          .eq("stripe_customer_id", subscription.customer);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await adminClient
          .from("user_data")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", invoice.customer);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("stripe-webhook handler failed:", err.message);
    return res.status(500).json({ error: "Failed to process webhook event" });
  }

  return res.status(200).json({ received: true });
}
