---
status: accepted
date: 2026-10-14
---

# The Coach runs on EVE in its own app

The Coach is now Arnold (ADR 0012).

Partly superseded by ADR 0006: Coach model calls go through Vercel AI Gateway, not the direct providers, and the per-turn budget is in USD, not tokens.

The Coach moves from the `ai-agent` Supabase Edge Function to `apps/coach`, its own Vercel project built on Vercel's EVE framework (`ai@7`). It runs separately from `apps/api` because it is its own body of business logic with its own runtime needs. Its turns are durable: a step can retry, a turn survives redeploys and has no overall time limit, and a client can reconnect to a running stream. Each step still has to fit Vercel's function limit (800 s on Pro).

The channel verifies the Clerk session once and keeps the User id on the EVE session, and the Coach's tools call `asUser` with that id (ADR 0003). The Coach never forwards Clerk tokens, which expire in about 60 s while a turn can run for minutes.

## Considered options

- **EVE (chosen).** Durable turns, built-in resume, Agent Runs observability and evals, and it stays on Vercel. assistant-ui ships an EVE runtime (`@assistant-ui/eve`).
- **A plain Vercel Function in `apps/api`.** Simplest, but turns are capped by the function limit and lost on disconnect, and it mixes the Coach into the API.
- **Cloudflare Workers / Agents SDK.** No wall-clock limit and CPU-only billing, but it adds a vendor, the Agents SDK is 0.x and talks over WebSocket, and history lives outside Postgres.

## Consequences

- **Conversations are now stored on the server.** EVE keeps them, where the old function stored nothing. A User works in one current Conversation, old ones expire after 30 days, and account deletion wipes them (the Clerk webhook resets the User's EVE sessions after `deleteUserData`).
- **The Coach is Pro-only, enforced on the server.** The channel checks the "Fitme Pro" entitlement against RevenueCat (cached ~5 min) on every channel request, so nothing that runs or reads a turn gets past it.
- Spend is capped by a per-turn budget plus a 20-step limit. EVE's own usage limits are per session and ask the user whether to continue, so the Coach enforces both per turn in its own hooks, cancelling the turn before the model call that would go over (originally a token budget, since the direct providers report no cost; a USD budget since ADR 0006). The model the client asks for must be in `coachModels`.
- `defaultTools: false`: the Coach gets no shell, file or web tools, only our own.
- EVE is in preview (0.x) and moves fast, so pin it exactly and read its changelog on every bump.
- **Assumption:** `@assistant-ui/eve` streams and resumes in Expo, likely with `globalThis.fetch` set to `expo/fetch`. If it doesn't, the fallback is a custom channel that emits the AI SDK UI message stream, so the app keeps `useChat`.
- **Path taken (FIT-123): `@assistant-ui/eve`, not the fallback.** The coach screen runs on `useEveAgentRuntime` with the Clerk token as a per-request bearer. No fetch shim was needed: Expo SDK 57's runtime already installs `expo/fetch` as the global `fetch` (and `AbortSignal.any`, `DOMException`, `TextDecoder`, which eve's client uses), and Metro bundles `eve/react`. The app saves the session cursor and event log per User and resumes with `resume: true`.
- The `ai-agent` edge function stays deployed until app builds below the minimum supported version are cut off.
