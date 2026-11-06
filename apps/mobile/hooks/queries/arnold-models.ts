import { createQuery } from "react-query-kit";

import {
  arnoldModelListSchema,
  readCachedArnoldModels,
  writeCachedArnoldModels,
} from "~/lib/arnold-model";
import type { ArnoldModelList } from "~/lib/arnold-model";
import { globalApi } from "~/lib/public-api";

/**
 * Arnold's models, served by `GET /v1/arnold/models` in `apps/api`, a
 * global route (`globalApi`: no bearer, no wait for Clerk). Starts
 * from the list cached in MMKV `arnold.models` (offline too) and rewrites it
 * on each successful fetch.
 */
export const useArnoldModelsQuery = createQuery<ArnoldModelList>({
  fetcher: async (_variables, { signal }): Promise<ArnoldModelList> => {
    const { data } = await globalApi().GET("/v1/arnold/models", { signal });
    // The generated types aren't checked at runtime: a payload of another
    // shape fails the query and keeps the cached list.
    const list = arnoldModelListSchema.parse(data?.data);
    writeCachedArnoldModels(list);

    return list;
  },
  initialData: readCachedArnoldModels,
  queryKey: ["arnold-models"],
  retry: false,
});
