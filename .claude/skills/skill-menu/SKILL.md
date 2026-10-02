---
name: skill-menu
description: Show the "skill menu" — a chat display of which staged plugins (the ones brought into this repo under .claude/ via scripts/plugin-toggle.mjs) are enabled vs still disabled, plus what else is always on. Use when the user says "skill menu", "plugin menu", "what plugins/skills are enabled", or "what's turned on vs off", or runs /skill-menu [plugin].
---

# Skill Menu

Displays the state of the plugins staged in this repo. The repo copies of third-party plugins live in
`.claude/skills/`, `.claude/commands/`, `.claude/agents/` with a `.disabled` suffix when OFF; the on-disk
state is the single source of truth, so always read it fresh — never answer from memory.

## Steps

1. Run from the repo root (the argument, if the user gave one, is a staged plugin name):

   ```bash
   node scripts/plugin-toggle.mjs menu            # whole menu
   node scripts/plugin-toggle.mjs menu <plugin>   # one plugin, item by item
   ```

2. Reply with the command's markdown output **verbatim** as your chat message (the user can't see tool
   output). Don't summarize it away or reformat the tables.

3. Whole-menu only: after it, add a short **"Also available in this session (not staged)"** section built
   from the skill list in YOUR OWN context, grouped as:
   - **claude.ai account skills** — the `anthropic-skills:*` entries (names only, comma-separated, drop the prefix)
   - **Built-in** — the unprefixed entries (e.g. `code-review`, `simplify`, `loop`, `run`, `init`, `security-review`)
   - Plugin-namespaced skills (`plugin:skill`) if any appear — note these come from real installed plugins,
     which cloud sessions don't load from the repo.
   Only list what is actually in your list; if a group is empty, say so.

4. End with one line on what the user can do next (the command prints it): enable with
   `node scripts/plugin-toggle.mjs enable <plugin>`, commit, then start a new cloud session or `/reload-skills`.

## Notes

- Status icons: 🟢 enabled · 🟡 partial · ⚪ disabled. "Extras" (MCP / hooks) are never auto-enabled by the
  toggle script; they are reference copies in `.claude/plugins-staging/<plugin>/`.
- Readiness comes from the 2026-10-02 staging audit (`.claude/plugins-staging/README.md` → "Readiness
  verdicts"). Update `DEFERRED` / `NOTES` in `scripts/plugin-toggle.mjs` if a verdict changes.
- This skill only reads; it never enables or disables anything unless the user explicitly asks.
