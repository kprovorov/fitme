import type { InvalidateQueryFilters } from "@tanstack/react-query";

import { PLANS_QUERY_KEY, usePlanQuery } from "~/hooks/queries/plans";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import {
  LIFETIME_TOTALS_QUERY_KEY,
  OPEN_WORKOUT_SESSION_QUERY_KEY,
} from "~/hooks/queries/workout-sessions";

/** Whether a route is one of the session's own screens (its Exercise picker included). */
export const isSessionRoute = (
  route: { params?: object } | undefined,
  sessionId: string
): boolean => {
  const params = route?.params;

  return (
    !!params &&
    (("sessionId" in params && params.sessionId === sessionId) ||
      ("workoutSessionId" in params && params.workoutSessionId === sessionId))
  );
};

/** The reads a finish changes, besides the Workout Session's own. */
export const readsChangedByFinish = (): InvalidateQueryFilters[] => [
  // Its Workout moved to the end of the rotation.
  { queryKey: PLANS_QUERY_KEY },
  { queryKey: usePlanQuery.getKey() },
  { queryKey: ["exercise-history"] },
  // History's months and Weekly goal chart count it now (a finish may
  // also start goal tracking)
  { queryKey: ["workout-sessions-history"] },
  { queryKey: WEEKLY_GOALS_QUERY_KEY },
  // Profile's Lifetime totals count it too.
  { queryKey: LIFETIME_TOTALS_QUERY_KEY },
  // Start is no longer blocked on it.
  { queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY },
];
