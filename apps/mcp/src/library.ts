import { createLibrary, type Library } from "@fitme/library-sdk";

/**
 * Builds the Library client the tools search, check and name
 * Exercises through, or returns `null` when the server isn't configured for it.
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
