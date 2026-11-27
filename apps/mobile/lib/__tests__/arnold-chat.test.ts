import type {
  ThreadAssistantMessage,
  ThreadMessage,
  ToolCallMessagePart,
} from "@assistant-ui/react-native";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { SessionStreamEvent } from "eve/client";

import { storage } from "~/lib/mmkv";
import type * as InMemoryFileSystem from "~/test-utils/in-memory-file-system";

import {
  arnoldErrorAction,
  arnoldErrorKind,
  arnoldRunConfig,
  clearSavedArnoldConversation,
  echoedAttachmentNames,
  getArnoldUrl,
  isRefusedSend,
  loadSavedArnoldConversation,
  arnoldEdits,
  saveArnoldConversation,
  saveArnoldSession,
  savedArnoldSessionId,
  shownUserMessage,
} from "../arnold-chat";
import {
  MODELS_KEY,
  SELECTED_MODEL_KEY,
  writeCachedArnoldModels,
} from "../arnold-model";
import {
  keepSentAttachments,
  sentAttachmentUri,
} from "../arnold-sent-attachments";
import { i18n } from "../i18n";

// The device copies of sent Attachments go through the file system, which
// the Conversation's own lifecycle takes away: an in-memory one, so a test
// sees what is left (`test-utils/in-memory-file-system.ts`).
jest.mock(
  "expo-file-system",
  () =>
    jest.requireActual<typeof InMemoryFileSystem>(
      "~/test-utils/in-memory-file-system"
    ).fileSystemModule
);

const { fileSystem } = jest.requireActual<typeof InMemoryFileSystem>(
  "~/test-utils/in-memory-file-system"
);

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

describe("a saved Conversation's Attachments", () => {
  /** A re-encoded JPEG the picker left in the cache, holding its own bytes. */
  const picked = (name: string): string => {
    const uri = `file:///memory/cache/${name}.jpg`;
    fileSystem.write(uri, `${name}-bytes`);

    return uri;
  };

  beforeEach(() => {
    fileSystem.reset();
  });

  it("takes the first message's copies under the session eve names", async () => {
    const names = await keepSentAttachments("user_binds", undefined, [
      picked("gym"),
    ]);

    saveArnoldSession("user_binds", { sessionId: "ses_1", streamIndex: 0 });

    expect(sentAttachmentUri("user_binds", "ses_1", names[0] ?? "")).toBe(
      `file:///memory/document/arnold-attachments/user_binds/ses_1/${names[0]}`
    );
  });

  it("drops them when a new session replaces the saved one", async () => {
    saveArnoldConversation("user_replaced", {
      session: { sessionId: "ses_1", streamIndex: 0 },
    });

    const names = await keepSentAttachments("user_replaced", "ses_1", [
      picked("gym"),
    ]);

    saveArnoldSession("user_replaced", { sessionId: "ses_2", streamIndex: 0 });

    expect(
      sentAttachmentUri("user_replaced", "ses_1", names[0] ?? "")
    ).toBeUndefined();
  });

  it("keeps them while the Conversation is the same one", async () => {
    saveArnoldConversation("user_resumed", {
      session: { sessionId: "ses_1", streamIndex: 0 },
    });

    const names = await keepSentAttachments("user_resumed", "ses_1", [
      picked("gym"),
    ]);

    saveArnoldSession("user_resumed", { sessionId: "ses_1", streamIndex: 7 });

    expect(
      sentAttachmentUri("user_resumed", "ses_1", names[0] ?? "")
    ).toBeTruthy();
  });

  it("forgets them with the Conversation", async () => {
    const names = await keepSentAttachments("user_cleared", "ses_1", [
      picked("gym"),
    ]);

    clearSavedArnoldConversation("user_cleared");

    expect(
      sentAttachmentUri("user_cleared", "ses_1", names[0] ?? "")
    ).toBeUndefined();
  });

  it("forgets them when the Conversation's session is gone", async () => {
    const names = await keepSentAttachments("user_gone", "ses_1", [
      picked("gym"),
    ]);

    saveArnoldSession("user_gone", undefined);

    expect(
      sentAttachmentUri("user_gone", "ses_1", names[0] ?? "")
    ).toBeUndefined();
  });
});

