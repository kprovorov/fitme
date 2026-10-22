import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("@sentry/node", () => sentry);

const { reportError } = await import("../node");

const SQL = 'delete from "profiles" where "user_id" = $1';
const USER_ID = "user_2DeleteMe00000000000000";

/** Shaped like Drizzle's `DrizzleQueryError`. */
const queryError = () =>
  Object.assign(
    new Error(`Failed query: ${SQL}\nparams: ${USER_ID}`, {
      cause: Object.assign(
        new Error(`invalid input syntax for type uuid: "${USER_ID}"`),
        { code: "22P02" }
      ),
    }),
    { params: [USER_ID], query: SQL }
  );

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("reportError", () => {
  it("logs and captures a query failure without its SQL, params or Postgres message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await reportError(new Error("cleanup failed", { cause: queryError() }), {
      route: "clerk",
    });

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [captured, hint] = sentry.captureException.mock.calls[0] ?? [];
    expect(captured).toBeInstanceOf(Error);
    expect(captured.name).toBe("DatabaseQueryError");
    expect(captured.message).toBe("Database query failed (SQLSTATE 22P02)");
    expect(captured.cause).toBeUndefined();
    expect(hint).toEqual({ tags: { route: "clerk", sqlstate: "22P02" } });

    const logged = log.mock.calls.flat();
    expect(logged).toEqual([captured]);
    for (const text of [captured.stack, String(captured)]) {
      for (const leak of [SQL, USER_ID, "invalid input syntax"]) {
        expect(text).not.toContain(leak);
      }
    }
    expect(sentry.flush).toHaveBeenCalled();
  });

  it("logs and captures any other error as it is", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("database unreachable");

    await reportError(error);

    expect(log).toHaveBeenCalledWith(error);
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      tags: undefined,
    });
  });
});
