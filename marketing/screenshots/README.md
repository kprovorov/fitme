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
   psql "postgresql://postgres:postgres@127.0.0.1:<db port>/postgres" -v user_id=<user_…> -v open_session=off -f marketing/screenshots/seed/seed.sql
   pnpm --filter @fitme/db exec tsx ../../marketing/screenshots/seed/initialize-personal-records.mts <user_…>
   ```
   Run both commands from the repository root, for the same fictional Clerk **development** User. SQL replaces only that User's Profile, Plans and sessions (including their children), Weekly goal log, retained Personal records and PR initialization marker. The PR script discovers this worktree's local Supavisor pooler and ignores any inherited `FITME_DATABASE_URL`; it calls the real `initializePersonalRecords` service inside `asUser`. Run it after **every** SQL reseed. Repeating the PR step alone returns `alreadyInitialized: true` without changing awards.

   The fixture contains the metric Profile (male, 29, 182 cm, 81.5 kg), the active “Upper / Lower — 4 days” Plan, real Library slugs, and four real Library Cover ids. Serve a real Library bundle with Covers (and set the mobile app's `EXPO_PUBLIC_LIBRARY_URL` to it); the committed fixture bundle cannot supply these photos. It records a Weekly goal of 4 before the oldest seeded week, then four finished sessions per completed Madrid calendar week for **nine weeks**, plus this week's elapsed Mon/Tue/Thu/Fri training days. No finished session is in the future, including when seeding just after midnight. Weights rise gently toward today's Plan targets; Bent-over Row rises from about 55 kg toward 67.5 kg. The rotation ends with Lower B, leaving Upper A next.

   Use `-v open_session=off` for the Workout carousel's **Preview/Start** shot (06). Use `-v open_session=on`, or omit the variable (the default is `on`), for an Upper A session started 35 minutes ago, with bench 4/4 and rows 3/4 logged. Its 82.5 kg bench and 70 kg row beat the entire finished History, so finishing it through the app/API earns at least **two retained PRs** (03). Reseed and replay PRs between takes to restore this state. For **“Update your plan?”** (07), add one extra bench set in the active session, log it, then finish: this produces an `add_sets` Plan Update. Merely increasing a weight does not trigger that sheet.

   **Streak boundary:** the API currently bounds streaks by its server-owned tracking release (`2026-10-31T00:00:00Z`). Backdated SQL alone cannot make `GET /v1/weekly-goals` return a four-week streak on November 1. The seeded data supports nine completed successful weeks and eight fully tracked chart columns, verified using `getWeeklyGoals`' existing historical-fixture seam. Capturing the streak badge before four post-release weeks have elapsed requires a separately agreed local API override; this seed does not change that production safeguard.

   Regression check (Docker stack running; no Clerk token required):
   ```sh
   TZ=Europe/Madrid pnpm --filter @fitme/services exec vitest run --config vitest.integration.config.ts integration/screenshot-seed.test.ts
   ```
   This checks identical per-table counts after two SQL+PR runs, unchanged rows for another fictional User, the chart/goals, retained awards, and finishing the optional session through the same service as the Public API.
6. Clean status bar, then shoot each screen: `xcrun simctl status_bar booted override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100` and `xcrun simctl io booted screenshot --type=png <file>`. Navigation was driven with Maestro point taps (Release builds merge accessibility elements, so ids aren't reachable). The 2026-10-25 shots used AXe instead (`axe tap --label History --udid <UDID>`; the muscle-group menu needs `--tap-style physical`), which only touches the given simulator, on a fresh `simctl create` iPhone 17 Pro Max; the password was set through the app's Forgot password flow with the test code.

## Found along the way

- The Release build crashes after a sign-up code is submitted: `Error: Should have a queue. You are likely calling Hooks conditionally` in `VerifyCodeView` (`components/views/verify-code-view.tsx`). Sign-in with a device-trust code works.
