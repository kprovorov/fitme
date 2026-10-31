import type { WeeklyGoalChange } from "@fitme/core";
import { createQuery } from "react-query-kit";
import { ApiError } from "~/lib/api/client";
import { publicApi } from "~/lib/public-api";

export const WEEKLY_GOALS_QUERY_KEY = ["weekly-goals"];

/**
 * Every change of the User's Weekly goal, oldest first, through
 * `GET /v1/weekly-goals` (ADR 0015): the services record them whenever the
 * active Plan or its frequency changes, so past weeks keep their own goals.
 * Rejects with an `ApiError`.
 */
export const useWeeklyGoalsQuery = createQuery<WeeklyGoalChange[], void>({
  fetcher: async (): Promise<WeeklyGoalChange[]> => {
    const { data } = await publicApi().GET("/v1/weekly-goals");
    if (!data) {
      throw new ApiError("Public API answered without Weekly goals");
    }
    return data.data;
  },
  queryKey: WEEKLY_GOALS_QUERY_KEY,
});
