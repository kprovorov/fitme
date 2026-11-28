# Data-practice evidence for the ChatGPT listing

Inspected on 2026-10-13; the mobile analytics section was rewritten from the code on `main` on 2026-11-28 (FIT-880). This is an internal evidence note, not a published privacy policy or a declaration that production data processing has been fully audited. It proves code paths, not delivery: a call in the code shows what the app hands its analytics SDK, not what a vendor stored. It holds no real User data, tokens or secrets.

## MCP connection

The MCP application has no analytics integration (PostHog, Segment or Mixpanel) in its source or dependencies. It does not run the mobile application's analytics wrapper. Requests authenticate through Clerk; user tools read and write the caller's Fitme data. Tool results are returned to the connected client, including ChatGPT. For example, `get_profile` returns age, gender, height, weight, measurement system, and units. Plan and session tools return the requested training records.

`apps/mcp/src/app.ts` enables Hono's default request logger. The installed Hono logger logs HTTP method, URL path **including any query string**, response status, and elapsed time. That normal access logger does not log request/response bodies or authorization headers. This does not establish what exceptions, dependencies, hosting infrastructure, platform integrations, or externally configured drains may log. There is no application-level log-retention setting in this source.

Live Vercel project inspection confirmed `fitme-mcp` serves `mcp.fitmeproject.com` in the `provorovdev` team. The project information returned by the connector did not expose log retention. The scoped log-drain list request returned HTTP 404; drain configuration is **unverified**, not known to be absent.

## Mobile analytics

### Vendor

Current builds send product analytics to PostHog, one project on US Cloud (ADR 0026, `docs/adr/0026-product-analytics-go-straight-to-posthog-in-the-us.md`), through PostHog's React Native SDK (`posthog-react-native`, pinned in `apps/mobile/package.json`).

- `apps/mobile/lib/analytics.ts` is the one way the app sends analytics and the only importer of the SDK. It builds one standalone client (`new PostHog(key, options)`), with no PostHog provider in the React tree.
- The key and host come from `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` (`clientOptions` and `posthogKey` in that file). That the host is PostHog's US ingestion host is a build environment value, not something the code fixes; the account-deletion call is the code that names the US host (`POSTHOG_HOST` in `apps/webhooks/src/posthog.ts`).
- Current builds send nothing to Segment or Mixpanel: no file in `apps/mobile` imports a Segment or Mixpanel package, and neither is in its `package.json`. See the transition section for older builds.

### Events

Every event the app can send is in the wrapper's event map, `AnalyticsEvents` in `apps/mobile/lib/analytics.ts`; a name or property outside it fails the typecheck. These are all of them, with every property the app supplies, and every place it's sent from:

| Event | Properties | Sent from |
| --- | --- | --- |
| Arnold Attachment Sent | `count` | `apps/mobile/app/(tabs)/arnold/index.tsx` |
| Exercise Added | `exercise_slug`, `session_id` | `apps/mobile/app/workout-sessions/[workoutSessionId]/exercise-picker.tsx` |
| Exercise Deleted | `exercise_id`, `session_id` | `apps/mobile/components/views/workout-session-view.tsx` |
| Exercise Replaced | `exercise_slug`, `session_id` | `apps/mobile/app/workout-sessions/[workoutSessionId]/exercise-picker.tsx` |
| Note Cleared | `target` (`exercise` or `set`) | `apps/mobile/hooks/mutations/exercise-notes.ts`, `apps/mobile/hooks/mutations/workout-session-set-notes.ts` |
| Note Saved | `target` (`exercise` or `set`) | `apps/mobile/hooks/mutations/exercise-notes.ts`, `apps/mobile/hooks/mutations/workout-session-set-notes.ts` |
| Plan Activated | `plan_id` | `apps/mobile/hooks/queries/plans.ts` (activating a Plan, and saving a new one) |
| Plan Deleted | `plan_id` | `apps/mobile/hooks/queries/plans.ts` |
| Plan Edited | `plan_id` | `apps/mobile/hooks/mutations/plans.ts` |
| Plan Saved | `plan_id`, `source` (`builder` or `arnold`) | `apps/mobile/hooks/queries/plans.ts` |
| Plan Update Accepted | `plan_id`, `workout_id`, `workout_session_id` | `apps/mobile/components/workout-sessions/plan-update-sheet.tsx` |
| Plan Update Declined | `plan_id`, `workout_id`, `workout_session_id` | `apps/mobile/components/workout-sessions/plan-update-sheet.tsx` |
| Plan Update Suggested | `plan_id`, `workout_id`, `workout_session_id`, and a count per change kind: `replace_exercise`, `add_exercise`, `remove_exercise`, `add_sets`, `remove_sets` | `apps/mobile/hooks/finish-workout-session.ts` |
| Profile Filled | `age`, `gender`, `weight_unit` (holds the measurement system) | `apps/mobile/app/onboarding/profile.tsx` |
| Set Removed | `exercise_id`, `logged`, `session_id` | `apps/mobile/hooks/remove-workout-session-set.ts` |
| Set Tracked | `exercise_id` | `apps/mobile/components/views/workout-session-exercise-set-row-view.tsx` |
| User Deleted Account | none | `apps/mobile/hooks/mutations/auth.ts` (sent anonymously, after the reset) |
| User Logged In | none | `apps/mobile/components/views/login-view.tsx`, `apps/mobile/components/views/verify-code-view.tsx`, `apps/mobile/hooks/native-social-auth.ts` |
| User Logged Out | none | `apps/mobile/hooks/mutations/auth.ts` (sent before the sign-out) |
| User Registered | none | `apps/mobile/components/views/verify-code-view.tsx`, `apps/mobile/hooks/native-social-auth.ts` |
| Workout Completed | `plan_id`, `workout_id` (each left out once gone) | `apps/mobile/hooks/finish-workout-session.ts` (a first finish only, not a repeat) |
| Workout Discarded | `logged_set_count`, `source` (`finish_alert` or `menu`) | `apps/mobile/hooks/discard-workout-session.ts` |
| Workout Started | `plan_id`, `workout_id` (each left out once gone) | `apps/mobile/hooks/start-workout.ts` (a new Workout Session only, not a resume) |

