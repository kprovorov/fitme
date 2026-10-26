import { describe, expect, it } from "vitest";
import {
  arnoldResetConfig,
  arnoldSessionResetter,
  deleteArnoldConversations,
} from "../arnold.js";

const USER_ID = "user_2DeleteMe00000000000000";
const ARNOLD_URL = "https://arnold.test";
const SECRET = "reset-secret-0123456789abcdef0123456789abcdef";

/**
 * Fake records and Arnold: `failing` session ids fail to reset; like eve,
 * resetting a session again succeeds and leaves it retired.
 */
const setup = (recorded: string[], failing: string[] = []) => {
  const retired = new Set<string>();
  const listedFor: string[] = [];
  const wipe = deleteArnoldConversations({
    listSessionIds: (userId) => {
      listedFor.push(userId);
      return Promise.resolve(recorded);
    },
    resetSession: (sessionId) => {
      if (failing.includes(sessionId)) {
        return Promise.reject(new Error(`Arnold unreachable for ${sessionId}`));
      }
      retired.add(sessionId);
      return Promise.resolve();
    },
  });
  return { listedFor, retired, wipe };
};

describe("deleteArnoldConversations", () => {
  it("resets every session recorded for the User", async () => {
    const { listedFor, retired, wipe } = setup([
      "wrun_a",
      "wrun_b",
      "wrun_c",
      "wrun_d",
      "wrun_e",
      "wrun_f",
    ]);

    await wipe(USER_ID);

    expect(listedFor).toEqual([USER_ID]);
    expect([...retired].sort()).toEqual([
      "wrun_a",
      "wrun_b",
      "wrun_c",
      "wrun_d",
      "wrun_e",
      "wrun_f",
    ]);
  });

  it("deletes fine for a User with no recorded sessions", async () => {
    const { retired, wipe } = setup([]);

    await wipe(USER_ID);

    expect(retired.size).toBe(0);
  });

  it("resets the rest and fails when one session fails to reset", async () => {
    const { retired, wipe } = setup(["wrun_a", "wrun_b"], ["wrun_b"]);

    const failure = await wipe(USER_ID).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).message).toBe(
      "Failed to reset 1 of 2 Arnold sessions"
    );
    expect((failure as AggregateError).cause).toEqual(
      new Error("Arnold unreachable for wrun_b")
    );
    expect([...retired]).toEqual(["wrun_a"]);
  });

  it("finishes on a retry after a partial failure", async () => {
    const failing = ["wrun_b"];
    const { retired, wipe } = setup(["wrun_a", "wrun_b"], failing);
    await expect(wipe(USER_ID)).rejects.toThrow();

    failing.length = 0;
    await wipe(USER_ID);

    expect([...retired].sort()).toEqual(["wrun_a", "wrun_b"]);
  });
});

/** A fake fetch answering `response`, recording each request. */
const fakeFetch = (response: () => Response) => {
  const requests: Request[] = [];
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return Promise.resolve(response());
  };
  return { fetch, requests };
};

describe("arnoldSessionResetter", () => {
  it("posts the reset route with the reset secret", async () => {
    const { fetch, requests } = fakeFetch(() =>
      Response.json({ ok: true, previousSessionId: "wrun_a", status: "reset" })
    );

    await arnoldSessionResetter({
      arnoldUrl: ARNOLD_URL,
      fetch,
      secret: SECRET,
    })("wrun_a");

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(`${ARNOLD_URL}/eve/v1/session/wrun_a/reset`);
    expect(request?.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(await request?.json()).toEqual({ reason: "Account deleted" });
  });

  it("accepts a session that was already reset or has expired", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json({ ok: true, status: "no_active_session" })
    );

    await expect(
      arnoldSessionResetter({
        arnoldUrl: `${ARNOLD_URL}/`,
        fetch,
        secret: SECRET,
      })("wrun_a")
    ).resolves.toBeUndefined();
  });

  it("fails on an error response", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json(
        { error: "Failed to reset the session.", ok: false },
        {
          status: 500,
        }
      )
    );

    await expect(
      arnoldSessionResetter({ arnoldUrl: ARNOLD_URL, fetch, secret: SECRET })(
        "wrun_a"
      )
    ).rejects.toThrow("500");
  });

  it("fails on a success response that isn't eve's", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html>Log in</html>", { status: 200 })
    );

    await expect(
      arnoldSessionResetter({ arnoldUrl: ARNOLD_URL, fetch, secret: SECRET })(
        "wrun_a"
      )
    ).rejects.toThrow("reset failed");
  });

  it.each([
    ["without ok", { previousSessionId: "wrun_a", status: "reset" }],
    [
      "with ok: false",
      { ok: false, previousSessionId: "wrun_a", status: "reset" },
    ],
    [
      "naming another session",
      { ok: true, previousSessionId: "wrun_b", status: "reset" },
    ],
    ["with an unknown status", { ok: true, status: "accepted" }],
  ])("fails on a 200 reset answer %s", async (_case, body) => {
    const { fetch } = fakeFetch(() => Response.json(body));

    await expect(
      arnoldSessionResetter({ arnoldUrl: ARNOLD_URL, fetch, secret: SECRET })(
        "wrun_a"
      )
    ).rejects.toThrow("reset failed");
  });

  it("fails without ARNOLD_URL or ARNOLD_RESET_SECRET, before any request", async () => {
    const { fetch, requests } = fakeFetch(() => Response.json({}));

    await expect(
      arnoldSessionResetter({ arnoldUrl: undefined, fetch, secret: SECRET })(
        "wrun_a"
      )
    ).rejects.toThrow("ARNOLD_URL");
    await expect(
      arnoldSessionResetter({
        arnoldUrl: ARNOLD_URL,
        fetch,
        secret: undefined,
      })("wrun_a")
    ).rejects.toThrow("ARNOLD_RESET_SECRET");
    expect(requests).toEqual([]);
  });
});

describe("arnoldResetConfig", () => {
  it("reads ARNOLD_URL and ARNOLD_RESET_SECRET", () => {
    expect(
      arnoldResetConfig({
        ARNOLD_RESET_SECRET: SECRET,
        ARNOLD_URL,
      })
    ).toEqual({ arnoldUrl: ARNOLD_URL, secret: SECRET });
  });

  it("ignores the pre-rename COACH_URL and COACH_RESET_SECRET", () => {
    expect(
      arnoldResetConfig({
        COACH_RESET_SECRET: SECRET,
        COACH_URL: ARNOLD_URL,
      })
    ).toEqual({ arnoldUrl: undefined, secret: undefined });
  });

  it("is unset without them", () => {
    expect(arnoldResetConfig({})).toEqual({
      arnoldUrl: undefined,
      secret: undefined,
    });
  });
});
