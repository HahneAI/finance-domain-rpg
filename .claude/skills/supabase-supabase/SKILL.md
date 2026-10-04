---
name: supabase
description: "Use when doing ANY task involving Supabase. Triggers: Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues); client libraries and SSR integrations (supabase-js, @supabase/ssr) in Next.js, React, SvelteKit, Astro, Remix; auth issues (login, logout, sessions, JWT, cookies, getSession, getUser, getClaims, RLS); Supabase CLI or MCP server; schema changes, migrations, declarative schemas, security audits, Postgres extensions (pg_graphql, pg_cron, pg_vector); debugging and troubleshooting errors or unexpected behavior on Supabase projects (HTTP errors, Postgres errors, RLS surprises, permission denied, schema cache issues, timeouts, Edge Function crashes, Realtime drops, Storage failures) and reading or querying logs (Logs Explorer, ClickHouse)."
metadata:
  author: supabase
  version: "0.1.2"
---

# Supabase

## Authority Finance overrides — read first, these beat anything below

This repo is a **Vite + React** app on Supabase (Auth + Postgres), deployed on Vercel. It is **not** a Supabase-CLI project: there is no `supabase/` folder, no `config.toml`, no declarative schemas and no `.mcp.json`. Where the generic guidance below conflicts with this block, **this block wins.**

1. **Migrations are hand-written SQL files in `database/migrations/NNN_name.sql`, applied to production by the owner by hand.** Verify the next number against that folder (never from memory; the `.claude/CLAUDE.md` Migrations note says which is next but has gone stale before). `0NN_BOOKMARK_*` files are schema snapshots, never migrations. Write the file, explain how to apply and verify it, and stop. **Never run SQL against any live database** — not via MCP `execute_sql`/`apply_migration`, not via `psql`, not via any CLI. **Never run** `supabase migration new`, `db pull`, `db push` or `db reset`. **No destructive migrations** (no `DROP`, no data-losing `ALTER`, no `TRUNCATE`) without the owner's explicit say-so for that specific change.
2. **The Supabase MCP server is not configured. Do not create or edit `.mcp.json`** and do not suggest wiring it casually. If the owner asks for it: project-scoped and read-only (check the current MCP docs for the exact flags), never write access to production.
3. **Keys:** the browser uses only the public key (`VITE_SUPABASE_ANON_KEY`, plus `VITE_SUPABASE_URL`). `SUPABASE_SERVICE_ROLE_KEY` exists **only** in `api/` serverless routes — never in any `VITE_`-prefixed variable, never in `src/`. (`VITE_` is this repo's equivalent of Next.js's `NEXT_PUBLIC_`: everything with that prefix ships to the browser.)
4. **Privileged writes go through `api/` service-role routes** (tier flags, subscription columns, changelog, beta content/scores — RLS migration 019: the client never writes them). **Do not add a file to `api/`**: Vercel Hobby allows 12 functions and the repo is at 12/12; fold new behavior into an existing dispatcher route instead.
5. **`SECURITY DEFINER` is already used on purpose** (e.g. `is_tracked_beta_tester`, `get_user_employer_preset(uid)`, migrations 031/037/040). Any new or edited one must follow the checklist below (non-exposed schema or an `auth.uid()` check in the body; `EXECUTE` revoked from `PUBLIC` where appropriate) and be called out in your report.
6. **Production ground truth:** the latest `038_BOOKMARK_schema_snapshot_*.sql` plus `database/migrations/README.md` describe what is live. Do not assume a migration is applied until the owner says so.
7. **Drift Warden applies.** Before changing RLS, auth, tier flags, entitlements or any persisted field, read the matching trigger map in `docs/drift-app-warden.md` (§14 Auth, §19 Persistence, §20 Entitlements; a new persisted field also needs the four-site procedure in `CLAUDE.md`) and put the entries consulted in your report ("none applicable" is valid; silence is not).
8. **No external posting.** `references/skill-feedback.md` describes filing a GitHub issue. Never do that unless the owner explicitly asks in that conversation, and never include repo contents, schema or user data in one.
9. **Report format:** state which migration file you wrote (or "none"), that nothing was run against a live database, which Supabase docs/changelog pages you checked, and the Drift Warden line.

## Core Principles

**1. Supabase changes frequently — verify against changelog and current docs before implementing.**
Do not rely on training data for Supabase features. Function signatures, config.toml settings, and API conventions change between versions.

First, fetch `https://supabase.com/changelog.md` (a lightweight summary index — not a heavy pull), scan for `breaking-change` tags relevant to your task, and follow the linked page for any that apply. Then look up the relevant topic using the documentation access methods below.

