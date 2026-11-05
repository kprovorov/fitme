# Mobile reads: stay on the Supabase Data API, or move to the Public API?

Research note, 2026-11-02. The question: every mobile write now goes through `apps/api` (the Public API, ADR 0011), but reads still go to the Supabase Data API (PostgREST through supabase-js). Should we keep that split, move reads to `/v1` too, or go back to the Data API for reads and writes so nothing is proxied through our backend?

Repo facts are cited as `path:line`. Migration paths are relative to `packages/supabase/supabase/migrations/`. External claims link to the primary source. Production numbers come from Sentry (`provorovdev/fitme-api`) and Supabase edge logs (project `zujyynezicwviytereod`), read-only, on 2026-11-02. Anything I couldn't check is marked **(unverified)**.

## TL;DR

- **Recommendation: Option B, move the reads to `/v1`, then switch the Data API off for clients.** Do it incrementally, behind the minimum version gate. Two preconditions: a release check on the API host (FIT-522), and client-side latency measured before and after.
- **This was already decided.** ADR 0004 says every client, "mobile and web, reads included", eventually reaches data only through `apps/api` (`docs/adr/0004-business-logic-in-services-not-rpcs.md:10`). It expects the anon key and the Clerk trust to end up unused by clients (`:25`). Both write projects put reads out of scope "for now". P-FIT-36 calls writes-first "a reversible migration step" with no ADR of its own (Linear P-FIT-36, P-FIT-39). So Option A (keep the split) is a migration paused halfway, not a design anyone chose. The real question is "finish or reverse".
- **The split's biggest cost is security, not latency.** The eight original app tables (Plans, Workouts and their Exercises and sets, Workout Sessions and their Exercises and sets, Profiles) still grant `ALL` to `anon` and `authenticated` (`20261016120000_explicit_table_grants.sql:19-32`). Each also has a `FOR ALL` own-row policy (`20261011120000_user_id_text_key.sql:147-233`). The newer tables narrow this, see §2.2. So anyone holding a Clerk session token plus the publishable key, which ships in the app, can still INSERT, UPDATE or DELETE their own rows through PostgREST. That bypasses the checks that moved into `@fitme/services`: finished-session immutability, Library slug checks, `order` allocation and Plan bounds. Moving the writes made the app _use_ the API. It didn't stop anyone _bypassing_ it. Closing that path and keeping client reads on PostgREST pull in opposite directions.
- **Option C (back to the Data API for everything) isn't viable.** The RPCs are dropped (`20261027120000_drop_legacy_rpcs.sql`, FIT-339). The writes need transactions, a fixed lock order, Library slug checks before the transaction (ADR 0010) and request keys, and PostgREST table writes can't do any of that (ADR 0004, "supabase-js REST without RPCs").
- **Latency: the extra hop is real but small, and measured only server-side.**
  - `cle1` and Supabase `us-east-2` are both AWS Ohio.
  - In a 14-day sample of 10 traces, `GET /v1/workout-sessions` took p50 188 ms inside the function. The SQL was 53–68 ms of that. The overhead was a pool connect (25–39 ms), an Upstash rate-limit call (21–44 ms) and transaction setup (≈10 ms) (§2.6).
  - Today's nested PostgREST read of `plans` took p50 521 ms origin time (n=7, 24 h). So query shape matters more than the hop.
  - Phone-observed latency is **unmeasured**: `fitme-mobile` has no `http.client` spans.