`exercise_id` holds a Workout Session Exercise's id and `weight_unit` the measurement system; the names are kept as they were in the history (ADR 0026). `Set Tracked` carries no reps and no weight, and no event in the map carries a set's reps, a weight or a note's text.

### What the SDK adds by itself

These come from PostHog's SDK, not from Fitme's code; the code only turns the first one on.

- App lifecycle events: Application Installed, Updated, Opened, Became Active and Backgrounded (`captureAppLifecycleEvents: true` in `clientOptions`, `apps/mobile/lib/analytics.ts`).
- Device and app details on each event, such as the device's manufacturer and model, the system version and the device's locale. `expo-device` is a dependency of the app (`apps/mobile/package.json`) so the SDK can read the model; no Fitme file reads it for analytics. That the SDK attaches these fields, and which ones exactly, is the SDK's behaviour, not proven by Fitme's code.
- A session id and an anonymous device id, generated and kept by the SDK. Its state (ids and the queue of unsent events) is kept in the app's MMKV storage (`customStorage` in `clientOptions`).

### What the app records by hand

- Screens: one `screen` call each time the focused route changes, named by its route template (`/(tabs)/history`, `/plans/[planId]`), never the concrete path, and with no params or properties (`screenNameOf` and `useScreenEvents` in `apps/mobile/hooks/screen-events.ts`, called from the root layout).

### Identity

`apps/mobile/components/auth-sync.tsx` is the wrapper's only caller of `identify` and `reset`.

- The person's distinct id is the Clerk User id. `identify` carries the User's email and name from Clerk and, once the Profile has been read, its measurement system (`AnalyticsTraits` in `apps/mobile/lib/analytics.ts`). A change to any of the three identifies again.
- Every sign-out resets the identity, however the session ended (log-out, a deleted account, an expired session, a session that ended while the app was closed): `auth-sync.tsx` calls `analytics.reset()` whenever Clerk has loaded with nobody signed in, and the wrapper remembers who it identified (`analytics.identifiedUser` in MMKV) so it resets once per sign-out.
- Events sent before sign-in carry the SDK's anonymous id. PostHog links them to the User at `identify` (its documented identify behaviour; not proven by Fitme's code).
- `User Logged Out` is sent before the sign-out, so it carries the User's id; `User Deleted Account` is held until after the reset (`sendAfterReset`), so it is anonymous and not linked to the deleted person.
- Sentry is given the User id only, never the email or name (`Sentry.setUser({ id })` in `auth-sync.tsx`).

### What is not collected

- Touches and typed text: there is no PostHog provider in the tree, so the SDK's touch autocapture never runs, and the app sends no text a User typed (no event property is free text).
- Session replay: `enableSessionReplay: false`, and the replay plugin isn't a dependency.
- Errors: `errorTracking: { autocapture: false }`; Sentry reports the app's errors.
- Feature flags are not preloaded (`preloadFeatureFlags: false`).
- App language: no event or trait carries it. The device's own locale may still arrive as an SDK-added field (above).
- Reps, weights and note text: absent from every event in the map, `Set Tracked` included.

### Where sending is off

`shouldSendAnalytics` in `apps/mobile/lib/analytics-decision.ts` sends only with a key, outside a development build (`__DEV__`) and outside an E2E build (`IS_E2E`, `EXPO_PUBLIC_E2E_ENABLED` in `apps/mobile/lib/constants.ts`); without them the wrapper builds no client and every call does nothing. The `e2e-simulator` profile in `apps/mobile/eas.json` sets `EXPO_PUBLIC_E2E_ENABLED`. Preview builds send nothing because the PostHog key is set only in the EAS `production` environment and the `preview` profile builds with the `preview` environment: that is an environment configuration, not something the code proves.

