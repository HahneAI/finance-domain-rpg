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
open up **only the first section below (the Ask Coach chat)** to everyone, while keeping every
other section locked exactly where it is — so building any new Coach feature must keep its own
separate lock, not quietly ride along on whichever lock happens to be open at the time.

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

**This is the feature slated to open to everyone next**, once the two items below are done.

**Next up:** Give it a memory. Right now the chat only ever holds one exchange in view —
nothing is saved. The next build phase adds: multi-turn conversations that stay on-topic
across several back-and-forth messages, and saving a person's last three conversations so they
can reopen and re-read one instead of starting over — with a chat-history screen modeled on
the Claude mobile app.
*Reference: `docs/TODO.md` §18.H (Chat & Search History Persistence), subsections H3–H4.*

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

**Next up:** The wording behind the gentle heads-up and the calm recovery message hasn't been
scored against the personality rubric yet — only the critical warning has been tuned in detail.
Separately, an older static tip box that still shows on Home in its own voice (not Coach's) is
due for a rewrite so it sounds like Coach instead of a leftover placeholder.
*Reference: `docs/TODO.md` §18.C (its copy-audit note) and `docs/coach-personality-rubric.md`
(axes 2 and onward, still blank).*

---

## 3. Coach's name, face, and personality

**What it is:** The character work behind Coach — his name, a small icon/avatar that could
appear next to his messages, and the full voice-and-tone rulebook.

**Status:** 📝 **Paperwork only.** The name "Coach" is decided and the voice rulebook exists,
but there's no avatar or icon built yet, and the voice rulebook itself is only one-fifth
filled in (see the note in section 1 above).

**Next up:** Design a small icon Coach can use everywhere he speaks, and finish scoring the
rest of the voice rulebook so every future feature inherits one consistent personality instead
of each one inventing its own.
*Reference: `docs/TODO.md` §18.A (Coach — Character Identity).*

---

## 4. Planned, not started — statement insights

**What it is:** The idea of Coach reading a person's bank/credit card statement upload and
summarizing what it finds in his own voice, instead of a plain data table.

**Status:** ⚪ **Not started.** No code exists for this yet — it's a written plan only.

**Next up:** This is first in line among the "not started" features.
*Reference: `docs/TODO.md` §18.D (Statements AI Insights).*

---

## 5. Planned, not started — Job Hunt Assistant

**What it is:** A Coach-guided chat for someone actively job hunting — coaching through the
search itself, not just the household numbers.

**Status:** ⚪ **Not started.**

**Next up:** *Reference: `docs/TODO.md` §18.E (Job Hunt AI Assistant).*

---

## 6. Planned, not started — résumé help

**What it is:** Letting someone upload a résumé so Coach can point out gaps or suggest
improvements.

**Status:** ⚪ **Not started.** This one has been scoped out on paper in more detail than the
others, but literally nothing has been built.

**Next up:** *Reference: `docs/TODO.md` §18.E1 (Résumé upload / skill-gap analysis).*

---

## 7. Planned, not started — Application Assistant

**What it is:** Coach helping someone through the mechanics of actually applying to a job —
cover letters, prep, tracking where they've applied.

**Status:** ⚪ **Not started.** This one is also waiting on a separate, unrelated piece of the
app (job board integrations) before it can even begin.

**Next up:** *Reference: `docs/TODO.md` §18.F (Application Assistant).*

---

## 8. Planned, not started — Job Scout

**What it is:** A location-based search where Coach helps someone find employers hiring nearby.

**Status:** ⚪ **Not started.**

**Next up:** *Reference: `docs/TODO.md` §18.I (Job Scout — Location-Based Employer Search).*

---

## 9. Planned, not started — guided tax setup

**What it is:** Coach walking a new user through tax setup conversationally, reading a photo of
a paystub instead of asking them to type every number in by hand.

**Status:** ⚪ **Not started.** This one is also waiting on a full accountant review of the
app's tax math before it can be built, regardless of the AI piece.

**Next up:** *Reference: `docs/TODO.md` §18.J (Tax Onboarding Interview).*

---

## The plumbing behind all of it (in one sentence)

Every section above talks to Coach through the same shared connection behind the scenes —
one place that holds his personality, one place that checks who's allowed to use him, one
place that talks to the AI provider. That's deliberate: it means fixing or improving Coach's
tone or safety rules in one spot fixes it everywhere he shows up, instead of six separate
copies quietly drifting apart from each other.
*Reference: `docs/TODO.md` §18.G (Shared Infrastructure); `docs/active-systems.md` §24 (AI
Layer — Coach).*
