const TRAILING_SLASH = /\/$/;

export const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

// iOS 27 resolves the `automatic` scroll edge effect to the hard style
// (dimmed band + dividing line); pin it to the progressive blur we had on 26.
export const SCROLL_EDGE_EFFECTS = { bottom: "soft", top: "soft" } as const;

export const PASSWORD_MIN_LENGTH = 8;

// The register form's shortest name.
export const NAME_MIN_LENGTH = 2;

/**
 * Whether to sync React Query and storage to the desktop devtools app
 * (`react-query-external-sync`). Development builds only, and only when opted
 * in with `EXPO_PUBLIC_DEVTOOLS_SYNC=true`: without the app running, the sync's
 * socket fails and LogBox shows a red error toast on every launch. Read on
 * each call so tests can set it.
 */
export const isDevToolsSyncEnabled = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.EXPO_PUBLIC_DEVTOOLS_SYNC === "true";

/**
 * Base URL of `apps/api` (`EXPO_PUBLIC_API_URL`), without a trailing slash;
 * empty when unset. Read on each call so tests can set it.
 */
export const getApiUrl = () =>
  (process.env.EXPO_PUBLIC_API_URL ?? "").replace(TRAILING_SLASH, "");
