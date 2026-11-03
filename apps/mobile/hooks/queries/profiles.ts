import { ApiError, type paths } from "@fitme/api-client";
import { createQuery } from "react-query-kit";
import { publicApi } from "~/lib/public-api";

/**
 * The User's Profile as `GET /v1/profile` answers it: `age`, `gender`,
 * `height`, `weight`, `measurement_system` and the `units` every height and
 * weight is stored and shown in. `gender` and `measurement_system` are typed
 * as plain strings by the API: read them through `lib/profile.ts`.
 */
export type Profile = NonNullable<
  paths["/v1/profile"]["get"]["responses"][200]["content"]["application/json"]["data"]
>;

/**
 * The current User's Profile through `GET /v1/profile`, or `null` until they
 * fill one in (the API answers `{ data: null }` before onboarding). Rejects
 * with an `ApiError`, never retried (a 429 is the User's to wait out); a
 * failed refresh keeps the Profile already read.
 */
export const useProfileQuery = createQuery<Profile | null>({
  fetcher: async (): Promise<Profile | null> => {
    const { data } = await publicApi().GET("/v1/profile");
    if (!data) {
      throw new ApiError("Public API answered no Profile");
    }
    return data.data;
  },
  queryKey: ["profile"],
  retry: false,
});
