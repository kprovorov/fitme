# @fitme/webhooks

Receives third-party webhooks. [Hono](https://hono.dev) app served with `@hono/node-server`, deployed as its own Vercel project (region `cle1`, next to the database). Reaches Postgres only through `withService` from `@fitme/db` and runs business logic from `@fitme/services`.

```bash
pnpm dev:webhooks          # tsx watch, http://localhost:3004
pnpm webhooks build        # tsdown bundle → dist/
pnpm webhooks start        # runs dist/node/index.js
pnpm webhooks test         # vitest
```

Env: see `.env.example` (`CLERK_WEBHOOK_SIGNING_SECRET`, `FITME_DATABASE_URL`, `SENTRY_DSN`, `ARNOLD_URL`, `ARNOLD_RESET_SECRET`, each falling back to its pre-rename name `COACH_URL` / `COACH_RESET_SECRET` when unset or empty; at build time `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source maps). The process environment is read as is; nothing loads `.env` files.

## Endpoints

- `GET /health` — liveness
- `POST /clerk` — Clerk (Svix-signed). Verifies the signature on the raw request with `verifyWebhook` from `@clerk/backend` (401 otherwise). `user.deleted` runs `deleteUserData` through `withService`, then resets the User's Arnold sessions through Arnold (their `arnold_sessions` rows stay as tombstones); a failure of either is reported to Sentry and answers 500 so Clerk retries. Other events answer 200. No `svix-id` dedupe: both steps are idempotent.

Unknown routes return `{ error: { code, message } }` with 404. An unhandled error is reported and answers a JSON 500; an `HTTPException` answers its own status, unreported.

## Layout

- `src/index.ts` — Node entrypoint, `PORT` env (default 3004)
- `src/app.ts` — the Vercel entry: imports `hono`, starts `@fitme/observability` (`initObservability({ service: "webhooks" })`), then imports `create-app` dynamically so `pg` loads after it and gets traced; default-exports `createApp()`
- `src/create-app.ts` — `createApp({ clerk, reportError })` (no argument = the real dependencies): request spans (`observeHono`) first, then the routes
- `src/routes/clerk.ts` — `clerkRoutes({ deleteArnoldConversations, deleteUserData, reportError, signingSecret })`
- `src/arnold.ts` — `deleteArnoldConversations` (reset each recorded Arnold session), `arnoldSessionResetter` (Arnold's reset route over the reset secret) and `arnoldResetConfig` (`ARNOLD_URL` / `ARNOLD_RESET_SECRET` from the environment, with the old-name fallbacks)
