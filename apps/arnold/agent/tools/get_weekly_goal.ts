import { weeklyGoalOverview } from "@fitme/core/weekly-goals";
import { asUser } from "@fitme/db";
import { getWeeklyGoals } from "@fitme/services/weekly-goals";
import { listWorkoutSessions } from "@fitme/services/workout-sessions";
import type { WorkoutSessionSummary } from "@fitme/services/workout-sessions";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { clientTimeZone } from "../lib/client-context";
import { requireConversationOwner } from "../lib/owner";

/** The weeks shown, this one included: History's chart. */
export const WEEK_COUNT = 8;

/** Finished Workout Sessions read per page, newest first. */
export const SESSION_PAGE_SIZE = 50;

/** At most this many pages, so a User training several times a day is still bounded. */
const MAX_SESSION_PAGES = 10;

const DAY_MS = 86_400_000;

// A day past the weeks shown, whatever the zone's offset from the server's.
const LOOKBACK_MS = (WEEK_COUNT * 7 + 1) * DAY_MS;

export default defineTool({
  description:
    "Get the user's Weekly goal: the active plan's workouts per week, this week's count of qualifying workout sessions (finished, with a logged rep) against it, the Weekly streak (consecutive weeks the goal was hit, this week counted once hit) and the last 8 Monday–Sunday weeks, oldest first, each with its count, its own goal and whether it was hit (kind unknown: no goal was known for it). Weeks are in the user's time zone. Without an active plan there is no Weekly goal.",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const timeZone = clientTimeZone(ctx.messages);
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
      return {
        error: "No active plan, so the user has no Weekly goal",
      };
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
  },
  inputSchema: z.object({}),
});
