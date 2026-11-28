/**
 * The fake Arnold's held tool call and its cancel through the real chat
 * runtime (`@assistant-ui/eve` over eve's client), as the Arnold screen runs
 * it: while the call waits the thread is running and shows the call with no
 * result, a release brings the answer, and a cancel stops the run, keeping
 * the narration already streamed. The seam Stop and the status line are
 * tested on. Then a call held for approval: shown waiting with its input,
 * and each way it ends (Approve, Deny, a message, a reopened screen).
 */
import { useEveAgentRuntime } from "@assistant-ui/eve";
import {
  AssistantRuntimeProvider,
  MessageByIndexProvider,
  PartByIndexProvider,
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

const PROPOSAL = {
  input: { plan_name: "Push A" },
  name: "propose_plan",
  output: { saved: true },
};

const WAITING = 'tool propose_plan: waiting {"plan_name":"Push A"}';

/** One message part as the probe shows it. */
const partLabel = (
  role: ThreadMessage["role"],
  part: ThreadMessage["content"][number]
) => {
  if (part.type === "text") {
    return `${role}: ${part.text}`;
  }

  if (part.type === "tool-call" && part.result !== undefined) {
    return `tool ${part.toolName}: ${JSON.stringify(part.result)}`;
  }

  if (part.type === "tool-call" && part.approval !== undefined) {
    return `tool ${part.toolName}: waiting ${JSON.stringify(part.args)}`;
  }

  if (part.type === "tool-call") {
    return `tool ${part.toolName}: running`;
  }

  return `${role}: ${part.type}`;
};

/** Approve and Deny for a part waiting on its approval, as a card offers. */
const ApprovalButtons = () => {
  const aui = useAui();
  const part = useAuiState((s) => s.part);

  if (
    part.type !== "tool-call" ||
    part.approval === undefined ||
    part.approval.approved !== undefined ||
    part.approval.resolution !== undefined ||
    part.result !== undefined
  ) {
    return null;
  }

  return (
    <>
      <Pressable
        onPress={() => aui.part().respondToToolApproval({ approved: true })}
      >
        <Text>Approve</Text>
      </Pressable>
      <Pressable
        onPress={() => aui.part().respondToToolApproval({ approved: false })}
      >
        <Text>Deny</Text>
      </Pressable>
    </>
  );
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
      {messages.map((shown, messageIndex) => (
        <MessageByIndexProvider index={messageIndex} key={shown.id}>
          {shown.content.map((part, index) => (
            <PartByIndexProvider
              index={index}
              key={`${shown.id}-${String(index)}`}
            >
              <Text>{partLabel(shown.role, part)}</Text>
              <ApprovalButtons />
            </PartByIndexProvider>
          ))}
        </MessageByIndexProvider>
      ))}
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

const Runtime = ({
  message,
  sessionId,
}: {
  message: string;
  /** A saved session to open, as a reopened screen does; none starts one. */
  sessionId?: string;
}) => {
  const runtime = useEveAgentRuntime({
    auth: { bearer: () => Promise.resolve("token") },
    baseUrl: fakeArnold.baseUrl,
    initialSession:
      sessionId === undefined ? undefined : { sessionId, streamIndex: 0 },
    resume: sessionId !== undefined,
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

describe("fake Arnold's approval through the chat runtime", () => {
  it("shows the waiting call with its input, then runs it on Approve", async () => {
    fakeArnold.holdNextToolCallForApproval(PROPOSAL);
    const user = userEvent.setup();

    await render(<Runtime message="Save Push A" />);
    await user.press(screen.getByText("Send"));

    await expect(screen.findByText(WAITING)).resolves.toBeOnTheScreen();

    await user.press(screen.getByText("Approve"));

    await expect(
      screen.findByText('tool propose_plan: {"saved":true}')
    ).resolves.toBeOnTheScreen();
    await expect(
      screen.findByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).resolves.toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText("idle")).toBeOnTheScreen());
    expect(fakeArnold.responses.map((response) => response.answers)).toEqual([
      [{ interactionId: expect.any(String), optionId: "approve" }],
    ]);
  });

  it("shows an approved call failing with the test's error", async () => {
    fakeArnold.holdNextToolCallForApproval({
      error: "The Plan changed",
      input: PROPOSAL.input,
      name: PROPOSAL.name,
    });
    const user = userEvent.setup();

    await render(<Runtime message="Save Push A" />);
    await user.press(screen.getByText("Send"));
    await screen.findByText(WAITING);
    await user.press(screen.getByText("Approve"));

    await expect(
      screen.findByText(/^tool propose_plan: .*The Plan changed/u)
    ).resolves.toBeOnTheScreen();
    await expect(
      screen.findByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).resolves.toBeOnTheScreen();
  });

  it("never runs the call on Deny, and goes on to the answer", async () => {
    fakeArnold.holdNextToolCallForApproval(PROPOSAL);
    const user = userEvent.setup();

    await render(<Runtime message="Save Push A" />);
    await user.press(screen.getByText("Send"));
    await screen.findByText(WAITING);
    await user.press(screen.getByText("Deny"));

    await expect(
      screen.findByText(/^tool propose_plan: .*Tool execution was denied/u)
    ).resolves.toBeOnTheScreen();
    await expect(
      screen.findByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).resolves.toBeOnTheScreen();
    expect(fakeArnold.responses.map((response) => response.answers)).toEqual([
      [{ interactionId: expect.any(String), optionId: "deny" }],
    ]);
  });

  it("withdraws the waiting call when a message is sent, and answers it", async () => {
    fakeArnold.holdNextToolCallForApproval(PROPOSAL);
    const user = userEvent.setup();

    await render(<Runtime message="Save Push A" />);
    await user.press(screen.getByText("Send"));
    await screen.findByText(WAITING);
    await user.press(screen.getByText("Send"));

    await expect(
      screen.findByText(/^tool propose_plan: .*Ignored because the user/u)
    ).resolves.toBeOnTheScreen();
    await expect(
      screen.findByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).resolves.toBeOnTheScreen();
    expect(screen.queryByText("Approve")).not.toBeOnTheScreen();
    expect(fakeArnold.responses).toEqual([]);
  });

  it("still shows the call waiting on a reopened screen, which approves it", async () => {
    fakeArnold.holdNextToolCallForApproval(PROPOSAL);
    const user = userEvent.setup();

    const first = await render(<Runtime message="Save Push A" />);
    await user.press(screen.getByText("Send"));
    await screen.findByText(WAITING);
    await first.unmount();

    const [sessionId] = fakeArnold.sessionIds;

    await render(<Runtime message="Save Push A" sessionId={sessionId} />);

    await expect(screen.findByText(WAITING)).resolves.toBeOnTheScreen();

    await user.press(screen.getByText("Approve"));

    await expect(
      screen.findByText('tool propose_plan: {"saved":true}')
    ).resolves.toBeOnTheScreen();
    await expect(
      screen.findByText(`assistant: ${FAKE_ARNOLD_REPLY}`)
    ).resolves.toBeOnTheScreen();
  });
});
