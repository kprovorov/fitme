import { createQuery } from "react-query-kit";
import { z } from "zod";
import {
  type CoachModelList,
  coachModelListSchema,
  readCachedCoachModels,
  writeCachedCoachModels,
} from "~/lib/coach-model";
import { getApiUrl } from "~/lib/constants";

const responseSchema = z.object({ data: coachModelListSchema });

/**
 * The Coach models served by `GET /v1/coach/models` in `apps/api`. Starts from
 * the list cached in MMKV `coach.models` (offline too) and rewrites it on each
 * successful fetch.
 */
export const useCoachModelsQuery = createQuery<CoachModelList>({
  fetcher: async (_variables, { signal }): Promise<CoachModelList> => {
    const response = await fetch(`${getApiUrl()}/v1/coach/models`, {
      signal,
    });
    if (!response.ok) {
      throw new Error(`Coach models request failed (${response.status})`);
    }
    // A payload of another shape fails the query and keeps the cached list.
    const list = responseSchema.parse(await response.json()).data;
    writeCachedCoachModels(list);
    return list;
  },
  initialData: readCachedCoachModels,
  queryKey: ["coach-models"],
  retry: false,
});
