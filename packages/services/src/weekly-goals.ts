import { MAX_FREQUENCY, MIN_FREQUENCY } from "@fitme/core/limits";
import { calendarOffsetMinutes } from "@fitme/core/weekly-goals";
import {
  plans,
  type Transaction,
  weeklyGoalChanges,
  workoutSessionProgress,
} from "@fitme/db";
import { asc, eq, type SQL, sql } from "drizzle-orm";
import { jsonTimestamp } from "./json-timestamp";

// The Weekly goal log was introduced by migration 20261031120000. No
// service-recorded goal predates its release; caller-chosen log timestamps
// must never move this trusted tracking boundary backwards.
const TRACKING_RELEASED_AT = "2026-10-31T00:00:00Z";

// Older direct Data API writes could record a target outside the domain.
// Keep that evidence as an unknown goal, never as a query limit or a 500.
const knownTarget = sql<number | null>`case
  when ${weeklyGoalChanges.target} between ${MIN_FREQUENCY} and ${MAX_FREQUENCY}
  then ${weeklyGoalChanges.target} else null end`;

/**
 * One change of the User's Weekly goal (ADR 0015): the active Plan's training
 * frequency from `recorded_at` on, or `null` once no Plan is active.
 */
export interface WeeklyGoalChange {
  recorded_at: string;
  target: number | null;
}

/** The active Plan's frequency, the Weekly goal; `null` without one. */
const currentTarget = (userId: string) => sql`(
  select ${plans.frequency}::smallint
  from ${plans}
  where ${plans.userId} = ${userId}
    and ${plans.isActive}
    and ${plans.deletedAt} is null
    and ${plans.frequency} between 1 and 7
  order by ${plans.createdAt} desc nulls last, ${plans.id}
  limit 1
)`;

/** The latest recorded Weekly goal, `null` for none (or no Plan). */
const latestTarget = (userId: string) => sql`(
  select ${weeklyGoalChanges.target}
  from ${weeklyGoalChanges}
  where ${weeklyGoalChanges.userId} = ${userId}
  order by ${weeklyGoalChanges.recordedAt} desc, ${weeklyGoalChanges.id} desc
  limit 1
)`;

/**
 * Records the User's Weekly goal as it is now, in `tx` (from `asUser`), when
 * it differs from the last one recorded: every write that can change the
 * active Plan or its frequency calls it last, in its own transaction, so
 * the log follows them whoever the caller is (the Public API, MCP, Arnold).
 * Finishing a Workout Session calls it too, which starts tracking for a User
 * whose Plan was activated by a writer that bypassed the services. Safe to
 * repeat: an unchanged goal adds nothing, and so does "no Plan" before
 * tracking has started (the first change is the first goal).
 *
 * The log is append-only, so a recorded goal is never rewritten. Takes no
 * lock of its own: the Plan writes calling it already hold the User's Plan
 * rows, and a rare race between other callers can only append an equal
 * goal twice, which reads the same.
 */
export const recordWeeklyGoal = async (
  tx: Transaction,
  userId: string
): Promise<void> => {
  await tx.execute(sql`
    insert into ${weeklyGoalChanges} (user_id, recorded_at, target)
    select ${userId}, clock_timestamp(), now_goal.target
    from (select ${currentTarget(userId)} as target) as now_goal
    where now_goal.target is distinct from ${latestTarget(userId)}
      and (
        now_goal.target is not null
        or exists (
          select 1 from ${weeklyGoalChanges}
          where ${weeklyGoalChanges.userId} = ${userId}
        )
      )
  `);
};

/**
 * Every change of the User's Weekly goal, oldest first, in `tx` (from
 * `asUser`). The first one started tracking; weeks before it have no known
 * goal. Unpaged: a change is a Plan activation or a frequency edit.
 */
export const listWeeklyGoalChanges = (
  tx: Transaction,
  userId: string
): Promise<WeeklyGoalChange[]> =>
  tx
    .select({
      // NOT NULL, so never `null`
      recorded_at: jsonTimestamp(weeklyGoalChanges.recordedAt) as SQL<string>,
      target: knownTarget,
    })
    .from(weeklyGoalChanges)
    .where(eq(weeklyGoalChanges.userId, userId))
    .orderBy(asc(weeklyGoalChanges.recordedAt), asc(weeklyGoalChanges.id));