describe("echoedAttachmentNames", () => {
  const echo = (
    turnId: string,
    filenames: readonly string[]
  ): SessionStreamEvent => ({
    data: {
      deliveryId: `dlv_${turnId}`,
      parts: [
        { kind: "text", text: "What is this machine?" },
        ...filenames.map((filename) => ({
          filename,
          kind: "file" as const,
          mediaType: "image/jpeg",
          size: 10,
        })),
      ],
      turnId,
    },
    meta: { at: "2026-01-01T00:00:00.000Z", position: { index: 1, line: 1 } },
    scope: { turnId },
    type: "delivery.consumed",
  });

  it("names every Attachment the Conversation's messages carry", () => {
    expect([
      ...echoedAttachmentNames([
        echo("turn_0", ["a.jpg"]),
        echo("turn_1", ["b.jpg", "c.jpg"]),
      ]),
    ]).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("names none for a Conversation of text alone", () => {
    expect(echoedAttachmentNames([echo("turn_0", [])]).size).toBe(0);
    expect(echoedAttachmentNames([]).size).toBe(0);
  });
});

describe("savedArnoldSessionId", () => {
  it("answers the session a send keeps its Attachments under", () => {
    saveArnoldConversation("user_session_id", {
      session: { sessionId: "ses_9", streamIndex: 0 },
    });

    expect(savedArnoldSessionId("user_session_id")).toBe("ses_9");
  });

  it("answers nothing before eve has named one", () => {
    expect(savedArnoldSessionId("user_no_session")).toBeUndefined();
  });
});

describe("saved Arnold Conversation", () => {
  const session = { sessionId: "ses_1", streamIndex: 4 };

  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- This serialization-only fixture deliberately omits Eve transport fields.
  const events = [
    { meta: { position: { index: 0, line: 0 } }, type: "session.started" },
  ] as unknown as SessionStreamEvent[];

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

  it("saves under the arnold.conversation.v2 keys", () => {
    saveArnoldConversation("user_g", { events, session });

    expect(
      JSON.parse(
        storage.getString("arnold.conversation.v2.user_g.session") ?? ""
      )
    ).toEqual(session);
    expect(
      JSON.parse(
        storage.getString("arnold.conversation.v2.user_g.events") ?? ""
      )
    ).toEqual(events);
    expect(
      storage.getString("arnold.conversation.user_g.session")
    ).toBeUndefined();
  });

  it("forgets the Conversation when its session is cleared", () => {
    saveArnoldConversation("user_f", { events, session });
    saveArnoldSession("user_f", undefined);

    expect(loadSavedArnoldConversation("user_f")).toEqual({});
  });
});

describe("a Conversation saved by the eve 0.83 build", () => {
  const newer = { sessionId: "ses_new", streamIndex: 3 };

  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- This serialization-only fixture deliberately omits Eve transport fields.
  const events = [
    { meta: { position: { index: 0, line: 0 } }, type: "session.started" },
  ] as unknown as SessionStreamEvent[];

  /** Writes the keys the 0.83 build saved, its v26 log and cursor. */
  const saveAsOldBuild = (userId: string) => {
    storage.set(
      `arnold.conversation.${userId}.session`,
      JSON.stringify({ sessionId: "ses_old", streamIndex: 17 })
    );
    storage.set(
      `arnold.conversation.${userId}.events`,
      JSON.stringify([{ data: { parts: [] }, type: "message.received" }])
    );
  };

  it("keeps its session, to be re-read from position 0, and drops its log", () => {
    saveAsOldBuild("user_old");

    expect(loadSavedArnoldConversation("user_old")).toEqual({
      session: { sessionId: "ses_old", streamIndex: 0 },
    });
  });

  it("cleans up the old keys once read, keeping the session on the new one", () => {
    saveAsOldBuild("user_old_cleanup");
    loadSavedArnoldConversation("user_old_cleanup");

    expect(
      storage.getString("arnold.conversation.user_old_cleanup.session")
    ).toBeUndefined();
    expect(
      storage.getString("arnold.conversation.user_old_cleanup.events")
    ).toBeUndefined();
    expect(loadSavedArnoldConversation("user_old_cleanup")).toEqual({
      session: { sessionId: "ses_old", streamIndex: 0 },
    });
  });

  it("answers its session, once read, as the one a send keeps its Attachments under", () => {
    saveAsOldBuild("user_old_send");
    loadSavedArnoldConversation("user_old_send");

    expect(savedArnoldSessionId("user_old_send")).toBe("ses_old");
  });

  it("never reads another User's", () => {
    saveAsOldBuild("user_old_a");

    expect(loadSavedArnoldConversation("user_old_b")).toEqual({});
    expect(
      storage.getString("arnold.conversation.user_old_a.session")
    ).toBeTruthy();
  });

  it("prefers a Conversation the new build saved", () => {
    saveAsOldBuild("user_both");
    saveArnoldConversation("user_both", { events, session: newer });

    expect(loadSavedArnoldConversation("user_both")).toEqual({
      events,
      session: newer,
    });
    expect(
      storage.getString("arnold.conversation.user_both.session")
    ).toBeUndefined();
  });

  it("re-reads from the start again after a read cut short", () => {
    saveAsOldBuild("user_old_cut");
    loadSavedArnoldConversation("user_old_cut");
    // The re-read got this far before the network or the app went.
    saveArnoldSession("user_old_cut", {
      sessionId: "ses_old",
      streamIndex: 12,
    });

    expect(loadSavedArnoldConversation("user_old_cut")).toEqual({
      session: { sessionId: "ses_old", streamIndex: 0 },
    });
  });

  it("moves on once the re-read's log is saved with it", () => {
    saveAsOldBuild("user_old_done");
    loadSavedArnoldConversation("user_old_done");
    saveArnoldConversation("user_old_done", {
      events,
      session: { sessionId: "ses_old", streamIndex: 12 },
    });
    saveArnoldSession("user_old_done", {
      sessionId: "ses_old",
      streamIndex: 14,
    });

    expect(loadSavedArnoldConversation("user_old_done")).toEqual({
      events,
      session: { sessionId: "ses_old", streamIndex: 14 },
    });
  });

  it("is forgotten on clear", () => {
    saveAsOldBuild("user_old_clear");
    clearSavedArnoldConversation("user_old_clear");

    expect(loadSavedArnoldConversation("user_old_clear")).toEqual({});
  });

  it("drops one it can't read", () => {
    storage.set("arnold.conversation.user_old_bad.session", "{");

    expect(loadSavedArnoldConversation("user_old_bad")).toEqual({});
    expect(
      storage.getString("arnold.conversation.user_old_bad.session")
    ).toBeUndefined();
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

describe("arnoldEdits", () => {
  const toolCall = (
    toolCallId: string,
    part: Partial<ToolCallMessagePart> = {}
  ): ToolCallMessagePart => ({
    args: {},
    argsText: "{}",
    toolCallId,
    toolName: "remove_set_from_workout_session",
    type: "tool-call",
    ...part,
  });

  const answer = (
    ...content: ThreadAssistantMessage["content"][number][]
  ): ThreadMessage => ({
    content,
    createdAt: new Date("2026-11-26T00:00:00Z"),
    id: `answer-${content.length}`,
    metadata: {
      custom: {},
      steps: [],
      unstable_annotations: [],
      unstable_data: [],
      unstable_state: null,
    },
    role: "assistant",
    status: { reason: "stop", type: "complete" },
  });

  it("names each edit Arnold made, by its tool, oldest first", () => {
    expect(
      arnoldEdits([
        answer(toolCall("a", { result: { set_id: "s", success: true } })),
        answer(
          { text: "Done", type: "text" },
          toolCall("b", {
            result: {
              exercise_slug: "squat",
              note: "Knees out",
              success: true,
            },
            toolName: "set_exercise_note",
          }),
          toolCall("c", {
            result: { note: "Felt heavy", success: true },
            toolName: "set_workout_session_set_note",
          })
        ),
      ])
    ).toEqual([
      { tool: "remove_set_from_workout_session", toolCallId: "a" },
      { tool: "set_exercise_note", toolCallId: "b" },
      { tool: "set_workout_session_set_note", toolCallId: "c" },
    ]);
  });

  it("leaves out what changed nothing, and a call still running", () => {
    expect(
      arnoldEdits([
        answer(
          toolCall("error", { result: { error: "Set not found" } }),
          toolCall("note-conflict", {
            result: { current_note: "Old", error: "The note changed" },
            toolName: "set_exercise_note",
          }),
          toolCall("set-note-failed", {
            isError: true,
            result: { error: "Broke" },
            toolName: "set_workout_session_set_note",
          }),
          toolCall("failed", { isError: true, result: { error: "Broke" } }),
          toolCall("running", {
            isPreliminary: true,
            result: { success: true },
          }),
          toolCall("pending"),
          toolCall("plan", {
            result: { success: true },
            toolName: "remove_set_from_exercise",
          })
        ),
      ])
    ).toEqual([]);
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

  /** A `delivery.consumed` echo of named files, with its text. */
  const received = (
    filenames: readonly string[],
    text: string,
    turnId = "turn_0"
  ): SessionStreamEvent => ({
    data: {
      deliveryId: `dlv_${turnId}`,
      // eve's echo carries a file's metadata only, never its bytes.
      parts: [
        ...(text ? [{ kind: "text" as const, text }] : []),
        ...filenames.map((filename) => ({
          filename,
          kind: "file" as const,
          mediaType: "image/jpeg",
          size: 1024,
        })),
      ],
      turnId,
    },
    meta: { at: "2026-11-04T00:00:00.000Z", position: { index: 1, line: 1 } },
    scope: { turnId },
    type: "delivery.consumed",
  });

  /** A device holding a copy of every name but `gone.jpg`. */
  const onDevice = (name: string) =>
    name && name !== "gone.jpg" ? `file:///copies/${name}` : undefined;

  it("reads the Attachments eve's own optimistic message stands for", () => {
    const text = "What is this machine?\n[file: a.jpg]\n[file: b.jpg]";

    expect(shownUserMessage(optimistic(text), text, [], onDevice)).toEqual({
      attachments: [
        { id: "0:a.jpg", name: "a.jpg", uri: "file:///copies/a.jpg" },
        { id: "1:b.jpg", name: "b.jpg", uri: "file:///copies/b.jpg" },
      ],
      text: "What is this machine?",
    });
  });

  it("reads a photo sent with no text as a message with no text", () => {
    expect(
      shownUserMessage(
        optimistic("[file: a.jpg]"),
        "[file: a.jpg]",
        [],
        onDevice
      )
    ).toEqual({
      attachments: [
        { id: "0:a.jpg", name: "a.jpg", uri: "file:///copies/a.jpg" },
      ],
      text: "",
    });
  });

  it("stands a nameless placeholder for an Attachment with no copy", () => {
    const text = "Look\n[file]";

    expect(shownUserMessage(optimistic(text), text, [], onDevice)).toEqual({
      attachments: [{ id: "0:", name: "" }],
      text: "Look",
    });
  });

  it("leaves off the copy this device hasn't got", () => {
    const text = "Look\n[file: gone.jpg]\n[file: b.jpg]";

    expect(shownUserMessage(optimistic(text), text, [], onDevice)).toEqual({
      attachments: [
        { id: "0:gone.jpg", name: "gone.jpg" },
        { id: "1:b.jpg", name: "b.jpg", uri: "file:///copies/b.jpg" },
      ],
      text: "Look",
    });
  });

  it("keeps a placeholder the User typed above their own text", () => {
    // eve writes its own after the text, so one in the middle is theirs.
    const text = "[file]\nis how you write it\n[file: a.jpg]";

    expect(shownUserMessage(optimistic(text), text, [], onDevice)).toEqual({
      attachments: [
        { id: "0:a.jpg", name: "a.jpg", uri: "file:///copies/a.jpg" },
      ],
      text: "[file]\nis how you write it",
    });
  });

  it("reads the files of the echo of its turn, in order", () => {
    const echo = echoed("What is this machine?");

    expect(
      shownUserMessage(
        echo,
        "What is this machine?",
        [received(["a.jpg", "b.jpg"], "What is this machine?")],
        onDevice
      )
    ).toEqual({
      attachments: [
        { id: "0:a.jpg", name: "a.jpg", uri: "file:///copies/a.jpg" },
        { id: "1:b.jpg", name: "b.jpg", uri: "file:///copies/b.jpg" },
      ],
      text: "What is this machine?",
    });
  });

  it("reads none for a message sent without Attachments", () => {
    const echo = echoed("How heavy should I squat?");

    expect(
      shownUserMessage(
        echo,
        "How heavy should I squat?",
        [received([], "How heavy should I squat?")],
        onDevice
      )
    ).toEqual({ attachments: [], text: "How heavy should I squat?" });
  });

  it("reads only its own turn's files", () => {
    const echo = echoed("Second", "turn_1");

    expect(
      shownUserMessage(
        echo,
        "Second",
        [
          received(["a.jpg", "b.jpg"], "First", "turn_0"),
          received(["c.jpg"], "Second", "turn_1"),
        ],
        onDevice
      )
    ).toEqual({
      attachments: [
        { id: "0:c.jpg", name: "c.jpg", uri: "file:///copies/c.jpg" },
      ],
      text: "Second",
    });
  });

  it("keeps text of the User's own that looks like a placeholder", () => {
    const echo = echoed("[file]");

    expect(
      shownUserMessage(echo, "[file]", [received([], "[file]")], onDevice)
    ).toEqual({ attachments: [], text: "[file]" });
  });

  it("reads none for an echo the saved events don't reach", () => {
    expect(shownUserMessage(echoed("Older"), "Older", [], onDevice)).toEqual({
      attachments: [],
      text: "Older",
    });
  });
});
