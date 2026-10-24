---
status: accepted
date: 2026-10-24
---

# The AI is Arnold; Coach means a human

Fitme's AI, until now the Coach, is renamed Arnold everywhere: product copy, the glossary, code, the database, infrastructure and tooling. "Coach" is freed for a planned feature where real fitness coaches train Users through Fitme, so the AI and a human never share a name. "Conversation" stays the AI's: a thread with a human Coach will get its own term.

## Considered options

- **Arnold everywhere (chosen).** One name across copy, code and infra, so nobody has to translate between a brand and an internal term.
- **A neutral internal term (`assistant`), Arnold only in copy.** A future rebrand would be a copy change, not another rename like this one. Rejected: two names for one concept is the confusion the rename exists to remove.
- **Agent.** Already means coding agents (`AGENTS.md`, `docs/agents/`, the `ready-for-agent` label) and EVE's own `agent/` concept.
- **Keep "Coach".** Collides with human Coaches once they exist.

## Consequences

- **Publicity-rights risk, accepted.** Arnold Schwarzenegger runs a fitness app (Pump Club) that sells "Arnold AI coaching" and has sued over unauthorised use of his name. Arnold is treated as a common first name with no reference to him: the system prompt forbids referencing or impersonating any real person, an eval checks it, and no copy, imagery or catchphrase may allude to him. If that line can't hold, the name has to change again.
- **Old names outlive the rename where installed builds depend on them.** `GET /v1/coach/models`, `coach.fitmeproject.com` and the `coach_pro_required` / `coach_pro_check_unavailable` codes keep working next to their `arnold` replacements until the minimum version gate has cut off builds that use them. The new app accepts both codes. The server switches to the `arnold_*` codes only after the cutoff.
- **Device state resets once.** The app's MMKV keys move to `arnold.*` with no migration: each User sees a fresh Conversation and the default model the first time.
- ADRs 0005 and 0006 keep their wording. Read "Coach" there as Arnold.
