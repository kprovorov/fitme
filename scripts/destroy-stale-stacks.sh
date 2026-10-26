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

ids="$(STACKS="$stacks" CHECKOUT="$checkout" node - <<'JS'
const fs = require("node:fs");
const path = require("node:path");

const json = process.env.STACKS.split("\n").reverse().find((line) => line.startsWith("{"));
const own = process.env.CHECKOUT && path.join(process.env.CHECKOUT, "packages/supabase");

for (const stack of JSON.parse(json).stacks) {
  if (stack.project_root === own || !fs.existsSync(stack.project_root)) {
    console.error(`Destroying ${stack.id.slice(0, 8)} (${stack.project_root}, ${stack.branch_context})`);
    console.log(stack.id);
  }
}
JS
)"

if [[ -z "$ids" ]]; then
  echo "No stale Supabase stacks"
  exit 0
fi

args=()
for id in $ids; do
  args+=(--stack-id "$id")
done

pnpm exec supabase stack destroy "${args[@]}" --yes
