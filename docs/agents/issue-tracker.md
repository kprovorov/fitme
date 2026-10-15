# Issue tracker: Linear

Issues and specs (as projects) for this repo live in Linear, team **Fitme** (key `FIT`, so issues are `FIT-<n>`). Use the Linear MCP tools (`mcp__claude_ai_Linear__*`) for all operations. Pass markdown with real newlines, not `\n` escapes.

## Conventions

- **Create an issue**: `save_issue` with `team: "Fitme"`, `title`, `description`, one type label (`feature`, `bug`, `improvement`, or `idea` for a raw idea that still needs specifying) and an area label for every app or area the issue is expected to change (see **Area labels**). Always pass `state: "Backlog"`, never `"Todo"` or `"Triage"`: moving an issue to `Todo` is the maintainer's call. When the skill knows its triage role (e.g. `/to-tickets` writing agent-ready tickets), add that role's label too (see `triage-labels.md`), still in `Backlog`.
- **Read an issue**: `get_issue` with the identifier (`FIT-55`) and `includeRelations: true`; `list_comments` for the conversation.
- **List issues**: `list_issues` with `team: "Fitme"` and `label` / `state` / `parentId` filters.
- **Make an issue a sub-issue of a parent**: `save_issue` with `parentId: "FIT-<parent>"`. Use it to split one issue into smaller pieces; a feature with a spec is a project, not a parent issue (see **Specs live in projects** below).
- **Comment on an issue**: `save_comment` with `issueId` and `body`.
- **Apply / remove labels**: `save_issue` with `id` and `addLabels` / `removeLabels`. If your Linear tool lacks those, read the issue's current labels and pass the complete updated set as `labels`, which replaces the whole set; never send a partial `labels` array.
- **Close**: comment first, then `save_issue` with `state: "Done"` (or `"Canceled"` for wontfix, `"Duplicate"` with `duplicateOf` for duplicates).

## Area labels

Every issue carries one label per area it's expected to change, alongside its type and triage labels: `mobile` (`apps/mobile`), `web` (`apps/web`), `site` (`apps/site`), `mcp` (`apps/mcp`), `api` (`apps/api`), `coach` (`apps/coach`), `webhooks` (`apps/webhooks`), `database` (schema, migrations, RLS, RPCs and pgTAP in `packages/supabase`, plus `packages/db`), `ci` (`.github/` workflows, release and build pipelines, and repo-wide tooling: root `turbo.json` / `package.json`, Biome, `packages/typescript-config`) and `docs` (`AGENTS.md`, `docs/`, ADRs, `GLOSSARY.md`). Add all that apply (a Coach feature with a new mobile screen is `coach` + `mobile`). Other shared packages (`packages/core`, `packages/services`) have no label of their own: label the apps whose behaviour the change affects (e.g. a `packages/services` change used by MCP and the Coach is `mcp` + `coach`). A feature that needs a migration gets `database` next to its app labels. Docs updated as part of a code change (e.g. the `AGENTS.md` entry for a new route) don't earn `docs`; it's for issues whose point is the docs. When an issue's scope changes, update its area labels too (see **Apply / remove labels**).

Workflow states: `Triage` → `Backlog` → `Todo` → `In Progress` → `In Review` → `Done` (plus `Canceled`, `Duplicate`). `Triage` is Linear's triage inbox and stands for the `needs-triage` role; see `triage-labels.md`.

Branches and PRs reference the issue identifier (e.g. a PR titled `feat(mobile): … (FIT-60)`), which links them in Linear.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external GitHub PRs on `kprovorov/fitme` as feature requests; `/triage` reads this flag.)_

## Specs live in projects

A spec (e.g. from `/to-spec`) is a Linear **project**, not an issue: `save_project` with `addTeams: ["Fitme"]`, `lead: "me"`, `state: "Planned"`, a one-line `summary` and the whole spec as the project `description`. The implementation issues (e.g. from `/to-tickets`, including `ready-for-human` ones for manual setup) are created in that project with `save_issue` and `project: "<project name>"`. Read a spec with `get_project`; list its issues with `list_issues` and `project`. Prior art: "Migrate authentication to Clerk", "MCP OAuth through Clerk".

Projects carry no labels: never pass `labels` / `addLabels` to `save_project`, and ignore a skill's instruction to label the spec (e.g. `/to-spec`'s `ready-for-agent`). Triage labels go on the project's issues only.

## Tasks for humans

An issue labelled `ready-for-human` (manual setup, dashboard config, secrets, deploys) is done by a person without the agent's context, so its description must be a complete guide they can follow without guessing:

- **Step-by-step guide**: numbered steps in the order to do them, each naming the exact place (service, dashboard page, Vercel project and environment, file path) and the exact action, command or value. Say which steps depend on a PR being merged or deployed first.
- **Environment variables**: when any env var is added, changed or removed, list every one in a table: variable name, app / Vercel project, environment(s) (local, preview, production), the exact value or exactly where to get it (e.g. `openssl rand -hex 32`, the dashboard page holding the key), and whether it's new, changed or removed. Never write "set the usual vars" or point elsewhere for the list.
- **Checklist**: a `- [ ]` checklist covering every required action (one item per variable, setting, deploy and verification), so the person can tick them off and nothing is skipped.
- **Verification**: how to confirm it worked (a request to make, a log or dashboard to check, the expected result).

## When a skill says "publish to the issue tracker"

Create a Linear issue in the Fitme team. If what's being published is a spec, create a project instead (see **Specs live in projects**).

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a sub-issue of the map (`parentId: "<map>"`), labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Linear's native blocking relations: `save_issue` with `id: "<child>"` and `blockedBy: ["FIT-<n>"]`. A ticket is unblocked when every blocker is closed. **Closed** means `statusType` is `completed`, `canceled` or `duplicate` (`Done`, `Canceled`, `Duplicate`); any other `statusType` is open.
- **Frontier query**: `list_issues` with `parentId: "<map>"` (the default response carries `priority`, `status` and `assignee`; follow `cursor` while `hasNextPage`); keep open, unassigned children, and drop any with an open blocker (check each `blockedBy` from `get_issue` relations with `get_issue` on the blocker for its `statusType`). Linear's manual sort order isn't exposed to agents, so "map order" is: highest `priority` first (1 Urgent → 4 Low, with 0 No priority last), then lowest `FIT-<n>`. Set priorities on the children when the order matters.
- **Claim**: `save_issue` with `assignee: "me"` and `state: "In Progress"`, the session's first write.
- **Resolve**: `save_comment` with the answer, then `save_issue` with `state: "Done"`, then append a context pointer (gist + link) to the map's Decisions-so-far.
