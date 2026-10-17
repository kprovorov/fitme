# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Monorepo

This is a **pnpm + Turborepo** monorepo. Run repo-wide tasks from the root; run app-specific commands through the workspace filters.

```
apps/api                @fitme/api     — Hono REST API (Node)
apps/coach              @fitme/coach   — the Coach: an EVE agent (Vercel's durable agent framework, ai@7)
apps/mobile             @fitme/mobile  — Expo / React Native app
apps/web                @fitme/web     — Next.js (App Router) web app
apps/site               @fitme/site    — Next.js marketing site (fitmeproject.com)
apps/webhooks           @fitme/webhooks — Hono app receiving third-party webhooks (Node)
packages/core           @fitme/core    — domain models, labels, formatters, pure helpers
packages/supabase       @fitme/supabase — Supabase project + generated DB types
packages/db             @fitme/db      — asUser / withService: the only way backend apps reach Postgres
packages/services       @fitme/services — business logic run inside an asUser / withService transaction
packages/typescript-config              — shared tsconfig presets
```

## Commands

```bash
pnpm install

# Root (Turborepo)
pnpm dev                 # turbo run dev (all apps)
pnpm dev:mobile          # expo start
pnpm dev:web             # next dev on :3000
pnpm dev:site            # next dev on :3001
pnpm dev:mcp             # tsx watch MCP server on :3002 (MCP endpoint at /)
pnpm dev:api             # tsx watch REST API on :3003
pnpm dev:webhooks        # tsx watch webhooks app on :3004 (needs FITME_DATABASE_URL, CLERK_WEBHOOK_SIGNING_SECRET)
pnpm dev:coach           # eve dev (no TUI) on :3005 against the local stack (apps/coach/.env.local: CLERK_JWT_KEY, FITME_DATABASE_URL, AI_GATEWAY_API_KEY)
pnpm build               # turbo run build
pnpm test                # turbo run test (jest in mobile, vitest in core, mcp, api, webhooks and coach)
pnpm typecheck           # turbo run typecheck
pnpm check / pnpm fix    # ultracite (Biome) over the whole repo

# Per workspace
pnpm ios                 # expo run:ios       (alias for pnpm --filter @fitme/mobile ios)
pnpm mobile android      # expo run:android
pnpm mobile lint         # expo lint
pnpm web build           # next build
pnpm site build          # next build (marketing site)
pnpm mcp build           # tsdown bundle → apps/mcp/dist
pnpm mcp test            # vitest (in-memory MCP client)
pnpm mcp test:integration # vitest against the local Supabase stack through its pooler (needs seeded exercises; CLERK_DEV_SECRET_KEY adds the Clerk OAuth suite)
pnpm api build           # tsdown bundle → apps/api/dist
pnpm api test            # vitest (Hono app via app.request)
pnpm webhooks build      # tsdown bundle → apps/webhooks/dist
pnpm webhooks test       # vitest (Hono app via app.request, signed payloads, fake services)
pnpm coach build         # eve build → apps/coach/.output
pnpm coach test          # vitest (channel auth, Pro check, model selection, turn limits, tool wiring; no database or model)
pnpm coach eval          # eve eval: model-behaviour evals with stubbed tools (apps/coach/evals; needs AI_GATEWAY_API_KEY in apps/coach/.env.local, no database or Clerk token); run by hand before prompt or model changes, not in CI. `pnpm coach eval show-my-plan` runs one
pnpm --filter @fitme/db test:integration # vitest through the local Supavisor pooler as the fitme login (needs a local stack)
pnpm --filter @fitme/services test:integration # services inside withService/asUser through the local pooler (needs a local stack)
pnpm db start            # supabase start     (alias for pnpm --filter @fitme/supabase start)
pnpm db seed             # seed local database
pnpm db types:generate   # regenerate packages/supabase/src/database.types.ts
pnpm --filter @fitme/db schema:generate # regenerate packages/db's Drizzle schema (src/schema.ts, src/relations.ts) from the local stack
pnpm db clerk:check      # prove a Supabase stack accepts Clerk dev session tokens (CLERK_SECRET_KEY sk_test_…, SUPABASE_URL, SUPABASE_ANON_KEY)
pnpm db users:migrate [--dry-run]  # one-shot: copy Supabase Auth users into Clerk and rekey their rows (CLERK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL)
pnpm db clerk:check-migration      # dry-run/run/rerun users:migrate end to end on a fresh local stack + Clerk dev instance, then clean up
pnpm --silent db clerk:jwt-key [domain] # print a Clerk instance's JWT public key (CLERK_JWT_KEY); defaults to the dev instance

# Single test file
pnpm --filter @fitme/core exec vitest run src/__tests__/formatters.test.ts
pnpm --filter @fitme/mobile exec jest --testPathPatterns="<file>"
```

## Architecture

### apps/mobile — Expo app

React Native / Expo app using **file-based routing** via `expo-router`:

- `app/` — Expo Router routes (file-based navigation)
  - `_layout.tsx` — Root layout: initializes fonts, Sentry and RevenueCat
  - `(tabs)/` — Bottom tab navigator (Home, History, Coach, Library, Profile). Native tabs only show routes declared in `_layout.tsx` (SDK 58), so Home is the `(home)` group: its `index.tsx` is the app's `/` route, with no redirect route in between
  - `auth/` — Login/Register screens and the shared emailed-code screen (presented as fullscreen modal)
  - `onboarding/` — Post-registration onboarding flow (fullscreen modal)
  - `planner/` — AI plan generation flow (modal)
  - `plans/[planId]/` — Plan detail and workout views
  - `exercises/[exerciseId]/` — Exercise detail view
- `components/` — Reusable UI components
  - `ui/` — Primitive UI components (Button, Input, Dialog, etc.) built on `@rn-primitives`
  - `providers.tsx` — Wraps app with ClerkProvider (secure-store token cache), QueryClientProvider, ThemeProvider, KeyboardProvider; renders `auth-sync.tsx`, which identifies the Clerk User to Sentry/RevenueCat/Segment and clears the query cache on sign-out
  - `authenticated.tsx` — Auth guard component: waits for Clerk to load, redirects to `/auth/register` when signed out
- `hooks/` — Data layer
  - `queries/` — Read queries using `react-query-kit`'s `createQuery`
  - `mutations/` — Write mutations using `react-query-kit`'s `createMutation`
  - `revenueCat.ts` — RevenueCat subscription queries
  - `coach-model.ts` — `useSelectedCoachModel`: the served model list, the picked model and its setter, for the Coach header and model picker
- `lib/` — App-specific utilities
  - `supabase.ts` — Supabase client whose access token is the Clerk session token (no Supabase Auth session)
  - `clerk.ts` — Clerk publishable key, `getClerk()` for code outside React, `getCurrentUserId()`, `getClerkErrorMessage()`
  - `mmkv.ts` — MMKV storage instance (`createMMKV()`, react-native-mmkv 4 on Nitro Modules; same default instance and directory as v3, so saved data carries over), plus `devToolsStorage`, the same instance with `delete` for the devtools sync. Under Jest MMKV swaps in its own in-memory instance; `package.json` maps `react-native-nitro-modules` to `test-utils/nitro-modules.ts` so the import resolves
  - `coach-chat.ts` — Coach screen helpers: `COACH_URL`, per-turn model context, error → paywall mapping, the saved Conversation (see Key Patterns)
  - `coach-model.ts` — the Coach model list's schema and MMKV cache (`coach.models`), and the picker's choice (`coach.model`) resolved against it (see Key Patterns)
  - `utils.ts` — `cn()` class merger (tailwind-merge with the HIG font scale)
  - `segment.ts` — the Segment client, created at import. Segment generates ids through `crypto.getRandomValues`, so `react-native-get-random-values` is a direct dependency even though no app code imports it: only a direct dependency gets its native module (`RNGetRandomValues`) autolinked, and without it the client throws at import and the app never renders. Don't remove it as unused.
  - `constants.ts`, `useColorScheme.tsx`
