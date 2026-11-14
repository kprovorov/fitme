#!/usr/bin/env bash
# T3 Code worktree setup: install deps, then start this checkout's Supabase
# stack, write its database URL into the database apps' .env and register its
# MCP server with Claude Code. No other env is written: apps start through
# scripts/with-dev-env.sh, which injects Infisical `dev` (docs/agents/secrets.md).
set -euo pipefail

worktree="${T3CODE_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"
root="${T3CODE_PROJECT_ROOT:-$(git -C "$worktree" worktree list --porcelain | awk 'NR == 1 { print $2 }')}"

cd "$worktree"

# Timestamped step lines in scripts/setup.log (git-ignored), appended run after
# run, so a failed setup can be diagnosed from the worktree afterwards.
log_file="$worktree/scripts/setup.log"
log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  echo "$line" >>"$log_file" 2>/dev/null || true
}
warn() {
  log "warning: $*" >&2
}
trap 'log "failed (exit $?) at line $LINENO: $BASH_COMMAND" >&2' ERR
trap 'log "exited $?"' EXIT
log "setup started in $worktree (main checkout $root)"

log "pnpm install"
pnpm install

# The git hooks (.husky/pre-commit: the secret scan, lint-staged). `pnpm install`
# doesn't always leave `.husky/_` in a new worktree (FIT-275's had none), and
# without it git runs no hook at all.
log "husky"
pnpm exec husky

# The browser the web and site screenshot loop drives through the root
# `playwright` devDependency. Cached outside the worktree, so after the first
# worktree this is a no-op. Not fatal: only the screenshot loop needs it.
log "Playwright Chromium"
pnpm exec playwright install chromium-headless-shell || warn "couldn't install Playwright's Chromium"

# A thread deleted without settling never runs settle.sh, so its stack outlives
# its worktree; sweep those before starting another one. Not fatal.
log "stale Supabase stacks"
scripts/destroy-stale-stacks.sh || warn "couldn't destroy stale Supabase stacks"

# Start this checkout's own stack, then write its database URL into the .env of
# each app that reaches Postgres (apps/api, apps/arnold, apps/mcp,
# apps/webhooks), creating the file or the line when missing: it's the one value
# local to a worktree, so Infisical doesn't hold it. A remote value is left
# alone. Not fatal: without Docker the install above still stands, the DB apps
# just have no database URL yet (rerun the writer once the stack is up, see
# docs/agents/secrets.md).
log "supabase start"
if ! stack="$(cd packages/supabase && pnpm exec supabase start --output-format json)"; then
  warn "couldn't start the local Supabase stack, so no database URL was written"
  exit 0
fi

# The rewriter is Node in its own file, not a heredoc: the bash 3.2 macOS ships
# matches quotes inside a heredoc in `$(...)`, so one stray quote in inline JS
# made this whole file a syntax error (exit 2). It prints the stack's MCP URL.
log "write the local stack's database URL into the env files"
if ! mcp_url="$(node scripts/rewrite-env.mjs "$worktree" "$stack")"; then
  warn "couldn't point the env files at the local stack"
  exit 0
fi
# An older setup wrote Arnold's file as .env.local, which eve ranks above .env,
# so its database URL would still win. Left alone: it may hold hand edits.
if [[ -f apps/arnold/.env.local ]]; then
  warn "apps/arnold/.env.local overrides apps/arnold/.env (eve ranks it higher): move what you need into .env and delete it"
fi
if [[ -z "$mcp_url" ]]; then
  warn "the stack has no MCP URL, so supabase-local wasn't registered"
  exit 0
fi

# Give Claude Code this stack's MCP server (local scope: stored per worktree
# path in ~/.claude.json, so parallel worktrees don't clash). An entry already
# there (a rerun, or another session writing ~/.claude.json at the same time)
# fails the add, so replace it and try once more; a stale URL from before the
# ports changed is replaced the same way. Never fatal: the agent can register it
# later.
add_mcp() {
  claude mcp add --scope local --transport http supabase-local "$mcp_url" 2>&1
}
if command -v claude >/dev/null; then
  log "register supabase-local ($mcp_url)"
  if out="$(add_mcp)"; then
    log "registered supabase-local"
  else
    log "claude mcp add failed, replacing supabase-local: $out"
    claude mcp remove --scope local supabase-local >/dev/null 2>&1 || true
    if out="$(add_mcp)"; then
      log "registered supabase-local"
    else
      warn "couldn't register supabase-local, run \`claude mcp add --scope local --transport http supabase-local $mcp_url\`: $out"
    fi
  fi
fi

log "setup done"
