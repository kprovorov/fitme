import { afterEach, describe, expect, it } from "@jest/globals";
import type { MessageStreamEvent } from "eve/client";
import { storage } from "~/lib/mmkv";
import {
  arnoldErrorAction,
  arnoldRunConfig,
  clearSavedArnoldConversation,
  getArnoldUrl,
  isRefusedSend,
  loadSavedArnoldConversation,
  saveArnoldConversation,
  saveArnoldSession,
} from "../arnold-chat";

/** The shape eve's `ClientError` gives a refused request. */
function clientError(status: number, code?: string) {
  return Object.assign(new Error("refused"), {
    body: JSON.stringify({ code, ok: false }),
    code,
    status,
  });
}

describe("getArnoldUrl", () => {
  const { EXPO_PUBLIC_ARNOLD_URL, EXPO_PUBLIC_COACH_URL } = process.env;

  afterEach(() => {
    process.env.EXPO_PUBLIC_ARNOLD_URL = EXPO_PUBLIC_ARNOLD_URL;
    process.env.EXPO_PUBLIC_COACH_URL = EXPO_PUBLIC_COACH_URL;
  });

  it("uses EXPO_PUBLIC_ARNOLD_URL when it's set", () => {
    process.env.EXPO_PUBLIC_ARNOLD_URL = "https://arnold.test";
    process.env.EXPO_PUBLIC_COACH_URL = "https://coach.test";
    expect(getArnoldUrl()).toBe("https://arnold.test");
  });

  it("falls back to the pre-rename EXPO_PUBLIC_COACH_URL", () => {
    process.env.EXPO_PUBLIC_ARNOLD_URL = "";
    process.env.EXPO_PUBLIC_COACH_URL = "https://coach.test";
    expect(getArnoldUrl()).toBe("https://coach.test");
  });

  it("is empty when neither is set", () => {
    delete process.env.EXPO_PUBLIC_ARNOLD_URL;
    delete process.env.EXPO_PUBLIC_COACH_URL;
    expect(getArnoldUrl()).toBe("");
  });
});

describe("arnoldRunConfig", () => {
  it("sends the chosen model as the turn's client context", () => {
    expect(arnoldRunConfig("openai/gpt-5.5")).toEqual({
      custom: { model: "openai/gpt-5.5" },
    });
  });

  it("sends no client context without a model, so Arnold uses its default", () => {
    expect(arnoldRunConfig(undefined)).toEqual({});
  });
});

describe("arnoldErrorAction", () => {
  // Arnold's channel sends the coach_* codes until pre-rename builds are cut
  // off, then the arnold_* ones: either form means the same refusal.
  it.each(["arnold_pro_required", "coach_pro_required"])(
    "shows the paywall when Arnold refuses a User without Pro (%s)",
    (code) => {
      expect(arnoldErrorAction(clientError(403, code))).toBe("paywall");
    }
  );

  it.each(["arnold_pro_check_unavailable", "coach_pro_check_unavailable"])(
    "shows the error when the Pro check is unavailable (%s)",
    (code) => {
      expect(arnoldErrorAction(clientError(503, code))).toBe("show");
    }
  );

  it("starts a new Conversation when the saved one has ended", () => {
    expect(arnoldErrorAction(clientError(409, "session_not_active"))).toBe(
      "new-conversation"
    );
    expect(arnoldErrorAction(clientError(410, "session_expired"))).toBe(
      "new-conversation"
    );
    expect(arnoldErrorAction(clientError(409, "session_stranded"))).toBe(
      "new-conversation"
    );
  });

  it("shows any other error", () => {
    expect(arnoldErrorAction(clientError(500))).toBe("show");
    expect(arnoldErrorAction(new TypeError("Network request failed"))).toBe(
      "show"
    );
  });

  it("does nothing without an error", () => {
    expect(arnoldErrorAction(undefined)).toBe("none");
  });
});

describe("saved Arnold Conversation", () => {
  const session = { sessionId: "ses_1", streamIndex: 4 };
  const events = [
    { meta: { id: "evt_1" }, type: "session.started" },
  ] as unknown as MessageStreamEvent[];

  it("starts empty", () => {
    expect(loadSavedArnoldConversation("user_empty")).toEqual({});
  });

  it("keeps the session and its events per User", () => {
    saveArnoldConversation("user_a", { events, session });

    expect(loadSavedArnoldConversation("user_a")).toEqual({ events, session });
    expect(loadSavedArnoldConversation("user_b")).toEqual({});
  });

  it("moves the session cursor without dropping the saved events", () => {
    saveArnoldConversation("user_c", { events, session });
    saveArnoldSession("user_c", { sessionId: "ses_1", streamIndex: 9 });

    expect(loadSavedArnoldConversation("user_c")).toEqual({
      events,
      session: { sessionId: "ses_1", streamIndex: 9 },
    });
  });

  it("drops the saved events when the session changes", () => {
    saveArnoldConversation("user_d", { events, session });
    saveArnoldSession("user_d", { sessionId: "ses_2", streamIndex: 0 });

    expect(loadSavedArnoldConversation("user_d")).toEqual({
      session: { sessionId: "ses_2", streamIndex: 0 },
    });
  });

  it("forgets the Conversation on clear", () => {
    saveArnoldConversation("user_e", { events, session });
    clearSavedArnoldConversation("user_e");

    expect(loadSavedArnoldConversation("user_e")).toEqual({});
  });

  it("saves under the arnold.conversation keys", () => {
    saveArnoldConversation("user_g", { events, session });

    expect(
      JSON.parse(storage.getString("arnold.conversation.user_g.session") ?? "")
    ).toEqual(session);
    expect(
      JSON.parse(storage.getString("arnold.conversation.user_g.events") ?? "")
    ).toEqual(events);
  });

  it("ignores a Conversation saved under the pre-rename coach keys", () => {
    storage.set("coach.conversation.user_h.session", JSON.stringify(session));
    storage.set("coach.conversation.user_h.events", JSON.stringify(events));

    expect(loadSavedArnoldConversation("user_h")).toEqual({});
  });

  it("forgets the Conversation when its session is cleared", () => {
    saveArnoldConversation("user_f", { events, session });
    saveArnoldSession("user_f", undefined);

    expect(loadSavedArnoldConversation("user_f")).toEqual({});
  });
});

describe("isRefusedSend", () => {
  const userMessage = (status?: string) =>
    ({
      content: [{ text: "Build me a plan", type: "text" }],
      metadata: { custom: status ? { status } : {} },
      role: "user",
    }) as unknown as Parameters<typeof isRefusedSend>[0];

  it("spots the placeholder eve keeps for a send Arnold refused", () => {
    expect(isRefusedSend(userMessage("failed"))).toBe(true);
  });

  it("keeps a delivered message", () => {
    expect(isRefusedSend(userMessage())).toBe(false);
  });

  it("keeps a failed assistant answer, which shows as an error", () => {
    expect(
      isRefusedSend({
        ...userMessage("failed"),
        role: "assistant",
      } as Parameters<typeof isRefusedSend>[0])
    ).toBe(false);
  });
});
