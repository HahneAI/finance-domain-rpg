import Stripe from "stripe";

// Leading underscore excludes this file from Vercel's file-based /api routing —
// it's a shared helper, not an endpoint.

const env = globalThis.process?.env ?? {};

const stripeSecretKey = env.STRIPE_SECRET_KEY;
export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Vercel lets the same env var name hold different values per environment
// scope (Production vs. Preview/Development) — Production should carry the
// live sk_live_/whsec_ values, Preview/Development the sk_test_ ones. This
// derives the active mode straight from the key itself rather than trusting
// a separate flag, so a scope misconfiguration shows up in the logs instead
// of silently mixing test and live behavior.
export const isTestMode = stripeSecretKey ? stripeSecretKey.startsWith("sk_test_") : null;

if (stripeSecretKey) {
  console.log(`[stripe] running in ${isTestMode ? "TEST" : "LIVE"} mode`);
}

export const PRICE_ID_BY_PLAN = {
  monthly: env.STRIPE_PRICE_MONTHLY,
  annual: env.STRIPE_PRICE_ANNUAL,
};

export const PLAN_BY_PRICE_ID = {
  [env.STRIPE_PRICE_MONTHLY]: "monthly",
  [env.STRIPE_PRICE_ANNUAL]: "annual",
};
