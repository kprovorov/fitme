import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { libraryBundleSource } from "@fitme/library-bundle/source";
import { createLibrary } from "@fitme/library-sdk";
import type { Library } from "@fitme/library-sdk";

export type { LibraryIndex } from "@fitme/library-bundle/library-index";

/**
 * Builds the Library client the tools search and name Exercises through
 * (the Plan writes check slugs against the Library index instead), or returns `null` when the server isn't configured for it.
 */
export type LibraryFactory = () => Library | null;

/**
 * The Library API at `LIBRARY_URL`, called with the MCP server's
 * own secret (`LIBRARY_MCP_SECRET`), never a User's token.
 */
export const createLibraryFromEnv: LibraryFactory = () => {
  const url = process.env.LIBRARY_URL;
  const secret = process.env.LIBRARY_MCP_SECRET;

  if (!(url && secret)) {
    return null;
  }

  return createLibrary({ token: () => Promise.resolve(secret), url });
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
