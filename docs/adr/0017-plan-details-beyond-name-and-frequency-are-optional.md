---
status: proposed
date: 2026-11-03
---

# Plan details beyond name and frequency are optional

The hand-built Plan flow (ADR 0016) asks only for a name and a frequency, which the Weekly goal needs. So a Plan's goal, place, experience level and workout duration can be unset. `goal` and `place` lose NOT NULL, `experience_level` and `workout_duration` lose their defaults, and the Public API takes them as optional on writes and answers them as nullable. An unset field isn't shown. Arnold's plan card and MCP's Plan writes still require all four, so only the hand-built flow leaves them empty.

## Considered options

- **Nullable (chosen).** The Plan says only what the User told us.
- **Server defaults** (general fitness, gym, intermediate, 60 min), prefilled in a collapsed form section. This needs no migration and no breaking change, but it stores choices the User never made, and Arnold would then read them as real.

## Consequences

- This is a breaking change to `/v1` responses, and old builds read Plans from Supabase directly. It ships in three steps: first an app build that handles unset fields; then `MIN_APP_VERSION` is raised once most installs run that build; then the migration and the API change, with the oasdiff allowlist entries (`apps/library`'s deliberate-removal process). The builder ships after the last step.
