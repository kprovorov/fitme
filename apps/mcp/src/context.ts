import type { reportError as observabilityReportError } from "@fitme/observability/node";

import type { LibraryIndex, LibraryV2 } from "./library.js";
import { createServicesFromEnv } from "./services.js";
import type { ServicesFactory, UserServices } from "./services.js";
import { ToolError } from "./tools/helpers.js";

/** Reports an unexpected failure (logs, captures, waits for delivery). */
export type ReportError = typeof observabilityReportError;

export interface ToolContext {
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
  /**
   * The instance's Library (ADR 0022), shared by every request: searches,
   * `get_exercise` and the reads' Exercise names.
   */
  library: LibraryV2;
  /** Reports a tool's unexpected failure; expected ones never reach it. */
  reportError: ReportError;
}

/** The User a verified Clerk OAuth token belongs to. */
export interface ClerkUser {
  userId: string;
}

export interface ToolContextOptions {
  createServices?: ServicesFactory;
  /** The instance's Library index, built once per app, never per request. */
  libraryIndex: LibraryIndex;
  /** The instance's Library, built once per app, never per request. */
  library: LibraryV2;
  reportError: ReportError;
  /** Must come from a verified Clerk token, never from request data. */
  user: ClerkUser;
}

const NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (FITME_DATABASE_URL is missing).";

/**
 * Tool context for a verified Clerk User: their tools run on services bound to
 * that User id through `asUser`, so RLS sees them as the caller, on the
 * instance's Library (searches, names) and on the Library index (Plan writes).
 */
export const createToolContext = ({
  createServices = createServicesFromEnv,
  library,
  libraryIndex,
  reportError,
  user,
}: ToolContextOptions): ToolContext => {
  let services: UserServices | undefined;

  return {
    getServices: () => {
      services ??= createServices(user.userId) ?? undefined;

      if (!services) {
        throw new ToolError(NOT_CONFIGURED_MESSAGE);
      }

      return services;
    },
    library,
    libraryIndex,
    reportError,
  };
};
