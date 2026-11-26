#!/usr/bin/env bash
# The iOS simulator loop in one command: gets this worktree to "Public API and
# Metro running on their own ports, its own simulator booted with a dev client
# installed, and a +clerk_test User with a Profile, a Plan and a finished
# Workout Session", then prints the agent-device steps that open the app and
# sign in. Those stay with the T3 device tools (docs/agents/ui.md): a script
# never launches the app or taps it.
#
# Usage:
#   scripts/sim-loop.sh [up] [--rebuild]   bring it up (reusing what's running)
#   scripts/sim-loop.sh status             what's up, and the sign-in steps
#   scripts/sim-loop.sh down [--delete]    stop the API and Metro and shut the
#                                          simulator down; --delete also deletes
#                                          the simulator and the test User
#
# Everything is per worktree, so two worktrees run it in parallel: the ports
# come from the OS (never 3003), the simulator is named after the worktree and
# the test User's address too. What it started is kept in
# node_modules/.cache/sim-loop (state.json and the logs), so a rerun reuses it.
#
# FITME_SIM_LOOP_DRY_RUN=1 prints every command that would start, build,
# install, boot or call out instead of running it (scripts/sim-loop.test.mjs).
# Needs macOS with Xcode, a started Supabase stack (scripts/setup.sh) and
# `infisical login` (scripts/with-dev-env.sh).
set -euo pipefail

worktree="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
name="$(basename "$worktree")"
cache="$worktree/node_modules/.cache/sim-loop"
state="$cache/state.json"
helper="$worktree/scripts/sim-loop.mjs"
dry_run="${FITME_SIM_LOOP_DRY_RUN:-}"

readonly BUNDLE_ID=com.fitmeproject.ios
readonly SIM_NAME="Fitme sim-loop $name"
# Per worktree, so two builds never share (and corrupt) one DerivedData.
readonly DERIVED_DATA="$HOME/Library/Developer/fitme-dd/$name"
readonly BUILT_APP="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/FitmeProject.app"
readonly API_START_SECONDS=90
readonly METRO_START_SECONDS=120

say() { echo "sim-loop: $*"; }
die() {
  echo "sim-loop: $*" >&2
  exit 1
}

# A command with side effects: printed instead of run in a dry run.
run() {
  if [[ -n "$dry_run" ]]; then
    echo "+ $*"
    return 0
  fi
  "$@"
}

get() { node "$helper" state "$state" get "$1"; }
# A dry run records nothing, so the next real run starts from what's there.
set_state() {
  [[ -n "$dry_run" ]] && return 0
  node "$helper" state "$state" set "$@"
}

simctl_json() {
  if [[ -n "$dry_run" ]]; then
    echo "+ xcrun simctl list devices devicetypes runtimes --json" >&2
    echo '{}'
    return 0
  fi
  xcrun simctl list devices devicetypes runtimes --json
}

usage() {
  sed -n '9,15p' "$0" | sed 's/^# \{0,1\}//'
}

# Starts a long-running command in its own process group (so `down` stops its
# whole tree), with its output in $cache/<log>.log. Prints its pid.
start_detached() {
  local log="$1"
  shift
  if [[ -n "$dry_run" ]]; then
    echo "+ $* >$cache/$log.log" >&2
    echo 0
    return 0
  fi
  node "$helper" spawn "$cache/$log.log" "$@"
}

# A pid from state.json is ours only while it's running and still the
# with-dev-env.sh this script started: after a reboot the pid may belong to
# something else, whose process group must never be signalled.
alive() {
  [[ -n "$1" && "$1" != 0 ]] && node "$helper" alive "$1" &&
    ps -o command= -p "$1" 2>/dev/null | grep -q 'with-dev-env\.sh'
}

stop_ours() {
  if alive "$1"; then
    say "stopping pid $1"
    run node "$helper" stop "$1"
  fi
}

wait_http() {
  [[ -n "$dry_run" ]] && return 0
  node "$helper" wait-http "$1" "$2" "$3"
}

# --- Supabase ---------------------------------------------------------------

ensure_database() {
  say "Supabase stack"
  # Idempotent: answers at once when the stack is up. Then points the DB apps'
  # .env (the API's included) at it, as setup.sh does.
  local stack
  if [[ -n "$dry_run" ]]; then
    run pnpm --filter @fitme/supabase exec supabase start --output-format json
    run node "$worktree/scripts/rewrite-env.mjs" "$worktree"
    return 0
  fi
  mkdir -p "$cache"
  stack="$(pnpm --silent --filter @fitme/supabase exec supabase start --output-format json 2>>"$cache/supabase.log")" ||
    die "couldn't start this worktree's Supabase stack (is Docker running?): see $cache/supabase.log"
  node "$worktree/scripts/rewrite-env.mjs" "$worktree" "$stack" >/dev/null
}

# --- Public API ---------------------------------------------------------------

