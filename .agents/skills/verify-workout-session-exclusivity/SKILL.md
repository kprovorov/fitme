---
name: verify-workout-session-exclusivity
description: "Formally check Fitme's one-open-Workout-Session-per-User rule with TLA+/TLC and replay it in isolated Postgres. Use when changing Workout Session indexes, start/finish/delete transactions, ownership, or concurrency behavior."
---

# Verify Workout Session exclusivity

**Promise:** a User has at most one committed Workout Session whose `finished_at` is NULL, including sessions whose Workout was deleted.

**Harm:** two clients could leave different Workouts open while the app only shows one, hiding the other Workout's in-progress data.

This skill checks this single safety property in a finite model of the database design. It does not prove the TypeScript implementation correct. TLC is used because the risk is the order in which independent transactions read, insert, commit, and roll back. A SQL replay checks that the actual index declaration behaves the way the model assumes.

See [VALIDATION.md](VALIDATION.md) for the recorded results and the two deliberately broken variants that this verification caught.

## Run from the repository root

```sh
node .agents/skills/verify-workout-session-exclusivity/scripts/verify.mjs
```

Requirements: Node 24+, Java 11+, and PostgreSQL 17's `initdb`, `pg_ctl`, and `psql` on PATH. Set `PG_BIN` to their directory if needed. On macOS with Homebrew, install with `brew install postgresql@17` and follow its PATH instructions. Never use a hosted or existing project database for this check.

The runner downloads TLC 1.7.4 to the OS temporary directory on first use and verifies SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. `TLA2TOOLS` may point to an existing copy of that exact jar; `JAVA` may select the Java binary. Local execution needs permission to create sockets. The SQL replay creates a fresh Postgres cluster in the output directory, listens only on its private Unix socket, and stops the cluster in `finally`. It strips inherited `PG*` environment settings from every Postgres subprocess so libpq cannot redirect the explicit socket connection through `PGHOSTADDR` or `PGSERVICE`. `PG_BIN` is resolved by the runner before that filtering. It never reads project environment files or connection URLs.

Output goes to a new `fitme-session-proof-*` directory in the OS temp directory. The printed path contains:

- `WorkoutSessions.tla`, `same-user.cfg`, `two-users.cfg`, `view.mjs`: exact inputs to TLC.
- `same-user.out`, `two-users.out`: full checker results and counterexamples.
- `source.json`: source checkout, extracted index SQL, and modeled key.
- `sql-replay.txt`, `postgres.log`: real SQL outcomes and temporary server log.

Exit 0 means both models and the SQL replay passed. Exit 1 with `FAIL: model and SQL agree` means the property failed in both. An unsupported declaration, a later migration touching the table, a model/SQL disagreement, a missing tool, or a checker error is a verification failure, never a pass. Resolve that failure before relying on the check.

## Read every result with /statechart

Read and follow the installed pstack **`/statechart`** skill for every TLC result, passing the generated model, the relevant generated config, and `view.mjs`. Find its current installation instead of copying its commands or paths into this skill. Give it a fresh output directory for each config. Its report explains invariant violations as shortest paths in the code's terms; when its chart budget permits, a passing result gives the system's statechart. Over the chart budget, a complete TLC pass remains valid even when no chart is produced.

For chart-only preparation without running Java or Postgres:

```sh
node .agents/skills/verify-workout-session-exclusivity/scripts/verify.mjs --prepare-only
```

Read a failure as a sequence such as: both callers see no open Workout Session; one insert commits; the other insert commits; the User now has two open Workout Sessions. Do not weaken `OneOpenPerUser` or restrict away that schedule. A modeled failure must also reproduce in SQL. If it does not, treat the model as suspect until you resolve the mismatch. Do not change product code merely to make this skill pass; report a current-code finding first.

## Scope and correspondence to the code

Last manually synchronized with commit **`b03f80f8ead38a2ccc6aef1f33473134dfee4e0c`**. Before trusting a check after a change, compare these files to that commit and re-read the covered functions. Move the sync commit forward only after confirming the model still describes them.

