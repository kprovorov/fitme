---
status: accepted
date: 2026-11-13
---

# Arnold offers one medium model per creator; a retired id runs on its successor

Arnold's model list (`arnoldModels` in `@fitme/core`) holds one medium model per creator, each the latest of its line on Vercel AI Gateway and each taking images (ADR 0018):

- `openai/gpt-6.1-terra` (the default)
- `anthropic/claude-sonnet-5.5`
- `google/gemini-4-hydrogen`
- `spacexai/grok-4.7`

Before this, the list held seven models from two creators: GPT-5.5, the three GPT-5.6 sizes (Luna, Terra, Sol), Claude Haiku 4.5, Sonnet 5 and Opus 5. In the 30 days before the change, every one of Arnold's 353 Gateway requests ran on the default, GPT-5.5, so the extra sizes gave Users choices nobody made while each one needed evals. GPT-5.5 had also become the most expensive of the lot ($5 / $30 per million tokens, against GPT-6.1 Terra's $1 / $5).

This amends ADR 0006 in two places:

- **New creators: Google and SpaceXAI.** Arnold's host order now covers them: Google → Vertex for Gemini, and xAI → Bedrock → Vertex for Grok. A host slug is the Gateway's provider name, not the id's creator: SpaceXAI's models are served by `xai`. Failover still never changes the model.
- **A retired id runs on its successor instead of failing the turn.** ADR 0006 refused old ids, and left a stale device cache to fail turns until its next fetch. That held while the list only grew. Shrinking it would fail turns for nearly every User: the app sends the list's `defaultId` explicitly, a phone keeps the last list in MMKV, the API caches it for 5 minutes, and `apps/api` and `apps/arnold` deploy separately. `apps/arnold/agent/lib/models.ts` therefore maps each id the list used to serve to its creator's current model (GPT ids to GPT-6.1 Terra, Claude ids to Claude Sonnet 5.5). Any other id still fails the turn. When a model is next removed from the list, its id joins that map.

## Considered options

- **One medium model per creator (chosen).** Four choices that differ by who made them, one eval run each, the cheapest default that does the job.
- **Small, medium and large per creator.** The old shape with more creators: twelve models to evaluate, and usage says Users don't pick sizes.
- **Keep the old ids failing (ADR 0006 as written).** Simpler, but every send from a phone with a cached list would fail until its next fetch.

## Consequences

- The retired-id map only grows, and it can only be trimmed once no build that cached an older list is in use, which the minimum version gate doesn't prove for a cached list. It costs one lookup per step.
- A User who picked a retired model is moved to its successor without being asked. The app also shows the list's default once it fetches the new list, since a saved pick that left the list resolves to `defaultId` (ADR 0006).
- Grok 4.7 and Gemini 4 Hydrogen are new to Arnold. A missing `costUsd` on a step from either one fails the turn closed (ADR 0006), so a live turn on each, with an image and a tool call, comes before the release.
