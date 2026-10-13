# Finish workout suggestion (FIT-55): regression coverage

After the last untracked set of an active workout session is saved, the app
suggests finishing the workout. This happens at most once per session, and on
both workout session routes:

- **Plan route**: `/plans/:planId/workouts/:workoutId/sessions/:sessionId`,
  opened from a workout card (Home or plan screen).
- **Session route**: `/workout-sessions/:workoutSessionId`, opened from a link,
  e.g. `xcrun simctl openurl booted fitme://workout-sessions/<session id>`.

On both routes, sets are tracked on the exercise screen
(`.../sessions/:sessionId/exercises/:exerciseId`), which is usually where the
suggestion appears. If the user goes back before the save lands, it appears
on the route's own session screen instead.

## Automated coverage

`apps/mobile/__tests__/finish-workout-suggestion.integration.test.tsx` runs
every scenario below once per route (`pnpm --filter @fitme/mobile exec jest
__tests__/finish-workout-suggestion`). It mounts the real screens, set rows,
suggestion controller and finish flow. Only these edges are faked: Supabase
(the in-memory `test-utils/fake-workout-backend.ts`), expo-router (a stack
that keeps lower screens mounted and focuses the top one), and the SwiftUI
primitives (Button, Dialog, DropdownMenu, Card).

| Scenario | Test |
| --- | --- |
| Last tracked set triggers exactly once | suggests exactly once when the last untracked set is saved; suggests on the session screen when the last save lands after going back |
| Partial session never triggers | never suggests while the session is only partly tracked |
| Save error never triggers | never suggests when saving the last set fails, and does once it succeeds; never suggests when the completion check cannot read the session |
| Sets tracked in any order | suggests whichever order the sets are tracked in |
| Keep Training / dismiss stops further prompts | keeps the session going and never suggests again after Keep Training / the close button / swiping the sheet away |
| Adding and finishing another set does not prompt again | does not suggest again for a set added and tracked after the suggestion; … for an exercise added and tracked after the suggestion |
| Edits and deletions do not trigger | never suggests on edits of tracked sets (including a set tracked with 0 reps); never suggests when deleting the last untracked exercise completes the session |
| Zero reps count as tracked | counts zero reps as tracked |
| Finish opens Summary | finishes the workout and opens its Summary from the suggestion; finishes only once on repeated taps of Finish; keeps the session active and lets the user retry when finishing fails |
| Sessions with no exercises or no sets | never suggests for a session without exercises; never suggests while an exercise has no sets |
| Fast duplicate saves | suggests once for fast duplicate saves of the last set |
| Reopening the same session | never suggests when reopening an incomplete or fully tracked session; does not suggest again after reopening the suggested session |
| Session already finished | never suggests for a session that is already finished |
| Another session can prompt on its own | suggests separately for another workout session |

The app has no way to delete a single set, only a whole exercise (from the
session screen's menu). So deletion is covered through exercise deletion only.

Lower layers have their own tests:
`packages/core/src/__tests__/finish-suggestion.test.ts` (trigger rules, races,
suppression that persists across controllers),
`packages/core/src/__tests__/workout-sessions.test.ts` (eligibility),
`components/workout-sessions/__tests__/` (dialog and per-screen wiring) and
`hooks/__tests__/finish-workout-session.test.tsx` (finish and Summary
navigation).

## Automation gaps

The following can't be covered in Jest, so they need manual QA on a device or
simulator (checklist below):

- **The native sheet**: SwiftUI presentation, swipe-down and backdrop
  dismissal, the sheet being locked while finishing, VoiceOver labels. The
  tests use a React Native stand-in that fires the same `isPresentedChange`
  event.
- **Real navigation**: expo-router's native stack, focus changes, back
  gestures and the unwinding to Summary. The tests use a simplified stack.
- **Real backend**: Supabase, RLS and network latency. The tests use an
  in-memory backend that answers asynchronously and can delay or fail
  requests.
- **App restart mid-session**: the "already suggested" flag is stored in
  MMKV. Persistence is covered at controller level, but there is no
  end-to-end test of a cold start.
- **Maestro**: this suite has no Maestro flow (`e2e/flows`). It would need
  a seeded plan with workouts and the macOS simulator job in `.github/workflows/e2e.yml`,
  which can only be verified on CI. Add one when plan seeding for E2E exists.

## Manual QA checklist

Run each section on **both routes**. Start with a fresh session of a workout
with at least two exercises of two or more sets each.

### Triggering

- [ ] Track every set except the last: no suggestion.
- [ ] Track the last set: the "Workout completed!" sheet appears once, right
      after the set is saved.
- [ ] Track sets out of order (second exercise first): the sheet appears
      after whichever set is tracked last.
- [ ] Track the last set with **0** reps: the sheet appears.
- [ ] Turn on airplane mode and track the last set: the save fails and no
      sheet appears. Back online, track it again: the sheet appears.
- [ ] Double-tap the checkmark of the last set: only one sheet appears.

### Actions

- [ ] **Keep Training**: the sheet closes, the session stays active, and you
      stay on the exercise screen.
- [ ] Close button (✕) and swipe-down: same as Keep Training.
- [ ] After Keep Training, add a set and track it: no sheet.
- [ ] After Keep Training, add an exercise, add a set to it and track it: no
      sheet.
- [ ] **Finish Workout**: the button shows a spinner, the sheet can't be
      swiped away, and Summary opens. Going back from Summary doesn't return
      to the exercise screen.
- [ ] Finish Workout in airplane mode: an alert appears, the session stays
      active and Finish can be tapped again.

### No suggestion

- [ ] Edit an already tracked set (pencil, then checkmark) in a fully
      tracked session, including a set tracked with 0 reps: no sheet.
- [ ] With one exercise fully tracked and another untracked, delete the
      untracked exercise from the session screen: no sheet. (Single sets
      can't be deleted.)
- [ ] On a slow connection, track the last set and go back right away: the
      sheet appears on the session screen, and Finish opens Summary.
- [ ] Open a fully tracked session that was never suggested: no sheet on
      load.
- [ ] Leave the session while the sheet is open (e.g. kill the app), then
      reopen it: no sheet. Track a newly added set: still no sheet.
- [ ] Open a finished session (a link to `/workout-sessions/<id>` of a
      finished session): no sheet, even after logging a remaining set.
- [ ] A session with an exercise that has no sets: tracking all other sets
      shows no sheet.

### Other sessions

- [ ] After a session was suggested, start a session of another workout and
      track all its sets: its own sheet appears.
