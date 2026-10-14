---
status: accepted
date: 2026-10-14
---

# Backend apps reach Postgres directly through `asUser` and `withService`

The backend apps (`apps/api`, `apps/mcp`, `apps/coach`, `apps/webhooks`) each verify identity at their own edge and then talk to Postgres directly, through Drizzle on `pg` over the Supavisor transaction pooler. They don't go through Supabase's REST API, and they don't call each other over HTTP. `packages/db` has exactly two doors: `asUser(userId, fn)` opens a transaction, runs `SET LOCAL ROLE authenticated` and sets `request.jwt.claims` (`sub` = the User id) with `set_config(…, true)`, so RLS, `current_user_id()` and the retired-id triggers (ADR 0001) work exactly as they do for PostgREST. `withService(fn)` does the same as `service_role`, for system work such as webhooks. All apps share one least-privilege login, `fitme`, which can switch to `authenticated` or `service_role` and has no direct grants. This supersedes ADR 0002: MCP no longer signs Supabase tokens.

## Considered options

- **Direct DB through `asUser`/`withService` (chosen).** One transaction per request gives real atomicity to the business layer (ADR 0004). RLS stays the safety net.
- **Coach and MCP call `apps/api` over HTTP.** That's an extra hop and an internal auth scheme (a service identity plus a user-id header), and the caller can still claim any User, so the blast radius barely shrinks.
- **Use the default `postgres` login.** It owns the tables, so a query that slips past the two doors silently skips RLS, where `fitme` (no grants of its own) fails with "permission denied". It can also run DDL and read `auth`/`vault`, and it's shared with the dashboard, CLI and migrations, so rotating it breaks tooling. Kept only as the fallback.
- **A separate login per app, or a separate service login for webhooks.** Rejected, so that any app can run future business logic that needs to bypass RLS. One login keeps a single connection pool.

## Consequences

- **Every backend credential is service-role strength.** Anyone holding `fitme` can act as any User or bypass RLS, the same exposure as ADR 0002's signing key and the service-role key. It lives only in server environments. `withService` should appear only where bypassing RLS is the point, and review enforces that.
- **Session state leaks across clients on the pooler.** The transaction pooler doesn't reset connections between clients, so a session-level `SET ROLE` or `set_config(…, false)` carries over to other requests, and other Users can then read the data. Tested locally: 35 of 60 later queries read the wrong User's row. `packages/db` never exports the raw client, and session-level role/claim changes are banned in code.
- The User id passed to `asUser` only ever comes from a verified token (Clerk session, Clerk OAuth, or the Coach's channel auth), never from request or tool input.
- Every `public` table must have RLS, and a pgTAP check enforces it: a table without RLS keeps Supabase's default grants and is readable through `authenticated`.
- Use `pg` (with Vercel's `attachDatabasePool`), not postgres.js, which hung under concurrency through the pooler.
- Each app sets `application_name` so DB activity stays attributable.
- **Assumption:** hosted Supavisor accepts the custom `fitme` login (`fitme.<project-ref>`) and behaves like the local test did (Supavisor 2.9.13). If it doesn't, fall back to the `postgres` login through the same two doors, or to Supabase's dedicated PgBouncer.
