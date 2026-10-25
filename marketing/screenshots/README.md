# Fitme iOS marketing screenshots

Real app (Release build, no dev overlays) against a local Supabase stack seeded with a believable account. Captured 2026-10-16 from commit `44e3fb5`, iPhone 17 Pro Max simulator (iOS 26.5, 6.9", 1320×2868), dark mode, status bar overridden to 9:41 / full Wi-Fi and signal / charged battery.

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
| `iphone/13-arnold.png` | Arnold chat, empty state |
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

## How to reproduce

1. Local stack for this worktree: `pnpm --filter @fitme/supabase exec supabase start` (prints the API/DB ports), then serve the Exercise Library the app reads names and thumbnails from: `LIBRARY_BUNDLE=<path to a real fitme-exercises library.json> pnpm dev:exercises` (the committed fixture only has made-up Exercises, so the seeded slugs would show their slug names).
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
   `seed/seed.sql` writes a Profile (male, 29, 182 cm, 81.5 kg), the active 4-day Upper/Lower Plan with real Exercise Library slugs, 11 finished sessions over the last 18 days (Mon/Tue/Thu/Fri, weights progressing), and one Upper A session started 35 minutes ago with 7 sets logged.
6. Clean status bar, then shoot each screen: `xcrun simctl status_bar booted override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100` and `xcrun simctl io booted screenshot --type=png <file>`. Navigation was driven with Maestro point taps (Release builds merge accessibility elements, so ids aren't reachable).

## Found along the way

- The Release build crashes after a sign-up code is submitted: `Error: Should have a queue. You are likely calling Hooks conditionally` in `VerifyCodeView` (`components/views/verify-code-view.tsx`). Sign-in with a device-trust code works.
