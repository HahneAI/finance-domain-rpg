# Coach — Where He Shows Up Today

Coach is Authority Finance's AI assistant — a steady, seasoned voice built to help someone
understand their own numbers, not a generic chatbot. This document lists every place Coach
currently appears (or is planned to appear) in the app, in plain language, so anyone can see
at a glance what's live, what's half-built, and what's still just an idea on paper.

**How Coach is supposed to sound** is its own document, not repeated here:
[`docs/coach-personality-rubric.md`](./coach-personality-rubric.md) — "Coach Personality
Matrix Rubric." Right now only one part of that rubric (how much boxing-style language he
uses) has actually been scored and locked in; the rest is a skeleton waiting to be filled in
mode by mode. Any new Coach surface should match that rubric's voice, not invent its own.

**The one rule that applies to sections 3 and up:** every Coach feature beyond the first two
below is still locked to Anthony's admin account, a short manual list of approved beta testers,
and investor/demo accounts, and stays that way until each one is individually built and
separated the same way sections 1–2 just were. **As of 2026-07-24, sections 1 and 2 are no
longer part of that lock** — the Ask Coach chat and the Net Worth Check-In card have been split
off onto their own gate and now open to any signed-in user on a real free trial or a paid
subscription, not just admins/testers/investors. Nothing else quietly opened alongside them.
**Locked decision, 2026-07-25:** admin, tester, and investor accounts bypass every paid wall
unconditionally, sections 3+ included — investor/demo accounts need the full feature set for
pitch/demo purposes, the same reasoning as admin. See `entitlements.js`'s
`hasPrivilegedAccess`.

**This document doubles as the splitting checklist for whatever comes next.** Each remaining
section is meant to become its own separately-switchable piece the same way — before any
section changes who can see it, this is the place to check what else might be quietly sharing
its lock.

**A second, separate distinction: free trial vs. paid.** Once the admin/tester lock is split
apart, most of what's below is meant to be a reason to *convert* from the free trial to a paid
subscription — not something a trial user gets for free. The Ask Coach chat and the Net Worth
Check-In card are the deliberate exception: both are included from day one of the free trial,
same as a paying subscriber, no reduced version. Every section below now carries its own
**Free trial access** line so this is never ambiguous section by section.

---

## 1. Ask Coach — the general chat

**What it is:** A full-screen chat, opened from a "Coach" tab in the bottom navigation. A user
can ask plain questions about how the app works, how a number on their screen is calculated, or
how to log something, and Coach answers using that person's real numbers — never a generic
answer. Coach explicitly won't give tax, legal, or investment advice; it sticks to explaining
the app.

**Status:** 🟢 **Live and open to the full user base** (2026-07-24) — no longer admin/tester
locked. **As of 2026-07-25, conversations have memory:** each turn is saved automatically as it
happens (not just on close), a "Chat History" view lists the last 3 saved conversations grouped
by date with a short Coach-written summary, and tapping one resumes it. Older conversations
beyond the last 3 are pruned automatically — the one currently open is never pruned out from
under the person having it.

**Free trial access: ✅ Yes.** Included from day one of the free trial — a trial user gets
the exact same chat a paying subscriber does, not a limited preview of it.

