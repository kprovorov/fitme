# @fitme/webhooks

Receives third-party webhooks. [Hono](https://hono.dev) app served with `@hono/node-server`, deployed as its own Vercel project (region `cle1`, next to the database). Reaches Postgres only through `withService` from `@fitme/db` and runs business logic from `@fitme/services`.

```bash
pnpm dev:webhooks          # tsx watch, http://localhost:3004
pnpm webhooks build        # tsdown bundle → dist/
pnpm webhooks start        # runs dist/index.js
pnpm webhooks test         # vitest
```

Env: see `.env.example` (`CLERK_WEBHOOK_SIGNING_SECRET`, `FITME_DATABASE_URL`, `SENTRY_DSN`, `COACH_URL`, `COACH_RESET_SECRET`). The process environment is read as is; nothing loads `.env` files.

## Endpoints

- `GET /health` — liveness
- `POST /clerk` — Clerk (Svix-signed). Verifies the signature on the raw request with `verifyWebhook` from `@clerk/backend` (401 otherwise). `user.deleted` runs `deleteUserData` through `withService`, then resets the User's Coach sessions through the Coach (their `coach_sessions` rows stay as tombstones); a failure of either is reported to Sentry and answers 500 so Clerk retries. Other events answer 200. No `svix-id` dedupe: both steps are idempotent.

Unknown routes return `{ error: { code, message } }` with 404.

## Layout

- `src/index.ts` — Node entrypoint, `PORT` env (default 3004)
- `src/app.ts` — `createApp(deps)` (default export = `createApp()` with the real dependencies, for Vercel)
- `src/routes/clerk.ts` — `clerkRoutes({ deleteCoachConversations, deleteUserData, reportError, signingSecret })`
- `src/coach.ts` — `deleteCoachConversations` (reset each recorded Coach session) and `coachSessionResetter` (the Coach's reset route over `COACH_RESET_SECRET`)
- `src/sentry.ts` — `reportError`: logs, sends to Sentry, flushes
