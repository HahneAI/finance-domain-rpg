# Staged Claude plugins (ALL DISABLED)

Copies of Anthropic-marketplace plugins (`claude-plugins-official` cache, newest version of each),
staged so a cloud session can load them **one at a time**. **Nothing here is active**: every skill is
`SKILL.md.disabled`, every command/agent is `*.md.disabled`, and no MCP server or hook is registered
(`.mcp.json` and `.claude/settings.json` are untouched). File contents are unmodified copies.

## Enable / disable

```bash
node scripts/plugin-toggle.mjs list
node scripts/plugin-toggle.mjs enable <plugin>
node scripts/plugin-toggle.mjs disable <plugin>
```

`enable`/`disable` only add/remove the `.disabled` suffix on that plugin's skills, commands and agents,
using `<plugin>/manifest.json` as the exact file list. `enable` warns if a skill's name collides with an
already-active skill. It never touches `mcp.json.disabled` / `hooks.json.disabled` — those are
reference copies to wire up by hand if wanted.

## Layout

| Path | Contents |
|------|----------|
| `.claude/skills/<plugin>-<skill>/` | whole skill folder; every `SKILL.md` → `SKILL.md.disabled` (nested ones too) |
| `.claude/commands/<plugin>/<name>.md.disabled` | slash commands |
| `.claude/agents/<plugin>-<name>.md.disabled` | subagents |
| `.claude/plugins-staging/<plugin>/` | `plugin.json`, `LICENSE`, `manifest.json`, `mcp.json.disabled`, `hooks.json.disabled` |

## Plugins

| Plugin | Version | Skills | Commands | Agents | MCP | Hooks | Credentials / network |
|--------|---------|-------:|---------:|-------:|:---:|:-----:|-----------------------|
| claude-code-setup | 1.0.0 | 1 | 0 | 0 | – | – | none |
| claude-md-management | 1.0.0 | 1 | 1 | 0 | – | – | none |
| claude-security | 0.12.0 | 1 | 0 | 9 | – | ✔ | none; **see caveat 1** |
| code-simplifier | 1.0.0 | 0 | 0 | 1 | – | – | none |
| confidence | 0.9.0 | 14 | 17 | 0 | ✔ (2) | – | `confidence-flags` + `confidence-docs`: remote HTTP (`mcp.confidence.dev`); flags server needs Confidence auth |
| data (`astronomer-data`) | 0.1.0 | 34 | 0 | 0 | – | ✔ | hooks run `uv`; skills talk to Airflow/Astro/warehouses with the user's own credentials |
| figma | 2.2.120 | 14 | 0 | 0 | ✔ | – | remote HTTP `mcp.figma.com`; Figma OAuth |
| frontend-design | ab024cdcfa7c | 1 | 0 | 0 | – | – | none |
| legalzoom | 1.0.0 | 1 | 1 | 0 | ✔ | – | remote HTTP `legalzoom.com`; LegalZoom account; sends contract text off-machine |
| mapbox | 1.0.0 | 20 | 0 | 0 | ✔ (3) | – | remote HTTP `mcp.mapbox.com`, `mcp-devkit…`, `mcp-docs…`; devkit/runtime need a Mapbox token |
| plugin-dev | ab024cdcfa7c | 7 | 1 | 3 | – | – | none |
| session-report | ab024cdcfa7c | 1 | 0 | 0 | – | – | none (reads local `~/.claude/projects` transcripts) |
| skill-creator | ab024cdcfa7c | 1 | 0 | 0 | – | – | none |
| stripe | 0.10.3 | 10 | 2 | 1 | ✔ | ✔ | remote HTTP `mcp.stripe.com`; Stripe auth. **Use test mode only** — this repo has live billing (`api/stripe-*`) |
| supabase | 0.1.15 | 2 | 0 | 0 | ✔ | – | remote HTTP `mcp.supabase.com`; Supabase OAuth. **Can reach the production project** |
| twilio-developer-kit | 0.3.2 | 57 | 0 | 0 | ✔ | – | `twilio-docs`: remote HTTP docs server, no auth |
| vercel | 0.50.0 | 37 | 4 | 3 | ✔ | ✔ | remote HTTP `mcp.vercel.com`; Vercel OAuth. Deploy commands act on the real project |

Skipped: **code-modernization** (7.9 MB, over the ~5 MB cap). Not requested: nvidia-skills, slack,
project-artifact.

## Caveats

1. **Only skills/commands/agents are staged — not each plugin's other files.** Plugins whose skills call
   scripts or workflows at the plugin root will not fully work from here. Known case: `claude-security`
   (its `workflows/`, `scripts/` and `hooks.py|sh` are not staged; its `hooks.json.disabled` references them).
   `vercel`'s hooks reference ~40 `.mjs` files that are not staged. `data`'s hooks reference
   `skills/*/scripts/…`, which *are* staged inside the skill folders but under renamed paths.
2. **Partial skill sets** where `plugin.json` declares no extra roots: `figma` stages `skills/` only (14 of its 30
   skills); `workflow-skills/` and `skills-figquery/` are not declared by the plugin and were left out. `data`
   has 34 staged skills; its 3 `astro-airflow-mcp/.claude/commands/` are contributor tooling, not plugin commands.
   `vercel`'s `commands/_conventions.md` and `*.tmpl` helpers are not commands and were left out.
3. **No LICENSE file in the source** for figma, legalzoom, stripe, supabase — nothing copied; see each
   `plugin.json` (stripe/supabase declare MIT; legalzoom declares PROPRIETARY).
4. **Overlap with plugins already installed on the account:** the account/local installs of `skill-creator`,
   `frontend-design`, `figma`, `stripe`, `vercel`, etc. already expose the same skills under a `plugin:skill`
   namespace in some sessions. Enabling a staged copy adds a second, project-level copy.
   `plugin-toggle.mjs enable` only warns about collisions with project-level (`.claude/skills`) and user-level
   (`~/.claude/skills`) skills, not plugin-namespaced ones.
5. **`npm run lint`:** `eslint .` has no ignore for `.claude/`, and ~11 `.js`/`.jsx` fixture files live inside
   staged skills (mostly `confidence-*` test-fixtures). Add `.claude/**` to `globalIgnores` in
   `eslint.config.js` if lint starts failing on them.
6. **Long folder names:** `<plugin>-<skill>` is used literally, so Twilio/Stripe/Mapbox folders repeat the
   plugin name (e.g. `twilio-developer-kit-twilio-…`). Longest staged path is ~133 characters.
