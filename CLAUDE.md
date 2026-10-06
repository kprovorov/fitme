# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo

This is a **pnpm + Turborepo** monorepo. Run repo-wide tasks from the root; run app-specific commands through the workspace filters.

```
apps/api                @fitme/api     — Hono REST API (Node)
apps/mobile             @fitme/mobile  — Expo / React Native app
apps/web                @fitme/web     — Next.js (App Router) web app
apps/site               @fitme/site    — Next.js marketing site (fitmeproject.com)
packages/core           @fitme/core    — domain models, labels, formatters, pure helpers
packages/supabase       @fitme/supabase — Supabase project + generated DB types
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
pnpm build               # turbo run build
pnpm test                # turbo run test (jest in mobile, vitest in core and mcp)
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
pnpm mcp test:integration # vitest against the local Supabase stack (needs SUPABASE_URL / SUPABASE_ANON_KEY, seeded exercises)
pnpm api build           # tsdown bundle → apps/api/dist
pnpm db start            # supabase start     (alias for pnpm --filter @fitme/supabase start)
pnpm db seed             # seed local database
pnpm db types:generate   # regenerate packages/supabase/src/database.types.ts

# Single test file
pnpm --filter @fitme/core exec vitest run src/__tests__/formatters.test.ts
pnpm --filter @fitme/mobile exec jest --testPathPattern="<file>"
```

## Architecture

### apps/mobile — Expo app

React Native / Expo app using **file-based routing** via `expo-router`:

- `app/` — Expo Router routes (file-based navigation)
  - `_layout.tsx` — Root layout: initializes fonts, Sentry, RevenueCat, Supabase auth listener, and QueryClient
  - `(tabs)/` — Bottom tab navigator (Home, History, Library, Profile)
  - `auth/` — Login/Register screens (presented as fullscreen modal)
  - `onboarding/` — Post-registration onboarding flow (fullscreen modal)
  - `planner/` — AI plan generation flow (modal)
  - `plans/[planId]/` — Plan detail and workout views
  - `exercises/[exerciseId]/` — Exercise detail view
- `components/` — Reusable UI components
  - `ui/` — Primitive UI components (Button, Input, Dialog, etc.) built on `@rn-primitives`
  - `providers.tsx` — Wraps app with QueryClientProvider, ThemeProvider, KeyboardProvider
  - `authenticated.tsx` — Auth guard component: redirects to `/auth/register` if no user
- `hooks/` — Data layer
  - `queries/` — Read queries using `react-query-kit`'s `createQuery`
  - `mutations/` — Write mutations using `react-query-kit`'s `createMutation`
  - `revenueCat.ts` — RevenueCat subscription queries
- `lib/` — App-specific utilities
  - `supabase.ts` — Supabase client (uses AsyncStorage for session persistence)
  - `mmkv.ts` — MMKV storage instance
  - `utils.ts` — `cn()` class merger (tailwind-merge with the HIG font scale)
  - `constants.ts`, `segment.ts`, `useColorScheme.tsx`
- `plugins/` — local Expo config plugins for Xcode 27 compatibility: `with-ios-min-deployment-target.js` (raises pod targets below iOS 15.1, including resource bundles) and `with-revenuecat-xcode27-patch.js` (Swift 6.4 fix for `PaywallColor`; drop once `react-native-purchases` pins purchases-ios ≥ 5.78.0). UIScene adoption comes from `expo-build-properties` `ios.enableSceneSupport` (SDK 57); SDK 58 needs no flag.

### apps/web — Next.js app

- `app/` — App Router routes. `(app)/` is the authenticated area (server-side guard in its layout); `login/`, `auth/callback`, `auth/signout` handle Supabase auth; `oauth/consent` is the consent page of Supabase Auth's OAuth 2.1 server (used by MCP clients).
- `proxy.ts` — Next 16 request proxy (formerly middleware) that refreshes the Supabase session cookie and redirects unauthenticated users.
- `lib/supabase/{client,server,proxy}.ts` — `@supabase/ssr` clients typed with `Database` from `@fitme/supabase`.
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

