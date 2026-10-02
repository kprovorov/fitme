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

# Env files are gitignored, so new worktrees don't get them. Copy any that exist
# in the main checkout (apps/*/.env*, supabase function secrets, ...) without
# overwriting files already present in the worktree.
while IFS= read -r -d '' src; do
  rel="${src#"$root"/}"
  dest="$worktree/$rel"
  if [[ ! -e "$dest" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    echo "Copied $rel"
  fi
done < <(
  find "$root" \
    \( -name node_modules -o -name .git -o -name .next -o -name .turbo -o -name ios -o -name android \) -prune \
    -o -type f -name '.env*' ! -name '.env.example' -print0
)
