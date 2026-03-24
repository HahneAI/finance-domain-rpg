# CLAUDE.md - Life RPG Project Configuration

## App Pillars & Launch Plan

The app is built around 4 life domains. Each pillar is a separate paid package unlocked via Stripe.

| Pillar | Launch Status | Notes |
|--------|--------------|-------|
| **Finance** | ✅ MVP — build first | Personal finance dashboard (income, budget, goals, event log) |
| **Career / Education** | ✅ MVP — build second | 5-year life plan feature (career goals, education roadmap, priority stack) |
| **Fitness** | Post-launch | Add after first customers |
| **Family Planning** | Post-launch | Add after first customers |

**Launch Requirement:** Finance pillar + Career/Education pillar (5-year life plan) must both be complete and working before public launch.

**Persistence Strategy:** localStorage for MVP personal use → deploy to Vercel → add Supabase + auth later when going multi-user/paid.

**Post-Launch Plan:** Launch publicly once both MVP pillars ship, then sell to first customers while continuing to build Fitness and Family Planning pillars.

---

**Project:** Life RPG - AI-Powered Life Planning App
**Developer:** Solo (Anthony)
**Build Window:** January 27 - July 31, 2026 (26 weeks)
**Target Launch:** August 1, 2026

---

## Quick Reference

**Tech Stack:** React + Node.js/Express + Supabase + Claude API + Stripe + Vercel
**Planning Docs:** `docs/life-rpg-plan.md` and `docs/starting-off.md` (finance pillar spec)
**Current Phase:** Foundation (Week 1-3)
**Session Structure:** 30-minute sprints, 4x/week

---

## Project Overview

Life RPG is an AI-powered life planning app that guides users (males 18-28 with demanding jobs) through a coaching conversation to capture goals, reality-check their situation, and generate actionable daily/weekly/monthly checklists with accountability tracking.

**Business Model:**
- Free tier: 2 skills + faith (always free), 3-year planning
- Paid tier: 5 skills, 10-year planning, advanced features

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React (Vite) | User interface |
| Backend | Node.js + Express | REST API |
| Database | Supabase (PostgreSQL) | Data storage + Auth |
| Auth | Supabase Auth | Email/password authentication |
| AI | Claude API (Sonnet) | Coaching conversations |
| Payments | Stripe | Subscription management |
| Hosting | Vercel (frontend) + Railway (backend) | Deployment |

---

## UI Component Standards

> Full reference: `docs/finance-dashboard-ui-impl.md`

### Design Token Source
All colors and fonts are CSS vars defined in `src/index.css` `@theme` block. **Never use raw hex for gold, green, or red.**

| Token | Value | Role |
|-------|-------|------|
| `--color-bg-base` | `#0a0a0a` | App shell / page background |
| `--color-bg-surface` | `#111814` | Card background |
| `--color-bg-raised` | `#1a2118` | Elevated card, button hover |
| `--color-gold` | `#c9a84c` | Hero numbers, primary actions |
| `--color-green` | `#4caf7d` | Positive / income values |
| `--color-red` | `#e05c5c` | Negative / spend values |
| `--color-text-primary` | `#f0ede6` | Body text |
| `--color-text-secondary` | `#8a9080` | Labels, sublabels |
| `--color-text-disabled` | `#444c40` | Inactive / disabled |
| `--font-display` | DM Serif Display | Hero numbers only |
| `--font-sans` | DM Sans | All UI body text |
| `--font-mono` | JetBrains Mono | Inputs + data table cells only |

### Shared Primitives (`src/components/ui.jsx`)

| Export | What it is | Key props |
|--------|-----------|-----------|
| `MetricCard` / `Card` | Unified static + interactive card | `label`, `val`, `sub`, `status` (`green\|gold\|red`), `onClick`, `rawVal` (triggers countup), `entranceIndex` (stagger), `span` |
| `NT` | Nav tab (top-level) | `label`, `active`, `onClick` — gold when active |
| `VT` | View tab (sub-panel) | Same as NT, smaller padding |
| `SmBtn` | Inline utility button | `children`, `onClick`, `c` (color), `bg` |
| `SH` | Section header | `children`, `color`, `right` — gold left-bar + uppercase label |
| `iS` | Input style object | Spread onto `<input>` / `<select>` — JetBrains Mono, 16px, full-width |
| `lS` | Label style object | Spread onto `<label>` — 10px, 2px tracking, uppercase, disabled color |

### Layout Constants
- Card grid gap: `12px`
- Section `marginBottom`: `20px`
- Card padding: `18px 16px` (static) · `16px 18px` + `minHeight: 88px` (interactive)