### apps/mcp — MCP server

Stateless [Streamable HTTP](https://modelcontextprotocol.io) MCP server built on Hono + `@modelcontextprotocol/sdk`, served with `@hono/node-server`.

- `src/server.ts` — composition root: `createMcpServer({ accessToken, createSupabaseClient?, context? })` (`context` = a `ToolContext` the HTTP layer already authenticated) registers the tool groups from `src/tools/` (`registerTool` with zod input schemas, `title`, and read-only/destructive/idempotent `annotations`).
- `src/tools/` — `catalog.ts` (public tools from `@fitme/core`: ping, muscle groups, plan options), and user tools in `exercises.ts`, `plans.ts` (+ `plan-schemas.ts`), `sessions.ts`, `profile.ts`; shared bounds in `limits.ts`. `helpers.ts` holds `asJson`, `unwrap` (Supabase response → data or `ToolError`), `withUser` (resolves the caller and turns every failure into an `isError` tool result), `fetchPage` (offset past the end → empty page, not PGRST103) and `readBack` (a committed write whose read-back fails returns success + `warning`, never `isError`).
- `src/context.ts` — per-request `ToolContext`; lazily verifies the bearer token once (`auth.getClaims`, local JWKS check) and caches the `{ supabase, userId }` result. Missing/rejected tokens throw `AuthenticationError`.
- `src/auth.ts` — MCP authorization (OAuth 2.1): protected-resource metadata pointing at Supabase Auth's OAuth server (`$SUPABASE_URL/auth/v1`), detection of user-tool calls (`USER_TOOL_NAMES` in `server.ts`; public ones are `PUBLIC_TOOL_NAMES` in `tools/catalog.ts`) and the `401` + `WWW-Authenticate` challenge. The consent UI is `apps/web`'s `/oauth/consent`.
- `src/supabase.ts` — per-request `SupabaseClient<Database>` built from `SUPABASE_URL` + `SUPABASE_ANON_KEY` with the caller's token in `global.headers.Authorization`, so RLS and the `auth.uid()` RPCs enforce ownership. Never use a service-role key, and never take a user id as tool input.
- `src/app.ts` — `createApp({ authorizationServer?, createSupabaseClient? })` builds the Hono app (default export = `createApp()` for Vercel): the MCP endpoint is the root `/` (all methods), extracting `Authorization: Bearer <Supabase access token>`, answering requests with a rejected token, and user-tool calls without one, with `401`, and creating a fresh server + `WebStandardStreamableHTTPServerTransport` per request; `/.well-known/oauth-protected-resource` for OAuth discovery; `/health` for liveness. Deployed at https://mcp.fitmeproject.com.
- `src/index.ts` — Node entrypoint, `PORT` env (default 3002).
- Tests (`src/__tests__/`, vitest) drive `createMcpServer` through the SDK's `InMemoryTransport` + `Client` (`harness.ts`), and the Hono app via `app.request`, injecting a fake Supabase client (`fake-supabase.ts`) whose routes match on table/RPC, operation, select text and required filters; an unmatched query fails the test in `afterEach`. `integration/` (separate vitest config, `test:integration`) runs the same tools against a real local stack with freshly signed-up users, including a cross-user isolation suite; CI runs it in `.github/workflows/integration-tests.yml`.
- Plan writes go through the `create_plan` / `update_plan` RPCs (never `store_plan`). `update_plan` with `workouts` recreates every workout (new ids), so metadata-only updates use a direct `plans` update instead. `start_workout_session` resumes an open session for the workout (the app assumes one per workout) and refuses workouts of soft-deleted plans; `finish_workout_session` falls back to a direct `finished_at` update when the session's workout is gone (`rotated: false`).

### packages/core — `@fitme/core`

Platform-agnostic code shared by both apps: `models.ts` (User, Profile, Plan, Workout, Exercise, etc. plus enum arrays like `goals`, `muscleGroups`), `labels.ts`, `formatters.ts`, `types.ts` (pagination), `utils.ts` (`range`, `muscleGroupToName`, `handleSupabaseError`). Tests use vitest. Nothing in here may import React Native, Expo, or Next.

### packages/supabase — `@fitme/supabase`

- `supabase/` — Supabase CLI project: `config.toml`, `migrations/`, `functions/` (Edge Functions: `preview-plan`, `delete-user`, `ai-agent`, `revenuecat-webhook`), `templates/`, `seed.ts`, `sync.ts`
- `data/` — exercise CSV + markdown descriptions/instructions used by the sync script
- `src/database.types.ts` — generated Supabase types; `src/index.ts` exports `Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`
- Run the Supabase CLI from this directory (or via `pnpm db <script>`).

## Key Patterns

**Data fetching (mobile)**: All queries/mutations use `react-query-kit` wrappers (`createQuery`, `createMutation`) around the Supabase JS client. Import from `~/hooks/queries/<entity>` or `~/hooks/mutations/<entity>`.

**Data fetching (web)**: Server Components query Supabase directly through `createClient()` from `~/lib/supabase/server`. Client components use `~/lib/supabase/client` and TanStack Query (provider in `components/providers.tsx`).

**Shared types**: Import domain types from `@fitme/core`, never from an app's `lib/`. Import row types from `@fitme/supabase` (`Tables<"plans">`).

**Authentication (mobile)**: `useCurrentUserQuery` (queryKey `["user"]`) fetches the session from Supabase and the user's profile. Auth state changes in `_layout.tsx` invalidate `["user"]` or clear the QueryClient on sign-out. The `<Authenticated>` component wraps protected screens and redirects unauthenticated users.

**Styling (mobile)**: uniwind (Tailwind CSS for React Native). CSS variables are defined in `apps/mobile/global.css` for theming. Custom spacing tokens: `xs`, `sm`, `md`, `lg`. Custom font families: `nunito-sans-regular/semibold/bold`, `ibm-plex-mono`.

**UI Components (mobile)**: Built on `@rn-primitives` (shadcn/ui-compatible for React Native). Use components from `apps/mobile/components/ui/`.

**Subscriptions**: RevenueCat manages IAP. `useIsProQuery` (queryKey `["rc-is-pro"]`) checks the "Fitme Pro" entitlement. Customer info updates are listened to in `_layout.tsx`.

**Module aliases**: Inside each app, `~/` and `@/` resolve to that app's root. Cross-workspace imports always go through the package name (`@fitme/core`, `@fitme/supabase`).

**Workspace packages are source-only**: no build step. Metro resolves them through the hoisted `node_modules`; Next compiles them via `transpilePackages`. pnpm uses `nodeLinker: hoisted` (see `pnpm-workspace.yaml`) because React Native autolinking needs a flat `node_modules`.

## Environment Variables

Env files live next to each app.

`apps/mobile/.env` (prefix `EXPO_PUBLIC_` for client exposure):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`

`apps/web/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

`apps/site/.env.local` (see `apps/site/.env.example`): App Store id/url, support email, social links, GTM id, PostHog key.

`apps/mcp` (see `apps/mcp/.env.example`; read from the process environment, not auto-loaded from a file):

- `PORT` (default 3002)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` — anon key only, never the service-role key. Without these the public tools still work and user tools return an error.
- `MCP_PUBLIC_URL` (optional) — public URL advertised as the OAuth protected resource when it differs from the request URL.

## CI/CD

GitHub Actions use pnpm (`pnpm/action-setup`) and `pnpm install --frozen-lockfile`. Unit tests run through `pnpm turbo run test`; the MCP integration tests run separately against a local Supabase stack (Supabase CLI) in `.github/workflows/integration-tests.yml`. The release workflow (`.github/workflows/release.yml`) bumps the version in `apps/mobile/package.json` and `apps/mobile/app.json` following conventional commits: `feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major. The exercise sync workflow runs `pnpm --filter @fitme/supabase exercises:sync`.
