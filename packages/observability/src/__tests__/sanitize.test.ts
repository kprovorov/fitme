import { assert, describe, expect, it } from "vitest";

import { isQueryError, sanitizeError } from "../index";

const SQL = 'delete from "profiles" where "user_id" = $1';
const USER_ID = "user_2DeleteMe00000000000000";

/** Shaped like Drizzle's `DrizzleQueryError`, which this package can't import. */
class FakeQueryError extends Error {
  readonly params: unknown[];
  readonly query: string;

  constructor(query: string, params: unknown[], cause?: unknown) {
    super(`Failed query: ${query}\nparams: ${String(params)}`, { cause });
    this.name = "FakeQueryError";
    this.query = query;
    this.params = params;
  }
}

/** A `pg` error: a SQLSTATE `code` and a message that can echo input. */
const postgresError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

describe("query error detection", () => {
  it("recognises an error with own query and params", () => {
    expect(isQueryError(new FakeQueryError(SQL, [USER_ID]))).toBeTruthy();
  });

  it("rejects anything else", () => {
    expect(isQueryError(new Error("Failed query: select 1"))).toBeFalsy();
    expect(isQueryError({ params: [], query: SQL })).toBeFalsy();
    expect(isQueryError(postgresError("22P02", "bad"))).toBeFalsy();
    expect(isQueryError(null)).toBeFalsy();
  });
});

describe("error sanitization", () => {
  it("replaces a query error with its SQLSTATE and stack frames only", () => {
    const cause = postgresError(
      "22P02",
      `invalid input syntax for type uuid: "${USER_ID}"`
    );

    const query = new FakeQueryError(SQL, [USER_ID], cause);

    const { error, tags } = sanitizeError(query);

    assert.instanceOf(error, Error);
    const sanitized = error;
    expect({
      name: sanitized.name,
      message: sanitized.message,
      cause: sanitized.cause,
      tags,
    }).toStrictEqual({
      name: "DatabaseQueryError",
      message: "Database query failed (SQLSTATE 22P02)",
      cause: undefined,
      tags: { sqlstate: "22P02" },
    });

    const [header, ...frames] = (sanitized.stack ?? "").split("\n");
    expect(header).toBe(
      "DatabaseQueryError: Database query failed (SQLSTATE 22P02)"
    );
    expect(frames.length).toBeGreaterThan(0);

    for (const leak of [SQL, USER_ID, "invalid input syntax", "Failed query"]) {
      expect(sanitized.stack).not.toContain(leak);
    }

    expect(frames).toStrictEqual(
      (query.stack ?? "")
        .split("\n")
        .filter((line) => line.startsWith("    at "))
    );
  });

  it("finds a query error deeper in the cause chain", () => {
    const query = new FakeQueryError(
      SQL,
      [USER_ID],
      postgresError("23505", "dup")
    );

    const wrapper = new Error("cleanup failed", { cause: query });

    const { error, tags } = sanitizeError(wrapper);

    assert.instanceOf(error, Error);
    expect(error.message).toBe("Database query failed (SQLSTATE 23505)");
    expect(tags).toStrictEqual({ sqlstate: "23505" });
  });

  it("reports an unknown SQLSTATE without a Postgres cause", () => {
    const { error, tags } = sanitizeError(new FakeQueryError(SQL, [USER_ID]));

    assert.instanceOf(error, Error);
    expect(error.message).toBe("Database query failed (SQLSTATE unknown)");
    expect(tags).toStrictEqual({ sqlstate: "unknown" });
  });

  it("leaves any other error as it is", () => {
    const other = new Error("database unreachable");

    expect(sanitizeError(other)).toStrictEqual({ error: other });
    expect(sanitizeError("boom")).toStrictEqual({ error: "boom" });
  });

  it("stops at a cause cycle", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;

    expect(sanitizeError(a)).toStrictEqual({ error: a });
  });
});
