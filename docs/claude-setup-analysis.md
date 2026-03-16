# Life RPG - Claude Code Setup Analysis

**Date:** January 30, 2026
**Purpose:** Adaptation strategy from TradeSphere complex multi-agent setup to Life RPG solo SaaS

---

## Current Agent Inventory

### TradeSphere Agents (23 total)
**AI/LLM (3):** ai-engineer, data-scientist, prompt-engineer
**Backend (3):** backend-architect, graphql-architect, tdd-orchestrator
**Database (3):** cloud-architect, database-architect, database-optimizer
**Frontend (4):** frontend-developer, mobile-developer, typescript-pro, ui-ux-designer
**Security (3):** architect-review, code-reviewer, security-auditor
**Testing (3):** debugger, error-detective, test-automator
**Payments (1):** payment-integration
**Communications (3):** discord-update, mock-consumer, mock-tech

### Custom Agents (3)
**Meta:** agent-selector, claude-code-expert, ui-humanizer

### TradeSphere Skills (20 total)
- langchain-architecture, llm-evaluation, ml-pipeline-workflow
- prompt-engineering-patterns, rag-implementation
- api-design-principles, architecture-patterns, microservices-patterns
- discord-webhooks, persona-simulation
- javascript-testing-patterns, modern-javascript-patterns, nodejs-backend-patterns, typescript-advanced-types
- billing-automation, paypal-integration, pci-compliance, stripe-integration
- doc-template-minimal, tradesphere-file-organization

---

## Life RPG Tech Stack Comparison

| Component | TradeSphere | Life RPG | Notes |
|-----------|------------|----------|-------|
| Frontend | React | React | ✓ Same |
| Backend | GraphQL + Netlify Functions | Express REST API | Different architecture |
| Database | Supabase + Multi-tenant RLS | Supabase (simplified) | No complex multi-tenancy |
| Auth | Supabase Auth | Supabase Auth | ✓ Same |
| AI | RAG + config-driven | Claude API conversations | Different use case |
| Payments | Stripe (multi-tenant) | Stripe (single subscription) | Simpler flow |
| Hosting | Netlify | Vercel + Railway/Render | Different platform |
| Team | Multi-agent team workflow | Solo developer | Major simplification |

---

## Agents to Adapt for Life RPG

### Core Development (6 agents)
1. **frontend-developer** → Adapt for Life RPG React components
   - Remove multi-tenant/company_id patterns
   - Focus on user-centric UI (onboarding, dashboard, check-ins)
   - Simplified state management

2. **backend-architect** → Simplify for REST API design
   - Remove GraphQL patterns
   - Remove multi-tenant complexity
   - Focus on Express routes, Supabase integration

3. **database-architect** → Simplify for single-user schema
   - Remove RLS complexity (still use RLS but simpler)
   - Focus on conversation, plans, check-ins tables
   - User-scoped queries only

4. **typescript-pro** → Keep for type safety (if using TS)
   - Remove config-driven type patterns
   - Focus on API types, Supabase types, Claude API types

5. **ui-ux-designer** → Adapt for Life RPG user experience
   - Remove admin/config interfaces
   - Focus on coaching conversation UX
   - Mobile-first daily check-in flows

6. **payment-integration** → Simplify for single subscription
   - One tier: free vs premium
   - Remove invoice generation
   - Simple webhook handling

### AI/Prompting (2 agents)
7. **prompt-engineer** → Critical for coaching conversation
   - Remove trade-specific prompts
   - Focus on life coaching methodology
   - 5-phase conversation design

8. **ai-engineer** → Adapt for Claude API integration
   - Remove RAG patterns (not needed for MVP)
   - Focus on conversation state management
   - Plan generation from structured data

### Quality & Testing (3 agents)
9. **test-automator** → Simplify for solo dev testing
   - Remove multi-tenant test isolation
   - Focus on user flow tests (signup → onboarding → check-in)
   - API endpoint tests

10. **debugger** → Keep as-is (general purpose)
    - Error resolution for frontend/backend
    - Supabase debugging
    - Stripe integration debugging

11. **code-reviewer** → Simplify for solo dev
    - General code quality checks
    - Security best practices
    - No company_id verification needed

### Meta (2 agents)
12. **agent-selector** → Keep for intelligent routing
13. **claude-code-expert** → Keep for setup optimization

---

## Skills to Adapt for Life RPG

### Critical Skills (8)
1. **nodejs-backend-patterns** ✓ Keep - Express API design
2. **typescript-advanced-types** ✓ Keep - Type safety
3. **stripe-integration** ✓ Keep - Payment processing
4. **prompt-engineering-patterns** ✓ Adapt - Life coaching prompts
5. **javascript-testing-patterns** ✓ Keep - Testing strategies
6. **modern-javascript-patterns** ✓ Keep - ES6+ patterns
7. **doc-template-minimal** ✓ Keep - Documentation standards
8. **life-rpg-file-organization** ⚠️ CREATE NEW - Project structure