**2. Verify your work.**
After implementing any fix, run a test query to confirm the change works. A fix without verification is incomplete.

**3. Recover from errors, don't loop.**
If an approach fails after 2-3 attempts, stop and reconsider. Try a different method, check documentation, inspect the error more carefully, and review relevant logs when available. Supabase issues are not always solved by retrying the same command, and the answer is not always in the logs, but logs are often worth checking before proceeding.

**4. Exposing tables to the Data API:** Depending on the user's [Data API settings](https://supabase.com/dashboard/project/<ref>/integrations/data_api/settings), newly created tables may not be automatically exposed via the Data (REST) API. If this is the case, `anon` and `authenticated` roles will need to be explicitly granted access.

> Note that this is separate from RLS, which controls which _rows_ are visible once a table is accessible, not whether the table is accessible at all.

When a user reports a SQL-created table is unexpectedly inaccessible, check their Data API settings and whether the roles have been granted access via explicit `GRANT` SQL. When granting public (`anon`/`authenticated`) access, always enable RLS too. See [Exposing a Table to the Data API](https://supabase.com/docs/guides/api/securing-your-api.md) for the full setup workflow.

**5. RLS in exposed schemas.**
Enable RLS on every table in any exposed schema, which includes `public` by default. This is critical in Supabase because tables in exposed schemas can be reachable through the Data API when the `anon`/`authenticated` roles have access (see [Exposing a Table to the Data API](https://supabase.com/docs/guides/api/securing-your-api.md)). For private schemas, prefer RLS as defense in depth. After enabling RLS, create policies that match the actual access model rather than defaulting every table to the same `auth.uid()` pattern.

**6. Security checklist.**
When working on any Supabase task that touches auth, RLS, views, storage, or user data, run through this checklist. These are Supabase-specific security traps that silently create vulnerabilities:

- **Auth and session security**
  - **Never use `user_metadata` claims in JWT-based authorization decisions.** In Supabase, `raw_user_meta_data` is user-editable and can appear in `auth.jwt()`, so it is unsafe for RLS policies or any other authorization logic. Store authorization data in `raw_app_meta_data` / `app_metadata` instead.
  - **Deleting a user does not invalidate existing access tokens.** Sign out or revoke sessions first, keep JWT expiry short for sensitive apps, and for strict guarantees validate `session_id` against `auth.sessions` on sensitive operations.
  - **If you use `app_metadata` or `auth.jwt()` for authorization, remember JWT claims are not always fresh until the user's token is refreshed.**

- **API key and client exposure**
  - **Never expose the `service_role` or secret key in public clients.** Prefer publishable keys for frontend code. Legacy `anon` keys are only for compatibility. In Next.js, any `NEXT_PUBLIC_` env var is sent to the browser.

- **RLS, views, and privileged database code**
  - **Views bypass RLS by default.** In Postgres 15 and above, use `CREATE VIEW ... WITH (security_invoker = true)`. In older versions of Postgres, protect your views by revoking access from the `anon` and `authenticated` roles, or by putting them in an unexposed schema.
  - **UPDATE requires a SELECT policy.** In Postgres RLS, an UPDATE needs to first SELECT the row. Without a SELECT policy, updates silently return 0 rows — no error, just no change.
  - **`auth.role()` is deprecated — use the `TO` clause instead.** Supabase has deprecated `auth.role()` in favour of specifying the target role directly on the policy with `TO authenticated` or `TO anon`. Beyond deprecation, `auth.role() = 'authenticated'` breaks silently when anonymous sign-ins are enabled, because anonymous users carry the `authenticated` Postgres role and pass the check regardless of whether the user is genuinely signed in.
    ```sql
    -- Deprecated (do not use)
    create policy "example" on table_name for select
    using ( auth.role() = 'authenticated' );
    ```
  - **`TO authenticated` alone is authentication without authorization (BOLA / IDOR).** Using `TO authenticated` only checks the role — it does not restrict which rows a user can access. The correct pattern combines `TO authenticated` with an ownership predicate in `USING`:
    ```sql
    create policy "example" on table_name for select
    to authenticated
    using ( (select auth.uid()) = user_id );
    ```
  - **UPDATE policies require both `USING` and `WITH CHECK`.** Without `WITH CHECK`, a user can reassign a row's `user_id` to another user:
    ```sql
    create policy "example" on table_name for update
    to authenticated
    using ( (select auth.uid()) = user_id )
    with check ( (select auth.uid()) = user_id );
    ```
  - **`SECURITY DEFINER` functions bypass RLS.** A `SECURITY DEFINER` function runs with its creator's privileges — typically a role with `bypassrls` (e.g., `postgres`). Never add `SECURITY DEFINER` to resolve a permission error; it silently removes access control without fixing the underlying cause. Prefer `SECURITY INVOKER`.
  - **`SECURITY DEFINER` functions in `public` are callable by all roles.** Postgres grants `EXECUTE` to `PUBLIC` by default for every new function, so any `SECURITY DEFINER` function in `public` is a public API endpoint callable by `anon` and `authenticated` (which inherit from `PUBLIC`) without any additional grant. When `SECURITY DEFINER` is genuinely needed (e.g., bypassing RLS on an internal lookup table), keep the function in a non-exposed schema, always include an `auth.uid()` check in the function body, and run `supabase db advisors` after making changes.

- **Storage access control**
  - **Storage upsert requires INSERT + SELECT + UPDATE.** Granting only INSERT allows new uploads but file replacement (upsert) silently fails. You need all three.

- **Dependency and supply-chain security**
  - **Always pin package versions and commit lockfiles** when installing Supabase packages (`supabase-js`, `@supabase/ssr`, `supabase-py`, etc.). See the [npm security guide](https://supabase.com/docs/guides/security/npm-security.md) for the full checklist.

For any security concern not covered above, fetch the Supabase product security index: `https://supabase.com/docs/guides/security/product-security.md`

## Supabase CLI

**Not used in this repo** (see overrides above). Never run commands that touch a database. If the owner asks you to use the CLI for something read-only, discover commands via `--help` — never guess — and say what each one touches before running it.

## Supabase MCP Server

For setup instructions, server URL, and configuration, see the [MCP setup guide](https://supabase.com/docs/guides/getting-started/mcp).

**Troubleshooting connection issues** — follow these steps in order:

1. **Check if the server is reachable:**
   `curl -so /dev/null -w "%{http_code}" https://mcp.supabase.com/mcp`
   A `401` is expected (no token) and means the server is up. Timeout or "connection refused" means it may be down.

2. **Check `.mcp.json` configuration:**
   This repo deliberately has no `.mcp.json` — **do not create one** (see overrides). Report that it is absent and ask the owner.

3. **Authenticate the MCP server:**
   If the server is reachable and `.mcp.json` is correct but tools aren't visible, the user needs to authenticate. The Supabase MCP server uses OAuth 2.1 — tell the user to trigger the auth flow in their agent, complete it in the browser, and reload the session.

## Supabase Documentation

Before implementing any Supabase feature, find the relevant documentation. Use these methods in priority order:

1. **MCP `search_docs` tool** (preferred — returns relevant snippets directly)
2. **Fetch docs pages as markdown** — any docs page can be fetched by appending `.md` to the URL path.
3. **Web search** for Supabase-specific topics when you don't know which page to look at.

## Making and Committing Schema Changes

**This repo's workflow (the generic CLI/declarative workflows do not apply):**

1. Read `database/migrations/README.md` and the latest `038_BOOKMARK_*` snapshot for current shape; read the existing migrations that touch the same table (RLS conventions live in 019 and 024).
2. Find the next number in `database/migrations/` and write one new `NNN_descriptive_name.sql`: idempotent where possible (`IF NOT EXISTS`), additive, with a header comment explaining the *why* and the owner's apply-and-verify steps.
3. Run the Security Checklist above against it (RLS enabled; `TO authenticated` plus an ownership predicate in `USING`; `UPDATE` policies with both `USING` and `WITH CHECK`; views `security_invoker`; any `SECURITY DEFINER` justified; Storage upsert needs INSERT + SELECT + UPDATE).
4. Update `database/migrations/README.md`, and the `.claude/CLAUDE.md` Migrations note if the next number changed.
5. **Do not apply it anywhere.** Tell the owner what to run and how to verify (a read-only query).

## Debugging

When you get an error on a Supabase-related request, for example an error code from the Supabase REST API, Postgres database, or PostgREST, an empty result, getting blocked by RLS unexpectedly, or an error from a Supabase service like Auth, Realtime, Edge Functions, or Storage, you **must** fetch Supabase's [Monitoring and Debugging](https://supabase.com/docs/guides/monitoring-and-debugging.md) documentation before diagnosing or proposing a fix, rather than working from memory. The same docs also cover performance optimizations, such as slow queries and missing indexes.

## Reference Guides

- **Skill Feedback** → [references/skill-feedback.md](references/skill-feedback.md)
  **MUST read when** the user reports that this skill gave incorrect guidance or is missing information.
