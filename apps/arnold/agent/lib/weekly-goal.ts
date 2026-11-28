import { weeklyGoalOverview } from "@fitme/core/weekly-goals";
import { asUser } from "@fitme/db";
import { getWeeklyGoals } from "@fitme/services/weekly-goals";
import { listWorkoutSessions } from "@fitme/services/workout-sessions";
import type { WorkoutSessionSummary } from "@fitme/services/workout-sessions";

/** The weeks shown, this one included: History's chart. */
export const WEEK_COUNT = 8;

/** Finished Workout Sessions read per page, newest first. */
export const SESSION_PAGE_SIZE = 50;

/** At most this many pages, so a User training several times a day is still bounded. */
const MAX_SESSION_PAGES = 10;

const DAY_MS = 86_400_000;

// A day past the weeks shown, whatever the zone's offset from the server's.
const LOOKBACK_MS = (WEEK_COUNT * 7 + 1) * DAY_MS;

/** What `get_weekly_goal` says without an active Plan. */
export const NO_WEEKLY_GOAL = "No active plan, so the user has no Weekly goal";

/**
 * The User's Weekly goal as `get_weekly_goal` and `show_weekly_goal` both
 * answer it, so Arnold's text and the card read the same weeks: the goal,
 * this week against it, the Weekly streak and the last `WEEK_COUNT` weeks in
 * `timeZone`, oldest first. `null` without an active Plan, reading no
 * Workout Sessions.
 */
export const readWeeklyGoal = async (userId: string, timeZone: string) => {
  const now = new Date();
  const since = now.getTime() - LOOKBACK_MS;

  const { goals, sessions } = await asUser(userId, async (tx) => {
    const weeklyGoals = await getWeeklyGoals(tx, userId, timeZone, now);

    if ((weeklyGoals.changes.at(-1)?.target ?? null) === null) {
      return { goals: weeklyGoals, sessions: [] };
    }

    const read: WorkoutSessionSummary[] = [];

    for (let page = 0; page < MAX_SESSION_PAGES; page += 1) {
      // One page at a time: a transaction is one connection.
      // oxlint-disable-next-line no-await-in-loop
      const { sessions: pageSessions } = await listWorkoutSessions(tx, {
        limit: SESSION_PAGE_SIZE,
        offset: page * SESSION_PAGE_SIZE,
        status: "finished",
      });

      read.push(...pageSessions);

      const oldest = pageSessions.at(-1);

      if (
        pageSessions.length < SESSION_PAGE_SIZE ||
        oldest === undefined ||
        Date.parse(oldest.started_at) < since
      ) {
        break;
      }
    }

    return { goals: weeklyGoals, sessions: read };
  });

  const overview = weeklyGoalOverview(
    goals.changes,
    sessions,
    now,
    WEEK_COUNT,
    timeZone
  );

  if (overview === null) {
    return null;
  }

  const thisWeek = overview.weeks.at(-1);

  return {
    goal: overview.goal,
    streak: goals.streak,
    this_week: {
      count: thisWeek?.count ?? 0,
      goal: overview.goal,
      hit: (thisWeek?.count ?? 0) >= overview.goal,
    },
    time_zone: timeZone,
    weeks: overview.weeks.map((week) => ({
      count: week.count,
      current: week.current,
      goal: week.goal,
      hit: week.hit,
      kind: week.kind,
      start: week.start.toISOString(),
    })),
    weeks_hit: { eligible: overview.eligibleWeeks, hit: overview.hitWeeks },
  };
};
