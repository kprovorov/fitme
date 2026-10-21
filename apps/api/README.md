# @fitme/api

REST API for Fitme built on [Hono](https://hono.dev) and served with `@hono/node-server`. Reads domain data from `@fitme/core`.

```bash
pnpm dev:api            # tsx watch, http://localhost:3003
pnpm api build          # tsdown bundle → dist/
pnpm api start          # runs dist/node/index.js
pnpm api test           # vitest
```

## Endpoints

- `GET /health` — liveness
- `GET /v1/client-config` — public mobile client config: minimum supported app version per platform (`MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID`; unset → `null`), cached for 5 minutes
- `GET /v1/coach/models` — public list of Coach models and the default id, cached for 5 minutes
- `GET /v1/muscle-groups` — list muscle groups
- `GET /v1/muscle-groups/:muscleGroup` — single muscle group

Responses are JSON. Successful responses wrap the payload in `data`; failures return `{ error: { code, message } }` with a matching HTTP status.

## Layout

- `src/index.ts` — Node entrypoint, `PORT` env (default 3003)
- `src/app.ts` — Vercel entry: starts `@fitme/observability`, then default-exports `createApp()`
- `src/create-app.ts` — `createApp({ reportError })`: request spans, global middleware, error/not-found handlers (unhandled errors are reported before the 500; 4xx aren't)
- `src/routes/v1.ts` — versioned router mounting resource routers from `src/routes/`
