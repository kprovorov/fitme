# Moving the edge functions off Supabase

Research note, 2026-10-13. Question: where should the code in
`packages/supabase/supabase/functions/` run instead of Supabase Edge Functions?
The candidates are (1) Next.js route handlers in `apps/web` on Vercel, (2) routes in
the Hono app `apps/api` on Vercel, and (3) Cloudflare Workers.

Repo facts are cited as `path:line`. External claims link to the primary source.
Anything I couldn't check is marked **(unverified)**.

## TL;DR

- **Delete `preview-plan`, don't migrate it.** Nothing calls it. The mobile caller
  (`usePreviewPlanQuery` → `functions.invoke("preview-plan")`) was removed in `37b6d2e`
  (2026-04-15). The stale `delete-user` function that is still deployed can go too,
  but only once old app builds have stopped calling it (see §4).
- **Current plan (2026-10-14):**
  - `ai-agent` → **`apps/coach` on EVE** (§10).
  - `clerk-webhook` / `revenuecat-webhook` → **`apps/webhooks`** (§9).
  - Shared logic → `packages/services` + `packages/db`.
  - `apps/api`, `apps/mcp` and `apps/coach` each connect to Postgres with their own
    least-privilege login and enforce ownership through `withUser` + RLS. There's no
    internal HTTP hop, and ADR 0002 gets replaced
    ([remove-rpcs-business-layer.md §9](./remove-rpcs-business-layer.md)).
  - Everything goes in Vercel region `cle1`, next to Supabase's `us-east-2`.
  - *(Superseded first answer: move all three functions into `apps/api`.)*
- `apps/web` is the weakest option. No Vercel project deploys it today (the three
  other `fitme`-related projects are `fitme-site`, plus `app-fitme` and `id-fitme`,
  which are both old Vite apps). Its Clerk proxy
  protects `/api/*` by default. And it would tie mobile-backend deploys to the web app.
- Cloudflare Workers is technically the best fit for long LLM streams: no wall-clock
  limit while the client stays connected, and billing by CPU time. But it adds a new
  vendor, a new deploy pipeline and a new runtime target, all for one function. That is
  only worth it if `ai-agent` really starts hitting Vercel's duration limit.
- **Decision (2026-10-14): the coach agent moves to its own app, `apps/coach`, built
  on EVE** (§10). Every "`ai-agent` in `apps/api`" recommendation below is
  superseded (§4.5, §7).
- **Follow-up (§6-9).**
  - If the coach outgrows a plain function, move it to Vercel Workflow +
    `WorkflowAgent` (§7). Cloudflare Agents is covered in §6.
  - The webhooks go in their own `apps/webhooks` project (§9).
  - The RPC logic moves to Drizzle in shared packages
    ([remove-rpcs-business-layer.md](./remove-rpcs-business-layer.md)).
- **Verified 2026-10-14 on a throwaway local stack:** per-app login + `withUser`
  enforces RLS with no cross-user leaks across 300 concurrent transactions. But
  session-level `SET ROLE` / `set_config(…, false)` leaks between clients through the
  transaction pooler, and postgres.js can hang there. Use `pg`.

## 1. Inventory

Supabase project `fitme` (`zujyynezicwviytereod`) is in **`us-east-2`** (Supabase
`list_projects`). The deployed functions are `ai-agent`, `preview-plan`,
`clerk-webhook`, `revenuecat-webhook`, and **`delete-user` (v80, `verify_jwt: true`),
which is still deployed but no longer exists in the repo** (Supabase
`list_edge_functions`; it was removed in `aab936d`).

| Function | Trigger / caller | Auth | Secrets | Admin (service-role) client | Response | Expected duration | Sentry | Deno-specific bits |
|---|---|---|---|---|---|---|---|---|
| `ai-agent` | Mobile coach tab via AI SDK `useChat` transport, hard-coded URL `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-agent` (`apps/mobile/app/(tabs)/coach/index.tsx:39`), Clerk token in `Authorization` (`:43-46`) | Clerk session JWT via `withClerkUser` → `verifyToken(token, { jwtKey: CLERK_JWT_KEY })`, networkless (`_shared/clerk-auth.ts:77-81`) | `CLERK_JWT_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (`ai-agent/index.ts:20-23`), plus the injected `SUPABASE_URL` and publishable key | Built by `withClerkUser` (`clerk-auth.ts:100-104`) but **none of the 14 tools use it**. They all use the RLS-scoped `ctx.supabase` (grep of `ai-agent/tools/`) | **Streams** UI messages: `createAgentUIStreamResponse` (`ai-agent/index.ts:108`) | `ToolLoopAgent` with 14 tools (`:57-72`). Its default stop is 20 steps ([AI SDK loop control](https://ai-sdk.dev/docs/agents/loop-control)), so up to 20 sequential LLM calls. That can run to minutes on large models | None | `npm:` specifiers, `Deno.env.get` |
| `clerk-webhook` | Clerk `user.deleted` (Svix), registered on both Clerk instances (AGENTS.md) | Svix signature via `verifyWebhook` from `@clerk/backend/webhooks` (`clerk-webhook/handler.ts:1-4,20`). `verify_jwt = false` (`config.toml:347-349`) | `CLERK_WEBHOOK_SIGNING_SECRET`, `SENTRY_DSN` (`clerk-webhook/index.ts:12,27`) | **Yes**: `ctx.supabaseAdmin.rpc("delete_user_data")` (`index.ts:36`). `delete_user_data` is `service_role`-only (AGENTS.md) | JSON. 500 on failure so Clerk retries (`handler.ts:28-31`) | Sub-second | `@sentry/deno`, default integrations off, flushed on error (`index.ts:1,10-23`) | `npm:@sentry/deno`, `npm:@supabase/server` `withSupabase({ auth: "none" })`, `Deno.env`, `SB_REGION` tag |
| `revenuecat-webhook` | RevenueCat webhook | Static `Authorization` header compared to `REVENUECAT_WEBHOOK_SECRET` (`revenuecat-webhook/index.ts:11-16`). Not constant-time | `REVENUECAT_WEBHOOK_SECRET` | **Yes**: reads `profiles` (`:38-42`) | JSON, always 200 | Sub-second | None | `npm:@supabase/server`, `Deno.env` |
| `preview-plan` | **No caller.** Only deployed to the E2E preview branch (`.github/workflows/e2e.yml:98-115`), and no flow calls it | `withClerkUser` | `CLERK_JWT_KEY`, `REVENUECAT_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | No | JSON (non-streaming), up to 3 sequential LLM attempts | n/a | None | `Deno.env` |

Notes:

- **`revenuecat-webhook` does nothing.** It authenticates, looks the profile up, logs
  and returns 200 (`revenuecat-webhook/index.ts:38-57`). Nothing is persisted.
  Entitlements are read straight from RevenueCat on the client (`useIsProQuery`).
- **Tests.** Only `clerk-webhook/handler.test.ts` exists. It is Deno
  (`jsr:@std/assert`, `npm:standardwebhooks`) and runs through `pnpm db test:functions` =
  `deno test --no-config --node-modules-dir=none --allow-env supabase/functions`
  (`packages/supabase/package.json:27`), in CI after `denoland/setup-deno`
  (`.github/workflows/unit-tests.yml:29-34`). Biome also has a `supabase/functions`
  override (`biome.jsonc:22`).
- **`withClerkUser` adds CORS** (`clerk-auth.ts:54-64,118-120`). The mobile app doesn't
  need CORS, but a future web caller would.
- **CI.** `e2e.yml` sets `CLERK_JWT_KEY` on the preview branch and deploys
  `preview-plan` only (`e2e.yml:98-115`). `ai-agent` and the webhooks are not exercised
  by any E2E flow. I couldn't see how production deploys happen. The deployed
  `entrypoint_path` is `file:///app/packages/supabase/...`, which suggests a CLI or
  integration deploy from the monorepo root **(unverified)**.

### The hosts that already exist

- **`apps/api`**: Hono, tsdown bundle, `dist/app.js` default-exports the app for
  Vercel's Hono preset (`apps/api/tsdown.config.ts:12-18`, `apps/api/src/app.ts:34-35`).
  `vercel.json` sets only `outputDirectory` (`apps/api/vercel.json`). It is live as
  Vercel project `fitme-api` (framework `hono`, Node 24.x, domain
  `api.fitmeproject.com`). Today the code uses no auth and reads no secrets (I didn't
  check the Vercel env), and uses
  `cors({ origin: "*" })` (`app.ts:10`).
- **`apps/mcp`**: the same deployment pattern (`apps/mcp/tsdown.config.ts`,
  `vercel.json`), Vercel project `fitme-mcp` → `mcp.fitmeproject.com`. It already uses
  `@clerk/hono`, supabase-js and vitest with a fake Supabase client. By design it never
  holds a service-role key (AGENTS.md), so the webhooks must not go here.
