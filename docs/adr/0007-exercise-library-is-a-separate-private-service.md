---
status: accepted
date: 2026-10-17
---

# The Exercise Library is a separate private service keyed by Exercise slug

Partly superseded by ADR 0008: the Exercise Library API lives in the monorepo as `apps/exercises`, and only the content stays in `fitme-exercises`. It replaces the decision bullets "Every merge to `main` is a release" (deploying) and "The Exercise Library API serves the data baked into its deployment" (where the API lives and how the data reaches it: a `library.json` bundle in a private Vercel Blob store, baked in by the API's build, which a content release triggers through a deploy hook). The rest of this ADR stands.

The Exercise Library leaves Postgres. Until now it was the `exercises` table, synced from CSV and markdown files in this monorepo (`packages/supabase/data/`), with media on DigitalOcean Spaces, readable by anyone who can call Supabase. A private repository, `fitme-exercises`, now owns it end to end, and the Exercise Library API serves it. Exercises are identified by their Exercise slug instead of a uuid.

## Context

- **The monorepo is going public; the Exercise Library must not.** Exercise content and media stay private, so neither can live in this repo.
- **The Exercise Library is about to be replaced and will grow.** A new pack replaces today's 77 Exercises, and later brings richer metadata and localizations. That is editorial content that changes through review, not through User actions, and Postgres is the wrong home for it.
- **Content needs its own change control.** Review, history and releases for content, separate from app code.
- **It can be scraped.** Today the whole Exercise Library is served to anyone who can call Supabase.

## Decision

- **`fitme-exercises` owns the content and media.** A private GitHub repository with one folder per Exercise, named after its Exercise slug: language-independent metadata (muscle groups), a locale folder (`en` for now) with the name, `description.md` and `instructions.md`, and a thumbnail and a video tracked with Git LFS. Changes go through pull requests on a protected `main`, and CI rejects invalid content and any deleted or renamed Exercise folder.
- **Every merge to `main` is a release.** One workflow validates the Exercise Library, uploads media that isn't in the bucket yet (a public Supabase Storage bucket, `exercise-media`, at `<slug>/<lfs-oid>.<ext>`, content-hashed paths that are never overwritten or deleted), then deploys. Media is uploaded before the deployment that points at it, and rollback is Vercel's instant rollback.
- **The Exercise Library API serves the data baked into its deployment.** At `exercises.fitmeproject.com` (its own Vercel project): list with search, muscle group filter and pagination, lookup by Exercise slug and batch lookup. The build turns the validated content into a module the API imports; nothing is read from a database, disk or the network at runtime, so what is live is exactly what was merged.
- **Every API request is authenticated, and Users are rate limited.** A bearer token is either a server caller's secret (one for the Coach, one for MCP) or a User's Clerk session token from either Clerk instance. Missing or invalid → 401 (CORS preflights are answered before authentication, so the web app can call it). Each User gets 120 requests a minute (over it → 429 with `Retry-After`), so the Exercise Library can't be pulled anonymously or in bulk; server callers aren't limited. No Pro gate: the Exercise Library is free content.
- **Media files are public, the rest of the content isn't.** Thumbnails and videos are public objects, so Supabase can resize thumbnails on the fly and its CDN can cache every object forever. Their paths include the file's content hash, so they can't be listed or guessed, only reached from a URL the API handed to an authenticated caller. A URL, once handed out, can be shared and fetched without a token or rate limit. That's an accepted trade-off: the token and rate limit protect the Exercise Library as a whole (names, descriptions, instructions, and the URLs themselves), not each media file.
- **The apps call the Exercise Library API directly, with the User's Clerk session token.** For Exercise Library reads, this supersedes ADR 0004's "every client reaches data only through `apps/api`": the Exercise Library isn't User data in Postgres, so routing it through `apps/api` would add a hop and a second rate limit, and protect nothing more. User data still goes through `apps/api` as ADR 0004 says.
- **An Exercise is identified by its permanent Exercise slug** (`bench-press`, `^[a-z0-9]+(-[a-z0-9]+)*$`). It replaces the uuid everywhere. It never changes, even when the Exercise's name does, and Exercises are never removed, so a Plan or Workout Session that refers to one keeps resolving.
- **The `exercises` table goes.** A later migration project moves the monorepo's readers (mobile, web, the Coach, MCP, `@fitme/services`) onto the Exercise Library API, stores Exercise slugs on Workouts and Workout Sessions, and drops the table along with today's `exercise_id` foreign keys, but only once the minimum version gate has cut off every installed app build that still reads the table or sends Exercise uuids (ADR 0004's rule for retiring what old builds call). From then on, nothing in Postgres has a foreign key to an Exercise.

## Considered options

- **Separate private repo and service (chosen).** Keeps content private while the monorepo is public, gives content its own review and releases, and puts every read behind a token and a rate limit.
- **Keep Postgres as the source, with better caching.** Faster reads, but the content still lives in the public monorepo's sync files, still changes outside any review process, and is still readable through Supabase.
- **A typed module bundled into the apps.** No service to run, but every content change needs an app release, old builds keep old content, and the whole Exercise Library ships inside every app binary for anyone to extract.
- **Static JSON on a CDN.** Cheap and fast, but public: no per-User authentication or rate limit, so it is as scrapable as today.
- **A hybrid with an id registry in Postgres.** Keeps a foreign key for Exercises, at the cost of a second source of truth that every release must keep in sync. A permanent Exercise slug that is never removed gives the same stability without it.
- **A content folder inside the monorepo.** The simplest pipeline, ruled out because the monorepo is going public.

## Consequences

- **No database guarantees that an Exercise slug exists.** The Coach and MCP check slugs through the Exercise Library API before writing them; mobile writes stay unchecked for now. CI's ban on deleting or renaming an Exercise folder is what keeps stored slugs resolving.
- **Server callers carry the per-User limit themselves.** The Coach and MCP call with their own secrets, which aren't rate limited, so a User working through them isn't counted against their 120 requests a minute. The Coach is bounded by its Pro check and turn limits. MCP has no per-User limit yet; the migration project that moves its exercise tools onto the API must add one (or forward the User's identity) before they can be used to page through the Exercise Library.
- **API changes are additive only.** There is no version prefix and installed app builds keep calling the same routes, so CI blocks removed or renamed fields and parameters. A field is removed only once the minimum version gate has cut off every build that reads it.
- **The upload credential reaches every bucket in the production Supabase project.** Media is uploaded with a Supabase S3 access key, never the service role, so `fitme-exercises`' CI can't reach User data in Postgres, but the key can write to any Storage bucket. Today `exercise-media` is the only one. Before a bucket with User data is added to the production project, move exercise media to its own Supabase project or replace this credential.
- **An extra service to run.** Its own Vercel project, domain, Clerk keys, server secrets, Upstash Redis for the rate limit and Sentry, and its own outages: while the Exercise Library API is down, Exercises the device hasn't cached can't be shown or searched.
- **Today's content stays in this repo's history.** Moving it out doesn't erase the 77 Exercises' descriptions, instructions and media URLs from Git history. Before the monorepo goes public, either scrub them from history or decide the legacy pack is safe to disclose. That's tracked separately from this decision.
- Responses need a token, so they aren't cached on a shared CDN; each is served from memory and devices cache it for an hour.
