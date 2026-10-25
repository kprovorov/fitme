---
status: accepted
date: 2026-10-23
---

# One Public API for First-party and Third-party apps, every credential through Clerk

`apps/api` serves one contract, `/v1`, to every caller: Fitme's own mobile and web apps (First-party apps), apps a User connects through OAuth (Third-party apps), and a User's own scripts (API keys). There is no separate internal API or backend-for-frontend. All three credentials are Clerk's: a session token, an OAuth access token, or a Clerk API key, verified at the edge into one verified caller (`userId`, credential kind, OAuth client); the User id given to `asUser` (ADR 0003) only ever comes from it. Every route declares the permission it needs (`read` or `write`) and whether it is First-party only. This is how ADR 0004's "every client reaches data only through `apps/api`" is meant. For now the API is built for First-party apps only and accepts Clerk session tokens alone; OAuth tokens and API keys are added, through Clerk, when it opens up, without changing a route.

## Considered options

- **One contract, all credentials through Clerk (chosen).** First-party apps exercise the same routes outsiders get, so the public contract can't rot. Clerk already issues the session tokens, and runs the OAuth authorization server MCP uses; its API keys come with revocation and a self-serve UI, so Fitme stores no credential.
- **A backend-for-frontend for the apps, a separate public API later.** Screen-shaped endpoints ship faster, but there are then two contracts to keep additive, and the public one lags behind.
- **Our own API keys in Postgres.** Full control and no per-verification cost, but hashing, rotation, revocation and the UI to manage keys would all be ours to build and secure.

## Consequences

- **Everything shipped is public.** Routes are resource-shaped, never screen-shaped, and additive-only within `v1` (the oasdiff check `apps/library` uses). A route that should never be public is marked First-party only (session tokens only); it is still part of the same contract.
- **No custom scopes yet.** Clerk OAuth tokens can't carry custom scopes, so any valid credential has full access to its User's data. Routes declare `read` / `write` from the start, so scopes can be added later without changing them: a credential without scopes keeps full access.
- **When they land, API keys cost a network call per request.** Clerk API keys are opaque and verified through Clerk's Backend API, billed per verification beyond each plan's allowance (Hobby stops at the allowance). `@clerk/hono`'s middleware verifies any token before a route filters it, so it is mounted only where it's needed.
- **The Public API doesn't proxy the Library.** Responses refer to Exercises by Exercise slug only, from Postgres: no name, no media. Third-party apps and API keys can't call the Library API (ADR 0007), and that's accepted.
- **Responses are parsed through each route's own schema**, so fields the services return beyond the contract (legacy columns, `request_key`, `deleted_at`) never leak, and a service change never silently changes the API.
- One Clerk instance per deployment: production accepts the production instance only.
