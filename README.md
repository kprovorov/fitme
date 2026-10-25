# Fitme

The monorepo behind [Fitme](https://fitmeproject.com), an AI workout planner and
tracker: the iOS app, Arnold (Fitme's AI), the backend services and the web
apps, on pnpm and Turborepo.

Users sign in with [Clerk](https://clerk.com). Data lives in Supabase Postgres,
reached by the Node apps through `@fitme/db` and by the clients with their Clerk
session token (row-level security reads the Clerk id); there is no Supabase Auth
and there are no Supabase Edge Functions.

## Layout

| Workspace | Package | What it is |
| --- | --- | --- |
| `apps/mobile` | `@fitme/mobile` | Expo / React Native app (expo-router, uniwind, RevenueCat, Sentry) |
| `apps/arnold` | `@fitme/arnold` | Arnold, Fitme's AI: an [EVE](https://www.npmjs.com/package/eve) agent, models through Vercel AI Gateway |
| `apps/api` | `@fitme/api` | Hono REST API (client config, Arnold model list) |
| `apps/exercises` | `@fitme/exercises` | Exercise Library API: Hono + zod-openapi over a baked-in `library.json` |
| `apps/mcp` | `@fitme/mcp` | MCP server (Streamable HTTP, Clerk OAuth) for ChatGPT and other MCP clients |
| `apps/webhooks` | `@fitme/webhooks` | Hono app receiving third-party webhooks (Clerk account deletion) |
| `apps/web` | `@fitme/web` | Next.js web app (account area) |
| `apps/site` | `@fitme/site` | Next.js marketing site |
| `packages/core` | `@fitme/core` | Domain models, labels, formatters, pure helpers |
| `packages/exercise-library` | `@fitme/exercise-library` | Exercise Library API client and its in-memory fake |
| `packages/design-tokens` | `@fitme/design-tokens` | Design tokens and text styles, one Tailwind v4 CSS file |
| `packages/supabase` | `@fitme/supabase` | Supabase project (migrations, pgTAP tests) and generated DB types |
| `packages/db` | `@fitme/db` | `asUser` / `withService`: the only way backend apps reach Postgres |
| `packages/observability` | `@fitme/observability` | Errors and traces (Sentry) with shared privacy rules |
| `packages/rate-limit` | `@fitme/rate-limit` | Per-caller rate limiter (Upstash Redis or in memory, fail open) |
| `packages/services` | `@fitme/services` | Business logic run inside an `asUser` / `withService` transaction |
| `packages/typescript-config` | | Shared tsconfig presets |

[`AGENTS.md`](AGENTS.md) is the detailed reference: architecture, patterns,
every environment variable and CI/CD. Decisions are in [`docs/adr/`](docs/adr),
domain terms in [`GLOSSARY.md`](GLOSSARY.md).

## Running it locally

Needs Node 24, pnpm and Docker (for the local Supabase stack).

```bash
pnpm install

pnpm db start            # local Supabase stack

pnpm dev:mobile          # expo start
pnpm ios                 # expo run:ios (also: pnpm android)
pnpm dev:web             # :3000
pnpm dev:site            # :3001
pnpm dev:mcp             # :3002
pnpm dev:api             # :3003
pnpm dev:webhooks        # :3004
pnpm dev:arnold          # :3005
pnpm dev:exercises       # :3006, serving the made-up fixture library
```

Each app has an `.env.example`. Copy it to `.env` for `apps/mobile` and
`apps/exercises`, or to `.env.local` for `apps/web`, `apps/site` and
`apps/arnold`; `apps/api`, `apps/mcp` and `apps/webhooks` read the process
environment instead. AGENTS.md lists what each variable does.

## Checks

```bash
pnpm test                # unit tests in every workspace
pnpm typecheck
pnpm check               # Ultracite (Biome); pnpm fix applies its fixes
pnpm literal-check       # no color literals or arbitrary sizes in the UI
```

## Contributing and security

This project doesn't take outside contributions; see
[`CONTRIBUTING.md`](CONTRIBUTING.md). Report vulnerabilities privately as
described in [`SECURITY.md`](SECURITY.md).
