import { createPublicApi } from "~/lib/api/client";
import { getClerk } from "~/lib/clerk";
import { getApiUrl } from "~/lib/constants";

/**
 * `apps/api` at `EXPO_PUBLIC_API_URL`, as the signed-in User (their Clerk
 * session token, resolved per request so Clerk's refreshes apply). Tests get
 * the same client over the fake Public API (`test-utils/setup.ts`).
 */
export const publicApi = createPublicApi({
  baseUrl: getApiUrl,
  token: async () => (await getClerk().session?.getToken()) ?? null,
});
