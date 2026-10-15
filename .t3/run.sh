#!/usr/bin/env bash
# T3 Code run action: start the Expo dev server.
set -euo pipefail

cd "${T3CODE_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"

# Expo stays in the foreground so its interactive keys (r, i, a, ...) work.
pnpm mobile dev
