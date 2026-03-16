# Life RPG - Claude Code Technical Spec

**Paste this document (or relevant sections) into Claude Code at the start of each sprint.**

---

## Project Overview

**App Name:** Life RPG (working title)  
**Purpose:** AI-powered life planning app that walks users through a coaching conversation to capture their goals, reality-checks their situation, then generates actionable daily/weekly/monthly checklists with accountability tracking.

**Target User:** Males 18-28 with demanding jobs (trades, factory, service) who want to build toward bigger goals but have limited time and need a system.

**Business Model:**
- Free tier: 2 skills/categories + faith (always free), 3-year planning horizon
- Paid tier ($X/month): 5 skills, 10-year planning, advanced features

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React | Create React App or Vite |
| Backend | Node.js + Express | REST API |
| Database | Supabase (Postgres) | Also handles auth |
| Auth | Supabase Auth | Email/password only for MVP |
| AI | Claude API (Anthropic) | Sonnet model for conversations |
| Payments | Stripe | One subscription tier |
| Hosting | Vercel (frontend) + Railway or Render (backend) | Or all on Vercel with serverless functions |

---

## Database Schema

### Tables

```sql
-- Users (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  display_name TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_since TIMESTAMP,
  stripe_customer_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Available skill categories
CREATE TABLE skill_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL, -- e.g., "Career", "Education", "Fitness", "Faith", "Family", "Financial"
  description TEXT,
  icon TEXT, -- emoji or icon name
  is_always_free BOOLEAN DEFAULT FALSE, -- true for "Faith"
  created_at TIMESTAMP DEFAULT NOW()
);

-- User's selected skills
CREATE TABLE user_skills (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  skill_category_id INTEGER REFERENCES skill_categories(id),
  selected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, skill_category_id)
);

-- Onboarding conversation history
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  raw_transcript JSONB, -- full conversation history
  extracted_data JSONB -- structured data parsed from conversation
);

-- Generated plans
CREATE TABLE plans (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  conversation_id INTEGER REFERENCES conversations(id),
  plan_horizon TEXT, -- '3_year' or '10_year'
  daily_tasks JSONB, -- { workday: [...], offday: [...] }
  weekly_rhythm JSONB, -- { monday: [...], tuesday: [...], ... }
  monthly_milestones JSONB, -- [{ month: 1, goals: [...] }, ...]
  yearly_overview JSONB, -- [{ year: 1, focus: "...", gates: [...] }, ...]
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Daily check-ins
CREATE TABLE check_ins (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  plan_id INTEGER REFERENCES plans(id),
  check_in_date DATE NOT NULL,
  tasks_completed JSONB, -- [{ task_id: "...", completed: true/false }, ...]
  completion_rate DECIMAL(3,2), -- 0.00 to 1.00
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, check_in_date)
);

-- Streaks
CREATE TABLE streaks (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_check_in_date DATE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Weekly reflections
CREATE TABLE weekly_reflections (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  week_start_date DATE NOT NULL,
  wins TEXT, -- "What went well?"
  struggles TEXT, -- "What was hard?"
  next_week_focus TEXT, -- "What's the priority next week?"
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);
```

---

## Onboarding Conversation Flow

The conversation follows a 5-phase methodology. Claude guides the user through each phase sequentially.

### Phase 1: Vision Capture
**Goal:** Capture user's 5-10 year end-state for each selected skill category.

Questions (adapt to selected skills):
- "Let's start with [Skill]. If everything goes right over the next [3/10] years, what does success look like? Paint me the picture."
- "What would you be doing day-to-day?"
- "How would you know you've made it?"

### Phase 2: Reality-Check Questions
**Goal:** Ground the vision in current reality, identify constraints and dependencies.

Sequential questions (each answer informs the next):
1. "What's your current work situation? Hours per week, shift pattern, flexibility?"
2. "Outside of work and sleep, how many hours per day do you realistically have for growth activities?"
3. "What time commitments are non-negotiable? Family, relationships, faith practices?"
4. "Are there any hard blockers - things that MUST happen before other goals can start? Like needing a certification before a career move?"
5. "For [Skill], what's your starting point? Zero experience, or building on something?"
6. "What's your core bottleneck right now - clarity on what to do, discipline to do it, or overwhelm from too many directions?"
7. "Walk me through a typical day. When does productive time actually exist? Any passive time like commutes where you could learn?"
8. "For [Skill], what does 'done' look like, and what's a realistic timeline?"
9. "Let's pressure-test the sequence: which goals must come before others? Which can run in parallel?"
10. "Any financial or logistical constraints that affect timelines? Need to save for something first, need a car, need to relocate?"
11. "Any hidden landmines I should know about? Debts, relationship strain, obligations eating your time or energy?"

