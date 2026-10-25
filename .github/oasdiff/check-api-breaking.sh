#!/usr/bin/env bash
# Fails on a breaking change (removed or renamed route, field or parameter,
# narrowed type) between the base branch's copy of an OpenAPI document and
# this one. Both APIs that commit one are additive only: apps/library has no
# version prefix, and apps/api's breaking change means /v2. Needs oasdiff and
# jq on PATH. Deliberate removals go in
# .github/oasdiff/allowed-breaking-changes.txt (see "apps/library" in
# AGENTS.md).
#
# Usage: .github/oasdiff/check-api-breaking.sh <openapi.json> [base-ref]  (default: origin/main)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

spec=${1:?usage: check-api-breaking.sh <openapi.json> [base-ref]}
base=$(git merge-base "${2:-origin/main}" HEAD)

# A spec moved since the base (its app renamed) is compared with the base's
# copy at its old path, as git's rename detection finds it.
base_spec=$spec
if ! git cat-file -e "$base:$spec" 2>/dev/null; then
  base_spec=$(git diff --find-renames --diff-filter=R --name-status "$base" HEAD |
    awk -v spec="$spec" '$3 == spec { print $2 }')
  if [[ -z $base_spec ]]; then
    echo "the base branch has no $spec yet: nothing to compare"
    exit 0
  fi
  echo "$spec was $base_spec on the base branch: comparing with that"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git show "$base:$base_spec" >"$tmp/base.json"

# severity-levels.txt raises every removal oasdiff calls info (an optional
# response field, anything deprecated first) to a warning, so all removals
# need the override.
oasdiff breaking "$tmp/base.json" "$spec" \
  --format json \
  --severity-levels .github/oasdiff/severity-levels.txt \
  --err-ignore .github/oasdiff/allowed-breaking-changes.txt \
  --warn-ignore .github/oasdiff/allowed-breaking-changes.txt \
  >"$tmp/changes.json"

# Errors and warnings (level 3 and 2) both fail. The one exception: a new
# muscle group, a new enum value of a response property that is a muscle
# group. Clients must tolerate muscle groups they don't know; any other
# response enum stays closed. The property path is the last backticked one in
# the message. apps/library: `muscle_groups/items/` on the single lookup,
# prefixed with the union branch on the list
# (`anyOf[…]/data/items/muscle_groups/items/`). apps/api: the muscle group's
# `id` on /v1/muscle-groups (`data/items/id`) and /v1/muscle-groups/{…}
# (`data/id`).
jq -r '
  def new_muscle_group:
    .id == "response-property-enum-value-added"
    and ((.text | test("`([^`]*/)?muscle_groups/items/`"))
      or ((.path | startswith("/v1/muscle-groups"))
        and (.text | test("`data/(items/)?id`"))));
  .[]
  | select(.level >= 2)
  | select(new_muscle_group | not)
  | "\(.operation) \(.path) \(.text)  [\(.id)]"
' "$tmp/changes.json" >"$tmp/breaking.txt"

if [[ -s $tmp/breaking.txt ]]; then
  echo "breaking API changes in $spec against the base branch (the API is additive only):"
  sed 's/^/  /' "$tmp/breaking.txt"
  echo "A deliberate removal needs its line (without the [check id]) in .github/oasdiff/allowed-breaking-changes.txt: see apps/library in AGENTS.md."
  exit 1
fi
echo "no breaking API changes in $spec against the base branch"
