#!/usr/bin/env bash
# Local iOS production build + App Store submit for a release tag, for when the
# EAS Free plan's monthly build quota is used up (build-mobile.yml fails with
# "This account has used its iOS builds from the Free plan this month").
# Does what build-mobile.yml does, but builds on this Mac with `eas build --local`.
#
# Usage: scripts/release-ios-local.sh [vX.Y.Z]   (default: the latest v* tag)
#
# Needs: Xcode, CocoaPods, fastlane, Node 24, jq, `eas login`, and the Infisical
# CLI logged in. EAS injects the production EXPO_PUBLIC_* variables (Public
# visibility); SENTRY_AUTH_TOKEN is Secret on EAS, which local builds don't get,
# so it comes from Infisical `prod` /Mobile.
set -euo pipefail

# Everything runs from main, which bash reads in full first: checking out an
# older tag can change or remove this file while it runs.
main() {
  local repo tag ipa prev
  repo="$(git rev-parse --show-toplevel)"
  git -C "$repo" fetch -q --tags origin

  tag="${1:-$(git -C "$repo" tag -l 'v*' --sort=-v:refname | head -1)}"
  if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Tag must look like v1.2.3, got '$tag'" >&2
    exit 1
  fi
  echo "Building $tag"

  ipa="/tmp/fitme-$tag.ipa"

  if [[ -n "$(git -C "$repo" status --porcelain --untracked-files=no)" ]]; then
    echo "Working tree isn't clean" >&2
    exit 1
  fi
  if ! eas whoami >/dev/null; then
    echo "Run eas login first" >&2
    exit 1
  fi

  # Build exactly the tag, like build-mobile.yml, then put everything back.
  prev="$(git -C "$repo" symbolic-ref --short -q HEAD || git -C "$repo" rev-parse HEAD)"
  # shellcheck disable=SC2064 # expand now: the locals are gone when it fires
  trap "git -C '$repo' checkout -q -- apps/mobile/app.json; git -C '$repo' checkout -q '$prev'" EXIT

  git -C "$repo" checkout -q --detach "$tag"
  pnpm --dir "$repo" install --frozen-lockfile

  # Stamp the version from the tag (app.json is committed as 0.0.0).
  cd "$repo/apps/mobile"
  jq --arg v "${tag#v}" '.expo.version = $v' app.json >app.json.tmp
  mv app.json.tmp app.json

  infisical run --env=prod --path=/Mobile -- \
    eas build --platform ios --profile production --local --output "$ipa"

  eas submit --platform ios --profile production --path "$ipa"
}

main "$@"
