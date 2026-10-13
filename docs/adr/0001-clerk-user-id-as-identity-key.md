---
status: accepted
date: 2026-10-09
---

# Clerk user id is the identity key for all user-owned data

Fitme is moving authentication from Supabase Auth to Clerk (Supabase third-party auth, Clerk tokens trusted by the Supabase API). Clerk's `sub` claim is reserved and cannot carry a legacy value, so `auth.uid()` can no longer resolve to the existing `user_id uuid` values that reference `auth.users`. We decided to rekey: every `user_id` column becomes `text` holding the Clerk user id (`user_…`), the foreign keys to `auth.users` are dropped, and RLS policies and RPCs read the `sub` claim from the JWT instead of `auth.uid()`. Existing rows are rewritten once by a one-shot migration script that creates each Supabase user in Clerk and maps the old UUID to the new Clerk id.

## Considered options

- **Rekey to the Clerk id (chosen).** One identity, no mapping layer, same pattern as the Instinct project. Cheap now: 79 users, no active subscriptions, so changing the RevenueCat, Segment and Sentry user identifier costs nothing.
- **Keep UUIDs with a local `users` mapping table.** Preserves data untouched but adds a lookup to every RLS check and a bootstrap race for new users, whose mapping row must exist before their first write.
- **Keep UUIDs via Clerk `external_id` plus a custom claim.** Works for migrated users only; new Clerk ids are not UUIDs, so new signups would need a webhook to mint one, with a window where the token lacks it.

## Consequences

- There is no referential integrity between app rows and the identity provider. Deleting a user in Clerk must be mirrored explicitly; nothing cascades any more. The only cleanup path is a Clerk `user.deleted` webhook that removes the user's rows, so in-app account deletion is a client-side Clerk call and row cleanup is eventually consistent.
- `auth.uid()` must not be used anywhere; policies and functions use a single helper that reads the `sub` claim. The helper only trusts tokens whose `role` claim is `authenticated` (FIT-92), because Supabase also accepts Clerk OAuth access tokens issued to third-party clients, and those carry no role.
- Third-party identifiers (RevenueCat app user id, Segment user id, Sentry user id) change from the Supabase UUID to the Clerk id at migration time.
