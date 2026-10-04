// Shared harness for the shotgun live tests: drives the REAL app (Vite dev server) in headless
// Chromium against a MOCKED Supabase backend, so no test account, credentials or production data are
// needed. Everything user-visible goes through the real UI (aria-labels / visible text), so when the
// app's UI changes, these tests fail loudly instead of passing against a stale copy.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SB = "http://supabase.test";            // fake host; every request to it is intercepted
export const OUT = process.env.LIVE_TEST_OUT ?? join(REPO, "tmp-live-test");
mkdirSync(OUT, { recursive: true });

let _chromium;
async function chromium() {
  if (_chromium) return _chromium;
  const tries = [() => import("playwright"), () => import("/opt/node22/lib/node_modules/playwright/index.mjs"),
    () => createRequire(import.meta.url)(join(process.env.PLAYWRIGHT_NODE_PATH ?? "", "playwright"))];
  for (const t of tries) { try { const m = await t(); _chromium = (m.chromium ?? m.default?.chromium); if (_chromium) return _chromium; } catch { /* next */ } }
  throw new Error("playwright not found (cloud sessions ship it at /opt/node22/lib/node_modules/playwright)");
}

/** A completed account to start every scenario from (docs/account-reference.json), set to weekly pay. */
export function baseRow() {
  const d = JSON.parse(readFileSync(join(REPO, "docs", "account-reference.json"), "utf8")).db_record;
  const row = structuredClone(d);
  row.config.userPaySchedule = "weekly";
  Object.assign(row, { is_admin: false, is_investor: false, is_tester: false, is_ai_admin: false, beta_code_used: null, beta_started_at: null,
    tax_projections_enabled: false, subscription_status: "active", trial_started_at: null, trial_ends_at: null, access_ends_at: null,
    current_period_end: new Date(Date.now() + 20 * 864e5).toISOString(), card_on_file: true, plan: "monthly", stripe_customer_id: "cus_test",
    stripe_subscription_id: "sub_test", deletion_requested_at: null, last_dunning_email_at: null, dunning_email_count: 0 });
  return row;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = (uid) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;

/** Opens the real app with a fake signed-in session; `state.row` is the "database", `saves` records every write. */
export async function openApp({ baseUrl, row, fixedTime = null, viewport = { width: 430, height: 900 } }) {
  const browser = await (await chromium()).launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const session = { access_token: fakeJwt(row.user_id), refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: row.user_id, aud: "authenticated", role: "authenticated", email: "tester@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ["sb-supabase-auth-token", JSON.stringify(session)]);
  const saves = []; const state = { row: structuredClone(row) };
  await ctx.route(`${SB}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    const wantsObject = (req.headers()["accept"] || "").includes("pgrst.object");
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (url.pathname.startsWith("/auth/v1/user")) return json(200, session.user);
    if (url.pathname.startsWith("/auth/v1/token")) return json(200, session);
    if (url.pathname.startsWith("/auth/v1/")) return json(200, {});
    if (url.pathname === "/rest/v1/user_data") {
      if (m === "GET") return json(200, wantsObject ? state.row : [state.row]);
      if (m === "POST" || m === "PATCH") {
        let body; try { body = JSON.parse(req.postData() || "{}"); } catch { body = {}; }
        const patch = Array.isArray(body) ? body[0] : body; saves.push(structuredClone(patch)); Object.assign(state.row, patch);
        return json(m === "POST" ? 201 : 200, []);
      }
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      if (m === "GET") return wantsObject ? json(406, { code: "PGRST116", message: "no rows", details: "", hint: "" }) : json(200, []);
      return json(201, []);
    }
    return json(200, {});
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  if (fixedTime) await page.clock.setFixedTime(new Date(fixedTime));
  const boot = async () => { await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 }); await page.waitForTimeout(3500); await dismissModals(page); };
  await boot();
  return { browser, page, state, saves, errors, lastSave: () => saves[saves.length - 1], reload: async () => { await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(3500); await dismissModals(page); },
    shot: (name) => page.screenshot({ path: join(OUT, `${name}.png`) }), close: () => browser.close() };
}

export async function dismissModals(page) {                       // the weekly check-in modal blocks the shell for old accounts
  for (let i = 0; i < 3; i++) {
    const skip = page.getByText(/^skip for now$/i).first();
    if (await skip.isVisible().catch(() => false)) { await skip.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(600); } else break;
  }
}
export async function nav(page, name) {
  await page.getByText(new RegExp(`^${name}$`, "i")).filter({ visible: true }).last().click({ timeout: 8000 });
  await page.waitForTimeout(1500); await dismissModals(page);
}
export const vis = (loc) => loc.isVisible().catch(() => false);
export const btn = (page, name) => page.getByRole("button", { name, exact: true });
export const bodyText = (page) => page.locator("body").innerText();
export const settle = (page, ms = 1200) => page.waitForTimeout(ms);
export async function openNeeds(page) { await page.getByText(/^needs$/i).filter({ visible: true }).first().click(); await page.waitForTimeout(800); }

/** Quit My Job wizard: hamburger → Life Events → Quit My Job. */
export async function openQuitMyJob(page) {
  await page.mouse.click(38, 28); await page.waitForTimeout(900);
  await page.getByText(/life events/i).filter({ visible: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(800);
  await page.getByText(/quit my job/i).filter({ visible: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(900);
}
/** Steps 0–1 (cash + no benefits + no pending check); leaves the modal on step 2 "which bills to track". */
export async function wizardTo2(page, cash = "800") {
  await page.getByPlaceholder("e.g. 1,023").fill(cash);
  await btn(page, "No").click(); await btn(page, "Next").click(); await page.waitForTimeout(500);
  await btn(page, "No").click(); await btn(page, "Next").click(); await page.waitForTimeout(500);
}
