#!/usr/bin/env bash
# Local iOS preview build (ad-hoc, internal distribution) of the current checkout,
# built on this Mac with `eas build --local`, so it doesn't use the EAS Free
# plan's monthly build quota. Nothing is submitted: install the .ipa on a
# registered device (`eas device:create` registers one; EAS adds it to the ad-hoc
# provisioning profile on the next build).
#
# Usage: scripts/preview-ios-local.sh
#
# Builds whatever is checked out, uncommitted changes included (EAS packs them).
# The version stays app.json's 0.0.0 placeholder, which the minimum version gate
# never blocks.
#
# Needs: Xcode, CocoaPods, fastlane, Node 24 and `eas login`. EAS injects the
# `preview` environment's EXPO_PUBLIC_* variables (Public visibility). Its
# SENTRY_AUTH_TOKEN is Secret, which local builds don't get, so the source map
# upload is skipped: no prod secret is needed.
set -euo pipefail

main() {
  local repo sha ipa
  repo="$(git rev-parse --show-toplevel)"
  sha="$(git -C "$repo" rev-parse --short HEAD)"
  ipa="/tmp/fitme-preview-$sha.ipa"

  if ! eas whoami >/dev/null; then
    echo "Run eas login first" >&2
    exit 1
  fi

  pnpm --dir "$repo" install --frozen-lockfile

  cd "$repo/apps/mobile"
  SENTRY_DISABLE_AUTO_UPLOAD=true \
    eas build --platform ios --profile preview --local --output "$ipa"

  echo
  echo "Built $ipa"
  echo "Install it on a connected device: xcrun devicectl device install app --device <device id> $ipa"
  echo "(list devices with: xcrun devicectl list devices)"
}

main "$@"