- `plugins/` — local Expo config plugin for Xcode 27 compatibility: `with-ios-min-deployment-target.js` (raises pod targets below iOS 15.1, including resource bundles; still needed on SDK 58, since pods such as `react-native-keyboard-controller`, `react-native-safe-area-context`, `@sentry/react-native` and Segment still declare older minimums). RevenueCat needs no patch: `react-native-purchases` 10 pins purchases-ios 5.95.0, which builds under Xcode 27 / Swift 6.4. The app itself targets iOS 16.4 (SDK 58's default). UIScene adoption needs no flag on SDK 58: prebuild generates `SceneDelegate.swift`, so there is no `expo-build-properties` plugin.

### apps/web — Next.js app

- `app/` — App Router routes. `(app)/` is the authenticated area (dashboard; account menu is Clerk's `<UserButton>`); `sign-in/[[...sign-in]]` is Clerk's prebuilt `<SignIn>` page. `ClerkProvider` in the root layout sets the sign-in URL and sends signed-out Users to `/`.
- `proxy.ts` — Next 16 request proxy running `clerkMiddleware`: every route except `/` and `/sign-in` calls `auth.protect()`, which redirects signed-out requests to sign-in with a `redirect_url` back. Route paths live in `lib/routes.ts`.
- `lib/supabase/server.ts` (`createClient()`, Server Components) and `lib/supabase/client.ts` (`useSupabase()` hook, Client Components) — `supabase-js` clients typed with `Database` from `@fitme/supabase` whose `accessToken` is the User's Clerk session token, so RLS reads their Clerk id from `sub`. There is no Supabase Auth session in the web app.
- `components/ui/` — shadcn-style primitives (Tailwind v4 + cva). `components.json` is set up for the shadcn CLI.
- Styling: Tailwind v4 via `@tailwindcss/postcss`; theme tokens in `app/globals.css` mirror the mobile palette.

### apps/site — Next.js marketing site

Public site at fitmeproject.com. No auth, no Supabase. Tailwind v4 via `@tailwindcss/postcss` (CSS-first config in `app/globals.css`, typography plugin loaded with `@plugin`) with shadcn-style `components/ui/` primitives.

- `app/` — landing page, `blog/`, `support/`, `privacy-policy/`, `terms/`, plus `sitemap.ts`, `robots.txt` and OG/Twitter images.
- `blog/*.mdx` — posts with `title`, `summary`, `publishedAt` frontmatter, parsed by `app/blog/utils.ts` and rendered with `next-mdx-remote-client`. Cover image: `public/blog/<publishedAt>.png`.
- `public/.well-known/apple-app-site-association` — universal links for the iOS app (served as JSON via `next.config.ts` headers).
- Analytics: PostHog (proxied through `/ingest` rewrites), Google Tag Manager, Vercel Analytics and Speed Insights. Client init lives in `instrumentation-client.ts`.

### apps/api — REST API

Hono app served with `@hono/node-server`, bundled with tsdown. Reads domain data from `@fitme/core`.

- `src/index.ts` — Node entrypoint, `PORT` env (default 3003).
- `src/app.ts` — Hono app: global middleware (logger, CORS), `/health`, JSON `notFound`/`onError` handlers returning `{ error: { code, message } }`.
- `src/routes/v1.ts` — versioned router; each resource lives in its own file under `src/routes/` and is mounted here. Input validation uses `@hono/zod-validator`.
- `src/routes/client-config.ts` — public, unauthenticated `GET /v1/client-config`: `{ data: { minimumVersion: { ios, android } } }`, the oldest supported mobile app version per platform from `MIN_APP_VERSION_IOS` / `MIN_APP_VERSION_ANDROID` (`x.y.z`; unset or malformed → `null`, no minimum). Cached for 5 minutes (`Cache-Control: public, max-age=300, s-maxage=300`).
- `src/routes/coach-models.ts` — public, unauthenticated `GET /v1/coach/models`: `{ data: { models: [{ id, label, description }], defaultId } }`, straight from `coachModels` and `defaultCoachModelId` in `@fitme/core` (list order; no other fields per model), so it always matches what the Coach accepts. No auth: the list isn't secret, the Coach channel does the gating. Cached for 5 minutes like `client-config`.
- Tests (`src/__tests__/`, vitest) drive the app through `app.request`.
- Deployed to Vercel (project `fitme-api`, region `cle1` in `vercel.json`) at https://api.fitmeproject.com.

### apps/webhooks — webhooks app

Hono app served with `@hono/node-server`, bundled with tsdown (same setup as `apps/api`), that receives every third-party webhook. It reaches Postgres only through `withService` from `@fitme/db` and runs business logic from `@fitme/services`.

- `src/app.ts` — `createApp(deps)` (default export = `createApp()` with the real dependencies, for Vercel): logger, public `/health`, one route per sender, and the same JSON `notFound`/`onError` handlers as `apps/api` (`{ error: { code, message } }`).
- `src/routes/clerk.ts` — `POST /clerk`, `clerkRoutes({ deleteCoachConversations, deleteUserData, reportError, signingSecret })`: verifies the Svix signature with `verifyWebhook` from `@clerk/backend` on the raw request before anything reads the body (401 otherwise; an unset `CLERK_WEBHOOK_SIGNING_SECRET` answers a reported 500 so Clerk retries). `user.deleted` runs `deleteUserData` through `withService`, then (once that has committed) `deleteCoachConversations`; a failure of either is reported and answers 500 so Clerk retries. Other events answer 200. No `svix-id` dedupe: both steps are idempotent; a webhook that isn't must dedupe on `svix-id`.
- `src/coach.ts` — `deleteCoachConversations({ listSessionIds, resetSession })`: lists the User's recorded Coach session ids (`listCoachSessionIds` in `withService`: the id is retired by then) and resets each (five at a time); any failed reset fails the call (an `AggregateError`, first failure as its `cause`). The `coach_sessions` rows stay as tombstones (see `packages/services`). No recorded sessions → no Coach call at all. `coachSessionResetter({ coachUrl, secret })` posts `COACH_URL/eve/v1/session/:id/reset` with `Bearer COACH_RESET_SECRET`; eve answers `reset`, or `no_active_session` for one already reset, expired or unknown, so a retry is harmless; anything else (or unset `COACH_URL` / `COACH_RESET_SECRET`) throws.
- `src/sentry.ts` — `reportError`: logs, captures with `@sentry/node` (initialized on first use from `SENTRY_DSN`; unset → disabled) and flushes before the response.
- `src/index.ts` — Node entrypoint, `PORT` env (default 3004).
- Tests (`src/__tests__/`, vitest) drive the app through `app.request` with payloads signed by a test secret (`standardwebhooks`) and fake dependencies, so they need no database.
- Deployed to Vercel as its own Pro project, region `cle1` (`vercel.json`). `FITME_DATABASE_URL` carries `application_name=webhooks`. Its `/clerk` endpoint is registered for `user.deleted` on both Clerk instances, each with its own signing secret in the matching Vercel environment.

### apps/coach — the Coach (EVE)

The Coach as an [EVE](https://www.npmjs.com/package/eve) agent (ADR 0005) whose model calls go through Vercel AI Gateway (ADR 0006), which replaced the `ai-agent` edge function (since removed). EVE is in preview: it is pinned to an exact version; read its changelog on every bump. Its docs ship in the package (`node_modules/eve/docs/`, start at `README.md`; the `eve` agent skill points there). EVE is filesystem-first: every file under `agent/` is discovered by its path, so put helpers in `agent/lib/` and tests in `test/`. Needs Node 24: `engines.node` is `24.x`, so Vercel never moves it to a new major on its own.

- `agent/agent.ts` — `defaultTools: false` (no shell, file or web tools; `eve info --json` lists what the model gets), Conversations end 30 days after they start (`limits.sessionTimeoutMs`; an ended run's data is kept for the plan's default period through `experimental.workflow.retention: "default"`: without it, eve 0.80+ deletes a private or unknown-audience session's run data as soon as its run ends outside development, and account deletion relies on a reset session's stream outliving the reset), and the model is resolved on every `step.started` by `coachModelSelection` (`agent/lib/models.ts`): the client sends `clientContext: { model }` per turn, eve hands it to the resolver as a `context.instruction` user message (`Client context:` + JSON), and the id must be in `coachModels` from `@fitme/core`, the only list (none → `defaultCoachModelId`; anything else, pre-Gateway ids like `gpt-5.5` included, fails the turn). Coach model ids are the Gateway's own (`openai/gpt-5.5`, `anthropic/claude-haiku-4.5`), so the selection returns the id and eve routes the call through AI Gateway (credits; Vercel OIDC deployed, `AI_GATEWAY_API_KEY` locally), with `providerOptions.gateway.order` listing the hosts of that same model (OpenAI → Azure → Bedrock, Anthropic → Bedrock → Vertex) so a failed call moves to another host, never another model. No `promptCacheKey` (OpenAI caches automatically); eve sets the Gateway `sessionId` per Conversation itself.
- `agent/instructions.md` — the system prompt, carried over from `ai-agent`.
- `agent/channels/eve.ts` — the eve HTTP channel (`/eve/v1/session…`) behind `accountDeletionReset()` (`agent/lib/reset-auth.ts`) then `clerkSession()` (`agent/lib/clerk-auth.ts`), then `evalRunner()` (`agent/lib/eval-runner.ts`), which admits only on the dev server a local `eve eval` boots (`EVE_EVALUATION` and `EVE_DEV` set, never on Vercel): eve's `local-dev` principal with `allowToolStubs`, never a Clerk User, so tools refuse to act for it, and `admitTurn` lets its turns run without recording the session. `accountDeletionReset` accepts `Bearer COACH_RESET_SECRET` (compared in constant time; unset or under 32 characters accepts nothing) as the `service` principal `account-deletion` on `POST /eve/v1/session/:id/reset` only, and answers 403 for it anywhere else; any other bearer moves on to `clerkSession`: a Clerk session token verified networkless against `CLERK_JWT_KEY`; its `sub` becomes the session principal (`authenticator: "clerk"`). Missing or bad token → 401; missing key → 500. Then the Pro check (every route, before the session claim): `createProCheck` (`agent/lib/pro-access.ts`) asks RevenueCat's v1 REST API (`GET /v1/subscribers/:id` with `REVENUECAT_SECRET_KEY`) whether the caller's Clerk id (the id `auth-sync` identifies to RevenueCat) has the active `proEntitlement` ("Fitme Pro", from `@fitme/core`) (lifetime or within its billing grace period counts), caching each answer per User for 5 minutes in the instance (a Pro answer no longer than the entitlement lasts; failures aren't cached). Not Pro → 403 `{ ok: false, code: "coach_pro_required" }` (the app's paywall); RevenueCat failing or taking over 5 s, an unreadable answer or a missing key → reported 503 `coach_pro_check_unavailable`, never let through. Both codes are `coachErrorCodes` in `@fitme/core`, for the app to match on. EVE's route auth has no session ownership, so any route addressing a session (`/eve/v1/session/:id…`: messages, stream, cancel, clear, compact, reset) claims it through `claimSession` (`agent/lib/claim-session.ts`: `recordCoachSession` as the caller in `asUser`, a no-op if it's recorded already, then `getCoachSessionOwner` in `withService`) and answers 403 unless it is recorded for the caller. EVE gives the channel no session id at creation, so the creator's first request addressing it records it; a failed recording fails the request, never lets anyone in. No `localDev()`, so local requests need a token too. Clerk tokens never go past the channel. `/eve/v1/health` is public.
- `agent/lib/owner.ts` — the Conversation owner is the session's `auth.initiator` (the verified caller who started it): the only User id tools act as. Route auth doesn't check session ownership, so `agent/hooks/conversation.ts` cancels a `turn.started` whose caller isn't the owner, and claims the session for the owner (the same `claimSession`, every turn) before the model runs; a session recorded for someone else, or a failed recording, is reported and cancels the turn (account deletion needs every session id to reset it).
- `agent/hooks/turn-limits.ts` — caps per turn (`agent/lib/turn-limits.ts`): 20 model steps and $1.00 of model cost (the `costUsd` AI Gateway reports on each `step.completed`, summed per turn; ADR 0006). The `step.started` past either cap cancels the turn; the last call can overshoot the budget by its own cost, and EVE's retries of a step (up to 4, same `stepIndex`, state restored) aren't counted. A finished step that reports no cost fails closed: it is reported to Sentry and the next `step.started` cancels the turn. eve's own `limits.max*PerSession` (`maxTokenCostUsdPerSession` included) are per session and prompt the user to continue, so they aren't used.
- `agent/hooks/sentry.ts` — `step.failed`, `turn.failed` and `session.failed` go to Sentry (`agent/lib/sentry.ts`, `SENTRY_DSN`; unset → logs only).
- `agent/tools/` — one file per tool, the filename is the tool name, ported 1:1 from `ai-agent` (names, inputs, descriptions). Each is a thin wrapper: `asUser(owner, (tx) => service(tx, owner, …))` with `owner` from `requireConversationOwner(ctx.session.auth)`; tool inputs never carry a User id (their zod schemas strip unknown keys). So far: `get_user_profile` → `getProfile`, `activate_plan` → `activatePlan`, `update_user_profile` → `updateProfile`, `get_active_plan` → `getActivePlan` (`{ error: "No active plan found" }` without one), `get_plans` → `listPlans`, `get_workouts_history` → `listWorkoutHistory` (`limit` 1–20, default 10), `search_exercises` → `listExercises` (first 8 matches; `muscle_group` one of `muscleGroups`), the Plan edits `add_exercise_to_workout`, `remove_exercise_from_workout`, `replace_exercise_in_workout`, `add_set_to_exercise`, `remove_set_from_exercise` and `update_set_recommendations` → the matching `@fitme/services/workout-edits` function (ids are uuids; set targets and set counts have MCP's plan bounds, in `agent/lib/workout-edits.ts`; an unknown Exercise, an Exercise already at its set limit or a missing row is an `{ error }` result; a remove that finds nothing says it may already have been removed, since a re-run step repeats it; the two appends pass `requestKey(ctx, input)` from `agent/lib/request-key.ts`: a hash of the session, turn, the step's message count, the tool, its input and the call's position among identical calls of the same step execution (told apart by the `ctx.messages` array, which the AI SDK shares across one execution's tool calls and a re-run rebuilds), so a re-run step, which repeats the model call under new `callId`s, finds the rows the first run added, while two identical calls in one step still add two rows), and `display_workout_plan`, which is pure (returns its input; the app renders it as the plan card, so its schema is the app's contract).
- `evals/` — `eve eval` evals (`*.eval.ts`, `evals.config.ts`): the common asks (show my plan, last week's sessions, find a chest exercise, propose a plan, a general question) against a real model, every read tool stubbed from `evals/fixtures.ts` per session (`t.session({ stubs: readToolStubs })`). Local only: a remote `--url` target has no eval authenticator.
- `agent/sandbox.ts` — just-bash (in-process, nothing to build or pay for): eve prepares a sandbox even though no tool uses one.
- `eve build` bundles the source-only `@fitme/*` packages into `.output/` itself. `FITME_DATABASE_URL` carries `application_name=coach`.
- Tests (`test/`, vitest) call the pure functions and the tools' `execute` directly: channel auth through `routeAuth` with tokens signed by a test RSA key (Pro check faked), the Pro check with RevenueCat faked through an injected `fetch` and clock (cache window and timeout included), the eval runner's env gate, model selection, turn limits, the owner/turn guard, and each tool with `@fitme/db` and its service mocked (`test/tool-context.ts` fakes a session owned by a Clerk User).

### apps/mcp — MCP server

Stateless [Streamable HTTP](https://modelcontextprotocol.io) MCP server built on Hono + `@modelcontextprotocol/sdk`, served with `@hono/node-server`.

- `src/server.ts` — composition root: `createMcpServer({ context })` (`context` = the request's `ToolContext`, built by the HTTP layer from a verified Clerk User) registers the tool groups from `src/tools/` (`registerTool` with zod input schemas, `title`, and read-only/destructive/idempotent `annotations`).
- `src/tools/` — `catalog.ts` (catalog tools from `@fitme/core`: ping, muscle groups, plan options; they still need a token like every other tool), and user tools in `exercises.ts`, `plans.ts` (+ `plan-schemas.ts`), `sessions.ts`, `profile.ts`; shared bounds in `limits.ts`. `helpers.ts` holds `asJson`, `requireFound` and `withServices` (hands a handler the caller's services; a failure becomes an `isError` result with the Postgres message, never the SQL). Every write reads its result back in its own transaction, so no tool returns a `warning`.
- `src/context.ts` — `createToolContext({ user, createServices? })`: per-request `ToolContext` for a verified Clerk User. `getServices()` returns the `UserServices` (`src/services.ts`) built for `user.userId`, each method running one `@fitme/services` function inside `asUser(user.userId, …)`; every user tool runs on them via `withServices` and never passes a User id, and a missing `FITME_DATABASE_URL` is the "not configured" tool error.
- `src/auth.ts` — MCP authorization (OAuth 2.1) with Clerk as the authorization server: protected-resource metadata naming the Clerk instance (`protectedResourceHandlerClerk` from `@clerk/mcp-tools/hono`) and the middleware chain for `/`: `requireConfig` (500 when `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` or `FITME_DATABASE_URL` is missing; never serve without auth), `requireBearerToken` (`401` + `WWW-Authenticate: Bearer resource_metadata=…`), `@clerk/hono`'s `clerkMiddleware`, then `requireClerkUser` (`getAuth(c, { acceptsToken: "oauth_token" })`; a rejected token gets `401` `error="invalid_token"`). No audience check (Clerk OAuth tokens have no `aud`), no custom scopes, no dynamic client registration.
- `src/app.ts` — `createApp({ createServices? })` builds the Hono app (default export = `createApp()` for Vercel): the MCP endpoint is the root `/` (all methods, initialize and `tools/list` included), behind the `auth.ts` chain, creating a fresh server per request through `streamableHttpHandler` (`@clerk/mcp-tools/hono`); only `/.well-known/oauth-protected-resource` (OAuth discovery) and `/health` (liveness) are public. Deployed at https://mcp.fitmeproject.com.
- `src/index.ts` — Node entrypoint, `PORT` env (default 3002).
- Tests (`src/__tests__/`, vitest) drive `createMcpServer` through the SDK's `InMemoryTransport` + `Client` (`harness.ts`, `contextFor(services)` builds the `ToolContext`), and the Hono app via `app.request` (`app.test.ts`, with `@clerk/hono` mocked so `getAuth` answers per test). Tools run on fake services (`connectWithServices` / `fakeServices`: an unfaked method fails the call). `integration/` (separate vitest config, `test:integration`) runs the same tools against a real local stack as made-up Clerk-style `user_…` ids through `asUser` on the stack's pooler (the config reads its URL from `supabase status`, like `packages/services`; `FITME_DATABASE_URL` overrides), including a cross-user isolation suite that also calls the RPCs and table writes directly as the intruder. `integration/clerk-oauth.test.ts` (helpers in `integration/clerk.ts`) runs the real OAuth flow headlessly against the Clerk development instance (Backend API test Users and a public OAuth application, sign-in token on a dev browser, consent POSTed to the Frontend API, PKCE through the MCP SDK's OAuth client, then user tools over HTTP) and is skipped without `CLERK_DEV_SECRET_KEY`. CI runs both in `.github/workflows/integration-tests.yml`.
- Plan writes go through `createPlan` / `updatePlan` from `@fitme/services/plans`, each one transaction. `update_plan` with `workouts` recreates every workout (new ids); a metadata-only update keeps them. Unknown exercise ids are rejected before anything is written. `start_workout_session` and `finish_workout_session` run `startWorkoutSession` / `finishWorkoutSession` from `@fitme/services` (see there), each returning the session read in the same transaction.

### packages/core — `@fitme/core`

Platform-agnostic code shared by both apps: `models.ts` (Profile, Plan, Workout, Exercise, etc. plus enum arrays like `goals`, `muscleGroups`), `labels.ts`, `formatters.ts`, `names.ts` (`splitName`), `types.ts` (pagination), `utils.ts` (`range`, `muscleGroupToName`, `handleSupabaseError`). Tests use vitest. Nothing in here may import React Native, Expo, or Next.

### packages/db — `@fitme/db`

The only way backend apps reach Postgres (ADR 0003): Drizzle on node-postgres (`pg`, not postgres.js) through the Supavisor transaction pooler, as the shared `fitme` login. Source-only, like the other workspace packages.

- `src/schema.ts` + `src/relations.ts` — generated Drizzle schema (the `public` tables plus `private.retired_user_ids` as `retiredUserIdsInPrivate`); `src/index.ts` re-exports the tables, and the relations only feed the client so `tx.query` works. `schema:generate` runs `drizzle-kit pull` (`drizzle.config.ts`, direct superuser URL from `supabase status`) against the running local stack, renames the `private` schema object to `privateSchema`, sorts declarations by name and formats with Biome, so reruns against the same migrations are byte-identical. Never edit them by hand, and never run `drizzle-kit generate`/`migrate`/`push`: the Supabase SQL migrations own the schema (ADR 0004). After a migration, regenerate and commit both files with `database.types.ts`.
- `src/index.ts` — the two doors and the `Transaction` type (typed with the generated schema, so `tx.select().from(plans)` and `tx.query.plans.findMany(…)` are checked). `asUser(userId, fn)` opens a transaction, runs `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', {sub, role: authenticated}, true)`, then `fn(tx)`, so RLS and `current_user_id()` apply; `userId` only ever comes from a verified token. `withService(fn)` does the same as `service_role` (bypasses RLS; only where that is the point, such as webhooks). Both also set `application_name` locally.
- `src/client.ts` — internal: the lazily created `pg.Pool` (small `max`, registered with `@vercel/functions`' `attachDatabasePool`) and Drizzle client, from `FITME_DATABASE_URL`, which must carry `?application_name=<app>`. Never export the raw client or pool, and never import this module from outside the package.
- A new runtime dependency here (or in `@fitme/services`) must also go in the `dependencies` of `apps/mcp` and `apps/webhooks`, or their tsdown build fails (see "Workspace packages are source-only").
- Never use a session-level `SET ROLE` or `set_config(…, false)` anywhere: the transaction pooler doesn't reset connections, so session state leaks to other requests.
- A transaction is one connection: await its queries one at a time, never `Promise.all` over the same `tx` (pg deprecates queueing on a busy client and pg@9 rejects it). The db, services and MCP integration suites run with `--throw-deprecation`, so such a query fails them.
- `fitme` (migration `20261014130000_fitme_login.sql`) is `LOGIN NOINHERIT` with no grants of its own, a member of `authenticated` and `service_role` only, so a query outside both doors fails with "permission denied". Its credential is service-role strength: server environments only. Local stacks set its development password in `supabase/roles.sql` (run by the CLI before the migrations, never pushed); hosted projects set theirs by hand. The pooler user is `fitme.pooler-dev` locally and `fitme.<project-ref>` on hosted projects.
- `integration/` (`test:integration`) runs the doors against the local stack's pooler (its port comes from `supabase status --output-format json`; `FITME_DATABASE_URL` overrides): identity and RLS, concurrent transactions with rollbacks never seeing another User's id, clean reused connections, and the login denied outside the doors. CI runs it in the integration-tests workflow.

### packages/services — `@fitme/services`

Business logic shared by the backend apps (ADR 0004), replacing the Postgres RPCs one by one. Source-only; each service is its own export (`@fitme/services/<name>`), no barrel.

- The rule: a service takes the `Transaction` from `asUser` or `withService` as its first argument and never opens its own connection. Any User id it acts on comes from a verified source (a verified token, or a signed webhook), never from request or tool input.
- `profile.ts` — `getProfile(tx, userId)`, run inside `asUser`: the User's Profile (gender, age, height, weight as numbers, `measurement_system`) plus its `units` (metric = cm/kg, us/uk = in/lbs; an unknown system counts as metric), or `null` without a Profile. Used by MCP's `get_profile` and the Coach's `get_user_profile`. `updateProfile(tx, userId, changes)` (the Coach's `update_user_profile`): changes only the given fields and returns `getProfile`'s result, or `null` with nothing changed without a Profile. A new `measurement_system` first converts every stored height and weight of the User as the `convert_measurement_system` RPC does (same factors and rounding, same rows: sessions are reached through their Workout), which the mobile app still calls, so change both together; the given height and weight are then written in the new system's units. It row-locks the Profile with a no-op UPDATE first, so a repeat or concurrent run sees the new system and never converts twice.
- `coach-sessions.ts` — `recordCoachSession(tx, userId, sessionId)` / `listCoachSessionIds(tx, userId)`, run inside `asUser`: the Coach's EVE session ids per User in `coach_sessions` (migration `20261014160000_coach_sessions.sql`; RLS: a User reads and inserts only their own rows, `service_role` may delete). Recording is idempotent (`on conflict do nothing`), and an id already recorded for another User stays theirs. `getCoachSessionOwner(tx, sessionId)` runs in `withService` (the channel's ownership check). `deleteUserData` locks this table but keeps the rows, and so does the Clerk webhook after resetting the sessions: each is the ACL for an EVE session whose stream outlives the reset (a missing row lets the first caller claim it), and the id in it is already retired, so it fails closed. The webhook lists them with `listCoachSessionIds` in `withService`, since the retired id no longer matches RLS.
- `exercises.ts` — run inside `asUser`: `listExercises(tx, { limit, offset, search?, muscleGroup? })` (alphabetical page plus `total`/`hasMore`; `search` is a case-insensitive substring with `%`/`_` literal; an offset past the end is an empty page), `getExercise(tx, exerciseId)` (every column, or `null`) and `getExerciseHistory(tx, userId, { exerciseId, limit })` (the User's Workout Session entries for the Exercise, newest first, only sets with a logged weight). Timestamps go through `jsonTimestamp` (`json-timestamp.ts`, `to_json`) so they keep PostgREST's ISO format. Used by MCP's exercise tools and the Coach's `search_exercises`.
- `plans.ts` — run inside `asUser`, each filtering on the User id as well as RLS: `listPlans(tx, userId)` (live Plans newest first, each with Workout summaries in rotation order and Exercise counts; no pagination), `getPlan(tx, userId, planId)` (a live Plan with Workouts, Exercises and sets, each in `order`; `null` when missing, soft-deleted or foreign), `getActivePlan(tx, userId)` (the same for the User's active Plan, or `null` with none), `deletePlan(tx, userId, planId)` (soft delete: sets `deleted_at`, and the `deactivate_deleted_plan` trigger clears `is_active`; an already deleted Plan answers `alreadyDeleted: true`, a missing one `null`) and `activatePlan(tx, userId, planId)` (the `activate_plan` RPC in TypeScript, which stays for the mobile app, so change both together: the live Plan becomes active and every other Plan of the User inactive, so at most one is active; its summary, or `null` with nothing changed for a missing, soft-deleted or foreign Plan. Concurrent activations serialize on row locks and the last one wins), `createPlan(tx, userId, plan)` (the `create_plan` RPC: a Plan with its Workouts, Exercises and sets, each `order` from its array position, made the active Plan through `activatePlan`; the Plan in full) and `updatePlan(tx, userId, planId, changes)` (the `update_plan` RPC: only the given metadata fields change; with `workouts` every Workout is deleted and recreated, new ids, otherwise they and their ids stay; the Plan in full, or `null` with nothing changed for a missing, soft-deleted or foreign Plan; it locks the Plan row by its UPDATE before touching Workouts, like the RPC). Both throw `UnknownExercisesError` for unknown Exercises before anything commits, and the RPCs stay for the mobile app, so change both together. Each read is one relational query (one statement, so one snapshot under READ COMMITTED: a concurrent `update_plan` never mixes old metadata with new Workouts). Output matches what PostgREST returned: snake_case keys, timestamps through `jsonTimestamp`, numeric weights as numbers. Used by MCP's `list_plans`, `get_plan`, `create_plan`, `update_plan`, `delete_plan` and `activate_plan`, and by the Coach's `activate_plan` (`activatePlan`), `get_plans` (`listPlans`) and `get_active_plan` (`getActivePlan`).
- `workout-edits.ts` — the Coach's Plan edits, run inside `asUser`, each filtering on the User id as well as RLS (another User's row is `null` / `false`, never edited): `addExerciseToWorkout(tx, userId, { workoutId, exerciseId, sets, requestKey? })` and `addSetToExercise(tx, userId, { workoutExerciseId, set, requestKey? })` append after the last row; `removeExerciseFromWorkout(tx, userId, workoutExerciseId)` and `removeSetFromExercise(tx, userId, setId)` renumber the remaining siblings from 1; `replaceExerciseInWorkout(tx, userId, { workoutExerciseId, newExerciseId, sets })` keeps the row and its place and replaces its sets (when that Exercise with exactly those sets is already in place, it rewrites nothing, so set ids stay valid); `updateSetRecommendations(tx, userId, setId, changes)` changes only the given targets. Adding and replacing throw `UnknownExercisesError` before writing, and `addSetToExercise` throws `TooManySetsError` for a Workout Exercise already at `MAX_SETS_PER_EXERCISE` (20) sets. A replacement already in place is detected by comparing weights as Postgres rounds them to numeric(8,2). Each append, remove or replace first takes ROW EXCLUSIVE on `workouts`, `workout_exercises`, `workout_exercise_sets` (`deleteUserData`'s order, so it queues behind an account deletion instead of deadlocking with its cascade), then row-locks (`FOR NO KEY UPDATE`) the parent it appends to or renumbers (the Workout, or the Workout Exercise) and nothing above it, so concurrent edits keep `order` contiguous and can't deadlock with `updatePlan` / `finishWorkoutSession`. A Workout of a soft-deleted Plan is still edited, as `ai-agent` did. Retries: removing, replacing and updating are safe to repeat (a repeated remove answers not found); an append stores its `requestKey` in the row's `request_key` column (migration `20261015120000_plan_edit_request_keys.sql`, partial unique index), and a repeated call with the same key returns that row.
- `workout-sessions.ts` — run inside `asUser` (RLS scopes every query to the User): `listWorkoutSessions(tx, { limit, offset, status })` (newest first, with exercise/set/logged-set counts and `total`, counted in the page's own statement; an offset past the end is an empty page), `getWorkoutSession(tx, id)` (exercises and sets in order, or `null`; one statement, so a concurrent delete never yields a half-read session), `listWorkoutHistory(tx, { limit })` (the last `limit` finished sessions, last finished first, each in full like `getWorkoutSession`, in one statement; the Coach's `get_workouts_history`), `logSet(tx, { setId, repsCompleted, weightCompleted })` (`logged` / `not_found` / `session_finished`; one guarded UPDATE that only matches a set of an open session, so it takes no row lock that could deadlock with `deleteUserData`) `deleteWorkoutSession(tx, id)` (false when nothing matched), `startWorkoutSession(tx, workoutId)` and `finishWorkoutSession(tx, id)` (`started` / `finished` with the session, or `not_found`). Timestamps are rendered as PostgREST did (`to_json`), numerics as numbers, weights in the User's unit. Used by every MCP Workout Session tool.
- Start and finish reimplement the `start_workout_session` / `finish_workout_session` RPCs, which the mobile app still calls: until the RPCs are dropped, a behaviour change goes into both. Start returns the User's open session for the Workout (`resumed`) or inserts one `ON CONFLICT DO NOTHING` against the one-open-per-Workout index and copies the Workout's exercises and sets; a lost race resumes the winner's session, and a Workout of a soft-deleted Plan, another User's, or one whose open session belongs to another id is `not_found`. Finish keeps the RPC's lock order (`workout_sessions` `ROW EXCLUSIVE`, then the Plan row, then the session), claims only an open session, and moves its Workout to the end of the Plan, renumbering from 1 (`rotated`); a session whose Workout is gone is only finished (`rotated: false`), an already finished one is left alone (`alreadyFinished`).
- `delete-user-data.ts` — `deleteUserData(tx, userId)`, run inside `withService` (it replaced the dropped `delete_user_data` SQL function): rejects an empty id, locks the User-owned tables and their children `IN SHARE ROW EXCLUSIVE MODE` in `rekey_user`'s order, throws `UserRekeyedError` (`code` `55000`) for an id that was rekeyed away, retires the id in `private.retired_user_ids` (on conflict do nothing) and deletes the root rows (Workout Sessions, Plans, conversations, Profile), whose children cascade; Coach session ids stay (the webhook resets those sessions and keeps the rows as their ACL). A second run is a no-op. Its table list must track the schema. `service_role`'s grants for it come from migration `20261014140000_service_role_deletes_user_data.sql`.
- `integration/` (`test:integration`) runs the services against the local stack's pooler like `packages/db` (the URL helper is `@fitme/db/local-database-url`), as made-up Clerk-style `user_…` ids; CI runs it in the integration-tests workflow.

### packages/supabase — `@fitme/supabase`

- `supabase/` — Supabase CLI project: `config.toml`, `migrations/`, `templates/`, `seed.ts`, `sync.ts`. There are no Edge Functions: backend code lives in the Node apps (`apps/api`, `apps/coach`, `apps/mcp`, `apps/webhooks`).
- Account deletion: the app deletes the User in Clerk (`user.delete()`, needs Clerk's "allow users to delete their accounts") and signs out; Clerk then sends `user.deleted` to `apps/webhooks`' `POST /clerk` (registered on both Clerk instances), the only cleanup path, which runs `deleteUserData` from `@fitme/services` inside `withService`, then wipes the User's Coach Conversations: it resets every EVE session recorded for them through the Coach's reset route (`apps/webhooks/src/coach.ts`), so none can be resumed (a send answers `session_not_active`). EVE still keeps a reset session's stream for its retention period, so the `coach_sessions` rows stay as tombstones: owned by the retired id, they keep the channel answering 403 to everyone. A session whose first recording failed has no row, so deletion can't find it; the first Clerk caller who addresses it claims it (nobody but its creator has the id). A failed cleanup answers 500 so Clerk retries (about a day) and is reported to Sentry.
- `data/` — exercise CSV + markdown descriptions/instructions used by the sync script
- `src/database.types.ts` — generated Supabase types; `src/index.ts` exports `Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`
- Run the Supabase CLI from this directory (or via `pnpm db <script>`).
- Auth: Supabase trusts Clerk session tokens through third-party auth (`[auth.third_party.clerk]` in `config.toml` points local stacks at the Clerk development instance; the E2E workflow adds it to its preview branch through the Management API; production trusts the production instance via the dashboard, and `config.toml` has no `[remotes]` block so it is never deployed there). `scripts/check-clerk-trust.ts` (`clerk:check`) verifies it; CI runs it against the local stack (integration-tests workflow) and the E2E preview branch (e2e workflow) when the `CLERK_DEV_SECRET_KEY` secret is set.
- Local signing keys: `config.toml` sets `[auth] signing_keys_path` to `supabase/local-only-signing-keys.json` (committed, development only), holding the local stack's own ES256 signer. Never trust it on a hosted project.
- Identity (ADR 0001): every `user_id` column is `text` with no foreign key to `auth.users`. RLS policies and RPCs read the caller through `public.current_user_id()` (the JWT `sub` claim, only when the token's `role` claim is `authenticated`; NULL for role-less tokens such as Clerk OAuth access tokens, `anon` and any other role, and for ids in `private.retired_user_ids`); never use `auth.uid()`. Nothing cascades from Supabase Auth, so account deletion runs `deleteUserData` (`packages/services`), which retires the id so a still-valid token can't write it back (`current_user_id()` is NULL for it, and `reject_retired_user_id` triggers stop writes that bypass RLS); `rekey_user(old_id, new_id)` retires `old_id` with a pointer to `new_id`, and `deleteUserData` then refuses `old_id` (`UserRekeyedError`, SQLSTATE 55000). `rekey_user` is executable by `service_role` only.
- Clerk User migration (FIT-73, one-shot, removed with the legacy auth rows): `scripts/clerk-migration.ts` reads `auth.users` over a direct Postgres connection, creates each Clerk User (verified email, name split on the first space, Supabase's bcrypt digest via `password_hasher: "bcrypt"`, legacy UUID as `external_id`; a rejected digest falls back to no password) and calls `rekey_user` with the service key. Reruns find Clerk Users by `external_id` and `private.retired_user_ids` marks Users already rekeyed. `scripts/migrate-users-to-clerk.ts` is the CLI; `scripts/check-clerk-migration.ts` is the CI check (integration-tests workflow, needs `CLERK_DEV_SECRET_KEY`).
- `supabase/tests/` — pgTAP suite (`pnpm db test:db`). `fitme_login.test.sql` checks the `fitme` login's attributes and memberships and fails when any `public` table has RLS disabled; every new table needs RLS. Table grants on `public` are explicit in the migrations (`20261016120000_explicit_table_grants.sql`, matching the hosted project), never left to Supabase's default privileges: `supabase/roles.sql` drops the default table grants on local stacks and CI, so a new table grants `anon` / `authenticated` / `service_role` what it needs in its own migration (or fails with "permission denied"), and `table_grants.test.sql`, which lists every `public` table, gets a line for it. Functions and sequences keep the defaults. Impersonate a User with `set local role authenticated` plus `request.jwt.claims` carrying a Clerk-style text `sub` and `"role": "authenticated"`; don't insert into `auth.users`.

## Key Patterns

**Data fetching (mobile)**: All queries/mutations use `react-query-kit` wrappers (`createQuery`, `createMutation`) around the Supabase JS client. Import from `~/hooks/queries/<entity>` or `~/hooks/mutations/<entity>`.

**Data fetching (web)**: Server Components query Supabase directly through `createClient()` from `~/lib/supabase/server`. Client components use `useSupabase()` from `~/lib/supabase/client` and TanStack Query (provider in `components/providers.tsx`).

**Shared types**: Import domain types from `@fitme/core`, never from an app's `lib/`. Import row types from `@fitme/supabase` (`Tables<"plans">`).

**Authentication (mobile)**: Clerk (`@clerk/expo`, hooks-based custom flows on the existing screens). Identity (id, email, name) comes from Clerk's `useUser`; the Profile from `useProfileQuery`. Never call Supabase Auth APIs. `@clerk/expo` is excluded from Expo autolinking in `package.json` (its native module needs iOS 17 and is only used by Clerk's prebuilt native views); the JS SDK treats it as optional. The `<Authenticated>` component wraps protected screens and redirects signed-out users. Registration and password reset both go through the shared code screen `app/auth/verify-code.tsx` (`?purpose=sign-up`, `?purpose=reset-password`, or `?purpose=sign-in` when Device Trust wants a code after a reset; each purpose maps to its Clerk flow in `components/views/verify-code-view.tsx`): forgot-password starts a sign-in and emails the reset code, the code screen moves on to reset-password, which submits the new password and signs the User in. There is no web reset page or universal link. The register and reset-password forms mirror Clerk's minimum password length (`PASSWORD_MIN_LENGTH` in `lib/constants.ts`, 15 on both instances). E2E flows register a fresh `+clerk_test` User per run on the Clerk development instance (test mode: no email sent, fixed code 424242) through `e2e/subflows/register.yaml`, and sign in through `e2e/subflows/sign-in.yaml` (`EMAIL`/`PASSWORD` runFlow env).

**Styling (mobile)**: uniwind (Tailwind CSS for React Native). CSS variables are defined in `apps/mobile/global.css` for theming. Custom spacing tokens: `xs`, `sm`, `md`, `lg`. Custom font families: `nunito-sans-regular/semibold/bold`, `ibm-plex-mono`.

**UI Components (mobile)**: Built on `@rn-primitives` (shadcn/ui-compatible for React Native). Use components from `apps/mobile/components/ui/`.

**UI quality**: read `docs/agents/ui.md` before building or changing any screen (mobile, web or site): the design rules (tokens, type scale, layout, Primitives, the four states every Screen has) and the screenshot-and-review loop every UI change goes through before it's done.

**Minimum version gate (mobile)**: `components/minimum-version-gate.tsx` wraps the root `Stack` in `app/_layout.tsx`. On launch and on every return to the foreground it fetches `GET /v1/client-config` from `EXPO_PUBLIC_API_URL` (`useClientConfigQuery`) and compares the build's version (`Constants.expoConfig.version`, stamped from the release tag) with the platform's minimum through `isBelowMinimumVersion` (`lib/app-version.ts`; numeric `x.y.z` comparison, the `0.0.0` dev placeholder and unreadable versions never block). Below the minimum the whole app is replaced by `UpdateRequiredView`, whose button opens the App Store (`ios.appStoreUrl` in `app.json`) or Play Store listing. A failed request, an error response or an unset `EXPO_PUBLIC_API_URL` never blocks (a failed foreground recheck keeps the last answer the app got). The app renders normally while the launch check is in flight. To cut off old builds, set `MIN_APP_VERSION_IOS` / `MIN_APP_VERSION_ANDROID` on the `fitme-api` Vercel project (production) and redeploy the API so it picks up the env; no app release is needed. Lowering or removing it unblocks Users the next time they foreground the app (after the 5-minute cache). Only raise it once most installs run a build that has the gate.

**Coach screen (mobile)**: `app/(tabs)/coach/index.tsx` talks to `apps/coach` through `useEveAgentRuntime` from `@assistant-ui/eve` (ADR 0005), pointed at `EXPO_PUBLIC_COACH_URL`, with the Clerk session token as the bearer, resolved per request (reconnects included). The global `fetch` is `expo/fetch`, installed by Expo's runtime (since SDK 57), so eve's NDJSON stream streams; don't set `EXPO_PUBLIC_USE_RN_FETCH`. The custom chat components (`components/chat/`) read the runtime's state (`useAuiState`) as assistant-ui `ThreadMessage`s; the plan card renders from a `display_workout_plan` tool call's result. `lib/coach-chat.ts` holds the pure parts (unit-tested): each send carries `runConfig: { custom: { model } }` (`coachRunConfig`), which eve sends as the turn's client context, with the model-picker's choice read at send time (no model → no client context, so the Coach uses its default); `coachErrorAction` maps the channel's `coach_pro_required` refusal to the paywall, an ended session (`session_not_active`, `session_expired`, `session_stranded`) to a new Conversation, and anything else to the existing error state; a refused or failed send's text goes back into the composer and its failed bubble is hidden (`isRefusedSend`); and the User's current Conversation (eve session cursor plus the event log from the last finished turn) is saved in MMKV per Clerk User id (`coach.conversation.<userId>.session`, rewritten on every streamed event, and `….events`, once per finished turn), so reopening the screen resumes it, an answer still streaming included. "+" in the header resets the eve session and forgets the saved one. The model picker (`app/(tabs)/coach/model-picker.tsx`) lists the models served by `apps/api`'s `GET /v1/coach/models` (`useCoachModelsQuery`, ADR 0006), never a bundled list: the last successful response is kept in the global MMKV key `coach.models` (not per User), read as the query's `initialData` (offline too) and rewritten on every successful fetch; an unreadable or malformed value counts as no list. `lib/coach-model.ts` resolves the saved pick (`coach.model`) against the list: kept while it's in it, otherwise (removed, or an old pre-Gateway id; never migrated) the list's `defaultId`. With no list at all (nothing cached and the fetch failed, or `EXPO_PUBLIC_API_URL` unset) the picker shows a loading or unavailable state and sends carry no `model`; chat never waits on the list.

**Subscriptions**: RevenueCat manages IAP. `useIsProQuery` (queryKey `["rc-is-pro"]`) checks the "Fitme Pro" entitlement. Customer info updates are listened to in `_layout.tsx`.

**Module aliases**: Inside each app, `~/` and `@/` resolve to that app's root. Cross-workspace imports always go through the package name (`@fitme/core`, `@fitme/supabase`).

**Workspace packages are source-only**: no build step. Metro resolves them through the hoisted `node_modules`; Next compiles them via `transpilePackages`. The tsdown apps (`apps/api`, `apps/mcp`, `apps/webhooks`) inline `@fitme/*` and no package from `node_modules` (`deps.onlyBundle: []`): a workspace package's runtime dependency (`pg`, `drizzle-orm`, `@vercel/functions` for `@fitme/db`) must also be in the app's `dependencies`, or its build fails; it stays external and Vercel traces it into the function. Their build emits the Vercel entry as `dist/app.js` and the standalone Node server (`pnpm start`) as `dist/node/index.js`, out of Vercel's entrypoint lookup. pnpm uses `nodeLinker: hoisted` (see `pnpm-workspace.yaml`) because React Native autolinking needs a flat `node_modules`. Its `overrides` pin `react` / `react-dom` to the version Expo's React Native expects, so the workspace has one copy (`expo-doctor` flags a second); move it with the Expo SDK, together with each app's own pin. Its `patchedDependencies` patch uniwind (`patches/`): uniwind's Metro resolver swaps `react-native` for its own export list, which lacks RN 0.88's `AssetRegistry`, so expo-asset can't load assets, `useFonts` fails without a LogBox error and the splash never hides. Drop the patch once a uniwind release exports it (FIT-170).

## Environment Variables

Env files live next to each app.

`apps/mobile/.env` (prefix `EXPO_PUBLIC_` for client exposure):

- `EXPO_PUBLIC_API_URL` — `apps/api` base URL (`http://localhost:3003` locally; production builds get `https://api.fitmeproject.com` from the EAS `production` environment, never from an `eas.json` build profile); unset skips the minimum version check
- `EXPO_PUBLIC_COACH_URL` — `apps/coach` base URL (`http://localhost:3005` locally, `pnpm dev:coach`); the coach screen talks to its eve routes
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`

`apps/web/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

`apps/api` (see `apps/api/.env.example`; read from the process environment):

- `PORT` (default 3003)
- `MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID` — minimum supported mobile app version (`x.y.z`) served by `GET /v1/client-config`; unset means no minimum. Set on the `fitme-api` Vercel project; a change takes effect on the API's next deployment.

`apps/webhooks` (see `apps/webhooks/.env.example`; read from the process environment, not auto-loaded from a file):

- `PORT` (default 3004)
- `CLERK_WEBHOOK_SIGNING_SECRET` — the Clerk webhook endpoint's signing secret (`whsec_…`); unset → `POST /clerk` answers 500 (reported)
- `FITME_DATABASE_URL` — see below, with `?application_name=webhooks`
- `SENTRY_DSN` — failed cleanups are reported here; unset disables Sentry
- `COACH_URL` — the Coach's base URL (`http://localhost:3005` locally), for resetting a deleted User's Coach sessions
- `COACH_RESET_SECRET` — the same value as the Coach's; unset (or no `COACH_URL`) → a deletion with recorded Coach sessions answers 500 (reported); one without needs neither

`apps/coach` (see `apps/coach/.env.example`; `eve dev` loads `apps/coach/.env.local`; deployed, the Vercel project's environment):

- `CLERK_JWT_KEY` — the Clerk instance's PEM public key (`pnpm --silent db clerk:jwt-key`); the channel verifies session tokens against it. Missing → requests with a token answer 500.
- `REVENUECAT_SECRET_KEY` — RevenueCat's secret API key (v1, `sk_…`), server-only; the channel checks the "Fitme Pro" entitlement with it. Missing → every request with a valid token answers 503 `coach_pro_check_unavailable`.
- `FITME_DATABASE_URL` — see below, with `?application_name=coach`
- `AI_GATEWAY_API_KEY` — local only (`pnpm dev:coach`, `pnpm coach eval`): a Vercel AI Gateway key (`provorovdev` team → AI Gateway → API Keys). Never set on Vercel: deployed, the Coach authenticates to the Gateway through OIDC. Without either, every Coach turn fails at the model call.
- `SENTRY_DSN` — failed steps, turns and sessions are reported here; unset disables Sentry
- `COACH_RESET_SECRET` — shared with `apps/webhooks` (`openssl rand -hex 32`); lets it reset sessions for account deletion and nothing else (a leak lets someone end any Conversation, never read one; rotate it on both apps). Unset → no reset over it, so account deletions with Coach sessions fail and Clerk retries.

`apps/site/.env.local` (see `apps/site/.env.example`): App Store id/url, support email, social links, GTM id, PostHog key.

Backend apps that use `@fitme/db`:

- `FITME_DATABASE_URL` — the `fitme` login's Supavisor transaction-pooler connection string with `?application_name=<app>` (locally `postgresql://fitme.pooler-dev:fitme-local-only@127.0.0.1:<pooler port>/postgres?application_name=<app>`; each stack's pooler port is in `supabase status --output-format json`). Service-role strength; server environments only.

`apps/mcp` (see `apps/mcp/.env.example`; read from the process environment, not auto-loaded from a file):

- `PORT` (default 3002)
- `FITME_DATABASE_URL` — required (500 without it); see above, with `?application_name=mcp`. Every user tool runs through it.
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` — the Clerk instance that issues the OAuth access tokens (production instance in production, the development instance everywhere else). Missing → the MCP endpoint answers 500.
- `MCP_PUBLIC_URL` (optional) — public URL advertised as the OAuth protected resource when it differs from the request URL.

## Git

The default branch is `main` (there is no `master`); branch from it and open pull requests against it. A clone whose `origin/HEAD` still points at `origin/master` is stale; repair it with `git remote set-head origin --auto && git remote prune origin`.

## Code Review Rules

Before reviewing a pull request's diff, gather its intent:

1. Read the PR description in full. It states what the change does, why, and what was deliberately left out.
2. Read the linked Linear issue. The issue key (`FIT-<n>`) is in the PR title, branch name or description. Read its description and comments, including acceptance criteria and blocking relations.
3. If the issue belongs to a Linear project, also read the project description. The project description is the spec, and it holds the decisions and constraints that apply across all of the project's issues.

Then review the diff against that intent: flag code that misses an acceptance criterion, goes beyond the issue's scope, or contradicts a decision in the spec, the ADRs (`docs/adr/`) or this file. Don't flag things the description or spec explicitly defers to a later issue. If a PR names no issue, or you can't read Linear, say so in the review and review against the PR description alone; never guess what an issue says.

## CI/CD

GitHub Actions use pnpm (`pnpm/action-setup`), `pnpm install --frozen-lockfile` and Node 24, the repo's minimum (root `engines`; EVE in `apps/coach` needs it). Linux jobs run on a pinned `ubuntu-24.04` (never `ubuntu-latest`), actions stay on majors that run on Node 24, and every workflow runs the lockfile's Supabase CLI (the `@fitme/supabase` devDependency) through `pnpm exec`, never `supabase/setup-cli`. Unit tests run through `pnpm turbo run test`; the pgTAP suite and the MCP, `packages/db` and `packages/services` integration tests run separately against a local Supabase stack (Supabase CLI, Supavisor in transaction mode) in `.github/workflows/integration-tests.yml`. The release workflow (`.github/workflows/release.yml`) never commits to `main` (it's protected): it derives the next version from the commits since the last `v*` tag following conventional commits (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` or `type!:` → major), creates the tag with the GitHub release and the Linear release, then calls `.github/workflows/build-mobile.yml`. That workflow (also runnable by hand with a tag, to rebuild) stamps the tag's version into `apps/mobile/app.json` (whose committed `version` is a `0.0.0` placeholder) and starts the iOS production EAS build with auto-submit (every EAS profile extends `base` in `eas.json`, which pins the build's Node 24 version) (both jobs run in the `production` GitHub environment, which holds the `EXPO_TOKEN` and `LINEAR_ACCESS_KEY` secrets). The tag is the source of truth for the app version. The exercise sync workflow runs `pnpm --filter @fitme/supabase exercises:sync` on pushes to `main` that touch the exercise data. The Database Types workflow (`.github/workflows/database-types.yml`) starts a local database, runs `pnpm db types:generate` (which also normalizes the output with Biome) and fails if `packages/supabase/src/database.types.ts` is stale; against the same database it then runs `pnpm --filter @fitme/db schema:generate` and fails if `packages/db/src/schema.ts` or `src/relations.ts` is stale. Every Vercel project (`apps/api`, `apps/coach`, `apps/mcp`, `apps/site`, `apps/web`, `apps/webhooks`) sets `ignoreCommand` to `npx turbo-ignore@<version> --fallback=HEAD^1` in its `vercel.json`. A deployment is then skipped ("Canceled by Ignored Build Step") unless, since the branch's last deployment (the parent commit, through `--fallback`, on a branch's first one, so a new branch whose last commit leaves an app alone gets no preview of it), the app's workspace, a workspace package it depends on, a `globalDependencies` file (`turbo.json`'s, root `package.json` and `pnpm-workspace.yaml` included) or the app's own resolved lockfile entries changed; a lockfile change that only touches another app skips it, and turbo-ignore builds when it can't compare. A new Vercel app gets the same `vercel.json` line; keep the pin in step with the root `turbo` version. The PR Risk workflow (`.github/workflows/pr-risk.yml`) labels pull requests that change a Protected Path (`.github/labeler.yml`) `risk:high`; see `docs/agents/pr-risk.md`.

## Agent skills

### Issue tracker

Issues live in Linear, team Fitme (`FIT-<n>`), via the Linear MCP tools. A spec is a Linear project (spec in the project description, its issues in the project), not an issue; projects never get labels. New issues always go to `Backlog`, never `Todo`, and carry an area label (`mobile`, `web`, `site`, `mcp`, `api`, `coach`, `webhooks`, `database`, `ci`, `docs`) for every area they're expected to change. A `ready-for-human` issue carries a step-by-step guide, the complete list of env vars to add or change, and a checklist of every required action. See `docs/agents/issue-tracker.md`.

### Triage labels

Linear's `Triage` status stands for `needs-triage`; `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` are workspace-level labels. See `docs/agents/triage-labels.md`.

### Grilling

During a grilling session (`/grill-me`, `/grilling`), never ask how to split the work into tickets or projects, or how to sequence or size them. That gets decided later (`/to-spec`, `/to-tickets`); keep the questions on the design itself.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

---

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `npm exec -- ultracite fix`
- **Check for issues**: `npm exec -- ultracite check`
- **Diagnose setup**: `npm exec -- ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `npm exec -- ultracite fix` before committing to ensure compliance.