ensure_api() {
  local pid port attempt
  pid="$(get api_pid)"
  port="$(get api_port)"
  if alive "$pid" && wait_http "http://127.0.0.1:$port/health" 5 "$pid"; then
    say "Public API already up on :$port (pid $pid)"
    api_port="$port"
    return 0
  fi
  # Alive but not answering: never leave it running beside the new one.
  stop_ours "$pid"
  for attempt in 1 2 3; do
    port="$(node "$helper" free-port)"
    say "Public API on :$port (attempt $attempt)"
    # PORT after the `--`: Infisical's values win over the caller's environment.
    pid="$(start_detached api "$worktree/scripts/with-dev-env.sh" Api -- \
      env PORT="$port" pnpm --filter @fitme/api dev)"
    if wait_http "http://127.0.0.1:$port/health" "$API_START_SECONDS" "$pid"; then
      set_state api_pid="$pid" api_port="$port"
      api_port="$port"
      return 0
    fi
    # Lost the port to another worktree, or the API failed: never keep it.
    stop_ours "$pid"
  done
  die "the Public API didn't come up: see $cache/api.log"
}

# --- Simulator -------------------------------------------------------------------

ensure_simulator() {
  local found udid sim_state type
  found="$(simctl_json | node "$helper" find-sim "$SIM_NAME")"
  udid="${found%% *}"
  sim_state="${found#* }"
  if [[ -z "$found" ]]; then
    type="$(simctl_json | node "$helper" pick-sim-type 2>/dev/null || true)"
    if [[ -n "$dry_run" && -z "$type" ]]; then
      type="<device type> <runtime>"
    fi
    [[ -n "$type" ]] || die "no iOS simulator runtime with an iPhone is installed (Xcode → Settings → Components)"
    say "creating the simulator \"$SIM_NAME\" (${type%% *})"
    if [[ -n "$dry_run" ]]; then
      # shellcheck disable=SC2086 # the device type and runtime, two words
      run xcrun simctl create "$SIM_NAME" $type
      udid="<udid>"
    else
      # shellcheck disable=SC2086 # the device type and runtime, two words
      udid="$(xcrun simctl create "$SIM_NAME" $type)"
    fi
    sim_state=Shutdown
  else
    say "reusing the simulator \"$SIM_NAME\" ($udid)"
  fi
  if [[ "$sim_state" != Booted ]]; then
    say "booting $udid"
    run xcrun simctl boot "$udid"
    run xcrun simctl bootstatus "$udid" -b >/dev/null
  fi
  sim_udid="$udid"
  set_state sim_udid="$udid"
}

# --- Dev client -------------------------------------------------------------------

installed_app() {
  [[ -n "$dry_run" ]] && return 0
  xcrun simctl get_app_container "$1" "$BUNDLE_ID" 2>/dev/null || true
}

is_dev_client() {
  [[ -n "$1" && -d "$1" ]] && node "$helper" is-dev-client "$1"
}

# A dev client already built here or installed on another simulator, so most
# runs never build.
find_dev_client() {
  local other app
  if is_dev_client "$BUILT_APP"; then
    echo "$BUILT_APP"
    return 0
  fi
  [[ -n "$dry_run" ]] && return 0
  for other in $(simctl_json | node "$helper" udids); do
    [[ "$other" == "$sim_udid" ]] && continue
    app="$(installed_app "$other")"
    if is_dev_client "$app"; then
      echo "$app"
      return 0
    fi
  done
}

build_dev_client() {
  say "building a dev client (several minutes; output in $cache/build.log)"
  local mobile="$worktree/apps/mobile"
  if [[ -n "$dry_run" ]]; then
    run "$worktree/scripts/with-dev-env.sh" Mobile -- pnpm --filter @fitme/mobile exec expo prebuild --platform ios --no-install
    run pod install --project-directory="$mobile/ios"
    run xcodebuild -workspace "$mobile/ios/FitmeProject.xcworkspace" -scheme FitmeProject -configuration Debug -destination "id=$sim_udid" -derivedDataPath "$DERIVED_DATA" CODE_SIGN_IDENTITY=- COMPILER_INDEX_STORE_ENABLE=NO
    return 0
  fi
  mkdir -p "$cache"
  {
    # The app config reads the env at prebuild (the Google URL scheme).
    "$worktree/scripts/with-dev-env.sh" Mobile -- \
      pnpm --filter @fitme/mobile exec expo prebuild --platform ios --no-install &&
      pod install --project-directory="$mobile/ios" &&
      xcodebuild -workspace "$mobile/ios/FitmeProject.xcworkspace" \
        -scheme FitmeProject -configuration Debug -destination "id=$sim_udid" \
        -derivedDataPath "$DERIVED_DATA" \
        CODE_SIGN_IDENTITY=- COMPILER_INDEX_STORE_ENABLE=NO
  } >>"$cache/build.log" 2>&1 || die "the dev client build failed: see $cache/build.log"
}

ensure_dev_client() {
  local current source
  current="$(installed_app "$sim_udid")"
  if [[ -z "$rebuild" ]] && is_dev_client "$current"; then
    say "dev client already installed ($(get dev_client_source))"
    return 0
  fi
  source=""
  [[ -z "$rebuild" ]] && source="$(find_dev_client)"
  if [[ -z "$source" ]]; then
    build_dev_client
    source="$BUILT_APP"
  fi
  say "installing the dev client from $source"
  run xcrun simctl install "$sim_udid" "$source"
  set_state dev_client_source="$source"
}

