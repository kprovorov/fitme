---
status: accepted
date: 2026-10-13
---

# The MCP server signs its own Supabase tokens

MCP authorization is moving to Clerk as the OAuth 2.1 authorization server. Clerk OAuth access tokens carry no `role` claim and Clerk can't add custom claims to them, so Supabase would run them as `anon` and RLS would see no User. We decided that the MCP server, after verifying a Clerk token, signs its own short-lived ES256 Supabase token for that User and sends it to Supabase with the anon key. Supabase trusts the server's public key as a standby signing key: it verifies the server's tokens but never signs with that key.

The token's claims are hard-coded: `role: authenticated`, `aud: authenticated`, `iss: fitme-mcp`, `kid` from the key, `sub` = the User id. It lives 5 minutes at most, and never longer than the Clerk token it was signed for.

## Considered options

- **Sign a Supabase token per request (chosen).** RLS and the RPCs keep identifying the caller through `public.current_user_id()` (ADR 0001), unchanged.
- **Service-role client plus a user id filter in every query.** Bypasses RLS, so every tool would have to re-implement ownership checks, and one missed filter leaks another User's data.
- **Trust Clerk OAuth tokens in Supabase directly.** They run as `anon` without a `role` claim, and Clerk can't add one.

## Consequences

- The signing key is as powerful as the service-role key: anyone holding it can act as any User. It lives only in the MCP server's environment (`SUPABASE_JWT_SIGNING_KEY`, a private JWK), never in an app, a client bundle or the repo (the committed development key below aside).
- The claims are hard-coded and `sub` only ever comes from a verified Clerk token, never from tool input or request data. A change that lets a caller influence `sub`, `role` or the expiry is a privilege escalation.
- Rotating the key means importing a new public half on the hosted Supabase project as a standby key before switching the server's env, then revoking the old one.
- Local stacks trust a committed development key: `packages/supabase/supabase/local-only-signing-keys.json` lists the stack's own signer, then the public half of the MCP development key, and `config.toml` points `[auth] signing_keys_path` at it. Its private half (`apps/mcp/integration/local-only-signing-key.json`, also in `apps/mcp/.env.example`) is public by definition and must never be trusted by a hosted project.