### Phase 3: Priority Stack Generation
**Goal:** AI synthesizes and sequences goals.

Claude outputs:
- Priority-ordered goal list with reasoning
- Dependencies mapped (what unlocks what)
- Time allocation recommendations based on available hours

User confirms or adjusts.

### Phase 4: Output Generation
**Goal:** Generate concrete action plans.

Claude generates:
- **Daily micro-checklist** (workday version and off-day version)
- **Weekly rhythm template** (which activities on which days)
- **Monthly milestone breakdown** (what "done" looks like each month)
- **Yearly overview** (focus areas and decision gates)
- **Consistency target:** "Aim for 70-80%, not perfection"
- **Emergency reset protocol:** What to do when life derails

### Phase 5: Accountability Loop Setup
**Goal:** Establish check-in rhythm.

Claude explains:
- Daily check-ins (simple yes/no on tasks)
- Weekly reflection prompts
- Monthly checkpoint questions
- How progress visualization works

---

## Claude API System Prompt

Use this as the base system prompt for onboarding conversations:

```
You are a life coach helping a young man (18-28) create a structured plan to achieve his goals. Your tone is direct, encouraging, and practical - like a mentor who believes in him but won't let him bullshit himself.

Your job is to guide him through a 5-phase planning process:
1. Vision Capture - understand his end-state goals
2. Reality Check - ground the vision in his actual constraints
3. Priority Stack - sequence goals based on dependencies and values
4. Output Generation - create actionable daily/weekly/monthly plans
5. Accountability Setup - establish check-in rhythms

Guidelines:
- Ask one question at a time. Wait for his response before moving on.
- Push back gently if his timelines seem unrealistic given his constraints.
- Acknowledge the grind - he likely has a demanding job and limited time.
- Keep responses concise (2-4 sentences typical, occasionally longer for summaries).
- Use his language back to him - if he says "make bank," don't correct to "achieve financial success."
- Faith is a valid and important life category if he selects it - treat it with respect.
- At the end of each phase, summarize what you've learned before moving to the next.

The user has selected these skill categories to focus on: {{SELECTED_SKILLS}}
Planning horizon: {{PLANNING_HORIZON}} years

Begin by introducing yourself briefly and asking about his vision for the first selected skill.
```

---

## API Routes

### Auth (handled by Supabase)
- `POST /auth/signup` - Create account
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `GET /auth/user` - Get current user

### Profile
- `GET /api/profile` - Get user profile
- `PATCH /api/profile` - Update profile

### Skills
- `GET /api/skills/categories` - List all skill categories
- `GET /api/skills/selected` - Get user's selected skills
- `POST /api/skills/select` - Select skills (enforce free tier limits)
- `DELETE /api/skills/:id` - Remove a selected skill

### Conversation
- `POST /api/conversation/start` - Start new onboarding conversation
- `POST /api/conversation/message` - Send message, get AI response
- `GET /api/conversation/current` - Get current conversation state
- `POST /api/conversation/complete` - Mark conversation complete, trigger plan generation

### Plan
- `GET /api/plan/current` - Get active plan
- `GET /api/plan/today` - Get today's checklist
- `GET /api/plan/week` - Get weekly view

### Check-in
- `POST /api/checkin` - Submit daily check-in
- `GET /api/checkin/history` - Get check-in history
- `GET /api/streak` - Get current streak info

### Reflection
- `POST /api/reflection/weekly` - Submit weekly reflection
- `GET /api/reflection/history` - Get reflection history

### Payments
- `POST /api/stripe/create-checkout` - Create Stripe checkout session
- `POST /api/stripe/webhook` - Handle Stripe webhooks
- `GET /api/subscription/status` - Check subscription status

---

## Frontend Routes

```
/                   - Landing page (logged out) or redirect to dashboard (logged in)
/login              - Login page
/signup             - Signup page
/onboarding         - Skill selection (if not done)
/onboarding/chat    - Onboarding conversation
/dashboard          - Main dashboard with today's checklist
/plan               - Full plan view (daily/weekly/monthly)
/checkin            - Daily check-in page
/reflection         - Weekly reflection page
/settings           - Account settings
/upgrade            - Upgrade to premium
```

