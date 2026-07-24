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

**The one rule that applies to everything below:** every single Coach feature — live or
planned — is currently locked to Anthony's admin account and a short manual list of approved
beta testers. Nobody else in the app can see or trigger any of it yet. The current plan is to
open up **the first two sections below together** — the Ask Coach chat *and* the Net Worth
Check-In card — to the full user base, while keeping every other section locked exactly where
it is. That means the single lock those two features currently share has to be split apart
from the rest first, so opening those two doesn't accidentally open anything else riding on
the same switch.

**This document doubles as that splitting checklist.** Each section below is meant to become
its own separately-switchable piece — before any section changes who can see it, this is the
place to check what else might be quietly sharing its lock.

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

**Status:** 🟢 **Live and working**, for the locked-down group only. Right now every
conversation is temporary — closing the chat forgets it. There's also no memory of a
conversation the user had earlier; each open is a fresh start.

**Free trial access: ✅ Yes.** Included from day one of the free trial — a trial user gets
the exact same chat a paying subscriber does, not a limited preview of it.

**This is one of the two features slated to open to everyone next** (see the Net Worth
Check-In card below for the other), once the two items below are done.

**Next up:** Give it a memory. Right now the chat only ever holds one exchange in view —
nothing is saved. The next build phase adds: multi-turn conversations that stay on-topic
across several back-and-forth messages, and saving a person's last three conversations so they
can reopen and re-read one instead of starting over — with a chat-history screen modeled on
the Claude mobile app.
*Reference: `docs/TODO.md` §18.H (Chat & Search History Persistence), subsections H3–H4.*

