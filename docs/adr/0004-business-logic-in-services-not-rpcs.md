---
status: accepted
date: 2026-10-14
---

# Business logic lives in `packages/services`, not Postgres RPCs

Plan, workout-session, profile and account-deletion logic moves out of Postgres functions (`create_plan`, `update_plan`, `start_workout_session`, `finish_workout_session`, `activate_plan`, `convert_measurement_system`, `delete_user_data`, …) into TypeScript in `packages/services`. Those functions run inside a transaction from `asUser` or `withService` (ADR 0003). The mobile app, MCP, the Coach, webhooks and the future public API then share one implementation, and every client (mobile and web, reads included) eventually reaches data only through `apps/api`.

Postgres keeps what must hold however the data is reached: RLS, `current_user_id()`, the retired-id triggers, `deactivate_deleted_plan` and the one-open-session-per-Workout index. `rekey_user` stays in SQL until the one-shot Clerk migration code is removed.

## Considered options

- **Services over direct DB transactions (chosen).** Multi-table writes stay atomic. The logic is testable TypeScript, reusable by every app and the public API.
- **Keep RPCs, call them from the API.** Logic stays split between SQL and TypeScript, and the public API would wrap SQL it can't easily evolve or test.
- **supabase-js REST without RPCs.** No transactions, so multi-table writes like `update_plan` could half-apply.

## Consequences

- The Supabase SQL migrations stay the schema source of truth. The Drizzle schema is generated from them with `drizzle-kit pull`, and CI checks it isn't stale. Drizzle does not own migrations.
- Each RPC is dropped only when nothing in the repo calls it, its service has tests, and installed app builds below the minimum supported version (enforced by the app's min-version gate) no longer reach it. `store_plan` has no callers and can go any time.
- RPC tests move from pgTAP to service integration tests against a local stack. pgTAP keeps covering what stays in the DB.
- Removing all direct client access eventually leaves Supabase's Clerk third-party auth trust and the anon key unused by clients.