export interface WeeklyGoals {
  changes: WeeklyGoalChange[];
  streak: number;
}

/**
 * Retained goals and the lifetime Weekly streak, in the caller's timezone.
 * Reads all qualifying training across Plans, independently of History's
 * paging and eight chart columns. No saved streak counter: a fresh read
 * derives the same achievement from durable goals and logged training. Walks backwards
 * from this week, stopping in SQL at the first completed miss/unknown week.
 * Each week's indexed qualification-cache read stops once its goal is met,
 * without scanning rejected Sessions or their children. The tracking release
 * bounds the total walk without truncating any legitimate retained history.
 * `now` and `trackingStartedAt` are clock seams for historical fixtures;
 * public callers never supply either one.
 */
export async function getWeeklyGoals(
  tx: Transaction,
  userId: string,
  timeZone: string,
  now = new Date(),
  trackingStartedAt = new Date(TRACKING_RELEASED_AT)
): Promise<WeeklyGoals> {
  const changes = await listWeeklyGoalChanges(tx, userId);
  if ((changes.at(-1)?.target ?? null) === null) {
    return { changes, streak: 0 };
  }
  const offset = calendarOffsetMinutes(timeZone);
  // A numeric interval keeps Expo's ISO sign; PostgreSQL timezone strings
  // such as GMT+1 instead use POSIX's reversed sign. IANA zones retain DST.
  const zone =
    offset === null
      ? sql`${timeZone}::text`
      : sql`make_interval(mins => ${offset}::int)`;
  const weekHit = (start: SQL) => sql`(
    -- Keep timezone functions outside the RLS-protected range predicates:
    -- plain bound values let PostgreSQL use the (User, start) index.
    with week_bounds as materialized (
      select (${start}) at time zone ${zone} as utc_start,
        (${start} + interval '1 week') at time zone ${zone} as utc_end
    )
    select case when goal.target is null then false else (
      select count(*) >= goal.target from (
        select 1 from ${workoutSessionProgress}
        where ${workoutSessionProgress.userId} = ${userId}
          and ${workoutSessionProgress.startedAt} >= week_bounds.utc_start
          and ${workoutSessionProgress.startedAt} < week_bounds.utc_end
          and ${workoutSessionProgress.finishedAt} is not null
          and ${workoutSessionProgress.finishedAt} <= ${now.toISOString()}::timestamptz
          and ${workoutSessionProgress.completedSetCount} > 0
        order by ${workoutSessionProgress.startedAt}
        limit least(goal.target, ${MAX_FREQUENCY})
      ) as qualifying
    ) end
    from week_bounds cross join lateral (
      select case when first_goal.at >= ${start} + interval '1 week' then null
        when first_goal.at >= ${start} then first_goal.target
        else previous.target end as target
      from first_goal
      left join lateral (
        select ${knownTarget} as target from ${weeklyGoalChanges}
        where user_id = ${userId}
          and recorded_at < week_bounds.utc_start
        order by recorded_at desc, id desc limit 1
      ) as previous on true
    ) as goal
  )`;
  const result = await tx.execute<{ streak: number }>(sql`
    with recursive first_goal as (
      select recorded_at at time zone ${zone} as at, ${knownTarget} as target
      from ${weeklyGoalChanges}
      where user_id = ${userId}
      order by recorded_at, id limit 1
    ), bounds as (
      select date_trunc('week', ${now.toISOString()}::timestamptz at time zone ${zone}) as current_week,
        date_trunc('week', ${trackingStartedAt.toISOString()}::timestamptz at time zone ${zone}) as tracking_week
    ), walk as (
      select current_week as start, ${weekHit(sql`bounds.current_week`)} as hit
      from bounds
      where current_week >= tracking_week
      union all
      select walk.start - interval '1 week', ${weekHit(sql`(walk.start - interval '1 week')`)}
      from walk cross join bounds cross join first_goal
      where (walk.hit or walk.start = bounds.current_week)
        and walk.start - interval '1 week' >= date_trunc('week', first_goal.at)
        and walk.start - interval '1 week' >= bounds.tracking_week
    )
    select count(*) filter (where hit)::int as streak from walk
  `);
  return { changes, streak: result.rows[0]?.streak ?? 0 };
}
