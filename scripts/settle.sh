#!/usr/bin/env bash
# T3 Code settle script: once a thread settles (its PR merged or closed, or
# settled by hand), unregister its worktree's Supabase MCP server and destroy its
# Supabase stack so stale stacks don't pile up. Its data is throwaway; rerunning
# setup.sh brings up a fresh one.
set -euo pipefail

worktree="${T3CODE_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"
root="${T3CODE_PROJECT_ROOT:-$(git -C "$worktree" worktree list --porcelain | awk 'NR == 1 { print $2 }')}"

# Never the main checkout's stack, even when run by hand there.
if [[ "$root" == "$worktree" ]]; then
  echo "Main checkout: leaving its Supabase stack alone"
  exit 0
fi

# Drop the Supabase MCP server setup.sh registered for this worktree.
if command -v claude >/dev/null; then
  (cd "$worktree" && claude mcp remove --scope local supabase-local >/dev/null 2>&1) || true
fi

# Stop what scripts/sim-loop.sh started here and delete its simulator and test
# User. Never fatal: without Infisical the User stays (a +clerk_test User on the
# development instance) and the rest still goes.
if [[ -f "$worktree/node_modules/.cache/sim-loop/state.json" ]]; then
  "$worktree/scripts/sim-loop.sh" down --delete || echo "sim-loop teardown failed; run scripts/sim-loop.sh down --delete by hand"
fi

# Every stack this worktree ever had (one per branch it was on), plus any left
# by worktrees deleted without settling.
"$worktree/scripts/destroy-stale-stacks.sh" "$worktree"
