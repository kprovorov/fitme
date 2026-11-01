# Initialize historical Personal records

`initializePersonalRecords(tx, userId)` from
`@fitme/services/personal-records` is the explicit per-User service entry
point. Call it inside `asUser(userId, ...)`, using a verified User identity.
There is no client endpoint, startup hook, deployment backfill or production
command. Applying the migration only creates completion storage. A production
run requires a separately approved operator/caller and target environment;
this document supplies no credentials and does not authorize that operation.

The service reads all finished Workout Sessions across Plans, ordered by
`finished_at`, then `started_at` and `id` for deterministic ties. Timestamp
comparison stays in Postgres, preserving microseconds. Each session uses the
same `awardPersonalRecords` / `personalRecordFor` path as a new finish, with
comparison limited to strictly earlier sessions in that order. It uses the
recorded values available now, including evidence already rounded by earlier
unit changes. It never infers original units or historical Weekly goals.

The entire User's replay and completion marker commit together. On failure,
cancellation or disconnect before commit, roll back the transaction and retry
that User in a fresh `asUser` transaction. There are no partially committed
pages to resume. If the answer was lost after commit, retry returns
`{ alreadyInitialized: true }`. A successful first run returns `false` for
that field. Empty History also receives completion. Never delete completion
to force a replay: it prevents later rounding or deleted baselines from
reinterpreting History. Account deletion removes it with the User's data.

Existing retained awards are never replaced or removed. The unique
session/Exercise key prevents duplicate awards, including records created by
new finishes before initialization. New finishes serialize with replay on a
transaction-scoped per-User advisory lock. Both hold the Profile's unit lock
before that lock, then acquire Plan/session locks as applicable. Conversion
holds the Profile exclusively, so it either precedes replay or converts all
committed awards afterward. The Workout Session table lock comes first so
account deletion queues without a lock-order cycle. Different Users have
independent advisory locks; a hash collision only serializes unrelated work.

An approved operator should process Users individually and bound concurrency.
The implementation retains one User's session ids in memory and performs the
existing award queries for each session; it is intentionally atomic rather
than a paged bulk job. Large histories can hold the User's finish/conversion
locks for longer. A timeout rolls that User back, so diagnose it before
retrying repeatedly. Do not disable locks, truncate History or raise production
timeouts speculatively.

After commit, the existing `listWorkoutSessions` → Public API
`GET /v1/workout-sessions` → mobile History path reads the retained awards.
Refresh an already mounted Screen to fetch them. No API contract or client
rule engine is added.
