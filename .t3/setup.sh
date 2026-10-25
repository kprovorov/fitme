#!/usr/bin/env bash
# T3 Code worktree setup: install deps, copy local env files from the main
# checkout, then start this checkout's Supabase stack, point the env files at it
# and register its MCP server with Claude Code.
set -euo pipefail

worktree="${T3CODE_WORKTREE_PATH:-$(git rev-parse --show-toplevel)}"
root="${T3CODE_PROJECT_ROOT:-$(git -C "$worktree" worktree list --porcelain | awk 'NR == 1 { print $2 }')}"

cd "$worktree"

pnpm install

# The git hooks (.husky/pre-commit: the secret scan, lint-staged). `pnpm install`
# doesn't always leave `.husky/_` in a new worktree (FIT-275's had none), and
# without it git runs no hook at all.
pnpm exec husky

# The browser the web and site screenshot loop drives through the root
# `playwright` devDependency. Cached outside the worktree, so after the first
# worktree this is a no-op. Not fatal: only the screenshot loop needs it.
pnpm exec playwright install chromium-headless-shell || echo "warning: couldn't install Playwright's Chromium" >&2

# Env files are gitignored, so new worktrees don't get them. Infisical (`dev`)
# is their source: pull each app's file from it, never overwriting one already
# present (a rerun keeps this worktree's stack ports). Then copy every
# apps/*/.env* and packages/*/.env* still missing from the main checkout (all
# of them without the Infisical CLI or a login). Copies, not symlinks: each
# worktree runs its own Supabase stack (`[experimental] stack`), so its URLs and
# ports can differ, and editing them must not touch the main checkout's files.
if [[ "$root" != "$worktree" ]]; then
  scripts/pull-env.sh --keep-existing || echo "warning: couldn't pull every env file from Infisical, copying the rest from the main checkout" >&2

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
fi

# A thread deleted without settling never runs settle.sh, so its stack outlives
# its worktree; sweep those before starting another one. Not fatal.
.t3/destroy-stale-stacks.sh || echo "warning: couldn't destroy stale Supabase stacks" >&2

# The copied env files point at another checkout's stack (or at placeholders),
# so start this checkout's own and rewrite the local Supabase URL and key and
# the pooler port. A remote value is left alone. Not fatal: without Docker the
# install above still stands, the env files just keep their old values.
if ! stack="$(cd packages/supabase && pnpm exec supabase start --output-format json)"; then
  echo "warning: couldn't start the local Supabase stack, so the env files weren't updated" >&2
  exit 0
fi

read -r mcp_url < <(STACK="$stack" node - <<'JS'
const fs = require("node:fs");
const path = require("node:path");

const json = process.env.STACK.split("\n").reverse().find((line) => line.startsWith("{"));
const stack = JSON.parse(json);
const apiUrl = stack.env.API_URL;
const publishableKey = stack.env.PUBLISHABLE_KEY;
const poolerPort = stack.endpoints["pooler.sql"].port;

const local = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?)?$/;
const pairs = [
  ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"],
  ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
];
// Values may be quoted: `infisical export` (scripts/pull-env.sh) writes KEY='value'.
const unquote = (value) => value.trim().replace(/^(['"])(.*)\1$/, "$2");
const poolerUrl = /^(FITME_DATABASE_URL=['"]?postgres(?:ql)?:\/\/[^@\s]*@(?:127\.0\.0\.1|localhost):)[^/\n]+/m;

for (const parent of ["apps", "packages"]) {
  for (const dir of fs.readdirSync(parent)) {
    const full = path.join(parent, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.startsWith(".env") || name.endsWith(".example")) continue;
      const file = path.join(full, name);
      let text = fs.readFileSync(file, "utf8");
      const before = text;
      for (const [urlKey, anonKey] of pairs) {
        const current = text.match(new RegExp(`^${urlKey}=(.*)$`, "m"));
        if (!current || !local.test(unquote(current[1]))) continue;
        text = text.replace(new RegExp(`^${urlKey}=.*$`, "m"), `${urlKey}=${apiUrl}`);
        text = text.replace(new RegExp(`^${anonKey}=.*$`, "m"), `${anonKey}=${publishableKey}`);
      }
      text = text.replace(poolerUrl, `$1${poolerPort}`);
      if (text !== before) {
        fs.writeFileSync(file, text);
        console.error(`Pointed ${file} at the local stack`);
      }
    }
  }
}

console.log(stack.env.MCP_URL);
JS
)

# Give Claude Code this stack's MCP server (local scope: stored per worktree
# path in ~/.claude.json, so parallel worktrees don't clash). Remove first so a
# rerun after the ports changed (new branch, recreated stack) replaces it.
if command -v claude >/dev/null; then
  claude mcp remove --scope local supabase-local >/dev/null 2>&1 || true
  claude mcp add --scope local --transport http supabase-local "$mcp_url"
fi
