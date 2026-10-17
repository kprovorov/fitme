# Where the exercise catalog should live

> **Outcome:** this note's recommendation (keep Postgres as the home) was not adopted.
> The Exercise Library leaves Postgres. It's keyed by Exercise slug, its content lives
> in the private `fitme-exercises` repository, and the API is `apps/exercises`: see
> [ADR 0007](../adr/0007-exercise-library-is-a-separate-private-service.md) and
> [ADR 0008](../adr/0008-exercise-library-api-lives-in-the-monorepo.md). The repo and
> production facts below still describe today's `exercises` table, which the migration
> project has to deal with.

Research note, 2026-10-17. Question: the Exercise library (GLOSSARY.md: "a named
movement from the shared exercise library, independent of any User") lives in the
Postgres table `public.exercises` and is synced from `packages/supabase/data/`. The
data hardly ever changes. Is there a better place for it than the database, and what
would moving it take?

Repo facts are cited as `path:line`. Production facts come from read-only aggregate
queries against the hosted project (`zujyynezicwviytereod`) on 2026-10-17. External
claims link to the primary source. Anything I couldn't check is marked **(unverified)**.

## TL;DR

- **Postgres stays the canonical home. Clients get a cached read copy.** The table can't
  leave the database while user data references it. Two foreign keys point at it
  (`workout_exercises`, `workout_session_exercises`). The services check ids against it.
  Plan and session reads join it in SQL. Every mobile PostgREST embed
  (`exercise:exercises (*)`) depends on FK relationship detection. Bundling the catalog
  could replace *reads*, but it can never be the FK target. So in practice the choice
  is "status quo plus fixes" or "hybrid": Postgres for integrity, a static snapshot for
  browsing.
- **Blocker for every non-DB option: the repo doesn't carry the ids.** `exercises.csv`
  has `ref`, `slug` and so on, but no `id`. The table generates `gen_random_uuid()`, and
  sync upserts on `slug`. Prod's uuids are the only canonical ids, and every local or E2E
  stack mints different ones. So step 1 for anything static is to write prod's 77 ids into
  the CSV.
- **Real problems found on the way, worth fixing whatever you choose:**
  - Both exercise FKs are `ON DELETE CASCADE`. Deleting a catalog row deletes users'
    plan rows and workout history with it.
  - Plan and session reads pull the full markdown of every exercise in every plan.
  - `updated_at` is never bumped, so it can't serve as a version.
  - Mobile has no query persistence, and the library paginates 77 rows 20 at a time.
- **Recommendation (§4):**
  1. Put ids in the data files and add a drift check.
  2. Change `CASCADE` to `RESTRICT`.
  3. Slim the nested exercise selects.
  4. Serve the whole catalog from `GET /v1/exercises` on `apps/api`, long-cached at the
     CDN and persisted on device. The catalog comes from a typed module generated from
     the data files (`@fitme/exercises`), not from Postgres. This copies the
     `coach-models` pattern, and it is ADR 0004's "clients reach data only through
     `apps/api`" direction.
  5. Postpone having mobile import that module directly. It's cheap once the module
     exists, but the catalog changed once in 8 months, and mobile has no OTA channel.

## 1. Current state

### 1.1 Data files

- `packages/supabase/data/exercises.csv`: 77 rows plus a header (`wc -l` = 78). Columns
  are `ref,name,slug,video_url,thumbnail_url,muscle_groups` (`exercises.csv:1`). There
  is **no `id` column**. `ref` (77 unique values) is read by the scripts' row type but
  never written anywhere (`sync.ts:38-55`).
- `data/descriptions/<slug>.md` and `data/instructions/<slug>.md`: 77 each, all present.
- Size: 76,396 bytes in total (CSV is about 24 KB; the markdown is about 52.6K
  characters, which matches prod's `sum(length(description)+length(instructions))` of
  52,622). That's about 1 KB per exercise. Prod's table is 248 kB on disk, with indexes
  and TOAST.
- History: the data files have exactly one commit (`935f78c`, 2026-09-23, the monorepo
  conversion). The prod rows were all created on 2026-02-25. **The catalog hasn't changed
  in about 8 months.**
- Files match prod: the sorted slug list from the CSV and the prod slug list hash the
  same (77 slugs). All 77 prod ids are random v4 uuids.
- **Media is not in the repo.** `video_url` / `thumbnail_url` point at DigitalOcean
  Spaces (`fitme.nyc3.cdn.digitaloceanspaces.com`, `exercises.csv:2`). A sample
  thumbnail is a 24.8 KB PNG and a sample video a 275 KB MP4, both served with
  `cache-control: max-age=3600` (`curl -I`, 2026-10-17). That's about 2 MB of thumbnails
  and about 21 MB of video across the library. No option below moves media. It isn't
  bundleable in any sensible way, and it already sits on a CDN.

### 1.2 Schema, RLS, grants

- Table: `supabase/migrations/20240101000000_init.sql:13-24`. Columns are
  `id uuid PK DEFAULT gen_random_uuid()`, `slug text NOT NULL UNIQUE`, `name`,
  `description`, `instructions`, `video_url`, `thumbnail_url`, `muscle_groups jsonb`,
  `created_at`/`updated_at DEFAULT now()`. No migration has changed it since.
- **No `updated_at` trigger.** The only triggers are retired-id and
  `deactivate_deleted_plan` (grep of `migrations/`). An upsert never bumps `updated_at`,
  so it can't version a snapshot.
- FKs into it:
  - `workout_exercises.exercise_id … REFERENCES public.exercises(id) ON DELETE CASCADE`
    (`init.sql:82`)
  - `workout_session_exercises.exercise_id … ON DELETE CASCADE` (`init.sql:120`)
  - The generated Drizzle schema mirrors both (`packages/db/src/schema.ts:296`, `:383`), and
    so do the relations (`packages/db/src/relations.ts:21,51-53,76-78`).
  - Postgres: CASCADE means that "when a referenced row is deleted, row(s) referencing it
    should be automatically deleted as well", while RESTRICT "prevents deletion of a
    referenced row"
    ([Postgres docs, constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)).
  - In prod, 65 distinct exercises are referenced by 975 `workout_exercises` rows, and 57
    by 1,173 `workout_session_exercises` rows. **Deleting one catalog row silently deletes
    those Users' plan entries and logged history.**
- RLS: `exercises_select … FOR SELECT USING (true)` (`init.sql:162-164`). There's no
  write policy, so client writes are denied.
- Grants: `GRANT ALL ON public.exercises TO anon, authenticated, service_role`
  (`20261016120000_explicit_table_grants.sql:20-32`).
  - **The catalog is already public:** anyone with the anon key can read it over
    PostgREST. A public CDN JSON isn't a new exposure.
  - `table_grants.test.sql:25` pins the grants.
- The `request_key` columns (`20261015120000_plan_edit_request_keys.sql:9-13`) are on
  `workout_exercises` / sets, not on `exercises`. They aren't affected.

### 1.3 Sync and seed

- `supabase/sync.ts` reads the CSV and markdown and upserts through supabase-js with
  `onConflict: "slug"` (`sync.ts:57-59`), using `SUPABASE_SERVICE_ROLE_KEY`
  (`sync.ts:17-19`). It **never deletes**, and it never sends an `id`.
  - A renamed slug therefore creates a *new* row with a new uuid and leaves the old one
    behind, still referenced by users.
- `.github/workflows/sync-exercises.yml`: runs on pushes to `main` that touch
  `data/exercises.csv`, `data/descriptions/**`, `data/instructions/**` or `sync.ts`,
  in the `production` environment. Like `scripts/clerk-migration.ts`, it's a
  service-role REST user outside the apps. ADR 0003 covers the apps only, so this isn't a violation, just the odd one out.
- `supabase/seed.ts:33-45`: the snaplet seed client inserts the same rows without ids,
  so every local stack and every E2E preview branch (`e2e.yml:106-110`) gets **different
  uuids** from prod.

### 1.4 Consumers

**Services (`packages/services`)**, all inside `asUser`:

| Where | What it does with `exercises` | Joins in SQL? |
|---|---|---|
| `exercises.ts:71-105` `listExercises` | `ilike` on name, `muscle_groups @> [group]`, alphabetical page plus `count(*) over ()` | table scan of 77 rows |
| `exercises.ts:117-137` `getExercise` | one row by id | – |
| `exercises.ts:173-268` `getExerciseHistory` | filters `workout_session_exercises.exercise_id`; doesn't read `exercises` | no |
| `plans.ts:196-198, 225-229` `findPlanDetail` (`getPlan` `:254`, `getActivePlan` `:266`, and the Plan returned by `createPlan`/`updatePlan`) | relation `exercise: { id, muscleGroups, name }` per Workout Exercise | **yes** (Drizzle relational query, one statement) |
| `plans.ts:425-450` `assertExercisesExist` → `UnknownExercisesError` (`:410`) | `select id from exercises where id in (…)` before writing (`:578`, `:632`) | validation |
| `workout-edits.ts:185-192` `assertExerciseExists` | same, for add (`:266`) and replace (`:402`) | validation |
| `workout-sessions.ts:258-259, 273` `findSessionDetails` (`getWorkoutSession`, `listWorkoutHistory`, start/finish read-backs) | `leftJoin(exercises)` for `exercise: { id, name }` | **yes** |
| `workout-sessions.ts:512` `copyWorkoutTemplate` (start) | copies `exercise_id` values; FK only | no |

**RPCs the mobile app still calls** (latest definitions in
`20261011120000_user_id_text_key.sql`):

- `create_plan` (`:393`) and `update_plan` (`:579`) insert `(v_exercise->>'exercise_id')::uuid`
  straight into `workout_exercises`.
- `start_workout_session` (`:694`) copies `we.exercise_id` into
  `workout_session_exercises`.
- None of them reads `exercises`. **The FK is their only validation**: an unknown id
  fails with a FK violation.

**MCP** (`apps/mcp`):

- `list_exercises` / `get_exercise` / `get_exercise_history` (`src/tools/exercises.ts:24-25, 65-66, 84-85`)
  go through `src/services.ts:100-108`.
- Plan tools take `exercise_id` as a uuid "from list_exercises (exercises.id)"
  (`src/tools/plan-schemas.ts:38-41`) and map `UnknownExercisesError` to a hint
  (`src/tools/plans.ts:25-32`).

**Coach** (`apps/coach`):

- `search_exercises` → `listExercises`, first 8, returns only `{id, muscle_groups, name}`
  (`agent/tools/search_exercises.ts:8-27`).
- `add_exercise_to_workout` / `replace_exercise_in_workout` pass ids on to
  `workout-edits`.
- The prompt requires ids from `search_exercises` (`agent/instructions.md:5-6,11`).
- Evals use fixture ids, not the DB (`evals/propose-plan.eval.ts:11,43`).

**Mobile** (`apps/mobile`, supabase-js straight to PostgREST):

- Library: `useExercisesQuery`, an infinite query with 20 per page, `select("*")`,
  ordered by name, optional `muscle_groups` contains (`hooks/queries/exercises.ts:36-76`).
  It runs through `components/views/exercises-view.tsx:44-48`. There's no text search,
  only a muscle-group filter.
- Detail: `useExerciseQuery`, `select("*")` by id (`hooks/queries/exercises.ts:15-30`).
  It's used by `app/exercises/[exerciseId]/index.tsx` and `guide.tsx`.
- **Embeds of the full row `exercise:exercises (*)`:**
  - `hooks/queries/plans.ts:14`
  - `hooks/queries/workouts.ts:19`
  - `hooks/mutations/workouts.ts:17,49`
  - `hooks/queries/workout-sessions.ts:13`
  - `hooks/queries/workout-exercises.ts:22`
  - `hooks/queries/workout-session-exercises.ts:7`
  - `hooks/queries/exercises.ts:90`

  PostgREST "will automatically detect relationships based on the foreign keys"
  ([Supabase, joins and nesting](https://supabase.com/docs/guides/database/joins-and-nesting)),
  so these embeds need the FK. Each one ships about 1 KB of markdown per Workout Exercise:
  a 4-day plan with 6 exercises a day re-downloads about 24 KB of catalog text that the
  plan screens don't render.
- Direct write: `useCreateWorkoutSessionExerciseMutation` inserts
  `{ exercise_id, … }` into `workout_session_exercises` over PostgREST
  (`hooks/queries/workout-session-exercises.ts:64`). Only the FK validates it.
- Types: `Exercise` in `packages/core/src/models.ts:67-75` has non-null
  `description`/`instructions`/`video_url`/`thumbnail_url`, and `WorkoutExercise.exercise`
  / `WorkoutSessionExercise.exercise` are full `Exercise`s (`:105`, `:132`).
- Caching: a plain `new QueryClient()` (`components/providers.tsx:25`) with no
  persistence and the default `staleTime`. Nothing survives a cold start.
- Plan card: the Coach's `display_workout_plan` items carry `exercise_id` and link to
  `/exercises/:id` (`components/chat/workout-plan-card.tsx:16,92`).

**Web / API / webhooks / site**: no exercise reads (grep of `apps/web`, `apps/api/src`,
`apps/webhooks/src`; `apps/site` mentions exercises only in legal copy).

### 1.5 What makes moving it hard

1. **FK targets.** The two FKs plus mobile's direct PostgREST write and the three RPCs
   rely on Postgres to reject unknown ids. Take the table away and you need app-level
   validation in every writer, including old app builds you can't update (ADR 0004 keeps
   RPCs until builds below the minimum version stop calling them).
2. **SQL joins.** `findPlanDetail` and `findSessionDetails` embed name and muscle groups in
   one statement (one snapshot). Mobile's eight embeds do the same through PostgREST.
   Without the table, each one turns into "read ids, then decorate from a module".
3. **Ids live only in prod.** See §1.3. Nothing static can be built from the repo today.

## 2. Options

### a. Status quo plus improvements (Postgres stays the source, clients cache harder)

- **Changes:**
  - Migration: FKs to `ON DELETE RESTRICT`; regenerate `schema.ts`/`relations.ts` and
    `database.types.ts` (AGENTS.md, packages/db).
  - Ids into the CSV, with sync and seed passing them (§3).
  - Slim the embeds to `exercise:exercises (id, name, muscle_groups, thumbnail_url)` and
    fetch the detail on the exercise screen. This needs an `ExerciseSummary`-style type in
    `@fitme/core`.
  - Mobile: long `staleTime` for the catalog queries, plus TanStack Query persistence.
    `persistQueryClient` restores a saved cache. Its `maxAge` defaults to 24 h, `gcTime`
    "should be set as the same value or higher than … `maxAge`", and a `buster` string
    drops old caches
    ([TanStack, persistQueryClient](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient)).
    The repo already has MMKV (`lib/mmkv.ts`) and an MMKV-cached list pattern
    (`lib/coach-model.ts`).
- **Gains:** smaller plan payloads, and a warm library on relaunch. No offline for first
  launch.
- **Updates ship:** as today (merge → sync workflow → live immediately).
- **Integrity:** best possible. The FK stays, and RESTRICT stops destructive deletes.
- **Effort:** small (one migration, a few query and type edits).
- **Risk:** low. Clients still hit PostgREST directly, which ADR 0004 wants to phase out
  eventually.

### b. Bundle as a typed module (`@fitme/core` or a new `@fitme/exercises`)

- **Changes:**
  - A codegen step turns CSV plus markdown into a typed TS/JSON module with ids.
  - Mobile and web import it. Services could decorate rows from it instead of joining.
  - **Postgres still needs the ids**, as the FK target for the user tables, the RPCs and
    mobile's direct insert. So at minimum you keep a slim `exercises(id, slug)` table
    synced from the same file. Dropping the FK for a CHECK/trigger against a hard-coded
    id list means a migration on every catalog change, which is worse than today.
  - Every SQL join (`plans.ts:196`, `workout-sessions.ts:258`, the eight mobile embeds)
    becomes "ids from SQL, names from the module". The one-statement snapshot guarantee
    in those reads doesn't matter for immutable data, but it's churn across every read
    path.
- **Gains:** zero network for browsing and search, offline from first launch. The
  backends save a join on 77 rows, which is negligible.
- **How updates ship:**
  - Backends: on deploy (Vercel, each app's own build).
  - Mobile: **only with an app release**. `expo-updates` isn't a dependency (it only
    appears as a peer entry in `pnpm-lock.yaml:4189,4214`), and `app.json` / `eas.json`
    have no `updates` / `runtimeVersion`.
  - EAS Update could ship JS-bundled data, since it updates "non-native pieces (such as
    JS, styling, and images) over-the-air", and users get it "on their next app launch
    or reload"
    ([Expo, EAS Update intro](https://docs.expo.dev/eas-update/introduction/)). But
    setting it up means picking a runtime-version policy (`appVersion` or `fingerprint`,
    [Expo, runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)) and
    adding a channel to the release workflow. That's real work for a catalog that
    changed once in 8 months.
- **Drift risk:** an installed build's module and prod's table can disagree. A
  library-only exercise is invisible in old builds, and a renamed one shows the old name
  in old builds while plans (from SQL) show the new one. You'd need a "missing id →
  fetch from API" fallback anyway.
- **Effort:** medium to high (codegen, a two-sources-of-truth sync, rewriting the read
  paths, a mobile fallback, optionally EAS Update).
- **Risk:** medium. The integrity story gets *weaker* unless the slim table stays, and
  if it stays, nothing has really moved.

### c. Static JSON on a CDN (Vercel static asset, `apps/api` endpoint, or Supabase Storage)

- **Changes:**
  - Publish the whole catalog (about 76 KB raw, much less gzipped **(unverified
    ratio)**) as one JSON document.
  - The best host is an `apps/api` route, `GET /v1/exercises`. It can serve a generated
    module, or read Postgres at request time; the second needs `@fitme/db` and a DB
    credential that `apps/api` doesn't have today (see §4 step 4). It would follow
    `apps/api/src/routes/coach-models.ts:8-17`, which already does
    `Cache-Control: public, max-age=300, s-maxage=300` for a list from `@fitme/core`.
  - Vercel's CDN honours `s-maxage`, serves stale while it revalidates in the background
    with `stale-while-revalidate`, and with `s-maxage` it can "cache and invalidate
    responses on deploy"
    ([Vercel, Cache-Control headers](https://vercel.com/docs/caching/cache-control-headers)).
  - A Supabase Storage file would work too, but it adds an upload step and a second
    origin for no gain over `apps/api`.
- **Gains:** one request per device per cache window, CDN-close latency, no DB hit.
  It's offline once cached (needs persistence, as in a).
- **How updates ship:** on the next API deploy (if built from the module) or within the
  TTL (if read from the DB). No app release.
- **Integrity:** unchanged, as long as Postgres keeps the table. This is a read copy only.
- **Effort:** small.
- **Risk:** low. It matches ADR 0004 ("every client (mobile and web, reads included)
  eventually reaches data only through `apps/api`",
  `docs/adr/0004-business-logic-in-services-not-rpcs.md`).

### d. Hybrid: Postgres canonical, clients use a versioned snapshot

- Effectively **a + c, with the repo files as the true source.** The files carry ids, and
  sync writes them to Postgres, which stays the FK and join target.
- `apps/api` serves the snapshot, versioned by a content hash of the data files (not
  `updated_at`, see §1.2). Mobile persists it and uses it for the library list, search and
  detail. Plan and session reads keep a slim embed (`id, name, muscle_groups`) from SQL,
  so they never depend on the snapshot being fresh.
- Optionally the backends could read the catalog from the generated module instead of
  SQL for `listExercises`/`getExercise`. It's not worth it: 77 rows in Postgres is
  already fast, and the MCP and Coach tools call it rarely.
- **Effort:** a + c. **Risk:** low. **This is the recommendation.**

### e. Other ideas (weak)

- **SQLite bundled with `expo-sqlite`.** `SQLiteProvider`'s `assetSource` opens "a
  bundled database file from the specified asset module"
  ([Expo, SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)). It's overkill for
  77 rows that fit in one JSON, adds a native module, and has the same release-cadence
  problem as b.
- **Vercel Edge Config (now "Global Config").** The 1 MB store limit would fit, but it's
  built for flags and redirects. Writes "may take up to 10 seconds" to propagate, and
  reads are billed
  ([Vercel, Global Config limits](https://vercel.com/docs/global-config/global-config-limits)).
  Mobile can't read it directly, so it would still sit behind `apps/api`. No gain over a
  CDN-cached response.
- **Drop the FK and validate in app code only.** Ruled out while mobile writes
  `workout_session_exercises` directly (`hooks/queries/workout-session-exercises.ts:64`)
  and old builds call the RPCs.

### Comparison

| | Integrity (FK) | Offline browsing | Mobile update path | Effort | Fits ADRs |
|---|---|---|---|---|---|
| a. Postgres + caching | kept, RESTRICT | after first fetch | sync workflow | S | yes, still direct PostgREST |
| b. Bundled module | needs slim table anyway | from install | app release / EAS Update (not set up) | M-L | neutral |
| c. CDN JSON via `apps/api` | kept | after first fetch | API deploy or TTL | S | yes, ADR 0004 direction |
| **d. Hybrid (a + c, ids in repo)** | **kept, RESTRICT** | **after first fetch** | **sync + API deploy** | **S-M** | **yes** |
| e. SQLite / Edge Config | kept | SQLite: from install | release / API | M | neutral |

## 3. Making the repo the source of truth for ids

You need this for d, and it's useful for a too: E2E and local stacks get prod's ids, so
fixtures and evals can use real ids.

1. Export `slug,id` from prod once (77 rows, already shown to match the files by slug)
   and add an `id` column to `exercises.csv`. New exercises get a uuid at authoring time.
   A deterministic uuid v5 from the slug would also work for new rows **(unverified
   tooling)**, but existing rows must keep their random v4 ids.
2. `sync.ts` sends `id` in the payload, keeps `onConflict: "slug"` or switches to `"id"`.
   With matching ids the upsert rewrites the same values. If an id ever differs for an
   existing slug, the UPDATE of a referenced PK fails because there's no `ON UPDATE`
   action, which is a useful tripwire **(unverified: not run)**. `seed.ts` passes `id`
   too. The snaplet seed client takes column values per row, `id` included
   **(unverified: not run)**.
3. A CI drift check: a read-only job that compares the files' `(id, slug, content hash)`
   with prod, so a manual dashboard edit or a slug rename shows up before it creates a
   duplicate row.
4. Optionally, move `sync.ts` from supabase-js plus the service-role key to `withService`
   from `@fitme/db`, so it uses the same door as the apps (ADR 0003). That's cosmetic, not
   required.

## 4. Recommendation and migration sequence

**Keep `public.exercises` in Postgres as the canonical, FK-backed catalog. Make the repo
files the source of truth for ids. Serve clients a long-cached, persisted snapshot
through `apps/api`.** Don't move the catalog out of the database. Its whole cost today is
77 rows in a 248 kB table. The real inefficiencies are elsewhere: full-row embeds, no
client cache, and a cascading FK. Each is fixable without a storage change.

Sequence (each step ships on its own):

1. **Ids into the data files** (§3.1-3.3): CSV `id` column, sync and seed pass it, and a
   drift check. No schema change.
2. **Stop the cascade:** a migration changing
   `workout_exercises_exercise_id_fkey` and `workout_session_exercises_exercise_id_fkey`
   to `ON DELETE RESTRICT`. Regenerate `packages/db/src/schema.ts`, `relations.ts` and
   `packages/supabase/src/database.types.ts` (the Database Types workflow checks them).
   Add a pgTAP assertion that deleting a referenced exercise fails.
3. **Slim the nested reads:**
   - Mobile's eight `exercise:exercises (*)` embeds become
     `(id, name, muscle_groups, thumbnail_url)`.
   - Add an `ExerciseSummary` type next to `Exercise` in `packages/core/src/models.ts`,
     and retype `WorkoutExercise.exercise` / `WorkoutSessionExercise.exercise`.
   - The services already select only `id, name, muscle_groups`, so they're fine.
4. **`GET /v1/exercises` on `apps/api`, served from a generated module.** `apps/api`
   depends only on `@fitme/core` (`apps/api/package.json:15`). It has no `@fitme/db` and
   no `FITME_DATABASE_URL`, and reading Postgres would put a service-role-strength
   credential on the public API project (ADR 0003). So generate a typed module from the
   data files (ids included, plus a content-hash `version`) and serve it the way
   `coach-models.ts` serves `coachModels`. Put it in its own source-only package
   (`@fitme/exercises`), not `@fitme/core`, so the 76 KB of markdown doesn't land in
   every consumer of `@fitme/core`. The same files feed sync, so the module and the
   table can't diverge except by a manual prod edit, which the drift check catches.
   The route is public, returns the whole catalog in one response, and sends
   `Cache-Control: public, max-age=…, s-maxage=…, stale-while-revalidate=…` following
   `coach-models.ts`, plus an `ETag` / version hash. Mobile's library and detail read it
   (filtering 77 rows on the client, which also makes text search trivial). It gets a long
   `staleTime` and persistence (MMKV, like `coach.models`, or `persistQueryClient` with a
   `buster` set to the snapshot version). That's one step toward ADR 0004 and gets the
   library off direct PostgREST.
5. **Later, only if offline-from-install or zero-latency browsing becomes a product
   need:** have mobile import the step-4 module directly and use it as the fallback when
   the snapshot isn't cached yet. Revisit then whether to set up EAS
   Update. Keep the Postgres table and FKs regardless.

What stays the same: MCP and Coach tools keep calling `listExercises` / `getExercise`
through `asUser`. `UnknownExercisesError` checks still query the table. The RPCs need no
change.
