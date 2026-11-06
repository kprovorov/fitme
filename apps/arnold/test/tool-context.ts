import type { ToolContext } from "eve/tools";
import { ZodType } from "zod";

const clerkUser = (principalId: string) => ({
  attributes: {},
  authenticator: "clerk",
  principalId,
  principalType: "user",
});

const unavailableInTest = (): never => {
  throw new Error("This tool context has no runtime services");
};

/**
 * A tool context whose session was started by `owner`, in a turn sent by
 * `caller` (the owner unless given), on the turn's first step.
 */
export const contextFor = (
  owner: string | null,
  caller: string | null = owner
): ToolContext => ({
  abortSignal: new AbortController().signal,
  callId: "call_1",
  getSandbox: unavailableInTest,
  getToken: unavailableInTest,
  messages: [{ content: "Hi Arnold", role: "user" }],
  requireAuth: unavailableInTest,
  session: {
    auth: {
      current: caller !== null && caller !== "" ? clerkUser(caller) : null,
      initiator: owner !== null && owner !== "" ? clerkUser(owner) : null,
    },
    id: "wrun_test",
    turn: { id: "turn_1", sequence: 1 },
  },
  toolName: "test_tool",
});

interface ClientContext {
  language: string;
}

/**
 * `ctx` in a turn whose client sent `clientContext`: eve puts it in the
 * step's model input as a user-role `context.instruction` message, holding
 * "Client context:" and the object as JSON, before the User's message.
 */
export const withClientContext = (
  ctx: ToolContext,
  clientContext: ClientContext
): ToolContext => {
  const message: ToolContext["messages"][number] & { kind: string } = {
    content: `Client context:\n${JSON.stringify(clientContext)}`,
    kind: "context.instruction",
    role: "user",
  };

  return {
    ...ctx,
    messages: [message, ...ctx.messages],
  };
};

/** Fields a model might slip in to act as another User. */
export const userIdFields = {
  user: "user_mallory",
  user_id: "user_mallory",
  userId: "user_mallory",
};

/** A tool as the tests see it: `execute` and its zod input schema. */
export interface TestedTool<Input, Output = unknown> {
  execute: (input: Input, ctx: ToolContext) => Output;
  inputSchema: unknown;
}

// defineTool ties the schema's output to execute's input, but erases its Zod type.
const hasZodInputSchema = <Input>(
  tool: TestedTool<Input>
): tool is TestedTool<Input> & { inputSchema: ZodType<Input> } =>
  tool.inputSchema instanceof ZodType;

/**
 * A tool's zod input schema, typed with the input its `execute` takes, to
 * parse a model's input the way eve does before calling `execute`.
 */
export const inputSchemaOf = <Input>(tool: TestedTool<Input>) => {
  if (!hasZodInputSchema(tool)) {
    throw new Error("Expected a Zod tool input schema");
  }

  return tool.inputSchema;
};