### Inline Button Pattern (not abstracted — apply directly)
```
CANCEL: bg-raised, text-secondary, border-subtle, radius 12px, pad 7px 14px, 10px uppercase
SAVE:   bg green or gold, color bg-base, radius 12px, pad 8px 16px, 10px bold uppercase
```

### Animation Rules
- Entrance stagger: `entranceIndex` prop on MetricCard → `fadeSlideUp` 400ms, 80ms/card delay, capped at 400ms
- Countup: pass `rawVal` (number) → animates 0→target over 1200ms on mount/change
- Value flash: `rawVal` change → gold-bright for 150ms, fades back over 600ms
- **No bounce, no spin, no scale-up on mount. Press = `scale(0.97)` only. All durations ≤ 500ms except countup.**

### Mobile UI Direction
Selected style: **Style D — Dashboard Tile Grid** (Apple Health / Robinhood pattern). Home screen = 2-col metric tile grid, color-coded by status, tappable to drill into panel. Navigation is depth-first (home → detail), not tab-first. Tiles use `grid-column: span 2` for wide items. Back nav via `viewStack` push/pop in App.jsx.

**Mobile testing checklist (run before any mobile ship):**
- [ ] No horizontal scroll at 390px (iPhone 14–17) and 375px (iPhone SE)
- [ ] All tap targets ≥ 44×44px
- [ ] Font-size ≥ 16px on all inputs (prevents iOS zoom)
- [ ] Bottom nav clears home indicator (`safe-area-inset-bottom`)
- [ ] PWA installs from Safari "Add to Home Screen"
- [ ] Standalone display mode active (no browser chrome when launched from home screen)
- [ ] App works offline (service worker caches JS/CSS)
- [ ] Dark status bar on iPhone (black-translucent)
- [ ] Dynamic Island / notch area not obscured

---

## File Organization

### Standard Structure

```
life-rpg/
├── docs/                           # Project documentation
│   ├── life-rpg-claude-code-spec.md    # Complete technical spec
│   ├── life-rpg-roadmap.md             # 26-week build roadmap
│   └── claude-setup-analysis.md        # Agent adaptation strategy
│
├── frontend/                       # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/               # LoginForm, SignupForm, ProtectedRoute
│   │   │   ├── onboarding/         # SkillSelector, ChatInterface, ChatMessage
│   │   │   ├── dashboard/          # TodayChecklist, StreakDisplay, QuickStats
│   │   │   ├── plan/               # DailyView, WeeklyView, MonthlyMilestones
│   │   │   ├── checkin/            # CheckinForm, TaskCheckbox
│   │   │   └── common/             # Button, Card, Loading, Navigation
│   │   ├── pages/
│   │   │   ├── Landing.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Signup.jsx
│   │   │   ├── Onboarding.jsx
│   │   │   ├── OnboardingChat.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Plan.jsx
│   │   │   ├── Checkin.jsx
│   │   │   ├── Reflection.jsx
│   │   │   ├── Settings.jsx
│   │   │   └── Upgrade.jsx
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   ├── useConversation.js
│   │   │   ├── usePlan.js
│   │   │   └── useCheckin.js
│   │   ├── lib/
│   │   │   ├── supabase.js        # Supabase client
│   │   │   ├── api.js             # API wrapper
│   │   │   └── utils.js           # Helper functions
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── .env
│   ├── package.json
│   └── vite.config.js
│
├── backend/                        # Node.js API server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js            # Auth endpoints (handled by Supabase mostly)
│   │   │   ├── profile.js         # User profile CRUD
│   │   │   ├── skills.js          # Skill selection, free tier enforcement
│   │   │   ├── conversation.js    # Onboarding conversation + Claude API
│   │   │   ├── plan.js            # Plan generation, retrieval
│   │   │   ├── checkin.js         # Daily check-ins, streak tracking
│   │   │   ├── reflection.js      # Weekly reflections
│   │   │   └── stripe.js          # Stripe checkout, webhooks
│   │   ├── lib/
│   │   │   ├── supabase.js        # Supabase service role client
│   │   │   ├── claude.js          # Claude API integration
│   │   │   └── stripe.js          # Stripe SDK setup
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT verification middleware
│   │   │   └── errorHandler.js    # Global error handling
│   │   ├── server.js              # Express app setup
│   │   └── index.js               # Entry point
│   ├── .env
│   ├── package.json
│   └── README.md
│
├── database/                       # Supabase migrations
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_streaks.sql
│   │   └── 003_add_reflections.sql
│   └── seed/
│       └── skill_categories.sql
│
├── .claude/
│   └── CLAUDE.md                   # This file
│
├── .gitignore
├── README.md
└── package.json (workspace root if using monorepo)
```

