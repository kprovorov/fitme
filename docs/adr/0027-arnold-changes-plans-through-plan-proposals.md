---
status: accepted
date: 2026-11-27
---

# Arnold changes Plans through Plan Proposals the User accepts

Arnold used to change a Plan the moment he was asked: six tools edited it row by row, and the User found out what changed by reading his answer. A new Plan was different: Arnold showed a card and the app saved it through `POST /v1/plans`. Now every change Arnold makes to a Plan, a one-set tweak and a whole new Plan alike, is a Plan Proposal: a card showing each Exercise's sets with reps, weight and rest, which the User accepts, declines or asks Arnold to change. Nothing is saved before Accept.

Arnold's save tool is held by eve's tool approval. The card is drawn from the waiting call, Accept lets the call run on the server, and a message the User sends instead withdraws it. So what the User sees is exactly what gets saved, Arnold learns the outcome, and whether a proposal was saved is recorded in the Conversation rather than on the phone.

Everything else Arnold writes stays immediate: activating a Plan, the Profile, Exercise notes and removing a set from the open Workout Session.

## Considered options

- **Arnold's save waits for Accept (chosen).** The server saves, so the accepted state survives a restart and can't be offered twice, and an old proposal can no longer be accepted once the Conversation has moved on.
- **The app saves an accepted proposal through the Public API**, as the plan card's Save did. It needs no server work, but the accepted state lives only on the phone (a reopened card offered Save again and made a second Plan), Arnold never learns whether it was saved, and an old card can overwrite newer changes.
- **Arnold applies the edits after the User types "yes".** There is nothing to tap, the model decides what counts as a yes, and what gets saved is whatever he types the second time, not what the card showed.

## Consequences

- Asking for changes keeps the turn open, so several rounds share one turn. The cap of 20 model calls and $1.00 now restarts each time the User acts, with a message or with Accept or Decline, not with each turn. Otherwise a refused Accept, which has Arnold read the Plan and propose again, could run out of budget and end with nothing shown. This amends ADR 0006.
- A proposal to change a Plan carries only the Workouts it changes, each in full, and the rest of the Plan stays as it is. Writing out the whole Plan for a one-set tweak, and again for every revision, would be slow and costly. A new Plan carries everything.
- Any message withdraws a waiting proposal, an unrelated question included. Only the newest proposal can wait.
- Accept is refused when the Plan changed in any way since Arnold read it: an edit in the Plan editor, a Plan Update, or a finished Workout moving to the end of the rotation, which a whole-Plan save would otherwise put back. Nothing is saved and Arnold proposes again. The Plan editor's own save keeps ADR 0016's last save wins.
- A proposal is checked (Exercise slugs, row ids, bounds) before the User sees it, since a check that ran only after Accept would fail a proposal the User had already approved.
- Arnold creates Workouts through the whole-Plan save, so his server gives them Covers as the Public API and MCP do (ADR 0014). For that he reads the Legacy Library's index again, which he stopped doing when his slug checks moved to the new Library (ADR 0022).
- Creating a Plan from an accepted proposal is guarded against a re-run step saving it twice.
- A build that can't draw the card would show nothing to accept. Each build tells Arnold which cards it can show, and one that can't show the proposal keeps the direct edit tools until the minimum version gate cuts it off.
- The app no longer makes the save, so it sends `Plan Saved`, `Plan Edited` and `Plan Activated` when it sees Arnold's save land.
