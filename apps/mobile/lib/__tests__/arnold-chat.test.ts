import { afterEach, describe, expect, it } from "@jest/globals";
import type { MessageStreamEvent } from "eve/client";
import { storage } from "~/lib/mmkv";
import {
  arnoldErrorAction,
  arnoldErrorKind,
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
  const { EXPO_PUBLIC_ARNOLD_URL } = process.env;

  afterEach(() => {
    process.env.EXPO_PUBLIC_ARNOLD_URL = EXPO_PUBLIC_ARNOLD_URL;
  });

  it("uses EXPO_PUBLIC_ARNOLD_URL", () => {
    process.env.EXPO_PUBLIC_ARNOLD_URL = "https://arnold.test";
    expect(getArnoldUrl()).toBe("https://arnold.test");
  });

  it("is empty when it's unset", () => {
    delete process.env.EXPO_PUBLIC_ARNOLD_URL;
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
  it("shows the paywall when Arnold refuses a User without Pro", () => {
    expect(arnoldErrorAction(clientError(403, "arnold_pro_required"))).toBe(
      "paywall"
    );
  });

  it("shows the error when the Pro check is unavailable", () => {
    expect(
      arnoldErrorAction(clientError(503, "arnold_pro_check_unavailable"))
    ).toBe("show");
  });

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

describe("arnoldErrorKind", () => {
  it("names the Pro check being unavailable", () => {
    expect(
      arnoldErrorKind(clientError(503, "arnold_pro_check_unavailable"))
    ).toBe("pro-check-unavailable");
  });

  it("names a send that never reached Arnold", () => {
    expect(arnoldErrorKind(new TypeError("Network request failed"))).toBe(
      "network"
    );
    // expo/fetch's FetchError
    expect(
      arnoldErrorKind(
        new Error("fetch failed: The network connection was lost.")
      )
    ).toBe("network");
  });

  it("calls anything else generic, whatever its message", () => {
    expect(arnoldErrorKind(clientError(500))).toBe("generic");
    expect(arnoldErrorKind(clientError(400, "invalid_request"))).toBe(
      "generic"
    );
    expect(arnoldErrorKind(new Error("The model call failed"))).toBe("generic");
    expect(arnoldErrorKind("boom")).toBe("generic");
    expect(
      arnoldErrorKind(new TypeError("Cannot read properties of undefined"))
    ).toBe("generic");
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
