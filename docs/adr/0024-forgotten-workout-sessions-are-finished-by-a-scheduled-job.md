---
status: accepted
date: 2026-11-25
---

# Forgotten Workout Sessions are finished by a scheduled job, backdated to their last set

A User who forgets to tap Finish leaves a Workout Session open: its timer keeps counting, a late finish inflates History and the Lifetime totals, and no other Workout can be started (ADR 0013). A scheduled job, about every 10 minutes, now closes every Forgotten Workout Session (`GLOSSARY.md`: no set logged for 3 hours, counted from the start when none was logged). One with a logged set goes through the same finish as a tap on Finish (Personal records, rotation, Weekly goal), only with `finished_at` set to the time its last set was logged. One without is discarded (deleted, as if it had never been started): there is no time to finish it at, and the User didn't train. Nothing tells the User, nothing marks the Workout Session as finished automatically, and it can't be reopened.

The job is the first in a new app, `apps/jobs`, the home of every scheduled job: private functions called by Vercel Schedules, with no public URL, no secret and no HTTP surface, and the logic in `@fitme/services` (ADR 0004). It runs through `withService`, because ADR 0003 only lets `asUser` take an id from a verified token and no caller is present here.

## Considered options

- **A scheduled job (chosen).** The Workout Session closes whether or not its User ever comes back, whichever app they use.
- **Lazily, on the User's next request.** No scheduler, but reads would start writing, and until that request the Workout Session stays open in the data.
- **The mobile app closes it.** Misses MCP, a closed app and old builds.
- **`pg_cron`.** The finish (Personal records, rotation, Weekly goal) would have to be duplicated in SQL, against ADR 0004.
- **3 hours since the start.** Would finish a long Workout Session while its User is still lifting. Between two logged sets a pause over 30 minutes almost always means the User has left, so 3 hours since the last set is safe.
- **A public route guarded by a cron secret.** The fallback if a private function can't be built: one more secret to store and rotate, and a route anyone can call.
- **The job in `apps/webhooks` or `apps/api`.** Both serve HTTP callers; a job has none, and their Hono builds produce a single public function.

## Consequences

- The job deletes and backdates User data with nobody watching, and neither can be undone. It re-checks that a Workout Session is still forgotten under the lock `logSet` takes, so a set logged just before the job wins and the Workout Session carries on.
- Only the automatic finish is backdated. A tap on Finish means now, however late it is.
- Any set log is activity, logging a set again included (it overwrites the set's time, so it also moves the finish). Adding, replacing or removing an Exercise, or removing a set, isn't: the sets that remain decide.
- Its Plan Update is never offered, since nobody is there to answer.
- The mobile app has to notice a Workout Session finished or deleted while its screen is open, whoever did it.
- Backdating keeps Personal records in order: with one open Workout Session per User, nothing else can be finished between its last set and the job.
- A job that stops running fails silently by itself, so a Sentry cron monitor watches it. One Workout Session failing is reported and tried again on the next run. Disabling the schedule in Vercel is the off switch.
- Vercel Schedules is in beta, doesn't retry a function and may overlap runs or deliver one twice. The re-check makes each harmless, and a missed run is made up by the next.
