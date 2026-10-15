import {
  createServicesFromEnv,
  type ServicesFactory,
  type UserServices,
} from "./services.js";
import { ToolError } from "./tools/helpers.js";

export interface ToolContext {
  /**
   * The caller's services, each run through `asUser` as the verified User.
   * Built once per request, on the first tool that needs them. Throws a
   * `ToolError` when the database isn't configured.
   */
  getServices: () => UserServices;
}

/** The User a verified Clerk OAuth token belongs to. */
export interface ClerkUser {
  userId: string;
}

export interface ToolContextOptions {
  createServices?: ServicesFactory;
  /** Must come from a verified Clerk token, never from request data. */
  user: ClerkUser;
}

const NOT_CONFIGURED_MESSAGE =
  "This MCP server is not configured for user data (FITME_DATABASE_URL is missing).";

/**
 * Tool context for a verified Clerk User: their tools run on services bound to
 * that User id through `asUser`, so RLS sees them as the caller.
 */
export function createToolContext({
  createServices = createServicesFromEnv,
  user,
}: ToolContextOptions): ToolContext {
  let services: UserServices | undefined;

  return {
    getServices: () => {
      services ??= createServices(user.userId) ?? undefined;
      if (!services) {
        throw new ToolError(NOT_CONFIGURED_MESSAGE);
      }
      return services;
    },
  };
}
