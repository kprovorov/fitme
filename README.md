# Fitme

Turborepo monorepo for the Fitme fitness app: an Expo mobile app, a Next.js web app, and the shared packages behind them.

## Layout

```
apps/
  mobile/     Expo / React Native app (expo-router, uniwind, RevenueCat, Sentry)
  web/        Next.js app (App Router, Tailwind v4, Supabase SSR auth)
packages/
  core/       @fitme/core — domain models, labels, formatters, pure helpers
  supabase/   @fitme/supabase — Supabase project (config, migrations, edge
              functions, seeds) plus generated database types
  typescript-config/  @fitme/typescript-config — shared tsconfig presets
```

## Getting started

```bash
pnpm install

# Local Supabase (Docker required)
pnpm db start            # supabase start
pnpm db seed             # seed exercises + demo data

# Apps
pnpm dev:mobile          # expo start        (apps/mobile)
pnpm dev:web             # next dev :3000    (apps/web)
pnpm dev:site            # next dev :3001    (apps/site, marketing site)
pnpm ios                 # expo run:ios       (also: pnpm android)
```

Environment files live next to each app. Copy `apps/mobile/.env.example` to
`apps/mobile/.env`, `apps/web/.env.example` to `apps/web/.env.local`, and
`apps/site/.env.example` to `apps/site/.env.local`.

## Repo-wide scripts

| Command           | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | `turbo run dev` for every app                  |
| `pnpm build`      | `turbo run build` (web build, package outputs) |
| `pnpm test`       | `turbo run test` across all workspaces         |
| `pnpm typecheck`  | `turbo run typecheck`                          |
| `pnpm check`      | `ultracite check` (Biome) for the whole repo   |
| `pnpm fix`        | `ultracite fix`                                |
| `pnpm db <cmd>`   | run a script in `@fitme/supabase`              |
| `pnpm mobile <cmd>` | run a script in `@fitme/mobile`              |
| `pnpm web <cmd>`  | run a script in `@fitme/web`                   |
| `pnpm site <cmd>` | run a script in `@fitme/site`                  |

## Shared packages

Workspace packages are consumed as TypeScript source (no build step). Metro
picks them up through the hoisted `node_modules`; Next.js compiles them via
`transpilePackages` in `apps/web/next.config.ts`.

- Import domain types and helpers from `@fitme/core`.
- Import generated `Database` / `Tables<"...">` types from `@fitme/supabase`.
  Regenerate them with `pnpm db types:generate` after a migration.