# --- Metro --------------------------------------------------------------------------

ensure_metro() {
  local pid port api_url attempt
  api_url="http://localhost:$api_port"
  pid="$(get metro_pid)"
  port="$(get metro_port)"
  # The app's env is baked in when Metro starts: a Metro serving another API
  # port is restarted.
  if alive "$pid" && [[ "$(get metro_api_url)" == "$api_url" ]] &&
    wait_http "http://127.0.0.1:$port/status" 5 "$pid"; then
    say "Metro already up on :$port (pid $pid)"
    metro_port="$port"
    return 0
  fi
  stop_ours "$pid"
  for attempt in 1 2 3; do
    port="$(node "$helper" free-port)"
    say "Metro on :$port, the app talking to $api_url (attempt $attempt)"
    # EXPO_PUBLIC_API_URL after the `--`, so it wins over Infisical's /Mobile
    # value (3003, another worktree's API). Never CI=1: it turns off watching.
    pid="$(start_detached metro "$worktree/scripts/with-dev-env.sh" Mobile -- \
      env EXPO_PUBLIC_API_URL="$api_url" \
      pnpm --filter @fitme/mobile exec expo start --dev-client --port "$port")"
    if wait_http "http://127.0.0.1:$port/status" "$METRO_START_SECONDS" "$pid"; then
      set_state metro_pid="$pid" metro_port="$port" metro_api_url="$api_url"
      metro_port="$port"
      return 0
    fi
    # Lost the port, or too slow: never leave it running unrecorded.
    stop_ours "$pid"
  done
  die "Metro didn't come up: see $cache/metro.log"
}

# --- Test User and data --------------------------------------------------------------

seed() {
  say "test User and its data, through the Public API"
  run "$worktree/scripts/with-dev-env.sh" Mcp -- \
    node "$helper" seed "$state" "http://127.0.0.1:$api_port" "$name"
}

# --- Report ------------------------------------------------------------------

report() {
  local udid email user_pw api metro
  udid="${sim_udid:-$(get sim_udid)}"
  api="${api_port:-$(get api_port)}"
  metro="${metro_port:-$(get metro_port)}"
  if [[ -z "$api" || -z "$metro" ]]; then
    say "the Public API and Metro aren't running: scripts/sim-loop.sh up"
    return 0
  fi
  email="$(get email)"
  user_pw="$(get password)"
  cat <<EOF

Simulator   $SIM_NAME ($udid)
Public API  http://localhost:$api   log: $cache/api.log
Metro       :$metro   log: $cache/metro.log
Test User   ${email:-none yet}

Open the app and sign in through the T3 device tools (docs/agents/ui.md):
  1. device_list, then device_open with this Mac's hostId and the device id $udid
  2. with the agent-device command it answers:
       open $BUNDLE_ID --metro-port $metro
       replay $worktree/apps/mobile/e2e/subflows/sign-in.yaml --maestro -e EMAIL=$email -e PASSWORD=$user_pw
     (no emailed code: the User skips Device Trust; if the replay drops
     keystrokes, fill the Email and Password fields with \`fill\` and press Log In)

Tear down: device_close first, then scripts/sim-loop.sh down
(--delete also deletes the simulator and the test User).
EOF
}

# --- Commands ------------------------------------------------------------------

up() {
  if [[ -z "$dry_run" ]]; then
    [[ "$(uname -s)" == Darwin ]] || die "needs macOS with Xcode"
    command -v xcrun >/dev/null || die "needs Xcode's xcrun"
  fi
  mkdir -p "$cache"
  # Typecheck inputs Metro would otherwise write first (gitignored).
  node "$worktree/scripts/mobile-types.mjs" >/dev/null
  ensure_database
  ensure_api
  ensure_simulator
  ensure_dev_client
  ensure_metro
  seed
  report
}

down() {
  local pid udid
  for pid in "$(get metro_pid)" "$(get api_pid)"; do
    stop_ours "$pid"
  done
  set_state metro_pid= api_pid= metro_api_url= metro_port= api_port=
  udid="$(get sim_udid)"
  if [[ -n "$udid" ]]; then
    say "shutting down $udid"
    run xcrun simctl shutdown "$udid" || true
  fi
  if [[ -n "$delete" ]]; then
    if [[ -n "$udid" ]]; then
      say "deleting the simulator $udid"
      run xcrun simctl delete "$udid" || true
      set_state sim_udid= dev_client_source=
    fi
    if [[ -n "$(get userId)" ]]; then
      run "$worktree/scripts/with-dev-env.sh" Mcp -- node "$helper" delete-user "$state"
    fi
  fi
  say "down"
}

command="up"
rebuild=""
delete=""
api_port=""
metro_port=""
sim_udid=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    up | down | status) command="$1" ;;
    --rebuild) rebuild=1 ;;
    --delete) delete=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "sim-loop: unknown argument '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

case "$command" in
  up) up ;;
  down) down ;;
  status) report ;;
esac
