import { createPublicApi } from "@fitme/api-client";
import { getClerk } from "~/lib/clerk";
import { getApiUrl } from "~/lib/constants";

/** How long a request waits for Clerk to load before failing unsent. */
export const CLERK_LOAD_TIMEOUT_MS = 10_000;

type Clerk = ReturnType<typeof getClerk>;

/**
 * Resolves once Clerk has loaded (`ready`, or `degraded`, which still serves
 * its session), or rejects after `CLERK_LOAD_TIMEOUT_MS`.
 */
const clerkLoaded = (clerk: Clerk): Promise<void> =>
  new Promise((resolve, reject) => {
    if (clerk.loaded) {
      resolve();
      return;
    }
    const onStatus = (status: Clerk["status"]) => {
      if (status === "ready" || status === "degraded") {
        clearTimeout(timer);
        clerk.off("status", onStatus);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      clerk.off("status", onStatus);
      reject(new Error("Clerk didn't load"));
    }, CLERK_LOAD_TIMEOUT_MS);
    clerk.on("status", onStatus, { notify: true });
  });

/**
 * The signed-in User's Clerk session token, once Clerk has loaded: a screen
 * outside the tabs (a deep link) can ask before it has, and a request then
 * would go out with no bearer and answer 401. Rejects when Clerk doesn't
 * load in time or nobody is signed in, so the request is never sent (the
 * client turns it into an `ApiError` with no status).
 */
export const sessionToken = async (): Promise<string> => {
  const clerk = getClerk();
  await clerkLoaded(clerk);
  const token = await clerk.session?.getToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  return token;
};

/**
 * `apps/api` at `EXPO_PUBLIC_API_URL`, as the signed-in User (their Clerk
 * session token, resolved per request so Clerk's refreshes apply, and only
 * once Clerk has loaded: `sessionToken`). Tests get the same client over the
 * fake Public API (`test-utils/setup.ts`).
 */
export const publicApi = createPublicApi({
  baseUrl: getApiUrl,
  token: sessionToken,
});
