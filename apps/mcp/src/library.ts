import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { libraryBundleSource } from "@fitme/library-bundle/source";
import { createLibraryV2 } from "@fitme/library-bundle/v2/library";
import type { LibraryV2 } from "@fitme/library-bundle/v2/library";
import { libraryV2BundleSource } from "@fitme/library-bundle/v2/source";

export type { LibraryIndex } from "@fitme/library-bundle/library-index";

export type { LibraryV2 } from "@fitme/library-bundle/v2/library";

/**
 * Where media URLs point when `SUPABASE_URL` is unset outside production
 * (local runs, tests): a made-up project, so an Exercise still answers.
 */
export const PLACEHOLDER_SUPABASE_URL = "https://placeholder.supabase.co";

/**
 * The media URLs' Supabase project: production never serves a placeholder's
 * dead links, so there an unset `SUPABASE_URL` fails the load (reported),
 * and the tools answer "Library unavailable" until it's set.
 */
const supabaseUrlFromEnv = () => {
  const url = process.env.SUPABASE_URL;

  if (url) {
    return url;
  }

  if (process.env.VERCEL_ENV === "production") {
    return null;
  }

  return PLACEHOLDER_SUPABASE_URL;
};

/**
 * The instance's Library (ADR 0022), which `list_exercises`, `get_exercise`
 * and the reads' Exercise names come from, in process: production's
 * `exercises.json` from the private Blob store over Vercel OIDC
 * (`BLOB_STORE_ID`), `LIBRARY_V2_BUNDLE` or the committed made-up fixture
 * anywhere else. Loaded on first use and kept for the life of the instance;
 * a failed load is reported through `reportError` and tried again on the
 * next ask.
 */
export const libraryFromEnv = (
  reportError: (error: Error) => Promise<void>
): LibraryV2 => {
  const supabaseUrl = supabaseUrlFromEnv();

  const source = libraryV2BundleSource({
    env: {
      BLOB_STORE_ID: process.env.BLOB_STORE_ID,
      LIBRARY_V2_BUNDLE: process.env.LIBRARY_V2_BUNDLE,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });

  return createLibraryV2({
    load: () =>
      supabaseUrl
        ? source.load()
        : Promise.reject(
            new Error(
              "SUPABASE_URL is unset: the Library's media URLs have no project"
            )
          ),
    reportError,
    supabaseUrl: supabaseUrl ?? PLACEHOLDER_SUPABASE_URL,
  });
};

/**
 * The instance's Library index (ADR 0018), which the Plan writes check
 * Exercise slugs and pick Covers against: over production's Blob store,
 * `LIBRARY_BUNDLE` or the committed fixture anywhere else. Loaded on the
 * first write that asks and kept for the life of the instance; every failed
 * load is reported through `reportError`.
 */
export const libraryIndexFromEnv = (
  reportError: (error: Error) => Promise<void>
): LibraryIndex =>
  createLibraryIndex({
    load: libraryBundleSource({
      env: {
        BLOB_STORE_ID: process.env.BLOB_STORE_ID,
        LIBRARY_BUNDLE: process.env.LIBRARY_BUNDLE,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
    }).load,
    reportError,
  });
