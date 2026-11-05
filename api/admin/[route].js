// One Vercel function for the three admin surfaces — /api/admin/beta-hub,
// /api/admin/beta-report, /api/admin/changelog. Vercel's Hobby plan caps a
// deployment at 12 Serverless Functions (one per non-`_` file under api/);
// this file and its stripe/ and account/ siblings took the count from 12 to 7
// (2026-10-29). Each handler is unchanged in its own `_`-prefixed module —
// this router only picks one by the dynamic path segment, which Vercel puts
// on req.query.route. The request's own query string (?entity=, ?kind=, ?id=,
// ?format=) reaches the handler untouched.
import betaHub from "../_adminBetaHub.js";
import betaReport from "../_adminBetaReport.js";
import changelog from "../_adminChangelog.js";

export const ADMIN_ROUTES = { "beta-hub": betaHub, "beta-report": betaReport, changelog };

export default async function handler(req, res) {
  const route = ADMIN_ROUTES[req.query?.route];
  if (!route) return res.status(404).json({ error: "Not found" });
  return route(req, res);
}
