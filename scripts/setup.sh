#!/usr/bin/env bash
# T3 Code worktree setup: install deps, copy local env files from the main
# checkout, then start this checkout's Supabase stack, point the env files at it
# and register its MCP server with Claude Code.
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

# Env files are gitignored, so new worktrees don't get them. Infisical (`dev`)
# is their source: pull each app's file from it, never overwriting one already
# present (a rerun keeps this worktree's stack ports). Then copy every
# apps/*/.env* and packages/*/.env* still missing from the main checkout (all
# of them without the Infisical CLI or a login). Copies, not symlinks: each
# worktree runs its own Supabase stack (`[experimental] stack`), so its URLs and
# ports can differ, and editing them must not touch the main checkout's files.
# A dir without a package.json isn't an app or package (a renamed app leaves its
# gitignored .env and node_modules behind), so it's skipped.
if [[ "$root" != "$worktree" ]]; then
  log "env files"
  scripts/pull-env.sh --keep-existing || warn "couldn't pull every env file from Infisical, copying the rest from the main checkout"

  for dir in "$root"/apps/* "$root"/packages/*; do
    [[ -f "$dir/package.json" ]] || continue
    for src in "$dir"/.env*; do
      [[ -f "$src" && "$src" != *.example ]] || continue
      rel="${src#"$root"/}"
      dest="$worktree/$rel"
      if [[ ! -e "$dest" ]]; then
        mkdir -p "$(dirname "$dest")"
        cp "$src" "$dest"
        log "Copied $rel"
      fi
    done
  done
fi

# A thread deleted without settling never runs settle.sh, so its stack outlives
# its worktree; sweep those before starting another one. Not fatal.
log "stale Supabase stacks"
scripts/destroy-stale-stacks.sh || warn "couldn't destroy stale Supabase stacks"

# The copied env files point at another checkout's stack (or at placeholders),
# so start this checkout's own and rewrite the local Supabase URL and key and
# the pooler port. A remote value is left alone. Not fatal: without Docker the
# install above still stands, the env files just keep their old values.
log "supabase start"
if ! stack="$(cd packages/supabase && pnpm exec supabase start --output-format json)"; then
  warn "couldn't start the local Supabase stack, so the env files weren't updated"
  exit 0
fi

# The rewriter is Node in its own file, not a heredoc: the bash 3.2 macOS ships
# matches quotes inside a heredoc in `$(...)`, so one stray quote in inline JS
# made this whole file a syntax error (exit 2). It prints the stack's MCP URL.
log "point the env files at the local stack"
if ! mcp_url="$(node scripts/rewrite-env.mjs "$worktree" "$stack")"; then
  warn "couldn't point the env files at the local stack"
  exit 0
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
