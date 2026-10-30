---
status: accepted
date: 2026-10-30
---

# Workout Covers are Library content, assigned by the server when a Workout is created

The Workout cards on the Workout tab show a photo behind their content, a Cover. The photos are bought stock (Unsplash+), whose licence forbids redistributing the files or keeping them in a shared asset library, and the monorepo is going public. So Covers are Library content: listed in `library.json` (an optional `covers` array in bundle version 1, each with a permanent uuid, its muscle groups and its image), kept in the private `fitme-exercises` repo, served by the Library API (`GET /covers`) from the media bucket. A Workout stores only the Cover's id (`workouts.cover`, nullable), never a URL, and the Public API and MCP show it as that id; the app resolves it through the Library API like an Exercise slug (ADR 0011). The server picks it when it creates Workouts (`POST /v1/plans`, `PUT /v1/plans/{id}/workouts`, MCP's `create_plan` / `update_plan` with `workouts`), from the Library lookup those writes already make (ADR 0010): one pure picker in `@fitme/core` takes the Covers tagged with the muscle group the Workout's Exercises train most, then the next group, then any, and keeps every Workout of a Plan on a different Cover while there are enough. The services store the id they're given and never choose it.

## Considered options

- **Library content, id on the Workout, picked by the server (chosen).** The licensed files stay private, new Covers ship without an app release, and every writer gets the same rule.
- **Files in the monorepo (`apps/mobile/assets`).** Simplest, but it publishes the licensed files with the public repo.
- **A URL stored on the Workout.** Ties every row to today's bucket and transform URL; an id stays valid when they move.
- **Worked out in the app from the Workout's Exercises, nothing stored.** No migration, but the Cover would change whenever the Library's muscle groups or Covers did, and the app couldn't keep a Plan's Covers distinct without reading every Workout first.
- **Arnold or the User picks.** Arnold doesn't create every Workout (MCP clients do too); letting the User choose can come later on top of the stored id.

## Consequences

- A Plan never shares a Cover between Workouts only while the Library holds at least as many Covers as the Plan has Workouts (up to `MAX_WORKOUTS_PER_PLAN`, 14); below that the picker reuses the least-used one. There is no unique index on (Plan, Cover) for the same reason.
- Workouts created before Covers get theirs from a one-off backfill script run through `withService` with the Library lookup (Postgres can't call the Library); a Workout still without one shows a black card.
- Replacing a Plan's Workouts gives the new Workouts fresh Covers.
