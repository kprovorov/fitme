# @fitme/mcp

Streamable HTTP [MCP](https://modelcontextprotocol.io) server for Fitme. Catalog tools come from `@fitme/core`; the other tools let a client manage the signed-in user's training plans and track workouts in Supabase. Every MCP request needs a Clerk OAuth access token. Deployed at https://mcp.fitmeproject.com.

```bash
pnpm dev:mcp            # tsx watch, http://localhost:3002
pnpm mcp build          # tsdown bundle → dist/
pnpm mcp start          # runs dist/index.js
pnpm mcp test           # vitest (in-memory MCP client + Hono app, fake services / fake Supabase client)
pnpm mcp test:integration  # vitest against a running Supabase stack (see below)
```

The MCP endpoint is the root path: `POST|GET|DELETE /` (stateless, no session ids). `GET /health` for liveness, `GET /.well-known/oauth-protected-resource` for OAuth discovery; those two are the only public routes.

## Integration tests

`integration/` runs the tools against a real Supabase stack instead of the fakes, so RLS, the RPCs and PostgREST behaviour (embeds, `!inner` filters, ranges past the end) are exercised for real. Each run creates fresh Users as made-up Clerk-style `user_…` ids, with no Supabase Auth account: tools on services run as them through `asUser` on the stack's Supavisor pooler (the vitest config reads its URL from `supabase status`; `FITME_DATABASE_URL` overrides it), the rest with Supabase tokens from the server's signer (see [Signed Supabase tokens](#signed-supabase-tokens)), then covers the main flow (create → get → update → activate → start session → log set → finish → list → delete) and checks that a second user can neither read nor change the first user's plans and sessions.

The tokens are signed with `SUPABASE_JWT_SIGNING_KEY` when it is set, otherwise with the committed development key (`integration/local-only-signing-key.json`), which every local stack trusts.

```bash
pnpm db start                     # local stack
pnpm db exec snaplet-seed generate && pnpm db seed   # exercise library
eval "$(pnpm --silent db exec supabase status --env --output-format text | sed -n 's/^API_URL=/export SUPABASE_URL=/p; s/^ANON_KEY=/export SUPABASE_ANON_KEY=/p')"
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
| `FITME_DATABASE_URL` | The `fitme` login's Supavisor transaction-pooler URL with `?application_name=mcp`, for the tools on services (`asUser`). Service-role strength. |
| `SUPABASE_JWT_SIGNING_KEY` | Private ES256 JWK the server signs Supabase tokens with. See below. |
| `SUPABASE_URL`      | Supabase project URL used by the user tools.                            |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key. Never configure a service-role key here.    |
| `MCP_PUBLIC_URL`    | Public URL advertised as the OAuth resource; set it in production.     |

The MCP endpoint fails closed: without `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `SUPABASE_JWT_SIGNING_KEY` or `FITME_DATABASE_URL` it answers **HTTP 500** to every request instead of serving without auth. Production uses the production Clerk instance; every other environment uses the development instance. Without the Supabase variables (or the database URL, for tools on services), user tools return a "not configured" tool error.

## Authentication

The server implements the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) (OAuth 2.1). It is the protected resource; the authorization server is Clerk. MCP clients identify themselves with a Client ID Metadata Document (no dynamic client registration), sign the User in on Clerk's hosted sign-in and consent screen, and refresh tokens there. Auth uses `@clerk/hono` (`clerkMiddleware`, `getAuth` with `acceptsToken: "oauth_token"`) and `@clerk/mcp-tools/hono` (`protectedResourceHandlerClerk`, `streamableHttpHandler`); see `src/auth.ts`.

1. `GET /.well-known/oauth-protected-resource` returns the resource URL and `authorization_servers: ["https://<clerk frontend API>"]` (RFC 9728), derived from `CLERK_PUBLISHABLE_KEY`.
2. Every request to the MCP endpoint (`initialize`, `tools/list`, `tools/call`, catalog tools included) without a bearer token gets **HTTP 401** with `WWW-Authenticate: Bearer resource_metadata="…"`, so the client starts OAuth.
3. A token Clerk rejects (expired, revoked, not an OAuth access token, another instance) gets **HTTP 401** with `WWW-Authenticate: Bearer error="invalid_token", …, resource_metadata="…"`, so the client refreshes it or signs in again.

Clerk OAuth access tokens are JWTs verified locally against the instance's JWKS. They carry no `aud`, so there is no audience check, and no custom scopes are required. Clerk tokens also have no `role` claim, so Supabase would run them as `anon`: after Clerk verifies a token, the server signs its own short-lived Supabase token for the Clerk User id (see [Signed Supabase tokens](#signed-supabase-tokens)), expiring at the earlier of 5 minutes and the Clerk token's `exp`. For each request the server builds a Supabase client with the anon key plus that signed token, so all reads and writes go through RLS and the RPCs, which identify the caller by the JWT `sub` claim. Tools moved to `@fitme/services` (so far `get_profile`, the exercise reads, `list_workout_sessions`, `get_workout_session`, `log_set`, `delete_workout_session`, `list_plans`, `get_plan` and `delete_plan`) instead run inside `asUser` with the verified Clerk User id ([ADR 0003](../../docs/adr/0003-apps-reach-postgres-through-asuser-and-withservice.md)), under the same RLS. Tools never accept a user id.

Inside a request that passed the check:

- Database errors are returned as `isError: true` results carrying the Postgres/PostgREST message (never the SQL); any other failure of a tool on services is logged and reported as "The database request failed."
- Writes that committed but whose follow-up read failed (`start_workout_session`, `finish_workout_session`) return success with the id and a `warning` instead of an error, so clients don't retry and duplicate.
- Paginated tools (`list_exercises`, `list_workout_sessions`) return an empty page with the `total` when the offset is past the end.

## Signed Supabase tokens

`src/supabase-token.ts` signs a short-lived Supabase access token for a verified User id, once Clerk has verified the request's OAuth token, so RLS keeps working: Clerk OAuth tokens have no `role` claim, so Supabase would run them as `anon`. See [ADR 0002](../../docs/adr/0002-mcp-server-signs-supabase-tokens.md).

- ES256, `kid` from the key. Hard-coded claims: `role: authenticated`, `aud: authenticated`, `iss: fitme-mcp`; `sub` is the User id.
- `iat` = now, `exp` = now + 5 minutes, capped at the Clerk token's `exp`.
- The key is the private JWK in `SUPABASE_JWT_SIGNING_KEY`, as printed by `supabase gen signing-key --algorithm ES256` (`key_ops`, `use` and `ext` are stripped before import). It is as powerful as the service-role key: it lives only in this server's env, and `sub` must only ever come from a verified Clerk token.

Supabase trusts the public half of the key:

- **Local stacks** trust the committed development key out of the box. `packages/supabase/supabase/local-only-signing-keys.json` (`[auth] signing_keys_path` in `config.toml`) lists the stack's own signer first, then the development key's public half. The private half is in `.env.example` and `integration/local-only-signing-key.json`. Both files are for local use only; never trust these keys on a hosted project.
- **Hosted projects**: generate a key, put the private JWK in the server's env, and import the public half on the Supabase project as a **standby** key (Settings → JWT Keys), so Supabase verifies the server's tokens but never signs with that key.

## Tools

Weights are stored and returned in the user's unit (kg for the `metric` measurement system, lbs for `us`/`uk`) and are never converted. Heights are cm or inches.

| Tool                     | Description                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `ping`                   | Server name and version.                                                                         |
| `list_muscle_groups`     | Muscle group ids and names.                                                                      |
| `list_plan_options`      | Valid goals, places and experience levels.                                                       |
| `describe_muscle_group`  | Display name for a muscle group id.                                                              |
| `get_profile`            | Gender, age, height, weight, measurement system and units.                                       |
| `list_exercises`         | Search the exercise library by name / muscle group (paginated).                                  |
| `get_exercise`           | Full exercise details.                                                                           |
| `get_exercise_history`   | The user's logged sets for an exercise, one entry per session-exercise row.                      |
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
