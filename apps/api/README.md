# @fitme/api

REST API for Fitme built on [Hono](https://hono.dev) and served with `@hono/node-server`. Reads domain data from `@fitme/core`.

```bash
pnpm dev:api            # tsx watch, http://localhost:3003
pnpm api build          # tsdown bundle → dist/
pnpm api start          # runs dist/index.js
```

## Endpoints

- `GET /health` — liveness
- `GET /v1/muscle-groups` — list muscle groups
- `GET /v1/muscle-groups/:muscleGroup` — single muscle group

Responses are JSON. Successful responses wrap the payload in `data`; failures return `{ error: { code, message } }` with a matching HTTP status.

## Layout

- `src/index.ts` — Node entrypoint, `PORT` env (default 3003)
- `src/app.ts` — Hono app, global middleware, error/not-found handlers
- `src/routes/v1.ts` — versioned router mounting resource routers from `src/routes/`