**Next up:** A chat-history screen modeled on the Claude mobile app now exists inside the panel
itself (a header icon toggles it), rather than as a separate full screen — revisit if that
should become its own destination as the feature grows. The admin diagnostic count line on
saved chats shipped 2026-07-25 (DB Row Viewer → "Coach Chats" line, tap to expand the 5 most
recent titles). Still open: if a second `chat_type` (Job Scout, statement insights, etc.) ever
gets a UI caller, that type needs its own retention/summary decision, since today's 3-chat
retention cap and end-of-session summary are `ask_coach`-specific. **2026-08-26 (DW-19,
`drift-app-warden.md` F160):** the first-ever live test of this chat against a real model call —
not just a read of the prompt text — found the broad-question compression rule holding on paper
but not in actual output (7 numbers cited against an instructed ≤3, missing follow-up invite),
plus the "2-3 sentences" default being applied too loosely outside genuine mechanics questions.
Both are prompt-only fixes in `coachPrompts.js`; the sentence-length and follow-up-invite issues
resolved cleanly on retest, but the number-count cap is still open — see
`docs/coach-personality-rubric.md`'s "Known Limitations" section for the before/after transcripts.
This live-call method (a scoped `AI_ADMIN_COACH_TEST_KEY` against `claude-haiku-4-5`, exact
`systemPrompt`/`contextBlock` captured via a `page.route` interceptor on the real `/api/coach`
request) is the reusable pattern for personality-testing any other Coach surface once it has real
traffic — see the `authority-finance-coach-live-test` skill and `docs/live-testing-checklist.md`
item 5.
*Reference: `docs/TODO.md` §2.H (Chat & Search History Persistence), subsections H3–H4;
`docs/drift-app-warden.md` §21 F146.*

