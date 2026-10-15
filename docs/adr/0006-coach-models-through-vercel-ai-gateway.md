---
status: accepted
date: 2026-10-15
---

# Coach model calls go through Vercel AI Gateway

Every Coach model call goes through Vercel AI Gateway instead of calling OpenAI and Anthropic directly. This supersedes the "direct providers" part of ADR 0005.

- **Billing: Gateway credits, not BYOK.** One bill and one dashboard for every Coach model, with spend per model and per Conversation (eve sets the Gateway session id per Conversation). The `provorovdev` team keeps credits topped up automatically; with none left, every Coach turn fails.
- **Auth: Vercel OIDC when deployed, a key locally.** The deployed Coach needs no Gateway key. `pnpm dev:coach` and `pnpm coach eval` read `AI_GATEWAY_API_KEY` from `apps/coach/.env.local`. CI makes no model calls and needs neither. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are gone from the Coach.
- **Coach model ids are the Gateway's own ids** (`openai/gpt-5.5`, `anthropic/claude-haiku-4.5`). `coachModels` in `@fitme/core` stays the only list; an entry is `{ id, label, description }` and the id prefix names the model's creator, so there is no mapping table and no `provider` field. Old ids are not accepted as aliases, so a client still sending one fails the turn (the app's saved pick falls back to the default). The `ai-agent` edge function keeps its own list of the old ids for old builds.
- **Failover to another host of the same model, never another model.** The Coach's per-step model selection returns the Gateway id with `providerOptions.gateway.order` listing that model's hosts (OpenAI → Azure → Bedrock, Anthropic → Bedrock → Vertex), and never sets `gateway.models`, so a User's pick never changes behind their back during an outage.
- **No `promptCacheKey`.** OpenAI's automatic prompt caching still applies through the Gateway. Revisit if the Gateway dashboard shows a low cache hit rate once there is traffic.

## Considered options

- **AI Gateway with credits (chosen).** One account, same-model failover, per-step cost reporting.
- **AI Gateway with BYOK.** Keeps the provider accounts and their bills; we'd still manage two keys.
- **Direct providers (ADR 0005).** No failover across hosts, two bills, and no cost reported per step.

## Consequences

- Each Gateway-routed step reports its cost in USD, which lets the per-turn budget be capped in dollars instead of tokens.
- The context window for each model comes from the Gateway catalog through eve, so there is no per-model window to maintain.
- A model the Gateway stops listing can't be offered; adding one means adding its Gateway id to `coachModels` (and its creator's host order in the Coach, if it's a new creator).
