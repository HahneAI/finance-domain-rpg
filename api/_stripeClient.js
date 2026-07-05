import Stripe from "stripe";

// Leading underscore excludes this file from Vercel's file-based /api routing —
// it's a shared helper, not an endpoint.

const env = globalThis.process?.env ?? {};

// Distinct env var names per mode (STRIPE_SECRET_KEY vs. STRIPE_SECRET_KEY_TEST,
// etc.) rather than same-named vars scoped per Vercel environment — simpler to
// manage, and necessary for the webhook route specifically: both the live and
// test Stripe webhook endpoints point at the same deployed URL, so a single
// running instance can receive events from either mode and must resolve which
// one per-request rather than assume one mode for the whole deployment.
const stripeLive = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
const stripeTest = env.STRIPE_SECRET_KEY_TEST ? new Stripe(env.STRIPE_SECRET_KEY_TEST) : null;

// For routes WE initiate (checkout, portal) — not events Stripe sends us —
// there's no per-request ambiguity: Vercel's own VERCEL_ENV tells us which
// deployment context we're in. Default to test whenever that's unset (e.g.
// running locally outside `vercel dev`, or under the test runner) so a
// missing/misread env var never silently falls back to live.
export const MODE = env.VERCEL_ENV === "production" ? "live" : "test";
export const stripe = MODE === "live" ? stripeLive : stripeTest;

console.log(`[stripe] outbound calls (checkout/portal) use ${MODE.toUpperCase()} mode`);

export const PRICE_ID_BY_PLAN = MODE === "live"
  ? { monthly: env.STRIPE_PRICE_MONTHLY, annual: env.STRIPE_PRICE_ANNUAL }
  : { monthly: env.STRIPE_PRICE_MONTHLY_TEST, annual: env.STRIPE_PRICE_ANNUAL_TEST };

// Mode-agnostic on purpose — a webhook event's price id could be either
// mode's, so both are mapped into one lookup rather than picking a side.
export const PLAN_BY_PRICE_ID = {
  [env.STRIPE_PRICE_MONTHLY]: "monthly",
  [env.STRIPE_PRICE_ANNUAL]: "annual",
  [env.STRIPE_PRICE_MONTHLY_TEST]: "monthly",
  [env.STRIPE_PRICE_ANNUAL_TEST]: "annual",
};

// Webhook signature verification tries live first, then test, since incoming
// events carry no mode indicator besides "which secret validates the
// signature." Returns the event plus which client (live or test) issued it,
// so the caller can make follow-up Stripe API calls (e.g. subscriptions.retrieve)
// against the account that actually owns that object.
export function constructWebhookEvent(rawBody, signature) {
  const candidates = [
    { client: stripeLive, secret: env.STRIPE_WEBHOOK_SECRET, mode: "live" },
    { client: stripeTest, secret: env.STRIPE_WEBHOOK_SECRET_TEST, mode: "test" },
  ];

  let lastError = new Error("No Stripe webhook secret configured");
  for (const { client, secret, mode } of candidates) {
    if (!client || !secret) continue;
    try {
      const event = client.webhooks.constructEvent(rawBody, signature, secret);
      return { event, mode, client };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Multiple live Vercel deployments (production + preview branches like
// Version-control) can all initiate checkout, but APP_URL only ever names one
// of them. Redirecting Stripe's success/cancel/return URLs at a fixed APP_URL
// bounces users testing on a preview back to a different, possibly stale,
// deployment. Instead, derive the origin the request actually came from —
// falling back to APP_URL only when the request carries neither header —
// and only trust it when the hostname is one we recognize, so this can't be
// abused as an open redirect.
function isAllowedHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.endsWith(".vercel.app")) return true;
  const appUrlHost = env.APP_URL ? safeHostname(env.APP_URL) : null;
  return appUrlHost != null && hostname === appUrlHost;
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function resolveAppOrigin(req) {
  const candidates = [req.headers.origin, req.headers.referer];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (isAllowedHost(parsed.hostname)) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // not a valid absolute URL — skip
    }
  }
  return env.APP_URL ? env.APP_URL.replace(/\/+$/, "") : null;
}
