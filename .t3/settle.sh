#!/usr/bin/env bash
# T3 Code settle script: once a thread settles (its PR merged or closed, or
# settled by hand), unregister its worktree's Supabase MCP server and destroy its
# Supabase stack so stale stacks don't pile up. Its data is throwaway; rerunning
# setup.sh brings up a fresh, seeded one.
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

# Every stack this worktree ever had (one per branch it was on), plus any left
# by worktrees deleted without settling.
"$worktree/.t3/destroy-stale-stacks.sh" "$worktree"
