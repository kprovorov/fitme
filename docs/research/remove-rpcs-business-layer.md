# Moving the RPC logic into `apps/api` with Drizzle

Research note, 2026-10-14. It belongs with
[move-functions-off-supabase.md](./move-functions-off-supabase.md) (§8 there links
here). The user plans a public API, so this note goes deep on **option (b): the API
talks to Postgres directly through Drizzle with real transactions**. It compares that
only briefly against the alternatives.

Repo facts are cited as `path:line`. Migration paths are relative to
`packages/supabase/supabase/migrations/`. External claims link to the primary source.
Anything I couldn't check is marked **(unverified)**.

## TL;DR

- **12 database functions exist. 9 are multi-statement and atomic, and 4 take explicit
  locks** (§1). Drizzle can reproduce all of it: `db.transaction`, isolation levels, and
  raw `sql` for `LOCK TABLE`. The lock order and the ON CONFLICT race have to be ported
  carefully, test first.
- **Connection.** Use the Supavisor **transaction pooler (6543)** with **node-postgres
  (`pg.Pool` + `drizzle-orm/node-postgres` + `attachDatabasePool`)**, not postgres.js.
  - Vercel's `attachDatabasePool` doesn't recognize postgres.js (source).
  - On a local Supavisor 2.9.13, postgres.js intermittently **hung** on concurrent
    non-transaction queries. `pg` didn't (§9.3).
  - Pin the Vercel region to `cle1`, next to `us-east-2`.
- **Auth architecture (§9, settled pending review).** There is no internal HTTP hop:
  - `apps/api`, `apps/mcp` and `apps/coach` each import `packages/services` →
    `packages/db` and verify identity at their own edge.
  - Each app has its own least-privilege Postgres login (`fitme_api`, `fitme_mcp`,
    `fitme_coach`). Only `apps/webhooks` gets an admin-capable login.
  - This replaces ADR 0002. The draft is in §9.6.
  - **Verified on a throwaway local stack:** RLS is enforced and nothing leaked between
    users across 300 concurrent transactions. But a **session-level** `SET ROLE` or
    `set_config(…, false)` by *any* client leaks to other clients through the pooler,
    because transaction mode does no reset. So `withUser` must be the *only* way code
    talks to the database (§9.3).
- **Ownership.** Run every User request inside one transaction that starts with
  `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', …, true)`.
  Drizzle documents this "rls" wrapper pattern, though it isn't yet in the library.
  RLS, `current_user_id()` and the retired-id triggers then keep enforcing everything,
  unchanged. A privileged connection with app-level `WHERE user_id = …` is the
  alternative ADR 0002 already rejected.
- **Migrations.** Keep the Supabase CLI SQL migrations as the source of truth. Use
  `drizzle-kit pull` to generate the Drizzle schema, with a CI staleness check like the
  Database Types workflow. pgTAP stays, and `@fitme/supabase` types stay while anything
  still reads through supabase-js.
- **Shape.**
  - `packages/db`: Drizzle schema, client, and the `withUser(tx)` RLS helper.
  - `packages/services`: plans, sessions and profile logic.
  - Both are used by `apps/api` (mobile + public `/v1`), `apps/mcp` and `apps/coach`, each with its own login (§9).
- **Public API.** Clerk **API keys** (user-scoped, revocable, usage-priced) for scripts.
  Clerk OAuth (already used by MCP) for third-party apps. `@hono/zod-openapi` for the
  spec. `@vercel/firewall` `checkRateLimit` with a per-user key.

## 1. Inventory (current definitions only)

Most current definitions are in `20261011120000_user_id_text_key.sql`. The exception is
`current_user_id()`, in `20261013120000_current_user_id_requires_authenticated_role.sql:17-36`.

