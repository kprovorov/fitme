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
| `apps/library` | `@fitme/library` | Library API: Hono + zod-openapi over a baked-in `library.json` |
| `apps/mcp` | `@fitme/mcp` | MCP server (Streamable HTTP, Clerk OAuth) for ChatGPT and other MCP clients |
| `apps/webhooks` | `@fitme/webhooks` | Hono app receiving third-party webhooks (Clerk account deletion) |
| `apps/web` | `@fitme/web` | Next.js web app (account area) |
| `apps/site` | `@fitme/site` | Next.js marketing site |
| `packages/core` | `@fitme/core` | Domain models, labels, formatters, pure helpers |
| `packages/library-sdk` | `@fitme/library-sdk` | Library API client and its in-memory fake |
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
pnpm dev:library         # :3006, serving the made-up fixture library
```

Each app has an `.env.example`. Copy it to `.env` for `apps/mobile` and
`apps/library`, or to `.env.local` for `apps/web`, `apps/site` and
`apps/arnold`; `apps/api`, `apps/mcp` and `apps/webhooks` read the process
environment instead. AGENTS.md lists what each variable does.

## Checks

```bash
pnpm test                # unit tests in every workspace
pnpm typecheck
pnpm check               # Ultracite (Biome); pnpm fix applies its fixes
pnpm literal-check       # no color literals or arbitrary sizes in the UI
```

## App Store listing

The public listing text lives in [`apps/mobile/store.config.json`](apps/mobile/store.config.json)
(EAS Metadata, `en-US` and `uk`), referenced by the production submit profile in
`apps/mobile/eas.json`. Edit it through a PR, including `releaseNotes` for the
next release. The English copy was pulled from App Store Connect; Ukrainian is
a translation, with the same correction to the unshipped weekly adaptation claims.
ASO changes are separate. Omitted fields, such as an unset `promoText`, stay
managed in App Store Connect.

Release runs from `main` build the release tag, wait for EAS auto-submit, then
run `eas metadata:push --profile production --non-interactive`. CI stamps
`apple.version` from the tag into the working copy so the listing targets that
release's draft. PRs never push metadata. The push does not submit the version
for App Review; inspect the draft in App Store Connect before submitting it.
Rebuilding an older tag without the store config skips metadata sync.

Authentication reuses the App Store Connect API key stored in EAS for production
submissions, through the GitHub `production` environment's `EXPO_TOKEN`
(Infisical `prod` `/GitHub`). The key needs App Manager access for metadata.
Keep the private key, Key ID and Issuer ID in EAS credentials, never in this repo.
Use EAS CLI 27.2.0 (the CI pin) or a compatible later version.

If someone edits the listing in App Store Connect, pull it before the next PR:

```bash
pnpm --filter @fitme/mobile exec eas metadata:pull --profile production --non-interactive
```

**Treat that export as private until cleaned:** EAS also downloads review contacts,
demo credentials, screenshots and release settings. Keep only `configVersion`,
the public `apple.copyright`, and `apple.info`'s public text fields before staging;
do not commit `apple.review`
or the downloaded `apps/mobile/store/` assets. Restore both locales and review the
diff, since a pull overwrites the local file. To retry a failed metadata step,
use the release tag's listing with `apple.version` set to the tag's version, then
run the same `eas metadata:push` command from `apps/mobile` with the maintainer's
EAS login. Confirm the version's draft, locale text and release notes afterward.

## Contributing and security

This project doesn't take outside contributions; see
[`CONTRIBUTING.md`](CONTRIBUTING.md). Report vulnerabilities privately as
described in [`SECURITY.md`](SECURITY.md).
