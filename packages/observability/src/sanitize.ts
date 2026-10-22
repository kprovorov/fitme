/**
 * Drizzle's `DrizzleQueryError`, by shape (this package can't depend on
 * drizzle-orm): an Error with `query` and `params` own properties. Its
 * message is `Failed query: <SQL>\nparams: <values>`, the values often User
 * data, and its `cause` is the `pg` error, whose message can echo input.
 */
export const isQueryError = (
  value: unknown
): value is Error & { params: unknown; query: unknown } =>
  value instanceof Error &&
  Object.hasOwn(value, "query") &&
  Object.hasOwn(value, "params");

/** A `pg` error's SQLSTATE, if `value` is one. */
const sqlstateOf = (value: unknown) =>
  value instanceof Error && "code" in value && typeof value.code === "string"
    ? value.code
    : undefined;

const MAX_CAUSE_DEPTH = 10;

/** The query error in `error`'s cause chain, if there is one. */
const findQueryError = (error: unknown) => {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (isQueryError(current)) {
      return current;
    }
    if (!(current instanceof Error)) {
      return;
    }
    current = current.cause;
  }
};

const STACK_FRAME = /^\s+at /;

/** What a failed query is reported as, by `sanitizeError` and the scrubber. */
export const QUERY_FAILED_MESSAGE = "Database query failed";

export interface SanitizedError {
  error: unknown;
  tags?: Record<string, string>;
}

/**
 * What may be logged and reported for `error`: a query error anywhere in its
 * cause chain becomes a fresh `DatabaseQueryError` carrying only the SQLSTATE
 * (also as the `sqlstate` tag) and the query error's stack frames, with no
 * cause, so no SQL, parameter or Postgres message gets out. Anything else is
 * returned as is.
 */
export const sanitizeError = (error: unknown): SanitizedError => {
  const query = findQueryError(error);
  if (!query) {
    return { error };
  }
  const sqlstate = sqlstateOf(query.cause) ?? "unknown";
  const sanitized = new Error(`${QUERY_FAILED_MESSAGE} (SQLSTATE ${sqlstate})`);
  sanitized.name = "DatabaseQueryError";
  const frames = (query.stack ?? "")
    .split("\n")
    .filter((line) => STACK_FRAME.test(line));
  sanitized.stack = [`${sanitized.name}: ${sanitized.message}`, ...frames].join(
    "\n"
  );
  return { error: sanitized, tags: { sqlstate } };
};
