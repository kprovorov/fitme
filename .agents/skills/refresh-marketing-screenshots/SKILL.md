---
name: refresh-marketing-screenshots
description: Capture and frame Fitme mobile marketing screenshots from the current app on an iOS simulator, including localized screen sets. Use when refreshing the project's iPhone or framed marketing images.
---

# Refresh Fitme marketing screenshots

Work from the current checkout. Read `marketing/screenshots/README.md`, the current captures and `marketing/screenshots/frame.py` first; identify which screens and locales the request covers. The existing set is a reference, not proof the current UI or release configuration is unchanged. Use the device tools and their current instructions for all simulator interaction; inspect the running screens, not just the code. Build the current app in Release for the simulator, with no development overlays, and verify the installed build is from this checkout.

## Prepare the demo

- Use a dedicated Clerk **development** user and a local database. Before running `marketing/screenshots/seed/seed.sql`, inspect it and verify the database target and user: it deletes that user's sessions, plans and profile. Never run it against production or another person's data. Adapt the seed to the current schema and use valid Library cover IDs.
- Run the API and Library with the checkout's local environment. The Library fixture is not suitable for marketing: generate a real exercise bundle from a pointer-only `fitme-exercises` checkout, and configure the public media origin. Confirm images and data actually render. Do not expose credentials in logs or capture real account data.
- Keep the demo coherent and believable. For each localized set, translate the demo plan and workout names as needed, and choose the corresponding app language and regional conventions. Restore simulator settings and temporary demo changes when appropriate. Never reset an existing account's password without confirming it is a dedicated test account; use the available test sign-in workflow, and do not record credentials in the skill or repository.
- Seed enough completed sessions across several weeks for the history chart, streak, weekly goal, monthly totals and rising exercise weights. To show a summary with multiple PRs and the post-workout plan-update prompt, log and finish a workout with at least two actual PRs and a swapped exercise. Verify the visible results; a seeded record alone does not prove the app awarded a trophy or offered an update.
- Arnold screenshots need a working local Arnold service, a model gateway and Pro access on both the server and app. Prefer a dedicated test account with a real test entitlement. If unavailable, an isolated, clearly documented local-only demo fixture may supply the entitlement for that account; never change production entitlements or leave a bypass in the project. Use actual model responses and app-rendered plan cards, and remove the fixture and restore the normal app build after capture. Report the fixture and any language differences in generated content.

## Capture and frame

Use the available simulator and follow the user's device and locale choices. Discover the app's currently supported languages from `appLanguages` in `@fitme/core` and the catalogs in `packages/i18n/src/index.ts`; they can grow. For a request covering all locales, include every supported language and determine its appropriate full locale tag and regional conventions from current project guidance. When the request names specific locales, limit capture and replacement to those locales. Check `apps/mobile/store.config.json` and the screenshot README for App Store locale mappings; an app language, a folder locale tag, and an App Store metadata key may differ. Use `marketing/screenshots/iphone/<locale>/` and matching `framed/<locale>/` directories with descriptive, unnumbered names. Do not silently skip a supported locale when no suitable region, translation, or simulator configuration is available: report the gap. Capture the screen states requested; when refreshing the complete set, use the existing filenames and README as the checklist, accounting for screens that have changed or disappeared. Do not claim coverage for screens you could not reach. Compare matching localized screenshots for equivalent states and inspect each image for loading errors, overlays, keyboard, accidental navigation indicators, clipped text, missing media and stale data. Use a consistent 9:41 status bar with full signal and a full battery shown as **discharged**. The override is per simulator, so target its explicit device ID (not `booted` when multiple devices may be running), verify the visible result, and reapply if necessary after a restart. When the active device-control rules permit `simctl` for settings, use the command below. If they do not, use a supported device control or ask the user to run the command; report any remaining limitation instead of editing the capture to disguise it.

```sh
xcrun simctl status_bar "$SIMULATOR_UDID" override --time "9:41" \
  --dataNetwork wifi --wifiBars 3 --cellularBars 4 \
  --batteryState discharged --batteryLevel 100
```

Set `SIMULATOR_UDID` to the chosen device ID first. Preserve an override the user applied or asked to keep; otherwise restore the prior status-bar setting when finished, using permitted device controls. This setting changes the status-bar display, not the simulator's system clock. A 24-hour region can render the override as `09:41`; verify and document the visible result rather than changing the region without authorization.

The current full-set checklist is: `arnold-generated-plan`, `workout-log-set`, `workout-summary-prs`, `arnold-plan-change`, `exercise-progress`, `next-workout`, `update-plan`, `exercise-video`, `history`, and `arnold-model-picker`. The first Arnold conversation includes the user's goal and a generated plan; the second includes a requested exercise or weight change and Arnold's confirmation. The exercise video includes form tips. Treat this as the current set, not a fixed requirement for a different user request.

Capture each locale from the app itself, including content visible behind sheets and dialogs. Check that the localized scenes match in substance even when model-generated wording differs. Switching simulator languages may require an app relaunch; return the device to its original language preferences after capture. Keep user-applied status-bar overrides intact during that restoration.

Capture at native device resolution. `frame.py` currently accepts 1206×2622 iPhone 18 Pro captures and draws a black illustrated frame, producing a transparent 1332×2748 PNG. Run it directly on the originals; do not resize them to satisfy the generator. If the requested device has a different size, adapt and verify the generator for that device rather than stretching the captures. The frame is an illustration, not an official device asset.

Populate the shell array `locales` with the locale tags selected for this run before framing:

```sh
for locale in "${locales[@]}"; do
  mkdir -p "marketing/screenshots/framed/$locale"
  for f in "marketing/screenshots/iphone/$locale/"*.png; do
    [ -f "$f" ] || continue
    python3 marketing/screenshots/frame.py "$f" "marketing/screenshots/framed/$locale/$(basename "$f")"
  done
done
```

Verify the filename sets across all selected locales and each capture/frame pair, native and framed dimensions, transparency, and unchanged screen pixels away from the rounded corners and drawn island. Visually inspect representative frames and all captures. Update `marketing/screenshots/README.md` and affected references to describe the actual device, build, locales, regional formatting and known limitations. Remove old assets only within the user's requested scope and after their replacements are ready; check references first. The site's `apps/site/public/screens/` files are separate exports, so refresh them only if requested.

Marketing captures are source material, not automatically approved App Store exports. Follow `marketing/screenshots/app-store/README.md` for any explicitly requested App Store work; never push metadata or publish screenshots as an implied consequence of capturing them. Report the paths, coverage, validation and any missing or unverified states.
