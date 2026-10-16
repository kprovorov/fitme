#!/usr/bin/env bash
# T3 Code worktree setup: install deps and copy local env files from the main checkout.
set -euo pipefail

worktree="${T3CODE_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"
root="${T3CODE_PROJECT_ROOT:-$(git -C "$worktree" worktree list --porcelain | awk 'NR == 1 { print $2 }')}"

cd "$worktree"

pnpm install

if [[ "$root" == "$worktree" ]]; then
  exit 0
fi

# Env files are gitignored, so new worktrees don't get them. Copy every
# apps/*/.env* and packages/*/.env* from the main checkout, without overwriting
# files already present in the worktree. Copies, not symlinks: each worktree
# runs its own Supabase stack (`[experimental] stack`), so its URLs and ports
# can differ, and editing them must not touch the main checkout's files.
for dir in "$root"/apps/* "$root"/packages/*; do
  for src in "$dir"/.env*; do
    [[ -f "$src" && "$src" != *.example ]] || continue
    rel="${src#"$root"/}"
    dest="$worktree/$rel"
    if [[ ! -e "$dest" ]]; then
      mkdir -p "$(dirname "$dest")"
      cp "$src" "$dest"
      echo "Copied $rel"
    fi
  done
done
