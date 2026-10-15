# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to what this repo's Linear workspace actually uses: Linear's native **Triage** status for `needs-triage`, and workspace-level labels for the rest.

| Label in mattpocock/skills | In our tracker                       | Meaning                                  |
| -------------------------- | ------------------------------------ | ---------------------------------------- |
| `needs-triage`             | `Triage` status, no state label      | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info` label (stays in Triage) | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent` label              | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human` label              | Requires human implementation            |
| `wontfix`                  | `wontfix` label + `Canceled` status  | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding entry from this table:

An issue carries at most one state label. Every transition first removes all the other state labels (`needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) in the same `save_issue` call, leaving type labels (`bug`, `feature`, …) untouched:

- **Apply `needs-triage`**: remove every state label and set `state: "Triage"`.
- **Apply `needs-info`**: add `needs-info` and set `state: "Triage"` (moving the issue back if it had been accepted).
- **Apply `ready-for-agent` / `ready-for-human`**: add the label and accept the issue out of Triage with `state: "Backlog"`. Never move an issue to `Todo`; that's the maintainer's call.
- **Apply `wontfix`**: add the label and close with `state: "Canceled"`.

"Unlabeled / never triaged" means an issue in `Triage` with none of the labels above.

Category roles map to the workspace's type labels: `bug` → `bug`; `enhancement` → `feature` (new capability) or `improvement` (change to existing behavior). `idea` marks a raw idea that still needs specifying and counts as `enhancement`.

Edit the "In our tracker" column to match whatever vocabulary you actually use.
