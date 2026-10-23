# @fitme/api

REST API for Fitme (the Public API, ADR 0011) built on [Hono](https://hono.dev) with `@hono/zod-openapi` and served with `@hono/node-server`. Reads domain data from `@fitme/core`.

```bash
pnpm dev:api            # tsx watch, http://localhost:3003
pnpm api build          # tsdown bundle → dist/
pnpm api start          # runs dist/node/index.js
pnpm api test           # vitest
pnpm api openapi        # regenerate openapi.json (commit it; CI fails when it's stale)
```

## Endpoints

- `GET /health` — liveness
- `GET /v1/client-config` — public mobile client config: minimum supported app version per platform (`MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID`; unset → `null`), cached for 5 minutes
- `GET /v1/coach/models` — public list of Coach models and the default id, cached for 5 minutes
- `GET /v1/muscle-groups` — list muscle groups
- `GET /v1/muscle-groups/:muscleGroup` — single muscle group

The contract is `openapi.json`, generated from the route definitions by `src/openapi.ts`. `/v1` is additive only (a breaking change means `/v2`); the Public API workflow fails a pull request on a stale document or a breaking change.

Responses are JSON. Successful responses wrap the payload in `data`; failures return `{ error: { code, message } }` with a matching HTTP status. Invalid input answers 400 `invalid_request`.

## Layout

- `src/index.ts` — Node entrypoint, `PORT` env (default 3003)
- `src/app.ts` — Vercel entry: starts `@fitme/observability`, then default-exports `createApp()`
- `src/create-app.ts` — `createApp({ reportError })`: request spans, global middleware, error/not-found handlers (unhandled errors are reported before the 500; 4xx aren't)
- `src/routes/v1.ts` — versioned router mounting resource routers from `src/routes/`
- `src/schemas.ts` — shared schemas (`ErrorResponse`, `MuscleGroup`) and `invalidRequest`, every router's validation hook
- `src/openapi.ts` — writes `openapi.json` (`pnpm api openapi`)
