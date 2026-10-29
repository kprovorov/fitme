---
status: accepted
date: 2026-10-29
---

# One open Workout Session per User, enforced in Postgres

A User can open a Workout's screen and start any Workout of their Plan, not only the next one in the rotation. Before this, the only rule was one open Workout Session per Workout, so a User (or an MCP client next to the app) could leave several Workouts in progress at once, and Home shows just one of them. We made it one open Workout Session per User: a partial unique index on `workout_sessions (user_id) where finished_at is null` replaces the per-Workout one, and `startWorkoutSession` resumes the Workout's own open session or refuses with the one open on another Workout (the Public API answers 409 `session_in_progress`, MCP a tool error). The app blocks Start ahead of that, but only as a fast path.

## Considered options

- **Unique index per User (chosen).** Every writer is held to it, the app, the API, MCP and a manual SQL fix alike, and two concurrent starts of different Workouts can't both win without an extra lock.
- **The app blocks Start, nothing else does.** The rule would be a suggestion: MCP, a later client or an old build would still open a second session.
- **A check in `startWorkoutSession` only.** Needs its own lock to survive concurrent starts, and nothing stops a write that bypasses the service.

## Consequences

- An MCP client can't start a Workout while the app has another one open; it has to finish it (or the User does) first.
- The migration adding the index first cleans up Users with several open sessions the way `20261003000000_one_open_session_per_workout.sql` did per Workout: the most recently started stays open, empty ones are deleted, the rest are closed with a plain `finished_at` (no rotation, no Plan Update).
- Builds from before the block show their generic "Couldn't start workout" alert for the 409; no minimum version bump.
