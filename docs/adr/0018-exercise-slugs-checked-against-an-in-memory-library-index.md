---
status: accepted
date: 2026-11-14
---

# Exercise slugs are checked against an in-memory Library index, not the Library API

Partly superseded by ADR 0022: until the stored slugs are rewritten, writes accept a slug either the new Library or the Legacy Library knows; after it, only the new Library's. The Legacy Library's index stays for Covers alone.

This partly supersedes ADR 0010. Slugs are still checked in the tool layer, before the `asUser` transaction, and `@fitme/services` still writes whatever slug it's given. What changes is where the check looks. The Public API, Arnold and MCP no longer call the Library API's `lookup` and `covers()` on every write. Each instance builds a small index from the `library.json` bundle in the private Vercel Blob store: every Exercise slug with its muscle groups, and every Cover with its id and muscle groups. The index is built on the instance's first write and kept in memory. Writes check slugs and pick Covers (ADR 0014) against it.

The Library only grows ("added, never removed"), so a stale index can only be missing slugs. It never accepts a removed one. Because of that, nothing invalidates the index. When a slug isn't in it, the instance reloads the bundle from Blob, at most once every 60 s per instance, and a miss that arrives while a reload is running waits for that reload. A slug that is still missing is refused as unknown (`unknown_exercises`, or Arnold's and MCP's tool errors). If a reload fails, the instance keeps answering from the index it has, and the failure is reported. If an instance has no index yet and can't build one, it answers a reported 503 `library_unavailable`. There is no fallback to the Library API.

The index reads only the fields it needs and ignores the rest of the bundle. It doesn't use `apps/library`'s strict schema, so a new bundle field never blocks writes. In production the bundle comes from Blob over Vercel OIDC, so the store is connected to the `fitme-api`, `fitme-arnold` and `fitme-mcp` projects. Everywhere else it comes from `LIBRARY_BUNDLE` or the committed fixture, and tests inject the index. The schema, the loader, the index and its reload-on-miss cache live in one source-only package, shared with `apps/library`, which still bakes the bundle in at build time.

## Considered options

- **An in-memory index loaded from Blob, reloaded on a miss (chosen).** A warm instance makes no network call for a write. Writes keep working while the Library API is down. Content releases need no extra step.
- **The bundle baked into each app at build time, redeployed by the content release.** This has the same zero calls, but every release has to redeploy three more projects. Their `turbo-ignore` would cancel a deploy-hook build, so they would need their own ignore script, and the hooks would have to run in order.
- **The index in Upstash Redis, filled from Blob and invalidated by the release.** This puts a network call back on every write, needs Upstash on Arnold and MCP and a write secret in `fitme-exercises`, and needs fill and stampede handling. It still depends on Blob.
- **Keep calling the Library API (ADR 0010).** One more network hop on every write, and writes fail whenever the Library is down.

## Consequences

- The Public API no longer calls the Library API at all. Its reads never named Exercises (ADR 0011), and `backfill:covers` reads the index too. `LIBRARY_URL`, `LIBRARY_PUBLIC_API_SECRET` and its Library client go away. Arnold and MCP keep their clients for search and for naming Exercises on reads.
- A content release reaches Blob before the Library API redeploys. Until that deploy is live, or for longer if its build fails, a write can accept a slug the Library API doesn't serve yet. Reads show that Exercise under its slug-derived name until the Library catches up.
- An instance's first write waits for one Blob read and the parse of the whole bundle. A new Exercise or Cover reaches a warm instance on its next miss, or when a new instance starts. Until then, a warm instance keeps picking from the Covers it already has.
- Writes now depend on Blob only for a cold instance. They no longer depend on the Library API, the Library secrets or the Library's rate limits.
