# @fitme/mcp

Streamable HTTP [MCP](https://modelcontextprotocol.io) server for Fitme. Catalog tools come from `@fitme/core`; the other tools let a client manage the signed-in user's training plans and track workouts in the Fitme database. Every MCP request needs a Clerk OAuth access token. Deployed at https://mcp.fitmeproject.com.

```bash
pnpm dev:mcp            # tsx watch, http://localhost:3002
pnpm mcp build          # tsdown bundle → dist/
pnpm mcp start          # runs dist/node/index.js
pnpm mcp test           # vitest (in-memory MCP client + Hono app, fake services)
pnpm mcp test:integration  # vitest against a running Supabase stack (see below)
```

The MCP endpoint is the root path: `POST|GET|DELETE /` (stateless, no session ids). `GET /health` for liveness, `GET /.well-known/oauth-protected-resource` for OAuth discovery; those two are the only public routes.

## Integration tests

`integration/` runs the tools against a real Supabase stack instead of the fake services, so RLS and the services' queries are exercised for real. The Library is always the in-memory fake (`INTEGRATION_EXERCISES` in `integration/setup.ts`), never the network. Postgres doesn't check Exercise slugs (ADR 0010), so no Exercise is seeded. Each run creates fresh Users as made-up Clerk-style `user_…` ids, with no Clerk or Supabase Auth account, and runs the tools as them through `asUser` on the stack's Supavisor pooler (the vitest config reads its URL from `supabase status`; `FITME_DATABASE_URL` overrides it). It covers the main flow (create → get → update → activate → start session → log set → finish → list → delete) and checks that a second user can neither read nor change the first user's plans and sessions, through the tools or straight through the RPCs and table writes.

```bash
pnpm db start                     # local stack
pnpm mcp test:integration
```

`integration/clerk-oauth.test.ts` runs the whole chain against the Clerk development instance, with no browser: it serves the real app over HTTP, creates a public OAuth application and two `+clerk_test` Users through the Backend API, and lets the MCP SDK's OAuth client discover Clerk from the server's 401. The flow signs the User in with a sign-in token on a dev browser (`__clerk_db_jwt`), passes the Account Portal's sign-in page, submits "Allow" to Clerk's consent endpoint the way the hosted consent form does, and exchanges the code with PKCE (S256). The Clerk access token then calls `list_plans` and `create_plan`, and the second User can't see the first User's Plan. It deletes the Users and the application afterwards. It needs `CLERK_DEV_SECRET_KEY` (the development `sk_test_…` key) and is skipped without it:

```bash
CLERK_DEV_SECRET_KEY=sk_test_… pnpm mcp test:integration
```

CI runs the suite on every pull request (`.github/workflows/integration-tests.yml`), separately from the unit tests.

## Environment

See `.env.example`. The variables are read from the process environment (Vercel project settings in production); `.env` files are not loaded automatically.

| Variable            | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `PORT`              | Port for `pnpm dev` / `pnpm start` (default 3002).                      |
| `CLERK_SECRET_KEY`  | Secret key of the Clerk instance that issues OAuth access tokens.       |
| `CLERK_PUBLISHABLE_KEY` | Its publishable key; names the instance in the OAuth metadata.      |
| `FITME_DATABASE_URL` | The `fitme` login's Supavisor transaction-pooler URL with `?application_name=mcp`; the user tools run through it (`asUser`). Service-role strength. |
| `MCP_PUBLIC_URL`    | Public URL advertised as the OAuth resource; set it in production.     |
| `LIBRARY_URL`     | The Library API (`apps/library`; `http://localhost:3006` locally, `https://library.fitmeproject.com` deployed). |
| `LIBRARY_MCP_SECRET` | The MCP server's bearer for the Library API; the same value as the Library API's MCP secret (`LIBRARY_MCP_SECRET` in `apps/library`). Production's never leaves Vercel. |

The MCP endpoint fails closed: without `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` or `FITME_DATABASE_URL` it answers **HTTP 500** to every request instead of serving without auth. Production uses the production Clerk instance; every other environment uses the development instance.

## Authentication

The server implements the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) (OAuth 2.1). It is the protected resource; the authorization server is Clerk. MCP clients identify themselves with a Client ID Metadata Document (no dynamic client registration), sign the User in on Clerk's hosted sign-in and consent screen, and refresh tokens there. Auth uses `@clerk/hono` (`clerkMiddleware`, `getAuth` with `acceptsToken: "oauth_token"`) and `@clerk/mcp-tools/hono` (`protectedResourceHandlerClerk`, `streamableHttpHandler`); see `src/auth.ts`.

