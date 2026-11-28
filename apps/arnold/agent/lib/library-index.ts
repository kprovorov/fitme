import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { libraryBundleSource } from "@fitme/library-bundle/source";
import { reportError } from "@fitme/observability/node";

let index: LibraryIndex | undefined;

/**
 * The instance's Library index (ADR 0018), read for Covers alone (ADR 0014):
 * a new Workout gets its Cover from the Legacy Library's Covers, as the
 * Public API and MCP give one. Slug checks, searches and names stay on the
 * new Library (`./library`). Production reads `library.json` from the private
 * Blob store over Vercel OIDC (`BLOB_STORE_ID`), anywhere else
 * `LIBRARY_BUNDLE` or the committed fixture. Created on first use, loaded on
 * the first ask and kept for the life of the instance; a failed load is
 * reported and the next ask loads again.
 */
export const getLibraryIndex = (): LibraryIndex => {
  index ??= createLibraryIndex({
    load: libraryBundleSource({
      env: {
        BLOB_STORE_ID: process.env.BLOB_STORE_ID,
        LIBRARY_BUNDLE: process.env.LIBRARY_BUNDLE,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
    }).load,
    reportError: async (error) => {
      await reportError(error, { exercise_library: "index" });
    },
  });

  return index;
};
