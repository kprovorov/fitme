---
status: accepted
date: 2026-11-09
---

# The Data API is closed; every app reaches User data through the Public API

Supabase's Data API (PostgREST, and the GraphQL endpoint that goes with it) is switched off: on the hosted project (FIT-552) and in `packages/supabase/supabase/config.toml`, so local stacks match. `anon` loses every table grant on `public` (`20261109120000_revoke_anon_table_grants.sql`) as a second lock, and Supabase's Clerk third-party auth trust is gone, since nothing verifies a Clerk token against Postgres any more. The Public API (`apps/api`, `/v1`) is the only door to a User's data, for Fitme's own apps and for anyone else; the backend apps still reach Postgres through `asUser` / `withService` (ADR 0003), and `@fitme/services` is on the path of every read and write.

This amends ADR 0004 and ADR 0011. ADR 0004 said every client "eventually reaches data only through `apps/api`" and expected the Clerk trust and the anon key to end up unused; that is now true, and this ADR is the record of the step. ADR 0011 said the Public API serves one contract to every caller; it is now the only contract. ADR 0007's exception stands: the Library API is called directly, because the Library is not User data in Postgres.

Supabase Storage stays. The `exercise-media` bucket is public and served over `/storage/v1`, which the Data API's toggle doesn't touch, so the Library's thumbnails and videos keep working without PostgREST or the Clerk trust.

## Considered options

The research note `docs/research/supabase-data-api-vs-public-api-reads.md` (2026-11-02) compared three.

- **Everything on the Public API (chosen, its Option B).** One contract, additive-only and checked by oasdiff, so a shipped build depends on `/v1` and never on a table or column name. Every read is counted in the per-User rate limit. The services can't be skipped, so the checks that moved into them (ADR 0004) hold for every writer. Reads become the same service calls MCP, Arnold and the web app already make, and mobile tests need one fake instead of two.
- **Keep the split: reads on the Data API, writes on `/v1` (its Option A).** Fastest for a simple read and no work to do, but it leaves both doors open: the eight original app tables granted `ALL` to `anon` and `authenticated` with a `FOR ALL` own-row policy, so anyone holding a Clerk session token and the publishable key that ships in the app could insert, update or delete their own rows through PostgREST, around finished-session immutability, the Library slug checks, `order` allocation and the Plan bounds. It also means two contracts, two fakes, no per-User read limit, and shipped builds coupled to table names. The honest variant — a read-only `api` schema of views shaped like `/v1` — fixes the write hole and the coupling, but adds a third copy of the services' read logic, in SQL, and a second hand-versioned read contract next to `/v1`, which ADR 0011 rejected.
- **Everything back on the Data API (its Option C).** Not viable: the RPCs are dropped (`20261027120000_drop_legacy_rpcs.sql`, FIT-339), and PostgREST table writes can't do transactions, a fixed lock order, the Library slug check before the transaction (ADR 0010) or request keys.

## The latency it costs

Measured server-side, from Sentry (`provorovdev/fitme-api`) and Supabase edge logs on 2026-11-02, in the research note's §2.5 and §2.6:

- `GET /v1/workout-sessions` took p50 188 ms inside the function (n=10, 14 days), of which the SQL was 53–68 ms. The rest is deployment overhead PostgREST doesn't pay: a pool connect (25–39 ms), an Upstash rate-limit call (21–44 ms) and `asUser`'s round trips (≈10 ms). So a simple read costs roughly 60–90 ms more than PostgREST would.
- A nested PostgREST read of `plans` took p50 521 ms origin time (n=7, 24 h), so query shape already mattered more than the hop: the Plans read got faster by moving.
- A write got cheaper: it no longer re-reads through Supabase afterwards, so starting or finishing a Workout Session is one request instead of two.
- `cle1` and the Supabase project are both AWS `us-east-2`, so geography isn't the cost.
- The overhead is improvable without a contract change: a longer-lived pool, a cheaper limiter path for GETs, fewer `asUser` round trips, or `ETag` / 304 as `apps/library` does.

Phone-side `http.client` spans for `/v1` requests landed with FIT-538, so each route's p50/p95 can be read off `fitme-mobile` (`span.op:http.client` grouped by `span.description`). No phone-side numbers are quoted here: they only accumulate after a release, and none were pulled for this decision. The server-side figures and the security argument carried it.

## Consequences

- **The Public API is a single point of failure for the whole app**, not just for writes. It needs an availability alert on `fitme-api` and a release check on `EXPO_PUBLIC_API_URL` (FIT-522 shipped a build with the wrong host, and History never loaded while the rest worked). The minimum version gate is what made the switch safe: the last build that read through the Data API is below the minimum, so it shows the update-required screen instead of empty screens.
- **Reopening it is a deliberate act.** Switching the Data API back on would also need the Clerk trust and `anon`'s grants back. In practice that means nothing can quietly start depending on PostgREST again.
- **`anon` keeps schema `USAGE` and `EXECUTE` on `current_user_id()`**, which the policy of every app table calls (they target `PUBLIC`, so the function has to stay callable by every role a policy can run under). Without a table grant neither reaches a row. `authenticated` and `service_role` keep every grant: `asUser` and `withService` run as those.
- **RLS is still the safety net**, not dead weight: `asUser` runs as `authenticated` with the Clerk id in `request.jwt.claims`, so every policy, `current_user_id()` and the retired-id triggers (ADR 0001) apply to the services exactly as they did to PostgREST. Every new `public` table still needs RLS and its own grants (`fitme_login.test.sql`, `table_grants.test.sql`).
- **Local stacks lose Supabase Studio and the local Supabase MCP server.** The CLI refuses to start Studio without the REST capability, because its table editor reads rows through PostgREST, so `[studio]` is off too; and a stack with the Data API off reports no `MCP_URL` (the gateway answers 404 on `/mcp`), so `scripts/setup.sh` warns and skips registering `supabase-local` for a worktree. Inspect a local database with `psql` on the stack's `database.sql` endpoint or with `supabase db` commands. `supabase gen types` and `drizzle-kit pull` are unaffected: both connect to Postgres directly, and so are the hosted Supabase MCP tools, which go through the Management API.
- **The Clerk Supabase integration no longer matters.** Session tokens may still carry `role: authenticated`; nothing reads it. The E2E workflow stops trusting the development instance on its preview branch and proves the session token against the Public API instead (`pnpm api clerk:check`), which is the only path a User's data travels.
- **The anon and publishable keys are unused by clients.** They are not secrets, and the stack still mints them; no app ships one.
