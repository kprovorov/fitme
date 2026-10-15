---
status: accepted
date: 2026-10-15
---

# Coach model calls go through Vercel AI Gateway

Every Coach model call goes through Vercel AI Gateway instead of calling OpenAI and Anthropic directly. This supersedes the "direct providers" part of ADR 0005. (The Gateway routing decisions land with FIT-129; this file starts with the served model list, FIT-131.)

## Served model list

The app no longer bundles the Coach models. `apps/api` serves `coachModels` from `@fitme/core` at `GET /v1/coach/models` (public, cached 5 minutes), so a model is added or removed by deploying the backend, with no app release, and the list the app shows is the list the Coach accepts.

- **The device caches the last list.** The app keeps the last successful response in one global MMKV key, `coach.models` (the list is the same for every User), reads it as the query's initial data and rewrites it on every successful fetch. No bundled fallback and no react-query persister. An unreadable or malformed cached value counts as no list.
- **A saved pick that left the list falls back to the default.** The pick (`coach.model`) is sent while it's in the current list; one that isn't (a removed model, or an id from before the Gateway rename) resolves to the list's `defaultId`. Old picks are not migrated.
- **No list never blocks the chat.** With nothing cached and the fetch failed (or no `EXPO_PUBLIC_API_URL`), the picker shows that models are unavailable and sends carry no client context, so the Coach answers on its own default model.

### Considered options

- **Served list, cached in MMKV (chosen).** Models change with a backend deploy, and the last list still shows offline.
- **Bundled list.** Every model change needs an App Store release, and old builds keep offering models the Coach refuses.
- **Served list with a bundled fallback.** A second copy of the list to keep in sync, and it goes stale in old builds exactly when it's needed.
