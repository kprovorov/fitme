---
status: accepted
date: 2026-10-22
---

# Exercise slugs are checked in the Coach and MCP tool layer, never in Postgres

With the `exercises` table gone (ADR 0007), Workouts and Workout Sessions store an `exercise_slug` with no foreign key, and Postgres has nothing to check it against: it can't call the Exercise Library API. The Coach and MCP tools check every Exercise slug they're about to write with one batch lookup on the Exercise Library API before opening the `asUser` transaction, and answer an unknown one as a tool error without writing anything. The same layer adds names and muscle groups to what they read. `@fitme/services` stays a transaction in, rows out: it never calls the Exercise Library API and writes whatever slug it's given. Mobile writes are not checked at all until they move onto `apps/api`; the app only writes slugs the Exercise Library API gave it, and renders a slug it can't resolve with a name derived from the slug.

## Considered options

- **Tool layer checks, services DB-only (chosen).** No HTTP call inside a transaction, one layer owns everything the Exercise Library API is needed for, and services and their integration tests need no Exercise Library.
- **Services check through an injected Exercise Library client.** Holds a pooled connection open across an HTTP call, and every service test needs a fake library.
- **A slug allowlist table synced on every content release, behind a `CHECK` or foreign key.** Checks every writer, mobile included, but brings back the id registry in Postgres that ADR 0007 rejected.
- **A slug format `CHECK` in Postgres.** Catches only malformed slugs, not unknown ones; left out.

## Consequences

- A model-invented slug never reaches Postgres through the Coach or MCP, but anything writing directly (today's mobile app, a manual SQL fix) can store an unknown slug, and every reader must render one.
- When mobile writes move onto `apps/api`, it checks slugs the same way, before its transaction.