### Naming Conventions

- **Files:** kebab-case (e.g., `skill-selector.jsx`, `use-auth.js`)
- **Components:** PascalCase (e.g., `SkillSelector`, `ChatInterface`)
- **Utilities/Hooks:** camelCase (e.g., `useAuth`, `formatDate`)
- **Database:** snake_case (e.g., `user_skills`, `check_ins`)

---

## Database Schema Summary

**Core Tables:**
- `profiles` - User accounts (extends Supabase auth.users)
- `skill_categories` - Available skill categories
- `user_skills` - User's selected skills
- `conversations` - Onboarding conversation history
- `plans` - Generated daily/weekly/monthly plans
- `check_ins` - Daily accountability check-ins
- `streaks` - Streak tracking per user
- `weekly_reflections` - Weekly reflection entries

**Key Relationships:**
- All tables user-scoped via `user_id` (references `profiles.id`)
- RLS policies enforce user isolation (simplified single-tenant)
- No multi-tenant complexity (no `company_id`)

---

## AI Conversation System

### 5-Phase Methodology

**Phase 1: Vision Capture**
- Capture user's 5-10 year end-state for selected skills
- "What does success look like?"

**Phase 2: Reality-Check Questions**
- Work situation, available hours, constraints
- Starting points, bottlenecks, dependencies
- 11 sequential questions that ground the vision

**Phase 3: Priority Stack Generation**
- AI synthesizes goals, sequences them
- Maps dependencies
- Time allocation recommendations

**Phase 4: Output Generation**
- Daily micro-checklist (workday + off-day versions)
- Weekly rhythm template
- Monthly milestones
- Yearly overview
- Consistency target: 70-80%

**Phase 5: Accountability Loop Setup**
- Daily check-ins (yes/no on tasks)
- Weekly reflection prompts
- Monthly checkpoints
- Progress visualization

### System Prompt Structure

Located in `docs/life-rpg-claude-code-spec.md` (lines 192-220)

Key characteristics:
- Direct, encouraging, practical tone
- One question at a time
- Concise responses (2-4 sentences)
- Uses user's language
- Faith as valid category

---

## Development Workflow

### Sprint Structure

**30-Minute Sprints** (4x/week)

**Before sprint:**
1. Check roadmap - know current phase
2. Load Claude Code with tech spec context
3. Set 30-minute timer
4. State single-task goal

**After sprint:**
1. Commit code (even if broken)
2. Write 1-sentence summary
3. Close everything

### Current Phase Checklist

**Phase 0: Foundation (Weeks 1-3)**
- [ ] Week 1: Project scaffold + Supabase setup
- [ ] Week 2: Auth integration (signup/login/logout)
- [ ] Week 3: Routing + protected routes

**Checkpoint:** User can sign up, log in, see empty dashboard

---

## Claude Code Agent Reference

### Core Development Agents

**frontend-developer** (Sonnet)
- React components for Life RPG UI
- Onboarding flow, dashboard, check-in interface
- User-centric state management (no multi-tenant patterns)

**backend-architect** (Sonnet)
- Express REST API design
- Supabase integration
- Claude API conversation handling

**database-architect** (Sonnet)
- User-scoped schema design
- Simple RLS policies (user_id only)
- Conversation/plan/check-in data modeling

**ui-ux-designer** (Sonnet)
- Coaching conversation UX
- Mobile-first daily check-in flows
- Dashboard design for young male target demo

### AI/Prompting Agents

**prompt-engineer** (Opus)
- Life coaching conversation prompts
- 5-phase methodology implementation
- Tone and language optimization

**ai-engineer** (Opus)
- Claude API integration
- Conversation state management
- Plan generation from structured data

### Testing & Quality Agents

**test-automator** (Sonnet)
- User flow tests (signup → onboarding → check-in)
- API endpoint testing
- No multi-tenant complexity

**debugger** (Sonnet)
- Frontend/backend error resolution
- Supabase debugging
- Stripe integration issues

**code-reviewer** (Sonnet)
- General code quality
- Security best practices
- API design review

### Payments Agent

**payment-integration** (Sonnet)
- Stripe single subscription implementation
- Free tier enforcement
- Webhook handling

### Meta Agents

**agent-selector** (Opus) - Intelligent task routing
**claude-code-expert** (Sonnet) - Claude Code optimization

---

## Skills Reference

### Active Skills