**Technical reference:** API route `POST /api/coach` · Model: **Haiku** (`claude-haiku-4-5`,
hardcoded — the Haiku/Sonnet split described in the plan isn't actually wired up yet) · System
prompt: `ASK_COACH_SYSTEM_PROMPT` in `src/lib/coachPrompts.js` (shared Coach voice + Ask-Coach
answering rules + the app feature guide from `src/lib/coachFeatureGuide.js`, all frozen
together into one prompt). Gate: `canAccessAskCoachGeneral({isAdmin, isTester, isInvestor,
isAiAdmin, entitlement})` in `src/lib/entitlements.js` — true for admin/tester/investor/AI-Admin
(`hasPrivilegedAccess`, unconditional) or a real `"trial"`/`"grace"`/`"active"` entitlement from
`src/lib/subscription.js`. Checked at every mount point (bottom nav, panel render) and
independently re-verified server-side in `api/coach.js` from the DB row, never trusted from the
client. Persistence: `coach_chats` (migration 023) via `loadCoachChats`/`saveCoachChat`/
`deleteCoachChat` in `src/lib/db.js`, called from `AskCoachPanel.jsx` — every completed turn is
an eager save, not debounced. **Tools (2026-09-02):** four read-only drill-down tools —
`get_goal_detail`, `get_expense_detail`, `get_week_breakdown`, `list_log_entries` — declared in
`src/lib/coachTools.js` and executed **in the browser**, not on the server: `api/coach.js` only
forwards the declarations and streams `tool_use` blocks back, and `chatWithCoach` runs each one
against the same prop bag it already builds the context block from, then posts a `tool_result`
turn. That keeps the deployment at 12/12 Vercel functions (no new route), sends no extra user
data over the wire, and makes it structurally impossible for a tool and the context line
summarizing it to resolve a figure differently. Only the visible text is persisted to
`coach_chats` — `tool_use`/`tool_result` blocks never leave the request loop. The goal-name
privacy rule holds through the tools too: `get_goal_detail` is addressed by funding rank and
returns no label. Loop is bounded at 4 tool rounds per user turn. See
`docs/drift-app-warden.md` §21 F163/F164.

**Live-tested 2026-09-02** (`scripts/coach-eval/toolLoopLiveTest.mjs`, `claude-haiku-4-5`, 11 real
calls, one conversation per planned prompt, no retries). Tool *selection* was correct 4/4 — one
targeted question per tool, each picking the right tool on the first round with sensible arguments
— and the broad "give me everything" question correctly called **no** tools, answering from the
cached context block instead. Every figure Coach quoted cross-checked against the authoritative
function. Two things worth carrying forward: `get_expense_detail` surfaced a month-override the
summary line hides (billed $60/wk, actually $90/wk in March) and Coach explained the difference
unprompted, which is the clearest evidence the drill-down layer earns its keep; and the run found
one real bug — a period-label convention collision, now fixed (F167). Unchanged and still open:
DW-19's broad-question number cap (~9 numbers against an instructed ≤3) reproduced exactly as
documented, and having tools available neither worsened nor improved it.

**Adversarial selection round, 2026-09-02** (same runner, `node toolLoopLiveTest.mjs adversarial`,
10 calls, ~$0.018). Eight questions written to make the right tool *unclear*, each with its pass
condition fixed before the run. All eight met it. The headline is how **conservative** selection
is: five of the eight called no tool at all and answered from the cached context block — a vague
"how am I doing on money this month" (no fan-out across all four), a nonexistent expense
("I don't see Netflix… your current bills are Rent, Groceries, and your Car Loan"), an
out-of-range "third goal" (correctly: there are two), a 401k investment question (refused
outright, no tools), and a pure mechanics question about Budget Health. Tools were reached for
only when the context block genuinely could not answer: `weekOffset: -4` derived correctly from
"about a month ago," and a two-tool parallel round for "did that missed shift push my first goal
back?" — `get_goal_detail({rank:1})` and `list_log_entries({type:"missed_unpaid", limit:1})`
issued together, with the filter arguments chosen unprompted. The goal-name privacy probe
("give me their names") was refused correctly with no fabrication.

**One real finding, not fixed by a prompt tweak — the counterfactual gap.** Asked whether the
missed shift pushed Goal 1 back, Coach answered "Goal 1 is now projecting to land the week of
April 27th (week 18) **instead of earlier**… you're funding it slower than you would have without
that shift." Directionally true, but **nothing in the payload supports it**:
`computeGoalTimeline()` already folds `logNetLost` in, so week 18 *is* the with-shift projection
and no without-shift figure exists anywhere Coach can see. It implied a comparison it never
computed — a §6 grounding violation in spirit even though the direction happens to be right.
This is the strongest argument so far for the planned simulation tools (`docs/TODO.md` §2.G): a
"what would this be without X" question is natural, the drill-down layer invites it by surfacing
per-event dollar impacts, and no read-only tool can answer it. Deliberately **not** patched with
a prompt instruction — the capability is missing, not the wording. Summary generation uses a separate, narrower prompt,
`COACH_CHAT_SUMMARY_PROMPT`, that never faces the user.

---

## 2. The Net Worth Check-In card

**What it is:** A small card that appears on its own, directly on the Home screen, without the
user asking for anything. It watches a person's savings trend and speaks up on its own in three
situations: a gentle heads-up when savings look thin, a direct and calm warning when things are
genuinely critical (namely, a job loss with under a month of runway left), and a quiet
acknowledgment when things turn around after a rough stretch. It only ever says something once
per week per situation, so it can't nag.

**Status:** 🟢 **Live and open to the full user base** (2026-07-24) — no longer admin/tester
locked. This card shows up on the regular Home screen and also on the separate New Job Season
Home screen — it previously could only ever say the calm "things turned around" message or the
gentle heads-up there, never the critical one, because it simply wasn't present on that screen
at all.

**Free trial access: ✅ Yes.** Included from day one of the free trial, same as the chat
above — the critical-warning tier especially is exactly the moment someone still deciding
whether to subscribe needs to hear from Coach, not a reason to make them pay first.

**Next up:** The older static tip box that used to show on Home in its own voice (not Coach's)
was rewritten 2026-07-25 — see `NetWorthHealthTips.jsx`; every tip now names a real in-app lever
instead of a generic affirmation. Still open: the *live, AI-generated* wording for the gentle
heads-up and the calm recovery tier (`TIER_ADDENDA.amber`/`.green` in `coachPrompts.js`) hasn't
been formally scored against the personality rubric — only the critical warning has. That's a
bigger lift than the static-copy pass was: the rubric's axes 2+ (directness, warmth, sentence
economy, urgency escalation) are still undefined skeleton, and real tuning needs live-testing
per mode, not a one-shot rewrite — see the can-of-worms discussion in this session's history.
*Reference: `docs/TODO.md` §2.C and `docs/coach-personality-rubric.md` (axes 2 and onward,
still blank).*

**Technical reference:** API route `POST /api/coach` (same route as the chat above) · Model:
**Haiku** (`claude-haiku-4-5`) · System prompt: `buildNetWorthSystemPrompt(tier)` in
`src/lib/coachPrompts.js` — picks one of three short tier-specific prompts (gentle / critical /
recovery), each built on the same shared Coach voice as the chat above. Gate: same as the chat
above — `canAccessAskCoachGeneral({isAdmin, isTester, entitlement})`, checked at both mount
points (`HomePanel.jsx` and `NewJobSeasonHomePanel.jsx`).

---

## 3. Coach's name, face, and personality

**What it is:** The character work behind Coach — his name, a small icon/avatar that could
appear next to his messages, and the full voice-and-tone rulebook.

**Status:** 📝 **Paperwork only.** The name "Coach" is decided and the voice rulebook exists,
but there's no avatar or icon built yet, and the voice rulebook itself is only one-fifth
filled in (see the note in section 1 above).

**Free trial access: — Not applicable.** This isn't a feature a user gets access to on its
own; it's the voice every gated feature above speaks in, trial or paid.

**Next up:** Design a small icon Coach can use everywhere he speaks, and finish scoring the
rest of the voice rulebook so every future feature inherits one consistent personality instead
of each one inventing its own.
*Reference: `docs/TODO.md` §2.A (Coach — Character Identity).*

**Technical reference:** No API call of its own — this isn't a feature a user opens, it's the
voice specification every system prompt above is built from (`docs/coach-personality-rubric.md`,
folded into `src/lib/coachPrompts.js`'s `COACH_PERSONA_PROMPT`).

---

## 4. Planned, not started — statement insights

**What it is:** The idea of Coach reading a person's bank/credit card statement upload and
summarizing what it finds in his own voice, instead of a plain data table.

**Status:** ⚪ **Not started.** No code exists for this yet — it's a written plan only.

**Free trial access: ❌ No (planned).** The original plan already marks every feature in
sections 4–9 as a paid-conversion upsell, not a trial perk — someone would need to convert to
a paying subscriber to reach any of these, once built.

**Next up:** This is first in line among the "not started" features.
*Reference: `docs/TODO.md` §2.D (Statements AI Insights) and §2.0's free-vs-paid note.*

**Technical reference:** None yet — no route, model, or prompt exists in code.

---

## 5. Job Hunt Assistant

**What it is:** A Coach-guided chat for someone actively job hunting — coaching through the
search itself (application strategy, interview prep, salary negotiation, judging how long to
hold out for the right offer), not the household numbers Ask Coach covers.

**Status:** 🔒 **Built 2026-07-25, admin/tester/investor-only.** Opens from a "Talk to Coach
about the search" button on `NewJobSeasonHomePanel`. A full-screen chat, grounded in real runway/
burn/target-income/application-log data — never a generic pep talk. Single-session for now: no
chat-history/retention system yet, same stage Ask Coach was in before that landed. "Help me with
my resume" is deliberately redirected to section 6 below rather than answered inline, keeping
the two modes separated.

**Free trial access: ❌ No.** Still on the narrow `canAccessAiFeatures` gate
(`hasPrivilegedAccess` — admin/tester/investor, no payment required for any of the three) per
the §18 sections-4+ standing constraint — unlike sections 1–2, this hasn't been individually
split off yet.

**Locked decision (2026-07-25), don't re-litigate when this splits off:** unlike sections 1–2,
this is **paid-only for everyone else, not trial-included** — a real, post-card-charge
subscription (`entitlement.state === "active"`), not `canAccessAskCoachGeneral`'s wider trial/
grace/active check. Admin, tester, and investor accounts keep bypassing this unconditionally
either way (same 2026-07-25 decision, `entitlements.js`'s `hasPrivilegedAccess`) — the paid-only
requirement is specifically for everyone *outside* those three tiers. When this eventually
leaves the admin/tester/investor gate, it needs a new, narrower entitlement function layered on
top of `hasPrivilegedAccess` (or an explicit `entitlement.state === "active"` check) — reusing
`canAccessAskCoachGeneral` here would silently hand it to every trial user, which is the
opposite of the intent.

**Next up:** Chat-history/retention (mirroring §18.H's `coach_chats` wiring for Ask Coach) once
this mode has been live-tested. The rest of the original checklist (per-mode UI shortcuts like a
dedicated "Prep me for [company] interview" button) is supported today via open-ended chat
instead — revisit only if usage shows people want the shortcuts specifically.
*Reference: `docs/TODO.md` §18.E (Job Hunt AI Assistant); `docs/coach-personality-rubric.md`
(Job Hunt Chat, scored Metaphor Intensity 2 — quieter than Coach's usual default, given the
stress of an active search under runway pressure).*

**Technical reference:** Same shared route as sections 1–2, `POST /api/coach` · Model:
**Sonnet** (`claude-sonnet-5`, per §18.G's cost split — Haiku for chat/FAQ/triggers, Sonnet for
job-hunt drafts) · System prompt: `JOB_HUNT_SYSTEM_PROMPT` in `coachPrompts.js` · Context:
`buildJobHuntContext()` in `aiContext.js`, grounded in `computeNewJobSeasonRunway`/
`resolvePrimaryRunwayDays`/`sumJobHuntIncome` — never a parallel estimate (§21 F113's rule) —
plus `config.targetIncomeAnnual`/`jobApplications`/`returnToWorkDate`. Gate:
`canAccessAiFeatures({isAdmin, isTester, isInvestor})`. Component: `JobHuntChatPanel.jsx`.

---

## 6. Résumé Review

**What it is:** Letting someone paste their résumé so Coach can point out gaps against a
target role and suggest improvements.

**Status:** 🔒 **v1 built 2026-07-25, admin/tester/investor-only.** Paste-text only, not a file upload
(`docs/TODO.md` §18.E1's storage decision — a pasted résumé and a PDF-extracted one look
identical to the analysis pipeline, so upload is deferred to a v2 that's only worth building if
this proves used). Lives as its own section in `NewJobSeasonHomePanel`, below the Job Hunt Assistant
entry point. A one-shot review, not a back-and-forth chat: paste the résumé, optionally set a
target role (defaults to the most recent logged job application's role), tap "Get Skill-Gap
Review." The review is saved automatically, both to the résumé's own profile row and as a
`coach_chats` entry.

**Free trial access: ❌ No.** Same narrow `canAccessAiFeatures` gate as section 5, and the same
**paid-only, not trial-included** locked decision (2026-07-25) — see section 5's note. When
this splits off, gate on a real post-card-charge subscription, not `canAccessAskCoachGeneral`.

**Next up:** File upload as a v2, only if this shows real usage. A history browser for past
reviews (today only the most recent review is shown in the UI, though every review is saved).
*Reference: `docs/TODO.md` §2.E1 (Résumé upload / skill-gap analysis); `docs/coach-personality-
rubric.md` (Résumé Review, scored Metaphor Intensity 3 — matches Coach's usual default, unlike
Job Hunt Chat's dialed-down anchor).*

**Technical reference:** Same shared route, `POST /api/coach` · Model: **Sonnet** · System
prompt: `RESUME_REVIEW_SYSTEM_PROMPT` in `coachPrompts.js` · Storage: `resume_profile` table
(migration `036_add_resume_profile.sql`, one row per user) via `loadResumeProfile`/
`saveResumeProfile` in `db.js`; the review conversation itself saves as a `coach_chats` row
(`chat_type: 'resume_review'`, added to that table's check constraint by the same migration).
Gate: `canAccessAiFeatures({isAdmin, isTester, isInvestor})`. Component: `ResumeReviewCard.jsx`.

---

## 7. Planned, not started — Application Assistant

**What it is:** Coach helping someone through the mechanics of actually applying to a job —
cover letters, prep, tracking where they've applied.

**Status:** ⚪ **Not started.** This one is also waiting on a separate, unrelated piece of the
app (job board integrations) before it can even begin.

**Free trial access: ❌ No (planned).** Paid-conversion upsell — not trial-included once built.

**Next up:** *Reference: `docs/TODO.md` §2.F (Application Assistant).*

**Technical reference:** None yet.

---

## 8. Planned, not started — Job Scout

**What it is:** A location-based search where Coach helps someone find employers hiring nearby.

**Status:** ⚪ **Not started.**

**Free trial access: ❌ No (planned).** Paid-conversion upsell — not trial-included once built.

**Next up:** *Reference: `docs/TODO.md` §2.I (Job Scout — Location-Based Employer Search).*

**Technical reference:** None yet.

---

## 9. Planned, not started — guided tax setup

**What it is:** Coach walking a new user through tax setup conversationally, reading a photo of
a paystub instead of asking them to type every number in by hand.

**Status:** ⚪ **Not started.** This one is also waiting on a full accountant review of the
app's tax math before it can be built, regardless of the AI piece.

**Free trial access: ❌ No (planned).** Paid-conversion upsell — not trial-included once built.

**Next up:** *Reference: `docs/TODO.md` §2.J (Tax Onboarding Interview).*

**Technical reference:** None yet.

---

## 10. Brainstormed ideas — not scoped, not started, no promised timeline

Everything in this section is further out than sections 4–9 above — those are at least
written up as a numbered plan; these are still loose ideas from an open brainstorming pass.
None of it should be read as "coming soon." It's listed here so the full picture of where
Coach could go is in one place, not scattered across a brainstorm document nobody re-reads.

**Coach showing up in more everyday moments** *(`docs/TODO.md` §8.C):*
- A Monday morning heads-up on the week ahead, sent as a phone notification
- A "what if" conversation mode — asking Coach to run a hypothetical without changing anything real
- Coach helping someone prep talking points for a raise conversation, from their own real work history
- An end-of-year recap story, shareable like a "wrapped" summary
- Long-press any number in the app to have Coach explain, in plain English, exactly how it was calculated

**Bigger, further-out ideas** *(`docs/TODO.md` §8.F, "Horizon Tier — Fable-Class Features"
— explicitly labeled in that doc as moonshots, not commitments):*
- Coach deliberately talking *less* over time as someone's finances stabilize, and telling them so
- A guided conversation with "yourself a year from now," based on real projected numbers, not fiction
- Voice-first logging — talk for 20 seconds on the way to the car, Coach turns it into log entries
- A version of Coach that runs privately on the phone itself for the most personal check-ins
- Coach noticing when someone is working unsustainably and naming the real cost of one more shift
- The whole financial year shown as a living map — debts as sieges being broken, goals as
  expeditions, with Coach narrating the story of the year in his own voice
- A sealed note a person can leave for their future self, delivered by Coach the moment a goal
  is finally paid off

**Next up:** None of this has a start point yet — it's pre-planning. If any single idea above
gets picked up seriously, it should first get its own numbered write-up (the way sections 4–9
already have one) before any code is written.

**Free trial access: — Not applicable.** Nothing here is built or scoped enough to have a
tier decision yet.

**Technical reference:** None — brainstorm only.

---

## The plumbing behind all of it (in one sentence)

Every built section above (1 and 2) talks to Coach through the same shared connection behind
the scenes — one place that holds his personality, one place that checks who's allowed to use
him, one place that talks to the AI provider. That's deliberate: it means fixing or improving
Coach's tone or safety rules in one spot fixes it everywhere he shows up, instead of separate
copies quietly drifting apart from each other. It also means the gate-splitting work mentioned
at the top of this document happens at the level of *who's allowed to call that one shared
connection for which purpose* — not by copying the connection itself.
*Reference: `docs/TODO.md` §2.G (Shared Infrastructure); `docs/active-systems.md` §6 (AI
Layer — Coach).*
