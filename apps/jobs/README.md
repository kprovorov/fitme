# @fitme/jobs

Every scheduled job (ADR 0024): one private function per job, called by [Vercel Schedules](https://vercel.com/docs/schedules). No HTTP surface, no domain, no cron secret. Reaches Postgres only through `withService` from `@fitme/db`; a job's logic goes in `@fitme/services`.

```bash
pnpm jobs job:forgotten-workout-sessions # one run against the checkout's own stack, then exits
pnpm jobs build                          # tsdown bundle → dist/
pnpm jobs test                           # vitest
```

There is no `dev` script: the app takes no part in `pnpm dev`. Env: see `.env.example` (`FITME_DATABASE_URL`, `SENTRY_DSN`; at build time `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`).

## Jobs

- `forgotten-workout-sessions` — every 10 minutes. Only proves it can reach Postgres and logs `forgotten-workout-sessions ran` so far.

## Layout

- `api/<job>.js` — the function Vercel builds: re-exports `dist/<job>.js`. Committed, since Vercel looks for functions before the build command runs
- `src/<job>.ts` — the entry: starts `@fitme/observability`, reports missing env, then imports the rest dynamically so `pg` loads after it and gets traced
- `src/jobs/<job>.ts` — the job, its dependencies injected
- `src/create-handler.ts` — the schedule handler: reports a failure and fails the run
- `src/run-<job>.ts` — one run by hand
- `public/` — the output directory, holding only an empty `.gitkeep`: without one Vercel would serve the app's files, and an empty one fails the build
- `vercel.json` — the function's trigger (`schedule/v1beta`, and no other) and its schedule. Never rename a schedule: that resets its state and history

## Vercel project

`fitme-jobs`, root directory `apps/jobs`, framework preset Other, every build setting left to `vercel.json`. Check what a build outputs from the repository root, with a `.vercel/project.json` whose `rootDirectory` is `apps/jobs`: `vercel build` must leave one function, `.vercel/output/functions/api/forgotten-workout-sessions.func`, with `schedule/v1beta` as its only trigger.
