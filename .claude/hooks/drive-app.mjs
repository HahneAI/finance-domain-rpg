// Headless-browser smoke driver for Claude Code on the web sessions.
//
// Not part of the app itself (lives in .claude/hooks/, not src/) — a
// convenience for a session to actually SEE a change working, per CLAUDE.md's
// "start the dev server and use the feature in a browser" rule, without
// hand-rolling this every time. Reads TEST_ACCOUNT_EMAIL/PASSWORD from the
// environment (set on this Claude Code on the web environment, never
// committed) — logs in, takes a screenshot, and exits. Extend the `nav`
// steps below per-task; this is deliberately just the login + first-screen
// smoke test, not a full E2E suite (that's Vitest's job).
//
// Usage: node .claude/hooks/drive-app.mjs [devServerUrl]
// Requires: npm run dev already running (session-start.sh does not start it —
// starting/stopping the dev server per-task is the agent's call, not a
// hook's, since a hook can't know when a session is done needing it).

import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173";
const email = process.env.TEST_ACCOUNT_EMAIL;
const password = process.env.TEST_ACCOUNT_PASSWORD;
const outDir = process.env.CLAUDE_SCRATCHPAD_DIR ?? "/tmp";

if (!email || !password) {
  console.error("TEST_ACCOUNT_EMAIL/TEST_ACCOUNT_PASSWORD not set — configure them on this Claude Code on the web environment. Exiting.");
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForSelector('input[type="email"]', { timeout: 15000 });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.getByRole("button", { name: "Sign in" }).click();

// Post-login shell (nav tabs) is the signal auth succeeded — same wait
// pattern the run skill recommends over a raw sleep.
await page.waitForSelector("text=Home", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1000);

const shotPath = `${outDir}/drive-app.png`;
await page.screenshot({ path: shotPath, fullPage: true });

console.log("TITLE:", await page.title());
console.log("SCREENSHOT:", shotPath);
console.log("CONSOLE_ERRORS:", JSON.stringify(errors, null, 2));

await browser.close();
