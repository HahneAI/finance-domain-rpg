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
  // ── §22 Cash on Hand card → Paycheck Credits ledger in Log
  {
    const app = await open({ row: rowWith([bill({ id: "t_rent", label: "Test Rent", amount: 1000, anchor: iso(addDays(now, 3)) })]) });
    const { page } = app; const card = page.getByRole("region", { name: "Cash on hand", exact: true });
    check("§22 card shows the starting-balance prompt for a new user", (await vis(card)) && /What's in your bank account right now/.test(await card.innerText()));
    await card.locator("input").fill("1,200"); await page.getByLabel("Save cash on hand").click(); await settle(page, 1200);
    const cfg = app.lastSave()?.config;
    check("§22 saving the balance eager-saves anchor + as-of today", cfg?.cashOnHandAnchor === 1200 && cfg?.cashOnHandAnchorAsOf === T, cfg && { a: cfg.cashOnHandAnchor, d: cfg.cashOnHandAnchorAsOf });
    check("§22 card shows $1,200 and a Needs set-aside line", /\$1,200/.test(await card.innerText()) && /Set aside this week \(Needs\)/.test(await card.innerText()));
    await app.close();
    // Anchor 3 weeks back, no check-ins → pending estimated credits; card links to the Log ledger.
    const row = rowWith([], { cashOnHandAnchor: 500, cashOnHandAnchorAsOf: iso(addDays(now, -21)), accountCreatedIdx: 0 }); // idx 0 = no auto-confirmed weeks → credits pending
    row.week_confirmations = {};
    const app2 = await open({ row }); const p2 = app2.page; const card2 = p2.getByRole("region", { name: "Cash on hand", exact: true });
    const chip = p2.getByLabel("View pending paycheck credits");
    check("§22 pending paycheck credits surface on the card", (await vis(chip)) && /estimated paycheck credit/.test(await chip.innerText()));
    await chip.click(); await settle(p2, 1500);
    const ledger = p2.getByRole("region", { name: "Paycheck credits", exact: true });
    const rows = await p2.getByTestId("paycheck-credit-row").count();
    check("§22 chip opens the Log panel's Paycheck Credits ledger with rows + check-in copy", (await vis(ledger)) && rows >= 2 && /Finish your check-in/.test(await ledger.innerText()), rows);
    check("§22 Finish check-in button present", await vis(p2.getByLabel("Finish check-in")));
    eq("§22 no page errors", [...realErrors(app), ...realErrors(app2)], []); await app2.close();
    void card2;
  }
  // ── §22.C check-in's last step ("how much landed") → correction saved → ledger shows it
  {
    const row = rowWith([], { cashOnHandAnchor: 500, cashOnHandAnchorAsOf: iso(addDays(now, -21)), accountCreatedIdx: 0 });
    row.week_confirmations = {};
    const app = await open({ row }); const { page } = app;
    await page.getByLabel("View pending paycheck credits").click(); await settle(page, 1500);
    await page.getByLabel("Finish check-in").click(); await settle(page, 1200);
    // DHL weeks may require picking schedule-extension (OT) day(s) before Confirm enables.
    const confirmBtn = page.getByRole("button", { name: /^Confirm Week$/ });
    for (let i = 0; i < 4 && !(await confirmBtn.isEnabled().catch(() => false)); i++) {
      await page.getByRole("button", { name: /^\+ (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/ }).first().click(); await settle(page, 300);
    }
    await confirmBtn.click(); await settle(page, 1500);
    const step = page.getByRole("dialog", { name: "Paycheck landed" });
    const prefill = await step.locator("input").inputValue().catch(() => null);
    check("§22.C check-in ends on the 'how much landed' step, pre-filled with the estimate", (await vis(step)) && Number(prefill) > 0, prefill);
    await step.locator("input").fill("777"); await page.getByLabel("Save paycheck amount").click(); await settle(page, 1500);
    const corr = app.lastSave()?.config?.cashOnHandCreditCorrections ?? {};
    check("§22.C saving eager-saves the correction for that pay week", Object.values(corr).includes(777), corr);
    await dismissModals(page); await nav(page, "log"); await settle(page, 800);
    const ledger = await page.getByRole("region", { name: "Paycheck credits", exact: true }).innerText();
    check("§22.C ledger shows the corrected credit as confirmed, your number", /\+\$777/.test(ledger) && /your number/.test(ledger) && /Confirmed/i.test(ledger));
    eq("§22.C no page errors", realErrors(app), []); await app.close();
  }
  // ── §22.B red tier (rule b): a Needs bill due before the next payday that cash can't cover
  {
    const wed = new Date("2026-09-30T12:00:00"); // DHL preset pays through Sunday → next credit Mon 10/5
    const row = rowWith([bill({ id: "t_rent", label: "Test Rent", amount: 900, anchor: "2026-10-01" })], { cashOnHandAnchor: 600, cashOnHandAnchorAsOf: "2026-09-30" });
    const app = await open({ row, fixedTime: wed }); const { page } = app;
    const card = page.getByRole("region", { name: "Cash on hand", exact: true });
    const alert = card.getByRole("alert");
    check("§22.B red names the at-risk bill due before payday", (await vis(alert)) && /Test Rent \(\$900\) is due Oct 1, before your next paycheck/.test(await alert.innerText()));
    check("§22.B red shows the shortfall before payday, not 'to spare'", /\$300 short before payday/.test(await card.innerText()) && !/to spare/.test(await card.innerText()));
    eq("§22.B no page errors", realErrors(app), []); await app.close();
  }
  // ── §31 identity picker: shows for everyone, previews Claim Dates, ONE eager save, persists
  {
    const row = rowWith([bill({ id: "t_rent", label: "Test Rent", amount: 900 })]);
    const goalsBefore = (row.goals ?? []).length;
    const app = await open({ row, viewport: { width: 390, height: 844 } }); const { page } = app;
    check("§31 picker shows on Home for an account with no identity", await vis(page.getByTestId("archetype-picker")));
    check("§31 all six archetypes offered", (await Promise.all(["The Prepper", "The Heartbeat", "The Builder", "The Polished", "The Family Man", "The Explorer"].map((n) => page.getByText(n, { exact: true }).count()))).every((c) => c > 0));
    await page.getByText("The Builder").click(); await settle(page, 600);
    const t = await bodyText(page);
    check("§31 preview lists starter goals with Claim Dates", /Starter Emergency Fund/.test(t) && /Claim Date/i.test(t), t.slice(0, 200));
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check("§31 no horizontal overflow at 390px", noOverflow);
    await app.shot("s31-preview");
    const before = app.saves.length;
    await page.getByLabel("Target for Starter Emergency Fund").fill("1200"); await page.getByLabel("Target for Starter Emergency Fund").blur();
    await page.getByRole("button", { name: /Add 4 goals/i }).click(); await settle(page, 1500);
    const sv = app.saves.slice(before).filter((x) => x.config?.identity);
    // The eager write plus the app's normal post-state debounce may both land (same as every eager-save
    // action) — what matters is no partial write: every save after confirm carries goals AND identity together.
    const wrote = app.saves.slice(before);
    check("§31 confirm writes goals AND config.identity together (never split)", sv.length >= 1 && wrote.every((x) => x.config?.identity?.archetypeId === "builder" && x.goals.length === goalsBefore + 4), wrote.map((x) => [!!x.config?.identity, x.goals?.length]));
    check("§31 edited target saved", sv[0]?.goals?.some((g) => g.label === "Starter Emergency Fund" && g.target === 1200 && g.templateKey === "builder.starter_emergency"));
    check("§31 picker gone after confirm", !(await vis(page.getByTestId("archetype-picker"))));
    await app.reload();
    check("§31 identity persists across reload (picker stays gone)", !(await vis(page.getByTestId("archetype-picker"))));
    eq("§31 no page errors", realErrors(app), []); await app.close();
  }
  // ── §31 identity picker on New Job Season Home: jobless-from-day-one users get it too (dates paused)
  {
    const row = rowWith([bill({ id: "t_rent", label: "Test Rent", amount: 900 })], njsConfig(T));
    row.goals = [];
    const app = await open({ row, viewport: { width: 390, height: 844 } }); const { page } = app;
    check("§31 NJS home shows the picker", await vis(page.getByText("Who are you becoming next?")));
    await page.getByText("The Prepper").click(); await settle(page, 600);
    const t = await bodyText(page);
    check("§31 NJS preview promises a start, not a date", /Starts with your first paycheck/.test(t) && !/By [A-Z][a-z]{2} \d/.test(t));
    await app.shot("s31-njs-preview");
    const before = app.saves.length;
    await page.getByRole("button", { name: /Add 4 goals/i }).click(); await settle(page, 1500);
    const wrote = app.saves.slice(before).filter((x) => x.config?.identity);
    check("§31 NJS confirm saves goals + identity together", wrote.length >= 1 && wrote.every((x) => x.config.identity.archetypeId === "prepper" && x.goals.length === 4), wrote.map((x) => x.goals?.length));
    check("§31 NJS shows the seeded goals as paused Claim Dates", /claim dates/i.test(await bodyText(page)) && /on hold|paused/i.test(await bodyText(page)) && !(await vis(page.getByText("Who are you becoming next?"))));
    eq("§31 NJS no page errors", realErrors(app), []); await app.close();
  }
  // ── §31 change-identity flow: PICK FIRST → new goals added after old → tidy up on the Goals page
  {
    const row = rowWith([bill({ id: "t_rent", label: "Test Rent", amount: 900 })]);
    row.config.identity = { archetypeId: "builder", chosenAt: "2026-10-06T00:00:00.000Z" };
    const app = await open({ row, viewport: { width: 390, height: 844 } }); const { page } = app;
    const picker = page.getByTestId("archetype-picker"); const banner = page.getByTestId("identity-locked-banner");
    const oldGoals = (row.goals ?? []).length;
    check("§31 Goals page shows Identity locked in banner", (await vis(banner)) && /identity locked in/i.test(await banner.innerText()) && /The Builder/.test(await banner.innerText()));
    // Cancel leaves everything alone
    await nav(page, "account"); await page.getByText(/The Builder · tap to change/).click(); await settle(page, 600);
    const dlg = page.getByRole("dialog", { name: "Change your identity" });
    check("§31 tapping Identity opens the are-you-sure popup, no edit-first option", (await vis(dlg)) && !(await page.getByText("Edit goals first").count()));
    await app.shot("s31-change-dialog");
    const before = app.saves.length;
    await page.getByText("Cancel").click(); await settle(page, 500);
    check("§31 Cancel writes nothing", app.saves.length === before);
    // Continue → picker on Home while the old identity is still saved
    await page.getByText(/The Builder · tap to change/).click(); await settle(page, 500);
    await page.getByText("Choose new identity").click(); await settle(page, 1200);
    check("§31 Choose new identity lands on Home with the picker (old identity still saved)", (await vis(picker)) && /Choose your new identity/.test(await bodyText(page)) && app.saves.slice(before).length === 0, app.saves.length - before);
    // Leaving without picking cancels the change
    await nav(page, "upkeep"); await settle(page, 600); await nav(page, "home"); await settle(page, 1000);
    check("§31 leaving without picking cancels the change (picker gone, banner back)", !(await vis(picker)) && (await vis(banner)));
    // Real change: pick The Explorer
    await nav(page, "account"); await page.getByText(/The Builder · tap to change/).click(); await settle(page, 500);
    await page.getByText("Choose new identity").click(); await settle(page, 1200);
    await page.getByText("The Explorer").click(); await settle(page, 700);
    await app.shot("s31-switch-preview");
    const b4 = app.saves.length;
    await page.getByRole("button", { name: /Add \d+ goals?/i }).click(); await settle(page, 1500);
    const wrote = app.saves.slice(b4);
    const last = wrote[wrote.length - 1];
    check("§31 switch writes identity=explorer + new goals appended after the old ones, in one write", wrote.every((x) => x.config?.identity?.archetypeId === "explorer" && x.goals.length === oldGoals + 4) && last?.goals?.slice(0, oldGoals).every((g, i) => g.id === row.goals[i].id), wrote.map((x) => x.goals?.length));
    const tb = (await vis(banner)) ? await banner.innerText() : "";
    check("§31 Goals page now shows the tidy-up banner for the NEW identity", /tidy up your goals/i.test(tb) && /The Explorer/.test(tb), tb);
    check("§31 picker closed after the switch", !(await vis(picker)));
    await app.shot("s31-tidy");
    await page.getByRole("button", { name: "Done", exact: true }).click(); await settle(page, 600);
    check("§31 Done dismisses tidy mode back to the plain locked banner", /identity locked in/i.test(await banner.innerText()) && /The Explorer/.test(await banner.innerText()));
    // Tidy mode also ends on leaving the screen
    await nav(page, "account"); await page.getByText(/The Explorer · tap to change/).click(); await settle(page, 500);
    await page.getByText("Choose new identity").click(); await settle(page, 1200);
    await page.getByText("The Heartbeat").click(); await settle(page, 500);
    await page.getByRole("button", { name: /Add \d+ goals?/i }).click(); await settle(page, 1500);
    check("§31 tidy banner shows after a second switch", /tidy up your goals/i.test(await banner.innerText()));
    await nav(page, "upkeep"); await settle(page, 600); await nav(page, "home"); await settle(page, 1000);
    check("§31 leaving Goals ends tidy mode (plain banner, Heartbeat)", /identity locked in/i.test(await banner.innerText()) && /The Heartbeat/.test(await banner.innerText()));
    await app.reload();
    check("§31 new identity persists across reload", /The Heartbeat/.test(await banner.innerText()));
    eq("§31 change-identity no page errors", realErrors(app), []); await app.close();
  }
} catch (e) { fail++; console.log(`FAIL  harness error: ${e.message}`); }
finally { stop(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
