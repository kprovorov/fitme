import { describe, expect, it } from "vitest";
import { isQueryError, sanitizeError } from "../index";

const SQL = 'delete from "profiles" where "user_id" = $1';
const USER_ID = "user_2DeleteMe00000000000000";

/** Shaped like Drizzle's `DrizzleQueryError`, which this package can't import. */
class FakeQueryError extends Error {
  readonly params: unknown[];
  readonly query: string;

  constructor(query: string, params: unknown[], cause?: unknown) {
    super(`Failed query: ${query}\nparams: ${params}`, { cause });
    this.query = query;
    this.params = params;
  }
}

/** A `pg` error: a SQLSTATE `code` and a message that can echo input. */
const postgresError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

describe("isQueryError", () => {
  it("recognises an error with own query and params", () => {
    expect(isQueryError(new FakeQueryError(SQL, [USER_ID]))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isQueryError(new Error("Failed query: select 1"))).toBe(false);
    expect(isQueryError({ params: [], query: SQL })).toBe(false);
    expect(isQueryError(postgresError("22P02", "bad"))).toBe(false);
    expect(isQueryError(null)).toBe(false);
  });
});

describe("sanitizeError", () => {
  it("replaces a query error with its SQLSTATE and stack frames only", () => {
    const cause = postgresError(
      "22P02",
      `invalid input syntax for type uuid: "${USER_ID}"`
    );
    const query = new FakeQueryError(SQL, [USER_ID], cause);

    const { error, tags } = sanitizeError(query);

    expect(error).toBeInstanceOf(Error);
    const sanitized = error as Error;
    expect(sanitized.name).toBe("DatabaseQueryError");
    expect(sanitized.message).toBe("Database query failed (SQLSTATE 22P02)");
    expect(sanitized.cause).toBeUndefined();
    expect(tags).toEqual({ sqlstate: "22P02" });

    const [header, ...frames] = (sanitized.stack ?? "").split("\n");
    expect(header).toBe(
      "DatabaseQueryError: Database query failed (SQLSTATE 22P02)"
    );
    expect(frames.length).toBeGreaterThan(0);
    expect(frames).toEqual(
      (query.stack ?? "")
        .split("\n")
        .filter((line) => line.startsWith("    at "))
    );
    for (const leak of [SQL, USER_ID, "invalid input syntax", "Failed query"]) {
      expect(sanitized.stack).not.toContain(leak);
    }
  });

  it("finds a query error deeper in the cause chain", () => {
    const query = new FakeQueryError(
      SQL,
      [USER_ID],
      postgresError("23505", "dup")
    );
    const wrapper = new Error("cleanup failed", { cause: query });

    const { error, tags } = sanitizeError(wrapper);

    expect((error as Error).message).toBe(
      "Database query failed (SQLSTATE 23505)"
    );
    expect(tags).toEqual({ sqlstate: "23505" });
  });

  it("reports an unknown SQLSTATE without a Postgres cause", () => {
    const { error, tags } = sanitizeError(new FakeQueryError(SQL, [USER_ID]));

    expect((error as Error).message).toBe(
      "Database query failed (SQLSTATE unknown)"
    );
    expect(tags).toEqual({ sqlstate: "unknown" });
  });

  it("leaves any other error as it is", () => {
    const other = new Error("database unreachable");

    expect(sanitizeError(other)).toEqual({ error: other });
    expect(sanitizeError("boom")).toEqual({ error: "boom" });
  });

  it("stops at a cause cycle", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;

    expect(sanitizeError(a)).toEqual({ error: a });
  });
});
