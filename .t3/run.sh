#!/usr/bin/env bash
# T3 Code run action: serve Supabase edge functions and start the Expo dev server.
# Expects the local Supabase stack to be running (`pnpm db start`).
set -euo pipefail

cd "${T3CODE_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"

pnpm db functions:serve &
functions_pid=$!
trap 'kill "$functions_pid" 2>/dev/null || true' EXIT

# Expo stays in the foreground so its interactive keys (r, i, a, ...) work.
pnpm mobile dev
