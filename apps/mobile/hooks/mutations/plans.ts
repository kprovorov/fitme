import { ApiError } from "@fitme/api-client";
import { createMutation } from "react-query-kit";

import type { FullPlan } from "~/hooks/queries/plans";
import { invalidateWeighedQueries } from "~/hooks/queries/settings";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import { IS_E2E } from "~/lib/constants";
import type { SavedPlanBody } from "~/lib/plan-draft";
import { publicApi } from "~/lib/public-api";
import { segmentClient } from "~/lib/segment";

export interface SavePlanVariables {
  body: SavedPlanBody;
  id: string;
}

/**
 * Saves the whole Plan through `PUT /v1/plans/{id}` (ADR 0016), in one
 * transaction: every row sent with its id is kept, one left out is deleted
 * and a new one is created. Fires `Plan Edited` once the API has answered,
 * then reads every query the save can have changed again: each of them
 * carries a weight or a Plan (`invalidateWeighedQueries`: the Plan lists, the
 * active Plan, each Plan, the Workout Sessions, the open one, History and
 * each Exercise history), plus the Weekly goal, which follows the active
 * Plan's frequency, whether or not the call answered: a lost answer can
 * still have committed. Nothing is seeded, so what a screen shows next is
 * what the server answers. Rejects with an `ApiError`.
 */
export const useSavePlanMutation = createMutation<FullPlan, SavePlanVariables>({
  mutationFn: async ({ body, id }: SavePlanVariables): Promise<FullPlan> => {
    const { data } = await publicApi().PUT("/v1/plans/{id}", {
      body,
      params: { path: { id } },
    });

    if (!data) {
      throw new ApiError("Public API answered no Plan");
    }

    if (!IS_E2E) {
      void segmentClient.track("Plan Edited", { plan_id: id });
    }

    return data.data;
  },
  // On settlement, not only on success: a failed call doesn't prove nothing
  // was saved (the answer can be lost after the write commits), so the
  // Screens behind the editor are read again either way, as the other Plan
  // writes do. Not awaited: the reads it starts can take a while (History is
  // paged), and the caller's own `onSuccess`, which closes the editor, runs
  // after this one settles.
  onSettled: (_plan, _error, _variables, _context, { client }) => {
    void invalidateWeighedQueries(client);
    void client.invalidateQueries({ queryKey: WEEKLY_GOALS_QUERY_KEY });
  },
});
