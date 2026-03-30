# Authority Finance

Personal finance dashboard — the flagship module of Authority OS.

Built for individuals who want clarity over their income, spending, and goals in one place. Not a budgeting app. Not a tracker. A system.

---

## What it does

- **Income modeling** — projects your full-year net take-home based on your pay structure, schedule, tax rates, and deductions
- **Budget management** — tracks expenses by category with drag-and-drop reordering; supports multiple billing cycles (weekly through yearly) with automatic per-paycheck allocation
- **Goal timelines** — maps savings goals against projected weekly surplus, showing realistic completion dates on a month/week grid
- **Event logging** — records schedule changes (missed days, bonuses, adjustments) that cascade through take-home, tax projections, and goal timelines in real time
- **Rolling views** — active periods scale and age progressively; historical data preserved for future review

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI | React + Vite |
| Styling | Tailwind CSS + CSS custom properties |
| Auth | Supabase Auth |
| Persistence | localStorage (MVP) → Supabase (multi-user) |
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

## Status

Active development. Finance pillar in MVP. Additional Authority OS modules planned.
