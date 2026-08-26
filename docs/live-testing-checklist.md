# Live Testing Checklist — Math/Time + Headless UI

Standing punch list for the live-testing pass started 2026-08-24 (math-engine audit →
admin-tools sweep → adversarial-input pass). Each item names what to verify and how,
split by *kind* of check rather than by feature, since the two need different rigor:

- **Math/Time** items get verified by running the real production function (`buildYear`,
  `computeNet`, `computeNewJobSeasonRunway`, etc.) against real or representative config —
  script-level, no browser needed — then, where the number is user-visible, cross-checked
  against what the live UI actually displays for the same account/scenario.
- **Headless UI** items get verified by driving the real app with Playwright (see
  `_scratch_base.cjs` pattern below) — clicking through the actual flow, not just asserting
  the underlying function returns the right number.

A "found" item gets a real fix + a `drift-app-warden.md` F-entry + a `BUG_FIX_TODO.md` DW
entry, same as every other finding this session — this file is the intake queue, not the
permanent record (see `BUG_FIX_TODO.md`'s own header for that distinction).

> Status legend: ⬜ not started · 🔶 in progress · ✅ done (see linked DW-entry) · 🚫 blocked

---

## Playwright harness (for every Headless UI item below)

```js
// scratchpad/_scratch_base.cjs — proxy + auth-state boilerplate this session settled on
const { chromium } = require('playwright');
const path = require('path');
const SCRATCH = '<session scratchpad dir>';
async function launch() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: [
      `--proxy-server=${process.env.HTTPS_PROXY}`,
      '--proxy-bypass-list=127.0.0.1;localhost',
      '--ssl-version-max=tls1.2',
    ],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: path.join(SCRATCH, 'auth-state.json') });
  const page = await context.newPage();
  return { browser, context, page, SCRATCH };
}
module.exports = { launch, SCRATCH };
```

Notes learned the hard way this session:
- Use `waitUntil: "domcontentloaded"` + an explicit `waitForTimeout(8000-9000)`, not
  `networkidle` — the app's own polling keeps `networkidle` from ever firing.
- Button `textContent` is literal JSX text, not CSS-transformed — a button styled
  `text-transform: uppercase` still matches lowercase in `page.textContent('body')`.
- `input[type=number].fill()` silently clamps/empties out-of-range or non-numeric values in
  some cases — cross-check the real `.inputValue()` after filling, don't trust a body-text
  string search alone for adversarial-input tests.
- MetricCard's countup animation (~1200ms) means a number read immediately after a view
  switch can be mid-count — wait ~2s before comparing two panels' figures for an exact match.
- The shared test account is real, persistent state across the whole session — anything that
  flips a big mode switch (New Job Season, Investor, etc.) needs a clear revert path
  confirmed *before* activating it, not after.

---

## Math / Time Calculations

### 1. New Job Season — live UI walkthrough ⬜
Script-level math already verified (`computeNewJobSeasonRunway`'s burn/cash-decay/benefits/
pending-check piecewise formula all matched hand-calculation exactly, incl. both branches of
the "check arrives before vs. after dry-out" edge case — see chat history 2026-08-25). Not yet
done: the actual click-through.
- Confirm the revert path first: does "Back to Work" (`returnToWorkDate`) cleanly restore
  normal mode, or does something (nav items, `config.newJobSeasonMode`) stick? Check this on
  a throwaway/synthetic account state before touching the shared test account, or use the DB
  Row Viewer to snapshot `config` first and confirm you can restore it.
- Walk the full "Quit My Job" wizard (`NewJobSeasonEntry.jsx`) end to end.
- Confirm `NewJobSeasonHomePanel`/`NewJobSeasonBudgetPanel` render the same runway numbers
  the script-level check already validated, for the *actual* account's real cash-on-hand/
  expenses/benefits config — not just a synthetic fixture.
- Confirm Coach's context (`aiContext.js`) reflects New Job Season numbers correctly if Coach
  is tested in the same pass (see Headless UI §5 below).

### 2. Loans tab math ⬜
Flagged as DW-W1 (`drift-app-warden.md` §10 F41) — loan `history` is regenerated retroactively
on every edit (`buildLoanHistory(meta)`), a known designed-in gap, but never live-verified.
- Add a loan, confirm `computeLoanPayoffDate` matches a hand calculation for a simple
  amount/payment/frequency combo.
- Edit loan terms mid-quarter, confirm past weeks' spend doesn't silently change (the DW-W1
  risk) — or confirm it does and that's expected/acceptable.
- Check `loanWeeklyAmount` feeds `weeklyAmountForBurn` correctly when a loan is
  `trackDuringNewJobSeason` (already exercised indirectly by item 1, worth a direct check too).

### 3. Résumé Review / job-hunt tracking math ⬜
`ReemploymentTracker.jsx` — target income derivation (`baseRate × hours`), job application
log. Untouched this session; ties into New Job Season (item 1).

### 4. Life Events — full save-through flows ⬜
This session only tested adversarial *input* on the wizard page (negative/huge/decimal
values, now fixed — DW-14/F156). Never finished watching a save propagate all the way to
Home/Income's displayed numbers.
- "Pay Structure Changed" — change a real field, save, confirm Home/Income/Budget all update
  consistently with no stale figures.
- "Rate Update" (`RateUpdateModal`) — same, full save-through (base math already cross-checked
  in an earlier pass, DW-1 — this is about the *whole* flow, not just the modal's own preview).

---

## Headless Browser UI Testing

### 5. Ask Coach ⬜
Never opened this session. Reads a lot of the exact figures this session touched or fixed
(`avgWeeklySpend`, `remainingSpend`, goal timelines, New Job Season runway via
`buildCoachContext`) — worth confirming it reflects the DW-15 (Budget/Home `avgWeeklySpend`
unification) and DW-11/DW-12 (Lock Date, DB Row drift badge) fixes rather than a stale
context shape. Also worth a quick adversarial pass on chat input itself (very long message,
rapid-fire sends) given DW-9's rate-limiter/cost-guardrail work referenced in
`drift-app-warden.md`.

### 6. Bulk Edit — second pass now that it's reachable ⬜
F155/DW-13 shipped this session (double-tap trigger + standalone button, full-page
`BulkEditPage.jsx`). Verified live that both triggers open correctly and a single staged
edit saves. Not yet done: a *multi*-change session (stage an edit + a deletion + a new
expense in the same visit, confirm the change-count badge and the actual saved payload are
all correct together — `buildAdvancedEditPayload` has unit coverage for this shape, but it's
never been driven from the real page).

### 7. Reopen Last Check-In / Force Sync Push (isAdmin-only, not isAiAdmin) ⬜
Deliberately not exercised this session (out of scope for the `isAiAdmin` test account per
its own documented restriction — no-write policy). If a full-`isAdmin` session is ever
available, worth a pass: these were the DW-3 fix (eager-save on reopen) from an earlier
session — confirm they still work post this session's `isDiagnosticAdmin` gate changes
(F153) without having actually re-tested them live this time.

### 8. PWA install / offline behavior ⬜
Not touched at all. Lower priority — no math/time risk, but untested this whole live-testing
arc.
