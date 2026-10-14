import { describe, expect, it } from "vitest";
import { coachSessionResetter, deleteCoachConversations } from "../coach.js";

const USER_ID = "user_2DeleteMe00000000000000";
const COACH_URL = "https://coach.test";
const SECRET = "reset-secret-0123456789abcdef0123456789abcdef";

/** Fake records and Coach: `failing` session ids fail to reset. */
const setup = (recorded: string[], failing: string[] = []) => {
  const records = new Set(recorded);
  const reset: string[] = [];
  const askedFor: string[] = [];
  const wipe = deleteCoachConversations({
    deleteSessionRecords: (userId, sessionIds) => {
      askedFor.push(userId);
      for (const id of sessionIds) {
        records.delete(id);
      }
      return Promise.resolve();
    },
    listSessionIds: (userId) => {
      askedFor.push(userId);
      return Promise.resolve([...records]);
    },
    resetSession: (sessionId) => {
      if (failing.includes(sessionId)) {
        return Promise.reject(new Error(`Coach unreachable for ${sessionId}`));
      }
      reset.push(sessionId);
      return Promise.resolve();
    },
  });
  return { askedFor, records, reset, wipe };
};

describe("deleteCoachConversations", () => {
  it("resets every recorded session, then deletes the records", async () => {
    const { askedFor, records, reset, wipe } = setup(["wrun_a", "wrun_b"]);

    await wipe(USER_ID);

    expect(reset.sort()).toEqual(["wrun_a", "wrun_b"]);
    expect([...records]).toEqual([]);
    expect(askedFor).toEqual([USER_ID, USER_ID]);
  });

  it("deletes fine for a User with no recorded sessions", async () => {
    const { reset, wipe } = setup([]);

    await wipe(USER_ID);

    expect(reset).toEqual([]);
  });

  it("keeps the record of a session that failed to reset, and fails", async () => {
    const { records, reset, wipe } = setup(["wrun_a", "wrun_b"], ["wrun_b"]);

    await expect(wipe(USER_ID)).rejects.toThrow("wrun_b");

    expect(reset).toEqual(["wrun_a"]);
    expect([...records]).toEqual(["wrun_b"]);
  });

  it("finishes on a retry after a partial failure", async () => {
    const failing = ["wrun_b"];
    const { records, wipe } = setup(["wrun_a", "wrun_b"], failing);
    await expect(wipe(USER_ID)).rejects.toThrow();

    failing.length = 0;
    await wipe(USER_ID);

    expect([...records]).toEqual([]);
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

describe("coachSessionResetter", () => {
  it("posts the reset route with the reset secret", async () => {
    const { fetch, requests } = fakeFetch(() =>
      Response.json({ ok: true, previousSessionId: "wrun_a", status: "reset" })
    );

    await coachSessionResetter({ coachUrl: COACH_URL, fetch, secret: SECRET })(
      "wrun_a"
    );

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(`${COACH_URL}/eve/v1/session/wrun_a/reset`);
    expect(request?.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(await request?.json()).toEqual({ reason: "Account deleted" });
  });

  it("accepts a session that was already reset or has expired", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json({ ok: true, status: "no_active_session" })
    );

    await expect(
      coachSessionResetter({
        coachUrl: `${COACH_URL}/`,
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
      coachSessionResetter({ coachUrl: COACH_URL, fetch, secret: SECRET })(
        "wrun_a"
      )
    ).rejects.toThrow("500");
  });

  it("fails on a success response that isn't eve's", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html>Log in</html>", { status: 200 })
    );

    await expect(
      coachSessionResetter({ coachUrl: COACH_URL, fetch, secret: SECRET })(
        "wrun_a"
      )
    ).rejects.toThrow("reset failed");
  });

  it("fails without COACH_URL or COACH_RESET_SECRET, before any request", async () => {
    const { fetch, requests } = fakeFetch(() => Response.json({}));

    await expect(
      coachSessionResetter({ coachUrl: undefined, fetch, secret: SECRET })(
        "wrun_a"
      )
    ).rejects.toThrow("COACH_URL");
    await expect(
      coachSessionResetter({ coachUrl: COACH_URL, fetch, secret: undefined })(
        "wrun_a"
      )
    ).rejects.toThrow("COACH_RESET_SECRET");
    expect(requests).toEqual([]);
  });
});
