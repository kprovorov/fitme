#!/usr/bin/env bash
# Runs a command with Infisical `dev` values in its environment, so an app
# starts with no pulled env file. Nothing is written to disk.
#
# Usage: scripts/with-dev-env.sh [Folder ...] -- <command> [args ...]
#
#   scripts/with-dev-env.sh Api -- pnpm dev:api
#   scripts/with-dev-env.sh Api Library -- pnpm --filter @fitme/api clerk:check
#   scripts/with-dev-env.sh -- pnpm dev          # all eight app folders
#
# Folders are the app folders of the Infisical project in the repo's
# .infisical.json; with none it injects all eight. It names them one by one and
# never fetches recursively: `dev` also holds /GitHub, CI's credentials (one of
# them production-strength), which must never reach an app. It reads `dev` only:
# nothing selects another environment.
#
# With INFISICAL_UNIVERSAL_AUTH_CLIENT_ID and INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET
# set it authenticates as that machine identity for this run; otherwise as the
# user logged in with `infisical login`. Infisical's values win over the same
# names already in the environment (a personal override wins over both).
#
# The exit code is the command's. When Infisical can't supply the values it
# exits non-zero without starting the command. It never prints a value.
# See docs/agents/secrets.md.
set -euo pipefail

# The only environment this script reads. Never parameterise it.
readonly INFISICAL_ENV=dev
app_folders=(Api Arnold Library Mcp Mobile Site Web Webhooks)

usage() {
  echo "Usage: $0 [Folder ...] -- <command> [args ...]" >&2
  echo "Folders: ${app_folders[*]} (none: all of them)" >&2
}

is_app_folder() {
  local candidate
  for candidate in "${app_folders[@]}"; do
    [[ "$candidate" == "$1" ]] && return 0
  done
  return 1
}

folders=()
separator=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      separator=1
      shift
      break
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      if ! is_app_folder "$1"; then
        echo "$0: unknown folder '$1'" >&2
        usage
        exit 2
      fi
      folders+=("$1")
      shift
      ;;
  esac
done
if [[ "$separator" == 0 || $# -eq 0 ]]; then
  usage
  exit 2
fi
if [[ ${#folders[@]} -eq 0 ]]; then
  folders=("${app_folders[@]}")
fi

paths=()
for folder in "${folders[@]}"; do
  paths+=("--path=/$folder")
done

login_hint() {
  if [[ "$machine_identity" == 1 ]]; then
    echo "Check INFISICAL_UNIVERSAL_AUTH_CLIENT_ID / INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET (a machine identity that can read dev)." >&2
  else
    echo "Log in with: infisical login" >&2
  fi
}

machine_identity=0
if [[ -n "${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-}" && -n "${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-}" ]]; then
  machine_identity=1
fi

if ! command -v infisical >/dev/null; then
  echo "$0: the Infisical CLI isn't installed (brew install infisical/get-cli/infisical)." >&2
  login_hint
  exit 1
fi

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# Never let the caller's environment pick the token, project, environment or
# folders: the run reads `dev` of this repo's project, as the identity chosen
# here. (A login profile or org the caller selects still applies.)
unset INFISICAL_TOKEN INFISICAL_PROJECT_ID INFISICAL_ENVIRONMENT INFISICAL_SECRET_PATH

run_flags=(--env="$INFISICAL_ENV" --project-config-dir="$root" --silent)
if [[ "$machine_identity" == 1 ]]; then
  # A machine identity has no linked project, so `run` needs the project id
  # passed (--projectId: "when using machine identity based auth").
  project_id="$(sed -n 's/.*"workspaceId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$root/.infisical.json")"
  if [[ -z "$project_id" ]]; then
    echo "$0: no workspaceId in $root/.infisical.json" >&2
    exit 1
  fi
  # The CLI reads the client id and secret from the environment, so neither
  # goes on a command line. The token reaches `run` the same way.
  # --plain prints the token on stdout only, so the CLI's errors stay visible.
  if ! INFISICAL_TOKEN="$(infisical login --method=universal-auth --silent --plain)" ||
    [[ -z "$INFISICAL_TOKEN" ]]; then
    unset INFISICAL_TOKEN
    echo "$0: the machine identity couldn't log in to Infisical." >&2
    login_hint
    exit 1
  fi
  export INFISICAL_TOKEN
  run_flags+=(--projectId="$project_id")
fi

# `infisical run` exits 1 both when it can't fetch and whenever the command
# fails, whatever its code. So an inner sh creates a marker before the command
# runs (no marker: it never started) and writes the command's code into it.
# The inner sh traps (never ignores) the stop signals, so Ctrl-C still reaches
# the command and its 130 is recorded. The command never sees the machine
# identity's credentials or token.
marker_dir="$(mktemp -d)"
marker="$marker_dir/status"
trap 'rm -rf "$marker_dir"' EXIT
# Ctrl-C reaches the whole process group: wait for the command and keep its code.
trap : INT

set +e
# shellcheck disable=SC2016 # expanded by the inner sh, not here
infisical run "${run_flags[@]}" "${paths[@]}" -- \
  /bin/sh -c 'm=$1; shift; : >"$m"; trap : INT TERM HUP
env -u INFISICAL_TOKEN -u INFISICAL_UNIVERSAL_AUTH_CLIENT_ID -u INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET "$@"
s=$?; echo "$s" >"$m"; exit "$s"' \
  with-dev-env "$marker" "$@"
status=$?
set -e

if [[ -s "$marker" ]]; then
  status="$(cat "$marker")"
elif [[ ! -e "$marker" ]]; then
  echo "$0: Infisical couldn't supply the $INFISICAL_ENV values for ${folders[*]}; nothing was started." >&2
  login_hint
  [[ "$status" == 0 ]] && status=1
fi
exit "$status"
