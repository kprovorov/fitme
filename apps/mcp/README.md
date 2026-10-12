# @fitme/mcp

Streamable HTTP [MCP](https://modelcontextprotocol.io) server for Fitme. Public catalog tools come from `@fitme/core`; authenticated tools let a client manage the signed-in user's training plans and track workouts in Supabase. Deployed at https://mcp.fitmeproject.com.

```bash
pnpm dev:mcp            # tsx watch, http://localhost:3002
pnpm mcp build          # tsdown bundle → dist/
pnpm mcp start          # runs dist/index.js
pnpm mcp test           # vitest (in-memory MCP client + Hono app, fake Supabase client)
pnpm mcp test:integration  # vitest against a running Supabase stack (see below)
```

The MCP endpoint is the root path: `POST|GET|DELETE /` (stateless, no session ids). `GET /health` for liveness, `GET /.well-known/oauth-protected-resource` for OAuth discovery.

## Integration tests

`integration/` runs the tools against a real Supabase stack instead of the fake client, so RLS, the RPCs and PostgREST behaviour (embeds, `!inner` filters, ranges past the end) are exercised for real. Each run signs up fresh users through the auth API (email confirmations are off in `config.toml`), then covers the main flow (create → get → update → activate → start session → log set → finish → list → delete) and checks that a second user can neither read nor change the first user's plans and sessions. `oauth.test.ts` runs the whole MCP authorization flow (discovery, dynamic registration, PKCE authorize, consent, token exchange, refresh) against the local OAuth server.

```bash
pnpm db start                     # local stack
pnpm db exec snaplet-seed generate && pnpm db seed   # exercise library
eval "$(pnpm --silent db exec supabase status -o env | sed -n 's/^API_URL=/export SUPABASE_URL=/p; s/^ANON_KEY=/export SUPABASE_ANON_KEY=/p')"
pnpm mcp test:integration
```

CI runs the suite on every pull request (`.github/workflows/integration-tests.yml`), separately from the unit tests.

## Environment

See `.env.example`. The variables are read from the process environment (Vercel project settings in production); `.env` files are not loaded automatically.

| Variable            | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `PORT`              | Port for `pnpm dev` / `pnpm start` (default 3002).                      |
| `SUPABASE_URL`      | Supabase project URL used by the user tools.                            |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key. Never configure a service-role key here.    |
| `MCP_PUBLIC_URL`    | Public URL advertised as the OAuth resource; set it in production.     |

Without the Supabase variables the server still starts and the public tools work; user tools return a "not configured" tool error and OAuth is off.

## Authentication

The server implements the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) (OAuth 2.1). It is the protected resource; the authorization server is [Supabase Auth's OAuth server](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) at `$SUPABASE_URL/auth/v1`, so MCP clients register themselves (dynamic client registration), sign the user in and refresh tokens there. The consent screen was the web app's `/oauth/consent` page (`apps/web`), removed when the web app moved to Clerk (FIT-72): MCP clients can't complete sign-in until MCP authorization moves to Clerk (FIT-79).

1. `GET /.well-known/oauth-protected-resource` returns the resource URL and `authorization_servers: ["$SUPABASE_URL/auth/v1"]` (RFC 9728).
2. Any request carrying a token Supabase rejects (expired, revoked signing key, not a user token) gets **HTTP 401** with `WWW-Authenticate: Bearer error="invalid_token", …, resource_metadata="…"`, so the client refreshes it.
3. A `tools/call` of a user tool without a token gets **HTTP 401** with `WWW-Authenticate: Bearer resource_metadata="…"`, so the client starts OAuth.
4. Without a token, `initialize`, `tools/list` and the public tools work anonymously.

Access tokens are ordinary Supabase user JWTs. For each request the server builds a Supabase client with the anon key plus that token, so all reads and writes go through RLS and the RPCs, which identify the caller by the JWT `sub` claim. The token is verified once per request with `auth.getClaims`, locally against the project's cached JWKS when it uses asymmetric signing keys (an `auth.getUser` round-trip otherwise). Local verification does not see sign-outs, so a token stays usable until it expires (1 hour by default). Tools never accept a user id.

Tokens are not audience-bound to this server: Supabase Auth has no per-resource audience (every user JWT has `aud: authenticated`), so any Fitme user token is accepted, including app sessions and static tokens. This grants nothing beyond what the token already allows against Supabase directly (RLS still applies); a token without a user (`sub`), like the anon key, is rejected.

Inside a request that passed the check:

- Supabase unreachable while verifying → `isError: true` tool result (not 401, since a new token would not help).
- Database errors are returned as `isError: true` results carrying the Postgres/PostgREST message.
- Writes that committed but whose follow-up read failed (`create_plan`, `update_plan`, `activate_plan`, `start_workout_session`, `finish_workout_session`) return success with the id and a `warning` instead of an error, so clients don't retry and duplicate.
- Paginated tools (`list_exercises`, `list_workout_sessions`) return an empty page with the `total` when the offset is past the end.

### Supabase setup

Enable the OAuth server (Authentication → OAuth Server in the dashboard, `[auth.oauth_server]` in `config.toml` locally) with:

- Authorization path `/oauth/consent`, relative to the project's Site URL, which must be the web app (the page no longer exists, see FIT-79).
- Dynamic client registration on, so MCP clients can register themselves.

## Tools

Weights are stored and returned in the user's unit (kg for the `metric` measurement system, lbs for `us`/`uk`) and are never converted. Heights are cm or inches.

| Tool                     | Auth | Description                                                                                      |
| ------------------------ | ---- | ------------------------------------------------------------------------------------------------ |
| `ping`                   | —    | Server name and version.                                                                         |
| `list_muscle_groups`     | —    | Muscle group ids and names.                                                                      |
| `list_plan_options`      | —    | Valid goals, places and experience levels.                                                       |
| `describe_muscle_group`  | —    | Display name for a muscle group id.                                                              |
| `get_profile`            | ✓    | Gender, age, height, weight, measurement system and units.                                       |
| `list_exercises`         | ✓    | Search the exercise library by name / muscle group (paginated).                                  |
| `get_exercise`           | ✓    | Full exercise details.                                                                           |
| `get_exercise_history`   | ✓    | The user's logged sets for an exercise, one entry per session-exercise row.                      |
| `list_plans`             | ✓    | The user's plans with a workout summary.                                                         |
| `get_plan`               | ✓    | Full plan: workouts → exercises → sets, in order.                                                |
| `create_plan`            | ✓    | Create a plan via the `create_plan` RPC; it becomes the active plan.                             |
| `update_plan`            | ✓    | Update metadata in place, or replace all workouts via the `update_plan` RPC (workout ids change). |
| `delete_plan`            | ✓    | Soft delete (`deleted_at`) and deactivate; repeating it is a no-op (`alreadyDeleted`).           |
| `activate_plan`          | ✓    | Make a plan the active one; returns the plan summary.                                            |
| `start_workout_session`  | ✓    | Start a session from a plan workout, or resume its open session (`resumed: true`).               |
| `get_workout_session`    | ✓    | Session with exercises and sets; set ids feed `log_set`.                                         |
| `list_workout_sessions`  | ✓    | Sessions filtered by `all` / `in_progress` / `finished`.                                          |
| `log_set`                | ✓    | Record reps and weight for a session set.                                                        |
| `finish_workout_session` | ✓    | Finish a session and rotate its workout (`rotated`); no-op if already finished.                  |
| `delete_workout_session` | ✓    | Permanently delete a session and its sets (errors if nothing was deleted).                       |

## Connecting

Claude Code (it runs the OAuth flow in the browser the first time a user tool is called, or via `/mcp`):

```bash
claude mcp add --transport http fitme https://mcp.fitmeproject.com
```

A static token still works for scripts and tests, until it expires:

```bash
claude mcp add --transport http fitme https://mcp.fitmeproject.com \
  --header "Authorization: Bearer $FITME_ACCESS_TOKEN"
```

Raw HTTP:

```bash
curl -s http://localhost:3002/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $FITME_ACCESS_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}'
```

To get a token against the local stack (`pnpm db start`), sign in through the auth REST API and use `access_token` from the response:

```bash
curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"…"}'
```
