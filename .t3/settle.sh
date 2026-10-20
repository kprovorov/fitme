#!/usr/bin/env bash
# T3 Code settle script: once a thread settles (its PR merged or closed, or
# settled by hand), destroy its worktree's Supabase stack so stale stacks don't
# pile up. Its data is throwaway; rerunning setup.sh brings up a fresh, seeded one.
set -euo pipefail

worktree="${T3CODE_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"
root="${T3CODE_PROJECT_ROOT:-$(git -C "$worktree" worktree list --porcelain | awk 'NR == 1 { print $2 }')}"

# Never the main checkout's stack, even when run by hand there.
if [[ "$root" == "$worktree" ]]; then
  echo "Main checkout: leaving its Supabase stack alone"
  exit 0
fi

cd "$worktree/packages/supabase"

if ! pnpm exec supabase status --output-format json >/dev/null 2>&1; then
  echo "No Supabase stack for this worktree"
  exit 0
fi

pnpm exec supabase stack destroy --yes