- **`apps/web`**: Next 16, `proxy.ts` runs `clerkMiddleware` and calls `auth.protect()`
  on every route except `/` and `/sign-in` (`apps/web/proxy.ts:5-12`). Its matcher
  explicitly includes `/(api)(.*)` (`:21`). **No Vercel project deploys it.** The only
  candidate, `app-fitme` (app.fitmeproject.com), is an old Vite project whose last
  production deploy was in Feb 2025 (Vercel `get_project`). `id-fitme`
  (id.fitmeproject.com) is also an old Vite project, last deployed in Feb 2025.
- Neither Hono project sets `regions` in `vercel.json`, so unless the dashboard
  overrides it they run in the default `iad1` ([region docs](https://vercel.com/docs/functions/configuring-functions/region))
  **(dashboard setting unverified)**. The same goes for the project default max
  duration.
- Both Hono projects have `ssoProtection: all_except_custom_domains`. Preview
  deployments are behind Vercel auth, so pointing Clerk or RevenueCat at a preview URL
  needs a protection bypass.

## 2. Platform facts

### Supabase Edge Functions (the baseline)

From [Supabase limits](https://supabase.com/docs/guides/functions/limits):

- 256 MB of memory.
- Wall clock: **150 s on Free, 400 s on paid plans**.
- **2 s of CPU per request**.
- Request idle timeout of 150 s (504 if no response starts by then).
- 20 MB per function.

The wall clock is per worker: "During this period, a worker can serve multiple
requests". So a request that lands late in a worker's life gets less than the full 400 s.
The limit "is not configurable" except by self-hosting
([troubleshooting](https://supabase.com/docs/guides/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW)).
The other reasons to leave are repo-specific:

- A separate runtime (Deno, `npm:` specifiers, `Deno.env`).
- A separate test runner and CI setup step.
- The `verify_jwt = false` workaround with a hand-rolled `withClerkUser` for Clerk tokens.
- A deploy pipeline separate from the Node apps.

### Vercel Functions (options 1 and 2)

- **Duration (Fluid compute, Node).** Hobby: 300 s default and maximum. Pro and
  Enterprise: 300 s default, 800 s maximum, 1800 s extended beta. The limit
  "includes … streamed responses", and going over returns 504
  `FUNCTION_INVOCATION_TIMEOUT` ([limits](https://vercel.com/docs/functions/limitations)).
  So **Hobby (300 s) is shorter than Supabase paid (400 s)**. Pro can set
  `maxDuration` up to 800 s.
- **Edge runtime.** It must start responding within 25 s and can stream for up to
  300 s. Use the Node runtime instead (same page).
- **Payload and memory.** Request and response bodies are capped at 4.5 MB. Memory is
  2 GB on Hobby and up to 4 GB on Pro (same page). Neither matters here.
- **Pricing.** Billing is by active CPU plus provisioned memory. "Waiting for I/O (e.g.
  calling AI models …) does not count towards active CPU time", but memory "continues
  billing … even during I/O". Hobby includes 4 CPU-hours, 360 GB-hours and 1M
  invocations. Pro bills on demand; in `iad1` and `cle1` that is $0.128 per CPU-hour,
  $0.0106 per GB-hour and $0.60 per million invocations
  ([pricing](https://vercel.com/docs/functions/usage-and-pricing)). Pro is $20 per seat
  per month with a $20 usage credit. Hobby is for "personal, non-commercial use"
  ([vercel.com/pricing](https://vercel.com/pricing)). Fitme sells subscriptions, so the
  team should be on Pro **(the team's current plan is unverified)**.
- **Setting `maxDuration` on a zero-config Hono app.** For non-Next frameworks, the
  docs say to use the `functions` glob in `vercel.json`, or the project's dashboard
  **Default Max Duration** (up to 800 s; anything above 800 s must be set per
  function) ([duration](https://vercel.com/docs/functions/configuring-functions/duration)).
  Which file path the Hono preset's single function matches (for `functions`) isn't
  documented **(unverified)**, so the dashboard default is the documented route.
- **Cold starts.** With Fluid compute, instances are reused across requests and serve
  concurrent requests ("optimized concurrency",
  [duration page](https://vercel.com/docs/functions/configuring-functions/duration)).
  I didn't measure cold-start latency for any platform.
- **Region.** `cle1` = AWS `us-east-2` (Cleveland) ([regions](https://vercel.com/docs/regions)).
  Set it with `"regions": ["cle1"]` in `vercel.json`
  ([region config](https://vercel.com/docs/functions/configuring-functions/region)).
  `cle1` costs the same as `iad1` (pricing page).
- **Hono zero-config.** The default export of `src/app.ts` and similar files is
  detected. Routes "automatically become Vercel Functions and use Fluid compute by
  default", and streaming is supported
  ([Hono on Vercel](https://vercel.com/docs/frameworks/backend/hono)). The
  `fitme-api` and `fitme-mcp` projects already run this way.
- **Next.js.** Route handlers set `export const maxDuration = …`
  ([Next docs](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/maxDuration)).
  Clerk's webhook guide says the webhook route must not be protected, because
  "Incoming webhook events don't contain auth information"
  ([Clerk webhooks](https://clerk.com/docs/guides/development/webhooks/syncing)).
  In this repo that means adding the routes to `isPublicRoute` in
  `apps/web/proxy.ts:5`. `request.text()` gives the raw body, which
  `verifyWebhook(request)` needs anyway.

### Cloudflare Workers (option 3)

- **Limits.** From [Workers limits](https://developers.cloudflare.com/workers/platform/limits/):
  - CPU: 10 ms per request on Free. On Paid, **30 s default and 5 min maximum**
    (`limits.cpu_ms`).
  - Wall clock: **"no hard limit" for HTTP requests while the client stays connected**.
    `waitUntil` gets 30 s after the response.
  - 128 MB of memory per isolate.
  - Subrequests: 50 on Free, 10,000 on Paid.
  - Bundle size: 64 MiB.
- **Pricing.** Paid is $5 per month minimum and includes 10M requests and 30M CPU-ms.
  After that it's $0.30 per million requests and $0.02 per million CPU-ms. "No charge
  or limit for duration" ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
  For an I/O-bound LLM tool loop this is the cheapest and most generous model. The Free
  plan's 10 ms of CPU is too tight for JWT verification plus AI SDK stream encoding
  **(not measured)**.
- **Placement.** Workers run near the user by default. `placement.region =
  "aws:us-east-2"` (Placement Hints, 2026) or `mode = "smart"` moves them next to the
  backend ([placement](https://developers.cloudflare.com/workers/configuration/placement/)).
- **Node compatibility.** `nodejs_compat` needs a compatibility date of 2024-09-23 or
  later, and is on by default from 2026-08-04
  ([Node.js APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)).
- **Libraries.**
  - `@clerk/backend` supports "any V8 isolates runtime"
    ([README](https://github.com/clerk/javascript/tree/main/packages/backend)).
  - `@supabase/server` supports Workers with `nodejs_compat` or an `env` override
    ([repo](https://github.com/supabase/server)).
  - supabase-js talks to PostgREST over HTTPS and never opens a Postgres socket, so
    Hyperdrive (a Postgres connection pooler) isn't needed. This is my reasoning, not a
    documented statement.
- **Cold starts.** Workers are V8 isolates. Global-scope code has a 1 s startup budget
  ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
  - Sentry ships `@sentry/cloudflare`, which needs `nodejs_compat` for
    `AsyncLocalStorage` ([Sentry docs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)).
- **What it costs the repo.** A new vendor account, wrangler config, a separate secret
  store, a deploy pipeline and a local dev story (`wrangler dev`), next to Vercel, which
  already hosts two Hono apps.

### Webhook sender behaviour (same for every host)

- **Clerk (Svix).** It expects a response in about 15 s. It retries at 5 s, 5 min,
  30 min, 2 h, 5 h, 10 h and 10 h, and any non-2xx response counts as a failure
  ([Svix retries](https://docs.svix.com/retries)). `verifyWebhook(request, {
  signingSecret })` comes from `@clerk/backend/webhooks`
  ([reference](https://clerk.com/docs/reference/backend/verify-webhook)) and is the same
  call `handler.ts` already makes.
- **RevenueCat.** It sends the configured `Authorization` header value. Optional HMAC:
  `X-RevenueCat-Webhook-Signature: t=…,v1=…`, computed over `timestamp.rawBody`. It
  gives up after 60 s and retries 5 times (5, 10, 20, 40, 80 min). Only 200 counts as
  success ([RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks)).

### Auth portability

All of it is already plain `@clerk/backend`:

- `verifyToken(token, { jwtKey })` is networkless when `jwtKey` is set
  ([verifyToken](https://clerk.com/docs/reference/backend/verify-token)).
- `verifyWebhook` takes a standard `Request`.

On Hono the port is mechanical: a `withClerkUser`-style middleware that sets `userId`
and the RLS client on the context. `@clerk/hono` (already used by `apps/mcp`) is
another route, but MCP uses it for OAuth tokens. For session tokens, the existing
`verifyToken` + `jwtKey` code is smaller and keeps the networkless property.
`@supabase/server`'s Hono adapter is deprecated: "Adapters are deprecated and will be
removed on December 1, 2026" ([repo](https://github.com/supabase/server)). Don't build
on it. Create the admin client with supabase-js directly.

## 3. Comparison (ai-agent, clerk-webhook, revenuecat-webhook)

| Criterion | 1. `apps/web` route handlers (Vercel) | 2. `apps/api` Hono (Vercel) | 3. Cloudflare Workers |
|---|---|---|---|
| Fit with repo | Weak. The web app is a Clerk-cookie UI. Not deployed to Vercel today, so it needs a new project | **Strong.** Same pattern as `apps/mcp` (Hono, tsdown, Vercel preset, vitest). Already live at `api.fitmeproject.com` | New runtime target, though Hono runs on Workers unchanged |
| Auth | Clerk middleware has to exclude the webhook routes. The mobile Bearer token on a route `auth.protect()` covers is untested here **(unverified)** | Explicit per-route middleware: `verifyToken` + `jwtKey` for `ai-agent`, `verifyWebhook` for Clerk, header/HMAC for RevenueCat | Same code as option 2 (`@clerk/backend` is V8-isolate compatible) |
| Streaming / duration | Node runtime: 300 s on Hobby, up to 800 s on Pro via `export const maxDuration` | Same limits. Set them through the dashboard default max duration (or a `functions` glob; path unverified) | **No wall-clock limit while connected.** 30 s CPU by default, 5 min max |
| vs Supabase today | Pro is better (800 s vs 400 s). Hobby is worse (300 s) | Same | Better |
| Cost (low volume) | Inside the Pro $20 credit for I/O-bound work. Memory is billed while waiting on the LLM | Same | $5 per month floor. Duration isn't billed |
| Ops / deploy | Couples backend deploys to the web UI | Already deployed on push. Pin `cle1`. Secrets go in Vercel env | New account, wrangler, secrets, CI deploy, and a new log/observability surface |
| Testing | vitest or jest via `Request` objects | vitest with `app.request` + the fake Supabase client from `apps/mcp` (pattern exists) | vitest + `@cloudflare/vitest-pool-workers` or plain `app.request` |
| Migration effort | Medium (new project, middleware carve-outs) | **Low.** Port 3 handlers and 14 tools, swap `npm:` imports for package deps, swap `Deno.env` for `process.env` | Medium (as option 2, plus platform setup) |
| Vendor count | Same | Same | **+1** |
| Service-role key | Lands in the web app's env next to UI code | Lands in `apps/api`'s env. Today that app has no secrets at all | Separate Worker secret |

## 4. Recommendation per function

> **Superseded in part (2026-10-14).** `ai-agent` (item 5) now goes to `apps/coach`
> on EVE (§10). The webhooks now go to a separate
> `apps/webhooks` project (§9), not `apps/api`. Under the Drizzle plan, `ai-agent`'s
> tools call `packages/services` inside `withUser` rather than an anon-key supabase-js
> client ([remove-rpcs-business-layer.md](./remove-rpcs-business-layer.md)).

1. **`preview-plan`: delete.** Remove the function, the `e2e.yml` steps that set
   `CLERK_JWT_KEY` and deploy it (`e2e.yml:98-115`), its line in AGENTS.md, and the note
   in `apps/mobile/e2e/manual/finish-workout-suggestion.md:73`. Then delete the
   deployed function from the project (`supabase functions delete preview-plan`).
   `config.toml:341-343` goes too.
2. **`delete-user` (deployed, not in the repo): delete it once old builds have
   drained.** Its caller was removed in `aab936d`, which first shipped in tag
   `v1.23.0`. App builds from `v1.22.0` and earlier still call
   `supabase.functions.invoke("delete-user")`.
   - The function runs with `verify_jwt: true`, so the gateway only lets project-signed
     tokens through. Clerk session tokens are rejected (`config.toml:334-336`), which
     means it is probably already dead for Clerk-era builds.
   - Whether pre-Clerk builds still hold valid Supabase Auth sessions is
     **unverified**. Check the function's invocation logs before deleting it.
3. **`clerk-webhook` → `apps/api` `POST /webhooks/clerk`.**
   - `handler.ts` is already runtime-neutral: it takes a `Request` and injected deps.
     Port it, swap the Deno test for vitest (`standardwebhooks` still works for
     signing), and use `@sentry/node` (or `@sentry/hono`) in place of `@sentry/deno`.
   - The Svix request has to stay under about 15 s, which is fine.
   - Register the new URL on both Clerk instances, then remove the old endpoint once a
     test `user.deleted` arrives.
4. **`revenuecat-webhook`:** first decide whether it should exist (it persists
   nothing).
   - If it stays, move it to `apps/api` `POST /webhooks/revenuecat`.
   - Compare the header with a constant-time compare, or switch to RevenueCat's HMAC
     signature.
   - Change the URL in the RevenueCat dashboard.
5. **`ai-agent` → `apps/api` `POST /v1/coach` (or similar)**, on the Node runtime, in
   `cle1`, with the project's default max duration set explicitly in the dashboard
   (300 s is already the default; up to 800 s on Pro).
   - Return `createAgentUIStreamResponse(...)` directly from the Hono handler. It's a
     standard `Response`.
   - Keep using only the RLS-scoped client (anon key + Clerk token). Don't build an
     admin client here.
   - Consider capping steps explicitly (`stopWhen`) so the worst case fits the
     duration limit.
   - **Cutover needs a mobile release.** Add an `EXPO_PUBLIC_API_URL`, point the
     transport at it (`coach/index.tsx:39`), and keep the Supabase `ai-agent` deployed
     until old app versions have drained.
   - Revisit Cloudflare only if real traces show coach conversations hitting the
     Vercel limit.

**Key placement.** Moving the webhooks gives `apps/api` the service-role key. If that's
unwelcome next to the public `/v1` routes, put the webhooks behind their own Hono
sub-app, or in a second Vercel project built from the same package. Either way, ai-agent
should not see the key.

**Cleanup after the move.**

- Drop `_shared/clerk-auth.ts`, the `test:functions` script and the Deno CI step
  (`unit-tests.yml:29-34`), the `[functions.*]` blocks in `config.toml`, the Biome
  override, `supabase/functions/.env.example`, and the edge-function paragraphs in
  AGENTS.md.
- The `[auth.third_party.clerk]` trust stays. PostgREST still needs it for RLS with
  Clerk tokens.

## 5. Open questions

- Which Vercel plan is the `provorovdev` team on? Hobby caps `ai-agent` at 300 s,
  shorter than Supabase's 400 s today, and Hobby is non-commercial only.
- Which Supabase plan is the project on (150 s vs 400 s wall clock today)? **(unverified)**
- What region do `fitme-api` and `fitme-mcp` run in now? The dashboard default isn't
  visible from the repo. Moving `apps/mcp` to `cle1` too is worth a look.
- How long do real coach conversations take? Supabase function logs or traces for
  `ai-agent` would show p99 duration. I didn't query them.
- How is production deployed to Supabase today (CLI by hand, or the GitHub
  integration)? This matters for making sure removed functions are really deleted.
- What is `revenuecat-webhook` for (see above)?
- Did `v1.23.0` (the first build without the `delete-user` call) reach the App Store,
  and do old builds still call `delete-user`?
- How many installs still run app builds that call `/functions/v1/ai-agent`? That
  decides when the old function can be deleted.
- Would Vercel's protection on preview deployments (`all_except_custom_domains`)
  block a future E2E against an `apps/api` preview? It would need a bypass token.

---

# Follow-up (2026-10-14)

## 6. ai-agent on Cloudflare, in depth

### 6.1 Plain Worker (port `ai-agent` as-is)

- **Runtime fit.** Most of the code ports as-is, though this is my reading, not a test
  **(unverified)**.
  - `@clerk/backend` supports "any V8 isolates runtime"
    ([README](https://github.com/clerk/javascript/tree/main/packages/backend)), so
    `verifyToken` with `jwtKey` works on Workers.
  - Cloudflare has a Supabase integration guide for Workers
    ([Supabase on Workers](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/)).
    supabase-js is fetch-based.
  - The AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) is what Cloudflare's own
    chat agents are built on ([chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/)).
  - Sentry is `@sentry/cloudflare` and needs `nodejs_compat`
    ([Sentry](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)).
    `nodejs_compat` is on by default from compatibility date 2026-08-04
    ([Node.js APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)).
- **Limits.**
  - HTTP duration: "No limit … As long as the client remains connected".
  - CPU: 30 s by default, 5 min maximum on Paid.
  - Memory: 128 MB.
  - Runtime updates give in-flight streams "up to 20 minutes to finish"
    ([limits](https://developers.cloudflare.com/workers/platform/limits/)).
- **Client disconnect mid-generation.** "When the client disconnects … tasks associated
  with that request may be canceled". `waitUntil` buys at most 30 s more (same page,
  [context](https://developers.cloudflare.com/workers/runtime-apis/context/)).
  - The agent loop can die between tool calls, after some writes have already landed.
  - The finished answer is lost; the current app doesn't persist coach messages
    server-side (`ai-agent/index.ts:108` streams only).
- **Pricing for long, mostly idle streams.** Workers bill CPU time, not duration:
  "No charge or limit for duration". $5 a month includes 10M requests and 30M CPU-ms
  ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)). This is the
  cheapest shape of the options considered here.
- **Monorepo and local dev.**
  - Add `apps/coach-worker` with a `wrangler.jsonc` and run `pnpm wrangler dev`.
    Several Workers can share one dev session (`wrangler dev -c a -c b`)
    ([local dev](https://developers.cloudflare.com/workers/local-development/),
    [multi-worker](https://developers.cloudflare.com/workers/local-development/multi-workers/)).
  - Tests can use `@cloudflare/vitest-pool-workers`
    ([vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-from-unstable-dev/)).
  - Workspace packages are source-only, and wrangler bundles with esbuild. Resolving
    `@fitme/*` from the hoisted `node_modules` should work **(unverified)**.
  - Place it with `placement.region = "aws:us-east-2"`
    ([placement](https://developers.cloudflare.com/workers/configuration/placement/)).

### 6.2 Cloudflare Agents SDK (`agents` + `@cloudflare/ai-chat`)

- **What it is.** `AIChatAgent` is a Durable Object class built on the AI SDK. It
  provides:
  - "Automatic message persistence" (SQLite in the DO).
  - "Resumable streaming".
  - Real-time sync over **WebSocket**.
  - Server, client and human-in-the-loop tools.

  The client is `useAgentChat` (React, wrapping AI SDK `useChat`), or
  `WebSocketChatTransport` for non-React clients
  ([chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/)).
  Agents also get `this.setState`/state sync and `schedule()`
  ([client SDK](https://developers.cloudflare.com/agents/communication-channels/chat/client-sdk/)).
- **Disconnects.**
  - Chunks are "buffered in SQLite as they are generated". If the client disconnects,
    "the server continues streaming and buffering". On reconnect the client gets the
    buffer and then the live stream (chat agents page).
  - Since v0.12.4 the server turn keeps running when the client stream is interrupted.
    `stop()` or `cancelOnClientAbort: true` cancels it
    ([changelog 2026-05-13](https://developers.cloudflare.com/changelog/post/2026-05-13-agents-sdk-v0.12.4/)).
  - Durable Objects stay alive on pending outbound `fetch()` (the LLM call), for up to
    15 minutes per operation
    ([DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)).
- **Auth.** `routeAgentRequest(request, env, { onBeforeConnect, onBeforeRequest })`
  rejects unauthenticated WebSocket upgrades. The token typically travels in a query
  parameter. Per-user instances are named `user-<id>`, and the router must enforce
  that the instance name equals the verified User
  ([routing](https://developers.cloudflare.com/agents/runtime/communication/routing/)).
  Clerk's `verifyToken` slots into `onBeforeConnect`.
- **Fit with the current code.**
  - The tool loop (`ToolLoopAgent`, 14 tools, default 20 steps) maps onto
    `AIChatAgent`'s AI SDK streaming. The tools are plain AI SDK `tool()`s over
    supabase-js.
  - But the transport changes from HTTP SSE (`AssistantChatTransport` + `expoFetch`,
    `apps/mobile/app/(tabs)/coach/index.tsx:38-47`) to a **WebSocket**.
    - `useAgentChat` gives resume and history loading.
    - `WebSocketChatTransport` leaves "loading persisted history, automatic stream
      resume after a reconnect … the React hook's responsibility" (chat agents page).
    - Whether `agents/react` runs under React Native/Expo isn't documented
      **(unverified)**. The docs list browsers, Node, Deno, Bun and edge functions.
  - The mobile app currently sends the full history each turn
    (`uiMessages: messages`). With `AIChatAgent` the DO owns the history. That's a
    product change (server-side chat history) and a privacy/deletion one:
    `delete_user_data` wouldn't reach DO storage. Account deletion would need a DO
    wipe too.
- **Pricing.**
  - Durable Objects bill **wall-clock duration** while active or not hibernatable:
    400,000 GB-s a month included, then $12.50 per million GB-s, charged on 128 MB.
  - "Pending I/O operations keep an object in memory … The object incurs duration
    charges during that time"
    ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)).
  - So a 60 s generation costs about 7.7 GB-s. The included tier covers roughly 52k
    such minutes a month (arithmetic from the published rates, not measured).
  - The DO pricing page recommends the WebSocket Hibernation API to avoid duration
    charges between messages. Whether `AIChatAgent` uses it by default is
    **(unverified)**.
- **Maturity.** The `agents` package is 0.x (`agents@0.12.4` in the May 2026 changelog)
  and changes fast (frequent recovery and streaming fixes in the changelog).

**Verdict on Cloudflare.**

- A plain Worker is the cheapest way to get an unlimited-duration HTTP stream. It keeps
  the client unchanged apart from the URL, but adds a vendor.
- The Agents SDK is the most capable option: durable turns, resume and server history.
  But it means a WebSocket client in Expo (unverified), a new storage location for User
  data, and a 0.x SDK.

## 7. Vercel Workflow and durable agents

- **What it is.** Workflow is GA as of 2026-04-16. The `workflow` package "goes stable
  at GA" ([blog](https://vercel.com/blog/a-new-programming-model-for-durable-execution)).
  v5 is now the recommended line ([what's new](https://workflow-sdk.dev/docs/whats-new)).
  - `'use workflow'` functions orchestrate `'use step'` functions. Runs are durable and
    resumable, with built-in observability, streams and multi-region pinning (v5).
  - Under the hood: "Vercel Functions execute your workflow and step code. Vercel Queues
    enqueue and execute those routes"
    ([Vercel Workflows](https://vercel.com/docs/workflows)).
- **Agents.**
  - AI SDK 7's `WorkflowAgent` (`@ai-sdk/workflow`) "runs the agent loop inside a
    workflow, persists state across step boundaries". Tools marked `'use step'` are
    retried (3 by default) and persisted.
  - **There is no default step limit**, unlike `ToolLoopAgent`'s 20, so set `stopWhen`.
  - Streaming goes through `getWritable()`. The route pipes `run.readable` through
    `createModelCallToUIChunkTransform()`.
  - Sources: [WorkflowAgent](https://ai-sdk.dev/docs/agents/workflow-agent),
    [Workflow AI](https://workflow-sdk.dev/docs/ai).
  - The earlier `DurableAgent` (`@workflow/ai/agent`) appears in the GA blog post.
  - The app is on `ai@6.0.176` (`apps/mobile/package.json:57`). The GA blog ties
    `WorkflowAgent` to "AI SDK v7". If its peer dependency really is `ai@7`, this is a
    major-version upgrade on server and client **(peer version unverified)**.
- **Does it lift the duration limit?** For the agent loop as a whole, yes.
  - "Maximum run duration: No limit". Each **step** is still bound by the function
    limit ("Max runtime of individual step: see Vercel Functions limits").
  - A workflow orchestration replay must finish within 240 s.
  - Sources: [pricing and limits](https://vercel.com/docs/workflows/pricing).
  - So a 20-step loop of LLM calls is fine as long as each single LLM call or tool step
    fits in 300 s (Hobby) or 800 s (Pro).
- **Streaming to mobile and reconnecting.**
  - The POST starts the run and returns `x-workflow-run-id`.
  - A `GET /…/{runId}/stream` route returns `run.getReadable({ startIndex })`.
  - `WorkflowChatTransport` (AI SDK `ChatTransport`) reconnects automatically "including
    after page refreshes". The client stores the run id; on mobile that would be MMKV
    instead of `localStorage`.
  - It plugs into `useChat`, which the app already uses
    ([resumable streams](https://workflow-sdk.dev/docs/ai/resumable-streams)).
  - Expo `fetch` streaming plus this transport is **(unverified)**, but it is plain HTTP,
    not WebSockets.
  - Plain (non-Workflow) AI SDK resume needs `resumable-stream` + Redis + a chat-id
    store, and turns client aborts into disconnects
    ([AI SDK resume](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)).
- **Hono.** The Workflow SDK lists Hono as supported. The Hono guide adds **Nitro** as
  the build system ("Hono has no build system … Nitro adds one"), with
  `modules: ["workflow/nitro"]` and `nitro dev`/`nitro build`
  ([Hono guide](https://workflow-sdk.dev/docs/getting-started/hono)).
  - `apps/api` builds with tsdown for Vercel's Hono preset
    (`apps/api/tsdown.config.ts`). Adopting Workflow means switching that app (or a
    new one) to Nitro.
  - Next.js is not required.
- **Pricing.**
  - Events cost $0.02 per 1k; a step is about 3 events.
  - Data written costs $0.50 per GB, and stream data counts. Retention is $0.50 per
    GB-month.
  - Hobby includes 50k events and 1 GB.
  - Retention is 1 day on Hobby and 7 days on Pro.
  - Plus normal function compute and Queues
    ([pricing](https://vercel.com/docs/workflows/pricing)).
  - A 20-step turn is about 60+ events, roughly $0.0012 a turn in events (arithmetic,
    not measured).
- **Local dev.** `nitro dev`, plus `npx workflow web` / `npx workflow inspect runs`
  (Hono guide).

**Plain function, Workflow or Cloudflare Agents, for `ai-agent`:**

| | Plain Vercel Function (`apps/api`) | Vercel Workflow + `WorkflowAgent` | Cloudflare `AIChatAgent` |
|---|---|---|---|
| Whole-turn duration | 300 s Hobby / 800 s Pro | Unlimited (per step ≤ function limit) | Unlimited while connected; DO keeps running after disconnect |
| Client disconnect | Generation continues unless `supportsCancellation` is on, and the output is lost ([Vercel changelog](https://vercel.com/changelog/node-js-vercel-functions-now-support-per-path-request-cancellation)) | Run continues; client resumes from `startIndex` | Turn continues; client resumes from the SQLite buffer |
| Client transport | Unchanged (HTTP SSE) | HTTP + `WorkflowChatTransport` (same `useChat`) | WebSocket (`useAgentChat`; RN support unverified) |
| Server-side history | None (as today) | Run streams retained 1-7 days | Persisted in the DO (affects account deletion) |
| Tool durability | None | Steps retried and persisted | Tool results persisted in messages |
| Repo change | Small | AI SDK 7 upgrade + Nitro build for the app hosting it | New vendor + DO + WebSocket client |
| Cost shape | Active CPU + memory while waiting | Compute + events/data | CPU (Worker) + DO wall time |

**Recommendation** *(superseded by the EVE decision, §10)*.

1. Ship `ai-agent` as a **plain Vercel Function in `apps/api` now**. Set an explicit
   `stopWhen` and `maxDuration`, enable `supportsCancellation` and forward
   `req.signal`, so a closed app stops spending tokens. Like the Cloudflare case in
   §6.1, cancellation stops the loop between tool steps, and writes already made stay.
   That's another reason to make the plan-edit tools atomic (see the Drizzle note).
2. If real traces show turns near the limit, or users losing answers on flaky networks,
   move the coach to **Vercel Workflow + `WorkflowAgent`**. It keeps the HTTP `useChat`
   client, stays on one vendor, and makes tools retryable.
3. Do it as its own small Nitro-built app (for example `apps/coach`) rather than
   converting `apps/api`.
4. Choose Cloudflare Agents only if you want server-side, multi-device chat history as
   a product feature and accept a WebSocket client and a second vendor.

## 8. Removing the RPCs (Drizzle path)

> **Update (2026-10-14): MCP.** `apps/mcp` stops calling PostgREST with self-signed
> Supabase tokens (ADR 0002). Like `apps/api` and `apps/coach`, it imports
> `packages/services` and connects with its own `fitme_mcp` login through `withUser`
> after verifying the Clerk OAuth token. The idea of MCP calling `apps/api` over HTTP is
> superseded. A draft replacement ADR is in
> [remove-rpcs-business-layer.md §9.6](./remove-rpcs-business-layer.md).

This is in its own note:
[remove-rpcs-business-layer.md](./remove-rpcs-business-layer.md). It covers:

- The inventory of all 12 database functions, with callers and locks.
- Drizzle over the Supavisor transaction pooler.
- RLS kept through `SET LOCAL ROLE` + `request.jwt.claims` inside each transaction.
- SQL migrations staying the source of truth, with `drizzle-kit pull`.
- `packages/db` + `packages/services` shared by `apps/api` and `apps/mcp`.
- Public-API readiness and the migration order.

## 9. Webhooks: separate Hono app vs a sub-app of `apps/api`

| | Sub-app in `apps/api` (`/webhooks/*`) | Separate app (`apps/webhooks`, own Vercel project) |
|---|---|---|
| Service-role key | Lives in the project that also serves mobile, MCP-adjacent and public `/v1` traffic. Any route bug can reach it | Only the webhook project holds it. Vercel env vars are per project unless declared at team level ([env vars](https://vercel.com/docs/environment-variables)) |
| With the Drizzle plan (§8) | `apps/api` would hold a Postgres login anyway, so the extra isolation is smaller | Still isolates the *admin* path (`delete_user_data`, `withService`) from the user path |
| Deploy / domain | None extra | One more Vercel project and domain (for example `hooks.fitmeproject.com`). Same tsdown + Hono preset as `apps/api`/`apps/mcp` |
| Raw-body verification | Same in both. Pass `c.req.raw` to `verifyWebhook` **before** any body read. Hono's `c.req.text()`/`arrayBuffer()` give the bytes for RevenueCat HMAC ([Hono request](https://hono.dev/docs/api/request)). Svix: "You need to use the raw request body" ([Svix](https://docs.svix.com/receiving/verifying-payloads/how)). Keep validators and body-parsing middleware off these routes | Same |
| Retries / idempotency | Same in both. Clerk/Svix retries non-2xx at 5 s … 10 h ([Svix retries](https://docs.svix.com/retries)), and `delete_user_data` is already idempotent. RevenueCat retries 5 times and only 200 counts ([RevenueCat](https://www.revenuecat.com/docs/integrations/webhooks)). Dedupe on `svix-id`: the Standard Webhooks spec says the id "remains the same no matter how many times a webhook that has failed is retried" and recommends it "as an idempotency key" ([spec](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md)). RevenueCat's event `id`: "Retries reuse the same `id`" ([fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)). RevenueCat doesn't explicitly call it an idempotency key, but it's usable as one | Same |
| Observability | Shared logs and Sentry project; webhook failures mix with API errors | Own logs, alerts and Sentry tag. A failed account cleanup is a compliance-relevant alert |
| Preview deploys | Previews are SSO-protected (`all_except_custom_domains`), so Clerk/RevenueCat test endpoints need a protection bypass either way | Same |
| Rate limiting / WAF | Shared rules with the public API | Separate rules (for example allowlist-free, high limits) |

**Recommendation: a separate `apps/webhooks` Hono app** (its own Vercel project, `cle1`):

- It is the only place with service-role or admin DB credentials.
- It is a thin layer over `packages/services`/`packages/db`
  (`withService(... delete_user_data ...)`).
- It costs one more small project with the same build pattern, and keeps the public API
  project free of admin keys.

If you'd rather not run another project yet, a `/webhooks` sub-app in `apps/api` is
acceptable short term. Split it out before the public API launches.

## 10. Agent on EVE (decision, 2026-10-14)

**Decision.** The coach agent (today's `ai-agent` edge function) moves to its own app,
**`apps/coach`**, built with Vercel's EVE agent framework (`eve`), with `ai` on the
latest major. This supersedes "`ai-agent` → `apps/api`" (§4.5) and the plain-function
and Workflow recommendation in §7.

Sources:

- The docs shipped inside **eve@0.79.0** (`node_modules/eve/docs/`), cited as
  `eve@0.79.0 docs/<file>`. I read them from a scratch install outside the repo and
  executed nothing from the package.
- A scratch `npx eve@0.79.0 init coach -n`, run outside the repo, for the scaffold.

### 10.1 What EVE is

- **"A filesystem-first framework for durable backend agents"**
  (`eve@0.79.0 docs/README.md`). An agent is a directory, `agent/`:
  - `instructions.md` (or `.ts`)
  - `tools/` (typed tools; filename = tool name)
  - `skills/` (procedures loaded on demand)
  - `connections/` (MCP or OpenAPI services)
  - `channels/` (HTTP, Slack, …)
  - `subagents/`
  - `schedules/`
  - `hooks/` (stream-event observers)
  - `lib/`
  - `sandbox/`
  - `agent.ts` (`defineAgent`: model, limits, …)

  What you get: "a stable HTTP message route", "a reconnectable session stream",
  "durable session state across turns", and a per-agent sandbox (same README;
  `docs/concepts/project-structure.mdx`).
- **Relation to Workflow and the AI SDK.**
  - On Vercel, "Vercel Workflow persists and resumes durable runs", and Cron runs the
    schedules (`docs/guides/deployment/vercel.mdx`).
  - A crash, timeout or redeploy resumes "from the last completed step". Completed
    steps never re-run, and each durable step runs "up to four times"
    (`docs/concepts/execution-model-and-durability.mdx`,
    `docs/concepts/sessions-runs-and-streaming.md`).
  - `eve@0.79.0` has **peer dependency `ai ^7.0.137`** and depends on
    `nitro 3.0.260903-beta` (its `package.json`). The repo's `ai@6.0.176`
    (`apps/mobile/package.json:57`) is a major behind.
- **Maturity.** It is **not GA**: "eve is in preview; the framework, APIs,
  documentation, and behavior may change before general availability"
  (`docs/README.md`). The version is 0.x and moves fast; 0.78.0 fixed an approval
  privilege-escalation bug (`CHANGELOG.md`). Agent Runs is Beta
  (`docs/guides/instrumentation/agent-runs.mdx`).
- **Scaffold** (`eve init coach -n`):
  - Files: `agent/agent.ts` (`model: "openai/gpt-6-luna-fast"`, `reasoning: "high"`),
    `agent/channels/eve.ts` (auth `[vercelOidc(), localDev(), placeholderAuth()]`),
    `agent/instructions.md`, `AGENTS.md`/`CLAUDE.md`, and a `tsconfig.json`.
  - `package.json`: `"imports": { "#*": "./agent/*" }`; scripts `eve dev/build/deploy/eval/start`;
    deps `eve ^0.79.0`, `ai ^7.0.137`, `zod 4.5.4`, `@vercel/connect`; dev deps
    TypeScript `7.0.2`, `engines.node 24.x`.
  - The repo pins `zod 3.25.76` and `typescript ~5.9.2`. Tools accept any Standard
    Schema (`docs/tools/overview.mdx`), so mixing versions is allowed, but
    `apps/coach` would carry its own versions.
- **Build and deploy.**
  - `eve build` / `eve deploy`, or push to a Git-connected Vercel project. On Vercel the
    output goes to `.vercel/output`. `eve link` creates or links the project
    (`docs/guides/deployment/vercel.mdx`).
  - One root agent per app. Several agents in one project would use the
    `agents/<name>/agent/` workspace layout (`docs/concepts/project-structure.mdx`).
  - So it is **its own Vercel project** (for example `fitme-coach`,
    `coach.fitmeproject.com`, region `cle1` next to the Supabase project).
- **Monorepo.**
  - The docs show an agent as its own pnpm workspace member with its own
    `package.json` consuming `workspace:*` packages. That example is for eve
    *extensions*, which `eve build` compiles from source (`docs/extensions.md`, "Use an
    extension in a workspace"). "Use separate packages or projects when agents need
    independent dependencies or releases, even within the same monorepo"
    (`docs/concepts/project-structure.mdx`).
  - `apps/coach` with `"@fitme/core": "workspace:*"` fits pnpm. Whether eve's compiler
    bundles **source-only** TypeScript workspace packages (`@fitme/*` ship `.ts`, no
    build) is not documented **(unverified)**; test it first.
  - Fallback if it doesn't: package the shared code as an eve extension, or give
    `@fitme/core` a build.
  - Turborepo just runs `apps/coach`'s `build`/`typecheck` scripts.

### 10.2 Serving chat to the mobile app

- **The default HTTP channel** is `/eve/v1`, defined by `agent/channels/eve.ts`. It
  exposes:
  - `POST /eve/v1/session` (create, optionally with the first message)
  - `POST /eve/v1/session/:id` (follow-up)
  - `…/cancel`, `/clear`, `/compact`, `/reset`
  - `GET /eve/v1/session/:id/stream`, as **NDJSON eve events**

  Source: `docs/channels/eve.mdx`.
- **It is not the AI SDK UI message stream.**
  - The React hook is `useEveAgent` from `eve/react`, not `useChat`. Its
    `data.messages` are `EveMessage[]`: "Common text, reasoning, file, and dynamic-tool
    parts follow the AI SDK `UIMessage` rendering convention, but the types are not
    interchangeable … Adapt those parts before passing messages to an API typed as
    `UIMessage[]`" (`docs/guides/frontend/overview.mdx`).
  - The docs never mention `useChat`, `ChatTransport` or React Native.
  - **Today's client (`useChat` + `AssistantChatTransport` + `@assistant-ui/react-native`,
    `apps/mobile/app/(tabs)/coach/index.tsx:38-47`) can't point at EVE unchanged.**
- **Reconnect.** Built in. The stream is durable and indexed: `GET …/stream?startIndex=n`.
  The client "reconnects from the number of events already consumed", and the hook
  resumes after a disconnect or the 60-second server lease (`docs/guides/client/streaming.mdx`,
  `docs/guides/frontend/overview.mdx`). Turns keep running server-side when the
  client goes away; cancelling is an explicit `POST …/cancel`.
- **Expo / React Native.**
  - `eve/client` has no option to inject a custom `fetch`. `ClientOptions` has `host`,
    `auth`, `headers` and `redirect` (`dist/src/client/types.d.ts`), so it uses the
    global `fetch`.
  - The app uses `expo/fetch` for streaming bodies (`coach/index.tsx:42`). The global
    RN `fetch` doesn't stream response bodies **(unverified for the current RN
    version)**.
  - So `eve/react` / `eve/client` in Expo is **unverified** and probably needs
    `globalThis.fetch = expoFetch` or a custom client.
- **Two ways to keep the app's chat UI:**
  1. **Recommended: a custom channel that speaks the AI SDK UI message stream.**
     - Add `agent/channels/mobile.ts` with `defineChannel`.
     - `POST /mobile/chat`: run Clerk route auth, then `from(<thread id>).send(message, { auth })`.
       Return a `Response` that pipes `attachSession(id).getEventStream()` through
       *our* NDJSON → UI-message-chunk transform (`createUIMessageStream` from `ai@7`).
     - `GET /mobile/chat/:sessionId/stream?startIndex=…` for reconnect.
     - Custom channels support exactly these primitives: `routes`, `from(...)`,
       `attachSession(...).getEventStream()` (`docs/channels/custom.mdx`).
     - The app keeps `useChat` (AI SDK 7) and assistant-ui. It only needs the URL and a
       resume hook.
     - The transform is our code to write and test. It has to cover text, reasoning
       and tool parts (`display_workout_plan`'s output drives a plan card), and a retried
       step can re-emit events (`docs/concepts/sessions-runs-and-streaming.md`).
  2. **Move the app to assistant-ui's EVE runtime.** assistant-ui ships one:
     `@assistant-ui/eve`, whose `useEveAgentRuntime()` "wraps Eve's `useEveAgent` hook as
     an assistant-ui `ExternalStoreRuntime`"
     ([assistant-ui docs](https://www.assistant-ui.com/docs/runtimes/eve/overview.md)).
     - No adapter server code: the app talks to the stock `/eve/v1` channel. A custom
       `agent/channels/eve.ts` still has to put Clerk auth on it, since "Eve's built-in
       `eve` channel doesn't admit browser users in production" (same page).
     - Resume without Assistant Cloud: persist `useEveSession()` and pass it back as
       `initialSession` with `resume: true` (same page). Assistant Cloud is optional.
     - `runConfig.custom` is forwarded to EVE as `clientContext` (JSON only, no
       secrets), which could carry today's per-message `model` choice.
     - Ask-question pauses map onto assistant-ui tool approvals.
     - **React Native fit.** The docs only show web/Next (`withEve()` from `eve/next`).
       But `@assistant-ui/eve@0.0.24` depends on `@assistant-ui/core ^0.3.26` and
       `@assistant-ui/store`, with peers `eve >=0.32.0` and `react`. It does not depend
       on `@assistant-ui/react` (npm registry, `npm view @assistant-ui/eve`).
       `@assistant-ui/react-native@0.1.47` sits on the same `@assistant-ui/core ^0.3.25`.
       The app is on `@assistant-ui/react-native 0.1.15` (core `^0.2.0`), so it needs
       that upgrade first.
     - Still **unverified**: the streaming `fetch` problem above, because it wraps
       `eve/react`, and `@assistant-ui/eve` is 0.0.x.
     - Cost: the chat screen moves off `useChat` + `AssistantChatTransport`
       (`coach/index.tsx:38-47`) to the EVE runtime, and the custom components in
       `@/components/chat` that read `useChat` state need re-wiring.

  **Updated recommendation:** go with option 2 (`@assistant-ui/eve`) if a spike shows it
  streams in Expo, probably with `globalThis.fetch = expoFetch` set before the client
  loads. It drops the NDJSON → UI-stream transform, which was the riskiest code in
  option 1. Keep option 1 as the fallback if RN streaming can't be made to work.

### 10.3 Auth

- Route auth lives on the channel. It is an ordered `auth` walk of `AuthFn`s that
  return a `SessionAuthContext` (`principalId`, `principalType`, `authenticator`,
  `attributes`), return `null` to skip, or throw `UnauthenticatedError` /
  `ForbiddenError`. "Custom `AuthFn` entries are first-class". The scaffold's
  `placeholderAuth()` rejects production traffic until it's replaced
  (`docs/guides/auth-and-route-protection.md`).
- **Clerk.**
  - A custom `AuthFn`: `extractBearerToken(...)` → `verifyToken(token, { jwtKey: CLERK_JWT_KEY })`
    from `@clerk/backend` (networkless, as in today's `_shared/clerk-auth.ts:77-81`) →
    `{ principalId: sub, principalType: "user", authenticator: "clerk" }`.
  - Order: `[clerkAuth(), localDev()]`. Drop `vercelOidc()` unless something
    Vercel-hosted calls the agent. `localDev()` only admits requests under `eve dev` or
    `vercel dev`.
  - On the custom mobile channel, call `routeAuth(request, auth)` to reuse the same walk.
- **User id into tools.** Tools read `ctx.session.auth.current?.principalId`, the
  caller of the active turn, and pass it to `withUser` (per-app-login design,
  [remove-rpcs-business-layer.md §9](./remove-rpcs-business-layer.md)) (`docs/guides/session-context.md`). That comes only from
  route auth, never from model input. Tools must **never** take a user id in their
  input schema, the same rule as MCP (AGENTS.md).
- **Model choice.** Today the client sends `model`. In EVE use `defineDynamic` on
  `turn.started` (`docs/agent-config.md`, "Choose the model dynamically"), reading an
  allowlisted value. Validate it against `coachModels` in `@fitme/core` and put it in
  `attributes` during route auth, or read it from `clientContext`. That design is mine,
  not from the docs.
- **Provider identity.** eve fills OpenAI's `safetyIdentifier` / Anthropic's
  `metadata.userId` with a SHA-256 fingerprint of the principal
  (`docs/agent-config.md`).

### 10.4 Tools and data

- **Definition.** Each tool is `agent/tools/<name>.ts` exporting
  `defineTool({ description, inputSchema, outputSchema?, execute(input, ctx) })`.
  - Tools run "in your app runtime with full access to `process.env`, not in the
    sandbox" (`docs/tools/overview.mdx`).
  - Set **`defaultTools: false`** in `agent.ts` to remove the optional built-ins (`bash`,
    file tools, web fetch/search). A fitness coach must not have a shell
    (`docs/concepts/built-in-tools.md`). Without the shell, nothing opens the sandbox
    (`docs/concepts/execution-model-and-durability.mdx`).
- **How tools reach the data.**

  | | Call `apps/api` over HTTP | Import a shared services package (`packages/services`) |
  |---|---|---|
  | Credentials in the coach app | A service credential for `apps/api` only. No DB, no service-role | A Postgres login that can `SET ROLE authenticated` (the Drizzle plan), or the anon key + a token signer (ADR 0002 style) |
  | RLS | Intact: `apps/api` runs `withUser(userId)` | Intact only if the coach also uses `withUser` |
  | **Forwarding the user's Clerk token** | **Doesn't work for long turns.** Clerk session tokens live **60 s** and the client SDK refreshes them ([How Clerk works](https://clerk.com/docs/guides/how-clerk-works/overview)). A durable turn can run, park or retry for minutes, and persisting the token in session state would be worse. Use a **service identity + asserted user id** instead (below) | n/a |
  | One implementation | Yes: mobile, MCP, public API and coach all hit the same services through `apps/api` | Yes, in-process |
  | Latency | +1 hop per tool call (coach `cle1` → api `cle1`) | None |
  | Coupling | Coach deploys independently; the API contract is the boundary | Coach rebuilds on every services change |

  ~~**Recommendation: HTTP to `apps/api`, using a service identity**~~ (Vercel OIDC +
  `x-fitme-user`). **Superseded (2026-10-14)** by the per-app-login design in
  [remove-rpcs-business-layer.md §9](./remove-rpcs-business-layer.md#9-auth-architecture-per-app-logins-ownership-enforced-in-postgres):
  - The coach imports `packages/services` → `packages/db` and connects through the
    Supavisor transaction pooler with its own login, `fitme_coach`.
    `fitme_coach` is `NOINHERIT`, a member of `authenticated` only, with no BYPASSRLS and
    no admin functions.
  - Tools call `withUser(ctx.session.auth.current.principalId, tx => services.…)`. The
    principal was set once by the Clerk check at the channel.
  - No token is forwarded, so the 60 s token lifetime is irrelevant, and there's no
    internal HTTP hop.
  - RLS, `current_user_id()` and the retired-id triggers enforce ownership. That was
    verified on a throwaway local stack, including 300 concurrent transactions with no
    leaks (§9.3 there).
  - Trade-off: a leaked `fitme_coach` login can act as any User within RLS, the same
    blast radius as today's MCP signing key. It can't bypass RLS or delete accounts.
  - The coach must never run session-level `SET ROLE` / `set_config(…, false)`. In
    transaction pooling that leaks to other requests (measured).
- **Mapping today's 14 tools (`ai-agent/index.ts:57-72`) to `agent/tools/*.ts`.** Each
  becomes a thin `defineTool` calling one function in `packages/services` inside
  `withUser`. The "route" column is the matching `apps/api` route that mobile, MCP and the
  public API would use for the same service, not something the coach calls:

  | Today | EVE tool | `apps/api` route (sketch) | Notes |
  |---|---|---|---|
  | `get_user_profile` | `get_user_profile.ts` | `GET /internal/profile` | read |
  | `update_user_profile` | `update_user_profile.ts` | `PATCH /internal/profile` | consider `approval` |
  | `get_plans` / `get_active_plan` | same names | `GET /internal/plans`, `…/plans/active` | read |
  | `activate_plan` | same | `POST /internal/plans/:id/activate` | today calls the `activate_plan` RPC |
  | `search_exercises` | same | `GET /internal/exercises?q=` | read |
  | `get_workouts_history` | same | `GET /internal/sessions?finished=true` | read |
  | `add_exercise_to_workout`, `remove_exercise_from_workout`, `replace_exercise_in_workout`, `add_set_to_exercise`, `remove_set_from_exercise`, `update_set_recommendations` | same names | `POST/PATCH/DELETE /internal/workouts/:id/…` | today **non-atomic** multi-call (`replace_exercise_in_workout.ts:28-54`). Make each one transaction in `packages/services` |
  | `display_workout_plan` | same | none (pure, no I/O) | its output is what the app renders as a plan card; the stream transform (§10.2) must keep the tool part |

  The instructions string (`ai-agent/index.ts:75-103`) becomes `agent/instructions.md`.

### 10.5 Limits and cost

- **Per step vs per run.**
  - EVE runs on Vercel Workflow. "Maximum run duration: No limit", and each step is
    bound by the function limit, so 300 s on Hobby and up to 800 s on Pro
    ([Workflow limits](https://vercel.com/docs/workflows/pricing),
    [function limits](https://vercel.com/docs/functions/limitations)).
  - By default one Workflow step holds one model call
    (`experimental.workflow.modelCallsPerStep`, default `1`, `docs/agent-config.md`).
    So each LLM call plus its inline tools must fit the step limit; the whole turn
    needn't.
- **Step caps and budgets.**
  - The docs don't describe a fixed tool-loop step cap like `ToolLoopAgent`'s 20.
    Limits are token-based: `limits.maxInputTokensPerSession` (default 40,000,000 for
    root sessions), `maxOutputTokensPerSession`, `maxTokenCostUsdPerSession`, and
    `sessionTimeoutMs` (default 30 days) (`docs/agent-config.md`).
  - Set a cost cap per session.
  - Whether there's an unlisted per-turn step cap is **(unverified)**.
- **Retries.** Each durable step runs up to 4 times. An interrupted step re-runs, so
  "make non-idempotent side effects … idempotent". Retries re-emit stream events under
  new ids (`docs/concepts/execution-model-and-durability.mdx`,
  `docs/concepts/sessions-runs-and-streaming.md`). Plan-edit routes should accept an
  idempotency key, for example the tool `callId`.
- **Plan.** Hobby's 300 s per step is probably enough for one model call. Hobby is
  "personal, non-commercial" though ([pricing](https://vercel.com/pricing)), so Pro is
  the realistic plan (800 s per step).
- **Cost components** (no measured numbers):
  - Function active CPU + provisioned memory ([Fluid pricing](https://vercel.com/docs/functions/usage-and-pricing)).
  - Workflow events ($0.02 per 1k), data written ($0.50 per GB) and retained
    ($0.50 per GB-month), plus Queues ([Workflow pricing](https://vercel.com/docs/workflows/pricing)).
  - Agent Runs at Always-on Tracing rates during beta (`docs/guides/instrumentation/agent-runs.mdx`).
  - Models: a string id routes through **AI Gateway**, authenticated by project OIDC.
    `eve/models/openai` / `anthropic` call providers directly with `OPENAI_API_KEY` /
    `ANTHROPIC_API_KEY` (`docs/agent-config.md`, `docs/guides/deployment/vercel.mdx`).
    Keep direct keys to match today, or move to Gateway for the per-session cost caps,
    which use Gateway-reported cost.
- **Data retention and account deletion.**
  - Run data (model and tool payloads, streamed output, event log) is kept per the
    World's (Vercel plan's) retention. `experimental.workflow.retention: 0` deletes it
    when the run ends, but then transcripts become unreadable (`docs/agent-config.md`).
  - Sessions persist chat **server-side** (30-day default timeout). That's new: today
    nothing is stored. So `delete_user_data` no longer covers all of a User's data.
  - Decide retention, and on `user.deleted` reset the User's sessions.
  - **eve has no documented API to list or delete sessions by user** (searched the
    eve@0.79.0 docs). "Expiration does not delete stored session data"
    (`docs/agent-config.md`). Data goes only by World/plan retention, or immediately
    with `experimental.workflow.retention: 0`. `sessions` from `eve/server` reads a
    session by id (`docs/concepts/execution-model-and-durability.mdx`).
  - Workaround (my design):
    - A hook on `session.started` records `(principalId, sessionId)` in our database.
    - The `user.deleted` webhook resets those sessions through the channel's `reset`
      route and deletes the rows.
    - Rely on plan retention (7 days on Pro, [Workflow retention](https://vercel.com/docs/workflows/pricing))
      for the stored run data.

### 10.6 Observability

- **Agent Runs** (Vercel Observability, Beta): browse sessions and traces. `eve deploy`
  turns on 100% trace sampling for new projects; existing projects need a sampling rule.
  It is 30-day retention during beta. Configure or disable it in
  `agent/instrumentation/agent-runs.ts` (`docs/guides/instrumentation/agent-runs.mdx`).
- **OpenTelemetry export** via `eve/instrumentation/otel`
  (`docs/guides/instrumentation/otel.mdx`).
- **Sentry.** Not mentioned in the eve docs. Options:
  - A hook in `agent/hooks/sentry.ts` on `turn.failed` / `step.failed` / `session.failed`
    that calls `@sentry/node` `captureException` (`docs/guides/hooks.md`; hooks are
    observe-only).
  - Point the OTel export at Sentry's OTLP endpoint **(unverified)**.
- Local dev writes traces to `.eve/traces/` (`docs/reference/cli.md`).

### 10.7 Testing and local dev

- **Local.** `pnpm --filter @fitme/coach dev` → `eve dev` (TUI and local server).
  `.env.local` is loaded automatically, and `localDev()` admits requests only under
  `eve dev` (`docs/reference/cli.md`, `docs/guides/auth-and-route-protection.md`).
  Run `pnpm db start` + `pnpm dev:api`, and point the coach's API base URL at
  `http://localhost:3003`. The local Supabase stack sits behind `apps/api`, so the coach
  never talks to it directly.
- **Unit tests.**
  - Keep the logic of each tool in plain functions (an API client plus mapping) and test
    them with vitest, like `apps/mcp`. Keep `defineTool` wrappers thin.
  - The docs don't describe calling `execute(input, ctx)` with a fake `ctx`
    **(unverified)**.
  - `apps/api`'s service routes get integration tests against the local stack.
- **Behaviour tests.** `eve eval` with `defineEval` plus **tool stubs**, which replace
  tool executions with canned JSON locally or against a deployment
  (`docs/evals/overview.mdx`, `docs/evals/tool-stubs.mdx`).
  - Good for "never invents exercise ids" and "calls get_active_plan before editing".
  - Needs real model calls, so run it in a separate CI job with keys, not in unit tests.
- **The stream transform (§10.2)** gets plain unit tests on recorded NDJSON fixtures,
  including a retried step.

### 10.8 Migration path

1. **`packages/db` + `packages/services` first.**
   - `withUser`, plan-edit services that are atomic and take idempotency keys.
   - A `fitme_coach` login (§10.4, per-app-login design).
   - No internal routes and no OIDC trust (superseded).
2. **Create `apps/coach`.**
   - `eve init` in the repo, as a pnpm member: `package.json` name `@fitme/coach`, deps
     `eve`, `ai@^7`, `@clerk/backend`, `@sentry/node`.
   - `agent.ts` with `defaultTools: false`, direct or Gateway models, `limits`, and a
     dynamic model.
   - Instructions, 14 tools, `channels/eve.ts` with Clerk auth, `hooks/sentry.ts`, and
     evals. Add `channels/mobile.ts` with the UI-stream adapter only if the
     `@assistant-ui/eve` spike fails (§10.2, option 1).
   - `eve link` → Vercel project `fitme-coach`, region `cle1`, domain
     `coach.fitmeproject.com`. Env: `CLERK_JWT_KEY`, `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`
     (or Gateway), `DATABASE_URL` (the `fitme_coach` login on the pooler), `SENTRY_DSN`.
3. **Mobile.**
   - Upgrade `@assistant-ui/react-native` (0.1.15 → a `@assistant-ui/core ^0.3` line)
     and add `eve` + `@assistant-ui/eve`. Make the global `fetch` stream (expo/fetch)
     **(unverified in RN)**.
   - Add `EXPO_PUBLIC_COACH_URL`.
   - Swap `useChat` + `AssistantChatTransport` for `useEveAgentRuntime()` and persist
     the session for resume. Fallback: keep `useChat` (AI SDK 7) against
     `…/mobile/chat`.
   - Release.
4. **Keep the Supabase `ai-agent` deployed** until installed builds that call
   `/functions/v1/ai-agent` have drained, then delete it (`supabase functions delete ai-agent`).
5. **CI.**
   - Add `apps/coach` to `turbo` `build`/`typecheck`/`test` (it has its own scripts).
   - Add an optional `eve eval` job with model keys.
   - Once all edge functions are gone, drop `_shared/clerk-auth.ts`, the
     `test:functions` script and the Deno step in `unit-tests.yml:29-34`.
   - `e2e.yml`'s `CLERK_JWT_KEY` / `preview-plan` steps go with `preview-plan` (§4).
   - Preview deployments of `fitme-coach` are behind Vercel auth, like the other
     projects, so E2E against a preview needs a bypass.
6. **AGENTS.md.**
   - Add `apps/coach  @fitme/coach — EVE coach agent` to the Monorepo list and a
     `pnpm dev:coach` command.
   - Add an `apps/coach` architecture section: filesystem layout, Clerk route auth,
     tools via `apps/api` with a service identity, the never-take-user-id-as-input
     rule, and `defaultTools: false`.
   - Add its env vars.
   - Remove `ai-agent` from the Edge Functions list and the `withClerkUser` paragraph,
     and update the `coachModels` note in `packages/core/src/models.ts:205`.

**`apps/coach` layout sketch:**

```
apps/coach/
├── package.json            # @fitme/coach; eve, ai@^7, @clerk/backend, @sentry/node, zod
├── tsconfig.json
├── .env.local              # local only (eve dev loads it)
├── agent/
│   ├── agent.ts            # defineAgent({ model: defineDynamic(...), defaultTools: false, limits })
│   ├── instructions.md     # today's prompt (ai-agent/index.ts:75-103)
│   ├── channels/
│   │   ├── eve.ts          # eveChannel({ auth: [clerkAuth(), localDev()] })
│   │   └── mobile.ts       # fallback only: POST /mobile/chat + GET stream → AI SDK UI message stream
│   ├── tools/              # 14 thin defineTool wrappers → withUser + packages/services
│   ├── hooks/sentry.ts     # turn/step/session.failed → Sentry
│   ├── instrumentation/agent-runs.ts   # optional export policy
│   └── lib/
│       ├── clerk-auth.ts   # AuthFn: verifyToken(jwtKey) → principalId
│       ├── db.ts           # re-export withUser from packages/db (fitme_coach login)
│       └── ui-stream.ts    # fallback only: eve NDJSON events → UI message chunks
└── evals/                  # eve eval cases with tool stubs
```

**Recommendation.** EVE is a reasonable home for the coach. It brings durable turns,
built-in resume, Agent Runs and evals, and it keeps us on Vercel. But it's a
**preview, 0.x framework that forces `ai@7`**, and its native stream is not `useChat`.

Do it as above:

- Tools call `packages/services` inside `withUser(principalId)` over the coach's own
  least-privilege login. They never forward a Clerk token. *(The earlier "HTTP to
  `apps/api` with a service identity" is superseded.)*
- On mobile, use assistant-ui's own EVE runtime (`@assistant-ui/eve`) against the stock
  channel, once a spike proves it streams in Expo. Fall back to a thin `mobile` channel
  that emits the AI SDK UI message stream (the app keeps `useChat`) only if it doesn't.
- Pin `eve` exactly and read its CHANGELOG on every bump.
- Decide on chat retention and deletion before launch, because EVE stores
  conversations server-side.

**Unverified items for §10** are in the consolidated list below.

## Still unverified (consolidated)

**Platform and account facts:**
1. Vercel team plan (Hobby vs Pro), and the Supabase project plan.
2. Current function region of `fitme-api` / `fitme-mcp` (dashboard).
3. Production deploy mechanism for Supabase functions.
4. Whether `v1.23.0` shipped. How many installed builds still call `delete-user` /
   `ai-agent` / the RPCs (drain windows).
5. Real `ai-agent` turn durations (no logs queried). No cost or latency numbers were
   measured anywhere.

**EVE (§10):**
6. Bundling source-only `@fitme/*` packages.
7. `eve/client` / `eve/react` under Expo `fetch` (no custom-fetch option).
8. `@assistant-ui/eve` and assistant-ui on AI SDK 7 under React Native.
9. An unlisted per-turn step cap.
10. Calling a tool's `execute` directly in unit tests.
11. Sentry via OTLP export.
12. Whether `AIChatAgent` (Cloudflare, §6) uses WebSocket hibernation by default, and
    whether wrangler resolves source-only workspace packages.

**Workflow (§7):**
13. `WorkflowAgent`'s `ai` peer version.
14. `WorkflowChatTransport` under Expo.

**Database and auth:** in
[remove-rpcs-business-layer.md "Still unverified"](./remove-rpcs-business-layer.md#still-unverified-consolidated):
- Hosted custom logins through Supavisor.
- Hosted reset behaviour between clients.
- Pool accounting with several logins.
- The postgres.js hang on hosted.
- `drizzle-kit pull` stability.
- Clerk API-key latency.

**Closed since earlier drafts:**
- `attachDatabasePool` doesn't support postgres.js.
- Clerk API keys need a Backend API call per verification.
- `onConflictDoNothing({ target, where })` supports partial indexes.
- `svix-id` / `webhook-id` is the spec's idempotency key, and RevenueCat retries reuse
  the event `id`.
- eve has no documented session list/delete API (workaround in §10.5).
- Vercel OIDC verification inside `apps/api` is no longer needed (HTTP hop superseded).