| Function | Defined at | What it does | Atomicity / locks | Security | Callers |
|---|---|---|---|---|---|
| `current_user_id()` | `20261013120000…:17` | JWT `sub`, only when `role = authenticated` and the id isn't retired | STABLE sql | SECURITY DEFINER | Every RLS policy and RPC |
| `private.reject_retired_user_id()` (trigger) | `20261011120000…:56`, on `profiles`/`plans`/`workout_sessions`/`conversations` `:124-138` | Rejects writes under a retired id (42501) | Row trigger | SECURITY DEFINER | Every writer, service role included |
| `deactivate_deleted_plan()` (trigger) | `20261004000000…:140-156` | `is_active = false` when `deleted_at` is set | Row trigger | Invoker | Every `plans` write |
| `activate_plan(plan_id)` | `:255` | Ownership check, deactivate all, activate one, re-check | 2 UPDATEs, one transaction | DEFINER | Mobile `hooks/queries/plans.ts:84`, MCP `tools/plans.ts:409`, ai-agent `tools/activate_plan.ts:9`, `create_plan` |
| `convert_measurement_system(text)` | `:303` | Unit switch, rescaling profile, template set weights and session weights | 4 UPDATEs over 6 tables | DEFINER | Mobile `hooks/queries/settings.ts:10` |
| `create_plan(jsonb)` | `:393` | Inserts the plan, workouts, exercises and sets, then activates | Multi-table INSERT | DEFINER | Mobile `hooks/queries/plans.ts:56-57`, MCP `tools/plans.ts:316` |
| `store_plan(jsonb, text)` | `:484`, grant `:685` | Older create path | Multi-table INSERT | DEFINER | **None.** Its only caller ever was the server-side ai-agent `create_plan` tool, removed in `8b2e79f` (first in `v1.21.0`). No mobile code ever called it (`git log -S store_plan`). AGENTS.md: never use it. Safe to drop now |
| `update_plan(uuid, jsonb, text)` | `:579`, grant `:686` | Updates metadata, deletes and recreates all workouts | DELETE + INSERTs | DEFINER | MCP `tools/plans.ts:216` |
| `start_workout_session(uuid)` | `:694` | Clones the template into a session. Returns the existing open session if there is one. Refuses deleted plans | Multi-INSERT, `ON CONFLICT (workout_id) WHERE finished_at IS NULL DO NOTHING` (partial unique index from `20261003000000_one_open_session_per_workout.sql`) | DEFINER | Mobile `hooks/queries/workout-sessions.ts:29-30`, MCP `tools/sessions.ts:348` |
| `finish_workout_session(uuid)` | `:779` | Idempotent finish, then moves the workout to the end of the queue | `LOCK TABLE workout_sessions IN ROW EXCLUSIVE MODE`, plan lock, `FOR UPDATE` on workouts. The lock order avoids deadlocks with `update_plan`/`delete_user_data` | DEFINER | Mobile `hooks/queries/workout-sessions.ts:87`, MCP `tools/sessions.ts:222` |
| `delete_user_data(text)` | `:892` | Locks tables, refuses rekeyed ids (55000), retires the id, deletes rows | Table locks + DELETEs | DEFINER, **service_role only** (`:1051,1054`) | `clerk-webhook/index.ts:36` |
| `rekey_user(text, text)` | `:952` | Moves all rows to a new id and retires the old one | Table locks + UPDATEs | DEFINER, **service_role only** (`:1052,1055`) | `scripts/clerk-migration.ts:388` (one-shot) |

Other writes already skip the RPCs:

- Mobile writes tables directly in `hooks/mutations/{workout-exercise-sets,profiles,auth}.ts`
  and `hooks/queries/{plans,workout-session-exercises,workout-session-exercise-sets}.ts`.
- The ai-agent's plan-edit tools are **not atomic**: `replace_exercise_in_workout.ts:28-54`
  makes three separate PostgREST calls.

pgTAP covers the functions directly:

- `tests/database/`: `rpc_ownership`, `start_workout_session`, `deleted_plan_rpcs`,
  `user_data_functions`, `current_user_id`, `user_isolation`, `workout_sessions_rls`.
- `tests/`: `finish_workout_session`, `plan_rpc_user_id`.

## 2. Options at a glance