| Real source | Modeled behavior |
| --- | --- |
| `docs/adr/0013-one-open-workout-session-per-user.md`; `GLOSSARY.md` (Workout Session) | `OneOpenPerUser`, the intended property, including orphan sessions |
| `packages/supabase/supabase/migrations/20261029120000_one_open_session_per_user.sql`: index creation in the final DO block | The runner extracts the actual index declaration; a unique `user_id` index gives `KeyMode = "user"`. A nonunique index gives `"none"`; a unique `workout_id` index gives `"workout"`. Unsupported changes fail closed. |
| `packages/services/src/workout-sessions.ts`: `findOpenSession`, `insertOrResume`, `startWorkoutSession` | `ReadOpen` is a separate READ COMMITTED statement. It does not reserve a key. `Insert` reserves the key; `Conflict` cannot create another row. |
| `packages/db/src/index.ts`: `inRoleTransaction`, `asUser`, `withService` | Insertions stay uncommitted until `Commit`. `Rollback` releases the key and publishes no row. Template-copy statements are inside this transaction but their contents are abstracted away. |
| `packages/services/src/workout-sessions.ts`: `finishWorkoutSession`, `deleteWorkoutSession` | `Finish` and `Delete` represent commits that release an open session's unique key. Pending finish/delete transactions retain the key until commit; their rollbacks change no relevant state. Rotation and Plan effects are excluded. |
| `packages/db/src/schema.ts`: `workout_sessions` and `workout_sessions_workout_id_fkey` | `RemoveWorkout` models `ON DELETE SET NULL` for a committed session. A NULL Workout does not release the User's key. |
| `packages/services/integration/workout-session-lifecycle.test.ts` | Existing service integration tests complement this database-design check; this runner does not execute them. |

The runner rejects a newer migration mentioning `workout_sessions` until its impact is reviewed. The extractor is intentionally narrow, not a general SQL parser. It does not introspect any deployed database or prove that migrations were applied.

**Bounds:** three insertion transactions with fixed Workout choices A, B, A for one User, and a second configuration A, B, C where the third writer belongs to another User. Each configuration starts either empty or with one existing orphan session. Each insertion commits or rolls back once; committed sessions can be finished, deleted, or orphaned in every permitted order. TLC exhausts these finite state spaces without depth limits or state constraints.

**Assumptions:** Postgres enforces nondeferrable unique indexes against committed and uncommitted conflicting keys; ownership is non-NULL and fixed; the initial database satisfies the invariant. Both service preflight reads and direct SQL inserts are allowed, so the property does not depend on clients cooperating. A direct insertion from `ready` deliberately overapproximates callers bypassing the service.

**Excluded:** migration cleanup of preexisting duplicates; RLS/authentication correctness; implementation of Postgres itself; statement-level deadlocks, fairness and eventual success; exact retry counts or response payloads; template contents; finished-session edit restrictions; Plan rotation and Plan Updates; multi-insert transactions; arbitrarily many Users/requests; deployment drift. A pass is exhaustive for this finite model, not a proof at every size or of the whole app.

## Prove the checker can fail

After changing this verification or its covered index declaration, run:

```sh
node .agents/skills/verify-workout-session-exclusivity/scripts/mutation-check.mjs
```

After changing the SQL runner's process or connection setup, also run its real-Postgres isolation regressions:

```sh
node --test .agents/skills/verify-workout-session-exclusivity/scripts/replay.test.mjs
```

The mutation checker copies the real migration sources into temporary scratch folders, removes `UNIQUE` in one copy, and changes `(user_id)` to `(workout_id)` in another. Each scratch checkout must fail `OneOpenPerUser` in TLC and reproduce two committed open sessions in Postgres. It then reruns the unmodified repository and requires a pass. Repository product code is never mutated. If either mutation is missed, or a tool cannot run, repair the verification before handing it off.

The SQL replay installs the exact extracted index declaration on a minimal `workout_sessions` table. It repeats empty preflight reads followed by competing committed inserts, checks NULL Workout references, then checks rollback, finish, and independent User behavior. It replays a violating schedule; it is not a full database migration or a concurrent service integration suite.

The unique-index reservation and wait assumptions follow [Postgres's index uniqueness rules](https://www.postgresql.org/docs/17/index-unique-checks.html). The checker is the pinned [TLC 1.7.4 release](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4).

For changes that have drifted without being rechecked, use **`/maintain-formal-verification-skill`** to bring this skill and its coverage record back in line.
