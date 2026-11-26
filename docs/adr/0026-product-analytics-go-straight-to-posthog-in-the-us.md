---
status: accepted
date: 2026-11-26
---

# Product analytics go straight to PostHog in the US, with the User's email and name

The mobile app sent its analytics to Segment, which forwarded them to a Mixpanel project in the EU. Two vendors held the same events, nothing deleted a User's analytics when they deleted their account, and Fitme wants PostHog's other products later (session replay, feature flags, experiments), which only its own SDK offers. The app now sends product analytics straight to one PostHog project on US Cloud through PostHog's React Native SDK, and Segment and Mixpanel are retired. The person in PostHog is the User: its id is the User id, and it carries the User's email, name and measurement system.

## Considered options

- **PostHog's own SDK, Segment removed in the same release (chosen).** One vendor, and lifecycle and screen events, which Segment's server-side forwarding can't carry.
- **PostHog as a Segment destination.** No app release, but Segment stays for good and PostHog gets `track` and `identify` only.
- **Both SDKs for one release.** Lets the two tools be compared event for event. The minimum version gate already cuts old builds off within days, so there is little to compare.
- **PostHog Cloud EU.** The site's old config and the privacy policy pointed at the EU. That account was abandoned, the live project is in the US, and moving a project between regions later isn't self-serve.
- **The User id only, as Sentry gets.** Less personal data at a vendor, but a User can't be found by email, which Mixpanel allowed.

## Consequences

- The region is fixed in practice: PostHog moves a project across regions only on its higher pricing tiers and by hand. The privacy policy says US, not EU.
- Email and name at an analytics vendor is deliberate. Sentry still gets the User id only; don't "fix" one to match the other.
- Account deletion has to reach PostHog: the Clerk `user.deleted` webhook deletes the person and their events, as it deletes the User's rows.
- Event and property names are frozen as Segment sent them, inconsistencies included (`session_id` beside `workout_session_id`, `weight_unit` holding the measurement system). Mixpanel's history is imported under those names and the import can't rename, so a rename would split every chart at the cut-over.
- That history has two ids for a User who joined before the Clerk move (ADR 0001): the Supabase UUID before it, the User id after. They are merged once, after the import, and PostHog can't undo a merge.
- The import copies whatever Mixpanel holds, deleted Users included. No User had deleted their account when this was decided, so nothing removes them afterwards; that has to be checked again on the day the import runs.
- PostHog drops the client IP before storing an event; country and city are still worked out from it first.
- App language isn't sent: it belongs to the device and is never stored for a User (`GLOSSARY.md`). PostHog's SDK adds the device's own locale to each event.
- Old builds keep sending to Segment until the minimum version gate passes the cut-over build. Segment and Mixpanel are switched off, the history imported and their data erased only after that.
- Analytics only sees what happens in the app. A Workout Session finished by the scheduled job, MCP or Arnold sends no event until the servers send their own.
