#!/usr/bin/env bash
# Local iOS production build + App Store submit for a release tag, for when the
# EAS Free plan's monthly build quota is used up (build-mobile.yml fails with
# "This account has used its iOS builds from the Free plan this month").
# Does what build-mobile.yml does, but builds on this Mac with `eas build --local`:
# checks the tag's App Store screenshots, builds, submits, then pushes the tag's
# Store listing (text and Screenshot sets) to the submitted version's draft.
#
# Usage: scripts/release-ios-local.sh [--listing-only] [vX.Y.Z]
#        (default: the latest v* tag; --listing-only skips the build and
#        submit and only pushes the listing, to retry a failed push)
#
# Needs: Xcode, CocoaPods, fastlane, Node 24, jq, `eas login`, and the Infisical
# CLI logged in. EAS injects the production EXPO_PUBLIC_* variables (Public
# visibility); SENTRY_AUTH_TOKEN is Secret on EAS, which local builds don't get,
# so it comes from Infisical `prod` /Mobile.
set -euo pipefail

# Release CI's pinned EAS CLI: the one whose metadata:push uses the stored EAS
# submit API key and uploads the Screenshot sets as the screenshots README says.
EAS_METADATA_CLI="eas-cli@27.2.0"

# Globals, so cleanup can still see them when the EXIT trap fires after main.
repo=""
prev=""
staging=""

# Puts the checkout back as it was: no staged screenshots, no stamped file, the
# branch checked out again. Each step runs whatever the one before it did.
cleanup() {
  if [[ -n "$staging" ]]; then
    rm -rf "$staging" || true
  fi
  if [[ -n "$prev" ]]; then
    # A directory pathspec: restores app.json and store.config.json, and
    # doesn't fail at an old tag without the listing config.
    git -C "$repo" checkout -q -- apps/mobile/ || true
    git -C "$repo" checkout -q "$prev" || true
  fi
}

# Stamps the version from the tag into a JSON file (committed as a
# placeholder): .expo.version in app.json, .apple.version in the listing config.
stamp() {
  local file="$1" key="$2" version="$3"
  jq --arg v "$version" "$key = \$v" "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
}

# Pushes the tag's Store listing to the submitted version's draft, as the
# listing job of build-mobile.yml does, skipping the same tags it skips.
push_listing() {
  local tag="$1" version="${1#v}"

  # Older release tags predate metadata as code; they release as before.
  if [[ ! -f "$repo/apps/mobile/store.config.json" ]]; then
    echo "$tag has no apps/mobile/store.config.json; skipping the listing push."
    return
  fi

  stamp "$repo/apps/mobile/app.json" .expo.version "$version"
  stamp "$repo/apps/mobile/store.config.json" .apple.version "$version"
  echo "Listing version: $(jq -r '.apple.version' "$repo/apps/mobile/store.config.json")"

  # Writes the screenshots entries into the stamped config from the tag's
  # Screenshot sets; a tag before the screenshot script pushes text only.
  if [[ -f "$repo/scripts/app-store-screenshots.mjs" ]]; then
    staging="$(mktemp -d)"
    node "$repo/scripts/app-store-screenshots.mjs" prepare "$staging"
  else
    echo "$tag predates the App Store screenshot script; pushing listing text only."
  fi

  if ! (cd "$repo/apps/mobile" &&
    npx --yes "$EAS_METADATA_CLI" metadata:push --profile production --non-interactive); then
    echo "The listing push failed; the build was submitted. Retry just the push with:" >&2
    echo "  scripts/release-ios-local.sh --listing-only $tag" >&2
    exit 1
  fi
}

# Everything runs from main, which bash reads in full first: checking out an
# older tag can change or remove this file while it runs.
main() {
  local listing_only=false tag ipa
  if [[ "${1:-}" == "--listing-only" ]]; then
    listing_only=true
    shift
  fi

  repo="$(git rev-parse --show-toplevel)"
  git -C "$repo" fetch -q --tags origin

  tag="${1:-$(git -C "$repo" tag -l 'v*' --sort=-v:refname | head -1)}"
  if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Tag must look like v1.2.3, got '$tag'" >&2
    exit 1
  fi
  if [[ "$listing_only" == true ]]; then
    echo "Pushing the Store listing of $tag"
  else
    echo "Building $tag"
  fi

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
  trap cleanup EXIT

  git -C "$repo" checkout -q --detach "$tag"

  # Bad App Store screenshots fail the release before a build is spent. The
  # tag's own script, like release CI; older tags predate it.
  if [[ "$listing_only" == false && -f "$repo/scripts/app-store-screenshots.mjs" ]]; then
    node "$repo/scripts/app-store-screenshots.mjs" check
  fi

  # The listing push needs it too: EAS reads the app config (app.config.ts).
  pnpm --dir "$repo" install --frozen-lockfile

  if [[ "$listing_only" == false ]]; then
    stamp "$repo/apps/mobile/app.json" .expo.version "${tag#v}"

    (cd "$repo/apps/mobile" &&
      infisical run --env=prod --path=/Mobile -- \
        eas build --platform ios --profile production --local --output "$ipa")

    (cd "$repo/apps/mobile" &&
      eas submit --platform ios --profile production --path "$ipa")
  fi

  push_listing "$tag"
}

main "$@"
