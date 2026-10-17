---
status: accepted
date: 2026-10-17
---

# The Exercise Library API lives in the monorepo; only the content stays private

The Exercise Library API moves out of the private `fitme-exercises` repository into this monorepo as `apps/exercises`, and only the content stays private. ADR 0007 is still the record of the Exercise Library leaving Postgres and being keyed by Exercise slug; this supersedes its bullets on where the API lives and how the data reaches it.

## Context

- **ADR 0007 put everything in the private repo.** The API sat next to the content, with its own copy of the monorepo's API conventions and tooling (Hono, tsdown, vitest, ultracite, Sentry, the error shape), kept in step by hand.
- **The code was never what needed hiding.** The Exercise Library is protected by its Clerk keys, server secrets and rate limits; the content and media are what must stay private. Hiding the API's code protects nothing and keeps it out of sight of everyone working in the monorepo.

## Decision

- **The API is `apps/exercises` in the monorepo.** Its code goes public with the monorepo. That's fine: protection comes from the Clerk keys, server secrets and rate limits, not from hiding the code.
- **`fitme-exercises` keeps the content, the loader, the upload planner and the release workflow.** No API code.
- **The contract between them is `library.json`** (`version: 1`, no URLs: both sides derive a media object's path from the Exercise slug and the content hash), in a private Vercel Blob store. The API's build fetches it through OIDC and bakes it in, so "the deployment is the data" still holds: nothing is read from a database, disk or the network at runtime.
- **A content release uploads media, publishes the bundle, then redeploys the API through a deploy hook.** Every merge to `fitme-exercises`' `main` is still a release, and media still goes up before the deployment that points at it. The app has no ignored build step, so every `main` push and every hook builds it. That's an exception to the monorepo's rule that every Vercel project sets `turbo-ignore` as its `ignoreCommand` (AGENTS.md, CI/CD).
- **Muscle groups live in `@fitme/core` and are mirrored in `fitme-exercises`.** A new one goes into `@fitme/core` first.

## Considered options

- **Content in the private repo, the API in the monorepo (chosen).** One copy of the API conventions, API code everyone can read, and content that stays private.
- **Everything in the private repo** (ADR 0007's original): a second copy of the monorepo's API conventions and tooling, and API code no one else can see.
- **The loader in the monorepo too, with the private repo checking it out:** needs a token while the monorepo is private, runs public code with the upload secrets, and content CI can break from monorepo changes.
- **The bundle in a private Supabase bucket:** the Supabase S3 key reaches every bucket in the project, while a Blob token reaches one store.
- **Reading the bundle at runtime:** loses "the deployment is the data" and instant rollback of content.

## Consequences

- **A content release depends on the monorepo's `main` building.** A broken `main` blocks content releases until it's fixed.
- **There are two muscle group lists.** Drift fails the API build loudly rather than serving unknown values: the build rejects a bundle with a muscle group `@fitme/core` doesn't know.
- **Every monorepo push to `main` redeploys `apps/exercises` with the latest bundle.** It's a short build, and `turbo-ignore` would otherwise cancel the hook builds that content releases rely on.
- **Instant rollback restores the previous deployment's baked-in content.** Rebuilding an old commit picks up the latest bundle, not the content it was first built with.
- **The `exercises` app follows the monorepo's ADRs and conventions like the other apps,** apart from the ignored build step above.
