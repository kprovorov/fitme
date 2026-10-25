#!/usr/bin/env bash
# Writes each app's local env file from Infisical (the project in the repo's
# .infisical.json, environment `dev` by default): one folder per app,
# references expanded. Overwrites the
# files it writes, unless --keep-existing; an app whose folder can't be read
# keeps its file.
#
# Usage: scripts/pull-env.sh [--keep-existing] [environment]
# Needs the Infisical CLI, logged in (`infisical login`). See docs/agents/secrets.md.
set -euo pipefail

keep_existing=0
if [[ "${1:-}" == "--keep-existing" ]]; then
  keep_existing=1
  shift
fi
env="${1:-dev}"
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# app directory, Infisical folder, env file name (the one each app loads)
apps=(
  "api Api .env"
  "arnold Arnold .env.local"
  "library Library .env"
  "mcp Mcp .env"
  "mobile Mobile .env"
  "site Site .env.local"
  "web Web .env.local"
  "webhooks Webhooks .env"
)

command -v infisical >/dev/null || { echo "infisical CLI not installed (brew install infisical/get-cli/infisical)" >&2; exit 1; }
# The CLI finds the project in .infisical.json, at the repo root.
cd "$root"

failed=0
for entry in "${apps[@]}"; do
  read -r app folder file <<<"$entry"
  target="$root/apps/$app/$file"
  if [[ "$keep_existing" == 1 && -e "$target" ]]; then
    continue
  fi
  tmp="$(mktemp)"
  if infisical export --env="$env" --path="/$folder" \
    --format=dotenv --silent >"$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
    chmod 600 "$tmp"
    mv "$tmp" "$target"
    echo "Wrote apps/$app/$file from /$folder ($env)"
  else
    rm -f "$tmp"
    echo "warning: couldn't read /$folder ($env), left apps/$app/$file alone" >&2
    failed=1
  fi
done
exit "$failed"
