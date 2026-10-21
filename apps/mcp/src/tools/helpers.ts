import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "../context.js";
import type { UserServices } from "../services.js";

/** An expected failure whose message is safe to show to the MCP client. */
export class ToolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ToolError";
  }
}

export const asJson = (value: unknown): CallToolResult => ({
  content: [{ text: JSON.stringify(value, null, 2), type: "text" }],
});

export const errorResult = (message: string): CallToolResult => ({
  content: [{ text: message, type: "text" }],
  isError: true,
});

interface DatabaseError {
  code?: string;
  hint?: string | null;
  message: string;
}

const describeDatabaseError = ({ hint, message }: DatabaseError) =>
  hint ? `${message} (${hint})` : message;

/** Throws a `ToolError` when a lookup by id found nothing. */
export function requireFound<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new ToolError(message);
  }
  return value;
}

const SERVICE_FAILURE_MESSAGE = "The database request failed.";

/** Postgres errors from `pg` carry a SQLSTATE `code`. */
const isPostgresError = (value: unknown): value is Error & DatabaseError =>
  value instanceof Error && "code" in value && typeof value.code === "string";

/** The Postgres error Drizzle wrapped as the `cause`, if there is one. */
const postgresCause = (error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined;
  return isPostgresError(cause) ? cause : undefined;
};

/**
 * The message an unexpected service failure shows the MCP client: the
 * Postgres message (never Drizzle's, which carries the SQL and its
 * parameters), or a generic one for anything else.
 */
const describeServiceError = (error: unknown) => {
  const database = postgresCause(error);
  return database ? describeDatabaseError(database) : SERVICE_FAILURE_MESSAGE;
};

/**
 * Wraps a user tool handler that runs on services: hands it the caller's
 * services (bound to the verified User) and turns every failure into an
 * `isError` tool result instead of a protocol error. A `ToolError` (not
 * found, not configured, …) is expected and shown as is; anything else (a
 * Postgres error, an unknown exception) is reported first.
 */
export function withServices<Args>(
  ctx: ToolContext,
  handler: (args: Args, services: UserServices) => Promise<CallToolResult>
): (args: Args) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await handler(args, ctx.getServices());
    } catch (error) {
      if (error instanceof ToolError) {
        return errorResult(error.message);
      }
      await ctx.reportError(error);
      return errorResult(describeServiceError(error));
    }
  };
}

/** Drops keys whose value is `undefined` so they don't overwrite anything. */
export function pickDefined<T extends Record<string, unknown>>(
  value: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

export const READ_ONLY = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
} as const;

export const WEIGHT_UNIT_NOTE =
  "Weights are stored and returned in the user's preferred unit — kg for the `metric` measurement system, lbs for `us`/`uk` (see get_profile) — and are never converted.";
