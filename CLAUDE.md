# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo

This is a **pnpm + Turborepo** monorepo. Run repo-wide tasks from the root; run app-specific commands through the workspace filters.

```
apps/mobile             @fitme/mobile  — Expo / React Native app
apps/web                @fitme/web     — Next.js (App Router) web app
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
pnpm build               # turbo run build
pnpm test                # turbo run test (jest in mobile, vitest in core)
pnpm typecheck           # turbo run typecheck
pnpm check / pnpm fix    # ultracite (Biome) over the whole repo

# Per workspace
pnpm ios                 # expo run:ios       (alias for pnpm --filter @fitme/mobile ios)
pnpm mobile android      # expo run:android
pnpm mobile lint         # expo lint
pnpm web build           # next build
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
- `plugins/` — local Expo config plugins for Xcode 27 / iOS 27 compatibility on SDK 55: `with-ios-scene-lifecycle.js` (UIScene adoption, required by the iOS 27 SDK), `with-ios-min-deployment-target.js`, `with-revenuecat-xcode27-patch.js`. Drop them when upgrading to Expo SDK 57+ (`expo-build-properties` `ios.enableSceneSupport`) / SDK 58.

### apps/web — Next.js app

- `app/` — App Router routes. `(app)/` is the authenticated area (server-side guard in its layout); `login/`, `auth/callback`, `auth/signout` handle Supabase auth.
- `proxy.ts` — Next 16 request proxy (formerly middleware) that refreshes the Supabase session cookie and redirects unauthenticated users.
- `lib/supabase/{client,server,proxy}.ts` — `@supabase/ssr` clients typed with `Database` from `@fitme/supabase`.
- `components/ui/` — shadcn-style primitives (Tailwind v4 + cva). `components.json` is set up for the shadcn CLI.
- Styling: Tailwind v4 via `@tailwindcss/postcss`; theme tokens in `app/globals.css` mirror the mobile palette.

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

## CI/CD

GitHub Actions use pnpm (`pnpm/action-setup`) and `pnpm install --frozen-lockfile`. Unit tests run through `pnpm turbo run test`. The release workflow (`.github/workflows/release.yml`) bumps the version in `apps/mobile/package.json` and `apps/mobile/app.json` following conventional commits: `feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major. The exercise sync workflow runs `pnpm --filter @fitme/supabase exercises:sync`.