---

## Component Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   ├── SignupForm.jsx
│   │   └── ProtectedRoute.jsx
│   ├── onboarding/
│   │   ├── SkillSelector.jsx
│   │   ├── SkillCard.jsx
│   │   ├── ChatInterface.jsx
│   │   └── ChatMessage.jsx
│   ├── dashboard/
│   │   ├── TodayChecklist.jsx
│   │   ├── StreakDisplay.jsx
│   │   └── QuickStats.jsx
│   ├── plan/
│   │   ├── DailyView.jsx
│   │   ├── WeeklyView.jsx
│   │   └── MonthlyMilestones.jsx
│   ├── checkin/
│   │   ├── CheckinForm.jsx
│   │   └── TaskCheckbox.jsx
│   └── common/
│       ├── Button.jsx
│       ├── Card.jsx
│       ├── Loading.jsx
│       └── Navigation.jsx
├── pages/
│   ├── Landing.jsx
│   ├── Login.jsx
│   ├── Signup.jsx
│   ├── Onboarding.jsx
│   ├── OnboardingChat.jsx
│   ├── Dashboard.jsx
│   ├── Plan.jsx
│   ├── Checkin.jsx
│   ├── Reflection.jsx
│   ├── Settings.jsx
│   └── Upgrade.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useConversation.js
│   ├── usePlan.js
│   └── useCheckin.js
├── lib/
│   ├── supabase.js
│   ├── api.js
│   └── claude.js
└── App.jsx
```

---

## Environment Variables

### Frontend (.env)
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_URL=http://localhost:3001 (or production URL)
```

### Backend (.env)
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
ANTHROPIC_API_KEY=your_anthropic_api_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
FRONTEND_URL=http://localhost:3000 (or production URL)
```

---

## Sprint Task Reference

When starting a sprint, tell Claude Code:

1. What phase you're in (e.g., "Phase 0: Foundation, Week 2")
2. What specific task you're working on (e.g., "Implementing Supabase auth - signup flow")
3. What's already done (e.g., "Project scaffolded, Supabase project created, env vars set")
4. What "done" looks like for this session (e.g., "User can submit signup form, account created in Supabase, redirected to dashboard")

### Example Sprint Prompt

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

## Key Implementation Notes

### Conversation State Management
- Store conversation history in React state during the conversation
- Send full history to Claude API with each message (Claude is stateless)
- Save to database periodically and on completion
- Handle browser refresh gracefully (load from DB if conversation exists)

### Claude API Integration
```javascript
// lib/claude.js
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

### Free Tier Enforcement
```javascript
// Check before allowing skill selection
const MAX_FREE_SKILLS = 2;
const FAITH_CATEGORY_ID = /* id of faith category */;

function canSelectSkill(user, categoryId, currentSelections) {
  if (user.is_premium) return true;
  
  // Faith is always free
  if (categoryId === FAITH_CATEGORY_ID) return true;
  
  // Count non-faith selections
  const nonFaithSelections = currentSelections.filter(
    s => s.skill_category_id !== FAITH_CATEGORY_ID
  );
  
  return nonFaithSelections.length < MAX_FREE_SKILLS;
}
```

### Streak Calculation
```javascript
function updateStreak(userId, checkInDate) {
  const streak = await getStreak(userId);
  const lastCheckIn = streak.last_check_in_date;
  
  const yesterday = new Date(checkInDate);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (lastCheckIn === yesterday.toISOString().split('T')[0]) {
    // Consecutive day - increment streak
    streak.current_streak += 1;
    streak.longest_streak = Math.max(streak.longest_streak, streak.current_streak);
  } else if (lastCheckIn !== checkInDate) {
    // Missed a day - reset streak
    streak.current_streak = 1;
  }
  // Same day = no change
  
  streak.last_check_in_date = checkInDate;
  await saveStreak(streak);
}
```

---

## Testing Checklist

Before each phase completion, verify:

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
- [ ] Supabase Row Level Security (RLS) policies enabled
- [ ] Stripe webhook endpoint configured
- [ ] CORS configured correctly
- [ ] Error logging/monitoring set up
- [ ] Database backups enabled
- [ ] SSL/HTTPS working
- [ ] Rate limiting on API routes

---

*Keep this document updated as the project evolves. When implementation decisions change, update the spec so future Claude Code sessions have accurate context.*