### Skills to Exclude
- langchain-architecture (not needed)
- llm-evaluation (overkill for MVP)
- ml-pipeline-workflow (not needed)
- rag-implementation (not needed for MVP)
- api-design-principles (REST is simpler)
- architecture-patterns (too complex)
- microservices-patterns (not applicable)
- discord-webhooks (not needed)
- persona-simulation (not needed)
- billing-automation (too complex for one subscription)
- paypal-integration (Stripe only)
- pci-compliance (Stripe handles this)
- tradesphere-file-organization (replaced by life-rpg version)

---

## Recommended Plugin Structure

```
.claude/plugins/marketplaces/life-rpg-dev/
├── .claude-plugin/
│   └── manifest.json
└── plugins/
    ├── life-rpg-core/
    │   ├── agents/
    │   │   ├── frontend-developer.md
    │   │   ├── backend-architect.md
    │   │   ├── database-architect.md
    │   │   └── ui-ux-designer.md
    │   └── skills/
    │       ├── life-rpg-file-organization/
    │       │   └── SKILL.md
    │       └── doc-template-minimal/
    │           └── SKILL.md
    ├── life-rpg-ai/
    │   ├── agents/
    │   │   ├── prompt-engineer.md
    │   │   └── ai-engineer.md
    │   └── skills/
    │       └── coaching-conversation-patterns/
    │           └── SKILL.md
    ├── life-rpg-testing/
    │   └── agents/
    │       ├── test-automator.md
    │       ├── debugger.md
    │       └── code-reviewer.md
    └── life-rpg-payments/
        ├── agents/
        │   └── payment-integration.md
        └── skills/
            └── stripe-integration/
                └── SKILL.md
```

---

## Simplification Principles

### What to Remove
- ✗ Multi-tenant patterns (company_id everywhere)
- ✗ Complex RLS policies (user_id only)
- ✗ Configuration-driven architecture (hardcoded features for MVP)
- ✗ GraphQL schema design (using REST)
- ✗ Team coordination patterns (solo dev)
- ✗ Discord update agents (not needed)
- ✗ Mock persona agents (not needed)
- ✗ Heavy TDD orchestration (lightweight testing)

### What to Keep
- ✓ File organization patterns
- ✓ Documentation standards (minimal)
- ✓ Code review principles
- ✓ Testing patterns (simplified)
- ✓ Stripe integration patterns
- ✓ Supabase auth patterns
- ✓ Agent selection intelligence
- ✓ Prompt engineering expertise

### What to Adapt
- ⚙ Frontend patterns → Life RPG specific components
- ⚙ Backend patterns → Express REST instead of GraphQL
- ⚙ Database patterns → User-scoped only (no multi-tenant)
- ⚙ AI patterns → Coaching conversation focus
- ⚙ Payment patterns → Single subscription tier
- ⚙ Testing patterns → Solo dev workflow

---

## Next Steps

1. ✓ Create Life RPG plugin directory structure
2. ✓ Create project-level CLAUDE.md with adapted context
3. ✓ Create life-rpg-file-organization skill
4. ✓ Adapt 13 core agents with Life RPG context
5. ✓ Create coaching-conversation-patterns skill
6. ⚙ Update settings.json to enable life-rpg-dev plugins
7. ⚙ Disable/archive TradeSphere plugins during Life RPG work

---

## File Organization Standard (Preview)

```
life-rpg/
├── docs/                           # Documentation
│   ├── life-rpg-claude-code-spec.md
│   ├── life-rpg-roadmap.md
│   └── claude-setup-analysis.md   # This file
├── frontend/                       # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   ├── onboarding/
│   │   │   ├── dashboard/
│   │   │   ├── plan/
│   │   │   ├── checkin/
│   │   │   └── common/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
├── backend/                        # Node.js API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── profile.js
│   │   │   ├── conversation.js
│   │   │   ├── plan.js
│   │   │   └── stripe.js
│   │   ├── lib/
│   │   │   ├── supabase.js
│   │   │   ├── claude.js
│   │   │   └── stripe.js
│   │   └── server.js
│   └── package.json
├── database/                       # Supabase migrations
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_add_streak_tracking.sql
└── .claude/
    └── CLAUDE.md                   # Project-level config
```

---

**Summary:** From 23 TradeSphere agents + 20 skills → 13 Life RPG agents + 8 skills
**Focus:** Solo developer workflow, simpler architecture, AI coaching conversation expertise
**Timeline:** Set up plugin structure today, adapt agents incrementally as needed during sprints
