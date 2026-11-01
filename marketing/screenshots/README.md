# Fitme iOS marketing screenshots

Real app (Release build, no dev overlays) against a local Supabase stack seeded with a believable account. Captured 2026-10-16 from commit `44e3fb5`, except the shots with a tab bar, which still said Coach: `13-arnold.png` and `14-arnold-models.png` were recaptured 2026-10-25 on the Arnold tab (from a dev client with its tools hidden), and `01-home.png`, `07-history.png`, `08-library-muscle-groups.png`, `09-library-chest.png` and `15-profile.png` 2026-10-25 from commit `77e6808` (Release build, `fitme-exercises` at `1ec0972`). iPhone 17 Pro Max simulator (iOS 26.5, 6.9", 1320×2868), dark mode, status bar overridden to 9:41 / full Wi-Fi and signal / charged battery.

| File | Shows |
| --- | --- |
| `iphone/01-home.png` | Home: active Plan "Upper / Lower — 4 days", the in-progress Upper A with its timer, upcoming workouts |
| `iphone/02-plan.png` | Plan detail: the four Workouts with exercise thumbnails |
| `iphone/03-workout.png` | Plan detail with Upper B expanded: exercise list with set counts |
| `iphone/04-session-active.png` | Active Workout Session mid-workout: bench 4/4, rows 3/4, timer running |
| `iphone/05-session-logging.png` | Logging sets for Barbell Bent-over Row: three sets ticked, the fourth ready to log |
| `iphone/06-session-summary.png` | Finished session summary: duration, volume, sets, muscle map, PR trophies |
| `iphone/07-history.png` | History: finished workouts over the past weeks |
| `iphone/08-library-muscle-groups.png` | Exercise library with the muscle-group menu open |
| `iphone/09-library-chest.png` | Exercise library filtered to Chest |
| `iphone/10-exercise-detail.png` | Exercise detail (Bench Press): animation, summary, instructions |
| `iphone/11-exercise-progress.png` | The User's history for an exercise (bent-over row weights going up week to week) |
| `iphone/12-planner.png` | AI planner input step (goal, experience, duration, place) |
| `iphone/13-arnold.png` | Arnold Conversation, empty state |
| `iphone/14-arnold-models.png` | Arnold model picker |
| `iphone/15-profile.png` | Profile (free plan, upgrade card) |
| `iphone/16-edit-profile.png` | Edit profile with body parameters |
| `iphone/17-onboarding.png` | Onboarding first screen (fresh account) |
| `iphone/18-sign-up.png` | Sign-up screen (fresh install) |

Not captured: the planner's result and an Arnold Conversation with the plan card. Both need Arnold (`apps/arnold`) answering for a Pro User; there was no `apps/arnold/.env.local`/AI Gateway key, and the only RevenueCat project is the real one, so no test entitlement was granted.

`framed/` holds the same 18 shots in a drawn iPhone Pro frame with a Dynamic Island (1458×3006, transparent background), made by `frame.py`:

```sh
for f in marketing/screenshots/iphone/*.png; do python3 marketing/screenshots/frame.py "$f" "marketing/screenshots/framed/$(basename "$f")"; done
```

The site's `apps/site/public/screens/*.png` are the framed shots scaled to 776×1600 with Lanczos (`home` ← `01-home`, `history` ← `07-history`, `library-chest` ← `09-library-chest`, `arnold-models` ← `14-arnold-models`, and so on by name):

```sh
python3 -c "from PIL import Image; Image.open('marketing/screenshots/framed/01-home.png').resize((776, 1600), Image.LANCZOS).save('apps/site/public/screens/home.png', optimize=True)"
```

## App Store upload

**Yes: EAS CLI 27.2.0 supports screenshot uploads from `apps/mobile/store.config.json`.** Verified 2026-11-01 for FIT-500 against the tagged source. Support and non-interactive ASC API-key auth arrived in [18.5.0](https://github.com/expo/eas-cli/blob/v27.2.0/CHANGELOG.md#1850---2026-04-02); [18.6.0](https://github.com/expo/eas-cli/blob/v27.2.0/CHANGELOG.md#1860---2026-04-10) fixed asset uploads stuck in `AWAITING_UPLOAD`. Use 18.6.0 or later for that fix; this investigation verifies 27.2.0 specifically. Release CI pins **27.2.0** in [`build-mobile.yml`](../../.github/workflows/build-mobile.yml); `eas.json`'s `>= 27.2.0` is only a minimum. The [web schema reference](https://docs.expo.dev/eas/metadata/schema/) currently omits screenshots; the [27.2.0 schema](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/schema/metadata-0.json#L319-L328) includes them, and [`createAppleTasks`](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/apple/tasks/index.ts) registers `ScreenshotsTask` for the [upload pipeline](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/upload.ts).

Merge these `screenshots` fields into the existing locale objects, preserving all listing text (the paths below are examples, not approved assets):

```json
{
  "configVersion": 0,
  "apple": {
    "info": {
      "en-US": {
        "screenshots": {
          "APP_IPHONE_67": [
            "store/apple/screenshot/en-US/APP_IPHONE_67/01-en.png"
          ]
        }
      },
      "uk": {
        "screenshots": {
          "APP_IPHONE_67": [
            "store/apple/screenshot/uk/APP_IPHONE_67/01-uk.png"
          ]
        }
      }
    }
  }
}
```

Paths resolve from **`apps/mobile/`**, not the config file's directory. Thus the English example is `apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_67/01-en.png`; this is also the layout `metadata:pull` produces. `apps/mobile/store/` is currently gitignored: the follow-up must explicitly track only the approved images so release checkout contains them; never stage a whole pull export.

Use **`APP_IPHONE_67`** for the 1320×2868 iPhone screenshots. CLI 27.2.0 [pins `@expo/apple-utils` 2.2.1](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/package.json#L47), whose [display-type enum](https://unpkg.com/@expo/apple-utils@2.2.1/ts-declarations/expo__app-store/app-store.d.ts) includes `APP_IPHONE_67` and no `APP_IPHONE_69`. [Apple's specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) accept 1320×2868 for this large iPhone display group and allow **1–10 images per device size and locale**, in PNG/JPG/JPEG format. The EAS schema accepts arbitrary display-type keys and string arrays: it does **not** validate the display type, count, file existence, dimensions or filename pattern. The screenshot task has no additional filename rule; it uses the basename, so keep basenames unique within each set and use numbered names to make the intended order clear.

The [27.2.0 screenshot task](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/apple/tasks/screenshots.ts) syncs each configured, nonempty locale/display-type set:

- Creates a set if missing. Keeps a **completed** remote screenshot when basename and byte size match; it does not compare image contents, so a same-size replacement needs a new filename.
- **Deletes existing screenshots in that set that it does not retain**, including same-name replacements with a different size or incomplete processing. Uploads new files, waits for processing, then reorders by the config array.
- A missing local file keeps an existing completed screenshot with that basename regardless of size. Otherwise it warns and skips the upload; deletions have already happened, so a successful push alone does not prove every image was uploaded.
- Unlisted locales/display types, absent screenshot fields, and empty objects/arrays are skipped. **An empty array does not clear a set.** Today's text-only config leaves screenshots untouched.

[`metadata:push`](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/commands/metadata/push.ts) passes `--non-interactive` through to [metadata authentication](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/auth.ts), which can retrieve the existing submission API key from EAS credentials. Screenshots use the same authenticated app context; no separate screenshot credential is required. Apple still requires metadata permissions: its [asset-management roles](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets) are Account Holder, Admin, App Manager or Marketing. A Developer key that can upload builds alone is not proof of screenshot permission. This investigation does not inspect the stored key's role or test screenshot uploads against ASC.

**2.4.1 timing:** [Release run 41300472511](https://github.com/kprovorov/fitme/actions/runs/41300472511/job/124830211269) checked out `v2.4.1` (`87d55cd28c9c16da2ca6d568e8558b858158087d`); its listing push succeeded at **2026-11-01 11:19:03 UTC / 12:19:03 Madrid**. [The workflow checks out the release tag](https://github.com/kprovorov/fitme/blob/v2.4.1/.github/workflows/build-mobile.yml#L42-L45), so later screenshot commits cannot reach 2.4.1 through that release's CI, including a rebuild of the same tag. [FIT-491's current decision](https://linear.app/provorov/issue/FIT-491/app-store-screenshots-v241) skips 2.4.1 screenshots and targets **2.4.2** through release CI; the earlier manual-upload fallback (FIT-504) is canceled.

Verification: a scratch copy of the current listing with both blocks above passed AJV against the pinned schema; a non-string path was rejected. This proves the config shape only. [`metadata:lint`](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/commands/metadata/lint.ts) has no login context and is designed to avoid service calls, but no metadata command was run, per FIT-500's scope. No credentials or App Store Connect calls were used.

## How to reproduce

1. Local stack for this worktree: `pnpm --filter @fitme/supabase exec supabase start` (prints the API/DB ports), then serve the Library the app reads names and thumbnails from: `LIBRARY_BUNDLE=<path to a real fitme-exercises library.json> pnpm library dev` (the committed fixture only has made-up Exercises, so the seeded slugs would show their slug names). Build that bundle with `pnpm bundle <out>` in a pointer-only clone (`GIT_LFS_SKIP_SMUDGE=1 git clone`): a checkout with the LFS media pulled fails it. Run the API with `pnpm library dev`, not `pnpm dev:library`: turbo drops `LIBRARY_BUNDLE` from the environment and the fixture gets served. Set `SUPABASE_URL` to the production project's origin too, or the thumbnails point at a placeholder project.
2. `apps/mobile/.env`: `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` from that stack, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (Clerk dev instance), `EXPO_PUBLIC_E2E_ENABLED=true` (skips RevenueCat/Segment), `EXPO_PUBLIC_API_URL=http://127.0.0.1:3003` (run `pnpm dev:api` for the Arnold model list), empty `EXPO_PUBLIC_SENTRY_DSN`.
3. Release build for the simulator (ad-hoc signed, or the keychain, and with it Clerk, never loads):
   ```sh
   cd apps/mobile && CI=1 npx expo prebuild --platform ios
   cd ios && SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace FitmeProject.xcworkspace -scheme FitmeProject \
     -configuration Release -sdk iphonesimulator -destination id=<UDID> -derivedDataPath /tmp/fitme-dd \
     CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
   xcrun simctl install booted /tmp/fitme-dd/Build/Products/Release-iphonesimulator/FitmeProject.app
   ```
4. User: Daniel Brooks, created on the Clerk development instance through the Backend API (`POST /v1/users`, primary email `daniel.brooks@fitmeproject.com`, plus a verified `daniel.brooks+clerk_test@fitmeproject.com` so the new-device sign-in code is the test code 424242). Sign in with the `+clerk_test` address. (Registering in-app crashes the Release build in `VerifyCodeView` after the code is submitted, see below.)
5. Seed (local stack only; times are relative to now, so run it on the day you shoot):
   ```sh
   psql "postgresql://postgres:postgres@127.0.0.1:<db port>/postgres" -v user_id=<user_…> -f marketing/screenshots/seed/seed.sql
   ```
   `seed/seed.sql` writes a Profile (male, 29, 182 cm, 81.5 kg), the active 4-day Upper/Lower Plan with real Library slugs, 11 finished sessions over the last 18 days (weights progressing; Mon/Tue/Thu/Fri when shot on a Friday, as the days are counted back from today), and one Upper A session started 35 minutes ago with 7 sets logged.
6. Clean status bar, then shoot each screen: `xcrun simctl status_bar booted override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100` and `xcrun simctl io booted screenshot --type=png <file>`. Navigation was driven with Maestro point taps (Release builds merge accessibility elements, so ids aren't reachable). The 2026-10-25 shots used AXe instead (`axe tap --label History --udid <UDID>`; the muscle-group menu needs `--tap-style physical`), which only touches the given simulator, on a fresh `simctl create` iPhone 17 Pro Max; the password was set through the app's Forgot password flow with the test code.

## Found along the way

- The Release build crashes after a sign-up code is submitted: `Error: Should have a queue. You are likely calling Hooks conditionally` in `VerifyCodeView` (`components/views/verify-code-view.tsx`). Sign-in with a device-trust code works.
