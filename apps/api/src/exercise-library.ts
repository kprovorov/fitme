import { createLibraryV2 } from "@fitme/library-bundle/v2/library";
import type { LibraryV2 } from "@fitme/library-bundle/v2/library";
import { libraryV2BundleSource } from "@fitme/library-bundle/v2/source";

export type { LibraryV2 } from "@fitme/library-bundle/v2/library";

/**
 * The media origin outside Vercel when SUPABASE_URL is unset (local runs,
 * tests): the URLs then point at no real project, as the Library API's do.
 */
export const PLACEHOLDER_SUPABASE_URL = "https://example.supabase.co";

/** How long a failed load keeps the Library unavailable before the next request loads again. */
export const LIBRARY_RETRY_INTERVAL_MS = 60_000;

/**
 * `library`, answering `unavailable` at once for `retryIntervalMs` after a
 * failed load, so an outage costs each request nothing (no 10 s wait, no
 * report) and Blob gets one retry a minute, like the Library index's reloads.
 */
export const withRetryInterval = (
  library: LibraryV2,
  {
    now = Date.now,
    retryIntervalMs = LIBRARY_RETRY_INTERVAL_MS,
  }: { now?: () => number; retryIntervalMs?: number } = {}
): LibraryV2 => {
  let failedAt: number | null = null;

  return {
    get: async () => {
      if (failedAt !== null && now() - failedAt < retryIntervalMs) {
        return { status: "unavailable" };
      }

      const answer = await library.get();

      failedAt = answer.status === "unavailable" ? now() : null;

      return answer;
    },
  };
};

/**
 * The instance's new Library (ADR 0022) over the v2 bundle the environment
 * names: production's Blob store (`library-v2.json`), LIBRARY_V2_BUNDLE or the
 * committed fixture anywhere else. Loaded on the first request that reads an
 * Exercise and kept; every failed load is reported through `reportError`, and
 * the next one waits `LIBRARY_RETRY_INTERVAL_MS`.
 * Media URLs are on SUPABASE_URL's project (required on Vercel, where an unset
 * one is reported at startup and answers a placeholder project's URLs).
 */
export const exerciseLibraryFromEnv = (
  reportError: (error: Error) => Promise<void>
): LibraryV2 =>
  withRetryInterval(
    createLibraryV2({
      load: libraryV2BundleSource({
        env: {
          BLOB_STORE_ID: process.env.BLOB_STORE_ID,
          LIBRARY_V2_BUNDLE: process.env.LIBRARY_V2_BUNDLE,
          VERCEL_ENV: process.env.VERCEL_ENV,
        },
      }).load,
      reportError,
      supabaseUrl: process.env.SUPABASE_URL || PLACEHOLDER_SUPABASE_URL,
    })
  );

/** The `library_unavailable` answer of a read whose bundle couldn't be loaded (its load reported why). */
export const libraryUnavailable = {
  error: {
    code: "library_unavailable",
    message: "The Library is unavailable; try again",
  },
} as const;