1. `GET /.well-known/oauth-protected-resource` returns the resource URL and `authorization_servers: ["https://<clerk frontend API>"]` (RFC 9728), derived from `CLERK_PUBLISHABLE_KEY`.
2. Every request to the MCP endpoint (`initialize`, `tools/list`, `tools/call`, catalog tools included) without a bearer token gets **HTTP 401** with `WWW-Authenticate: Bearer resource_metadata="…"`, so the client starts OAuth.
3. A token Clerk rejects (expired, revoked, not an OAuth access token, another instance) gets **HTTP 401** with `WWW-Authenticate: Bearer error="invalid_token", …, resource_metadata="…"`, so the client refreshes it or signs in again.

Clerk OAuth access tokens are JWTs verified locally against the instance's JWKS. They carry no `aud`, so there is no audience check, and no custom scopes are required. After Clerk verifies a token, every user tool runs a `@fitme/services` function inside `asUser` with the verified Clerk User id ([ADR 0003](../../docs/adr/0003-apps-reach-postgres-through-asuser-and-withservice.md)), so all reads and writes go through RLS. Tools never accept a user id.

Inside a request that passed the check:

- Database errors are returned as `isError: true` results carrying the Postgres message (never the SQL); any other failure is returned as "The database request failed." Both are reported to Sentry (`fitme-mcp`); expected outcomes (not found, invalid input, 401) aren't.
- Every write runs in one transaction with its read-back, so it either returns its result or fails without changing anything.
- Paginated tools (`list_exercises`, `list_workout_sessions`) return an empty page with the `total` when the offset is past the end.
- Exercises are referred to by their Exercise slug (`exercise_slug`), never a uuid, and come from the Library API (`@fitme/library-sdk`, with `LIBRARY_MCP_SECRET`). A write carrying slugs (`create_plan`, `update_plan` with `workouts`) checks them with one lookup before its transaction: unknown slugs are an error naming them, and nothing is written. Plan and Workout Session reads add each Exercise's `name` and `muscle_groups` after their transaction; a slug the library doesn't know, or the library failing, gets a name derived from the slug, and the read still answers. The library failing fails searches and writes with "Library unavailable, try again." (reported to Sentry).

## Tools

Weights are stored and returned in the user's unit (kg for the `metric` measurement system, lbs for `us`/`uk`) and are never converted. Heights are cm or inches.

| Tool                     | Description                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `ping`                   | Server name and version.                                                                         |
| `list_muscle_groups`     | Muscle group ids and names.                                                                      |
| `list_plan_options`      | Valid goals, places and experience levels.                                                       |
| `describe_muscle_group`  | Display name for a muscle group id.                                                              |
| `get_profile`            | Gender, age, height, weight, measurement system and units.                                       |
| `list_exercises`         | Search the Library by name / muscle group (paginated); each row's `slug` is the `exercise_slug` plans take. |
| `get_exercise`           | Full Exercise details by slug (description, instructions, media).                                |
| `get_exercise_history`   | The user's logged sets for an Exercise slug, one entry per session-exercise row.                 |
| `list_plans`             | The user's plans with a workout summary.                                                         |
| `get_plan`               | Full plan: workouts → exercises → sets, in order.                                                |
| `create_plan`            | Create a plan (in one transaction); it becomes the active plan.                                  |
| `update_plan`            | Update metadata in place, or replace all workouts (in one transaction; workout ids change).       |
| `delete_plan`            | Soft delete (`deleted_at`) and deactivate; repeating it is a no-op (`alreadyDeleted`).           |
| `activate_plan`          | Make a plan the active one (in one transaction); returns the plan summary.                       |
| `start_workout_session`  | Start a session from a plan workout, or resume its open session (`resumed: true`).               |
| `get_workout_session`    | Session with exercises and sets; set ids feed `log_set`.                                         |
| `list_workout_sessions`  | Sessions filtered by `all` / `in_progress` / `finished`.                                          |
| `log_set`                | Record reps and weight for a session set.                                                        |
| `finish_workout_session` | Finish a session and rotate its workout (`rotated`); no-op if already finished.                  |
| `delete_workout_session` | Permanently delete a session and its sets (errors if nothing was deleted).                       |

## Connecting

Claude Code (it runs the OAuth flow in the browser on first use, or via `/mcp`):

```bash
claude mcp add --transport http fitme https://mcp.fitmeproject.com
```

The Clerk instance must admit the client (CIMD allowlist, or a manually created Clerk OAuth application whose credentials the client is given).

Raw HTTP, with a Clerk OAuth access token:

```bash
curl -s http://localhost:3002/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $CLERK_OAUTH_ACCESS_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}'
```
