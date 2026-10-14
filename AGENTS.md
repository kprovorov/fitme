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
pnpm dev:coach           # eve dev (no TUI) on :3005 against the local stack (apps/coach/.env.local: CLERK_JWT_KEY, FITME_DATABASE_URL, model keys)
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
pnpm mcp test:integration # vitest against the local Supabase stack (needs SUPABASE_URL / SUPABASE_ANON_KEY, seeded exercises; CLERK_DEV_SECRET_KEY adds the Clerk OAuth suite)
pnpm api build           # tsdown bundle → apps/api/dist
pnpm api test            # vitest (Hono app via app.request)
pnpm webhooks build      # tsdown bundle → apps/webhooks/dist
pnpm webhooks test       # vitest (Hono app via app.request, signed payloads, fake services)
pnpm coach build         # eve build → apps/coach/.output
pnpm coach test          # vitest (channel auth, model selection, turn limits, tool wiring; no database or model)
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
pnpm --filter @fitme/mobile exec jest --testPathPattern="<file>"
```

## Architecture

### apps/mobile — Expo app

React Native / Expo app using **file-based routing** via `expo-router`:

- `app/` — Expo Router routes (file-based navigation)
  - `_layout.tsx` — Root layout: initializes fonts, Sentry and RevenueCat
  - `(tabs)/` — Bottom tab navigator (Home, History, Library, Profile)
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
- `lib/` — App-specific utilities
  - `supabase.ts` — Supabase client whose access token is the Clerk session token (no Supabase Auth session)
  - `clerk.ts` — Clerk publishable key, `getClerk()` for code outside React, `getCurrentUserId()`, `getClerkErrorMessage()`
  - `mmkv.ts` — MMKV storage instance
  - `utils.ts` — `cn()` class merger (tailwind-merge with the HIG font scale)
  - `constants.ts`, `segment.ts`, `useColorScheme.tsx`
- `plugins/` — local Expo config plugins for Xcode 27 compatibility: `with-ios-min-deployment-target.js` (raises pod targets below iOS 15.1, including resource bundles) and `with-revenuecat-xcode27-patch.js` (Swift 6.4 fix for `PaywallColor`; drop once `react-native-purchases` pins purchases-ios ≥ 5.78.0). UIScene adoption comes from `expo-build-properties` `ios.enableSceneSupport` (SDK 57); SDK 58 needs no flag.

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
- Tests (`src/__tests__/`, vitest) drive the app through `app.request`.
- Deployed to Vercel (project `fitme-api`, region `cle1` in `vercel.json`) at https://api.fitmeproject.com.

### apps/webhooks — webhooks app

Hono app served with `@hono/node-server`, bundled with tsdown (same setup as `apps/api`), that receives every third-party webhook. It reaches Postgres only through `withService` from `@fitme/db` and runs business logic from `@fitme/services`.

- `src/app.ts` — `createApp(deps)` (default export = `createApp()` with the real dependencies, for Vercel): logger, public `/health`, one route per sender, and the same JSON `notFound`/`onError` handlers as `apps/api` (`{ error: { code, message } }`).
- `src/routes/clerk.ts` — `POST /clerk`, `clerkRoutes({ deleteUserData, reportError, signingSecret })`: verifies the Svix signature with `verifyWebhook` from `@clerk/backend` on the raw request before anything reads the body (401 otherwise; an unset `CLERK_WEBHOOK_SIGNING_SECRET` answers a reported 500 so Clerk retries). `user.deleted` runs `deleteUserData` through `withService`; a failure is reported and answers 500 so Clerk retries. Other events answer 200. No `svix-id` dedupe: `deleteUserData` is idempotent; a webhook that isn't must dedupe on `svix-id`.
- `src/sentry.ts` — `reportError`: logs, captures with `@sentry/node` (initialized on first use from `SENTRY_DSN`; unset → disabled) and flushes before the response.
- `src/index.ts` — Node entrypoint, `PORT` env (default 3004).
- Tests (`src/__tests__/`, vitest) drive the app through `app.request` with payloads signed by a test secret (`standardwebhooks`) and fake dependencies, so they need no database.
- Deployed to Vercel as its own Pro project, region `cle1` (`vercel.json`). `FITME_DATABASE_URL` carries `application_name=webhooks`. Its `/clerk` endpoint is registered for `user.deleted` on both Clerk instances, each with its own signing secret in the matching Vercel environment.

### apps/coach — the Coach (EVE)

The Coach as an [EVE](https://www.npmjs.com/package/eve) agent (ADR 0005), replacing the `ai-agent` edge function. EVE is in preview: it is pinned to an exact version; read its changelog on every bump. Its docs ship in the package (`node_modules/eve/docs/`, start at `README.md`; the `eve` agent skill points there). EVE is filesystem-first: every file under `agent/` is discovered by its path, so put helpers in `agent/lib/` and tests in `test/`. Needs Node 24.

- `agent/agent.ts` — `defaultTools: false` (no shell, file or web tools; `eve info --json` lists what the model gets), Conversations end 30 days after they start (`limits.sessionTimeoutMs`), and the model is resolved on every `step.started` by `coachModelSelection` (`agent/lib/models.ts`): the client sends `clientContext: { model }` per turn, eve hands it to the resolver as a `context.instruction` user message (`Client context:` + JSON), and the id must be in `coachModels` from `@fitme/core`, the only list (none → `defaultCoachModelId`; anything else fails the turn). Ids map to the direct OpenAI / Anthropic providers through `eve/models/*` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; no AI Gateway).
- `agent/instructions.md` — the system prompt, carried over from `ai-agent`.
- `agent/channels/eve.ts` — the eve HTTP channel (`/eve/v1/session…`) behind `clerkSession()` (`agent/lib/clerk-auth.ts`) only: a Clerk session token verified networkless against `CLERK_JWT_KEY`; its `sub` becomes the session principal (`authenticator: "clerk"`). Missing or bad token → 401; missing key → 500. No `localDev()`, so local requests need a token too. Clerk tokens never go past the channel. `/eve/v1/health` is public.
- `agent/lib/owner.ts` — the Conversation owner is the session's `auth.initiator` (the verified caller who started it): the only User id tools act as. Route auth doesn't check session ownership, so `agent/hooks/conversation.ts` cancels a `turn.started` whose caller isn't the owner, and records the session id for the owner (`recordCoachSession` in `asUser`; idempotent, every turn) before the model runs; a failed recording is reported and cancels the turn (account deletion needs every session id, FIT-121).
- `agent/hooks/turn-limits.ts` — caps per turn (`agent/lib/turn-limits.ts`): 20 model calls and a token budget (input and output tokens summed from `step.completed`; the direct providers report no cost). The `step.started` that would go over cancels the turn. eve's own `limits.max*PerSession` are per session and prompt the user to continue, so they aren't used.
- `agent/hooks/sentry.ts` — `step.failed`, `turn.failed` and `session.failed` go to Sentry (`agent/lib/sentry.ts`, `SENTRY_DSN`; unset → logs only).
- `agent/tools/` — one file per tool, the filename is the tool name. Each is a thin wrapper: `asUser(owner, (tx) => service(tx, owner, …))` with `owner` from `requireConversationOwner(ctx.session.auth)`; tool inputs never carry a User id (their zod schemas strip unknown keys). So far: `get_user_profile` → `getProfile`.
- `agent/sandbox.ts` — just-bash (in-process, nothing to build or pay for): eve prepares a sandbox even though no tool uses one.
- `eve build` bundles the source-only `@fitme/*` packages into `.output/` itself. `FITME_DATABASE_URL` carries `application_name=coach`.
- Tests (`test/`, vitest) call the pure functions and the tools' `execute` directly: channel auth through `routeAuth` with tokens signed by a test RSA key, model selection, turn limits, the owner/turn guard, and `get_user_profile` with `@fitme/db` and the service mocked.

### apps/mcp — MCP server

Stateless [Streamable HTTP](https://modelcontextprotocol.io) MCP server built on Hono + `@modelcontextprotocol/sdk`, served with `@hono/node-server`.

- `src/server.ts` — composition root: `createMcpServer({ context })` (`context` = the request's `ToolContext`, built by the HTTP layer from a verified Clerk User) registers the tool groups from `src/tools/` (`registerTool` with zod input schemas, `title`, and read-only/destructive/idempotent `annotations`).
- `src/tools/` — `catalog.ts` (catalog tools from `@fitme/core`: ping, muscle groups, plan options; they still need a token like every other tool), and user tools in `exercises.ts`, `plans.ts` (+ `plan-schemas.ts`), `sessions.ts`, `profile.ts`; shared bounds in `limits.ts`. `helpers.ts` holds `asJson`, `unwrap` (Supabase response → data or `ToolError`), `withUser` (resolves the caller and turns every failure into an `isError` tool result), `fetchPage` (offset past the end → empty page, not PGRST103) and `readBack` (a committed write whose read-back fails returns success + `warning`, never `isError`).
- `src/context.ts` — `createToolContext({ user, signToken, createServices?, createSupabaseClient? })`: per-request `ToolContext` for a verified Clerk User. `getServices()` returns the `UserServices` (`src/services.ts`) built for `user.userId`, each method running one `@fitme/services` function inside `asUser(user.userId, …)`; tools on services (so far `get_profile`, via `withServices` in `helpers.ts`) never pass a User id, and a missing `FITME_DATABASE_URL` is the "not configured" tool error. Tools not moved yet call `getUserContext()`: on the first call it signs a Supabase token for `user.userId` (capped at the Clerk token's `exp`), builds the Supabase client and caches `{ supabase, userId }`.
- `src/auth.ts` — MCP authorization (OAuth 2.1) with Clerk as the authorization server: protected-resource metadata naming the Clerk instance (`protectedResourceHandlerClerk` from `@clerk/mcp-tools/hono`) and the middleware chain for `/`: `requireConfig` (500 when `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `SUPABASE_JWT_SIGNING_KEY` or `FITME_DATABASE_URL` is missing; never serve without auth), `requireBearerToken` (`401` + `WWW-Authenticate: Bearer resource_metadata=…`), `@clerk/hono`'s `clerkMiddleware`, then `requireClerkUser` (`getAuth(c, { acceptsToken: "oauth_token" })`; a rejected token gets `401` `error="invalid_token"`). No audience check (Clerk OAuth tokens have no `aud`), no custom scopes, no dynamic client registration.
- `src/supabase-token.ts` — `createSupabaseTokenSigner(jwk)` / `supabaseTokenSignerFromEnv()` / `cachedSupabaseTokenSigner(jwk)` (one import per process, used by `auth.ts`): signs a short-lived ES256 Supabase token for a verified User id (hard-coded `role`/`aud` `authenticated`, `iss` `fitme-mcp`, `kid` from the JWK, `exp` = now + 5 min capped at an optional `expiresAtMost`) with the private JWK in `SUPABASE_JWT_SIGNING_KEY` (ADR 0002). The key is as powerful as the service-role key; `sub` must only ever come from a verified Clerk token.
- `src/supabase.ts` — per-request `SupabaseClient<Database>` built from `SUPABASE_URL` + `SUPABASE_ANON_KEY` with the token signed for the caller in `global.headers.Authorization`, so RLS and the RPCs (which read the caller's User id from the JWT `sub` claim) enforce ownership. Never use a service-role key, and never take a user id as tool input.
- `src/app.ts` — `createApp({ createSupabaseClient? })` builds the Hono app (default export = `createApp()` for Vercel): the MCP endpoint is the root `/` (all methods, initialize and `tools/list` included), behind the `auth.ts` chain, creating a fresh server per request through `streamableHttpHandler` (`@clerk/mcp-tools/hono`); only `/.well-known/oauth-protected-resource` (OAuth discovery) and `/health` (liveness) are public. Deployed at https://mcp.fitmeproject.com.
- `src/index.ts` — Node entrypoint, `PORT` env (default 3002).
- Tests (`src/__tests__/`, vitest) drive `createMcpServer` through the SDK's `InMemoryTransport` + `Client` (`harness.ts`, `contextFor(user, services?)` builds the `ToolContext`), and the Hono app via `app.request` (`app.test.ts`, with `@clerk/hono` mocked so `getAuth` answers per test). Tools on services run on fake services (`connectWithServices` / `fakeServices`: an unfaked method fails the call); the others on a fake Supabase client (`fake-supabase.ts`) whose routes match on table/RPC, operation, select text and required filters; an unmatched query fails the test in `afterEach`. `integration/` (separate vitest config, `test:integration`) runs the same tools against a real local stack as made-up Clerk-style `user_…` ids, the tools on services through `asUser` on the stack's pooler (the config reads its URL from `supabase status`, like `packages/services`; `FITME_DATABASE_URL` overrides), the others with tokens from the signer (the committed development key `integration/local-only-signing-key.json`, unless `SUPABASE_JWT_SIGNING_KEY` is set; no Supabase Auth sign-up), including a cross-user isolation suite. `integration/clerk-oauth.test.ts` (helpers in `integration/clerk.ts`) runs the real OAuth flow headlessly against the Clerk development instance (Backend API test Users and a public OAuth application, sign-in token on a dev browser, consent POSTed to the Frontend API, PKCE through the MCP SDK's OAuth client, then user tools over HTTP) and is skipped without `CLERK_DEV_SECRET_KEY`. CI runs both in `.github/workflows/integration-tests.yml`.
- Plan writes go through the `create_plan` / `update_plan` RPCs. `update_plan` with `workouts` recreates every workout (new ids), so metadata-only updates use a direct `plans` update instead. `start_workout_session` resumes an open session for the workout (the app assumes one per workout) and refuses workouts of soft-deleted plans; `finish_workout_session` falls back to a direct `finished_at` update when the session's workout is gone (`rotated: false`).

### packages/core — `@fitme/core`

Platform-agnostic code shared by both apps: `models.ts` (Profile, Plan, Workout, Exercise, etc. plus enum arrays like `goals`, `muscleGroups`), `labels.ts`, `formatters.ts`, `names.ts` (`splitName`), `types.ts` (pagination), `utils.ts` (`range`, `muscleGroupToName`, `handleSupabaseError`). Tests use vitest. Nothing in here may import React Native, Expo, or Next.

### packages/db — `@fitme/db`

The only way backend apps reach Postgres (ADR 0003): Drizzle on node-postgres (`pg`, not postgres.js) through the Supavisor transaction pooler, as the shared `fitme` login. Source-only, like the other workspace packages.

- `src/schema.ts` + `src/relations.ts` — generated Drizzle schema (the `public` tables plus `private.retired_user_ids` as `retiredUserIdsInPrivate`); `src/index.ts` re-exports the tables, and the relations only feed the client so `tx.query` works. `schema:generate` runs `drizzle-kit pull` (`drizzle.config.ts`, direct superuser URL from `supabase status`) against the running local stack, renames the `private` schema object to `privateSchema`, sorts declarations by name and formats with Biome, so reruns against the same migrations are byte-identical. Never edit them by hand, and never run `drizzle-kit generate`/`migrate`/`push`: the Supabase SQL migrations own the schema (ADR 0004). After a migration, regenerate and commit both files with `database.types.ts`.
- `src/index.ts` — the two doors and the `Transaction` type (typed with the generated schema, so `tx.select().from(plans)` and `tx.query.plans.findMany(…)` are checked). `asUser(userId, fn)` opens a transaction, runs `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', {sub, role: authenticated}, true)`, then `fn(tx)`, so RLS and `current_user_id()` apply; `userId` only ever comes from a verified token. `withService(fn)` does the same as `service_role` (bypasses RLS; only where that is the point, such as webhooks). Both also set `application_name` locally.
- `src/client.ts` — internal: the lazily created `pg.Pool` (small `max`, registered with `@vercel/functions`' `attachDatabasePool`) and Drizzle client, from `FITME_DATABASE_URL`, which must carry `?application_name=<app>`. Never export the raw client or pool, and never import this module from outside the package.
- Never use a session-level `SET ROLE` or `set_config(…, false)` anywhere: the transaction pooler doesn't reset connections, so session state leaks to other requests.
- `fitme` (migration `20261014130000_fitme_login.sql`) is `LOGIN NOINHERIT` with no grants of its own, a member of `authenticated` and `service_role` only, so a query outside both doors fails with "permission denied". Its credential is service-role strength: server environments only. Local stacks set its development password in `supabase/roles.sql` (run by the CLI before the migrations, never pushed); hosted projects set theirs by hand. The pooler user is `fitme.pooler-dev` locally and `fitme.<project-ref>` on hosted projects.
- `integration/` (`test:integration`) runs the doors against the local stack's pooler (its port comes from `supabase status --output-format json`; `FITME_DATABASE_URL` overrides): identity and RLS, concurrent transactions with rollbacks never seeing another User's id, clean reused connections, and the login denied outside the doors. CI runs it in the integration-tests workflow.

### packages/services — `@fitme/services`

Business logic shared by the backend apps (ADR 0004), replacing the Postgres RPCs one by one. Source-only; each service is its own export (`@fitme/services/<name>`), no barrel.

- The rule: a service takes the `Transaction` from `asUser` or `withService` as its first argument and never opens its own connection. Any User id it acts on comes from a verified source (a verified token, or a signed webhook), never from request or tool input.
- `profile.ts` — `getProfile(tx, userId)`, run inside `asUser`: the User's Profile (gender, age, height, weight as numbers, `measurement_system`) plus its `units` (metric = cm/kg, us/uk = in/lbs; an unknown system counts as metric), or `null` without a Profile. Used by MCP's `get_profile` and the Coach's `get_user_profile`.
- `coach-sessions.ts` — `recordCoachSession(tx, userId, sessionId)` / `listCoachSessionIds(tx, userId)`, run inside `asUser`: the Coach's EVE session ids per User in `coach_sessions` (migration `20261014160000_coach_sessions.sql`; RLS: a User reads and inserts only their own rows, `service_role` may delete). Recording is idempotent (`on conflict do nothing`), and an id already recorded for another User stays theirs. `deleteUserData` doesn't touch this table yet: account deletion resets the recorded sessions in FIT-121.
- `delete-user-data.ts` — `deleteUserData(tx, userId)`, run inside `withService` (it replaced the dropped `delete_user_data` SQL function): rejects an empty id, locks the User-owned tables and their children `IN SHARE ROW EXCLUSIVE MODE` in `rekey_user`'s order, throws `UserRekeyedError` (`code` `55000`) for an id that was rekeyed away, retires the id in `private.retired_user_ids` (on conflict do nothing) and deletes the root rows (Workout Sessions, Plans, conversations, Profile), whose children cascade. A second run is a no-op. Its table list must track the schema. `service_role`'s grants for it come from migration `20261014140000_service_role_deletes_user_data.sql`.
- `integration/` (`test:integration`) runs the services against the local stack's pooler like `packages/db` (the URL helper is `@fitme/db/local-database-url`), as made-up Clerk-style `user_…` ids; CI runs it in the integration-tests workflow.

### packages/supabase — `@fitme/supabase`

- `supabase/` — Supabase CLI project: `config.toml`, `migrations/`, `functions/` (Edge Functions: `ai-agent`), `templates/`, `seed.ts`, `sync.ts`
- Edge-function auth: `ai-agent` takes Clerk session tokens, so `verify_jwt` is off for it and it wraps its handler in `withClerkUser` from `functions/_shared/clerk-auth.ts`. It verifies the bearer token networkless against the `CLERK_JWT_KEY` function secret (the Clerk instance's PEM public key; `pnpm --silent db clerk:jwt-key` prints it, `clerk.fitmeproject.com` for production), answers 401 before any work, and hands the handler `{ userId, supabase, supabaseAdmin }` (`userId` = the `sub` claim; `supabase` is RLS-scoped with the Clerk token). Never reimplement token checks in a function, and never use `supabase.auth.getUser()` there. Locally put `CLERK_JWT_KEY` in `supabase/functions/.env`.
- Account deletion: the app deletes the User in Clerk (`user.delete()`, needs Clerk's "allow users to delete their accounts") and signs out; Clerk then sends `user.deleted` to `apps/webhooks`' `POST /clerk` (registered on both Clerk instances), the only cleanup path, which runs `deleteUserData` from `@fitme/services` inside `withService`. A failed cleanup answers 500 so Clerk retries (about a day) and is reported to Sentry. Deno tests next to the edge functions run with `pnpm db test:functions` (needs `deno`; CI runs them in the unit-tests workflow; there are none right now, so it passes with no test files).
- `data/` — exercise CSV + markdown descriptions/instructions used by the sync script
- `src/database.types.ts` — generated Supabase types; `src/index.ts` exports `Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`
- Run the Supabase CLI from this directory (or via `pnpm db <script>`).
- Auth: Supabase trusts Clerk session tokens through third-party auth (`[auth.third_party.clerk]` in `config.toml` points local stacks at the Clerk development instance; the E2E workflow adds it to its preview branch through the Management API; production trusts the production instance via the dashboard, and `config.toml` has no `[remotes]` block so it is never deployed there). `scripts/check-clerk-trust.ts` (`clerk:check`) verifies it; CI runs it against the local stack (integration-tests workflow) and the E2E preview branch (e2e workflow) when the `CLERK_DEV_SECRET_KEY` secret is set.
- Local signing keys: `config.toml` sets `[auth] signing_keys_path` to `supabase/local-only-signing-keys.json` (committed, development only): the local stack's own ES256 signer first, then the public half of the MCP server's development key, so local stacks accept tokens the MCP server signs (ADR 0002). Hosted projects trust their own MCP key as a standby key instead.
- Identity (ADR 0001): every `user_id` column is `text` with no foreign key to `auth.users`. RLS policies and RPCs read the caller through `public.current_user_id()` (the JWT `sub` claim, only when the token's `role` claim is `authenticated`; NULL for role-less tokens such as Clerk OAuth access tokens, `anon` and any other role, and for ids in `private.retired_user_ids`); never use `auth.uid()`. Nothing cascades from Supabase Auth, so account deletion runs `deleteUserData` (`packages/services`), which retires the id so a still-valid token can't write it back (`current_user_id()` is NULL for it, and `reject_retired_user_id` triggers stop writes that bypass RLS); `rekey_user(old_id, new_id)` retires `old_id` with a pointer to `new_id`, and `deleteUserData` then refuses `old_id` (`UserRekeyedError`, SQLSTATE 55000). `rekey_user` is executable by `service_role` only.
- Clerk User migration (FIT-73, one-shot, removed with the legacy auth rows): `scripts/clerk-migration.ts` reads `auth.users` over a direct Postgres connection, creates each Clerk User (verified email, name split on the first space, Supabase's bcrypt digest via `password_hasher: "bcrypt"`, legacy UUID as `external_id`; a rejected digest falls back to no password) and calls `rekey_user` with the service key. Reruns find Clerk Users by `external_id` and `private.retired_user_ids` marks Users already rekeyed. `scripts/migrate-users-to-clerk.ts` is the CLI; `scripts/check-clerk-migration.ts` is the CI check (integration-tests workflow, needs `CLERK_DEV_SECRET_KEY`).
- `supabase/tests/` — pgTAP suite (`pnpm db test:db`). `fitme_login.test.sql` checks the `fitme` login's attributes and memberships and fails when any `public` table has RLS disabled; every new table needs RLS. Impersonate a User with `set local role authenticated` plus `request.jwt.claims` carrying a Clerk-style text `sub` and `"role": "authenticated"`; don't insert into `auth.users`.

## Key Patterns

**Data fetching (mobile)**: All queries/mutations use `react-query-kit` wrappers (`createQuery`, `createMutation`) around the Supabase JS client. Import from `~/hooks/queries/<entity>` or `~/hooks/mutations/<entity>`.

**Data fetching (web)**: Server Components query Supabase directly through `createClient()` from `~/lib/supabase/server`. Client components use `useSupabase()` from `~/lib/supabase/client` and TanStack Query (provider in `components/providers.tsx`).

**Shared types**: Import domain types from `@fitme/core`, never from an app's `lib/`. Import row types from `@fitme/supabase` (`Tables<"plans">`).

**Authentication (mobile)**: Clerk (`@clerk/expo`, hooks-based custom flows on the existing screens). Identity (id, email, name) comes from Clerk's `useUser`; the Profile from `useProfileQuery`. Never call Supabase Auth APIs. `@clerk/expo` is excluded from Expo autolinking in `package.json` (its native module needs iOS 17 and is only used by Clerk's prebuilt native views); the JS SDK treats it as optional. The `<Authenticated>` component wraps protected screens and redirects signed-out users. Registration and password reset both go through the shared code screen `app/auth/verify-code.tsx` (`?purpose=sign-up`, `?purpose=reset-password`, or `?purpose=sign-in` when Device Trust wants a code after a reset; each purpose maps to its Clerk flow in `components/views/verify-code-view.tsx`): forgot-password starts a sign-in and emails the reset code, the code screen moves on to reset-password, which submits the new password and signs the User in. There is no web reset page or universal link. The register and reset-password forms mirror Clerk's minimum password length (`PASSWORD_MIN_LENGTH` in `lib/constants.ts`, 15 on both instances). E2E flows register a fresh `+clerk_test` User per run on the Clerk development instance (test mode: no email sent, fixed code 424242) through `e2e/subflows/register.yaml`, and sign in through `e2e/subflows/sign-in.yaml` (`EMAIL`/`PASSWORD` runFlow env).

**Styling (mobile)**: uniwind (Tailwind CSS for React Native). CSS variables are defined in `apps/mobile/global.css` for theming. Custom spacing tokens: `xs`, `sm`, `md`, `lg`. Custom font families: `nunito-sans-regular/semibold/bold`, `ibm-plex-mono`.

**UI Components (mobile)**: Built on `@rn-primitives` (shadcn/ui-compatible for React Native). Use components from `apps/mobile/components/ui/`.

**Minimum version gate (mobile)**: `components/minimum-version-gate.tsx` wraps the root `Stack` in `app/_layout.tsx`. On launch and on every return to the foreground it fetches `GET /v1/client-config` from `EXPO_PUBLIC_API_URL` (`useClientConfigQuery`) and compares the build's version (`Constants.expoConfig.version`, stamped from the release tag) with the platform's minimum through `isBelowMinimumVersion` (`lib/app-version.ts`; numeric `x.y.z` comparison, the `0.0.0` dev placeholder and unreadable versions never block). Below the minimum the whole app is replaced by `UpdateRequiredView`, whose button opens the App Store (`ios.appStoreUrl` in `app.json`) or Play Store listing. A failed request, an error response or an unset `EXPO_PUBLIC_API_URL` never blocks (a failed foreground recheck keeps the last answer the app got). The app renders normally while the launch check is in flight. To cut off old builds, set `MIN_APP_VERSION_IOS` / `MIN_APP_VERSION_ANDROID` on the `fitme-api` Vercel project (production) and redeploy the API so it picks up the env; no app release is needed. Lowering or removing it unblocks Users the next time they foreground the app (after the 5-minute cache). Only raise it once most installs run a build that has the gate.

**Subscriptions**: RevenueCat manages IAP. `useIsProQuery` (queryKey `["rc-is-pro"]`) checks the "Fitme Pro" entitlement. Customer info updates are listened to in `_layout.tsx`.

**Module aliases**: Inside each app, `~/` and `@/` resolve to that app's root. Cross-workspace imports always go through the package name (`@fitme/core`, `@fitme/supabase`).

**Workspace packages are source-only**: no build step. Metro resolves them through the hoisted `node_modules`; Next compiles them via `transpilePackages`. pnpm uses `nodeLinker: hoisted` (see `pnpm-workspace.yaml`) because React Native autolinking needs a flat `node_modules`.

## Environment Variables

Env files live next to each app.

`apps/mobile/.env` (prefix `EXPO_PUBLIC_` for client exposure):

- `EXPO_PUBLIC_API_URL` — `apps/api` base URL (`http://localhost:3003` locally; the EAS `production` profile in `eas.json` sets `https://api.fitmeproject.com`); unset skips the minimum version check
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

`apps/coach` (see `apps/coach/.env.example`; `eve dev` loads `apps/coach/.env.local`; deployed, the Vercel project's environment):

- `CLERK_JWT_KEY` — the Clerk instance's PEM public key (`pnpm --silent db clerk:jwt-key`); the channel verifies session tokens against it. Missing → requests with a token answer 500.
- `FITME_DATABASE_URL` — see below, with `?application_name=coach`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` — direct providers for `coachModels`
- `SENTRY_DSN` — failed steps, turns and sessions are reported here; unset disables Sentry

`apps/site/.env.local` (see `apps/site/.env.example`): App Store id/url, support email, social links, GTM id, PostHog key.

Backend apps that use `@fitme/db`:

- `FITME_DATABASE_URL` — the `fitme` login's Supavisor transaction-pooler connection string with `?application_name=<app>` (locally `postgresql://fitme.pooler-dev:fitme-local-only@127.0.0.1:<pooler port>/postgres?application_name=<app>`; each stack's pooler port is in `supabase status --output-format json`). Service-role strength; server environments only.

`apps/mcp` (see `apps/mcp/.env.example`; read from the process environment, not auto-loaded from a file):

- `PORT` (default 3002)
- `FITME_DATABASE_URL` — required (500 without it); see above, with `?application_name=mcp`. The tools on services run through it.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` — anon key only, never the service-role key. Without these, the tools not yet on services return a "not configured" tool error.
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` — the Clerk instance that issues the OAuth access tokens (production instance in production, the development instance everywhere else). Missing → the MCP endpoint answers 500.
- `MCP_PUBLIC_URL` (optional) — public URL advertised as the OAuth protected resource when it differs from the request URL.
- `SUPABASE_JWT_SIGNING_KEY` — required (500 without it); private ES256 JWK (`supabase gen signing-key --algorithm ES256`) the server signs Supabase tokens with; Supabase trusts its public half as a standby key (ADR 0002). Only in the MCP server's env. Locally, use the development key from `.env.example`: local stacks trust it through `packages/supabase/supabase/local-only-signing-keys.json` (`[auth] signing_keys_path`), the stack's own signer first, then the dev key's public half. Never trust that file's keys on a hosted project.

## Git

The default branch is `main` (there is no `master`); branch from it and open pull requests against it. A clone whose `origin/HEAD` still points at `origin/master` is stale; repair it with `git remote set-head origin --auto && git remote prune origin`.

## Code Review Rules

Before reviewing a pull request's diff, gather its intent:

1. Read the PR description in full. It states what the change does, why, and what was deliberately left out.
2. Read the linked Linear issue. The issue key (`FIT-<n>`) is in the PR title, branch name or description. Read its description and comments, including acceptance criteria and blocking relations.
3. If the issue belongs to a Linear project, also read the project description. The project description is the spec, and it holds the decisions and constraints that apply across all of the project's issues.

Then review the diff against that intent: flag code that misses an acceptance criterion, goes beyond the issue's scope, or contradicts a decision in the spec, the ADRs (`docs/adr/`) or this file. Don't flag things the description or spec explicitly defers to a later issue. If a PR names no issue, or you can't read Linear, say so in the review and review against the PR description alone; never guess what an issue says.

## CI/CD

GitHub Actions use pnpm (`pnpm/action-setup`) and `pnpm install --frozen-lockfile`. Unit tests run through `pnpm turbo run test`; the pgTAP suite and the MCP, `packages/db` and `packages/services` integration tests run separately against a local Supabase stack (Supabase CLI, Supavisor in transaction mode) in `.github/workflows/integration-tests.yml`. The release workflow (`.github/workflows/release.yml`) never commits to `main` (it's protected): it derives the next version from the commits since the last `v*` tag following conventional commits (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` or `type!:` → major), creates the tag with the GitHub release and the Linear release, then calls `.github/workflows/build-mobile.yml`. That workflow (also runnable by hand with a tag, to rebuild) stamps the tag's version into `apps/mobile/app.json` (whose committed `version` is a `0.0.0` placeholder) and starts the iOS production EAS build with auto-submit (both jobs run in the `production` GitHub environment, which holds the `EXPO_TOKEN` and `LINEAR_ACCESS_KEY` secrets). The tag is the source of truth for the app version. The exercise sync workflow runs `pnpm --filter @fitme/supabase exercises:sync` on pushes to `main` that touch the exercise data. The Database Types workflow (`.github/workflows/database-types.yml`) starts a local database, runs `pnpm db types:generate` (which also normalizes the output with Biome) and fails if `packages/supabase/src/database.types.ts` is stale; against the same database it then runs `pnpm --filter @fitme/db schema:generate` and fails if `packages/db/src/schema.ts` or `src/relations.ts` is stale.

## Agent skills

### Issue tracker

Issues live in Linear, team Fitme (`FIT-<n>`), via the Linear MCP tools. A spec is a Linear project (spec in the project description, its issues in the project), not an issue. See `docs/agents/issue-tracker.md`.

### Triage labels

Linear's `Triage` status stands for `needs-triage`; `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` are workspace-level labels. See `docs/agents/triage-labels.md`.

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
