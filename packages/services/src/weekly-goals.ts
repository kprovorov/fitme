import { plans, type Transaction, weeklyGoalChanges } from "@fitme/db";
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
