import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { libraryBundleSource } from "@fitme/library-bundle/source";
import { reportError } from "@fitme/observability/node";

let libraryIndex: LibraryIndex | undefined;

/**
 * The instance's Library index (ADR 0018), which the tools writing an
 * Exercise slug check it against instead of calling the Library API:
 * production's Blob store over Vercel OIDC (`BLOB_STORE_ID`), `LIBRARY_BUNDLE`
 * or the committed fixture anywhere else. Created on first use, loaded by the
 * first check and kept for the life of the instance; every failed load is
 * reported.
 */
export const getLibraryIndex = (): LibraryIndex => {
  if (!libraryIndex) {
    libraryIndex = createLibraryIndex({
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
  }

  return libraryIndex;
};
