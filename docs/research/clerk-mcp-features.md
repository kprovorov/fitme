# Should `apps/mcp` move onto Clerk's new MCP features?

Research note, 2026-10-24. Question: Clerk recently shipped features aimed at MCP servers.
Is it worth refactoring our MCP server (`apps/mcp`) onto them?

Repo facts are cited as `path:line`. Package facts come from the installed packages
(`node_modules/...`) or the published tarballs (`@clerk/mcp-tools@0.7.0`, fetched with
`npm pack`). Live Clerk settings come from read-only calls to Clerk's MCP server
(`check_mcp_server`, `list_applications`) and the public `.well-known` documents, read on
2026-10-24. External claims link to the primary source. Anything I couldn't check against a
primary source is marked **(unverified)**.

## TL;DR

- **"The MCP feature" is really several things.** Over the last four months Clerk shipped
  Client ID Metadata Documents (CIMD), custom OAuth scopes, default scopes for dynamic
  clients, a custom consent page, the Device Authorization Grant, an `aud` claim on OAuth
  access tokens (RFC 8707), "MCP server" registration on an instance, and, yesterday
  (2026-10-23), an agent feedback tool in `@clerk/mcp-tools@0.7.0`. Most of these are
  settings on the authorization server, not code. None of them replaces our Hono auth chain.
