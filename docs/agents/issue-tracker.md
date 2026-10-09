# Issue tracker: Linear

Issues and specs for this repo live in Linear, team **Fitme** (key `FIT`, so issues are `FIT-<n>`). Use the Linear MCP tools (`mcp__plugin_linear_linear__*`) for all operations. Pass markdown with real newlines, not `\n` escapes.

## Conventions

- **Create an issue**: `save_issue` with `team: "Fitme"`, `title`, `description`, and one type label (`Feature`, `Bug`, `Improvement`, or `Idea` for a raw idea that still needs specifying). Pass `state: "Triage"` for a new request or bug report; when the skill already knows its triage role (e.g. `/to-tickets` writing agent-ready tickets), apply that role instead (see `triage-labels.md`).
- **Read an issue**: `get_issue` with the identifier (`FIT-55`) and `includeRelations: true`; `list_comments` for the conversation.
- **List issues**: `list_issues` with `team: "Fitme"` and `label` / `state` / `parentId` filters.
- **Make an issue a sub-issue of a parent**: `save_issue` with `parentId: "FIT-<parent>"`. A feature is a parent issue (often labelled `Idea`) whose body holds the agreed behavior; implementation work is its sub-issues.
- **Comment on an issue**: `save_comment` with `issueId` and `body`.
- **Apply / remove labels**: `save_issue` with `id` and `addLabels` / `removeLabels`. If your Linear tool lacks those, read the issue's current labels and pass the complete updated set as `labels`, which replaces the whole set; never send a partial `labels` array.
- **Close**: comment first, then `save_issue` with `state: "Done"` (or `"Canceled"` for wontfix, `"Duplicate"` with `duplicateOf` for duplicates).

Workflow states: `Triage` → `Backlog` → `Todo` → `In Progress` → `In Review` → `Done` (plus `Canceled`, `Duplicate`). `Triage` is Linear's triage inbox and stands for the `needs-triage` role; see `triage-labels.md`.

Branches and PRs reference the issue identifier (e.g. a PR titled `feat(mobile): … (FIT-60)`), which links them in Linear.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external GitHub PRs on `kprovorov/fitme` as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a Linear issue in the Fitme team.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a sub-issue of the map (`parentId: "<map>"`), labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Linear's native blocking relations: `save_issue` with `id: "<child>"` and `blockedBy: ["FIT-<n>"]`. A ticket is unblocked when every blocker is `Done` / `Canceled`.
- **Frontier query**: `list_issues` with `parentId: "<map>"`, keep open, unassigned children, and drop any whose `get_issue` relations show an open `blockedBy`; first in map order wins.
- **Claim**: `save_issue` with `assignee: "me"` and `state: "In Progress"`, the session's first write.
- **Resolve**: `save_comment` with the answer, then `save_issue` with `state: "Done"`, then append a context pointer (gist + link) to the map's Decisions-so-far.
