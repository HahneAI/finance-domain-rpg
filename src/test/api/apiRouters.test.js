// Hobby-plan function consolidation (2026-10-29): api/admin/[route].js,
// api/stripe/[route].js and api/account/[route].js each serve several handlers
// as ONE Vercel function, picked by the dynamic path segment Vercel puts on
// req.query.route. The handlers themselves are unchanged and keep their own
// tests; these only pin the dispatch: every old route reaches its handler with
// the request untouched, an unknown segment is a 404, and the function count
// stays under the cap.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";

const { calls } = vi.hoisted(() => ({ calls: [] }));
const stub = (name) => ({ default: vi.fn(async (req, res) => { calls.push({ name, req }); return res.status(200).json({ ok: name }); }) });

vi.mock("../../../api/_adminBetaHub.js", () => stub("beta-hub"));
vi.mock("../../../api/_adminBetaReport.js", () => stub("beta-report"));
vi.mock("../../../api/_adminChangelog.js", () => stub("changelog"));
vi.mock("../../../api/_stripeCreateCheckout.js", () => stub("checkout"));
vi.mock("../../../api/_stripePortal.js", () => stub("portal"));
vi.mock("../../../api/_stripeReviveCheckout.js", () => stub("revive-checkout"));
vi.mock("../../../api/_deleteAccount.js", () => stub("delete"));
vi.mock("../../../api/_revivalLookup.js", () => stub("revival-lookup"));

const { default: admin } = await import("../../../api/admin/[route].js");
const { default: stripe } = await import("../../../api/stripe/[route].js");
const { default: account } = await import("../../../api/account/[route].js");

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

describe("api routers — one function per group", () => {
  it.each([
    ["admin", "beta-hub"], ["admin", "beta-report"], ["admin", "changelog"],
    ["stripe", "checkout"], ["stripe", "portal"], ["stripe", "revive-checkout"],
    ["account", "delete"], ["account", "revival-lookup"],
  ])("dispatches /api/%s/%s to its own handler with the request untouched", async (group, route) => {
    const router = { admin, stripe, account }[group];
    calls.length = 0;
    const req = { method: "POST", query: { route, entity: "content", id: "x1" }, body: { a: 1 }, headers: { authorization: "Bearer t" } };
    const res = mockRes();
    await router(req, res);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(route);
    expect(calls[0].req).toBe(req);
    expect(res.statusCode).toBe(200);
  });

  it("404s an unknown or missing segment without calling any handler", async () => {
    calls.length = 0;
    for (const router of [admin, stripe, account]) {
      for (const query of [{ route: "nope" }, {}]) {
        const res = mockRes();
        await router({ method: "GET", query }, res);
        expect(res.statusCode).toBe(404);
      }
    }
    expect(calls).toHaveLength(0);
  });

  it("keeps the deployment under the Hobby plan's 12-function cap", () => {
    const apiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../api");
    const functions = [];
    (function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith("_")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".js")) functions.push(path.relative(apiDir, full));
      }
    })(apiDir);
    expect(functions.length).toBeLessThanOrEqual(12);
    expect(functions.sort()).toEqual([
      "account/[route].js", "admin/[route].js", "coach.js", "cron-subscription-lifecycle.js",
      "seed.js", "stripe-webhook.js", "stripe/[route].js",
    ]);
  });

  it("keeps every pre-consolidation URL working for cached clients via vercel.json rewrites", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../vercel.json"), "utf8"));
    const map = Object.fromEntries((vercel.rewrites ?? []).map((r) => [r.source, r.destination]));
    expect(map).toMatchObject({
      "/api/admin-beta-hub": "/api/admin/beta-hub",
      "/api/admin-beta-report": "/api/admin/beta-report",
      "/api/admin-changelog": "/api/admin/changelog",
      "/api/delete-account": "/api/account/delete",
      "/api/revival-lookup": "/api/account/revival-lookup",
      "/api/stripe-create-checkout": "/api/stripe/checkout",
      "/api/stripe-portal": "/api/stripe/portal",
      "/api/stripe-revive-checkout": "/api/stripe/revive-checkout",
    });
    // The webhook URL is registered in the Stripe dashboard — never rewritten or moved.
    expect(map["/api/stripe-webhook"]).toBeUndefined();
  });
});
