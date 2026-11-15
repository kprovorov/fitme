import type { Library } from "@fitme/library-sdk";
import type { reportError as observabilityReportError } from "@fitme/observability/node";

import { createLibraryFromEnv } from "./library.js";
import type { LibraryFactory, LibraryIndex } from "./library.js";
import { createServicesFromEnv } from "./services.js";
import type { ServicesFactory, UserServices } from "./services.js";
import { ToolError } from "./tools/helpers.js";

/** Reports an unexpected failure (logs, captures, waits for delivery). */
export type ReportError = typeof observabilityReportError;

export interface ToolContext {
  /**
   * The Library API client, built once per request on the first
   * tool that needs it. Throws a `ToolError` when it isn't configured.
   */
  getLibrary: () => Library;
  /**
   * The caller's services, each run through `asUser` as the verified User.
   * Built once per request, on the first tool that needs them. Throws a
   * `ToolError` when the database isn't configured.
   */
  getServices: () => UserServices;
  /**
   * The instance's Library index (ADR 0018), shared by every request: the
   * Plan writes check Exercise slugs and pick Covers against it.
   */
  libraryIndex: LibraryIndex;
  /** Reports a tool's unexpected failure; expected ones never reach it. */
  reportError: ReportError;
}

/** The User a verified Clerk OAuth token belongs to. */
export interface ClerkUser {
  userId: string;
}

export interface ToolContextOptions {
  createLibrary?: LibraryFactory;
  createServices?: ServicesFactory;
  /** The instance's Library index, built once per app, never per request. */
  libraryIndex: LibraryIndex;
  reportError: ReportError;
  /** Must come from a verified Clerk token, never from request data. */
  user: ClerkUser;
}

const NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (FITME_DATABASE_URL is missing).";

const LIBRARY_NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for the Library (LIBRARY_URL or LIBRARY_MCP_SECRET is missing).";

/**
 * Tool context for a verified Clerk User: their tools run on services bound to
 * that User id through `asUser`, so RLS sees them as the caller, on the
 * Library API (searches, names) and on the Library index (Plan writes).
 */
export const createToolContext = ({
  createLibrary = createLibraryFromEnv,
  createServices = createServicesFromEnv,
  libraryIndex,
  reportError,
  user,
}: ToolContextOptions): ToolContext => {
  let services: UserServices | undefined;
  let library: Library | undefined;

  return {
    getLibrary: () => {
      library ??= createLibrary() ?? undefined;

      if (!library) {
        throw new ToolError(LIBRARY_NOT_CONFIGURED_MESSAGE);
      }

      return library;
    },
    getServices: () => {
      services ??= createServices(user.userId) ?? undefined;

      if (!services) {
        throw new ToolError(NOT_CONFIGURED_MESSAGE);
      }

      return services;
    },
    libraryIndex,
    reportError,
  };
};
