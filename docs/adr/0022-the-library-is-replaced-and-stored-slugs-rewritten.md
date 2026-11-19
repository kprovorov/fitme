---
status: accepted
date: 2026-11-18
---

# A new Library, served by the Public API, replaces the old one, and stored Exercise slugs are rewritten

This partly supersedes ADR 0007 ("an Exercise is identified by its permanent Exercise slug … Exercises are never removed"), ADR 0008 (the Library API in `apps/library` serves the Library) and ADR 0018 ("the Library only grows, so a stale index can only be missing slugs"). Each still holds for the Legacy Library while it lives.

The 77 Exercises of today's Library are replaced by the MoveKit pack: 588 Exercises with their videos and metadata. No old Exercise stays: each one maps to its closest MoveKit Exercise. The new Library keeps MoveKit's slugs, with obvious typos fixed once at import (`parralel-bar-dips` → `parallel-bar-dips`).

The new Library doesn't go through `fitme-exercises` or the Library API. Both are left as they are and become the **Legacy Library**. Older builds keep reading it until the minimum version gate cuts them off. Covers stay there until they move or go, which is a separate piece of work. After that, the Library API and `fitme-exercises` are deleted.

## Decision

- **A new private repository, `fitme-library`, owns the new Library.** It publishes a new bundle version to the private Vercel Blob store under its own name, next to `fitme-exercises`' `library.json`.
  - The prose is ours. Every MoveKit text (descriptions, steps, common mistakes, benefits, use cases) is rewritten in our own English, then translated into every App language. Names and tags are translated. Aliases stay English and are searched.
  - Media goes to a new Supabase bucket, `library`. Videos are transcoded to 720p. Thumbnails are MoveKit's posters or frames taken from the clips. Originals stay out of Git LFS.
- **The Public API serves it.** New `/v1` Exercise routes in `apps/api` replace what the Library API answers today: list and search, one Exercise, and the batch lookup. They are User routes: authenticated with a Clerk session token and counted by the Public API's rate limiter.
  - `apps/api`, MCP and Arnold each load the bundle in their own process through `@fitme/library-bundle`, the way they already load the Library index: on first use, then kept for the instance's life and never reloaded. MCP and Arnold don't call the Public API, which takes no server secrets (ADR 0011).
  - The search, filters and per-language answers live once, in `@fitme/library-bundle`, and all three use them.
  - The Library is mostly static. A content release reaches Users when `api`, `mcp` and `arnold` are redeployed by hand. There is no deploy hook. `fitme-library`'s CI validates a bundle before publishing it, so an invalid one never reaches them.
- **The new mobile build reads only the new Library.** It gets Exercises from the new routes through `@fitme/api-client`, and it gets muscle groups, Equipment, movement patterns and difficulties from `@fitme/core`. It reads nothing but Covers from the Library API.
- **Core holds both vocabularies while the Legacy Library lives.** MoveKit's lists become `muscleGroups` and `equipment`, plus `pull_up_bar` and `parallel_bars`, because MoveKit tags pull-ups and bar dips as bodyweight only. Movement patterns and Difficulty are new fixed lists. Today's lists stay in core under legacy names, for the Library API and the v1 bundle schema, until they're deleted. The catalogs translate both until no build of ours shows a legacy id.
- **Old slugs resolve to their replacement until the rewrite.** The new bundle carries the old → new slug map. It lives in the private `fitme-library` repo, never in this one, which is going public.
  - The new routes answer an old slug with its replacement Exercise. So the new build shows every Plan and Workout Session from its first day.
  - Until the rewrite, the writers (Public API, MCP, Arnold) accept a slug that either Library knows. Older builds still write old slugs, while the new build, MCP and Arnold write new ones.
- **Stored slugs are rewritten once older builds are gated.** The order is:
  1. The new build ships.
  2. The minimum version gate is raised to it.
  3. A one-off command, `pnpm api rewrite:exercise-slugs [--dry-run]`, rewrites `workout_exercises`, `workout_session_exercises` and `personal_records` with the bundle's map. It runs through `withService`, one User at a time, and is safe to re-run. It reads the map from the bundle, so it never needs a map of its own.
  4. If two slugs land on the same new one within a Workout Session, its Personal records keep the better record (higher weight, then more reps). Duplicate Workout Exercise and Workout Session Exercise rows stay.
  5. Then the map is dropped from the bundle. The writers accept new slugs only, and an old slug stops existing.
  6. The writers keep the Legacy Library's index for Covers alone.
- **Covers are out of scope.** They stay on the Library API and in the Legacy Library's index. `pickCovers` matches by muscle group id. The groups both vocabularies share (chest, back, shoulders, …) still match, and the rest fall back as they already do.

## Considered options

- **A new Library beside the Legacy Library, served by the Public API (chosen).** Nothing switches at one moment. No reader ever handles two bundle versions, and no list mixes both vocabularies. Older builds keep their Library until the gate, and the new Library's code is new code, not a migration of the old. The cost is that `/v1` takes on Library content, and the Library API lives on (for Covers) until a later clean-up.
- **Replace the content inside `fitme-exercises` and the Library API.** One Library service throughout. But the switch is a single coordinated moment: one build has to read both bundle versions, core's lists hold both vocabularies in one enum, and the writers have to be redeployed in step with the bundle.
- **Keep an old → new redirect map forever.** No gate and no rewrite. The cost: every reader carries a second lookup path for good, and the map grows with every later replacement.
- **Keep the old 77 Exercises next to MoveKit's.** No rewrite at all, but two overlapping Libraries with two muscle-group vocabularies and two content styles.

## Consequences

- **`/v1` takes on Library content.** It's additive only, as ever, so a field removed later needs `/v2`. Library requests share the Public API's per-User rate limit with User data.
- **A content release is a manual redeploy.** `api`, `mcp` and `arnold` have to be redeployed by hand.
- **The overlap is degraded, so keep it short.** Between the new build's release and the rewrite:
  - an older build shows an Exercise the new build, MCP or Arnold wrote as its slug's name;
  - an Exercise's history and Personal records are split between its old and new slug.
- **Old slugs are refused after the rewrite.** An Arnold plan card in an old Conversation that names an old slug shows the "unknown exercises" message. An MCP client holding an old slug gets an unknown-slug error and has to search again.
- **Licence risk, accepted for now.** MoveKit's licence forbids exposing raw file URLs "publicly or to unauthorized parties", and the `library` bucket is public. The fix is a private bucket with short-lived signed URLs, which means giving up today's caching and the image render endpoint.
- **What's left for later.** The Library API, `fitme-exercises`, the legacy lists and catalog entries, and the Legacy Library's index go once Covers have moved or gone.
- **Future replacements follow the same path.** A new Library with a map, the gate, the rewrite, and then the map dropped.
