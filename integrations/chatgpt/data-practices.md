# Data-practice evidence for the ChatGPT listing

Inspected on 2026-10-13. This is an internal evidence note, not a published privacy
policy or a declaration that production data processing has been fully audited.

## MCP connection

The MCP application has no direct Mixpanel or Segment integration in its source
or dependencies. It does not run the mobile application's analytics hooks.
Requests authenticate through Clerk; user tools read and write the caller's
Fitme data. Tool results are returned to the connected client, including ChatGPT.
For example, `get_profile` returns age, gender, height, weight, measurement system,
and units. Plan and session tools return the requested training records.

`apps/mcp/src/app.ts` enables Hono's default request logger. The installed Hono
logger logs HTTP method, URL path **including any query string**, response status,
and elapsed time. That normal access logger does not log request/response bodies
or authorization headers. This does not establish what exceptions, dependencies,
hosting infrastructure, platform integrations, or externally configured drains
may log. There is no application-level log-retention setting in this source.

Live Vercel project inspection confirmed `fitme-mcp` serves
`mcp.fitmeproject.com` in the `provorovdev` team. The project information returned
by the connector did not expose log retention. The scoped log-drain list request
returned HTTP 404; drain configuration is **unverified**, not known to be absent.

## Mobile analytics

The mobile app uses `@segment/analytics-react-native`, configured through
`EXPO_PUBLIC_SEGMENT_WRITE_KEY`. Confirmed explicit calls include:

| Call/event | Explicitly supplied data | Source |
| --- | --- | --- |
| Identify | Clerk user ID, email, name | `apps/mobile/components/auth-sync.tsx` |
| Profile Filled | Age, gender, measurement system under `weight_unit` | `apps/mobile/app/onboarding/profile.tsx` |
| Set Tracked | Exercise ID, completed reps, completed weight | `apps/mobile/components/views/workout-session-exercise-set-row-view.tsx` |
| Workout Started / Completed | Plan ID, workout ID | `apps/mobile/hooks/mutations/workouts.ts` |
| Plan Saved / Activated / Deleted | Plan ID | `apps/mobile/hooks/queries/plans.ts` |
| Exercise Added / Replaced / Deleted | Exercise ID, session ID | `apps/mobile/components/views/workout-session-view.tsx` |
| User Registered / Logged In / Logged Out / Deleted Account | Event name; no extra properties at these call sites | Auth views and `apps/mobile/hooks/mutations/auth.ts` |

This table lists explicit application properties, not a complete inventory of
SDK-generated context or destination transformations. It proves code paths,
not delivery to a particular Mixpanel project. `reset()` on account deletion
resets the SDK identity; it is not evidence that previously sent analytics data
is erased from Segment or Mixpanel.

The user confirmed using Mixpanel. The live Mixpanel dashboard exposes a project
named **Fitme Project**, ID **4009540**, in the **Cashbot** organization, with
**EU** data residency. Its Overview and organization Data & Privacy pages did not
show a retention duration. Data & Privacy offers user-data export/deletion
requests. No settings, exports, or deletion requests were changed or submitted.

After the user signed in, the Segment **Fitme Project** workspace showed two
React Native sources, **Mobile App** and **Local**, and a Mixpanel destination
receiving from **Mobile App**. That destination is **Enabled**, uses the **EU**
region, and its project token matches the inspected Mixpanel project. The token
and destination secret are intentionally not copied into these notes.

The enabled mappings include Identify (All), Page (All), Screen (All), Group
(All), and Track calls. The Track mapping matches Track events whose name is
not `Order Completed`; a separate enabled mapping handles that event name.
This preconfigured purchase mapping does not establish that Fitme emits purchase
events or that the ChatGPT plugin supports purchases.

The Track mapping explicitly maps the entire incoming `properties` object to
Mixpanel Event Properties. It also maps user/anonymous identifiers, message ID,
timestamp, and app/device/network/locale/IP context when present. A configured
mapping does not prove that every optional context field (for example an
advertising ID) is populated by the app. These observations support forwarding
the code's training measurements and demographics when those events reach this
source, subject to any filters that have not yet been inspected.

No mapping was saved and no test event was sent. Closing the editor displayed a
discard prompt; discarding the unsaved editor state redirected the browser to
Segment sign-in. Therefore destination filters/functions, detailed Identify
field mappings, retention, and deletion propagation remain unverified. No real
user event payloads were loaded during this check.

## Website and other services

The marketing site initializes PostHog and Vercel Analytics. Mobile authentication
sync also identifies the user to Sentry and RevenueCat. These are distinct from
direct MCP analytics. Their coverage belongs in the service-wide privacy review;
do not describe the entire Fitme service as collecting only anonymous events.

## Next verification

1. Resume Segment access and inspect destination filters/functions and detailed
   Identify mapping. The Mobile App → EU Mixpanel connection and broad Track
   property mapping have been verified; do not repeat that discovery.
2. Verify the actual retention/deletion configuration or applicable account terms
   for Segment and the confirmed Mixpanel destination. Do not substitute a vendor
   default for an observed project setting or owner-confirmed policy.
3. Inspect Vercel retention and drain settings through the project dashboard or
   a working API. Check relevant hosting/auth/database service log practices.
4. Use those results to update the service privacy page and ChatGPT-specific
   disclosure. Do not promise automatic analytics deletion, a fixed retention
   duration, or absence of external logging without supporting evidence.

Local site drafts now add the verified account/training-data categories, the
ChatGPT data flow, and mobile analytics disclosures. The terms draft covers the
ChatGPT connection and distinguishes its free features from mobile subscriptions.
The homepage draft identifies the connection and publisher. Existing general
retention wording was retained; no numeric log/analytics retention period or
automatic analytics-erasure promise was invented. These are incomplete policy
updates pending the remaining evidence, not a full legal-compliance assessment.

Reference for retention disclosures: GDPR Article 13(2)(a) provides for a storage
period or, where that is not possible, criteria for determining it:
https://eur-lex.europa.eu/eli/reg/2016/679/ojv . This does not establish Fitme's
actual retention settings or make its existing generic wording sufficient.

No site changes were deployed and no production configuration was changed.
