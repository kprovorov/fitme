---
status: accepted
date: 2026-11-25
---

# Removed sets leave order gaps, and the Plan Update matches sets by them

A User can remove a set from an open Workout Session (in the app, through Arnold, MCP or the Public API), and the Plan Update then offers to remove the matching set from the Plan. A Workout Session's set doesn't know which Plan set it was copied from, but starting a Workout Session copies each Plan set's `order` as is. So removing a set leaves the remaining sets' `order` alone, and a Plan set whose `order` the Workout Session no longer has is one the User removed. This is how removed Exercises are already matched, one level down. The app numbers the rows by position, so the User never sees the gap.

## Considered options

- **Keep the gaps (chosen).** No migration, and the Plan Update can name the exact Plan set that goes ("Remove 1 set from Squat · 10×40 kg").
- **Renumber the remaining sets.** Every row's `order` would match what it shows, but after removing set 1 of 3 the Workout Session looks like one that removed set 3, and the Plan Update would drop the wrong set.
- **A link to the Plan set on each Workout Session set.** It's exact, but it needs a migration, and the Workout Sessions already open or finished wouldn't have it.

## Consequences

- Only the net difference is offered: four sets to three removes one, four to four nothing, four to five adds one. When more sets were removed than added, the Plan loses the first removed ones by position. A skipped, unlogged set isn't a removal, and the Plan sets that stay keep their targets.
- An add takes the highest `order` + 1, so after removing the last set it reuses that `order`. An empty `reps_recommended` marks the set as added. Replacing the Exercise and switching back turns that marker into 0, so if the User also removed several sets, the Plan Update can name a different one of them.
- A set the Plan gains while the Workout Session is open looks removed, as an Exercise already does. The User sees it named and can decline.
- With every set removed, the Plan Update offers to remove the Exercise (`remove_exercise`, which every build already shows and applies). An Exercise replaced and then emptied offers nothing.
- `PlanUpdateChange` is a closed `oneOf`, so a new kind would break the `/v1` contract. Set removals are a separate, additive list, and the server answers and applies them only for a caller that opts in, so an old build never applies a removal it couldn't show.
- Old builds print the stored `order`, so they show the gap (#1 #3 #4) when Arnold or an MCP client removes a set.
