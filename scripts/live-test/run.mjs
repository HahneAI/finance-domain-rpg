#!/usr/bin/env node
// One-command live test: `npm run live-test`. Starts the real Vite dev server (dummy Supabase env),
// drives it in headless Chromium against a mocked Supabase, asserts on what the UI shows and saves.
// Exit code 1 on any failed assertion — if the app changes, this fails instead of silently drifting.
import { spawn } from "node:child_process";
import { openApp, nav, dismissModals, openNeeds, openQuitMyJob, wizardTo2, btn, vis, settle, bodyText } from "./lib.mjs";
import { rowWith, bill, deletedBill, iso, addDays, njsConfig } from "./fixtures.mjs";

const PORT = process.env.LIVE_TEST_PORT ?? "5199";
const baseUrl = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got: ${JSON.stringify(got)})`}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), got);
const cash = (t) => { const m = t.match(/cash on hand\s*\n\s*\$([\d,]+)/i); return m ? Number(m[1].replace(/,/g, "")) : null; };
const realErrors = (a) => a.errors.filter((e) => !/style property/.test(e));

const vite = spawn("npx", ["vite", "--port", PORT, "--strictPort"], { env: { ...process.env, VITE_SUPABASE_URL: "http://supabase.test", VITE_SUPABASE_ANON_KEY: "test-anon-key" }, stdio: "ignore" });
const stop = () => { try { vite.kill("SIGTERM"); } catch { /* */ } };
process.on("exit", stop);
for (let i = 0; i < 60; i++) { try { if ((await fetch(baseUrl)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }

const now = new Date(); const T = iso(now);
const open = (opts) => openApp({ baseUrl, ...opts });
try {
  // ── §26 Due Today card + this-week actual spend
  {
    const app = await open({ row: rowWith([bill({ id: "t_rent", label: "Test Rent", amount: 1000, anchor: T }), bill({ id: "t_tmrw", label: "Tomorrow Bill", amount: 80, anchor: iso(addDays(now, 1)) }), bill({ id: "t_gym", label: "Undated Gym", amount: 40 })]) });
    const { page } = app; const card = page.getByLabel("Bills due today");
    check("§26 due-today card lists today's bill", (await vis(card)) && /Test Rent/.test(await card.innerText()) && !/Tomorrow Bill/.test(await card.innerText()));
    check("§26 Home 'Left This Week' shows with-this-week's-bills sub", /With this week's bills:/.test(await bodyText(page)));
    await nav(page, "upkeep");
    check("§26 Upkeep shows with-this-week's-bills sub", /With this week's bills:/.test(await bodyText(page)));
    await nav(page, "home"); await page.getByLabel("Dismiss due today").click(); await settle(page, 400);
    check("§26 dismiss hides card", !(await vis(card)));
    await app.reload(); check("§26 dismissal persists same day", !(await vis(card)));
    await page.clock.setFixedTime(addDays(new Date(), 1)); await app.reload();
    check("§26 card returns next day with that day's bill", (await vis(card)) && /Tomorrow Bill/.test(await card.innerText()));
    eq("§26 no page errors", realErrors(app), []); await app.close();
  }
  // ── §25 Mark paid / undo + §24 deleted bills never decay cash
  {
    const row = rowWith([bill({ id: "t_net", label: "Internet", amount: 70, anchor: iso(addDays(now, 10)) }), bill({ id: "t_rent", label: "Test Rent", amount: 1000, anchor: iso(addDays(now, 20)) }), deletedBill({ id: "t_old", label: "Old Gym", amount: 400, anchor: iso(addDays(now, 5)) })], njsConfig(T));
    const app = await open({ row }); const { page } = app;
    await nav(page, "upkeep"); await settle(page, 800);
    let t = await bodyText(page);
    check("§24 NJS start: cash 800, deleted bill hidden", cash(t) === 800 && !t.includes("Old Gym"), cash(t));
    await page.getByLabel("Mark Internet as paid").click(); await settle(page, 1500);
    t = await bodyText(page); const sv = app.lastSave(); const n = sv?.expenses?.find((e) => e.id === "t_net");
    check("§25 Mark Paid subtracts bill from cash (730) and shows Undo", cash(t) === 730 && (await vis(page.getByLabel("Undo paid for Internet"))), cash(t));
    check("§25 Mark Paid eagerly saved paid flags", n?.newJobSeasonStatus === "paid" && n?.newJobSeasonPaidSkipDecay === true && sv?.config?.newJobSeasonCashOnHand === 730, n);
    await page.getByLabel("Undo paid for Internet").click(); await settle(page, 1500);
    check("§25 Undo restores cash to 800", cash(await bodyText(page)) === 800);
    await page.getByLabel("Mark Internet as paid").click(); await settle(page, 1200);
    await page.clock.setFixedTime(addDays(new Date(), 11)); await app.reload(); await nav(page, "upkeep"); await settle(page, 800);
    check("§25 past the paid due date: no second subtraction, Mark Paid available again", cash(await bodyText(page)) === 730 && (await vis(page.getByLabel("Mark Internet as paid"))));
    await app.close();
    const app2 = await open({ row, fixedTime: addDays(new Date(), 15) }); await nav(app2.page, "upkeep"); await settle(app2.page, 800);
    t = await bodyText(app2.page);
    check("§24 T+15 unpaid: only Internet ($70) decays, deleted Old Gym ($400) never does", cash(t) === 730 && /− \$70 in bills since/.test(t) && !t.includes("Old Gym"), cash(t));
    eq("§25/§24 no page errors", realErrors(app2), []); await app2.close();
  }
  // ── §24 delete via the real UI, then enter NJS through the real wizard
  {
    const app = await open({ row: rowWith([bill({ id: "t_sup", label: "Child Support", amount: 1000, anchor: iso(addDays(now, 6)) }), bill({ id: "t_gym", label: "Doomed Gym", amount: 400, anchor: iso(addDays(now, 3)) })]) });
    const { page } = app;
    await nav(page, "upkeep"); await openNeeds(page);
    await page.getByLabel("Edit Doomed Gym").click(); await settle(page, 1200);
    await page.getByText(/^delete$/i).filter({ visible: true }).first().click(); await settle(page, 600);
    await page.getByText(/^q4\s*\+$/i).filter({ visible: true }).first().click(); await settle(page, 1500);
    const g = app.lastSave()?.expenses?.find((e) => e.id === "t_gym");
    check("§24 delete keeps bill in array, zeroed forward", !!g && g.monthlyOverrides && Object.values(g.monthlyOverrides).some((o) => o.amount === 0) && g.history.length > 0, g);
    await openQuitMyJob(page); await wizardTo2(page);
    check("§24 wizard step 2 hides deleted, keeps live bill", !(await bodyText(page)).includes("Doomed Gym") && (await page.getByText("Child Support").filter({ visible: true }).count()) > 0);
    await btn(page, "Next").click(); await settle(page, 600);
    await page.getByText("1st week of month").filter({ visible: true }).first().click();
    await btn(page, "Activate").click(); await settle(page, 2500);
    await nav(page, "upkeep"); await settle(page, 1000);
    const t = await bodyText(page); const sv = app.lastSave();
    check("§24 NJS Upcoming hides deleted, shows live; deleted passes through untouched", !t.includes("Doomed Gym") && t.includes("Child Support") && !!sv.expenses.find((e) => e.id === "t_gym") && sv.expenses.find((e) => e.id === "t_gym").trackDuringNewJobSeason === undefined);
    eq("§24 no page errors", realErrors(app), []); await app.close();
  }
} catch (e) { fail++; console.log(`FAIL  harness error: ${e.message}`); }
finally { stop(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
