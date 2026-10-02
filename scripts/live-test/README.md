# Live test (`npm run live-test`)

Drives the **real app** (Vite dev server) in headless Chromium against a **mocked Supabase** — no test account,
credentials or production data. Asserts on visible UI text, aria-labels and the eager-save payloads, so if a shotgun
feature's UI or save shape changes, this fails (exit 1) instead of drifting.

- `lib.mjs` — harness (fake session, Supabase route mock, clock control). `fixtures.mjs` — account/bill builders.
- `run.mjs` — scenarios: §26 Due Today / this-week spend, §25 Mark Paid / Undo, §24 deleted bills (real delete UI → real wizard).
- Needs Playwright + Chromium (cloud sessions ship both; otherwise `PLAYWRIGHT_CHROMIUM=/path/to/chromium`).
- Not part of `npm run test:run` (needs a browser). When you change a covered feature, update the matching scenario.
- Real-account mode is not built: it needs `VITE_SUPABASE_URL/ANON_KEY` + `TEST_ACCOUNT_EMAIL/PASSWORD` in the environment.
