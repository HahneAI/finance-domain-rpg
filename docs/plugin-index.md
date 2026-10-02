# Plugin Index (claude.ai account plugins)

> Moved out of `.claude/CLAUDE.md` (2026-10-02 cleanup) — account-level reference, not a project rule. Rule that stays in CLAUDE.md: a plugin skill that proposes a change to a Drift-Warden-mapped area still requires the drift check.

These are enabled on Anthony's claude.ai account and load in every session — no per-project
install. They **supplement** the project-specific skills above (`authority-finance-live-test`,
`authority-finance-coach-live-test`) and the Drift App Warden mandate; they never replace either.
Invoke skills as `/<plugin>:<skill>`. The account lists plugins by opaque ID, so the names below
are the skill namespaces.

### Engineering — `agent-protocols`
SDLC protocols, spec → ship. Slash commands: `/agent-protocols:spec` · `:plan` · `:build` ·
`:test` · `:review` · `:code-simplify` · `:ship`.
Agents: `code-reviewer` (5-axis review), `security-auditor`, `test-engineer`,
`accessibility-specialist`, `performance-engineer`, `release-engineer`, `spec-analyst`,
`documentation-specialist`.
Skills worth knowing here: `debugging-and-error-recovery`, `security-and-hardening`
(Supabase RLS / `api/` service-role routes), `frontend-ui-engineering`,
`performance-optimization`, `documentation-and-adrs`, `git-workflow-and-versioning`,
`incident-response-and-postmortems`.

| When | Reach for |
|------|-----------|
| New feature, scope unclear | `:spec` → `:plan` |
| Pre-merge review of a PR | `:review` / `agent-protocols:code-reviewer` |
| Touching `api/`, RLS, tier flags, Stripe | `security-auditor` + `security-and-hardening` |
| Production regression | `debugging-and-error-recovery` |
| Pre-release | `:ship` |

### Product — `product-management`
`write-spec` (feature specs/PRDs) · `roadmap-update` · `sprint-planning` ·
`stakeholder-update` · `metrics-review` · `synthesize-research` · `competitive-brief` ·
`product-brainstorming` (also `/product-management:brainstorm`).
Feeds `docs/TODO.md` — finished specs go there as numbered § items, per existing convention.
Note: ClickUp/Pendo connectors need authorizing in claude.ai before their tools work.

### Design — `design`
`design-critique` · `accessibility-review` (WCAG 2.1 AA) · `design-handoff` · `design-system` ·
`ux-copy` · `user-research` · `research-synthesis`.
**Must respect the project design system** (Color Tokens, two-font system, `.text-*` scale,
animation rules above) — treat plugin output as suggestions, never reintroduce raw hex or
hardcoded font sizes (`textUtilityClassAudit.test.js` will fail). Use `design-system` audits
against `docs/authority-design-system`. Figma/Asana/Linear/Intercom connectors need
authorizing in claude.ai.

### PWA / Play Store — `pwa2play`
`/pwa2play:package` (PWA → signed Play-ready Android bundle) · `:update` (rebuild a TWA for a
new release) · `:check` (read target API / version code / package id from a built `.apk`) ·
`pwa2play:pwa2play` (overview). The app is a PWA via `vite-plugin-pwa`, hosted on Vercel — run
`:package` against the deployed URL, not the dev server. Never commit signing keystores or
passwords.

### Other plugins enabled on the account (not project-relevant by default)
`finance` (accounting workflows — corporate close/audit, **not** personal-finance app logic),
`data` (SQL/viz/dashboards — usable against Supabase exports), `marketing`, `sales`,
`human-resources`, `datarobot-agent-skills`, `adaptive-agent`, `cowork-plugin-management`.

**Rule:** a plugin skill that proposes a change to a Drift-Warden-mapped area still requires the
drift check above before the change counts as done.

