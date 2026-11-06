import { createPublicApi } from "@fitme/api-client";

import { getClerk } from "~/lib/clerk";
import { getApiUrl } from "~/lib/constants";

/** How long a request waits for Clerk to load before failing unsent. */
export const CLERK_LOAD_TIMEOUT_MS = 10_000;

type Clerk = ReturnType<typeof getClerk>;

/** The one wait for Clerk to load, shared by every request asking meanwhile. */
let clerkLoading: Promise<void> | null = null;

/**
 * Waits for Clerk to load (`ready`, or `degraded`, which still serves its
 * session), at most `CLERK_LOAD_TIMEOUT_MS`. Every request asking while it
 * loads shares one wait, so one listener: Clerk's event bus dispatches over
 * its live list of listeners, and a listener removing itself during that
 * dispatch would make it skip the next. The listener is removed after the
 * dispatch, the timer cleared, and the wait forgotten once settled, so a
 * later load (after a sign-out, or a timeout) starts a fresh one.
 */
const clerkLoaded = (clerk: Clerk): Promise<void> => {
  if (clerk.loaded) {
    return Promise.resolve();
  }

  if (clerkLoading) {
    return clerkLoading;
  }

  const {
    promise: loading,
    resolve,
    reject,
  } = Promise.withResolvers<undefined>();

  const timer = setTimeout(
    () => reject(new Error("Clerk didn't load")),
    CLERK_LOAD_TIMEOUT_MS
  );

  const onStatus = (status: Clerk["status"]) => {
    if (status === "ready" || status === "degraded") {
      clearTimeout(timer);
      resolve(undefined);
    }
  };

  try {
    clerk.on("status", onStatus, { notify: true });
  } catch (error) {
    reject(error);
  }

  clerkLoading = loading;

  const forget = () => {
    clearTimeout(timer);
    clerk.off("status", onStatus);

    if (clerkLoading === loading) {
      clerkLoading = null;
    }
  };

  loading.then(forget).catch(forget);

  return loading;
};

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
 * once Clerk has loaded: `sessionToken`), for every User-data route. Tests
 * get the same client over the fake Public API (`test-utils/setup.ts`).
 */
export const publicApi = createPublicApi({
  baseUrl: getApiUrl,
  token: sessionToken,
});

/**
 * `apps/api`'s global routes, which need no User (`GET /v1/arnold/models`):
 * sent at once with no bearer, signed in or not, never waiting for Clerk.
 */
export const globalApi = createPublicApi({
  baseUrl: getApiUrl,
  token: () => Promise.resolve(null),
});
