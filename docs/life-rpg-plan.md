# Life RPG — Project Plan

**Developer:** Anthony (solo)
**Target Launch:** August 1, 2026
**Sprint Structure:** 30-min sessions, 4x/week

---

## Launch Requirement (MVP)

Two pillars must be complete before public launch:

| Pillar | Description | Status |
|--------|-------------|--------|
| **Finance** | Income calc, budget, goals waterfall, event log, 401k, tax planner | 🔨 In progress |
| **Career / Education** | 5-year life plan — goals, career roadmap, education priorities, action sequencing | ⏳ Next |

**Post-launch pillars** (build while selling to first customers):
- Fitness
- Family Planning

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 18 + Vite | Plain JS/JSX, no TypeScript |
| Styling | Inline styles only | No Tailwind, no UI kit |
| Persistence | localStorage (MVP) | Swap for Supabase when going multi-user |
| AI | Claude API (Sonnet) | For Career/Education pillar planning features |
| Payments | Stripe | Per-pillar subscription upgrades — add post-launch |
| Hosting | Vercel | Static deploy from GitHub, no backend needed for MVP |

**Current architecture:** Single `App.jsx` file, all state in root component, `useMemo` chains for derived values. No backend. No auth.

---

## Persistence Path

1. **Now:** localStorage — data survives refresh, works on Vercel, tied to one browser
2. **Later:** Supabase + auth — when going multi-user or multi-device
3. **The swap is easy** — data shape stays the same, just change where it reads/writes

---

## Claude API Integration (for Career/Education pillar)

```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function sendMessage(conversationHistory, systemPrompt) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversationHistory,
  });
  return response.content[0].text;
}
```

**5-Phase planning methodology** (for 5-year life plan feature):
1. Vision Capture — end-state goals for each domain
2. Reality Check — current constraints, hours, hard blockers
3. Priority Stack — sequence goals by dependencies
4. Output Generation — daily/weekly/monthly action plans
5. Accountability Setup — check-in rhythms

---

## Decision Gates

**Finance pillar gate:** Are you using it yourself every week? If not, fix it before building Career/Education.

**Career/Education gate:** Does the 5-year plan output feel useful or like a survey with extra steps? Fix it before launch.

**Launch gate:** Have at least 3 people outside your own head tested the app before going public.

---

## Checklists

**Before each phase completion:**
- [ ] Happy path works end-to-end
- [ ] Error states handled
- [ ] Loading states shown
- [ ] Data persists across refresh
- [ ] Mobile usable (basic)

**Before Vercel deploy:**
- [ ] Environment variables set (Anthropic key, Stripe key when applicable)
- [ ] No secrets in source code
- [ ] App loads and works on a fresh browser

**Before Supabase migration (future):**
- [ ] RLS policies enabled
- [ ] Stripe webhook endpoint configured
- [ ] CORS configured
- [ ] Rate limiting on any API routes

---

## Emergency Reset Protocol

If 2+ weeks behind:
1. Cut 5-year plan AI conversation — output a static template instead
2. Cut mobile polish — responsive basics only
3. Cut Fitness and Family Planning scope entirely until post-launch

**Protect at all costs:** Finance pillar usability + Career/Education plan output quality.

---

## Original 8-Phase Roadmap (Brainstorming Reference)

*The old SaaS vision — useful as feature inspiration, not a literal plan.*

| Phase | Focus |
|-------|-------|
| 0 | Foundation — React scaffold, Supabase auth, routing |
| 1 | Data architecture — schema, CRUD API, user profile |
| 2 | Skill selection flow — category picker, free tier gating |
| 3 | Onboarding conversation — Claude API, 5-phase methodology, structured data extraction |
| 4 | Plan generation — AI output, daily/weekly/monthly views |
| 5 | Daily accountability loop — check-ins, streak tracking, weekly reflections |
| 6 | Payments — Stripe checkout, webhooks, feature gating |
| 7 | Polish & mobile — responsive CSS, error handling, UX cleanup |
| 8 | Launch prep — production deploy, live Stripe, first 10 users |
