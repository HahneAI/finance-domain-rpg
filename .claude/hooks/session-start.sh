#!/bin/bash
set -euo pipefail

# Claude Code on the web only — local/CLI sessions already have a real .env
# and don't need any of this (docs/session-start-hook skill guidance).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$CLAUDE_PROJECT_DIR"

# ── Dependencies ────────────────────────────────────────────────────────────
npm install

# ── Supabase config (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) ───────────
# The Supabase anon key is meant to be public — Supabase's own security model
# is "safe to embed client-side, protected by RLS" (see CLAUDE.md's Env Vars
# section) — it's already sitting in the deployed production JS bundle. Set
# these two as environment variables on this Claude Code on the web
# environment (Environment settings, not this repo) and this hook will wire
# them into a gitignored .env.local so `npm run dev` boots past the
# "supabaseUrl is required" crash instead of only reaching the login shell.
# NEVER hardcode real values in this file — it's committed to the repo.
if [ -n "${VITE_SUPABASE_URL:-}" ] && [ -n "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  cat > "$CLAUDE_PROJECT_DIR/.env.local" <<ENVEOF
VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENVEOF
  echo "[session-start] wrote .env.local from environment-configured Supabase config"
else
  echo "[session-start] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not set on this environment — dev server will boot to a crash screen until they're configured"
fi

# ── Test account for headless login (TEST_ACCOUNT_EMAIL/PASSWORD) ──────────
# Deliberately NOT VITE_-prefixed — these must never end up in the client
# bundle. A driver script (Playwright) reads them directly from the process
# environment to fill the login form; nothing writes them to disk. Use a
# dedicated test/dummy account, never a real user's credentials.
if [ -n "${TEST_ACCOUNT_EMAIL:-}" ] && [ -n "${TEST_ACCOUNT_PASSWORD:-}" ]; then
  echo "[session-start] test account credentials present — headless login is available"
else
  echo "[session-start] TEST_ACCOUNT_EMAIL/TEST_ACCOUNT_PASSWORD not set on this environment — headless login won't be possible this session"
fi

# ── Headless browser driver (Playwright) ────────────────────────────────────
# Chromium itself is preinstalled at /opt/pw-browsers by the base image
# (PLAYWRIGHT_BROWSERS_PATH already points there) — only the npm package is
# missing. Installed ad hoc (--no-save), not added to package.json: this is a
# remote-testing convenience, not a project dependency, so local/CLI
# developers' installs stay untouched.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
if ! npm ls playwright >/dev/null 2>&1; then
  npm install --no-save playwright
fi

echo "[session-start] ready"