**Technical reference:** API route `POST /api/coach` · Model: **Haiku** (`claude-haiku-4-5`,
hardcoded — the Haiku/Sonnet split described in the plan isn't actually wired up yet) · System
prompt: `ASK_COACH_SYSTEM_PROMPT` in `src/lib/coachPrompts.js` (shared Coach voice + Ask-Coach
answering rules + the app feature guide from `src/lib/coachFeatureGuide.js`, all frozen
together into one prompt). Planned gate for the flip: `entitlement.isEntitled` (true for
`"trial"`, `"grace"`, and `"active"` — see `src/lib/subscription.js`) in place of
`canAccessAiFeatures({isAdmin, isTester})`, at every mount point (bottom nav, panel render,
and the server-side check in `api/coach.js`) — trial is included on purpose, not excluded.

---

## 2. The Net Worth Check-In card

**What it is:** A small card that appears on its own, directly on the Home screen, without the
user asking for anything. It watches a person's savings trend and speaks up on its own in three
situations: a gentle heads-up when savings look thin, a direct and calm warning when things are
genuinely critical (namely, a job loss with under a month of runway left), and a quiet
acknowledgment when things turn around after a rough stretch. It only ever says something once
per week per situation, so it can't nag.

**Status:** 🟢 **Live and working**, for the locked-down group only. This card shows up on
the regular Home screen and, as of this week, also on the separate Job Loss Mode Home screen —
previously it could only ever say the calm "things turned around" message or the gentle
heads-up there, never the critical one, because it simply wasn't present on that screen at all.

**Free trial access: ✅ Yes.** Included from day one of the free trial, same as the chat
above — the critical-warning tier especially is exactly the moment someone still deciding
whether to subscribe needs to hear from Coach, not a reason to make them pay first.

**This is the other of the two features slated to open to everyone next**, at the same time as
the Ask Coach chat above — the critical-warning message in particular (job loss + under a
month of runway) is exactly the moment a base user, not just an admin or tester, most needs to
hear from Coach.

**Next up:** The wording behind the gentle heads-up and the calm recovery message hasn't been
scored against the personality rubric yet — only the critical warning has been tuned in detail.
Separately, an older static tip box that still shows on Home in its own voice (not Coach's) is
due for a rewrite so it sounds like Coach instead of a leftover placeholder.
*Reference: `docs/TODO.md` §18.C (its copy-audit note) and `docs/coach-personality-rubric.md`
(axes 2 and onward, still blank).*

**Technical reference:** API route `POST /api/coach` (same route as the chat above) · Model:
**Haiku** (`claude-haiku-4-5`) · System prompt: `buildNetWorthSystemPrompt(tier)` in
`src/lib/coachPrompts.js` — picks one of three short tier-specific prompts (gentle / critical /
recovery), each built on the same shared Coach voice as the chat above. Planned gate for the
flip: same as the chat above — `entitlement.isEntitled`, checked at both mount points
(`HomePanel.jsx` and `JobLossHomePanel.jsx`) in place of `canAccessAiFeatures`.

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
*Reference: `docs/TODO.md` §18.A (Coach — Character Identity).*

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
*Reference: `docs/TODO.md` §18.D (Statements AI Insights) and §18.0's free-vs-paid note.*

**Technical reference:** None yet — no route, model, or prompt exists in code.

---

## 5. Planned, not started — Job Hunt Assistant

**What it is:** A Coach-guided chat for someone actively job hunting — coaching through the
search itself, not just the household numbers.

**Status:** ⚪ **Not started.**

**Free trial access: ❌ No (planned).** Paid-conversion upsell, same as section 4 above —
not a trial-included feature once built.

**Next up:** *Reference: `docs/TODO.md` §18.E (Job Hunt AI Assistant).*

**Technical reference:** None yet.

---

## 6. Planned, not started — résumé help

**What it is:** Letting someone upload a résumé so Coach can point out gaps or suggest
improvements.

**Status:** ⚪ **Not started.** This one has been scoped out on paper in more detail than the
others, but literally nothing has been built.

**Free trial access: ❌ No (planned).** Paid-conversion upsell — not trial-included once built.

**Next up:** *Reference: `docs/TODO.md` §18.E1 (Résumé upload / skill-gap analysis).*

**Technical reference:** None yet.

---

## 7. Planned, not started — Application Assistant

**What it is:** Coach helping someone through the mechanics of actually applying to a job —
cover letters, prep, tracking where they've applied.

**Status:** ⚪ **Not started.** This one is also waiting on a separate, unrelated piece of the
app (job board integrations) before it can even begin.

**Free trial access: ❌ No (planned).** Paid-conversion upsell — not trial-included once built.

**Next up:** *Reference: `docs/TODO.md` §18.F (Application Assistant).*

**Technical reference:** None yet.

---

## 8. Planned, not started — Job Scout

**What it is:** A location-based search where Coach helps someone find employers hiring nearby.

**Status:** ⚪ **Not started.**

**Free trial access: ❌ No (planned).** Paid-conversion upsell — not trial-included once built.

**Next up:** *Reference: `docs/TODO.md` §18.I (Job Scout — Location-Based Employer Search).*

**Technical reference:** None yet.

---

## 9. Planned, not started — guided tax setup

**What it is:** Coach walking a new user through tax setup conversationally, reading a photo of
a paystub instead of asking them to type every number in by hand.

**Status:** ⚪ **Not started.** This one is also waiting on a full accountant review of the
app's tax math before it can be built, regardless of the AI piece.

**Free trial access: ❌ No (planned).** Paid-conversion upsell — not trial-included once built.

**Next up:** *Reference: `docs/TODO.md` §18.J (Tax Onboarding Interview).*

**Technical reference:** None yet.

---

## 10. Brainstormed ideas — not scoped, not started, no promised timeline

Everything in this section is further out than sections 4–9 above — those are at least
written up as a numbered plan; these are still loose ideas from an open brainstorming pass.
None of it should be read as "coming soon." It's listed here so the full picture of where
Coach could go is in one place, not scattered across a brainstorm document nobody re-reads.

**Coach showing up in more everyday moments** *(`docs/TODO.md` §21.C):*
- A Monday morning heads-up on the week ahead, sent as a phone notification
- A "what if" conversation mode — asking Coach to run a hypothetical without changing anything real
- Coach helping someone prep talking points for a raise conversation, from their own real work history
- An end-of-year recap story, shareable like a "wrapped" summary
- Long-press any number in the app to have Coach explain, in plain English, exactly how it was calculated

**Bigger, further-out ideas** *(`docs/TODO.md` §21.F, "Horizon Tier — Fable-Class Features"
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
*Reference: `docs/TODO.md` §18.G (Shared Infrastructure); `docs/active-systems.md` §24 (AI
Layer — Coach).*
