# @fitme/mcp

Streamable HTTP [MCP](https://modelcontextprotocol.io) server for Fitme. Public catalog tools come from `@fitme/core`; authenticated tools let a client manage the signed-in user's training plans and track workouts in Supabase. Deployed at https://mcp.fitmeproject.com.

```bash
pnpm dev:mcp            # tsx watch, http://localhost:3002
pnpm mcp build          # tsdown bundle → dist/
pnpm mcp start          # runs dist/index.js
pnpm mcp test           # vitest (in-memory MCP client + Hono app, fake Supabase client)
pnpm mcp test:integration  # vitest against a running Supabase stack (see below)
```

The MCP endpoint is the root path: `POST|GET|DELETE /` (stateless, no session ids). `GET /health` for liveness.

## Integration tests

`integration/` runs the tools against a real Supabase stack instead of the fake client, so RLS, the RPCs and PostgREST behaviour (embeds, `!inner` filters, ranges past the end) are exercised for real. Each run signs up fresh users through the auth API (email confirmations are off in `config.toml`), then covers the main flow (create → get → update → activate → start session → log set → finish → list → delete) and checks that a second user can neither read nor change the first user's plans and sessions.

```bash
pnpm db start && pnpm db seed     # local stack + exercise library
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

Without the Supabase variables the server still starts and the public tools work; user tools return a "not configured" tool error.

## Authentication

Stateless bearer auth: every HTTP request may carry `Authorization: Bearer <Supabase user access token>` (the JWT from a Supabase session, e.g. `session.access_token`). For each request the server builds a Supabase client with the anon key plus that token, so all reads and writes go through RLS and the `auth.uid()`-based RPCs. The token is verified once per request (`auth.getUser`) before the first user tool runs. Tools never accept a user id.

- No token → user tools return `isError: true` with "Authentication required".
- Invalid or expired token → "Authentication failed: …".
- Database errors are returned as `isError: true` results carrying the Postgres/PostgREST message.
- Writes that committed but whose follow-up read failed (`create_plan`, `update_plan`, `activate_plan`, `start_workout_session`, `finish_workout_session`) return success with the id and a `warning` instead of an error, so clients don't retry and duplicate.
- Paginated tools (`list_exercises`, `list_workout_sessions`) return an empty page with the `total` when the offset is past the end.

Access tokens are short-lived (1 hour by default); clients must refresh them and reconnect with the new header.

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

Claude Code, public tools only:

```bash
claude mcp add --transport http fitme https://mcp.fitmeproject.com
```

With the user tools, pass the access token as a header:

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