**life-rpg-file-organization** - Auto-determines file placement in Life RPG codebase
**doc-template-minimal** - Token-efficient documentation (50-300 words, focus on WHY)
**nodejs-backend-patterns** - Express API, middleware, error handling
**typescript-advanced-types** - Type safety for API/Supabase (if using TypeScript)
**stripe-integration** - Payment processing, subscriptions, webhooks
**prompt-engineering-patterns** - Advanced LLM prompt techniques
**javascript-testing-patterns** - Jest/Vitest testing strategies
**modern-javascript-patterns** - ES6+ features, async/await, functional patterns
**coaching-conversation-patterns** - Life RPG specific AI conversation design

---

## Key Simplifications from TradeSphere

### What's Different

✗ **No multi-tenant patterns** (no company_id everywhere)
✗ **No GraphQL** (using REST API)
✗ **No complex RLS** (user_id scoping only)
✗ **No configuration-driven architecture** (features hardcoded for MVP)
✗ **No team coordination** (solo developer)
✗ **No RAG implementation** (not needed for MVP)

✓ **Same Supabase auth patterns**
✓ **Same file organization discipline**
✓ **Same documentation standards**
✓ **Same agent selection intelligence**

---

## Environment Variables

### Frontend (.env)
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_URL=http://localhost:3001
```

### Backend (.env)
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
ANTHROPIC_API_KEY=your_anthropic_api_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
FRONTEND_URL=http://localhost:3000
```

---

## Testing Checklist

Before each phase completion:
- [ ] Happy path works end-to-end
- [ ] Error states handled (network failure, invalid input)
- [ ] Loading states shown during async operations
- [ ] Mobile responsive (test on phone)
- [ ] Data persists across page refresh
- [ ] Logged-out users redirected appropriately

---

## Deployment Checklist

Before launch:
- [ ] Environment variables set in production
- [ ] Supabase RLS policies enabled
- [ ] Stripe webhook endpoint configured
- [ ] CORS configured correctly
- [ ] Error logging/monitoring set up
- [ ] Database backups enabled
- [ ] SSL/HTTPS working
- [ ] Rate limiting on API routes

---

## Decision Gates

**Week 11 Gate:** Is the onboarding conversation actually useful?
→ If it feels like a survey with extra steps, redesign before proceeding.

**Week 17 Gate:** Are you using your own app daily?
→ If not, something's wrong. Fix it before adding payments.

**Week 23 Gate:** External user feedback collected?
→ Don't launch without at least 3 people outside your head testing it.

---

## Emergency Reset Protocol

If you fall 2+ weeks behind:
1. Cut weekly reflection (Phase 5) - add post-launch
2. Cut mobile polish (Week 21) - responsive basics only
3. Simplify plan output (Week 12-14) - daily checklist only, skip monthly view

**Protect at all costs:**
- Onboarding conversation quality
- Core check-in loop
- Payment flow

---

## When Starting Each Sprint

Tell Claude Code:

1. **Current phase** (e.g., "Phase 0: Foundation, Week 2")
2. **Specific task** (e.g., "Implementing signup flow")
3. **What's done** (e.g., "Project scaffolded, Supabase project created")
4. **Definition of done** (e.g., "User can submit signup form, account created, redirected to dashboard")

**Example:**
```
I'm building Life RPG, a goal-planning app. Here's the technical spec: [paste relevant sections]

Current status:
- Phase: Foundation (Week 2)
- Done: React app scaffolded, Supabase project created, environment variables configured
- Today's task: Implement signup flow

Goal for this 30-min session:
- SignupForm component that collects email/password
- Calls Supabase auth.signUp()
- Shows loading state during submission
- Shows error message if signup fails
- Redirects to /dashboard on success

Please help me implement this step by step.
```

---

## Additional Resources

**Primary Docs:**
- Technical Spec: `docs/life-rpg-claude-code-spec.md`
- Build Roadmap: `docs/life-rpg-roadmap.md`
- Agent Adaptation: `docs/claude-setup-analysis.md`

**Global Config:**
- MCP Servers: `C:\Users\antho\.claude.json`
- Plugin Settings: `C:\Users\antho\.claude\settings.json`
- Custom Plugins: `C:\Users\antho\.claude\plugins\marketplaces\life-rpg-dev\`

**Quick Commands:**
- `/help` - Show available agents, commands, skills
- `claude doctor` - Verify MCP server status

---

**Last Updated:** January 30, 2026
**Maintained By:** Anthony (with Claude's assistance)

---

*"30 minutes. One task. Every workday. That's the system."*
