---
status: accepted
date: 2026-11-26
---

# The Workout Session read carries each Exercise's Previous sets

The set tables of an open or finished Workout Session show each set's Previous set (`GLOSSARY.md`): what the User did in that set the last time they logged the Exercise, in place of the Workout's target. A row without a Previous set shows its target instead, and the column's header reads `target` when no row has one.

`GET /v1/workout-sessions/{id}` answers them itself: each Workout Session Exercise carries its Previous sets, worked out on the server against the Workout Sessions that started before the one asked for. They are in the read's own `weight_unit`, since a measurement system change converts both together. This is an additive `/v1` field. An older API that doesn't answer it leaves every row on its target.

Starting and finishing answer the Workout Session in full, and the app shows those answers as the session's read without reading it again, so they carry the Previous sets too. The Exercise and set writes don't, since the session is read again after each one. MCP's `get_workout_session` and Arnold don't show them.

## Considered options

- **The session read answers them (chosen).** One read, the rows and their Previous sets arrive together, no loading or failed state of their own, no unit mismatch, and a finished session works the same as an open one.
- **The app pages each Exercise's history (`GET /v1/workout-session-exercises`).** No API change, but one read per Exercise, re-read after every logged set (a logged set invalidates every Exercise history), extra pages for a finished session whose earlier entry sits past the first 20, and its own loading, failed, rate-limited and unit-mismatch cases.
- **A `before` filter on the history route, read with limit 1 per Exercise.** A smaller API change, but still one read per Exercise with every state that brings.

## Consequences

- The field can only go once the minimum version gate has cut off every build that reads it (`/v1` is additive only).
- The session read does more work: for each Exercise it finds the User's most recent earlier Workout Session with a positive-rep set of that Exercise. No index covers Workout Session Exercises by slug yet, so the read's cost is measured before release.
- The start and finish answers grow with it.
