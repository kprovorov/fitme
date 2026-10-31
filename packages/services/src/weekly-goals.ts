import {
  plans,
  type Transaction,
  weeklyGoalChanges,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { asc, eq, type SQL, sql } from "drizzle-orm";
import { jsonTimestamp } from "./json-timestamp";

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
      target: weeklyGoalChanges.target,
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
 * paging and eight chart columns. No saved counter: a fresh read derives the
 * same achievement from durable goals and logged training. Only occupied
 * training weeks are scanned: missing weeks break the run without generating
 * a calendar range from caller-writable goal timestamps. `now` is injectable
 * for Sunday/Monday verification; public callers never supply it.
 */
export async function getWeeklyGoals(
  tx: Transaction,
  userId: string,
  timeZone: string,
  now = new Date()
): Promise<WeeklyGoals> {
  const changes = await listWeeklyGoalChanges(tx, userId);
  if ((changes.at(-1)?.target ?? null) === null) {
    return { changes, streak: 0 };
  }
  const result = await tx.execute<{
    consecutive: boolean | null;
    current: boolean;
    count: number;
    target: number | null;
  }>(sql`
    with first_goal as (
      select recorded_at at time zone ${timeZone} as at, target
      from ${weeklyGoalChanges}
      where user_id = ${userId}
      order by recorded_at, id limit 1
    ), bounds as (
      select date_trunc('week', ${now.toISOString()}::timestamptz at time zone ${timeZone}) as current_week
    ), counts as (
      select date_trunc('week', ${workoutSessions.startedAt} at time zone ${timeZone}) as start,
        count(*)::int as count
      from ${workoutSessions}
      where ${workoutSessions.userId} = ${userId}
        and ${workoutSessions.finishedAt} is not null
        and ${workoutSessions.finishedAt} <= ${now.toISOString()}::timestamptz
        and exists (
          select 1 from ${workoutSessionExercises}
          join ${workoutSessionExerciseSets}
            on ${workoutSessionExerciseSets.workoutSessionExerciseId} = ${workoutSessionExercises.id}
          where ${workoutSessionExercises.workoutSessionId} = ${workoutSessions.id}
            and ${workoutSessionExerciseSets.repsCompleted} > 0
        )
      group by 1
    ), weeks as (
      select counts.start from counts cross join first_goal cross join bounds
      where counts.start >= date_trunc('week', first_goal.at)
        and counts.start <= bounds.current_week
      union
      select current_week from bounds
    )
    select weeks.start = bounds.current_week as current,
      weeks.start + interval '1 week' = lag(weeks.start) over (order by weeks.start desc) as consecutive,
      coalesce(counts.count, 0)::int as count,
      case when first_goal.at >= weeks.start + interval '1 week' then null
        when first_goal.at >= weeks.start
        then first_goal.target else previous.target end as target
    from weeks cross join bounds cross join first_goal
    left join counts on counts.start = weeks.start
    left join lateral (
      select target from ${weeklyGoalChanges}
      where user_id = ${userId}
        and recorded_at < weeks.start at time zone ${timeZone}
      order by recorded_at desc, id desc limit 1
    ) as previous on true
    order by weeks.start desc
  `);
  let streak = 0;
  for (const week of result.rows) {
    // Only occupied training weeks and the current week are read. A missing
    // week breaks the run without expanding caller-controlled date ranges.
    if (!(week.current || week.consecutive)) {
      break;
    }
    const hit = week.target !== null && week.count >= week.target;
    // An unfinished current week is pending, including one with no known goal.
    if (week.current && !hit) {
      continue;
    }
    // A missed completed week or an unknown goal ends the run. At the first
    // partial week this simply stops at the tracking boundary, with no penalty.
    if (!hit) {
      break;
    }
    streak += 1;
  }
  return { changes, streak };
}
