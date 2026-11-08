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
  shownUserMessage,
} from "../arnold-chat";
import {
  MODELS_KEY,
  SELECTED_MODEL_KEY,
  writeCachedArnoldModels,
} from "../arnold-model";
import { i18n } from "../i18n";

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
  const models = {
    defaultId: "openai/gpt-5.5",
    models: [
      { description: "Fast", id: "openai/gpt-5.5", label: "GPT-5.5" },
      {
        description: "Quick",
        id: "anthropic/claude-haiku-4.5",
        label: "Claude Haiku 4.5",
      },
    ],
  };

  afterEach(async () => {
    storage.remove(MODELS_KEY);
    storage.remove(SELECTED_MODEL_KEY);
    await i18n.changeLanguage("en");
  });

  it("sends the chosen model and the App language as the turn's client context", () => {
    writeCachedArnoldModels(models);
    storage.set(SELECTED_MODEL_KEY, "anthropic/claude-haiku-4.5");

    expect(arnoldRunConfig()).toEqual({
      custom: { language: "en", model: "anthropic/claude-haiku-4.5" },
    });
  });

  it("sends the App language without a model, so Arnold uses its default model", () => {
    expect(arnoldRunConfig()).toEqual({ custom: { language: "en" } });
  });

  it("reads the model and the App language at send time", async () => {
    writeCachedArnoldModels(models);
    expect(arnoldRunConfig()).toEqual({
      custom: { language: "en", model: "openai/gpt-5.5" },
    });

    storage.set(SELECTED_MODEL_KEY, "anthropic/claude-haiku-4.5");
    await i18n.changeLanguage("uk");

    expect(arnoldRunConfig()).toEqual({
      custom: { language: "uk", model: "anthropic/claude-haiku-4.5" },
    });
  });

  it.each([
    "es",
    "ca",
    "fr",
    "de",
    "it",
    "pt-BR",
    "pt-PT",
    "pl",
    "zh-Hans",
    "zh-Hant",
    "ja",
    "ko",
    "nl",
  ])("sends %s as the App language", async (language) => {
    await i18n.changeLanguage(language);
    expect(arnoldRunConfig()).toEqual({ custom: { language } });
  });

  it("sends English when the language isn't an App language", async () => {
    await i18n.changeLanguage("ru");

    expect(arnoldRunConfig()).toEqual({ custom: { language: "en" } });
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

  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- This serialization-only fixture deliberately omits Eve transport fields.
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
  const userMessage = (
    status?: string
  ): Parameters<typeof isRefusedSend>[0] => ({
    attachments: [],
    content: [{ text: "Build me a plan", type: "text" }],
    createdAt: new Date("2026-11-07T00:00:00Z"),
    id: "user-message",
    metadata: { custom: status ? { status } : {} },
    role: "user",
  });

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

describe("shownUserMessage", () => {
  type UserMessage = Parameters<typeof shownUserMessage>[0];

  /** A user message as eve projects it, by its metadata and its text. */
  const message = (
    custom: UserMessage["metadata"]["custom"],
    text: string
  ): UserMessage => ({
    attachments: [],
    content: [{ text, type: "text" }],
    createdAt: new Date("2026-11-07T00:00:00Z"),
    id: "user-message",
    metadata: { custom },
    role: "user",
  });

  /** eve's optimistic message: its text summary, placeholders included. */
  const optimistic = (text: string) =>
    message({ optimistic: true, status: "submitted" }, text);

  /** Arnold's echo of a message: the turn it belongs to, and clean text. */
  const echoed = (text: string, turnId = "turn_0") =>
    message({ status: "complete", turnId }, text);

  /** A `message.received` echo of `attachments` files, with its text. */
  const received = (
    attachments: number,
    text: string,
    turnId = "turn_0"
  ): MessageStreamEvent =>
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- This echo fixture deliberately omits Eve transport fields.
    ({
      data: {
        message: text,
        // eve's echo carries a file's metadata only, never its bytes.
        parts: [
          ...(text ? [{ text, type: "text" }] : []),
          ...Array.from({ length: attachments }, () => ({
            mediaType: "image/jpeg",
            size: 1024,
            type: "file",
          })),
        ],
        sequence: 1,
        turnId,
      },
      meta: { at: "2026-11-04T00:00:00.000Z", id: "evt_received" },
      type: "message.received",
    }) as unknown as MessageStreamEvent;

  it("counts the Attachments eve's own optimistic message stands for", () => {
    expect(
      shownUserMessage(
        optimistic("What is this machine?\n[file]\n[file]"),
        "What is this machine?\n[file]\n[file]",
        []
      )
    ).toEqual({ attachmentCount: 2, text: "What is this machine?" });
  });

  it("reads a photo sent with no text as a message with no text", () => {
    expect(shownUserMessage(optimistic("[file]"), "[file]", [])).toEqual({
      attachmentCount: 1,
      text: "",
    });
  });

  it("drops a placeholder eve named the file in", () => {
    const text = "Look\n[file: photo.jpg]";

    expect(shownUserMessage(optimistic(text), text, [])).toEqual({
      attachmentCount: 1,
      text: "Look",
    });
  });

  it("keeps a placeholder the User typed above their own text", () => {
    // eve writes its own after the text, so one in the middle is theirs.
    const text = "[file]\nis how you write it\n[file]";

    expect(shownUserMessage(optimistic(text), text, [])).toEqual({
      attachmentCount: 1,
      text: "[file]\nis how you write it",
    });
  });

  it("counts the files of the echo of its turn", () => {
    const echo = echoed("What is this machine?");

    expect(
      shownUserMessage(echo, "What is this machine?", [
        received(2, "What is this machine?"),
      ])
    ).toEqual({ attachmentCount: 2, text: "What is this machine?" });
  });

  it("counts none for a message sent without Attachments", () => {
    const echo = echoed("How heavy should I squat?");

    expect(
      shownUserMessage(echo, "How heavy should I squat?", [
        received(0, "How heavy should I squat?"),
      ])
    ).toEqual({ attachmentCount: 0, text: "How heavy should I squat?" });
  });

  it("counts only its own turn's files", () => {
    const echo = echoed("Second", "turn_1");

    expect(
      shownUserMessage(echo, "Second", [
        received(2, "First", "turn_0"),
        received(1, "Second", "turn_1"),
      ])
    ).toEqual({ attachmentCount: 1, text: "Second" });
  });

  it("keeps text of the User's own that looks like a placeholder", () => {
    const echo = echoed("[file]");

    expect(shownUserMessage(echo, "[file]", [received(0, "[file]")])).toEqual({
      attachmentCount: 0,
      text: "[file]",
    });
  });

  it("counts none for an echo the saved events don't reach", () => {
    expect(shownUserMessage(echoed("Older"), "Older", [])).toEqual({
      attachmentCount: 0,
      text: "Older",
    });
  });
});
