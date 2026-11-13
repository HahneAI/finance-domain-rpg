---
name: security-env-check
description: Gates genuinely security-sensitive work (a security review/audit, penetration testing, exploit or credential-testing tooling, implementing auth/session/token logic, wiring real API keys or secrets, handling real customer PII or payment data) behind a check of the current environment's network egress policy — an open environment turns a mistake or a compromised dependency into real data exfiltration during this class of work. Consult this skill whenever a task involves credentials, secrets, tokens, pentesting, exploit development, a "security review," or building/modifying auth code, even without the word "security." Do NOT trigger for a repo/file merely named "security," general CRUD/UI feature work, routine dependency bumps, or discussing security concepts without doing security-sensitive work in this session.
---

# Security Environment Check

## Why this exists

An environment's network egress policy (open, allowlisted, or blocked) is set once, when the environment is created, and can't be changed from inside a running session — there is no tool call that flips it. For most work that's irrelevant. But for security-sensitive work specifically — pentesting tools, credential/secret handling, exploit code, auth implementation — an unrestricted environment means nothing stops a mistake, a compromised dependency, or content designed to manipulate the agent from sending data somewhere it shouldn't. This skill exists to catch that mismatch *before* the sensitive work starts, not to slow down everything else.

This is a narrow, low-noise gate. The bar for triggering is real security-sensitive work happening in *this* session — not proximity to the word "security."

## When to actually trigger

Trigger when the user is asking you to do one of these, right now, in this session:
- A security review, audit, or pentest of code or infrastructure
- Writing or running exploit code, credential-testing tools, or other dual-use security tooling
- Implementing or modifying authentication, authorization, session, or token-handling logic
- Handling real API keys, secrets, credentials, or connection strings — not placeholder/example values
- Working with real customer PII, payment data, or similarly sensitive records

Do **not** trigger for:
- A repo or file that merely has "security," "secure," or "auth" in its name, when the actual task is unrelated (styling a page, fixing a typo, adding a feature)
- General app development — CRUD features, UI work, booking/stock/CMS-style features, routine bug fixes
- Talking *about* security concepts in the abstract, without doing security-sensitive work in this session
- Reading or reviewing already-written code that happens to include auth logic, when the task itself is something else (e.g., "explain how this file works")

If you're not sure whether a task qualifies, lean toward *not* interrupting — a missed check costs a warning later; a false trigger costs the user's flow on ordinary work, which is the exact problem this skill exists to avoid causing.

## What to do when it triggers

Before starting the security-sensitive work, get a read on the current environment's network policy. There's no tool that reports this directly, so infer it from what's available:

1. Call `mcp__Claude_Code_Remote__get_session` (omit `session_id` to describe the current session) to get the environment name/id this session is running in.
2. Call `mcp__Claude_Code_Remote__list_environments` and match the id — its name often signals intent (e.g., an environment literally named "open" or "default" vs. one named "restricted" or "security"). This is a hint, not proof — environment names aren't a guaranteed source of truth.
3. As an empirical check, try a `curl -sS -m 5 -o /dev/null -w "%{http_code}\n"` (or equivalent) against a domain you'd expect to be blocked under any reasonably restricted policy — a random, low-traffic third-party domain unrelated to the current task's actual dependencies works better than a well-known one, since allowlists sometimes special-case popular services. A successful connection is reasonably strong evidence the policy is open; a failure could mean either a restricted policy *or* a transient network issue, so don't treat one failed probe as proof of a locked-down environment — if the session/environment info from steps 1-2 didn't already suggest "restricted," a single successful probe is enough to act on, but a single failure alone is not enough to conclude the environment is safe.

State plainly in your own words to the user that this is best-effort inference — Claude Code doesn't expose a tool that reports the configured network policy directly, so this is a reasonable guess, not a guarantee.

**If the environment reads as open/unrestricted:** stop before doing the security-sensitive work itself (research, reading code, and planning are fine — the gate is on the sensitive *action*, not on discussing it). Tell the user, by name, which environment this is and why it looks open, and that this matters specifically because the work at hand is security-sensitive — an open environment has no constraint on where an exploit's output, a leaked credential, or a manipulated dependency could send data. Then give them the choice directly, rather than deciding for them:
- Proceed anyway, if they explicitly accept the risk — then go ahead.
- Start a fresh session in a different, already-restricted environment via `mcp__Claude_Code_Remote__create_session` with that environment's `environment_id`. If they don't have one set up yet, say so plainly: this skill can't create or reconfigure an environment's network policy (that only happens in the claude.ai/code web UI at environment-creation time), so the practical fix is to create one restricted environment once — e.g. named "security-restricted" — and reuse it for this class of work going forward.

**If the environment already reads as restricted/allowlisted, or the task turns out not to actually be security-sensitive on closer look:** don't interrupt. Say nothing about this check and continue with the work normally — a gate that announces itself when there's nothing to flag is exactly the noise this skill is meant to avoid.
