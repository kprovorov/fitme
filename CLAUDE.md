# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start development server
npm run start          # or: expo start

# Run on specific platform
npm run ios            # iOS simulator
npm run android        # Android emulator

# Lint
npm run lint           # expo lint (ESLint + Prettier)

# Tests
npm run test           # jest --watchAll
npx jest --testPathPattern="<file>"  # run a single test file
```

## Architecture

This is a **React Native / Expo** fitness app using **file-based routing** via `expo-router`. The main app structure is:

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
- `lib/` — Shared utilities
  - `supabase.ts` — Supabase client (uses AsyncStorage for session persistence)
  - `models.ts` — TypeScript domain model types (User, Profile, Plan, Workout, Exercise, etc.)
  - `database.types.ts` — Auto-generated Supabase DB types
  - `mmkv.ts` — MMKV storage instance
  - `types.ts` — Generic types (pagination)
  - `formatters.tsx` — Display formatting helpers
  - `labels.ts` — Human-readable labels for enum values
- `supabase/` — Supabase project config
  - `functions/` — Edge Functions: `generate-plan`, `preview-plan`, `delete-user`
  - `migrations/` — SQL migrations

## Key Patterns

**Data fetching**: All queries/mutations use `react-query-kit` wrappers (`createQuery`, `createMutation`) around the Supabase JS client. Import from `~/hooks/queries/<entity>` or `~/hooks/mutations/<entity>`.

**Authentication**: `useCurrentUserQuery` (queryKey `["user"]`) fetches the session from Supabase and the user's profile. Auth state changes in `_layout.tsx` invalidate `["user"]` or clear the QueryClient on sign-out. The `<Authenticated>` component wraps protected screens and redirects unauthenticated users.

**Styling**: NativeWind v4 (Tailwind CSS for React Native). CSS variables are defined in `global.css` for theming. Custom spacing tokens: `xs`, `sm`, `md`, `lg`. Custom font families: `nunito-sans-regular/semibold/bold`, `ibm-plex-mono`.

**UI Components**: Built on `@rn-primitives` (shadcn/ui-compatible for React Native). Use components from `components/ui/`.

**Subscriptions**: RevenueCat manages IAP. `useIsProQuery` (queryKey `["rc-is-pro"]`) checks the "Fitme Pro" entitlement. Customer info updates are listened to in `_layout.tsx`.

**Module aliases**: Use `~/` or `@/` as path aliases for the project root (both resolve the same way via tsconfig paths).

## Environment Variables

Required env vars (prefix `EXPO_PUBLIC_` for client exposure):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`

## CI/CD

Push to `main` triggers auto version bump via GitHub Actions (`.github/`). Follows conventional commits: `feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major. Both `package.json` and `app.json` versions are updated automatically.