- **At today's traffic, operational cost rounds to zero either way.** The Data API saw 33 GETs in 24 h. Vercel bills $0.60 per million invocations, and doesn't bill CPU while the function waits on I/O ([pricing](https://vercel.com/docs/functions/usage-and-pricing)). The decision is about correctness, security and maintenance.

## 1. What the repo already decided

| Source | What it says about reads |
| --- | --- |
| ADR 0004 `:10` | "every client (mobile and web, reads included) eventually reaches data only through `apps/api`" |
| ADR 0004 `:25` | "Removing all direct client access eventually leaves Supabase's Clerk third-party auth trust and the anon key unused by clients." |
| ADR 0011 `:8` | One `/v1` contract for First-party and Third-party apps, no backend-for-frontend; "This is how ADR 0004's 'every client reaches data only through `apps/api`' is meant." Routes are resource-shaped, additive-only, and responses are parsed through each route's schema (`:20-26`). It says nothing more specific about reads. |
| ADR 0003 | Backend apps reach Postgres through `asUser` / `withService`, not Supabase REST. `asUser` runs `SET LOCAL ROLE authenticated`, so RLS applies exactly as for PostgREST. |
| ADR 0013 | The one-open-session rule is a unique index _because_ "the app blocks Start" alone would be a suggestion that other writers ignore. This is the one service invariant Postgres enforces for every writer. |
| Linear P-FIT-36 "Mobile writes through the Public API" (completed 2026-10-24) | "Reads stay on Supabase for now… No API response body goes into the query cache." Out of scope: "Moving any mobile read onto the Public API", "Retiring the RPCs or revoking the tables' write grants". Further Notes: "writing through the API before reading through it is a reversible migration step." |
| Linear P-FIT-39 "The last mobile writes through the Public API" (completed 2026-10-25) | Same "Reads stay on Supabase" line. It lists "Nothing but the UI keeps a finished Workout Session from being edited" as a problem, and wants "no mobile write left… so that retiring the table write grants and the RPCs can follow as one deliberate step". |

Reads moving was **decided (ADR 0004) and deferred (both projects)**, never reconsidered. No Linear project or issue covers it yet: a search for "reads Public API" finds only the server-side `/v1` read routes (FIT-258, FIT-260, FIT-261). No issue covers revoking the write grants either.

## 2. Current state

### 2.1 Every mobile read still on the Data API, and its `/v1` equivalent

`apps/mobile/lib/supabase.ts:11-13` builds one untyped client (`createClient(url, key, { accessToken })`, no `Database` generic) whose bearer is the Clerk session token.

| Hook (file:line) | Select | Consumers | `/v1` route today | Gap |
| --- | --- | --- | --- | --- |
| `usePlansQuery` `hooks/queries/plans.ts:23-36` | `plans` → `workouts` → `sessions:workout_sessions (*)` + `exercises` → `sets` (`:11-21`) | Home, Plans list, `start-workout.ts` | `GET /v1/plans` (`apps/api/src/routes/plans.ts:100`): summaries only (`{ id, name, order, exercise_count, cover }` per Workout) | No exercises/sets and no sessions. `findOpenSession` (`hooks/start-workout.ts:42-45`) reads `workout.sessions`; `useOpenWorkoutSessionQuery` already covers that need. Home needs each Workout's muscle groups and duration, so check whether the summary is enough or the active Plan in full (`GET /v1/plans/active`, `plans.ts:183`) is |
| `usePlanQuery` `plans.ts:42-55` | the same select, one Plan | Plan screen | `GET /v1/plans/{id}` (`plans.ts:204`) | Sessions per Workout only |
| `useWorkoutQuery` `hooks/queries/workouts.ts:17-49` | `workouts` + `plan` + exercises/sets + `sessions` | Workout screen | none | Derive from `GET /v1/plans/{id}`, whose 404 for a soft-deleted Plan replaces the client-side `deleted_at` check (`workouts.ts:43-45`). Or add `GET /v1/workouts/{id}` |
| `useWorkoutExerciseQuery` `hooks/queries/workout-exercises.ts:9-33` | `workout_exercises` + `workout` + `sets` | Plan Workout Exercise screen | none | Derive from the Plan read |
| `fetchWorkoutSession` / `useWorkoutSessionQuery` `hooks/queries/workout-sessions.ts:51-72` | session + `workout → plan` + exercises → sets | Session screen, Summary, and the re-read after start and finish (`:43`, `:153`) | `GET /v1/workout-sessions/{id}` (`apps/api/src/routes/workout-sessions.ts:326`), with `weight_unit` | The API answers `workout {id,name}` / `plan {id,name}` (`workout-sessions.ts:31-57`), not the whole rows. Check what the screens read off them |
| `useOpenWorkoutSessionQuery` `workout-sessions.ts:102-131`, polled every 30 s (`:86`) | `id, plan_id, workout_id, workout(name)` | Home, Workout screen, History | `GET /v1/workout-sessions?status=in_progress&limit=1` (`:280`) | None (the summary has `workout {id,name}` and `plan {id,name}`) |
| `useWorkoutSessionExerciseQuery` `hooks/queries/workout-session-exercises.ts:20-36` | one session exercise + sets | Session Exercise screen | none | Derive from `GET /v1/workout-sessions/{id}` |
| `useExerciseHistoryQuery` `hooks/queries/exercises.ts:10-51` | `workout_session_exercises` by slug + sets + session → workout → plan, filtered client-side, **unbounded** | Exercise history, Summary rows | **none** | `getExerciseHistory` exists in services and backs MCP's `get_exercise_history` (`apps/mcp/src/tools/exercises.ts:126`). It needs a `/v1` route (with `weight_unit` and paging) |
| `useProfileQuery` `hooks/queries/profiles.ts:7-27` | `profiles` row | Settings, onboarding and four weight-showing views | `GET /v1/profile` (`apps/api/src/routes/profile.ts:60`), with `units` | None |
| `apps/web/app/(app)/dashboard/page.tsx:122-134` | `plans`, recent `workout_sessions` (Server Component, typed with `Database`) | Web dashboard | `GET /v1/plans`, `GET /v1/workout-sessions` | See open question 3 |

Already on the API because of shaping: History (`fetchWorkoutSessionHistory`, `workout-sessions.ts:215-290`) and the Weekly goals (`hooks/queries/weekly-goals.ts:20-34`). The summaries carry `volume`, `completed_rep_count` and `personal_records` in one `weight_unit`, worked out in SQL (`apps/api/src/routes/workout-sessions.ts:81-121`). The Weekly streak is a recursive query over `workout_session_progress`. None of that could be done safely from PostgREST tables.

Realtime and Storage: no mobile or web code calls `.channel(` or `supabase.storage` (grep over `apps/mobile` and `apps/web`). There are no Edge Functions either (AGENTS.md, packages/supabase). The Data API is the only _supabase-js_ surface left. Supabase Storage stays in use without supabase-js, though: Library media (`thumbnail_url`, `video_url`, Cover `image_url`) are URLs on the `exercise-media` bucket (AGENTS.md, apps/library `src/served-library.ts`), so closing the Data API must leave Storage alone.

### 2.2 Costs of the split visible in code

1. **The write path through PostgREST is still open.**
   - Grants: `GRANT ALL … TO anon, authenticated, service_role` on every original app table (`20261016120000_explicit_table_grants.sql:19-32`).
   - Policies: `FOR ALL` with no `TO` role, so they apply to `PUBLIC` (`20261011120000_user_id_text_key.sql:147-233`).
   - The checks that moved into services stay app-level only. A client talking to PostgREST directly skips them all: `session_finished` (P-FIT-39's own problem list), slug checks (ADR 0010: "anything writing directly… can store an unknown slug"), `order` allocation under a row lock, Plan bounds, Weekly goal recording. The fake Supabase backend refuses those writes (`apps/mobile/test-utils/fake-workout-backend.ts:488-570`), but that only proves _our app_ doesn't make them.
2. **Newer tables pay a tax to tell the two callers apart.**
   - `personal_records_backend` allows writes only when `session_user = 'fitme'`: "Writes come from the backend's fitme login through asUser, never directly from the Data API authenticator" (`20261031130000_personal_records.sql:31-49`). The same pattern is in `20261031140000_personal_record_initializations.sql:15`.
   - `weekly_goal_changes` still lets a client INSERT its own rows (`20261031120000_weekly_goal_changes.sql:27-37`). So `getWeeklyGoals` defends against forged rows: AGENTS.md, packages/services, `weekly-goals.ts` ("forged gap-free histories cannot move it earlier", "Caller-writable goal timestamps never expand a calendar series").
   - Every new table has to decide how clients may reach it, and the pgTAP `table_grants.test.sql` lists every one.
3. **Two auth paths for the same User.**
   - Supabase trusts Clerk through third-party auth: `config.toml:154-156` locally, the dashboard in production, and Clerk tokens must carry `role: authenticated` ([Supabase × Clerk](https://supabase.com/docs/guides/auth/third-party/clerk)).
   - `current_user_id()` must also reject role-less Clerk OAuth tokens that Supabase accepts (ADR 0001, FIT-92).
   - `apps/api` verifies the same token itself against `CLERK_JWT_KEY` (AGENTS.md, `apps/api/src/auth.ts`).
   - CI and E2E prove both (`clerk:check` with `API_URL`).
4. **Schema coupling with no compile-time or contract check.**
   - Mobile's Supabase client is untyped, and every hook casts (`as unknown as Plan`, e.g. `plans.ts:33`). Mobile doesn't import `@fitme/supabase` at all; only `apps/web` does.
   - So a column or embed rename passes the typecheck and breaks installed builds at runtime. Nothing guards it: no oasdiff, no generated-types check (the Database Types workflow only checks that `database.types.ts` is fresh), no gate.
   - Compare `/v1`: additive-only, oasdiff in CI, mobile types regenerated from `openapi.json` and checked for staleness (`.github/workflows/public-api.yml`), and a minimum version gate that cuts off old builds.
   - PostgREST's own docs advise against exposing tables for exactly this reason: "It is recommended that you don't expose tables on your API schema. Instead expose views and functions which insulate the internal details from the outside world. This allows you to change the internals of your schema and maintain backwards compatibility" ([Schema Isolation](https://docs.postgrest.org/en/stable/explanations/schema_isolation.html), read from [its source](https://raw.githubusercontent.com/PostgREST/postgrest/main/docs/explanations/schema_isolation.rst)). Supabase's hardening guide agrees: "A dedicated schema adds another boundary around your Data API" ([Hardening the Data API](https://supabase.com/docs/guides/database/hardening-data-api)).
5. **Units are read non-atomically.**
   - Four views read weights from one Supabase query and the unit from `useProfileQuery`, a separate request: `workout-session-summary-view.tsx:39`, `workout-session-stats.tsx:84`, `workout-session-exercise-sets-table-view.tsx:66`, `exercise-history-view.tsx:191`.
   - The API's reads run `lockProfileUnits` in the same transaction precisely so a measurement-system conversion can't commit between the two (AGENTS.md, apps/api `src/services.ts`, `Weighed<T>` at `apps/api/src/services.ts:101`).
6. **Read-after-write takes two round trips and two backends.**
   - Every API write throws away the answer and re-reads through Supabase. Start does `POST /v1/workout-sessions` then `fetchWorkoutSession` (`workout-sessions.ts:37-43`), and finish does the same (`:150-153`). The others invalidate their Supabase queries, by design (P-FIT-36: "No API response body goes into the query cache").
   - That's one extra request per write. Both paths reach the same primary, so there's no replica lag (unverified that no read replica is routed in production), but the write and its read can see different auth outcomes or outages.
7. **Two fakes in mobile tests.**
   - `test-utils/fake-workout-backend.ts` (579 lines) and `test-utils/fake-public-api.ts` (1402 lines) share rows. 22 test files import the first and 24 the second.
   - Every read the API gains has to be served by both, or the test moves fakes.
8. **Unbounded reads.** `useExerciseHistoryQuery` has no limit. PostgREST then silently caps at `max_rows = 1000` (`packages/supabase/supabase/config.toml:16`; production's value unverified). A `/v1` route would page explicitly, as History does.

9. **RLS cost is the same on both paths.** `asUser` runs the same policies PostgREST does (ADR 0003). The policies already wrap `current_user_id()` in `(SELECT …)`, which Supabase recommends so the optimizer "cache[s] the results per-statement, rather than calling the function on each row" ([Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)). So neither option changes how much RLS costs. Only the request path around it differs.

### 2.3 Rate limiting

- **Data API:** I found no native per-user limit.
  - Supabase's rate-limit page lists only `/auth/v1` endpoints ([rate limits](https://supabase.com/docs/guides/platform/rate-limits)).
  - The securing guide's do-it-yourself pre-request hook "can only rate-limit `POST`, `PUT`, `PATCH`, and `DELETE` requests" ([Securing your API](https://supabase.com/docs/guides/api/securing-your-api)). The reason is that PostgREST runs GET and HEAD in a `READ ONLY` transaction, where a counter can't be written ([PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html), [source](https://raw.githubusercontent.com/PostgREST/postgrest/main/docs/references/transactions.rst)).
  - **So client reads on the Data API can't be rate-limited per User at all.**
- **Public API:** every verified caller is counted in Upstash, 300 requests per 60 s by default (`apps/api/src/rate-limit.ts:16`). It fails open after 1 s.
  - Moving reads adds their requests to that budget: History pages of 50, the 30 s open-session poll, screen refetches. Check the default against a heavy session before the switch.

### 2.4 Keys

- The app ships `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Supabase says publishable keys are "Safe to expose", and the legacy `anon` and `service_role` keys are being deprecated "by the end of 2026" ([API keys](https://supabase.com/docs/guides/api/api-keys)).
- In the 24 h edge log sample, 29 of 33 Data API reads carried a publishable key. The other 4 carried something else, presumably the legacy key from older builds (unverified).
- Under Option A or C, the legacy key's retirement needs every installed build moved to a publishable key first. Under B the key goes away with the reads.

### 2.5 Traffic (Supabase edge logs, 24 h ending 2026-11-02)

| `GET /rest/v1/<table>`      | requests | p50 origin ms | p95 origin ms |
| --------------------------- | -------- | ------------- | ------------- |
| `workout_sessions`          | 12       | 119           | 368           |
| `plans`                     | 7        | 521           | 659           |
| `profiles`                  | 6        | 282           | 422           |
| `workout_session_exercises` | 6        | 168           | 359           |
| `workouts`                  | 2        | 204           | 283           |

- There were no Data API writes in the window. At this volume one day proves little about which builds are still installed. The edge-log watch in §5 step 7 is the real signal.
- `response.origin_time` is the time from Supabase's gateway to the origin, not what the phone sees. n is tiny.
- `plans` is slow because of its nested select: every Workout's sessions, Exercises and sets (`plans.ts:11-21`).

### 2.6 Public API timings (Sentry `fitme-api`, production, 14 d, traces sampled at 0.2)

| Segment                                  | n   | p50 ms | p75 ms |
| ---------------------------------------- | --- | ------ | ------ |
| `GET /v1/workout-sessions`               | 10  | 188    | 267    |
| `GET /v1/weekly-goals`                   | 10  | 224    | 232    |
| `GET /v1/client-config` (no auth, no DB) | 10  | 49     | 59     |

Inside the authenticated reads, the spans' p50s:

- `pg-pool.connect` 25–32 ms and `pg.connect` 29–39 ms
- `begin` 3–5 ms
- `set local role authenticated` 2–3 ms
- `set_config` 4–6 ms
- `commit` 3 ms
- the actual query: 53–68 ms for the History page, 17 ms for the streak
- `POST …upstash.io/pipeline` 21–44 ms, with 25 such spans per 10 requests (more than one call per request; probably the limit plus Rate Limit Analytics, unverified)

So about 50–80 ms of each read is deployment-specific overhead that PostgREST doesn't pay: a fresh pool connection per request on these instances, and the Upstash call. Another ≈10 ms is the `asUser` round trips. PostgREST also runs each request in a transaction and sets the role and `request.jwt.claims` per request, but how it batches that is unverified. These function-internal times and §2.5's gateway-to-origin times are different measurements, so don't subtract one from the other. Geography isn't the cost here. `cle1` is AWS `us-east-2`, the Supabase project's region (Supabase `get_project`: `us-east-2`; `cle1` = AWS `us-east-2` per [Vercel regions](https://vercel.com/docs/regions), as cited in `move-functions-off-supabase.md:164`, not re-fetched here; `apps/api/vercel.json`). The Supavisor transaction pooler is the documented choice for serverless clients ("Use it for serverless and edge functions, which open many short-lived connections"), and the docs recommend a module-scope client with a pool of 1 ([Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)). Vercel's own guidance is to place functions "close to your data source" ([regions](https://vercel.com/docs/functions/configuring-functions/region)), which this deployment already does.

Two caveats:

- How much of the pool connect is a cold start or pool idle-out vs steady state is unverified. Fluid compute reuses instances and pre-warms production ([fluid compute](https://vercel.com/docs/fluid-compute)), so it should shrink as traffic grows.
- Phone → `api.fitmeproject.com` vs phone → `<ref>.supabase.co` round-trip time is **unmeasured**. Supabase doesn't document where its API gateway terminates ([Data API](https://supabase.com/docs/guides/api)). The edge logs carry Cloudflare `colo` fields, but I didn't verify the topology.

## 3. The options

### Option A: keep the split (reads on the Data API, writes on `/v1`)

|  |  |
| --- | --- |
| Security surface | **Worst of the three.** Both doors are open: the API, and PostgREST with full table grants. Closing PostgREST _writes_ while keeping reads means rewriting every table's policies into separate `FOR SELECT` (client) and `session_user = 'fitme'` write policies, as `personal_records` does, and keeping that discipline on every future table. |
| Schema coupling | Shipped builds depend on table and column names and embed paths, untyped (§2.2.4). Any rename is an expand/contract dance behind the gate, with no tool to tell you a build reads the column. |
| Rate limiting | Reads can't be limited per User (§2.3). |
| Latency | Fastest for simple reads (one hop, no pool connect or limiter). Not for nested ones (§2.5). Writes pay two requests (§2.2.6). |
| Offline / caching | Unchanged. react-query caches in memory. No offline persistence of Supabase reads (the MMKV caches are the Library's and Arnold's). |
| Test doubles | Two fakes forever. |
| Arnold / MCP / web reuse | None. Each Supabase select is mobile-only logic duplicating a service read (`getPlan`, `getWorkoutSession`) in a different shape. Third-party apps see a different read model than the First-party app, against ADR 0011's "First-party apps exercise the same routes outsiders get". |
| Ops cost | Two client-facing backends to configure per build (`EXPO_PUBLIC_SUPABASE_*` and `EXPO_PUBLIC_API_URL`). FIT-522: a build shipped with the wrong API host and History never loaded while the rest worked. |

**A variant done properly: a PostgREST `api` schema of views.** This follows the PostgREST and Supabase advice (§2.2.4). Take `public` out of the exposed schemas, which is `[api] schemas` in `config.toml:11` and the dashboard's "Exposed schemas" ([custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)). Expose read-only views shaped like `/v1` in their own schema, and grant nothing writable. That fixes the write hole and the table coupling and keeps one hop. It still leaves two auth paths, two fakes, no per-User read limit, a second hand-versioned read contract next to `/v1` (one more thing ADR 0011 rejected). The units problem is solvable there: a view that joins the Profile's unit reads it in the same statement, and so the same snapshot, as the weights. The cost is a third copy of the services' read logic, in SQL. It's the honest alternative if the client hop turns out to matter a lot (§5, open question 1).

### Option B: move the reads to `/v1`, then close the Data API to clients

|  |  |
| --- | --- |
| Security surface | Smallest. With `public` removed from the exposed schemas (or the Data API disabled), "none of the auto-generated REST endpoints respond, regardless of grants or RLS" ([hardening](https://supabase.com/docs/guides/database/hardening-data-api)). RLS stays the safety net for `asUser` (ADR 0003). The Clerk trust and the anon/publishable key become unused, as ADR 0004 `:25` expects. |
| Schema coupling | Clients depend only on `/v1`, which is additive-only, checked by oasdiff, typed and gated. Tables can be refactored freely. |
| Rate limiting | Every read is counted per User (and later per OAuth client or API key, ADR 0011). |
| Latency | Roughly +60–90 ms of server-side overhead per read at today's p50 (§2.6: pool connect, Upstash, `asUser` round trips), much of which is improvable: a long-lived pool, a cheaper limiter path for GETs, fewer `asUser` round trips. Writes lose their follow-up Supabase read, so a start or finish goes from two requests to one. Client RTT unmeasured. |
| Offline / caching | Same react-query setup. API responses become the cache (the opposite of P-FIT-36's rule), so query shapes change from table rows to `/v1` resources. Optional later: `ETag`/304 like `apps/library`' `deviceCache`. |
| Test doubles | One fake (`fake-public-api.ts`). `fake-workout-backend.ts` is deleted at the end. |
| Arnold / MCP / web reuse | Reads become the same services MCP and Arnold already call (`getPlan`, `getWorkoutSession`, `getExerciseHistory`). The web app can use the same routes. Third-party apps get exactly what the app uses. |
| Ops cost | Negligible at current volume ($0.60/M invocations, CPU billed only while running; [pricing](https://vercel.com/docs/functions/usage-and-pricing)). The real cost: **the API becomes a single point of failure for the whole app**, not just writes (FIT-522). Needs a release check on `EXPO_PUBLIC_API_URL` and an alert on `fitme-api` availability. |

The real work is the shape gaps in §2.1. One route is missing outright (Exercise history). For the Workout, Workout Exercise and Session Exercise reads, either derive them client-side from the parent resource or add routes. Plans have no per-Workout sessions, and the open-session query already replaces those.

### Option C: back to the Data API for reads and writes

|  |  |
| --- | --- |
| Security surface | Back to RLS as the only check on writes. Every service invariant would have to move back into Postgres (triggers, RPCs) or be dropped. |
| Schema coupling | Worst: writes coupled to tables too. |
| Rate limiting | Writes could get the do-it-yourself pre-request hook (§2.3); reads still couldn't. |
| Latency | One hop everywhere. |
| Arnold / MCP / web reuse | Breaks ADR 0004: one implementation in services shared by every app. MCP and Arnold stay on services (ADR 0003), so the logic would exist twice. |
| Ops cost | A second client migration (installed builds already write through `/v1`), and RPCs re-created that FIT-339 just dropped. |

## 4. Why Option C isn't viable

- **The RPCs are gone.** `20261027120000_drop_legacy_rpcs.sql` (FIT-339) dropped the last of them, `workout_session_plan_changes` included. The Plan Update now exists only in `packages/services/plan-update.ts`.
- **The writes need more than PostgREST table writes give.** ADR 0004 rejected "supabase-js REST without RPCs" because "No transactions, so multi-table writes like `update_plan` could half-apply". On top of transactions, the services take table locks in `deleteUserData`'s order to avoid deadlocking with account deletion, row-lock parents before allocating `order`, and use `requestKey` for idempotent appends (AGENTS.md, packages/services).
- **Library checks can't run in Postgres.** Plan and session writes check slugs against the Library _before_ the transaction, and pick Covers through `pickCovers` (ADR 0010, ADR 0014). Postgres can't call the Library (ADR 0010).
- **ADR 0011 makes `/v1` the First-party contract.** Going back to tables for the app means two contracts again, and Third-party apps would still need `/v1`.
- **It reverses a migration that already shipped.** Installed builds already write through the API, so Option C needs another app release plus a gate bump.

The one thing C would buy, no extra hop, is available more cheaply from the Option A variant (views) for reads only.

## 5. Recommendation and migration sketch (Option B)

**Recommend B, conditioned on:**

1. A release check that the build's `EXPO_PUBLIC_API_URL` answers `/health` and `/v1/client-config` (FIT-522's gap), so a bad host can't take the whole app down.
2. Client-side latency measured first:
   - Turn on Sentry `http.client` spans in mobile for both hosts. They're absent today: traces are configured at 0.1, so check whether `fetch` from `expo/fetch` is instrumented (unverified).
   - Compare per screen.
   - If the Plans or Home screen gets noticeably slower, do the server-side fixes (pool, limiter) before moving that read, not instead of moving it.

**Order** (each step its own PR, reads switched one hook at a time, the Supabase hook deleted in the same PR):

1. **Profile**: `useProfileQuery` → `GET /v1/profile` (route and fake route exist). It's the lowest risk, and the four weight views can take `units` from it.
2. **Open Workout Session**: `useOpenWorkoutSessionQuery` → `GET /v1/workout-sessions?status=in_progress&limit=1`. Then make `findOpenSession` (`start-workout.ts:42`) use it, which removes the need for `sessions` inside the Plan reads.
3. **Workout Session and its Exercise**: `fetchWorkoutSession` → `GET /v1/workout-sessions/{id}`. Start and finish then put the API's answer straight into the cache (no second read). The Session Exercise screen selects from the same query.
4. **Plans**: `usePlanQuery` → `GET /v1/plans/{id}`. The Workout and Workout Exercise screens select from it, or get `GET /v1/workouts/{id}` if the Plan read is too heavy. `usePlansQuery` → `GET /v1/plans` (summary) plus `GET /v1/plans/active` for Home if Home needs Exercises.
5. **Exercise history**: add `GET /v1/exercise-history?exercise_slug=…` (or a resource-shaped equivalent) over `getExerciseHistory`, paged, with `weight_unit`. Then switch the hook.
6. **Web dashboard** (open question 3).
7. **Close the door.** Once `MIN_APP_VERSION` cuts off every build that reads through PostgREST (the edge logs show the last one go):
   - Remove `public` from the Data API's exposed schemas, or disable the Data API (the hardening page). This step does the work.
   - **Don't** revoke `authenticated`'s table grants. `asUser` _is_ `authenticated` (`SET LOCAL ROLE authenticated`, ADR 0003), so that would break the API.
   - Revoke `anon`'s grants: nothing server-side uses `anon` (`asUser` uses `authenticated`, `withService` uses `service_role`). Update `table_grants.test.sql` in the same migration.
   - Optionally narrow the `FOR ALL` policies to `TO authenticated`, and drop the `session_user = 'fitme'` clauses once no other session user can reach the tables. It's harmless to keep them as defence in depth.
   - Remove `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `lib/supabase.ts`, `@supabase/supabase-js` from mobile, and `test-utils/fake-workout-backend.ts`.
   - Remove the Clerk third-party trust from the hosted project and `config.toml` (and the `clerk:check` CI step), once web is off it too.
   - Write the decision up as an ADR, or amend ADR 0004's consequences.

Expand/contract applies throughout: the Data API stays readable until the gate cuts off the last reading build, exactly like the RPC retirement (ADR 0004).

**Server-side follow-ups that make B cheaper** (independent of the migration):

- Find out why each request opens a new pool connection (instance churn at low traffic vs the pool's idle timeout in `packages/db/src/client.ts`).
- Look at the limiter's Upstash calls per request.
- Fold `set local role` and `set_config` into one statement where `asUser` allows it.

## 6. Open questions

1. How much does the extra hop cost on a phone? Unmeasured. It decides between B and the A-with-views variant for the hottest screens (Home, Plans).
2. Should derived reads (Workout, Workout Exercise, Session Exercise) select from their parent resource on the client, or get their own routes? Resource-shaped routes (`GET /v1/workouts/{id}`) are allowed by ADR 0011; screen-shaped ones aren't.
3. Web: does the Next.js dashboard call `/v1` over HTTP, which follows ADR 0011 ("First-party apps")? Or does it import `@fitme/services` through `asUser` like the backend apps, which ADR 0003 doesn't list web among? Either way it leaves PostgREST.
4. Should the rate limit (300 per 60 s) be split for reads and writes, or raised once reads are counted?
5. Should `/v1` reads send `ETag`/`Cache-Control: private` like `apps/library`, so foreground refetches are cheap 304s?
6. How do clients get Personal records retained for Exercise history (ADR 0015)? The new route could carry them, as the History summaries do.

## Still unverified

- Phone-observed latency on either path (`fitme-mobile` has no `http.client` spans).
- Where Supabase's API gateway terminates relative to `us-east-2`.
- Whether the API's pool connect per request comes from cold instances or the pool's idle timeout. Also why there are about 2.5 Upstash calls per request.
- Production PostgREST `max_rows`.
- What credential the 4 non-publishable Data API requests in the 24 h sample carried.
- That no production read is routed to a read replica (relevant to read-after-write across the two backends).
- That disabling the Data API (or removing `public` from its exposed schemas) leaves Storage's public and render URLs, which the Library's media use, untouched. Also that nothing else in use depends on it: the grep finds no Realtime or Storage client calls in mobile or web. Supabase Studio and the CLI use their own paths, also unverified.

## Sources

Repo:

- `docs/adr/0001-clerk-user-id-as-identity-key.md`, `0003-apps-reach-postgres-through-asuser-and-withservice.md`, `0004-business-logic-in-services-not-rpcs.md:10,25`, `0010-exercise-slugs-checked-in-the-tool-layer-not-postgres.md`, `0011-one-public-api-every-credential-through-clerk.md:8,20-26`, `0013-one-open-workout-session-per-user.md`, `0014-…`, `0015-…`
- `apps/mobile/lib/supabase.ts:11-13`; `apps/mobile/hooks/queries/{plans,workouts,workout-exercises,workout-sessions,workout-session-exercises,exercises,profiles,weekly-goals}.ts`; `apps/mobile/hooks/start-workout.ts:42-45`; `apps/mobile/test-utils/{fake-workout-backend,fake-public-api}.ts`
- `apps/web/app/(app)/dashboard/page.tsx:122-134`
- `apps/api/src/routes/{plans,profile,workout-sessions,weekly-goals}.ts`; `apps/api/src/rate-limit.ts:16`; `apps/api/src/services.ts:101`; `apps/api/vercel.json`; `apps/mcp/src/tools/exercises.ts:126`
- `packages/supabase/supabase/config.toml:11,16,154-156`
- Migrations: `20261011120000_user_id_text_key.sql:147-233`, `20261016120000_explicit_table_grants.sql:19-32`, `20261027120000_drop_legacy_rpcs.sql`, `20261031120000_weekly_goal_changes.sql:27-37`, `20261031130000_personal_records.sql:31-49`, `20261031140000_personal_record_initializations.sql:15`
- `packages/supabase/supabase/tests/database/table_grants.test.sql`
- `docs/research/move-functions-off-supabase.md`, `docs/research/remove-rpcs-business-layer.md` (region, pooler and driver background)
- Linear: P-FIT-36 "Mobile writes through the Public API", P-FIT-39 "The last mobile writes through the Public API", FIT-522 (wrong `EXPO_PUBLIC_API_URL` in build 81), FIT-339, FIT-258/260/261

Production telemetry (read-only, 2026-11-02):

- Sentry `provorovdev/fitme-api`, spans dataset, 14 d, `sentry.environment:production`
- Sentry `provorovdev/fitme-mobile`, spans dataset, 30 d: no `http.client` spans
- Supabase project `zujyynezicwviytereod` (`us-east-2`), `edge_logs`, 24 h, `/rest/v1/*`

External:

- Supabase, Hardening the Data API: https://supabase.com/docs/guides/database/hardening-data-api
- Supabase, Securing your API: https://supabase.com/docs/guides/api/securing-your-api
- Supabase, Using custom schemas: https://supabase.com/docs/guides/api/using-custom-schemas
- Supabase, Data API overview: https://supabase.com/docs/guides/api
- Supabase, Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, Third-party auth with Clerk: https://supabase.com/docs/guides/auth/third-party/clerk
- Supabase, API keys: https://supabase.com/docs/guides/api/api-keys
- Supabase, Rate limits: https://supabase.com/docs/guides/platform/rate-limits
- Supabase, Connecting to Postgres (Supavisor transaction mode): https://supabase.com/docs/guides/database/connecting-to-postgres
- PostgREST, Schema Isolation: https://docs.postgrest.org/en/stable/explanations/schema_isolation.html (source read: https://raw.githubusercontent.com/PostgREST/postgrest/main/docs/explanations/schema_isolation.rst)
- PostgREST, Transactions (GET runs READ ONLY): https://docs.postgrest.org/en/stable/references/transactions.html (source read: https://raw.githubusercontent.com/PostgREST/postgrest/main/docs/references/transactions.rst)
- Vercel, Fluid compute pricing: https://vercel.com/docs/functions/usage-and-pricing
- Vercel, Fluid compute: https://vercel.com/docs/fluid-compute
- Vercel, Configuring regions: https://vercel.com/docs/functions/configuring-functions/region
- Vercel, Regions list: https://vercel.com/docs/regions
