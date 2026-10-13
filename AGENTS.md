# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

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

### apps/mcp — MCP server

Stateless [Streamable HTTP](https://modelcontextprotocol.io) MCP server built on Hono + `@modelcontextprotocol/sdk`, served with `@hono/node-server`.

- `src/server.ts` — composition root: `createMcpServer({ accessToken, createSupabaseClient?, context? })` (`context` = a `ToolContext` the HTTP layer already authenticated) registers the tool groups from `src/tools/` (`registerTool` with zod input schemas, `title`, and read-only/destructive/idempotent `annotations`).
- `src/tools/` — `catalog.ts` (public tools from `@fitme/core`: ping, muscle groups, plan options), and user tools in `exercises.ts`, `plans.ts` (+ `plan-schemas.ts`), `sessions.ts`, `profile.ts`; shared bounds in `limits.ts`. `helpers.ts` holds `asJson`, `unwrap` (Supabase response → data or `ToolError`), `withUser` (resolves the caller and turns every failure into an `isError` tool result), `fetchPage` (offset past the end → empty page, not PGRST103) and `readBack` (a committed write whose read-back fails returns success + `warning`, never `isError`).
- `src/context.ts` — per-request `ToolContext`; lazily verifies the bearer token once (`auth.getClaims`, local JWKS check) and caches the `{ supabase, userId }` result. Missing/rejected tokens throw `AuthenticationError`.
- `src/auth.ts` — MCP authorization (OAuth 2.1): protected-resource metadata pointing at Supabase Auth's OAuth server (`$SUPABASE_URL/auth/v1`), detection of user-tool calls (`USER_TOOL_NAMES` in `server.ts`; public ones are `PUBLIC_TOOL_NAMES` in `tools/catalog.ts`) and the `401` + `WWW-Authenticate` challenge. Its consent UI was `apps/web`'s `/oauth/consent`, removed when the web app moved to Clerk (FIT-72); MCP OAuth sign-in is broken until MCP authorization moves to Clerk (FIT-79).
- `src/supabase.ts` — per-request `SupabaseClient<Database>` built from `SUPABASE_URL` + `SUPABASE_ANON_KEY` with the caller's token in `global.headers.Authorization`, so RLS and the RPCs (which read the caller's User id from the JWT `sub` claim) enforce ownership. Never use a service-role key, and never take a user id as tool input.
- `src/app.ts` — `createApp({ authorizationServer?, createSupabaseClient? })` builds the Hono app (default export = `createApp()` for Vercel): the MCP endpoint is the root `/` (all methods), extracting `Authorization: Bearer <Supabase access token>`, answering requests with a rejected token, and user-tool calls without one, with `401`, and creating a fresh server + `WebStandardStreamableHTTPServerTransport` per request; `/.well-known/oauth-protected-resource` for OAuth discovery; `/health` for liveness. Deployed at https://mcp.fitmeproject.com.
- `src/index.ts` — Node entrypoint, `PORT` env (default 3002).
- Tests (`src/__tests__/`, vitest) drive `createMcpServer` through the SDK's `InMemoryTransport` + `Client` (`harness.ts`), and the Hono app via `app.request`, injecting a fake Supabase client (`fake-supabase.ts`) whose routes match on table/RPC, operation, select text and required filters; an unmatched query fails the test in `afterEach`. `integration/` (separate vitest config, `test:integration`) runs the same tools against a real local stack with freshly signed-up users, including a cross-user isolation suite; CI runs it in `.github/workflows/integration-tests.yml`.
- Plan writes go through the `create_plan` / `update_plan` RPCs (never `store_plan`). `update_plan` with `workouts` recreates every workout (new ids), so metadata-only updates use a direct `plans` update instead. `start_workout_session` resumes an open session for the workout (the app assumes one per workout) and refuses workouts of soft-deleted plans; `finish_workout_session` falls back to a direct `finished_at` update when the session's workout is gone (`rotated: false`).

### packages/core — `@fitme/core`

Platform-agnostic code shared by both apps: `models.ts` (Profile, Plan, Workout, Exercise, etc. plus enum arrays like `goals`, `muscleGroups`), `labels.ts`, `formatters.ts`, `names.ts` (`splitName`), `types.ts` (pagination), `utils.ts` (`range`, `muscleGroupToName`, `handleSupabaseError`). Tests use vitest. Nothing in here may import React Native, Expo, or Next.

