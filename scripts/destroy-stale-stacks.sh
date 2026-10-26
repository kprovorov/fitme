#!/usr/bin/env bash
# Destroy the local Supabase stacks nobody can reach any more: every stack of a
# checkout that no longer exists (a thread deleted without settling removes its
# worktree but never runs settle.sh), plus, given a checkout path, every stack
# of that checkout. A stack belongs to a checkout *and* its branch, so renaming
# or switching the branch after setup leaves the old stack behind, and
# `supabase status` only finds the current branch's.
#
# Usage: destroy-stale-stacks.sh [checkout]
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
checkout="${1:-}"

cd "$here/packages/supabase"

if ! stacks="$(pnpm exec supabase stack list --output-format json 2>/dev/null)"; then
  echo "warning: couldn't list the local Supabase stacks" >&2
  exit 0
fi

# Which stacks: scripts/stale-stacks.mjs (Node in its own file, not a heredoc,
# so this file stays parseable by the bash 3.2 macOS ships).
ids="$(node "$here/scripts/stale-stacks.mjs" "$stacks" "$checkout")"

if [[ -z "$ids" ]]; then
  echo "No stale Supabase stacks"
  exit 0
fi

args=()
while read -r id; do
  args+=(--stack-id "$id")
done <<<"$ids"

pnpm exec supabase stack destroy "${args[@]}" --yes
