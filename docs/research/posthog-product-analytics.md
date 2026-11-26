# PostHog product analytics in the mobile app

> **Decided (2026-11-26), after this note was written:**
>
> - **Region and project: US Cloud, the existing project.** The EU account the site's config points at is old and abandoned, so the site's key and its `/ingest` rewrites (`apps/site/next.config.ts:24-37`, `ui_host` in `apps/site/instrumentation-client.ts`) need to move to the US project and hosts. This settles open decision 1.
> - **Mixpanel history is worth migrating.** Segment forwards the app's events to a Mixpanel project this research couldn't see; import its history into PostHog (section 5). The import needs a paid PostHog plan, and whether the direct import reads Mixpanel's EU API is still **(unverified)**. This settles open decision 2 except for which dashboards to rebuild.
> - **`expo-device` is added**, so events carry the device manufacturer and model. That makes the cut-over release a new native build, not a JS-only change. This settles open decision 10.
> - **Direct SDK, no bridge.** `posthog-react-native` goes in and Segment comes out in the same release, with no dual-send and no Segment → PostHog destination. The minimum version gate is already at the latest release (2.9.0, read from `GET /v1/client-config` on 2026-11-26), so once the cut-over build is out the gate goes up to it and the Segment source goes off. Settles open decisions 3 and 4.
> - **PostHog moves to pay-as-you-go** ($0 base), which unlocks the Mixpanel import.
> - **Every event and property name stays as it is.** The managed Mixpanel import keeps names and offers no remap ([docs](https://posthog.com/docs/migrate/managed-migrations)), so a rename would split every chart at the cut-over date. This overrides section 4's "tidy the property names" and settles open decision 8.
> - **`Set Tracked` loses `reps` and `weight`; `Profile Filled` keeps `age` and `gender`.** Settles open decision 7.
> - **Lifecycle events on, screen events by hand**, named by route template. Settles open decision 9.
> - **Account deletion reaches PostHog:** on `user.deleted`, `apps/webhooks` deletes the person and their events. Settles open decision 11.
> - **No opt-out in this change** (open decision 13). **RevenueCat's integration moves to the US PostHog project** (open decision 14). **The site shares that project**, and its PostHog exception capture goes off.
> - **Person properties:** email, name and measurement system. **App language is not sent**, on events or on the person (first planned as an event property, then dropped). The SDK's own `$locale`, the device's locale, is on every event anyway.
> - **`Workout Started` and `Workout Completed` are added**, with the names and properties (`plan_id`, `workout_id`) the app defined for them in 2025. They lost their last caller on 2025-04-19 (commit `90dbfe67`), two days before the first tagged release, and the dead file went on 2026-10-24 (`dd567184`). So the history holds next to none of them, and these charts begin at the cut-over.
> - **The UUID → User id map is one-to-one:** 158 rows, 158 distinct UUIDs and 158 distinct User ids in production on 2026-11-26.
> - **The import brings everything, once:** all history since April 2025 (v1.5.0; two jobs, since a job covers at most a year), in one pass after the Segment source is off. It carries events only, so people from history get their email, name and measurement system when they next open the new build.
> - **Old and new ids are stitched.** Before the Clerk move (ADR 0001) Segment's user id was the Supabase UUID. After the import each UUID person is merged into its User-id person from the UUID → Clerk id map in `private.retired_user_ids`. Two identified people merge only through a `$merge_dangerously` event, which is irreversible ([docs](https://posthog.com/docs/product-analytics/identify)).
> - **No cleanup of deleted Users after the import.** Production's `private.retired_user_ids` held no deleted id on 2026-11-26 (158 rekeyed rows, none without `rekeyed_to`), so we assume nobody has deleted their account and build nothing for it. The one check left: run that count again when the import runs, since a User who deletes their account before then would come back with the history. Deletions from before ids were retired can't be seen from Postgres and are accepted as unknown.
> - **Preview builds send nothing** (no PostHog key in the EAS `preview` environment). The first real-device check is a TestFlight build into the production project, with the team hidden by PostHog's internal-users filter.
> - **Client IPs are discarded** at the project (Settings → Project → IP data capture). GeoIP country and city are still set first ([docs](https://posthog.com/docs/privacy/data-collection)).
> - **Dashboards start fresh:** no Mixpanel dashboard or report is rebuilt one-to-one.
> - **The old vendors are erased**, not just disconnected, once the import is checked.
> - **No dev project.** The production project is the only one.
> - **The privacy policy** names PostHog in the US in the cut-over release, and keeps naming Segment and Mixpanel until they're erased.
> - **Recorded as ADR 0026** (`docs/adr/0026-product-analytics-go-straight-to-posthog-in-the-us.md`).
> - **Implementation defaults accepted:** one wrapper (`lib/analytics.ts`) with a typed event map, a standalone client, off in `__DEV__` and E2E builds, SDK state in the existing MMKV instance, no reverse proxy, no touch autocapture, no feature-flag preload. Settles open decisions 6 and 12.
> - **Email and name go to PostHog** as person properties on `identify`, as Segment gets them today. This overrides recommendation 6 and my default in open decision 5; the privacy policy keeps naming them, with the vendor swapped.

Research note, 2026-11-26. Question: we want to bring PostHog into the monorepo, and step one is product analytics in `apps/mobile` (Expo SDK 58, expo-router 58, React Native 0.88, React 19 with the React Compiler, Hermes, New Architecture), replacing Segment and Mixpanel. What does that take, what are the options, and which one do I recommend?

Scope: events, identify, screens, funnels and retention. Session replay, feature flags, experiments, surveys, error tracking, LLM analytics and server-side events only get a "later" paragraph each (section 9).

Repo facts are cited as `path:line`. External claims link to the primary source (PostHog's docs, the SDK source at its release tag, npm metadata, Segment's, RevenueCat's, Expo's and Apple's own docs). Anything I couldn't check is marked **(unverified)**. Nothing was installed, run on a device or changed in any live tool. Where PostHog's docs and the SDK source disagree, I say so and follow the source.

## TL;DR

- **Today: 22 `track` calls (19 event names), one `identify`, two `reset`, no screen events.** All go through one Segment client created at import with no `__DEV__` guard (`apps/mobile/lib/segment.ts:1-5`). The `identify` sends the User's **email and name** (`apps/mobile/components/auth-sync.tsx:77`), deliberately: the privacy policy discloses it (`apps/site/app/privacy-policy/page.tsx:495-499`). The "Clerk id only" rule in AGENTS.md is Sentry's, so whether PostHog gets them is a decision, not a fix (open decision 5).
- **The live accounts don't match the repo's story.** The PostHog project I can see is on **US Cloud**, on the Free plan, and has never received an event, while the site posts to the **EU** host (`apps/site/next.config.ts:28-32`). The Mixpanel project I can see holds only RevenueCat's events and Mixpanel's starter board: not one event from the app. The Segment-fed Mixpanel project that `integrations/chatgpt/data-practices.md:29-31` describes is a different one I can't see. So what "replace Mixpanel" must reproduce is **(unverified)**, and region is the first decision.
- **Recommended: the direct SDK, `posthog-react-native`, behind one wrapper module (`lib/analytics.ts`) with a typed event map; Segment removed in the same release.** The SDK is JavaScript only, so with the Expo modules already installed it needs no new native code. Use a standalone client, not `PostHogProvider`.
- **Automatic screen tracking cannot work in this app.** The SDK finds navigation through `require('@react-navigation/native')`, and expo-router 58 vendors React Navigation, so that package isn't installed. Screens are tracked by hand from the root layout, which is also what PostHog's docs say for expo-router.
- **Identity: `identify(<Clerk id>)`, `reset()` on every sign-out.** I recommend no email or name (open decision 5). The SDK default `personProfiles: 'identified_only'` keeps pre-sign-up events anonymous and links them to the User at `identify`, so an install → register funnel works.
- **Cost: free at this size.** 1 million events a month are free; Free plan limits are one project and one year of event retention.
- **Cut-over: old builds keep sending to Segment until the minimum version gate cuts them off**, so Segment → Mixpanel stays on until then. Importing Mixpanel history into PostHog is possible but needs a paid plan (the import itself is free).
- **Removing Segment doesn't free `react-native-get-random-values` for certain.** Segment is what loads that polyfill today, and `nanoid` (used by the Arnold runtime) calls `crypto.getRandomValues` in its React Native build.

## 1. Current state of the repo

### How Segment is wired

- `apps/mobile/lib/segment.ts:1-5` creates the client at import: `createClient({ writeKey: process.env.EXPO_PUBLIC_SEGMENT_WRITE_KEY ?? "" })`. No other option, no `__DEV__` guard, no `debug`. With an empty key the SDK still starts and asks Segment's CDN for settings (`node_modules/@segment/analytics-react-native/src/analytics.ts:379-397`). So a dev build with the key set sends real events; `integrations/chatgpt/data-practices.md:31` says Segment has a second source named Local, presumably for that **(unverified)**.
- SDK defaults in the installed version: app lifecycle events **off**, deep links off (`node_modules/@segment/analytics-react-native/src/constants.ts:9-10`), flush at 20 events or every 30 s (`constants.ts:44-45`).
- `apps/mobile/components/providers.tsx:62` wraps the app in Segment's `AnalyticsProvider`, but nothing calls `useAnalytics`: all 16 call-site files import `segmentClient` directly.
- Packages: `@segment/analytics-react-native` 2.24.2 and `@segment/sovran-react-native` 1.1.5 (`apps/mobile/package.json:46-47`), both with native code, plus `react-native-get-random-values` 2.1.0 (`apps/mobile/package.json:93`).
- Most calls are skipped in E2E builds (`IS_E2E`, `apps/mobile/lib/constants.ts:3`). Four are not (table below).

### The tracking plan today

22 `track` calls, 19 distinct names, 1 `identify`, 2 `reset`. There is no `screen`, `group`, `alias` or `flush` call anywhere in `apps/mobile`.

| Event | Properties | Call site | `IS_E2E` guard |
| --- | --- | --- | --- |
| `User Registered` | none | `apps/mobile/components/views/verify-code-view.tsx:86`, `apps/mobile/hooks/native-social-auth.ts:124-128` | yes |
| `User Logged In` | none | `apps/mobile/components/views/login-view.tsx:40`, `apps/mobile/components/views/verify-code-view.tsx:181`, `apps/mobile/hooks/native-social-auth.ts:124-128` | yes |
| `User Logged Out` | none | `apps/mobile/hooks/mutations/auth.ts:16` | yes |
| `User Deleted Account` | none | `apps/mobile/hooks/mutations/auth.ts:71` | yes |
| `Profile Filled` | `age`, `gender`, `weight_unit` (holds the measurement system) | `apps/mobile/app/onboarding/profile.tsx:79-83` | yes |
| `Plan Saved` | `plan_id`, `source` (`arnold` / `builder`) | `apps/mobile/hooks/queries/plans.ts:183` | yes |
| `Plan Activated` | `plan_id` | `apps/mobile/hooks/queries/plans.ts:184`, `:221` | yes |
| `Plan Edited` | `plan_id` | `apps/mobile/hooks/mutations/plans.ts:41` | yes |
| `Plan Deleted` | `plan_id` | `apps/mobile/hooks/queries/plans.ts:243` | yes |
| `Set Tracked` | `exercise_id`, `reps`, `weight` | `apps/mobile/components/views/workout-session-exercise-set-row-view.tsx:269-273` | yes |
| `Set Removed` | `exercise_id`, `logged`, `session_id` | `apps/mobile/hooks/remove-workout-session-set.ts:208-212` | yes |
| `Exercise Added` | `exercise_slug`, `session_id` | `apps/mobile/app/workout-sessions/[workoutSessionId]/exercise-picker.tsx:186-189` | yes |
| `Exercise Replaced` | `exercise_slug`, `session_id` | `apps/mobile/app/workout-sessions/[workoutSessionId]/exercise-picker.tsx:158-161` | yes |
| `Exercise Deleted` | `exercise_id`, `session_id` | `apps/mobile/components/views/workout-session-view.tsx:90-93` | yes |
| `Workout Discarded` | `logged_set_count`, `source` (`finish_alert` / `menu`) | `apps/mobile/hooks/discard-workout-session.ts:126-129` | yes |
| `Plan Update Suggested` | `add_exercise`, `add_sets`, `remove_exercise`, `remove_sets`, `replace_exercise` (counts), `plan_id`, `workout_id`, `workout_session_id` | `apps/mobile/hooks/finish-workout-session.ts:292-295`, built by `apps/mobile/lib/plan-changes.ts:175-201` | **no** |
| `Plan Update Accepted` | `plan_id`, `workout_id`, `workout_session_id` | `apps/mobile/components/workout-sessions/plan-update-sheet.tsx:300-303` | **no** |
| `Plan Update Declined` | `plan_id`, `workout_id`, `workout_session_id` | `apps/mobile/components/workout-sessions/plan-update-sheet.tsx:316-319` | **no** |
| `Arnold Attachment Sent` | `count` | `apps/mobile/app/(tabs)/arnold/index.tsx:443-445` | **no** |

Identity calls:

- `identify(userId, { email, name })`: `apps/mobile/components/auth-sync.tsx:77`, skipped in E2E (`:61-63`). `userId` is the Clerk id. The email and name are deliberate today: the audit exception for Segment's `deepmerge` names them (`pnpm-workspace.yaml:92-96`).
- `reset()`: `apps/mobile/hooks/mutations/auth.ts:17` (log out) and `:72` (account deleted). Nothing resets when a session ends any other way: `AuthSync`'s sign-out branch clears Sentry, the query cache and RevenueCat but not Segment (`apps/mobile/components/auth-sync.tsx:31-44`).

Things the plan doesn't have:

- No event for starting or finishing a Workout Session. `integrations/chatgpt/data-practices.md:22` lists `Workout Started / Completed` in `apps/mobile/hooks/mutations/workouts.ts`; that file and those events no longer exist, so that note is stale.
- No paywall or purchase event from the app. RevenueCat sends its own to Mixpanel (section 2).
- Property names are inconsistent: `session_id` and `workout_session_id` for the same thing, `exercise_id` (a Workout Session Exercise id) next to `exercise_slug`, and `weight_unit` carrying `metric` / `us` / `uk`.

### Environment variable

- One variable: `EXPO_PUBLIC_SEGMENT_WRITE_KEY` (`apps/mobile/.env.example:36-37`). It lives in Infisical `/Mobile` for dev and in the EAS `production` environment for release builds, which Infisical doesn't sync (`docs/agents/secrets.md:17`, `:81`). I can't see either store, so which builds have it set is **(unverified)**.
- It appears nowhere else: not in `apps/mobile/eas.json`, `apps/mobile/app.config.ts`, any workflow under `.github/`, or `docs/agents/secrets.md`. The E2E workflow builds without it (`.github/workflows/e2e.yml:187-196`).

### Tests

- 61 test files each call `jest.mock("~/lib/segment", …)` with their own stand-in (for example `apps/mobile/__tests__/plan-builder.test.tsx:162`, `apps/mobile/components/__tests__/auth-sync.test.tsx:39-41`). There is no shared mock in `apps/mobile/test-utils/`.
- Tests assert on events in about 20 places, as `[name, properties]` pairs (`apps/mobile/__tests__/plan-builder.test.tsx:487`, `apps/mobile/__tests__/discard-workout-session.test.tsx:721`).

### Where the vendors are named outside code

| Place | What it says |
| --- | --- |
| `apps/site/app/privacy-policy/page.tsx:52-55` | Product analytics (Segment and Mixpanel) receive only the number of photos sent to Arnold |
| `apps/site/app/privacy-policy/page.tsx:493-509` | The app sends analytics to Segment, including account identifiers, **email and name**, age and gender, training events; forwarded to Mixpanel in its EU region |
| `integrations/chatgpt/data-practices.md:13-37`, `:45-46` | The evidence note behind that text; partly stale (above) |
| `packages/observability/src/__tests__/propagation.test.ts:35` | `api.segment.io` must never get trace headers |
| `apps/mobile/app/_layout.tsx:67`, `:78`, `apps/mobile/lib/request-spans.ts:10` | Comments listing Segment among the hosts with no span and no trace header |
| `knip.jsonc:119-121`, `pnpm-workspace.yaml:92-96` | `react-native-get-random-values` as Segment's peer; the `deepmerge` audit exception |
| `docs/adr/0001-clerk-user-id-as-identity-key.md:20` | The Segment user id is the Clerk id |
| `AGENTS.md` | `lib/segment.ts`, `auth-sync.tsx`, the Sentry propagation rules and every `Segment gets …` sentence in Data fetching |
| `apps/mobile/store.config.json` | Only `privacyPolicyUrl`; no vendor named. App Privacy answers live in App Store Connect, not in the repo, so what they declare today is **(unverified)** |

### Site and web

- `apps/site` runs `posthog-js` (`apps/site/package.json:24`, 1.449.2 installed), initialised in `apps/site/instrumentation-client.ts:5-12` with `api_host: "/ingest"` and `capture_exceptions: true`. `/ingest` rewrites to `eu.i.posthog.com` and `eu-assets.i.posthog.com` (`apps/site/next.config.ts:24-37`). Its key is `NEXT_PUBLIC_POSTHOG_KEY` (`apps/site/.env.example:21`). The site also loads Google Tag Manager and Vercel Analytics (`apps/site/app/layout.tsx:47`, `:52`).
- AGENTS.md says fitmeproject.com doesn't serve this app yet, so that setup only sees `fitme-site` deployments.
- `apps/web` has no analytics of any kind (no match for PostHog, Segment, Mixpanel, GTM or Vercel Analytics under `apps/web`).
- "Mixpanel" appears in no manifest and no code: it is only reached through Segment, and through RevenueCat (section 2).

## 2. What the live tools say

Read-only, through the Mixpanel and PostHog MCP connections of this session. Account ids and tokens are left out on purpose.

### Mixpanel

- One organization and one project are visible. The project is **not** the one `integrations/chatgpt/data-practices.md:29-31` describes: different name, different id, different organization. That note's project is the Segment destination; this session can't see it.
- The visible project has 12 event definitions, all from RevenueCat or Mixpanel itself: `rc_initial_purchase_event`, `rc_trial_started_event`, `rc_trial_cancelled_event`, `rc_expiration_event`, `rc_non_subscription_purchase_event`, `paywall_impression`, `paywall_close`, `paywall_cancel`, `paywall_component_interacted`, `$identify`, and the two virtual session events. **None of the app's 19 events is there.**
- Volume: 178 events in the last 90 days by Mixpanel's all-events count. The event list separately shows 107 `$identify` in 30 days, a hidden event that count may leave out.
- Saved content: one dashboard and seven reports, all created by Mixpanel (the Starter Board). No cohorts. No business context configured.

What this means:

- RevenueCat feeds Mixpanel directly, so "replace Mixpanel" includes that integration. RevenueCat has a PostHog integration that sends the same event names, keyed on the RevenueCat app user id unless a `$posthogUserId` attribute is set, with a region choice (US, EU, self-hosted) ([RevenueCat docs](https://www.revenuecat.com/docs/integrations/third-party-integrations/posthog)). The app logs RevenueCat in with the Clerk id (`apps/mobile/components/auth-sync.tsx:67`), so those events would land on the same person. That page also says the integration "Includes Customer Attributes", and its sample events carry a `subscriber_attributes` object. The app gives RevenueCat the email and display name (`apps/mobile/components/auth-sync.tsx:71-75`), so they may reach PostHog that way; which attributes are forwarded is **(unverified)**.
- Whether the Segment-fed project has dashboards, cohorts or reports anyone uses, and how many events it gets, is **(unverified)**. Whether Segment still forwards to it is too.

### PostHog

- One organization, one project, created 2026-10-30, on the **US** host (`us.i.posthog.com`), **Free plan**. It has **never ingested an event**; a 90-day query over `events` returns nothing.
- Free plan limits as the billing tool reports them: 1,000,000 events a month, **1 project**, 1 year of product analytics retention, 5,000 web and 2,500 mobile recordings, 1,000,000 flag requests.
- Project settings that matter later: `anonymize_ips: false`, autocapture not opted out, session recording, console log capture and heatmaps opted in. These are project-side switches for the web SDK; the React Native SDK's own options decide what a mobile build sends (section 3).
- The site posts to the EU host, so its events are not reaching this project. Either a second, EU account exists that this session can't see, or the site's key is this US project's and EU ingestion drops it. **(unverified)** which. So "should mobile share the site's project?" has no project to point at yet.

## 3. `posthog-react-native`: facts

### Package

- Latest is **4.87.3**, published 2026-11-25 09:11 UTC, so it clears pnpm's one-day rule as of this note. Releases come every few days (4.85.0 on 2026-10-29 to 4.87.3), which matters for a repo that pins exact versions ([npm registry](https://registry.npmjs.org/posthog-react-native)).
- It lives in the `PostHog/posthog-js` monorepo under `packages/react-native` and depends on `@posthog/core` ^1.69.2 and `@posthog/types` ([package.json at the tag](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/package.json)).
- Every peer dependency is optional: `expo-file-system`, `expo-application`, `expo-device`, `expo-localization`, `@react-native-async-storage/async-storage`, `@react-navigation/native`, `react-native-device-info`, `react-native-localize`, `react-native-svg`, `react-native-safe-area-context`, `expo-updates`, `@posthog/react-native-plugin`, `posthog-react-native-session-replay` (same file).
- **Pure JavaScript.** PostHog's docs: "For React Native projects built with Expo, there are no mobile native dependencies outside of supported Expo packages" ([docs, Installation](https://posthog.com/docs/libraries/react-native#installation)). Native code only comes with the optional `@posthog/react-native-plugin` (session replay, native crash capture).
- What this app already has: `expo-file-system` 58.0.14, `expo-application` 58.1.2, `expo-localization` 58.0.5, async-storage 2.2.0, `react-native-svg`, `react-native-safe-area-context` (`apps/mobile/package.json:37`, `:60`, `:66`, `:74`, `:100`, `:102`). Not installed: `expo-device`. Without it the SDK still sets `$os_name` and `$os_version` from `Platform`, but not the manufacturer, model or `$is_emulator` ([native-deps.tsx](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/native-deps.tsx)). Adding `expo-device` is the only step that needs a new native build.
- Compatibility: nothing in the package pins React, React Native or Expo versions. The changelog has fixes for Expo SDK 54's file system (4.36.1) and for touch autocapture on the New Architecture (4.84.3) ([CHANGELOG](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/CHANGELOG.md)). I found no statement about Expo SDK 58, RN 0.88 or the React Compiler, so those are **(unverified)** until a build runs it. Hermes: the files I read (`posthog-rn.ts`, `native-deps.tsx`, core) use no `Intl` API and need no `crypto`; I did not read every module, so the rest is **(unverified)**.

### Storage

- `persistence: 'file'` is the default. The SDK picks storage in this order: `customStorage` if given; else `expo-file-system`'s new `File` / `Paths` API when present; else `expo-file-system/legacy`; else async-storage; else it throws ([native-deps.tsx:185-247](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/native-deps.tsx#L185-L247)).
- `expo-file-system` 58 exports `File` and `Paths` (`node_modules/expo-file-system/src/index.ts:1-2`), so by default the SDK writes `.posthog-rn.json` (and `.posthog-rn-logs.json`) into the app's **documents directory** ([storage.ts:7-8](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/storage.ts#L7-L8)), next to the Arnold attachment copies.
- `customStorage` takes `{ getItem, setItem }`, sync or async, and the option's own comment names MMKV ([posthog-rn.ts:177-182](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L177-L182)). So the app's existing MMKV instance (`apps/mobile/lib/mmkv.ts`) can hold the queue and ids instead of a file.

### Setup

- A standalone client is supported and documented: `new PostHog(token, { host })` in its own module, imported wherever needed, optionally handed to the provider as `client` ([docs, Without the PosthogProvider](https://posthog.com/docs/libraries/react-native#without-the-posthogprovider); [posthog-rn.ts:447-482](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L447-L482)). That fits an app that tracks from hooks and mutations.
- `PostHogProvider` adds three things: context for `usePostHog`, touch autocapture, and the navigation hook. It also wraps the tree in its own `<View style={{ flex: 1 }}>` ([PostHogProvider.tsx:261-272](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/PostHogProvider.tsx#L261-L272)). This app needs none of the three (below), so it doesn't need the provider.
- `host` defaults to US; EU is `https://eu.i.posthog.com` ([core types.ts:1-7](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/types.ts#L1-L7)).
- Flushing: at 20 events or every 10 s, batches of up to 100, queue of up to 1000 with the oldest dropped first ([docs, Configuration options](https://posthog.com/docs/libraries/react-native#configuration-options)). It also flushes and persists on every `AppState` change ([posthog-rn.ts:607-648](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L607-L648)).
- Offline: events queue on the device, survive a restart with file persistence, and flush when the device is online again ([docs, Offline behavior](https://posthog.com/docs/libraries/react-native#offline-behavior)).
- Turning it off: `disabled: true` makes every call a no-op; `defaultOptIn: false` with `optIn()` / `optOut()` is the consent switch ([docs, Opt in/out](https://posthog.com/docs/libraries/react-native#opt-inout)). The docs' prose calls the option `disable`; the source and the docs' own example say `disabled` ([core types.ts:34-39](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/types.ts#L34-L39)).
- An empty token does not throw: the SDK logs `console.error` and disables itself ([posthog-rn.ts:482-486](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L482-L486)). In a dev build a `console.error` is a LogBox toast, so a wrapper should not construct the client without a key.
- At start the client fetches remote config, and feature flags unless told not to ([posthog-rn.ts:692](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L692); `preloadFeatureFlags`, `disableRemoteFeatureFlags` in [core types.ts](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/types.ts)). Flag requests are a billed product with their own free tier.

### What is captured without asking

- **App lifecycle events, on by default since 4.39.0:** `Application Installed`, `Application Updated`, `Application Opened`, `Application Became Active`, `Application Backgrounded` ([posthog-rn.ts:189-196](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L189-L196)). Segment's are off today, so these are new events and new volume: a few per app open.
- **Screens: on by default in the provider, but not for expo-router.** The hook needs `@react-navigation/native` ([OptionalReactNativeNavigation.ts](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/optional/OptionalReactNativeNavigation.ts)); when the `require` fails it becomes a no-op ([useNavigationTracker.ts:109-111](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/hooks/useNavigationTracker.ts#L109-L111)). This repo has no `@react-navigation/native` in `node_modules`: expo-router 58 ships its own copy as `expo-router/react-navigation` (`apps/mobile/components/providers.tsx:5`). PostHog's docs agree: for expo-router, follow Expo's screen tracking guide and call `posthog.screen(pathname, params)` yourself ([docs, With expo-router](https://posthog.com/docs/libraries/react-native#with-expo-router); [Expo docs](https://docs.expo.dev/router/reference/screen-tracking/)). The docs also warn that automatic tracking can throw on React Navigation 7.
- **Touches: off by default** (`captureTouches`), and when on they capture `testID`, `accessibilityLabel` and text children of the touched tree ([types.ts:46-86](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/types.ts#L46-L86)). Leave it off: the app's text includes Workout names and weights.
- **Exceptions: off by default.** The docs' autocapture list includes `$exception`, but the source resolves `errorTracking.autocapture` to `false` unless set ([error-tracking/index.ts:391](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/error-tracking/index.ts#L391)). Sentry stays the error tool, so leave it unset.
- **Session replay: off by default** (`enableSessionReplay`) and needs the native plugin.
- **Properties on every event:** `$app_version`, `$app_build`, `$app_name`, `$app_namespace`, `$device_type`, `$os_name`, `$os_version`, `$locale`, `$timezone`, `$screen_width`, `$screen_height`, `$lib`, `$lib_version`, a session id, and with `expo-device` the manufacturer and model ([native-deps.tsx](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/native-deps.tsx)). No advertising id.

### Identity

- Before `identify`, events carry an anonymous id the SDK generates (UUID v7 from `Math.random`, no crypto needed: [uuidv7.ts:412](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/vendor/uuidv7.ts#L412)).
- `identify(distinctId, properties)` sends an `$identify` event carrying the anonymous id, which merges the anonymous person into the identified one; earlier anonymous events are then attributed to the User ([core identify](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/posthog-core.ts#L377-L446); [docs](https://posthog.com/docs/product-analytics/identify#how-identification-works)). That is the same shape as Segment's anonymous id → user id.
- Properties passed to `identify` are person properties (`$set`; `$set_once` for first-value-wins). They can also ride on any event ([docs](https://posthog.com/docs/libraries/react-native#setting-person-properties)). `$set` values aren't stored on the event itself.
- `reset()` clears the distinct id, anonymous id and person properties, and keeps the event queue, the installed app version (so `Application Installed` doesn't fire again) and the device id ([posthog-rn.ts:1233-1260](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L1233-L1260)). PostHog "strongly recommend" calling it on logout ([docs](https://posthog.com/docs/product-analytics/identify#reset-on-logout)).
- Without a `reset()`, an `identify` with a different id reuses the anonymous id the device already holds, which belongs to the previous User, as the id to merge (same core code: `$anon_distinct_id` is read from storage). What the server then does with it is **(unverified)**; PostHog's guidance is simply to reset. So the reset belongs where every sign-out is seen, `AuthSync`'s sign-out branch, not only in the two mutations that call it today.
- `alias` exists for attaching a second id to one person. The app has one id per User, so it isn't needed.
- **Person profile modes** (`personProfiles`, default `identified_only`): `always` creates a profile for anonymous users too, `identified_only` creates one at `identify`, `never` makes `identify` a no-op ([core types.ts:239](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/types.ts#L239)). With `identified_only`, pre-sign-up events are anonymous events: they work in trends and funnels, but can't be filtered by person properties or put in cohorts until the User is identified ([docs, anonymous vs identified](https://posthog.com/docs/data/anonymous-vs-identified-events)). Events after `identify` are identified events until `reset()`.
- A `personProfiles` change only reaches Users on the build that carries it (same page, Mobile SDK version considerations).

### Privacy

- **IP and location.** PostHog receives the client IP with every event. A project can discard it before storage, and new projects in an **EU** organization discard it by default; GeoIP properties are still added before the IP is dropped unless the GeoIP transformation is disabled or the event carries `$geoip_disable` ([docs, IP data capture](https://posthog.com/docs/privacy/data-collection#ip-data-capture)). The SDK option `disableGeoip: true` sets that flag on every event ([core types.ts:178](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/types.ts#L178)). The visible US project stores IPs today (section 2).
- **EU hosting.** PostHog Cloud EU is hosted in Frankfurt and is what PostHog recommends for GDPR ([docs](https://posthog.com/docs/privacy/gdpr-compliance)).
- **Moving regions later is not self-serve.** A project can move between organizations in the same region from settings; a cross-region move needs the Scale or Enterprise plan and a PostHog engineer ([docs, Moving projects](https://posthog.com/docs/settings/projects)). The alternative is a new project in the other region plus a historical import, which needs a paid plan ([docs](https://posthog.com/docs/migrate/migrate-between-cloud-and-self-hosted)). With zero events in the US project today, picking the region now costs nothing; picking it after launch does.
- **Deleting a User's data.** There is an API: `POST /api/projects/:id/persons/bulk_delete` takes `distinct_ids` with `delete_events: true`, answers 202 and deletes in the background; events are removed asynchronously (weekends on Cloud), and backups keep them about two weeks longer ([docs, Data deletion](https://posthog.com/docs/privacy/data-storage#data-deletion)). It needs a **personal API key**, a real secret, so it belongs in `apps/webhooks` beside `deleteUserData`, not in the app. Using the Clerk id as the distinct id is what makes this a one-call deletion.
- Two caveats from the same page: anonymous events that were never linked to a person (after a `reset()`) aren't covered by person deletion, and PostHog advises against reusing a deleted distinct id. Clerk ids aren't reused, so the second doesn't bite.
- Today nothing deletes a User's analytics on account deletion: `reset()` only clears the device (`integrations/chatgpt/data-practices.md:27`).
- **Apple's App Privacy label.** Data sent to "analytics tools, advertising networks, third-party SDKs" counts as collected and must be declared, with its purpose and whether it is linked to the User ([Apple](https://developer.apple.com/app-store/app-privacy-details/)). For this plan that is at least Product Interaction, User ID and Fitness (reps and weights in `Set Tracked`), purpose Analytics, linked to the User. Swapping the vendor doesn't change the data types unless the email and name are dropped from analytics. RevenueCat still receives both (`apps/mobile/components/auth-sync.tsx:71-75`), so they stay on the label either way. The answers are edited in App Store Connect without an app update (same page).
- **App Tracking Transparency is not required.** Apple defines tracking as linking app data with other companies' data for advertising, or sharing it with a data broker ([Apple](https://developer.apple.com/app-store/user-privacy-and-data-use/)). First-party product analytics keyed on our own account id is neither, and the SDK reads no advertising id.

### Reverse proxy

- PostHog's proxy docs are about ad blockers, which block known analytics domains, and estimate 10-30% more events captured on the web. They say a proxy isn't needed to start ([docs](https://posthog.com/docs/advanced/proxy)). They say nothing specific about native apps.
- A native app isn't subject to browser extensions. DNS-level blockers (the docs name NextDNS and Pi-hole) do block a phone's requests to `*.posthog.com`. So for mobile a proxy is optional: it recovers the DNS-blocker minority and keeps the vendor's host out of the app's traffic, at the cost of one more host to run. The Free plan includes managed reverse proxies (billing tool, section 2).
- If one is added later, the host goes in an env variable, so old builds keep posting to the old host. It doesn't have to be decided now.

### Pricing

- Product analytics: first 1,000,000 events a month free, then $0.00005 per event, falling with volume ([pricing](https://posthog.com/pricing)).
- Identified events are an add-on priced per event on top (first 1,000,000 free, then $0.000198). PostHog says anonymous events "can be up to 4x cheaper than identified ones" ([docs](https://posthog.com/docs/data/anonymous-vs-identified-events)).
- Free plan: 1 project, 1 year of retention, community support. Pay-as-you-go: $0 base, the same free tiers, 6 projects, 2 years of retention ([pricing](https://posthog.com/pricing); [events retention](https://posthog.com/docs/data/events-retention)).
- For scale: the only volume I could measure is RevenueCat's 178 events in 90 days. The app's own volume is **(unverified)**, but an app this size is far inside the free tier either way.

### Under Jest and in `__DEV__`

From reading the source; nothing was run.

- The constructor registers an `AppState` listener it never removes, resolves storage, and starts a remote-config fetch ([posthog-rn.ts:607](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L607), [`:692`](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/react-native/src/posthog-rn.ts#L692)). The source's own comment warns that constructing instances in tests accumulates listeners. Its flush timer is unref'd ([core utils](https://github.com/PostHog/posthog-js/blob/posthog-react-native%404.87.3/packages/core/src/utils/index.ts#L127-L134)), so it shouldn't hold Jest open, but a real client in a test would still hit `fetch`.
- So tests should never load the real SDK. With a wrapper module, one stand-in in `apps/mobile/test-utils/setup.ts` (as `@sentry/react-native` has) covers every file, and the 61 per-file mocks go away.
- In dev builds PostHog's own advice is `disabled: __DEV__` ([docs](https://posthog.com/docs/libraries/react-native#disabling-for-local-development)). The Free plan has one project, so there is no separate dev project to send to.

## 4. Naming

- PostHog's guide suggests lowercase `snake_case`, present-tense verbs from a fixed list, and `category:object_action` for events; `object_adjective` for properties, `is_` / `has_` for booleans ([docs](https://posthog.com/docs/product-analytics/best-practices#3-implement-a-naming-convention)). The SDK page separately suggests `[object] [verb]`, such as `user signed up` ([docs](https://posthog.com/docs/libraries/react-native#capturing-events)). It is guidance; nothing enforces it.
- PostHog's own lifecycle events are Title Case (`Application Opened`), RevenueCat's are `rc_snake_case`. A project will hold mixed styles whatever we do.
- The app's names are consistent Title Case `Noun Verbed`. Renaming them breaks continuity with any imported Mixpanel history and with events old builds keep sending through Segment.
- My view: **keep the event names; fix the property names once, at cut-over** (`workout_session_id` everywhere, `measurement_system` instead of `weight_unit`, `workout_session_exercise_id` where that's what it is), because the typed event map makes this the cheap moment and the visible Mixpanel project has nothing built on them. If the unseen project has reports that use them, map the old names at import instead.
- `pnpm text-check` won't flag any of this. It only reads JSX text, text props, object properties and `Alert` arguments; a function's argument never counts, so `track("Plan Saved", …)` is invisible to it. The one trap: an object property whose **name** is in its text list (`title`, `label`, `message`, `text`, `description`, `subtitle`, `hint`, `placeholder`, or ending in `Title`, `Label`, `Text`, `Message`, `Hint`, `Placeholder`) with a string literal value is flagged (`packages/i18n/src/text-check.ts:70-100`, `:213-226`). No current event property has such a name; keep it that way.

## 5. Migration

### Importing Mixpanel history

- PostHog has a managed migration for Mixpanel: it exports through Mixpanel's API with a service account or project secret, maps events and properties to PostHog's schema, marks them `historical_migration`, and can generate `$identify` events to link device ids to user ids ([docs](https://posthog.com/docs/migrate/managed-migrations)).
- Limits it states: no deduplication (a re-run duplicates), no enrichment, and large exports need an S3 import instead. Direct imports are "less reliable than S3 imports for some datasets".
- It needs a **paid plan**; the import itself is free ([docs](https://posthog.com/docs/migrate/mixpanel)).
- Identity: Mixpanel's `distinct_id` is used as is. Segment sent the Clerk id as the user id, so imported events should land on the same person as new ones. Whether the unseen project's distinct ids really are Clerk ids is **(unverified)**.
- The Segment-fed project is in Mixpanel's EU region (`integrations/chatgpt/data-practices.md:29`). PostHog's page doesn't say whether the direct import can read Mixpanel's EU API, so that is **(unverified)**; the S3 import with the `mixpanel` content type is the fallback.
- Whether there is history worth importing is the open question from section 2.

### Cut-over options

|  | (a) Direct SDK, Segment removed | (b) PostHog as a Segment destination first | (c) Both SDKs for one release |
| --- | --- | --- | --- |
| App release needed | yes | no | yes |
| What PostHog gets | everything the SDK offers | `track`, `identify`, `page`, `alias` only | everything |
| Sessions, lifecycle, screens | yes | no: events arrive from Segment's servers | yes |
| Email and name (if dropped, open decision 5) | gone at once | forwarded unless filtered in Segment | gone from PostHog; still sent to Segment |
| Old builds' events in PostHog | no | yes | no |
| Segment's native deps | removed | stay | stay one more release |

- (b) in detail: Segment lists PostHog as a partner-owned destination that accepts Page, Alias, Identify and Track ([Segment docs](https://www.twilio.com/docs/segment/connections/destinations/catalog/posthog)); PostHog's page for the same integration also lists screen and group ([PostHog docs](https://posthog.com/docs/libraries/segment)). The two disagree; treat screen and group as **(unverified)**. Segment's React Native device-mode plugins are for bundled vendor SDKs, and PostHog isn't in that list ([Segment docs](https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/mobile/react-native/destination-plugins)), so this is cloud-mode only. PostHog's page says the simple destination can't do autocapture, replay, flags or surveys.
- (b) keeps Segment as a permanent dependency, which is the opposite of the goal. Its one real use is as a **bridge**: switched on the day the new build ships, it brings old builds' events into PostHog until the gate cuts them off, with no double counting, because new builds no longer talk to Segment.
- (c) lets the two tools be compared event for event for a release, and costs carrying both SDKs, the polyfill question and the email-and-name `identify` for that long. With no reports to validate against in the visible Mixpanel project, there is little to compare.
- **Old builds.** Every build already in Users' hands sends to Segment until the minimum version gate blocks it. `MIN_APP_VERSION` was `2.2.0` when `docs/agents/secrets.md:82` was written (2026-10-27), and AGENTS.md mentions a later minimum of 2.6.1; the live value is in Vercel, so today's is **(unverified)**. The latest tag is `v2.9.0`. So Segment → Mixpanel stays on after the new build ships, and Segment's source is switched off only once the gate is raised past the cut-over version. During that window the numbers are split across two tools unless the bridge is on.

### What removing Segment touches

- Dependencies: `@segment/analytics-react-native`, `@segment/sovran-react-native`, and the `deepmerge` audit exception (`pnpm-workspace.yaml:92-96`).
- **`react-native-get-random-values` is not safely removable yet.** Segment is the only thing that loads it (`node_modules/@segment/analytics-react-native/src/uuid.ts:9`); no app file imports it. `nanoid`'s React Native entry is its browser build, which calls `crypto.getRandomValues` (`node_modules/nanoid/package.json` exports, `node_modules/nanoid/index.browser.js:4`), and the Arnold runtime pulls `nanoid` in (`apps/mobile/package.json:144` lists it for Jest). PostHog itself doesn't need it. Whether Hermes on RN 0.88 provides `crypto.getRandomValues` natively is **(unverified)**. Safe path: keep the dependency and import it explicitly in `apps/mobile/polyfills.js` in the same change, then test dropping it separately on a device. `knip.jsonc:119-121` and the AGENTS.md sentence about it change with that.
- async-storage stays: `react-query-external-sync` uses it (`apps/mobile/components/providers.tsx:2`, `:28`).
- Env: `EXPO_PUBLIC_SEGMENT_WRITE_KEY` out of `.env.example`, Infisical `/Mobile` and the EAS `production` environment; two new ones in, for example `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST`, in the same three places. A PostHog project key is public by design, but it takes the same path. Leave both unset in the E2E workflow and the `e2e-simulator` EAS profile, as the Segment key is today.
- Code and tests: `lib/segment.ts`, `AnalyticsProvider` in `providers.tsx`, 16 call-site files, 61 test files' mocks.
- Docs: the privacy policy's two passages, `integrations/chatgpt/data-practices.md`, the propagation test's Segment host (swap in the PostHog host: it must not get trace headers either), the Segment comments in `_layout.tsx` and `request-spans.ts`, ADR 0001's sentence, AGENTS.md.
- App Store Connect: the App Privacy answers, if email and name are dropped from analytics.

## 6. Site and web

- PostHog "strongly recommend" one production project for the apps and the marketing site, so a journey from site to product is one person's history, and separate projects only for unrelated products or internal tools ([docs](https://posthog.com/docs/settings/projects)). Projects share one bill and one free allowance. The Free plan allows one project anyway.
- So: one project for site, mobile and later web, in one region. Tell them apart by `$lib` and `$app_namespace` on events, or by a super property.
- Cross-platform identity works through the distinct id. `apps/web` signs Users in with Clerk, so `identify(<Clerk id>)` there puts web and mobile events on one person. The site has no login, so its visitors stay anonymous; linking a site visit to a later app install needs something carried across the store, which is out of scope.
- The site's setup needs its own look once the region is settled: it points at EU while the only visible project is US, and it turns on PostHog exception capture (`apps/site/instrumentation-client.ts:8`) although Sentry is the error tool there too.

## 7. Recommendation

1. **Settle the region and project first** (open decision 1). Everything else hangs off the key and host.
2. **Option (a): `posthog-react-native`, pinned exactly, with Segment removed in the same release.** Add `expo-device` only if device model matters; without it there is no native change at all.
3. **One wrapper module, `apps/mobile/lib/analytics.ts`, as the one way to send analytics**, like `lib/toast.tsx` and `lib/external-links.ts`:
   - `track(name, properties)` typed from one event map, so a wrong name or property fails the typecheck, and the tracking plan is one file instead of a grep.
   - `identify(userId)`, `reset()`, `screen(name)`.
   - The only importer of `posthog-react-native`. It builds the client only with a key, outside `__DEV__` and outside E2E; otherwise every function is a no-op. That also moves the `IS_E2E` check out of the 18 `track` calls that carry it and closes the four that lack one.
   - Tests: one stand-in in `test-utils/setup.ts` that records calls; a test reads them back. No test loads the SDK.
4. **Standalone client, no `PostHogProvider`.** Options: the region's `host`, `captureAppLifecycleEvents: true`, default `personProfiles`, `customStorage` on the existing MMKV instance (open decision 6), no touch autocapture, no error tracking, no replay. Consider `preloadFeatureFlags: false` until flags are used.
5. **Screens by hand from the root layout**, named by route template (`/plans/[planId]`), never the concrete path, so ids don't become screen names. `useSegments()` gives the template: its segments keep the brackets (`node_modules/expo-router/build/hooks/useSegments.d.ts:20-37`). It is the same idea as the route-named Sentry request spans (`apps/mobile/lib/request-spans.ts`).
6. **Identity: the Clerk id as the distinct id.** `identify(userId)` from `AuthSync`; `reset()` in `AuthSync`'s sign-out branch so every sign-out is covered. I recommend sending no email and no name, as Sentry already does: less personal data at a new vendor, and a shorter privacy policy passage. The cost is that a User can't be looked up by email in PostHog (open decision 5).
7. **Keep event names, tidy property names** (section 4).
8. **Leave Segment → Mixpanel running** until the minimum version gate passes the cut-over build, then switch the Segment source off. Point RevenueCat's integration at PostHog in the same window, once it is clear whether it forwards the email and name (section 2).
9. **Same PR:** privacy policy text, `data-practices.md`, the propagation test, AGENTS.md. Separately: App Privacy answers.

## 8. Risks I couldn't close

- No build has run this SDK on Expo SDK 58 / RN 0.88 / the React Compiler **(unverified)**. It is plain JS with optional requires, so the risk is small, but the first step of the work should be a dev build that sends one event.
- `crypto.getRandomValues` after Segment goes (section 5).
- The SDK releases every few days; with exact pins, Dependabot's mobile group doesn't cover it (`posthog-react-native` isn't an `expo*` package), so bumps are by hand.

## 9. Later, out of scope

Each is a separate decision. What choosing now constrains:

- **Session replay.** Needs `@posthog/react-native-plugin` (native code, a prebuild). CocoaPods' specs repo goes read-only on 2026-12-02, after which new `posthog-ios` versions only ship through Swift Package Manager; PostHog documents a hybrid setup and says its full-SPM path isn't verified for Expo ([docs](https://posthog.com/docs/libraries/react-native#choose-an-ios-dependency-path-for-the-native-plugin)). Replays live in the same project and region as events, so the region choice binds them. The screens show body weight, training data and Arnold photos, so masking would need its own design.
- **Feature flags and experiments.** Evaluated against the same distinct id, so the Clerk-id decision carries over. Flag requests are billed separately. `disableRemoteFeatureFlags` can't be toggled at runtime, so don't ship it as `true` if flags are wanted from old builds later; `preloadFeatureFlags: false` is the softer switch.
- **Surveys.** Need `PostHogSurveyProvider`, so the provider comes back for that; it accepts the standalone client.
- **Error tracking.** Off in the SDK unless configured. Keep it off; Sentry stays. The site's `capture_exceptions: true` is the one place PostHog error capture is on today.
- **LLM analytics.** Would be server-side in `apps/arnold`. Arnold's trace policy exports no Conversation content outside local development, and PostHog keeps AI event bodies 30 days even after a person is deleted ([docs](https://posthog.com/docs/privacy/data-storage#what-deleting-a-person-doesnt-remove)), so it needs a privacy decision of its own.
- **Server-side events** (`apps/api`, `apps/arnold`, `apps/mcp`, `apps/webhooks`). Mobile analytics only sees what happens in the app: a Plan created through MCP or Arnold is invisible to it. If that matters later, the servers capture with the same Clerk id and the same event names plus a source property, which is one more reason to fix names now. The account-deletion call (section 3) is the first server-side piece and needs a personal API key in Infisical `/Webhooks`.

## 10. Open decisions

1. **Region and project.** EU (matches the site's config, the privacy policy's "EU data region" wording, and IP discarding by default) or US (the project that exists)? Is there an EU PostHog account already, and which key does the site use?
2. **Is there anything in the Segment-fed Mixpanel project to keep?** Dashboards, reports or cohorts to rebuild, and history to import. An import needs a paid plan (no charge for the import itself).
3. **Bridge or not.** Turn on Segment's PostHog destination for old builds until the gate cuts them off, or accept a split until then? If yes, the email and name must be filtered before PostHog.
4. **When to raise the minimum version gate** past the cut-over build, which is what lets Segment be switched off.
5. **Person properties, email and name first.** Segment gets both today, on purpose. Send them to PostHog too (a User can be found by email, as in Mixpanel), or drop them (my default: the Clerk id only, and the privacy policy says less)? Other candidates that aren't personal data: measurement system, App language, Pro or Free.
6. **Where the SDK keeps its queue and ids:** the default file in the documents directory, or MMKV through `customStorage`.
7. **`Profile Filled`'s `age` and `gender`, and `Set Tracked`'s `reps` and `weight`:** keep sending them as they are, bucket them, or drop them? They are what puts Fitness data and demographics in the analytics column of the privacy policy and the App Privacy label.
8. **Rename properties at cut-over** (section 4), or keep them exactly for continuity?
9. **Lifecycle and screen events:** take both (new data, more volume), or start with the 19 events only?
10. **`expo-device`:** add it for device model, or go without and ship no native change?
11. **Account deletion:** should `apps/webhooks` delete the person in PostHog on `user.deleted`, and is doing nothing acceptable until that ships? Same question for the data already in Segment and Mixpanel.
12. **Reverse proxy for mobile:** skip for now (my default), or route through our own domain from the start?
13. **Consent.** The app sends analytics to every User with no opt-out today. Keep that, or add an opt-out (`optOut()` is one call) with this change?
14. **RevenueCat → PostHog.** Move that integration with Mixpanel's retirement? If yes, first check whether it forwards the email and display name the app gives RevenueCat, and whether the app should stop giving them.