- **We're out of spec on a MUST today, and Clerk now lets us fix it.** The MCP authorization
  spec says servers MUST check that a token was issued for them (the audience), and has said
  so since 2025-06-18. We don't check it (`AGENTS.md:226`: "No audience check (Clerk OAuth
  tokens have no `aud`)"), and right now we can't: `aud_claim_enabled` is `false` on both
  Fitme instances. Clerk can now put `aud` on OAuth tokens, and `@clerk/backend` (from
  3.19.0, we're on 3.25.0) checks it when given an `audience`.
- **CIMD is already on in production. No code involved.** Production advertises
  `client_id_metadata_document_supported: true` and admits any CIMD client. DCR is off. So
  any CIMD-capable client can already connect without being registered first. Which
  clients (Claude, ChatGPT, Cursor, …) actually implement CIMD is **(unverified)**. The
  flip side: a client that only does DCR can't connect to production at all unless we
  register it in advance. Clerk's advice is to "Enable **Publish DCR support** only if the
  client doesn't support CIMD and requires DCR"
  ([guide](https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server.md)).
  Development only admits clients registered in advance.
- **Recommendation: partial adoption, not a refactor.** In this order:
  1. **Audience binding** (small: about half a day of code plus a careful rollout). Register
     `https://mcp.fitmeproject.com/` as the MCP server on each instance, turn on `aud`, and
     pass `audience` to `clerkMiddleware`. Then assert `aud` in the OAuth integration suite.
     This closes the spec gap.
  2. **Custom `read` / `write` scopes** (medium: 1 to 2 days, plus an ADR 0011 update).
     These map straight onto the permissions the Public API already declares. Optional for
     now, since every tool's User can do both anyway.
  3. **`submit_feedback` tool** (small: about 2 hours). Optional, and it waits on a privacy
     decision, because reports carry the User's Clerk id and the agent's summary of what the
     User asked for (fitness and health context) to Clerk.
  4. **Don't** replace our auth chain with `mcpAuthClerk`. It answers worse 401s and ignores
     `MCP_PUBLIC_URL`, and it adds no audience or scope checks.
- **Stale docs to fix whatever we decide:** `AGENTS.md:226` ("Clerk OAuth tokens have no
  `aud`", "no custom scopes") and ADR 0011's "Clerk OAuth tokens can't carry custom scopes"
  (`docs/adr/0011-one-public-api-every-credential-through-clerk.md:19`). Both have been
  false since August/September 2026.

## 1. What Clerk shipped (dated)

| Date | Feature | What it is | Source |
| --- | --- | --- | --- |
| 2026-04-17 | API keys GA | User-scoped API keys, billed per creation and verification | [changelog](https://clerk.com/changelog/2026-04-17-api-keys-ga) |
| 2026-05-14/20 | Organizations in OAuth | `user:org:read` scope, `org_id` claim | [changelog](https://clerk.com/changelog/2026-05-14-oauth-organizations) |
| 2026-06-22 | Custom consent page | `<OAuthConsent />` lets you host the consent screen on your own domain | [changelog](https://clerk.com/changelog/2026-06-22-customize-oauth-consent) |
| 2026-07-22 | Default scopes for dynamic clients | Scopes applied when a DCR or CIMD client omits `scope` ("ChatGPT and Claude may omit") | [changelog](https://clerk.com/changelog/2026-07-22-oauth-dcr-default-scopes), [docs](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth.md) |
| 2026-08-06 | CIMD (beta) | An HTTPS URL as `client_id`; admission controls (explicitly allow, review, block) | [changelog](https://clerk.com/changelog/2026-08-06-client-id-metadata-documents) |
| 2026-08-21 | Custom OAuth scopes | Defined in the Dashboard **Scopes** tab, assigned per OAuth app, optionally advertised in AS metadata "so MCP clients can discover them" | [changelog](https://clerk.com/changelog/2026-08-21-custom-oauth-scopes), [docs](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth.md#custom-scopes) |
| 2026-09-08 | Device Authorization Grant | RFC 8628, for CLIs and TVs | [changelog](https://clerk.com/changelog/2026-09-08-device-authorization-grant) |
| between 2026-08-14 and 2026-09-09 | `aud` claim settings in the Backend API | `aud_claim_enabled` ("OAuth access tokens can include an aud claim derived from the RFC 8707 resource parameter") and `aud_claim_refresh_backfill_enabled` on `PATCH /instance/oauth_application_settings` | [BAPI spec `2026-08-20.yml`](https://github.com/clerk/openapi-specs/blob/main/bapi/2026-08-20.yml); the field first appears in `bapi/2026-05-12.yml` at commit `5db39838c7` (2026-09-09) and is missing at `81dd1c54dc` (2026-08-14) |
| 2026-09-17 | CIMD GA | Off by default; **Publish CIMD support** under Client onboarding | [changelog](https://clerk.com/changelog/2026-09-17-client-id-metadata-documents-ga) |
| 2026-09-23 | `@clerk/backend@3.19.0` | OAuth token verification now really checks `audience` (it used to pass falsely). Adds `audience` to `idPOAuthAccessToken.verify()` and exposes `aud` | [CHANGELOG](https://github.com/clerk/javascript/blob/main/packages/backend/CHANGELOG.md#3190); publish time from `npm view @clerk/backend time` |
| 2026-10-15 | Clerk MCP server revamp | Clerk's own MCP server (`mcp.clerk.com`) manages apps, config and users | [changelog](https://clerk.com/changelog/2026-10-15-revamped-clerk-mcp-server), [docs](https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server.md) |
| 2026-10-23 | Agent feedback, `@clerk/mcp-tools@0.7.0` | A `submit_feedback` tool for **our** MCP server; reports are stored on our Clerk instance and read via the Dashboard or Clerk MCP's `list_application_feedback` | [changelog](https://clerk.com/changelog/2026-10-23-agent-feedback), [guide](https://clerk.com/docs/expressjs/guides/ai/mcp/agent-feedback.md), `@clerk/mcp-tools@0.7.0` `CHANGELOG.md`, `README.md:112` |
| undated **(unverified)** | "MCP server" registration (`configure_mcp_server` / `check_mcp_server`) | Registers an MCP server URL as an OAuth resource "so Clerk issues access tokens with that URL as the audience". The first registration on an instance "also turns on the audience claim and CIMD client registration". `check_mcp_server` runs a public discovery check (unauthenticated GETs of our PRM and Clerk's issuer metadata; "not end-to-end OAuth verification") | Only the Clerk MCP tool descriptions. These tools aren't in the public tool table of the [Clerk MCP docs](https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server.md), the BAPI spec has no resource-registry endpoint, and there's no changelog entry |

`@clerk/mcp-tools` itself changed little: 0.6.0 (2026-07-14, what we run) → 0.7.0
(2026-10-23, `npm view @clerk/mcp-tools time`). The Hono adapter is the same apart from the
new `verifiedBy: "clerk"` marker on `verifyClerkToken`'s result and `isClerkAuthInfo()`
(diff of `dist/hono/index.mjs` and `dist/server.mjs`, 0.6.0 vs 0.7.0). The Express fix in
0.7.0 (one server per request) doesn't touch us: we already pass a factory
(`apps/mcp/src/create-app.ts:100`).

What the Clerk Platform MCP tools `configure_mcp_server` / `check_mcp_server` correspond to:
a resource registry on the instance plus the `aud_claim_*` and `client_id_metadata_documents_*`
settings of `instance/oauth_application_settings`. The settings half is documented in the
BAPI spec. The registry half ("marked MCP servers", "legacy Dashboard registration") is not
documented anywhere I could find **(unverified)**.

## 2. Our current setup

- Versions: `@clerk/mcp-tools@0.6.0`, `@clerk/hono@0.1.90`, `@clerk/backend@3.25.0`,
  `@modelcontextprotocol/sdk@1.32.1` (`pnpm-lock.yaml:1645`, `:1698`, `:1704`, `:2956`).
  Latest on npm today: mcp-tools 0.7.0, hono 0.1.93, backend 3.26.2, SDK 1.32.2.
- Auth chain on `/` (`apps/mcp/src/create-app.ts:79-89`): `requireConfig` → `requireBearerToken`
  (401 + `WWW-Authenticate: Bearer resource_metadata="…"`, `apps/mcp/src/auth.ts:54-73`, `:98-105`)
  → `clerkMiddleware()` with no options → `requireClerkUser`, which uses
  `getAuth(c, { acceptsToken: "oauth_token" })` (`apps/mcp/src/auth.ts:111-120`).
  It keeps only `userId`. It doesn't read `scopes`, `clientId` or `aud`.
- PRM: `protectedResourceHandlerClerk` with `resource` = `MCP_PUBLIC_URL` or the request
  URL, normalized to `…/` (`apps/mcp/src/auth.ts:35-48`). Live:
  `https://mcp.fitmeproject.com/.well-known/oauth-protected-resource` →
  `"resource":"https://mcp.fitmeproject.com/"`, `"authorization_servers":["https://clerk.fitmeproject.com"]`,
  no `scopes_supported`.
- Transport: `streamableHttpHandler` from `@clerk/mcp-tools/hono`, a fresh server per request
  (`apps/mcp/src/create-app.ts:93-101`). It passes `c.get("mcpAuth")` as `authInfo`
  (`@clerk/mcp-tools@0.7.0` `dist/hono/index.mjs:56`). We never set `mcpAuth`, so tools
  get no `authInfo` today. That's harmless, because tools get the User through
  `createToolContext`.
- Integration suite: `apps/mcp/integration/clerk-oauth.test.ts` + `integration/clerk.ts`
  create a **pre-registered** public OAuth app through the Backend API
  (`integration/clerk.ts:209-221`, `scopes: "openid profile email"`). They run PKCE through the
  MCP SDK client against a local server (`server.url`, `http://127.0.0.1:<port>/`) and
  assert `sub` only (`clerk-oauth.test.ts:147`).
- Clerk instance settings (read-only `check_mcp_server`, 2026-10-24):

  | Setting | development | production |
  | --- | --- | --- |
  | registered MCP servers | none | none |
  | `aud_claim_enabled` | false | false |
  | `aud_claim_refresh_backfill_enabled` | false | false |
  | `oauth_jwt_access_tokens` | true | true |
  | `pkce_required` | true | true |
  | `dynamic_oauth_client_registration` | false | false |
  | `client_id_metadata_documents_advertised` | true | true |
  | `…only_allow_pre_registered_clients` | **true** | false |
  | `…block_implicitly_allowed_clients` | false | false |

  The check reports one blocker on both instances: "Access tokens carry no audience claim, so
  the MCP server cannot require its own URL as the audience." Production AS metadata
  (`https://clerk.fitmeproject.com/.well-known/oauth-authorization-server`) confirms
  `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`,
  no `registration_endpoint`, and only built-in `scopes_supported`.
- Constraints: ADR 0011 says every credential goes through Clerk, routes declare `read` /
  `write`, and "a credential without scopes keeps full access"
  (`docs/adr/0011-one-public-api-every-credential-through-clerk.md:19`). `@clerk/hono`'s
  middleware is mounted only where needed (`:20`). The Public API's `Permission` type is
  `"read" | "write"` (`apps/api/src/auth.ts:20`). OAuth and API-key buckets for the rate
  limiter come later (AGENTS.md, `apps/api` `src/rate-limit.ts`).

## 3. Mapping: feature → what it replaces, adds, breaks

| Clerk feature | Replaces in our code | Adds | Breaks / changes | Verdict |
| --- | --- | --- | --- | --- |
| **`aud` claim + MCP server registration** | Nothing. It adds a check we lack | Spec compliance: tokens minted for another resource on our instance (a future Public API OAuth resource, say) can't be replayed here | `clerkMiddleware()` needs `{ audience }` (passed through `...rest` into `authenticateRequest`, `@clerk/hono` `dist/index.mjs:28`, `:53-60`; checked by `verifyOAuthJwt` → `assertOAuthAudienceClaim`, an **exact string** match, `@clerk/backend` `dist/chunk-WJJ2QJZH.mjs:2145-2160`, `dist/chunk-SEYNRELD.mjs:157-173`). Tokens without `aud` are then rejected (3.19.0 CHANGELOG), so every client connected before the switch gets a 401 and must re-authorize (see Risks). Unit tests mock `@clerk/hono`, so they need a case that asserts the option. The integration suite needs a matching audience for a localhost resource (see open questions) | **Adopt** |
| **CIMD** | Nothing in code. We never had DCR | Any CIMD-capable client connects with no Dashboard step (which named clients support CIMD is **(unverified)**). Already live in production. DCR-only clients need registering in advance, since DCR is off | Dev admits pre-registered clients only, so connecting a new client to local dev takes a Dashboard step. The integration suite uses a pre-registered app and is unaffected | **Already adopted** (settings only). Consider `client_id_metadata_documents_only_allow_pre_registered_clients` in production if we want an allowlist |
| **Custom scopes** | Nothing. `requireClerkUser` ignores scopes | `fitme:read` / `fitme:write` (names TBD), mapped onto the Public API's `read` / `write`. Read-only clients become possible | Define them on both instances, assign them to CIMD clients and default scopes, advertise them. Read `auth.scopes` (exposed for `oauth_token`, `@clerk/backend` `dist/chunk-WJJ2QJZH.mjs:6383-6390`; parsed from `scp` or `scope`, `:1794`). Gate write tools. Add `scopes_supported` to PRM and `scope=` to 401/403 challenges (spec SHOULD). Contradicts ADR 0011:19 as written. Under the ADR's own rule, a token with no Fitme scope keeps full access, so existing clients don't break | **Later.** Do it together with OAuth on `apps/api` (ADR 0011) so both use one scope vocabulary |
| **Default scopes for dynamic clients** | — | Control over what CIMD clients get when they omit `scope` | Only matters once custom scopes exist | With scopes |
| **`submit_feedback` (`@clerk/mcp-tools@0.7.0`)** | — | Agents report missing or broken tools. We read them in the Dashboard or with `list_application_feedback` | Bump mcp-tools. Register `submitFeedbackTool({ secretKey: CLERK_SECRET_KEY })` (it throws without one, `dist/feedback.mjs:168`). To attach the User and client ids, set `mcpAuth` to `verifyClerkToken(getAuth(c,{acceptsToken:"oauth_token"}), token)` (identity is attached only when `isClerkAuthInfo`, `dist/feedback.mjs:125-131`). Reports go to Clerk without asking the User, and carry the agent's summary of the task and the User's id (README "Collecting feedback from agents"). That needs a privacy-policy line, and health-adjacent content goes to a third party. Limit: 100 reports per instance per hour | **Optional**, after the privacy decision |
| **`mcpAuthClerk` / `protectedResourceHandlerClerk` refactor** | Our `requireBearerToken` + `requireClerkUser` | — | Worse than ours. An invalid token gets a bare `{"error":"Unauthorized"}` 401 with **no** `WWW-Authenticate` (`dist/hono/index.mjs:41`). The challenge URL comes from the request URL, ignoring `MCP_PUBLIC_URL` (`:78-84`). No `error="invalid_token"`. No audience or scope check either | **Don't** |
| Custom consent page, Device grant, Organizations, API keys, M2M | — | Not relevant to MCP today. API keys matter to `apps/api` (ADR 0011), not to MCP | — | Skip |

## 4. Spec compliance (MCP 2026-07-28, the current version)

`https://modelcontextprotocol.io/specification/latest` redirects to `2026-07-28`. The source is
[`docs/specification/2026-07-28/basic/authorization/`](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/docs/specification/2026-07-28/basic/authorization).

| Requirement | Level | Us today |
| --- | --- | --- |
| Serve RFC 9728 Protected Resource Metadata (`index.mdx:73`) | MUST | ✅ |
| `resource_metadata` in the 401 `WWW-Authenticate` (`authorization-server-discovery.mdx:41`) | (discovery mechanism) | ✅ |
| Validate tokens per OAuth 2.1 §5.2; invalid or expired → 401 (`index.mdx:283-290`) | MUST | ✅ (Clerk verifies; we answer 401 `invalid_token`) |
| **Validate that the token was issued for this server as audience** (`index.mdx:285`; `security-considerations.mdx:124`: "MUST reject tokens that do not include them in the audience claim or otherwise verify…") | MUST (also in [2025-06-18](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/basic/authorization.mdx), line 263) | ❌ No check, and Clerk doesn't emit `aud` on our instances |
| Don't pass tokens through to upstream APIs (`security-considerations.mdx:126`) | MUST NOT | ✅ (Exercise Library gets `EXERCISES_MCP_SECRET`, Postgres gets `asUser`) |
| `scope` in the `WWW-Authenticate` challenge (`index.mdx:99`) | SHOULD | ❌ (no scopes exist yet) |
| AS supports CIMD (`index.mdx:65`, `client-registration.mdx:22`) | SHOULD (AS side) | ✅ Clerk, production and development |
| DCR deprecated (`client-registration.mdx:141`) | — | ✅ off |
| AS sends `iss` in authorization responses (RFC 9207, `index.mdx:194`) | SHOULD (AS side) | ✅ `authorization_response_iss_parameter_supported: true` |

So the one MUST we miss is audience validation. It's the reason to act now: our resource
URL is exactly the kind of thing other servers on the same Clerk instance could be handed
tokens for once `apps/api` accepts OAuth. Out of scope here: `@modelcontextprotocol/sdk`
1.32.x still lists `2025-11-25` as its latest protocol version
(`node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:2`). That's the SDK's to move,
not Clerk's.

## 5. Proposed change (if adopted)

1. Clerk, development then production: register the MCP server, either with
   `configure_mcp_server` (`resource_url` = the exact PRM string,
   `https://mcp.fitmeproject.com/` in production) or by hand: `PATCH
   /instance/oauth_application_settings {"aud_claim_enabled": true,
   "aud_claim_refresh_backfill_enabled": true}` plus the resource registration. Dry-run first.
2. `apps/mcp/src/auth.ts` / `create-app.ts`: call `clerkMiddleware({ audience: resourceUrl(c) })`
   per request (or once from `MCP_PUBLIC_URL`). Consider accepting both `…/` and the form
   without the trailing slash, because the match is exact.
3. Tests: one unit case asserting the audience option, and `expect(decodeJwt(token).aud)`
   in `clerk-oauth.test.ts`.
4. Docs: `AGENTS.md:226`. Also ADR 0011:19, once scopes land.

Effort: about half a day of code and tests, plus the rollout below. Env vars: none new
(`MCP_PUBLIC_URL` is already set in production, `apps/mcp/.env.example:28`).

## 6. Risks

- **Every already-connected client gets logged out.** Once we require `aud`, tokens and refresh
  tokens issued before the switch have none. `aud_claim_refresh_backfill_enabled` ("refresh grants
  without a resource can adopt the requested resource") suggests Clerk can repair this on
  refresh. How it behaves for refresh tokens minted before the switch is **(unverified)**.
  Plan for one forced re-authorization: users would see a reconnect prompt in Claude or
  ChatGPT.
- **Trailing-slash mismatch.** We advertise `https://mcp.fitmeproject.com/`.
  `configure_mcp_server`'s example is `https://mcp.example.com/mcp`. The spec allows either
  form but says to be consistent (`index.mdx:244`). The `aud` check is an exact string
  compare.
- **A client that sends no `resource`.** All MCP clients MUST send it (`index.mdx:252`), and
  the SDK does (`client/auth.js:818`, `:852`). What Clerk does when it's missing (no `aud`, or
  an error) is **(unverified)**. Either way the token gets rejected, so such a client can't
  connect.
- **The registry is undocumented.** The "MCP server" registration has no public docs or
  changelog yet, and only Clerk's MCP tools expose it, so its behaviour may change.
- **Feedback tool privacy** (if adopted): reports carry Clerk user ids and free text to Clerk
  without User consent. Also, any authenticated caller can use up the 100-per-hour limit.

## 7. Open questions

1. With `aud_claim_enabled`, does Clerk put `aud` on tokens for **any** `resource` value, or
   only for registered MCP servers? This decides whether the integration suite (resource
   `http://127.0.0.1:<port>/`, not a registrable public https URL) keeps working on the dev
   instance, or needs a fixed tunnel URL or an `audience` override for local runs
   **(unverified)**.
2. Does an unregistered `resource` get `invalid_target`, or a token without `aud`
   **(unverified)**?
3. Exact `aud` format: a string or an array, with or without the trailing slash as sent? The
   SDK normalizes it to `string[]` either way (`@clerk/backend` `dist/chunk-WJJ2QJZH.mjs:1785-1804`).
4. Are custom scopes emitted as `scope` or `scp`? `@clerk/backend` reads both (`:1794`)
   **(unverified which)**.
5. Do we want `client_id_metadata_documents_only_allow_pre_registered_clients: true` in
   production (an allowlist of Claude, ChatGPT, Cursor and so on), or keep open admission?
   That's a product decision.
