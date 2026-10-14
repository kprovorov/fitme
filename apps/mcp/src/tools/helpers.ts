import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext, UserContext } from "../context.js";
import type { UserServices } from "../services.js";

/** An expected failure whose message is safe to show to the MCP client. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
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

interface QueryResult {
  data: unknown;
  error: DatabaseError | null;
}

/** The `data` type of the success branch of a Supabase response union. */
type SuccessData<R> = R extends { data: infer D; error: null } ? D : never;

const describeDatabaseError = ({ hint, message }: DatabaseError) =>
  hint ? `${message} (${hint})` : message;

/**
 * Returns the data of a Supabase response, or throws a `ToolError` carrying
 * the Postgres/PostgREST message (never a stack trace).
 */
export function unwrap<R extends QueryResult>(result: R): SuccessData<R> {
  if (result.error) {
    throw new ToolError(describeDatabaseError(result.error));
  }
  return result.data as SuccessData<R>;
}

/** Throws a `ToolError` when a lookup by id found nothing. */
export function requireFound<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new ToolError(message);
  }
  return value;
}

/** PostgREST answers an offset past the last row with 416 / PGRST103. */
const RANGE_NOT_SATISFIABLE = "PGRST103";

interface PageResult<Row> {
  count: number | null;
  data: Row[] | null;
  error: DatabaseError | null;
}

interface CountResult {
  count: number | null;
  error: DatabaseError | null;
}

export interface Page<Row> {
  hasMore: boolean;
  limit: number;
  offset: number;
  rows: Row[];
  total: number;
}

/**
 * Runs a `count: "exact"` page query. An offset past the end yields an empty
 * page (with the total from a separate HEAD count) instead of an error.
 */
export async function fetchPage<Row>(
  runPage: () => PromiseLike<PageResult<Row>>,
  runCount: () => PromiseLike<CountResult>,
  { limit, offset }: { limit: number; offset: number }
): Promise<Page<Row>> {
  const result = await runPage();
  if (result.error?.code === RANGE_NOT_SATISFIABLE) {
    const counted = await runCount();
    if (counted.error) {
      throw new ToolError(describeDatabaseError(counted.error));
    }
    return {
      hasMore: false,
      limit,
      offset,
      rows: [],
      total: counted.count ?? 0,
    };
  }
  if (result.error) {
    throw new ToolError(describeDatabaseError(result.error));
  }
  const rows = result.data ?? [];
  const total = result.count ?? offset + rows.length;
  return { hasMore: offset + rows.length < total, limit, offset, rows, total };
}

export const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return "Unexpected error.";
};

/**
 * Reads back the result of a write that already committed. A failed read is
 * reported as success plus a `warning`, so the client doesn't retry the write.
 */
export async function readBack(
  load: () => Promise<unknown>,
  written: Record<string, unknown>,
  followUp: string
): Promise<CallToolResult> {
  try {
    return asJson(await load());
  } catch (error) {
    return asJson({
      ...written,
      warning: `The change was saved, but reading it back failed (${toErrorMessage(error)}). Do not repeat the call; use ${followUp} to see the result.`,
    });
  }
}

/**
 * Wraps a user tool handler: resolves the authenticated caller first and turns
 * every failure into an `isError` tool result instead of a protocol error.
 */
export function withUser<Args>(
  ctx: ToolContext,
  handler: (args: Args, user: UserContext) => Promise<CallToolResult>
): (args: Args) => Promise<CallToolResult> {
  return async (args) => {
    try {
      const user = await ctx.getUserContext();
      return await handler(args, user);
    } catch (error) {
      return errorResult(toErrorMessage(error));
    }
  };
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
 * The message a failed service call shows the MCP client: a `ToolError`'s, or
 * the Postgres message (never Drizzle's, which carries the SQL and its
 * parameters). Anything else is logged and reported generically.
 */
const describeServiceError = (error: unknown) => {
  if (error instanceof ToolError) {
    return error.message;
  }
  const database = postgresCause(error);
  if (database) {
    return describeDatabaseError(database);
  }
  console.error(error);
  return SERVICE_FAILURE_MESSAGE;
};

/**
 * Wraps a user tool handler that runs on services: hands it the caller's
 * services (bound to the verified User) and turns every failure into an
 * `isError` tool result instead of a protocol error.
 */
export function withServices<Args>(
  ctx: ToolContext,
  handler: (args: Args, services: UserServices) => Promise<CallToolResult>
): (args: Args) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await handler(args, ctx.getServices());
    } catch (error) {
      return errorResult(describeServiceError(error));
    }
  };
}

/** Sorts rows by their 1-based `order` column without mutating the input. */
export const byOrder = <T extends { order: number }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.order - b.order);

export const nowIso = () => new Date().toISOString();

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
