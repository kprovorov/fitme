import { coachErrorCodes, coachModels } from "@fitme/core";
import { describe, expect, it } from "@jest/globals";
import type { MessageStreamEvent } from "eve/client";
import {
  clearSavedCoachConversation,
  coachErrorAction,
  coachRunConfig,
  isRefusedSend,
  loadSavedCoachConversation,
  saveCoachConversation,
  saveCoachSession,
} from "../coach-chat";

/** The shape eve's `ClientError` gives a refused request. */
function clientError(status: number, code?: string) {
  return Object.assign(new Error("refused"), {
    body: JSON.stringify({ code, ok: false }),
    code,
    status,
  });
}

describe("coachRunConfig", () => {
  it("sends the chosen model as the turn's client context", () => {
    const [model] = coachModels;
    expect(coachRunConfig(model.id)).toEqual({ custom: { model: model.id } });
  });
});

describe("coachErrorAction", () => {
  it("shows the paywall when the Coach refuses a User without Pro", () => {
    expect(
      coachErrorAction(clientError(403, coachErrorCodes.proRequired))
    ).toBe("paywall");
  });

  it("shows the error when the Pro check is unavailable", () => {
    expect(
      coachErrorAction(clientError(503, coachErrorCodes.proCheckUnavailable))
    ).toBe("show");
  });

  it("starts a new Conversation when the saved one has ended", () => {
    expect(coachErrorAction(clientError(409, "session_not_active"))).toBe(
      "new-conversation"
    );
    expect(coachErrorAction(clientError(410, "session_expired"))).toBe(
      "new-conversation"
    );
    expect(coachErrorAction(clientError(409, "session_stranded"))).toBe(
      "new-conversation"
    );
  });

  it("shows any other error", () => {
    expect(coachErrorAction(clientError(500))).toBe("show");
    expect(coachErrorAction(new TypeError("Network request failed"))).toBe(
      "show"
    );
  });

  it("does nothing without an error", () => {
    expect(coachErrorAction(undefined)).toBe("none");
  });
});

describe("saved Coach Conversation", () => {
  const session = { sessionId: "ses_1", streamIndex: 4 };
  const events = [
    { meta: { id: "evt_1" }, type: "session.started" },
  ] as unknown as MessageStreamEvent[];

  it("starts empty", () => {
    expect(loadSavedCoachConversation("user_empty")).toEqual({});
  });

  it("keeps the session and its events per User", () => {
    saveCoachConversation("user_a", { events, session });

    expect(loadSavedCoachConversation("user_a")).toEqual({ events, session });
    expect(loadSavedCoachConversation("user_b")).toEqual({});
  });

  it("moves the session cursor without dropping the saved events", () => {
    saveCoachConversation("user_c", { events, session });
    saveCoachSession("user_c", { sessionId: "ses_1", streamIndex: 9 });

    expect(loadSavedCoachConversation("user_c")).toEqual({
      events,
      session: { sessionId: "ses_1", streamIndex: 9 },
    });
  });

  it("drops the saved events when the session changes", () => {
    saveCoachConversation("user_d", { events, session });
    saveCoachSession("user_d", { sessionId: "ses_2", streamIndex: 0 });

    expect(loadSavedCoachConversation("user_d")).toEqual({
      session: { sessionId: "ses_2", streamIndex: 0 },
    });
  });

  it("forgets the Conversation on clear", () => {
    saveCoachConversation("user_e", { events, session });
    clearSavedCoachConversation("user_e");

    expect(loadSavedCoachConversation("user_e")).toEqual({});
  });

  it("forgets the Conversation when its session is cleared", () => {
    saveCoachConversation("user_f", { events, session });
    saveCoachSession("user_f", undefined);

    expect(loadSavedCoachConversation("user_f")).toEqual({});
  });
});

describe("isRefusedSend", () => {
  const userMessage = (status?: string) =>
    ({
      content: [{ text: "Build me a plan", type: "text" }],
      metadata: { custom: status ? { status } : {} },
      role: "user",
    }) as unknown as Parameters<typeof isRefusedSend>[0];

  it("spots the placeholder eve keeps for a send the Coach refused", () => {
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