### packages/supabase — `@fitme/supabase`

- `supabase/` — Supabase CLI project: `config.toml`, `migrations/`, `functions/` (Edge Functions: `preview-plan`, `clerk-webhook`, `ai-agent`, `revenuecat-webhook`), `templates/`, `seed.ts`, `sync.ts`
- Edge-function auth: `ai-agent` and `preview-plan` take Clerk session tokens, so `verify_jwt` is off for them and they wrap their handler in `withClerkUser` from `functions/_shared/clerk-auth.ts`. It verifies the bearer token networkless against the `CLERK_JWT_KEY` function secret (the Clerk instance's PEM public key; `pnpm --silent db clerk:jwt-key` prints it, `clerk.fitmeproject.com` for production), answers 401 before any work, and hands the handler `{ userId, supabase, supabaseAdmin }` (`userId` = the `sub` claim; `supabase` is RLS-scoped with the Clerk token). Never reimplement token checks in a function, and never use `supabase.auth.getUser()` there. The E2E workflow sets `CLERK_JWT_KEY` on its preview branch; locally put it in `supabase/functions/.env`.
- Account deletion: the app deletes the User in Clerk (`user.delete()`, needs Clerk's "allow users to delete their accounts") and signs out; Clerk then sends `user.deleted` to `clerk-webhook` (registered on both Clerk instances), the only cleanup path. `verify_jwt` is off for it; `handler.ts` verifies the Svix signature against `CLERK_WEBHOOK_SIGNING_SECRET` (401 otherwise) and calls `delete_user_data` with the admin client. A failed cleanup answers 500 so Clerk retries (about a day) and is reported to Sentry (`SENTRY_DSN` function secret). Deno tests next to the function run with `pnpm db test:functions` (needs `deno`; CI runs them in the unit-tests workflow).
- `data/` — exercise CSV + markdown descriptions/instructions used by the sync script
- `src/database.types.ts` — generated Supabase types; `src/index.ts` exports `Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`
- Run the Supabase CLI from this directory (or via `pnpm db <script>`).
- Auth: Supabase trusts Clerk session tokens through third-party auth (`[auth.third_party.clerk]` in `config.toml` points local stacks at the Clerk development instance; the E2E workflow adds it to its preview branch through the Management API; production trusts the production instance via the dashboard, and `config.toml` has no `[remotes]` block so it is never deployed there). `scripts/check-clerk-trust.ts` (`clerk:check`) verifies it; CI runs it against the local stack (integration-tests workflow) and the E2E preview branch (e2e workflow) when the `CLERK_DEV_SECRET_KEY` secret is set.
- Identity (ADR 0001): every `user_id` column is `text` with no foreign key to `auth.users`. RLS policies and RPCs read the caller through `public.current_user_id()` (the JWT `sub` claim, only when the token's `role` claim is `authenticated`; NULL for role-less tokens such as Clerk OAuth access tokens, `anon` and any other role, and for ids in `private.retired_user_ids`); never use `auth.uid()`. Nothing cascades from Supabase Auth, so account deletion calls `delete_user_data(user_id)`, which retires the id so a still-valid token can't write it back (`current_user_id()` is NULL for it, and `reject_retired_user_id` triggers stop writes that bypass RLS); `rekey_user(old_id, new_id)` retires `old_id` with a pointer to `new_id`, and `delete_user_data` then refuses `old_id` (SQLSTATE 55000). Both are executable by `service_role` only.
- Clerk User migration (FIT-73, one-shot, removed with the legacy auth rows): `scripts/clerk-migration.ts` reads `auth.users` over a direct Postgres connection, creates each Clerk User (verified email, name split on the first space, Supabase's bcrypt digest via `password_hasher: "bcrypt"`, legacy UUID as `external_id`; a rejected digest falls back to no password) and calls `rekey_user` with the service key. Reruns find Clerk Users by `external_id` and `private.retired_user_ids` marks Users already rekeyed. `scripts/migrate-users-to-clerk.ts` is the CLI; `scripts/check-clerk-migration.ts` is the CI check (integration-tests workflow, needs `CLERK_DEV_SECRET_KEY`).
- `supabase/tests/` — pgTAP suite (`pnpm db test:db`). Impersonate a User with `set local role authenticated` plus `request.jwt.claims` carrying a Clerk-style text `sub` and `"role": "authenticated"`; don't insert into `auth.users`.

## Key Patterns

**Data fetching (mobile)**: All queries/mutations use `react-query-kit` wrappers (`createQuery`, `createMutation`) around the Supabase JS client. Import from `~/hooks/queries/<entity>` or `~/hooks/mutations/<entity>`.

**Data fetching (web)**: Server Components query Supabase directly through `createClient()` from `~/lib/supabase/server`. Client components use `useSupabase()` from `~/lib/supabase/client` and TanStack Query (provider in `components/providers.tsx`).

**Shared types**: Import domain types from `@fitme/core`, never from an app's `lib/`. Import row types from `@fitme/supabase` (`Tables<"plans">`).

**Authentication (mobile)**: Clerk (`@clerk/expo`, hooks-based custom flows on the existing screens). Identity (id, email, name) comes from Clerk's `useUser`; the Profile from `useProfileQuery`. Never call Supabase Auth APIs. `@clerk/expo` is excluded from Expo autolinking in `package.json` (its native module needs iOS 17 and is only used by Clerk's prebuilt native views); the JS SDK treats it as optional. The `<Authenticated>` component wraps protected screens and redirects signed-out users. Registration and password reset both go through the shared code screen `app/auth/verify-code.tsx` (`?purpose=sign-up`, `?purpose=reset-password`, or `?purpose=sign-in` when Device Trust wants a code after a reset; each purpose maps to its Clerk flow in `components/views/verify-code-view.tsx`): forgot-password starts a sign-in and emails the reset code, the code screen moves on to reset-password, which submits the new password and signs the User in. There is no web reset page or universal link. The register and reset-password forms mirror Clerk's minimum password length (`PASSWORD_MIN_LENGTH` in `lib/constants.ts`, 15 on both instances). E2E flows register a fresh `+clerk_test` User per run on the Clerk development instance (test mode: no email sent, fixed code 424242) through `e2e/subflows/register.yaml`, and sign in through `e2e/subflows/sign-in.yaml` (`EMAIL`/`PASSWORD` runFlow env).

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
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`

`apps/web/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

`apps/site/.env.local` (see `apps/site/.env.example`): App Store id/url, support email, social links, GTM id, PostHog key.

`apps/mcp` (see `apps/mcp/.env.example`; read from the process environment, not auto-loaded from a file):

- `PORT` (default 3002)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` — anon key only, never the service-role key. Without these the public tools still work and user tools return an error.
- `MCP_PUBLIC_URL` (optional) — public URL advertised as the OAuth protected resource when it differs from the request URL.

## Git

The default branch is `main` (there is no `master`); branch from it and open pull requests against it. A clone whose `origin/HEAD` still points at `origin/master` is stale; repair it with `git remote set-head origin --auto && git remote prune origin`.

## CI/CD

GitHub Actions use pnpm (`pnpm/action-setup`) and `pnpm install --frozen-lockfile`. Unit tests run through `pnpm turbo run test`; the pgTAP suite and the MCP integration tests run separately against a local Supabase stack (Supabase CLI) in `.github/workflows/integration-tests.yml`. The release workflow (`.github/workflows/release.yml`) never commits to `main` (it's protected): it derives the next version from the commits since the last `v*` tag following conventional commits (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` or `type!:` → major), creates the tag with the GitHub release and the Linear release, then calls `.github/workflows/build-mobile.yml`. That workflow (also runnable by hand with a tag, to rebuild) stamps the tag's version into `apps/mobile/app.json` (whose committed `version` is a `0.0.0` placeholder) and starts the iOS production EAS build with auto-submit (both jobs run in the `production` GitHub environment, which holds the `EXPO_TOKEN` and `LINEAR_ACCESS_KEY` secrets). The tag is the source of truth for the app version. The exercise sync workflow runs `pnpm --filter @fitme/supabase exercises:sync` on pushes to `main` that touch the exercise data. The Database Types workflow (`.github/workflows/database-types.yml`) starts a local database, runs `pnpm db types:generate` (which also normalizes the output with Biome) and fails if `packages/supabase/src/database.types.ts` is stale.

## Agent skills

### Issue tracker

Issues live in Linear, team Fitme (`FIT-<n>`), via the Linear MCP tools. See `docs/agents/issue-tracker.md`.

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
