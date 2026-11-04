---
status: accepted
date: 2026-11-03
---

# The Plan builder saves the whole Plan at once, keeping ids

Users without Pro can't reach Arnold, so they need to build and edit Plans by hand. The builder works on a local draft that Cancel discards. Save sends the whole Plan in one transaction: `POST /v1/plans` when creating, and a new `PUT /v1/plans/{id}` when editing. That `PUT` keeps ids. A Workout, Workout Exercise or set sent with its id is updated in place, one sent without an id is created, and one the body leaves out is deleted. So Workout Sessions stay linked to their Workout, a kept Workout keeps its Cover (ADR 0014; only new Workouts get one picked), and the next Plan Update still matches.

## Considered options

- **Whole Plan, ids kept (chosen).** One editor serves both create and edit, there's one write route, Cancel is a real undo, and history keeps its links.
- **Autosave each change through fine-grained routes** (as Arnold's tools do). This means a request per tap, no Cancel, and a dozen new Public API routes.
- **The existing `PUT /v1/plans/{id}/workouts`.** It needs no new route, but every Workout gets a new id on every save, so history rows lose their Workout, Covers are picked again and the Plan Update can't match. That's fine for Arnold's or an MCP client's full rewrite, but wrong for a small edit by hand.

## Consequences

- The last save wins, with no version check. If Arnold, an MCP client or another device changes the Plan while a draft is open, Save overwrites it, and anything added meanwhile is deleted. This is a deliberate trade-off: the case is rare, and a 409-and-reload flow wasn't worth the cost.
- Editing a Workout whose Workout Session is open is allowed. The open session already copied its sets, deleting the Workout leaves it running unlinked, and its Plan Update compares against the edited Workout.
