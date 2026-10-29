// One Vercel function for the user-initiated Stripe calls — /api/stripe/checkout,
// /api/stripe/portal, /api/stripe/revive-checkout (Hobby plan 12-function cap;
// see api/admin/[route].js). The handlers are unchanged in `_stripe*.js`.
// stripe-webhook.js deliberately stays its own function: Stripe signs the raw
// request bytes, so it needs `bodyParser: false`, which these JSON routes don't,
// and its URL is registered in the Stripe dashboard.
import checkout from "../_stripeCreateCheckout.js";
import portal from "../_stripePortal.js";
import reviveCheckout from "../_stripeReviveCheckout.js";

export const STRIPE_ROUTES = { checkout, portal, "revive-checkout": reviveCheckout };

export default async function handler(req, res) {
  const route = STRIPE_ROUTES[req.query?.route];
  if (!route) return res.status(404).json({ error: "Not found" });
  return route(req, res);
}
