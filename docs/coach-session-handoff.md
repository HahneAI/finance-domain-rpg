# Coach / AI Feature — Session Handoff

**Purpose of this file:** orient a brand-new session on Coach/AI work only. Deliberately
scoped — this is not a full app handoff. If a task turns out to need context outside Coach/AI,
ask the user rather than guessing from the rest of the codebase.

**Read `docs/coach-entry-points.md` first, in full, before doing anything else.** It's the
living map of every place Coach shows up today (live or planned), written in plain English,
and is the actual index this handoff points into. Everything below is context to make that
document (and the rest of this session's likely work) make sense faster.

---

## Where things stand right now (as of 2026-07-24)

Two Coach surfaces are **live and open to the full user base**, trial included:

1. **Ask Coach — the general chat.** A full-screen chat opened from a "Coach" tab in the
   bottom nav. Answers questions about how the app works using the user's real numbers. No
   memory yet — closing it forgets the conversation.
2. **The Net Worth Check-In card.** A small card on the Home screen (both the normal Home and
   the separate Job Loss Mode Home) that proactively speaks up about savings trends — a gentle
   heads-up, a critical job-loss warning, or a recovery acknowledgment.

Every other Coach idea (statement insights, job hunt assistant, résumé help, application
assistant, job scout, guided tax setup, plus a pool of further-out brainstormed ideas) is
either not started or paperwork-only — none of it is built. All of it stays locked to
Anthony's admin account and manually-approved beta testers until it's individually built and
gated the same deliberate way sections 1–2 were.

### The gate, in plain English

There are two separate access-check functions, and they must **never be merged**:

- `canAccessAiFeatures()` — the narrow one. Admin or manually-flagged beta tester only. This is
  the default for anything not yet released.
- `canAccessAskCoachGeneral()` — the wider one, used **only** by the two live features above.
  Grants access to an admin/tester (same as before) **or** anyone with a real trial, grace, or
  active-paid subscription. Checked on the client at every place either feature could render,
  and re-checked independently on the server (`api/coach.js`) by reading the account's real
  subscription columns from the database — never by trusting anything the client claims about
  its own access.

**Locked decision, don't re-litigate:** trial users get the exact same version of these two
features a paying subscriber does — not a limited preview. Every other Coach surface, once
built, is planned as a reason to convert from trial to paid, not a trial perk.

### Cost & caching work done this session

- A multi-turn conversation's growing message history now gets a cache breakpoint on its
  newest turn, so a follow-up message re-uses the cached prefix instead of re-pricing the
  entire prior exchange from scratch every time.
- Token/cost logging in `api/coach.js` now runs in production too (it used to explicitly skip
  the one environment where real cost would show up) and prints one line per call with a
  computed dollar estimate, readable straight from Vercel's log viewer.
- Checked, but deliberately **not** changed: the combined system-prompt + per-user context
  sent on every Ask Coach call may be too small to actually trigger Haiku's minimum cacheable
  prefix. Left unpadded on purpose — the prompt is expected to keep growing as more features
  ship, which may clear that floor on its own. Filed as a watch item, not a bug
  (`docs/BUG_FIX_TODO.md` DW-W4).
- The Net Worth card's "have I already said this tier this week" tracking moved off
  browser-local storage onto the account's own saved config — it used to reset if someone
  switched devices or reinstalled the app.

### Production API key

The codebase already has the logic ready — it just needs the real key to exist:

- Production key env var name: **`ANTHROPIC_API_KEY`**, set in Vercel's **Production**
  environment.
- Preview/test key env var name: **`ANTHROPIC_API_KEY_TEST`** (falls back to
  `ANTHROPIC_API_KEY` if unset).
- Creating, funding, and setting a spend limit on the real key is outside what a coding session
  can do — it's a console/account task for the user. Worth confirming it's done (and a spend
  cap is set) before assuming real users are actually being served.

---

## The three reference documents (plain English)

### 1. `docs/coach-entry-points.md` — the map (read this first)

A section-by-section inventory of every place Coach appears or might appear, in plain
language. Each section states: what it is, whether it's actually live or just an idea, whether
it's included in the free trial, and a pointer to exactly where to pick up building it next.
This is the working index for all Coach work — when in doubt about what's live vs. planned,
this file is the source of truth over memory or assumption.

### 2. `docs/coach-personality-rubric.md` — how Coach is supposed to sound

A scoring system for Coach's voice, so every feature speaks with one consistent personality
instead of each one inventing its own. Think of it as a handful of sliders — how much
boxing/corner-man language he uses, how blunt vs. gentle he is, and so on — each scored 1
through 5, with a target score written down per situation (a casual chat answer vs. a critical
job-loss warning vs. a calm recovery message). **Only the first slider is actually filled in
today** (how much metaphor/boxing language to use); everything else is a blank skeleton
waiting to be scored one situation at a time. Any new Coach copy should be checked against
this file, not invented fresh.

### 3. `docs/drift-app-warden.md` §21 — "Spine D: AI Layer & Context Grounding" (the guardrail)

This whole document is a running ledger that answers one question for the entire app: "I'm
about to change X — what else might silently break because of it?" It exists because this
app's biggest risk isn't code that's wrong in isolation, it's a change that's locally correct
but quietly invalidates something distant that depended on the old behavior. The one section
that matters most for Coach work is its AI-layer rule, and it's simple: **every number or fact
Coach is handed about a user must come from the exact same function the real screen uses to
show that number — never a separate, hand-rolled approximation.** Every time that rule was
broken in the past, Coach ended up telling a user a number that didn't match what their own
screen said, or a stale one. Read this section before wiring any new data into Coach's context
— it documents the real past incidents as precedent.

### 4. `docs/TODO.md` §18 and §21 — the written plans

- **§18** is the real, numbered build-out plan for Coach — subsections A through J cover
  Coach's identity, the general chat, the Net Worth trigger, statement insights, the job hunt
  assistant, résumé help, the shared plumbing all of it runs through, chat/search history
  persistence, job scout, and guided tax setup. Anything with a letter and a number (like
  §18.H3) is real, scoped, written-down work — just not necessarily started.
- **§21** ("Fable Five Creative Brainstorming") is a separate, much looser idea pool — some of
  it Coach-related (§21.C "Coach Expansions," §21.F "Horizon Tier — Fable-Class Features").
  Nothing in §21 is committed work; it's explicitly labeled brainstorming, not a plan.

---

## What's next

The next task on deck, in order, per the standing plan:

1. **Multi-turn chat + memory.** Right now Ask Coach forgets everything the moment it's
   closed. Give it real back-and-forth conversation continuity, plus save a person's **last
   three conversations** so they can reopen and re-read one instead of starting from zero.
2. **Chat-history UI**, modeled on the Claude mobile app's conversation list.
3. Backend groundwork for both of the above **already exists** — a `coach_chats` table
   (migration 023) and load/save/delete functions in `db.js` — but nothing calls them yet. This
   is a wiring-and-UI task, not a from-scratch build.

Full reference: `docs/TODO.md` §18.H, subsections H3 (chat history UI) and H4 (summary
generation).

---

## Where the actual code lives (for when you need it, not to read cold)

- `src/lib/entitlements.js` — `canAccessAiFeatures`, `canAccessAskCoachGeneral`
- `src/lib/subscription.js` — `getEntitlement()`, the trial/grace/active/expired/none state
  machine
- `api/coach.js` — the one shared serverless route both live Coach features call
- `src/lib/coachPrompts.js` — `COACH_PERSONA_PROMPT`, `ASK_COACH_SYSTEM_PROMPT`,
  `buildNetWorthSystemPrompt`
- `src/lib/coachFeatureGuide.js` — the FAQ knowledge Coach has about the app's 5 main panels
- `src/lib/aiContext.js` — `buildCoachContext()`, the per-user data snapshot handed to Coach
- `src/components/AskCoachPanel.jsx` — the chat UI
- `src/components/CoachNetWorthCard.jsx` — the Net Worth trigger card
- `src/lib/coachTriggers.js` — tier resolution + rate-limit logic for the trigger card
- `src/lib/jobLossRunway.js` — the one authoritative runway/burn calculation Coach's Job Loss
  context must always read through (see the drift-warden rule above)
- `db.js` — `loadCoachChats`/`saveCoachChat`/`deleteCoachChat` (built, not yet wired to any UI)

## One unrelated heads-up

`src/test/components/LoginScreen.test.jsx` has one test that's flaky **only** when the full
suite runs (passes fine in isolation) — confirmed pre-existing and unrelated to any Coach work.
If a full `npm run test:run` shows exactly that one failure, it's not something this session
broke; don't spend time chasing it unless the user asks.
