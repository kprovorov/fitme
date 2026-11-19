# @fitme/api

REST API for Fitme (the Public API, ADR 0011) built on [Hono](https://hono.dev) with `@hono/zod-openapi` and served with `@hono/node-server`. Reads domain data from `@fitme/core`.

```bash
pnpm dev:api            # tsx watch, http://localhost:3003
pnpm api build          # tsdown bundle → dist/
pnpm api start          # runs dist/node/index.js
pnpm api test           # vitest
pnpm api test:integration # vitest against a running Supabase stack (see below)
pnpm api openapi        # regenerate openapi.json (commit it; CI fails when it's stale)
```

The dev command loads `apps/api/.env` when it exists. Restart it after changing that file.

## Endpoints

- `GET /health` — liveness
- `GET /v1/client-config` — public client config: minimum supported app version per platform (`ios`, `android`, `web`) from `MIN_APP_VERSION_IOS` / `_ANDROID` / `_WEB`, each falling back to `MIN_APP_VERSION` when unset or malformed (neither valid → `null`), cached for 5 minutes
- `GET /v1/arnold/models` — public list of Arnold models and the default id, cached for 5 minutes
- `GET /v1/muscle-groups` — list muscle groups
- `GET /v1/muscle-groups/:muscleGroup` — single muscle group
- `GET /v1/exercises?search&muscle_groups&equipment&language&limit&offset` — the new Library's Exercises (ADR 0022), alphabetical by name in `language` (an App language, default `en`; an untranslated Exercise answers wholly in English), as `{ data, total, hasMore }`: `search` matches the name in `language`, the English name or an alias; `muscle_groups` (primary only) and `equipment` are comma-separated, any of them; `limit` 1–50, default 20
- `GET /v1/exercises?slugs=a,b,…&language` — the batch lookup (at most 40, not combined with the list parameters): `{ data, missing }` in asked order, each entry with the `requested_slug` beside its own `slug`, so a replaced slug resolves to its replacement
- `GET /v1/exercises/:slug?language` — one Exercise in full (steps, common mistakes, benefits, both descriptions); a replaced slug answers its replacement, otherwise 404 `not_found`. Every Exercise answer carries `Cache-Control: private, max-age=3600` and the Library's content hash as `ETag` (304 on a matching `If-None-Match`); a bundle that can't load answers a reported 503 `library_unavailable`
- `GET /v1/profile` — the signed-in User's Profile with its units, or `{ data: null }` before onboarding
- `PATCH /v1/profile` — changes any of `age`, `gender`, `height`, `weight`, `measurement_system` (only those given; height and weight in the resulting system's units). A new measurement system first converts every stored height and weight of the User (Profile, Plan set targets, Workout Session weights). Answers the updated Profile, or 404 `profile_not_found` without one
- `GET /v1/plans` — the User's live Plans, newest first, each with its Workouts in rotation order (name, order, Exercise count); not paged
- `POST /v1/plans` — creates a Plan with its Workouts, Exercises (by `exercise_slug`) and sets in one transaction, active unless `activate: false`; every slug is checked against the Library API first (unknown → 400 `unknown_exercises`, library down or unconfigured → 503 `library_unavailable`, nothing written). Answers 201 with the Plan in full. Not idempotent
- `GET /v1/plans/active` — the active Plan in full, or `{ data: null }` without one
- `GET /v1/plans/:id` — one Plan in full (Workouts, Exercises by `exercise_slug`, sets, each in order, plus `weight_unit`), or 404 `not_found`
- `PUT /v1/plans/:id/workouts` — replaces every Workout of the Plan with `{ workouts }` (the Workouts of a Plan create, in rotation order) in one transaction. **Every Workout gets a new id**; past Workout Sessions keep their logged sets but lose the link to the old Workout. Metadata and active state stay. Slugs are checked like `POST /v1/plans` (400 `unknown_exercises`, 503 `library_unavailable`, nothing changed); a missing, deleted or another User's Plan → 404 `not_found`. Answers the Plan in full
- `GET /v1/workout-sessions?status=all|in_progress|finished&limit&offset` — the User's Workout Sessions newest first, each with its Exercise, set and logged-set counts, as `{ data, total, hasMore }` (`limit` 1–50, default 20; `offset` default 0; `status` default `all`; past the end is an empty page)
- `GET /v1/workout-sessions/:id` — one Workout Session in full, its Exercises (by `exercise_slug` only) and sets in order, with `weight_unit`; 404 `not_found` when it's missing or another User's
- `POST /v1/workout-sessions` — `{ workout_id }`: starts a Workout Session for the Workout, its Exercises and sets copied in order (201), or resumes the one already open for it (200), the Workout Session in full either way; 404 `not_found` for a Workout that's missing, another User's or of a deleted Plan
- `POST /v1/workout-sessions/:id/finish` — finishes it and moves its Workout to the end of the Plan's rotation: `{ data, already_finished }` (`true` on a repeat, which changes nothing); 404 `not_found`
- `DELETE /v1/workout-sessions/:id` — deletes it with its sets: 204, also on a repeat and for an id the User has no Workout Session with (another User's is left untouched)
- `PATCH /v1/workout-session-sets/:id` — `{ reps_completed, weight_completed }` (in the User's unit): logs a set of an open Workout Session and answers it with `weight_unit`; 409 `session_finished` for a finished one (nothing written), 404 `not_found`

`/health` and the global routes above answer without a token. Every other route, unknown ones included, needs `Authorization: Bearer <Clerk session token>`, verified networkless against `CLERK_JWT_KEY` (a token with a `sid`; `sub` is the User id); a missing or invalid one answers 401 `unauthorized`, so an unknown route answers 404 only to a signed-in caller. CORS preflights answer before auth.

The contract is `openapi.json`, generated from the route definitions by `src/openapi.ts`. `/v1` is additive only (a breaking change means `/v2`); the Public API workflow fails a pull request on a stale document or a breaking change.

Responses are JSON. Successful responses wrap the payload in `data`; failures return `{ error: { code, message } }` with a matching HTTP status. Invalid input (a non-uuid id included) answers 400 `invalid_request`. A response carrying weights carries `weight_unit` (`kg` / `lbs`, from the User's Profile, read first and share-locked in the same transaction so a concurrent conversion can't relabel the weights; `kg` without one): weights are returned as stored, never converted.

## Layout

- `src/index.ts` — Node entrypoint, `PORT` env (default 3003)
- `src/app.ts` — Vercel entry: starts `@fitme/observability`, then default-exports `createApp()`
- `src/create-app.ts` — `createApp({ clerkJwtKey, createServices, exerciseLibrary, identifyUser, libraryIndex, rateLimiter, reportError })` (each defaults to the real one): request spans, global middleware, the public routes, then auth, the User-data routes and the error/not-found handlers (unhandled errors are reported before the 500; 4xx aren't)
- `src/auth.ts` — `requireCaller` (the verified caller, `{ userId, kind: "session" }`, and their services) and `requires(permission)`, each User-data route's declared `read` / `write`
- `src/services.ts` — `UserServices`, the per-User facade: each method runs one `@fitme/services` function inside `asUser` for the verified User id (a read carrying weights first share-locks the Profile and reads its weight unit in the same transaction, so a conversion can't commit in between); routes never pass a User id
- `src/routes/v1.ts` — versioned routers mounting resource routers from `src/routes/`: `publicV1` (no caller) and `userV1` (after auth)
- `src/exercise-library.ts` — the new Library (ADR 0022: `exerciseLibraryFromEnv`, the v2 bundle from production's Blob store, `LIBRARY_V2_BUNDLE` or the committed fixture, loaded on the first Exercise read and kept, media on `SUPABASE_URL`), which `src/routes/exercises.ts` serves
- `src/library.ts` — the Library index (ADR 0018: `libraryIndexFromEnv`, over production's Blob store, `LIBRARY_BUNDLE` or the committed fixture) and `checkExerciseSlugs` / `checkSlugsAndPickCovers`, the one lookup a write runs before its transaction; the Public API has no Library API client
- `src/schemas.ts` — shared schemas (`ErrorResponse`, `Id`, `MuscleGroup`, `WeightUnit`, the documented 400 and 401 responses) and `invalidRequest`, every router's validation hook
- `src/openapi.ts` — writes `openapi.json` (`pnpm api openapi`)
- `src/backfill-covers.ts` / `scripts/backfill-covers.ts` — the one-off Cover backfill and its command (see Cover backfill)
- `src/rewrite-exercise-slugs.ts` / `scripts/rewrite-exercise-slugs.ts` — the one-off Exercise slug rewrite and its command (see Slug rewrite)

## Tests

`src/__tests__/` drives `createApp` through `app.request` with Clerk session tokens signed by a test RSA key, fake services (`src/test/harness.ts`: an unfaked method fails the request) and a Library index in memory (`testLibraryIndex`), with a recording reporter and Sentry user.

## Integration tests

`integration/` runs the same seam against a real Supabase stack (`pnpm db start`): the real services facade through `asUser` on the stack's Supavisor pooler (the vitest config reads its URL from `supabase status`; `FITME_DATABASE_URL` overrides it), as made-up Clerk-style `user_…` ids with test-signed tokens, and a Library index in memory. CI runs it in `.github/workflows/integration-tests.yml`.

`integration/backfill-covers.test.ts` runs the Cover backfill there too, scoped to its own Plans (`planIds`), since other files write Plans on the same stack at once, and `integration/rewrite-exercise-slugs.test.ts` the slug rewrite, scoped to its own Users (`userIds`).

## Cover backfill

A one-off script giving every Workout of a live Plan without a Cover one (ADR 0014; Postgres can't call the Library, so it isn't a migration). It reads the Covers from the Library index (ADR 0018, the same bundle the writes check against; it refuses to run, exit 1, when there are none or the index can't be loaded), lists the live Plans with an uncovered Workout through `withService`, looks those Workouts' Exercise slugs' muscle groups up in the index in one batch, then per Plan, one transaction each, runs `@fitme/core`'s `pickCovers` for its uncovered Workouts, keeping the Plan's existing Covers as used, and writes the ids. A Workout with a Cover is never changed, so a second run writes nothing. Each Plan's transaction locks the Plan row, then its Workouts, like `updatePlan` and finishing a Workout Session. A Workout that got an Exercise since the lookup sends its Plan back for one more lookup and retry, then it's skipped (logged; a rerun covers it). An index that can't be loaded up front stops it before anything is written; one failing later stops it after the Plans already committed, and a rerun picks up the rest. The process ends about 10 s after its last line (the pool's idle clients), exiting 1 on any failure.

Environment (read from the process, no file is loaded):

| Variable | Value |
| --- | --- |
| `FITME_DATABASE_URL` | the `fitme` login's transaction-pooler URL with `?application_name=backfill` |
| `VERCEL_ENV`, `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN` | for production's bundle: `VERCEL_ENV=production` reads `library.json` from the private Blob store over Vercel OIDC, as the deployment does |
| `LIBRARY_BUNDLE` | otherwise: the bundle to read (absolute, or relative to `apps/api`) |

With neither it refuses to run (exit 1): the committed fixture's made-up Covers would stay on real Workouts for good. It prints which bundle it read first, and loads it once for the whole run.

```bash
pnpm api backfill:covers --dry-run          # counts per Plan; reads the index's Covers, no write, no lock
pnpm api backfill:covers --plan <id>        # one Plan (repeat --plan for more), e.g. a smoke run
pnpm api backfill:covers                    # every live Plan
```

It prints one line per Plan (`plan <id>: <n> covered`, or `to cover` on a dry run) and a total: Plan ids and counts only, no other User data. Errors go through `sanitizeError`, so no SQL, parameter or Postgres message is printed.

## Slug rewrite

A one-off script rewriting every stored old Exercise slug to the Exercise replacing it (ADR 0022), run once the minimum version gate has cut off every build reading the Legacy Library; the map is then dropped from the bundle. The map is the v2 bundle's `replaced_slugs` (validated against the v2 schema; it refuses to run, exit 1, with none or an empty one), so it never lives in this repository. It lists the Users with a row under an old slug through `withService`, then per User, one transaction each, taking locks in `deleteUserData`'s order (so it queues behind an account deletion), rewrites `workout_exercises` (soft-deleted Plans included), `workout_session_exercises` (open Workout Sessions included) and `personal_records`. Within a Workout Session, two Personal records landing on one slug (two old slugs, or an old one next to the new one) keep the better one, higher weight then more reps, and the other is deleted, since a Workout Session holds one per Exercise; duplicate Workout Exercise and Workout Session Exercise rows stay. Each User's transaction also takes the Personal record lock and row-locks their Plans, Workout Sessions, Workouts and old-slug Workout Exercises first, in the order finishing a Workout Session and saving a Plan take them, so neither deadlocks with it. A slug already new is left alone, so a second run writes nothing, and a run stopped halfway is finished by running it again. Once every User is done it lists them again and gives anyone still holding an old slug (one written while their transaction ran) another pass, up to three, then fails. Writers still accepting old slugs after the run would store them again, so run `--dry-run` once more just before the map is dropped: it should list no User. The process ends about 10 s after its last line (the pool's idle clients), exiting 1 on any failure.

Environment (read from the process, no file is loaded):

| Variable | Value |
| --- | --- |
| `FITME_DATABASE_URL` | the `fitme` login's transaction-pooler URL with `?application_name=rewrite` |
| `VERCEL_ENV`, `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN` | for production's bundle: `VERCEL_ENV=production` reads `exercises.json` from the private Blob store over Vercel OIDC, as the deployment does |
| `LIBRARY_V2_BUNDLE` | otherwise: the v2 bundle to read (absolute, or relative to `apps/api`) |

With neither it refuses to run (exit 1): the committed fixture's made-up map would rewrite real slugs for good. It prints which bundle it read and how many old slugs its map has first.

```bash
pnpm api rewrite:exercise-slugs --dry-run   # counts per User and table; no write, no lock
pnpm api rewrite:exercise-slugs             # every User
```

It prints one line per User (`user <id>: workout_exercises <n>, workout_session_exercises <n>, personal_records <n> (<n> dropped)`, with `to rewrite` on a dry run) and a total: User ids and counts only, no slug or other User data. Errors go through `sanitizeError`, so no SQL, parameter or Postgres message is printed.