### Deletion

On Clerk's `user.deleted` webhook, `apps/webhooks/src/routes/clerk.ts` deletes the User's data, resets their Arnold Conversations, then deletes their person and events in PostHog by the User id (`posthogPersonDeleter` in `apps/webhooks/src/posthog.ts`: `POST /api/projects/{id}/persons/bulk_delete/` with `delete_events: true`). A failure answers 500, so Clerk retries.

What that doesn't cover, per PostHog's own data-deletion docs (vendor behaviour, not proven by code):

- Anonymous events never linked to a person: events from before a sign-in that was never followed by `identify`, events after a reset, and `User Deleted Account` itself.
- PostHog deletes in the background and keeps backups for a period after; the webhook's 202 means queued, not erased.

### IP addresses

The PostHog project is set to discard client IPs before storage. That is a project setting a person made in PostHog; nothing in the code proves it, and the SDK still sends the IP with each request. GeoIP country and city may still be derived before the IP is dropped.

### Transition (temporary)

This section describes a temporary state and should be removed once Segment and Mixpanel are erased.

- Builds released before the PostHog cut-over still send to Segment, which forwards to Mixpanel, until the minimum version gate (`GET /v1/client-config`, `apps/api/src/routes/client-config.ts`) cuts them off.
- Mixpanel's history is being imported into PostHog. Those imported events include the reps and weights `Set Tracked` carried before the cut-over.
- Segment's and Mixpanel's data is to be erased once the import is checked.

### Historical: Segment and Mixpanel setup (as inspected on 2026-10-13)

Kept as the record of what older builds sent and where. None of it describes current builds.

Older builds used `@segment/analytics-react-native`, configured through `EXPO_PUBLIC_SEGMENT_WRITE_KEY`. At the time they identified the Clerk user ID, email and name, and `Set Tracked` carried completed reps and weight alongside the Exercise ID.

The user confirmed using Mixpanel. The Mixpanel project Segment fed has **EU** data residency. Its Overview and organization Data & Privacy pages did not show a retention duration. Data & Privacy offers user-data export/deletion requests. No settings, exports, or deletion requests were changed or submitted.

The Segment workspace showed two React Native sources, **Mobile App** and **Local**, and a Mixpanel destination receiving from **Mobile App**. That destination was **Enabled**, used the **EU** region, and its project token matched the inspected Mixpanel project. The token and destination secret are intentionally not copied into these notes.

The enabled mappings included Identify (All), Page (All), Screen (All), Group (All), and Track calls. The Track mapping matched Track events whose name is not `Order Completed`; a separate enabled mapping handled that event name. This preconfigured purchase mapping does not establish that Fitme emitted purchase events.

The Track mapping mapped the entire incoming `properties` object to Mixpanel Event Properties. It also mapped user/anonymous identifiers, message ID, timestamp, and app/device/network/locale/IP context when present. A configured mapping does not prove that every optional context field (for example an advertising ID) was populated by the app.

No mapping was saved and no test event was sent. Destination filters/functions, detailed Identify field mappings, retention, and deletion propagation remained unverified. No real user event payloads were loaded during this check. `reset()` in those builds reset the SDK identity; it was not evidence that previously sent analytics data was erased from Segment or Mixpanel.

## Website and other services

The marketing site sends to PostHog's US hosts through its `/ingest` rewrites (`apps/site/next.config.ts`, `apps/site/instrumentation-client.ts`, with PostHog's exception capture off); that its key is the mobile app's project is an environment value, not code. It also uses Vercel Analytics. Mobile authentication sync also identifies the user to Sentry (id only) and RevenueCat. These are distinct from direct MCP analytics. Their coverage belongs in the service-wide privacy review; do not describe the entire Fitme service as collecting only anonymous events.

## Next verification

1. Confirm in PostHog that the project discards client IPs, and check its retention and the internal-users filter. Do not substitute a vendor default for an observed project setting.
2. Until Segment and Mixpanel are erased: verify the retention/deletion configuration or applicable account terms for both, then confirm the erasure once it's done.
3. Inspect Vercel retention and drain settings through the project dashboard or a working API. Check relevant hosting/auth/database service log practices.
4. Use those results to update the service privacy page and ChatGPT-specific disclosure. Do not promise automatic analytics deletion beyond what the deletion section supports, a fixed retention duration, or absence of external logging without supporting evidence.

Reference for retention disclosures: GDPR Article 13(2)(a) provides for a storage period or, where that is not possible, criteria for determining it: https://eur-lex.europa.eu/eli/reg/2016/679/ojv . This does not establish Fitme's actual retention settings or make its existing generic wording sufficient.
