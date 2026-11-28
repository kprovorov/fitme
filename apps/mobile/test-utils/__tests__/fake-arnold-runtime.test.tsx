/**
 * The fake Arnold's held tool call and its cancel through the real chat
 * runtime (`@assistant-ui/eve` over eve's client), as the Arnold screen runs
 * it: while the call waits the thread is running and shows the call with no
 * result, a release brings the answer, and a cancel stops the run, keeping
 * the narration already streamed. The seam Stop and the status line are
 * tested on.
 */
import { useEveAgentRuntime } from "@assistant-ui/eve";
import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
} from "@assistant-ui/react-native";
import type { ThreadMessage } from "@assistant-ui/react-native";
import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";

const NARRATION = "Reading your plan.";

/** One message part as the probe shows it. */
const partLabel = (
  role: ThreadMessage["role"],
  part: ThreadMessage["content"][number]
) => {
  if (part.type === "text") {
    return `${role}: ${part.text}`;
  }

  if (part.type === "tool-call") {
    return `tool ${part.toolName}: ${
      part.result === undefined ? "running" : JSON.stringify(part.result)
    }`;
  }

  return `${role}: ${part.type}`;
};

/**
 * The thread as the screen's components read it: whether it runs and every
 * message part, with a Send and a Stop the test presses.
 */
const Probe = ({ message }: { message: string }) => {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messages = useAuiState((s) => s.thread.messages);

  return (
    <>
      <Text>{isRunning ? "running" : "idle"}</Text>
      {messages.flatMap((shown) =>
        shown.content.map((part, index) => (
          <Text key={`${shown.id}-${String(index)}`}>
            {partLabel(shown.role, part)}
          </Text>
        ))
      )}
      <Pressable
        onPress={() =>
          aui.thread.append({
            content: [{ text: message, type: "text" }],
            role: "user",
          })
        }
      >
        <Text>Send</Text>
      </Pressable>
      <Pressable onPress={() => aui.thread.cancelRun()}>
        <Text>Stop</Text>
      </Pressable>
    </>
  );
};

const Runtime = ({ message }: { message: string }) => {
  const runtime = useEveAgentRuntime({
    auth: { bearer: () => Promise.resolve("token") },
    baseUrl: fakeArnold.baseUrl,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Probe message={message} />
    </AssistantRuntimeProvider>
  );
};

/** Lets the fake write whatever it would, a few macrotasks on. */
const drain = async () => {
  for (let tick = 0; tick < 10; tick += 1) {
    const { promise, resolve } = Promise.withResolvers<undefined>();
    setTimeout(resolve, 0);
    // oxlint-disable-next-line no-await-in-loop -- one macrotask at a time
    await promise;
  }
};

beforeEach(() => {
  fakeArnold.install();
});

describe("fake Arnold through the chat runtime", () => {
  it("shows the held call running, then the answer once released", async () => {
    const release = fakeArnold.holdNextToolCall(
      { name: "get_active_plan", output: { success: true } },
      { narration: NARRATION }
    );

    const user = userEvent.setup();

    await render(<Runtime message="Show my plan" />);
    await user.press(screen.getByText("Send"));

    await expect(
      screen.findByText("tool get_active_plan: running")
    ).resolves.toBeOnTheScreen();
    expect(screen.getByText("running")).toBeOnTheScreen();
    expect(screen.getByText(`assistant: ${NARRATION}`)).toBeOnTheScreen();

    await act(async () => {
      release();
      await drain();
    });

    await waitFor(() => expect(screen.getByText("idle")).toBeOnTheScreen());
    expect(
      screen.getByText('tool get_active_plan: {"success":true}')
    ).toBeOnTheScreen();
    expect(
      screen.getByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).toBeOnTheScreen();
  });

  it("stops the run on a cancel and keeps the streamed text", async () => {
    const release = fakeArnold.holdNextToolCall(
      { name: "get_active_plan", output: { success: true } },
      { narration: NARRATION }
    );

    const user = userEvent.setup();

    await render(<Runtime message="Show my plan" />);
    await user.press(screen.getByText("Send"));
    await screen.findByText("tool get_active_plan: running");

    await user.press(screen.getByText("Stop"));

    await waitFor(() => expect(screen.getByText("idle")).toBeOnTheScreen());
    expect(screen.getByText(`assistant: ${NARRATION}`)).toBeOnTheScreen();

    // Nothing more arrives for the cancelled turn.
    await act(async () => {
      release();
      await drain();
    });

    expect(screen.getByText("idle")).toBeOnTheScreen();
    expect(
      screen.queryByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).not.toBeOnTheScreen();
  });

  it("answers the next message after a cancelled turn", async () => {
    fakeArnold.holdNextToolCall({ name: "get_plans", output: [] });
    const user = userEvent.setup();

    await render(<Runtime message="Show my plans" />);
    await user.press(screen.getByText("Send"));
    await screen.findByText("tool get_plans: running");
    await user.press(screen.getByText("Stop"));
    await waitFor(() => expect(screen.getByText("idle")).toBeOnTheScreen());

    await user.press(screen.getByText("Send"));

    await expect(
      screen.findByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).resolves.toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText("idle")).toBeOnTheScreen());
  });
});
