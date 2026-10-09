# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to what this repo's Linear team (Fitme) actually uses: Linear's native **Triage** status for `needs-triage`, and team labels for the rest.

| Label in mattpocock/skills | In our tracker                       | Meaning                                  |
| -------------------------- | ------------------------------------ | ---------------------------------------- |
| `needs-triage`             | `Triage` status, no state label      | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info` label (stays in Triage) | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent` label              | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human` label              | Requires human implementation            |
| `wontfix`                  | `wontfix` label + `Canceled` status  | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding entry from this table:

- **Apply `needs-triage`**: `save_issue` with `state: "Triage"` and remove any state label.
- **Apply `needs-info`**: add the `needs-info` label and leave the issue in `Triage`.
- **Apply `ready-for-agent` / `ready-for-human`**: add the label, remove `needs-info` if present, and accept the issue out of Triage with `state: "Todo"` (or `"Backlog"` if it isn't scheduled yet).
- **Apply `wontfix`**: add the label, then close with `state: "Canceled"`.

"Unlabeled / never triaged" means an issue in `Triage` with none of the labels above.

Category roles map to the team's type labels: `bug` → `Bug`; `enhancement` → `Feature` (new capability) or `Improvement` (change to existing behavior). `Idea` marks a raw idea that still needs specifying and counts as `enhancement`.

Edit the "In our tracker" column to match whatever vocabulary you actually use.
