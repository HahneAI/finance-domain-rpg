// One Vercel function for account lifecycle calls — /api/account/delete and
// /api/account/revival-lookup (Hobby plan 12-function cap; see
// api/admin/[route].js). The handlers are unchanged in `_deleteAccount.js` and
// `_revivalLookup.js`; each still does its own auth (revival-lookup is the
// pre-login email check, delete is session-verified).
import deleteAccount from "../_deleteAccount.js";
import revivalLookup from "../_revivalLookup.js";

export const ACCOUNT_ROUTES = { delete: deleteAccount, "revival-lookup": revivalLookup };

export default async function handler(req, res) {
  const route = ACCOUNT_ROUTES[req.query?.route];
  if (!route) return res.status(404).json({ error: "Not found" });
  return route(req, res);
}