| | (a) supabase-js REST, no transactions | **(b) Drizzle over the pooler, real transactions** | (c) Keep the RPCs, thin TypeScript wrapper |
|---|---|---|---|
| Atomicity | One transaction per PostgREST request. Multi-step writes can half-apply | Full (`db.transaction`, `LOCK`, `FOR UPDATE`) | Full (PL/pgSQL) |
| Where the logic lives | TypeScript | TypeScript (one place for mobile, MCP and the public API) | SQL + TypeScript |
| New credential | None | A Postgres login (stronger than the service key if it's `postgres`) | None |
| Tests | Integration | Integration (vitest vs local stack) + pgTAP for RLS/triggers | pgTAP as today |
| Verdict | Not for create/update plan, sessions, units or deletion | **Chosen direction** | Fallback for anything too subtle to port |

## 3. Connecting Drizzle to Supabase from Vercel Functions

- **Driver** *(superseded: use node-postgres, §9.3/§9.5)*. Drizzle's Supabase guide uses postgres.js (`drizzle-orm/postgres-js`),
  connects through the **pooler for serverless**, and sets `prepare: false` because
  "prepared statements are not supported" in transaction mode. The docs
  install from the `@rc` tag (`drizzle-orm@rc`, `drizzle-kit@rc`); which release line
  that is **(unverified)**
  ([Drizzle + Supabase](https://orm.drizzle.team/docs/connect-supabase)). Supabase's own
  Drizzle guide says the same ([Supabase + Drizzle](https://supabase.com/docs/guides/database/drizzle)).
- **Transaction mode (6543) vs session mode (5432).** Supabase recommends transaction
  mode "for application traffic from temporary clients (for example, serverless or edge
  functions)". Session mode is for persistent clients on IPv4. The shared pooler is
  IPv4. The dedicated PgBouncer pooler (paid plans) is co-located with the database,
  but only reachable over IPv6 or with the IPv4 add-on
  ([connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)).
  Vercel → Supabase over IPv6 **(unverified)**. Start with the shared transaction
  pooler.
- **Connection limits.**
  - Supavisor and PgBouncer each open up to "pool size" backend connections. Session
    and transaction mode share that budget. Client connections are capped by the
    compute tier's "max pooler clients" (same page).
  - Under Fluid compute one instance serves many concurrent requests, so keep a
    **module-level** client with a small `max` (for example 3-5) per instance.
  - Vercel provides `attachDatabasePool(pool)` so "idle pool clients are properly
    released before functions suspend". It lists `pg` and "other compatible pool types"
    ([@vercel/functions](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)).
    Whether a postgres.js client qualifies is **(unverified)**. If you want the
    documented path, use `drizzle-orm/node-postgres` with `pg.Pool` +
    `attachDatabasePool`. With `pg`, prepared statements are only created when a query
    has a `name`, so omit `name`
    ([Supabase: disabling prepared statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL)).
- **Recommended serverless driver.** Neither Drizzle nor Supabase names a
  serverless-specific Postgres driver for Supabase beyond "postgres.js + pooler +
  `prepare: false`". There's no HTTP driver for Supabase Postgres in these docs.
- **Region.** `apps/api` in `cle1` (AWS `us-east-2`), the same AWS region as the
  Supabase project ([Vercel regions](https://vercel.com/docs/regions)).

## 4. Enforcing ownership

### 4.1 The RLS transaction wrapper (recommended)

Drizzle's RLS page documents a `createDrizzle` wrapper (from a third-party repo, "will
move to `drizzle-orm/supabase` in a future release"). Its `rls(fn)` opens a transaction
and does three things before running the caller's queries on `tx`:

1. `set_config('request.jwt.claims', …)` and `request.jwt.claim.sub`.
2. `set local role <role>`.
3. Resets the claims and the role in `finally`.

([Drizzle RLS](https://orm.drizzle.team/docs/rls)).

Caveats from that page to fix in our version:

- **Don't use `sql.raw`.** The wrapper splices the token JSON and role into SQL with
  `sql.raw`. Use bound parameters (`select set_config('request.jwt.claims', $1, true)`)
  and a **hard-coded** `authenticated` role.
- **Build claims from a verified token only.** The example `decode()`s the token without
  verifying it. Ours must build the claims only from a Clerk token verified with
  `@clerk/backend` (`{ sub: userId, role: "authenticated" }`). This is the same rule as
  ADR 0002 ("`sub` only ever comes from a verified Clerk token").

What it costs:

- **Round trips.** One transaction per request plus 1-2 extra statements (`set_config`,
  `set local role`) before the real queries. These can be combined into a single
  `select set_config(...), set_config(...)` plus `set local role` **(round-trip cost not
  measured)**.
- **Pool hold time.** Every request holds a pooled server connection for its whole
  transaction, so keep transactions short. Never hold one open across an LLM call.
- **`LOCAL` is mandatory.** In transaction mode the server connection is shared between
  clients. `SET LOCAL` and `set_config(…, true)` are transaction-scoped. A session-level
  `SET` would leak to other clients (Postgres semantics; not tested on Supavisor
  **(unverified)**).
- **Precedent.** The repo's pgTAP suite already impersonates Users exactly this way
  (`tests/database/rpc_ownership.test.sql:49-50`). Supabase documents testing RLS by
  setting `request.jwt.claims`
  ([token security](https://supabase.com/docs/guides/auth/oauth-server/token-security)).

How it fits what exists:

- **`current_user_id()`** reads `auth.jwt()`, which reads `request.jwt.claims`, so it
  works unchanged.
- **RLS policies** apply because the role is `authenticated`.
- **The retired-id triggers** fire for every writer anyway.
- **ADR 0001**: unchanged. Ids stay Clerk text ids.
- **The MCP credential trade** *(resolved in §9: per-app logins, no HTTP hop)*. If `apps/mcp` imports `packages/db`, MCP holds a
  Postgres login that can `SET ROLE authenticated`, which means it can act as any User.
  That is a swap, not a new exposure: ADR 0002 already calls the signing key "as
  powerful as the service-role key". But it changes what MCP holds, against the spirit
  of AGENTS.md's "never service-role" rule for MCP. The alternative is for MCP to call
  `apps/api` over HTTP with the User's identity. MCP then stays credential-light, at the
  cost of an extra hop and a service-to-service auth scheme. Decide this explicitly
  (and record it in the new ADR).
- **ADR 0002**: the MCP server would no longer need to sign Supabase tokens for the paths
  that go through `packages/services` (it would set claims inside the transaction
  instead). The signing key could be retired once MCP stops calling PostgREST. That
  deserves a new ADR superseding 0002's mechanism, though not its rule that `sub` comes
  only from a verified Clerk token.

The login role:

- The pooled connection's login role must be allowed to `SET ROLE authenticated`.
  pgTAP runs as `postgres`, which can.
- A dedicated least-privilege login role (`NOINHERIT`, member of `authenticated` only)
  would avoid shipping the `postgres` password to Vercel. Whether Supabase allows
  creating and using such a role through Supavisor is **(unverified)**.

### 4.2 Privileged role + app-level checks (not recommended)

Connect as `postgres` (bypasses RLS) and add `where user_id = $verifiedUserId` to every
statement. That is simpler and costs no extra round trips, but:

- A single missed filter leaks another User's data. This is the option ADR 0002
  rejected for MCP.
- `current_user_id()` returns NULL (no claims), so any SQL that calls it, including
  DEFINER functions you keep, would break.
- Only the retired-id triggers would still protect you.

### 4.3 Drizzle's own RLS definitions

Drizzle can declare policies in TypeScript: `pgPolicy`, `pgRole(...).existing()`, and
`crudPolicy` (exported from `drizzle-orm/neon`). It ships Supabase helpers in
`drizzle-orm/supabase`: `authenticatedRole`, `anonRole`, `serviceRole`, `authUid`
([Drizzle RLS](https://orm.drizzle.team/docs/rls)).

`authUid` is `auth.uid()`, which this repo must **not** use (AGENTS.md / ADR 0001). The
policies are written against `current_user_id()`. Only adopt Drizzle-managed policies if
drizzle-kit becomes the migration owner (§5). Otherwise keep the policies in SQL.

## 5. Migration ownership

**Keep the Supabase CLI SQL migrations as the source of truth, and pull the Drizzle
schema from them.**

- `drizzle-kit pull` "introspect[s] an existing database and generate[s] a Drizzle
  `schema.ts`". `schemaFilter` limits it to `public`. `--init` marks the pulled schema
  as applied if drizzle-kit ever takes over
  ([pull](https://orm.drizzle.team/docs/drizzle-kit-pull)).
- `entities.roles: { provider: "supabase" }` skips Supabase-managed roles
  ([config](https://orm.drizzle.team/docs/drizzle-config-file)).
- The pull page doesn't say whether policies and roles are introspected
  **(unverified)**. That doesn't matter if SQL stays the owner.
- **CI.** Add a `drizzle-kit pull` + `git diff --exit-code` step next to the Database
  Types workflow. This assumes pull output is byte-stable between runs **(unverified)**;
  if it isn't, normalize it with Biome first, the way `types:generate` does (`.github/workflows/database-types.yml`, which already starts a local
  database and fails on a stale `database.types.ts`).

**Why not switch to `drizzle-kit generate`?**

- The schema is full of things drizzle-kit would have to own or ignore:
  - SECURITY DEFINER functions, triggers, the `private` schema and its revokes/grants.
  - `current_user_id()` and policies written against it.
  - The partial unique index.
- The 21 existing migrations, `config.toml` (signing keys, third-party Clerk) and the
  Supabase branching used by `e2e.yml` all assume CLI migrations.
- Switching buys TypeScript-defined tables and costs owning all of that.

**Effect on the rest:**

- **pgTAP** stays and still matters: RLS, `current_user_id`, triggers, and the
  remaining DB functions. Ported business logic gets vitest integration tests against
  the local stack, the same way `apps/mcp/integration/` works. Delete each RPC's pgTAP
  file only when the RPC itself is dropped.
- **`pnpm db types:generate` and `@fitme/supabase`** stay while anything uses supabase-js
  with `Database` types: mobile reads, `apps/web`, and the remaining webhook calls.
  Inside `packages/db` and `packages/services`, use Drizzle's inferred types
  (`typeof plans.$inferSelect` / `$inferInsert`,
  [type API](https://orm.drizzle.team/docs/goodies)). Once no supabase-js caller is
  left, `@fitme/supabase` types can go. Until then, both are generated from the same
  database, so they can't drift.

## 6. Where the business layer lives

```
packages/db         Drizzle schema (pulled), client factory (pool + attachDatabasePool),
                    withUser(userId, fn): the RLS transaction wrapper (§4.1),
                    withService(fn) for webhooks / admin-only paths
packages/services   plans (create, update, activate, delete), sessions (start, finish, log set),
                    profile (units conversion), exercises (search); zod input schemas shared
                    with the HTTP layer; pure functions over a Drizzle tx
apps/api            Hono: mobile routes + public /v1, auth middleware → services
apps/mcp            MCP tools → services (in-process, same code as the API)
packages/core       stays I/O-free (models, labels, formatters)
```

- The ai-agent tools (`ai-agent/tools/*.ts`) become thin AI SDK `tool()` wrappers
  around `packages/services`. That makes multi-step edits like
  `replace_exercise_in_workout` atomic for free.
- `apps/mcp`'s fake-Supabase test harness (`src/__tests__/fake-supabase.ts`) would be
  replaced by service-level unit tests plus integration tests against the local stack.

## 7. Readiness for a public API

**Auth for third parties:**

- **Clerk API keys** fit "a user's own scripts". Keys are user- or org-scoped
  (`subject` is `user_…` or `org_…`), carry optional `scopes`, can be revoked, and are
  verified with `clerkClient.apiKeys.verify(secret)`. They're "a usage-based paid
  feature": $0.001 per key creation (first 1,000 a month free) and $0.00001 per
  verification (first 100,000 free)
  ([API keys](https://clerk.com/docs/guides/development/machine-auth/api-keys),
  [overview](https://clerk.com/docs/guides/development/machine-auth/overview)).
  Whether verification is networkless, or can be done with `authenticateRequest`
  `acceptsToken`, is **(unverified)**. Assume a Backend API call, and cache it.
- **Clerk OAuth** (already used by MCP, `apps/mcp/src/auth.ts`) fits third-party apps
  acting for a User.
- **M2M tokens** are for your own services, not User data.
- Whichever it is, the API middleware turns the credential into a verified `userId` and
  calls `withUser(userId, …)`. The services never see the credential type.
- **Scopes.** Map key/OAuth scopes to service permissions (for example `plans:read`) in
  the Hono middleware.

**Versioning.** `apps/api` already mounts `/v1` (`apps/api/src/app.ts:14`,
`src/routes/v1.ts`). Keep mobile-only routes out of the public contract, for example
under `/app/*` or `/internal/*`, so they can change with app releases. Public `/v1`
only adds fields.

**OpenAPI.** `@hono/zod-openapi` (`OpenAPIHono`, `createRoute`, `app.doc('/doc', …)`)
generates the spec from the same zod schemas
([hono.dev](https://hono.dev/examples/zod-openapi)). `apps/api` already uses zod and
`@hono/zod-validator` (`apps/api/package.json`). I didn't research `hono-openapi` as an
alternative.

**Rate limiting.**

- WAF rate limiting is available on all plans. On Pro the counting keys are only IP and
  JA4, and arbitrary header keys are Enterprise-only.
- Per-user or per-key limits on Pro come from the `@vercel/firewall` SDK:
  `checkRateLimit(id, { request, rateLimitKey: userId })` against a dashboard rule.
- Counters are per region. Pro allows 40 rules per project, and pricing is usage-based
  and regional ([WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting),
  [SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)).

**One implementation, three front doors:**

- mobile → `apps/api` (Clerk session token)
- MCP → `apps/mcp` (Clerk OAuth)
- public → `apps/api` `/v1` (API key or OAuth)

All three end in `packages/services` inside `withUser`.

## 8. Migration order

1. **Foundation.**
   - Create `packages/db`: pulled schema, pooled client, `withUser`, and a staleness
     check in CI.
   - Create `packages/services`.
   - Write vitest integration tests that pin each RPC's current behaviour, ported from
     its pgTAP file, and run them against both the RPC and the new service.
   - Add an `EXPO_PUBLIC_API_URL` and a typed client in mobile.
   - Drop `store_plan`. It has no callers, and no shipped mobile build ever called it.
2. **Port the simple, mostly single-table operations first:**
   - `activate_plan` (two UPDATEs).
   - `convert_measurement_system` (four UPDATEs, no locks).
   - The ai-agent's non-atomic plan edits. These win atomicity immediately.
3. **Plans:**
   - `create_plan`, then `update_plan`. Multi-table inserts, no explicit locks.
   - Switch MCP to the services first: it deploys continuously, needs no app release,
     and has integration tests.
4. **Sessions:**
   - `start_workout_session`: needs the partial unique index plus
     `insert … on conflict … do nothing` in Drizzle (`onConflictDoNothing` with a
     `where` target **(unverified API detail)**).
   - Then `finish_workout_session`: port the exact lock order (`LOCK TABLE` via
     `tx.execute(sql…)`, then the plan lock, then `FOR UPDATE`) and add a concurrent
     finish + update_plan test.
5. **Mobile cutover.**
   - Ship an app release whose write hooks call `apps/api`.
   - Keep reads on supabase-js/PostgREST for now; RLS stays.
6. **Drop the DB functions.** Drop each one only after:
   - (i) no repo caller is left;
   - (ii) installed builds that call it have drained (check per-version usage);
   - (iii) its behaviour is covered by service tests.

   Expected order: `store_plan` (now), `activate_plan`, `convert_measurement_system`,
   `create_plan`/`update_plan`, `start_workout_session`, `finish_workout_session`.

   **Done (FIT-339):** once the minimum version gate cut off the builds calling them,
   every remaining RPC (these, `workout_session_plan_changes` and
   `private.exercise_name_from_slug`) was dropped in one migration
   (`20261027120000_drop_legacy_rpcs.sql`).
7. **Never drop:**
   - `current_user_id()`, RLS, the retired-id triggers, `deactivate_deleted_plan` and
     the partial unique index. They are the backstop under the services too.
   - `delete_user_data` / `rekey_user` can stay as DB functions called from the webhook
     (`withService`). They are table-locking, service_role-only and rarely called, and
     porting them gains nothing.

## 9. Auth architecture: per-app logins, ownership enforced in Postgres

Settled by the user and the coordinator, pending verification. This replaces the
earlier ideas of the coach and MCP calling `apps/api` over HTTP (Vercel OIDC +
`x-fitme-user`), and of MCP self-signing Supabase tokens (ADR 0002).

### 9.1 The design

- **No internal HTTP hop.** `apps/api`, `apps/mcp` and `apps/coach` each import
  `packages/services` → `packages/db` and connect to Postgres through the Supavisor
  transaction pooler.
- **Identity is verified at each app's own edge:**

  | App | Caller | Verified with |
  |---|---|---|
  | `apps/api` | mobile app | Clerk session token, networkless with `jwtKey` ([verifyToken](https://clerk.com/docs/reference/backend/verify-token)) |
  | `apps/api` `/v1` (future) | third parties | Clerk API keys (`acceptsToken: "api_key"`, a Backend API call per verification, see below) or Clerk OAuth |
  | `apps/mcp` | MCP clients | Clerk OAuth (today's `apps/mcp/src/auth.ts`) |
  | `apps/coach` | mobile app (EVE channel) | Clerk session token in the channel `AuthFn`. `principalId` lives on the EVE session |
  | `apps/webhooks` | Clerk, RevenueCat | Svix signature / RevenueCat header or HMAC |

- **Ownership is enforced in Postgres.** `packages/db` exports `withUser(userId, fn)`:
  1. Open a transaction.
  2. `select set_config('request.jwt.claims', $1, true)` with
     `{"sub": userId, "role": "authenticated"}` as a bound parameter.
  3. `SET LOCAL ROLE authenticated`.
  4. Run `fn(tx)`, then commit (or roll back on error).

  RLS, `current_user_id()` (`20261013120000…:17-36`) and the `reject_retired_user_id`
  triggers stay unchanged. `userId` only ever comes from the app's verified edge
  identity, never from request bodies or model input.
- **The coach** verifies Clerk once at its channel and keeps `principalId` on the EVE
  session (`ctx.session.auth.current`, `eve@0.79.0 docs/guides/session-context.md`). Its
  tools call `withUser(ctx.session.auth.current.principalId, …)`. No token is forwarded,
  so the 60 s Clerk token lifetime doesn't matter
  ([How Clerk works](https://clerk.com/docs/guides/how-clerk-works/overview)).
- **One Postgres login per app:**
  - `fitme_api`, `fitme_mcp` and `fitme_coach` are created `LOGIN NOINHERIT` and only
    granted membership in `authenticated`.
  - They have no `BYPASSRLS`, no direct table or function grants, and no `EXECUTE` on
    `delete_user_data` / `rekey_user`.
  - **Only `apps/webhooks`** gets an admin-capable login (or keeps using the
    service-role key over PostgREST) for `delete_user_data`.
  - Provisioning these roles means a migration with `CREATE ROLE`, plus the passwords
    set out of band.
  - For local stacks and preview branches, the CLI also has a roles path. `supabase
    start` printed "Seeding globals from roles.sql..." before applying migrations
    (CLI 2.120.0). `packages/supabase/supabase/roles.sql` doesn't exist today, so it
    could hold `CREATE ROLE … LOGIN NOINHERIT` without putting passwords in numbered
    migrations. How it behaves on hosted branches is **(unverified)**. Whether hosted Supabase lets you create such logins and use them
    through Supavisor is not verified (it worked locally, §9.3).

### 9.2 Threat model

| Leaked secret | Today | This design | HTTP-hop alternative (rejected) |
|---|---|---|---|
| MCP's `SUPABASE_JWT_SIGNING_KEY` | Mint a token for any `sub` → act as any User through PostgREST + RLS until key rotation (ADR 0002: "as powerful as the service-role key") | gone | gone |
| One app's login (`fitme_mcp`, …) | n/a | Connect to the pooler and `SET ROLE authenticated` with any claims → **act as any User, through RLS**. **Can't** bypass RLS, read `private.*`, call `delete_user_data`/`rekey_user`, or touch a table that has no grant to `authenticated` (all measured, §9.3). Revoke = rotate that one login | the coach/MCP hold only a service identity for `apps/api`. A leak = act as any User through `apps/api`'s routes (narrower surface: only routes, not arbitrary SQL) |
| Webhook admin login / service-role key | service-role in edge functions | only in `apps/webhooks` | same |

Honest summary:

- A leaked per-app login is **as powerful as today's signing key**: any User, within
  RLS.
- It is **weaker than** the service-role key: no RLS bypass, no account deletion.
- It is **stronger than** the HTTP-hop design: arbitrary SQL under RLS versus only the
  API's routes.
- **The new risk: a table without RLS.** Supabase's default privileges grant new
  `public` tables to `authenticated`, and a no-RLS table was fully readable under
  `withUser` in the test (§9.3, d5). That's the same exposure as today through
  PostgREST, but it now also applies to every app login. Keep a pgTAP test asserting
  that every `public` table has RLS enabled.
- **The second new risk: session state leaks through the pooler (§9.3, c3/c4).** Any
  code path in any app that runs a session-level `SET ROLE` or
  `set_config(…, false)` poisons pooled server connections for *other requests of the
  same login*. In the test, 35 of 60 later bare queries then ran as `authenticated` and
  read the leaked User's profile.

  Mitigations:
  - `withUser` / `withService` are the only exports of `packages/db`; no raw pool access.
  - `withUser` always sets *both* the claims and the role locally, which overrides
    poisoned session values inside the transaction (verified).
  - Lint or ban `SET ROLE` / `set_config(…, false)` in code.
  - Separate logins per app keep a bug in one app from poisoning another app's
    connections. Supavisor starts pools per user. The local pooler log showed `Starting pool(s) for
    Supavisor.id(type: :single, tenant: "pooler-dev", mode: :transaction, user: "postgres", …)`
    for a new user.

### 9.3 Empirical results (throwaway local stack)

**Setup:**
- A copy of `packages/supabase/supabase` with `project_id = "fitmepooltest"`, ports
  614xx, `[db.pooler] enabled = true` in transaction mode with `default_pool_size = 4`,
  seeding off, and every service except Postgres and the pooler excluded.
- Supabase CLI 2.120.0, image `supabase/postgres:17.11.0.004`, **Supavisor 2.9.13**.
- All 21 migrations applied.
- `CREATE ROLE fitme_test LOGIN PASSWORD … NOINHERIT; GRANT authenticated TO fitme_test`.
- Two probe tables: `public.no_rls_probe` (no RLS, default grants) and
  `public.no_rls_probe_revoked` (no RLS, grants revoked from `anon`/`authenticated`).
- Profiles for `user_A` and `user_B`.
- Afterwards: `supabase stop --no-backup`. No containers or volumes remain. The shared
  stack (51321/51322) was not touched.

**Pooler user name.** The local pooler's tenant is `pooler-dev` (`_supavisor.tenants`,
`require_user = false`, with an `auth_query`). Any database role logs in as
**`<role>.pooler-dev`**, so `fitme_test.pooler-dev` worked. Hosted projects use
`<role>.<project-ref>`, matching `postgres.<ref>` in Supabase's connection strings
([connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)).
Custom roles on hosted were not tested.

**Results.** The scripts used postgres.js 3.4.9 with `prepare: false` and node-postgres 8.

| # | Check | Result |
|---|---|---|
| a | Custom login through the pooler | **PASS**: `session_user = fitme_test`, via Supavisor |
| d1 | Bare login (no `SET ROLE`) reads `profiles` | **denied**: "permission denied for table profiles" |
| b1 | `withUser('user_A')` → `current_user_id()` | **`user_A`**, `current_user = authenticated` |
| b2 | RLS select on `profiles` | only `["user_A"]` |
| b3 / b4 | Insert own `conversations` row / insert for `user_B` | allowed / **"new row violates row-level security policy"** |
| d2 | `select delete_user_data('user_B')` as `authenticated` | **"permission denied for function delete_user_data"** |
| d3 | Read `private.retired_user_ids` | **"permission denied for schema private"** |
| d4 | Read a table with grants revoked | **denied** |
| d5 | Read a **no-RLS** table with Supabase default grants | **readable** (risk, see §9.2) |
| c1 | 300 concurrent `withUser` transactions, 20 users, 43 forced rollbacks (`1/0`), client pool `max: 3` → server pool of 4 | **0 leaks.** Every transaction saw its own `sub` before and after a random `pg_sleep`. Same with `pg.Pool` (checks 300, leaks 0, rollbacks 43) |
| c2 | After those commits and rollbacks, 60 bare queries on reused connections | **clean**: `current_user = fitme_test`, claims empty, `current_user_id() = null` (postgres.js and `pg`) |
| c3 | Control: another client runs session-level `set_config('request.jwt.claims', '{"sub":"user_LEAK",…}', false)` and disconnects | **leaks**: 22/60 later bare queries by *other* clients saw `user_LEAK` from `current_user_id()`. A `withUser('user_A')` transaction on a poisoned connection still saw `user_A`. After its commit the poisoned value was back (9/30) |
| c4 | Control: another client runs session-level `SET ROLE authenticated` + claims | **leaks**: 35/60 later bare queries ran as `authenticated` and **read `user_A`'s profile row**. 25/60 hit clean connections and were denied |
| — | Driver: postgres.js, 10-300 concurrent *non-transaction* queries on `max: 3` | **intermittent hangs** (timeouts at n = 9, 10, 30, 60, 300; `max_pipeline: 1` didn't fix n = 60). Direct to Postgres (no pooler): fine. Concurrent `sql.begin` transactions: fine (300 in c1, 60 in 25 ms). **node-postgres `pg.Pool`: 60 and 300 concurrent queries fine** (27 ms / 47 ms) |

Why c3/c4 happen: in transaction pooling the reset query isn't run. PgBouncer's docs
say "When transaction pooling is used, the `server_reset_query` is not used"
([PgBouncer config](https://www.pgbouncer.org/config.html)). Supavisor 2.9.13 behaved
the same way locally. Whether hosted Supavisor or the dedicated PgBouncer resets
anything is **(unverified)**; design as if they don't.

The scripts are kept outside the repo in `/tmp/fitme-pooltest-evidence/`.

### 9.4 Comparison with the alternatives

| | Per-app login + `withUser` (chosen) | Today (ADR 0002 signing key + PostgREST) | HTTP hop to `apps/api` (OIDC + `x-fitme-user`) |
|---|---|---|---|
| Atomic multi-table writes | yes (real transactions) | only via RPCs | yes (in `apps/api`) |
| Latency | app → pooler | app → PostgREST | app → api → pooler (+1 hop per tool call) |
| Secret blast radius | any User within RLS, per app | any User within RLS | any User via API routes only |
| Moving parts | 3-4 logins, one shared package | signing key + standby key on Supabase | OIDC trust config, internal routes, service auth |
| Failure isolation | each app independent | MCP depends on PostgREST | coach and MCP depend on `apps/api` uptime |

### 9.5 Operational costs

- **Connections.** Each Fluid instance holds its own `pg.Pool`. Use a small `max`
  (2-5) and `attachDatabasePool(pool)`, which releases idle clients before suspension.
  It detects `pg` by `idleTimeoutMillis` and throws "Unsupported database pool type"
  for anything it doesn't recognize, and has no postgres.js branch
  ([source](https://github.com/vercel/vercel/blob/main/packages/functions/src/db-connections/index.ts),
  [docs](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)).
  - The client side is capped by the compute tier's "max pooler clients". The server
    side is capped by `pool size`, shared across modes
    ([connecting](https://supabase.com/docs/guides/database/connecting-to-postgres)).
  - Supavisor keeps separate pools per user + database, so 3-4 logins means 3-4 pools
    sharing the budget **(pool-size accounting per user on hosted is unverified)**.
- **Redeploys and rotation.** Rotating one app's password means `ALTER ROLE … PASSWORD`,
  updating that Vercel project's env, and redeploying (env changes apply only to new
  deployments, [env vars](https://vercel.com/docs/environment-variables)). The other
  apps are unaffected.
- **Schema changes.** Still Supabase SQL migrations (§5). New tables need RLS plus
  explicit grants to `authenticated`. Never grant to the app logins directly.
- **Tests.** Keep pgTAP. Add a pgTAP check that the app logins have no direct grants,
  no BYPASSRLS, and no EXECUTE on the admin functions. Add a vitest integration test of
  `withUser` against the local pooler (port the scripts above).

### 9.6 Draft ADR (not created in `docs/adr/`)

> **000X: Apps connect to Postgres with per-app logins and enforce ownership through
> RLS** (supersedes ADR 0002).
>
> **Context.** Business logic moves from RPCs into a shared TypeScript layer
> (`packages/services` → `packages/db`, Drizzle) used by `apps/api`, `apps/mcp` and
> `apps/coach`. ADR 0002 had MCP sign Supabase tokens so PostgREST and RLS knew the
> User. With direct Postgres connections there is no PostgREST hop to carry a token.
>
> **Decision.**
> - Each app verifies the caller at its own edge (Clerk session, Clerk OAuth, Clerk API
>   key, webhook signature) and gets a dedicated Postgres login (`fitme_api`,
>   `fitme_mcp`, `fitme_coach`): `LOGIN NOINHERIT`, member of `authenticated` only, no
>   BYPASSRLS, no direct grants, no EXECUTE on `delete_user_data` / `rekey_user`.
> - All User data access goes through `withUser(userId, fn)`. It opens a transaction,
>   runs `set_config('request.jwt.claims', {sub, role: authenticated}, true)` and
>   `SET LOCAL ROLE authenticated`, then runs `fn`.
> - `userId` comes only from the verified edge identity.
> - Only `apps/webhooks` holds an admin-capable credential.
> - RLS, `current_user_id()` and the retired-id triggers (ADR 0001) stay the
>   enforcement layer.
>
> **Considered.**
> - Keep ADR 0002 (signing key + PostgREST): no transactions across tables.
> - A privileged login with app-level `WHERE user_id = …`: one missed filter leaks data.
> - Coach and MCP calling `apps/api` over HTTP with a service identity: extra hop and
>   coupling, though a smaller blast radius.
>
> **Consequences.**
> - A leaked app login can act as any User within RLS, the same as today's signing key,
>   but can't bypass RLS or delete accounts. Rotate per app.
> - Session-level `SET ROLE` / `set_config(…, false)` is forbidden: in transaction
>   pooling it leaks to other requests (measured).
> - `packages/db` exposes only `withUser` / `withService`.
> - Every `public` table must have RLS (pgTAP-enforced).
> - The MCP signing key and the local `local-only-signing-keys.json` standby entry can be
>   retired once MCP stops calling PostgREST.
> - The driver is node-postgres (`attachDatabasePool`), not postgres.js.

### 9.7 Items closed from primary sources

- **`attachDatabasePool` + postgres.js:** not supported. Use `pg` (§9.5).
- **Clerk API-key verification:**
  - `authenticateRequest` accepts `acceptsToken: "api_key" | "oauth_token" | "session_token" | "m2m_token"` (or arrays / `"any"`); `jwtKey` applies only to session tokens ([authenticateRequest](https://clerk.com/docs/reference/backend/authenticate-request)).
  - In `@clerk/backend`, API keys are verified by a **Backend API call**
    (`client.apiKeys.verify(secret)`) ([source](https://github.com/clerk/javascript/blob/main/packages/backend/src/tokens/verify.ts)).
  - Budget for latency and cache results briefly.
- **`onConflictDoNothing` with a partial index:** supported. The signature is
  `onConflictDoNothing({ target?, where?: SQL })`, which renders
  `(<target>) where <cond> do nothing`; `where` is ignored without `target`
  ([source](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/query-builders/insert.ts)).
  So `start_workout_session`'s `ON CONFLICT (workout_id) WHERE finished_at IS NULL DO NOTHING`
  ports as `{ target: workoutSessions.workoutId, where: isNull(workoutSessions.finishedAt) }`.
- **`drizzle-kit pull` and policies:** the docs don't say. A drizzle-kit 0.27.1 bug
  report about *introspected* `pgPolicy` output
  ([#3495](https://github.com/drizzle-team/drizzle-orm/issues/3495)) shows pull does emit
  policies. Byte-stable output is still unverified. Since SQL stays the source of truth,
  exclude policies from the diff or normalize them.

## Still unverified (consolidated)

1. Creating custom login roles on **hosted** Supabase and using them through hosted
   Supavisor (`<role>.<project-ref>`). This worked locally only.
2. Whether hosted Supavisor or the dedicated PgBouncer resets session state between
   clients. Design assumes not (§9.3).
3. Pool-size accounting with several logins on hosted Supavisor.
4. The postgres.js hang: its root cause, and whether it reproduces on hosted Supavisor.
   It's avoided by using `pg`.
5. Whether `drizzle-kit pull` output is byte-stable for a CI diff.
6. Clerk API-key verification latency and rate limits.
7. The drain window for installed builds still calling the RPCs directly.
