# Authority Finance

Personal finance dashboard — the flagship module of Authority OS.

Built for individuals who want clarity over their income, spending, and goals in one place. Not a budgeting app. Not a tracker. A system.

---

## Core domains

- **Income & pay modeling** — projects full-year net take-home from your actual pay structure, schedule, and tax situation; adapts automatically across hourly, salaried, shift-based, and commission income
- **Budgeting, goals & debt payoff** — tracks expenses, savings goals, and loans together, projecting realistic funding and payoff dates from real income timing rather than flat averages
- **Life events & adaptive planning** — guided flows for a raise, a new job, or a pay-structure change, including a dedicated mode for navigating a job loss without losing sight of the rest of your finances
- **Benefits & time-off tracking** — projects retirement contributions and employer matching, and tracks paid-time-off accrual against actual worked history
- **Event logging & impact tracking** — log real-world changes (missed shifts, bonuses, one-off adjustments) and see the exact ripple effect on take-home pay, taxes, and goal timelines
- **Account, security & installable experience** — Supabase-backed auth with per-user data isolation, subscription & billing management, full account control, and a mobile-first installable app experience

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI | React + Vite |
| Styling | Tailwind CSS + CSS custom properties |
| Auth | Supabase Auth |
| Persistence | Supabase (live, multi-user) — localStorage retained as a legacy fallback |
| Billing | Stripe (subscriptions) |
| Hosting | Vercel |

---

## Design system

Flow shell + Pulse overlay (Authority OS dual-layer system).

- **Flow** — dark green surfaces, smooth transitions, fintech feel
- **Pulse** — intelligence signal layer (trend indicators, insight context) — Phase 2

---

## Running locally

```bash
npm install
npm run dev
```

Requires a `.env` with Supabase credentials:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Testing

```bash
npm run test:run      # single pass — use this to verify a change
npm test              # watch mode
npm run test:coverage
npx vitest run -u     # update snapshots after intentional config changes
```

Tests live in `src/test/`. Runner is Vitest 4 with a dedicated `vitest.config.js` (separate from `vite.config.js`). The test config intentionally omits Tailwind, LightningCSS, and the React Compiler — none are needed for unit/component tests, and their native binaries fail in sandboxed environments.

**Do not use `npm run test -- --runInBand`.** That flag is Jest-specific; Vitest ignores it. Use `npm run test:run` for a single serial pass.

---

## Status

Active development. Finance pillar in MVP, with live multi-user auth, per-user data isolation,
and subscription billing. Additional Authority OS modules planned.
