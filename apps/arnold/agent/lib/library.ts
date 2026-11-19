import { createLibraryV2 } from "@fitme/library-bundle/v2/library";
import type { LibraryV2 } from "@fitme/library-bundle/v2/library";
import { libraryV2BundleSource } from "@fitme/library-bundle/v2/source";
import { reportError } from "@fitme/observability/node";

/**
 * The Supabase origin the in-memory Library builds media URLs on. Arnold
 * answers no thumbnail or video URL (its tools show names, muscle groups,
 * Equipment, movement patterns and Difficulty), so nothing reads them and no
 * real project is needed.
 */
const UNUSED_MEDIA_ORIGIN = "https://media.invalid";

let library: LibraryV2 | undefined;

/**
 * The instance's new Library (ADR 0022), which `search_exercises` and the
 * Exercise names in reads come from, in Arnold's own process: production's
 * `library-v2.json` from the private Blob store over Vercel OIDC
 * (`BLOB_STORE_ID`), `LIBRARY_V2_BUNDLE` or the committed made-up fixture
 * anywhere else. Created on first use, loaded on the first ask and kept for
 * the life of the instance; a failed load is reported and the next ask loads
 * again.
 */
export const getLibrary = (): LibraryV2 => {
  library ??= createLibraryV2({
    load: libraryV2BundleSource({
      env: {
        BLOB_STORE_ID: process.env.BLOB_STORE_ID,
        LIBRARY_V2_BUNDLE: process.env.LIBRARY_V2_BUNDLE,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
    }).load,
    reportError: async (error) => {
      await reportError(error, { exercise_library: "library" });
    },
    supabaseUrl: UNUSED_MEDIA_ORIGIN,
  });

  return library;
};
