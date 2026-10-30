# History redesign: interview decisions

Design discovery completed on 2026-10-30 through grill-with-docs. The User confirmed that these decisions capture the complete shared understanding of the redesign. These notes record the agreed product behavior; they are not implementation approval or a Linear project specification.

The specification was subsequently published as [Redesign mobile History (P-FIT-44)](https://linear.app/provorov/project/redesign-mobile-history-c98e383127a4), with the User-confirmed testing seams: the rendered History Screen, database-backed service integration tests and the repository's required iOS visual checks. The Linear project description is the implementation specification.

## References and scope

- [History with content](https://www.figma.com/design/8RPWsghaJBjkkjGzPypuH0/Fitme?node-id=1401-2120&m=dev).
- [Empty History](https://www.figma.com/design/8RPWsghaJBjkkjGzPypuH0/Fitme?node-id=1390-1444&m=dev).
- All shown features are functional: monthly totals, Weekly goals, an eight-week chart, Weekly streaks, Personal record badges, redesigned rows and a contextual empty state.
- Scope is the mobile History Screen and its empty state. Row taps continue to open the existing Workout Summary, which is unchanged.
- Follow Figma's content layout using Fitme's native header and tab bar, shared Tokens and localized formatting. Existing dark-only, iOS-first, phone-only, accessibility and English/Ukrainian requirements apply.

## Listed history and progress

History continues to list finished Workout Sessions, newest first and grouped by their start month. Open Workout Sessions do not appear as history entries. Finished Workout Sessions with no positive-rep set remain visible.

Progress requires a finished Workout Session with at least one set containing positive reps. Only those Workout Sessions contribute to monthly totals, Weekly goals and Weekly streaks. Qualifying Workout Sessions from every Plan count, not just those from the current active Plan.

## Monthly totals

- Attribute a Workout Session to its start date in the device's current timezone, consistently with the list and weekly chart.
- "This month" always means the current calendar month, even while the User scrolls through older History.
- Count qualifying Workout Sessions. Sum their full start-to-finish elapsed time and their recorded weight multiplied by reps across logged sets.
- Do not estimate bodyweight volume. Missing weight contributes no volume.
- Show hours and minutes rather than a coarse value such as `12h+`.
- Use compact monthly volume: metric tonnes at 1,000 kg and above, otherwise kg; imperial totals use compact pounds. Rows retain ordinary kg/lb. Format in the App language using the device's regional conventions.
- Show zero volume as zero. Existing older History does not become an empty state when the current month has zero progress.

## Weekly goals, chart and streaks

The Weekly goal comes from the active Plan's training frequency, without a separate goal setting. Hide the goal/chart/streak section when there is no active Plan. Weeks run Monday through Sunday in the device's current timezone; a Workout Session belongs to the week of its start date.

Retain each week's original goal; changes to Plan frequency take effect the following Monday. Old weeks without a reliably known goal show Workout Session counts without success/failure judgments. The first tracked partial week can earn a goal hit and start a streak, but missing its goal incurs no penalty and that week is excluded from the completed-week hit-rate calculation.

The chart has eight columns: seven previous weeks plus the current week. It is informational, with no tapping or filtering. Cap the filled bars at each week's goal and show `+N` for extra qualifying Workout Sessions. The completed-week hit summary includes only completed, fully tracked weeks among the seven previous columns; exclude the current week, the first partial week and unknown-goal weeks, and hide the summary until an eligible week exists.

A Weekly streak counts consecutive weeks meeting the goal. Meeting the current week's goal extends it immediately; an unfinished current week preserves the previous streak until the week ends. A missed completed week resets the streak. A completed week without a known goal breaks the streak but is neutral, not failed. Hide the streak badge at zero.

## Personal records

Compare each Exercise's individual logged sets with results in earlier finished Workout Sessions for the same Exercise. A set with positive reps earns a PR by exceeding the previous highest weight, or exceeding the highest reps recorded at that highest weight. The first Workout Session's results for an Exercise establish a baseline; ties earn no PR.

Explicit zero weight permits bodyweight rep records while the previous highest weight is zero. Missing weight earns no PR. Once an Exercise has a weighted result, bodyweight reps cannot beat it. Do not award records for zero-rep sets.

One qualifying Exercise earns the Workout Session a PR badge. Badges are informational; include the Exercise and record result in the row's accessibility description. The row still opens the unchanged Workout Summary.

Evaluate existing recorded results chronologically to award historical badges, using the values available today. Retain those awards afterward. Later measurement-system changes must not remove earned awards or create awards solely through conversion and rounding. See [ADR 0015](../adr/0015-history-retains-weekly-goals-and-earned-personal-records.md).

## Empty state

Show the empty-state card only when there are no finished Workout Sessions. Existing History, including empty completions, remains visible even with zero monthly progress.

- With an open Workout Session, offer a direct Resume action.
- Otherwise, with an active Plan, offer a direct Start action for its next Workout and the contextual Plan/Exercise-count text shown in Figma.
- With no active Plan, offer Create a plan.

Preserve distinct loading, error/retry and content states, and pull-to-refresh.

## Month section counts

Monthly progress excludes empty completions, but the month section can contain those entries. Count every listed entry in the section heading and label it "entries" (localized), rather than "workouts". For example, October may show "15 entries" while the current-month summary shows "14 workouts": the first counts all visible finished Workout Sessions, and the second counts only those qualifying for progress.

## Verified constraints

At discovery time, Plan activation and frequency history are not stored, so old Weekly goals cannot be reconstructed reliably. Changing measurement system converts and rounds historical weights; original units and weights are not retained. Sets distinguish missing weight from explicit zero, and the Public API defines zero as bodyweight.

Relevant existing code: `apps/mobile/app/(tabs)/history/index.tsx`, `apps/mobile/components/views/workout-session-history-row.tsx`, `apps/mobile/hooks/queries/workout-sessions.ts`, `packages/core/src/workout-sessions.ts`, `packages/services/src/plans.ts` and `packages/services/src/profile.ts`.
