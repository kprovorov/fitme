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

## Endpoints

- `GET /health` — liveness
- `GET /v1/client-config` — public mobile client config: minimum supported app version per platform (`MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID`; unset → `null`), cached for 5 minutes
- `GET /v1/coach/models` — public list of Coach models and the default id, cached for 5 minutes
- `GET /v1/muscle-groups` — list muscle groups
- `GET /v1/muscle-groups/:muscleGroup` — single muscle group
- `GET /v1/profile` — the signed-in User's Profile with its units, or `{ data: null }` before onboarding
- `GET /v1/plans` — the User's live Plans, newest first, each with its Workouts in rotation order (name, order, Exercise count); not paged
- `GET /v1/plans/active` — the active Plan in full, or `{ data: null }` without one
- `GET /v1/plans/:id` — one Plan in full (Workouts, Exercises by `exercise_slug`, sets, each in order, plus `weight_unit`), or 404 `not_found`

`/health` and the global routes above answer without a token. Every other route, unknown ones included, needs `Authorization: Bearer <Clerk session token>`, verified networkless against `CLERK_JWT_KEY` (a token with a `sid`; `sub` is the User id); a missing or invalid one answers 401 `unauthorized`, so an unknown route answers 404 only to a signed-in caller. CORS preflights answer before auth.

The contract is `openapi.json`, generated from the route definitions by `src/openapi.ts`. `/v1` is additive only (a breaking change means `/v2`); the Public API workflow fails a pull request on a stale document or a breaking change.

Responses are JSON. Successful responses wrap the payload in `data`; failures return `{ error: { code, message } }` with a matching HTTP status. Invalid input answers 400 `invalid_request`.

## Layout

- `src/index.ts` — Node entrypoint, `PORT` env (default 3003)
- `src/app.ts` — Vercel entry: starts `@fitme/observability`, then default-exports `createApp()`
- `src/create-app.ts` — `createApp({ clerkJwtKey, createServices, identifyUser, reportError })` (each defaults to the real one): request spans, global middleware, the public routes, then auth, the User-data routes and the error/not-found handlers (unhandled errors are reported before the 500; 4xx aren't)
- `src/auth.ts` — `requireCaller` (the verified caller, `{ userId, kind: "session" }`, and their services) and `requires(permission)`, each User-data route's declared `read` / `write`
- `src/services.ts` — `UserServices`, the per-User facade: each method runs one `@fitme/services` function inside `asUser` for the verified User id; routes never pass a User id
- `src/routes/v1.ts` — versioned routers mounting resource routers from `src/routes/`: `publicV1` (no caller) and `userV1` (after auth)
- `src/schemas.ts` — shared schemas (`ErrorResponse`, `MuscleGroup`, `WeightUnit`), `weightUnitFor` and `invalidRequest`, every router's validation hook
- `src/openapi.ts` — writes `openapi.json` (`pnpm api openapi`)

## Tests

`src/__tests__/` drives `createApp` through `app.request` with Clerk session tokens signed by a test RSA key and fake services (`src/test/harness.ts`: an unfaked method fails the request), with a recording reporter and Sentry user.

## Integration tests

`integration/` runs the same seam against a real Supabase stack (`pnpm db start`, plus `pnpm db seed`: until the contract step a Plan written by slug needs the slug in the legacy `exercises` table): the real services facade through `asUser` on the stack's Supavisor pooler (the vitest config reads its URL from `supabase status`; `FITME_DATABASE_URL` overrides it), as made-up Clerk-style `user_…` ids with test-signed tokens. CI runs it in `.github/workflows/integration-tests.yml`.
