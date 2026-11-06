import { defaultStackParser, getCurrentScope, NodeClient } from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportError } from "../node";

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

describe("error reporting", () => {
  const scope = getCurrentScope();

  const previousClient = scope.getClient();

  const captured: { error: unknown; tags: ErrorEvent["tags"] }[] = [];

  const transport = {
    flush: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    send: vi
      .fn<() => Promise<{ statusCode: number }>>()
      .mockResolvedValue({ statusCode: 200 }),
  };

  let client: NodeClient;

  beforeEach(() => {
    captured.length = 0;
    vi.clearAllMocks();
    client = new NodeClient({
      beforeSend: (event, hint) => {
        captured.push({ error: hint.originalException, tags: event.tags });

        return event;
      },
      dsn: "https://public@example.com/1",
      integrations: [],
      stackParser: defaultStackParser,
      transport: () => transport,
    });
    scope.setClient(client);
  });

  afterEach(async () => {
    scope.setClient(previousClient);
    await client.close();
    vi.restoreAllMocks();
  });

  const capturedError = () => {
    const error = captured[0]?.error;

    if (!(error instanceof Error)) {
      throw new TypeError("Expected a captured Error");
    }

    return error;
  };

  it("logs and captures a query failure without its SQL, params or Postgres message", async () => {
    const log = vi.spyOn(console, "error").mockReturnValue(undefined);

    await reportError(new Error("cleanup failed", { cause: queryError() }), {
      route: "clerk",
    });

    expect(captured).toHaveLength(1);
    const error = capturedError();
    expect({
      cause: error.cause,
      message: error.message,
      name: error.name,
      tags: captured[0]?.tags,
    }).toStrictEqual({
      cause: undefined,
      message: "Database query failed (SQLSTATE 22P02)",
      name: "DatabaseQueryError",
      tags: { route: "clerk", sqlstate: "22P02" },
    });

    const logged = log.mock.calls.flat();
    expect(logged).toStrictEqual([error]);

    for (const text of [error.stack, String(error)]) {
      for (const leak of [SQL, USER_ID, "invalid input syntax"]) {
        expect(text).not.toContain(leak);
      }
    }

    expect(transport.flush).toHaveBeenCalledExactlyOnceWith(2000);
  });

  it("logs and captures any other error as it is", async () => {
    const log = vi.spyOn(console, "error").mockReturnValue(undefined);
    const error = new Error("database unreachable");

    await reportError(error);

    expect(log).toHaveBeenCalledWith(error);
    expect(captured).toStrictEqual([{ error, tags: undefined }]);
    expect(capturedError()).toBe(error);
  });
});
