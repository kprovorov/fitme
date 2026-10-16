import type { ToolContext } from "eve/tools";
import type { ZodType } from "zod";

const clerkUser = (principalId: string) => ({
  attributes: {},
  authenticator: "clerk",
  principalId,
  principalType: "user",
});

/**
 * A tool context whose session was started by `owner`, in a turn sent by
 * `caller` (the owner unless given), on the turn's first step.
 */
export const contextFor = (
  owner: string | null,
  caller: string | null = owner
): ToolContext =>
  ({
    callId: "call_1",
    messages: [{ content: "Hi coach", role: "user" }],
    session: {
      auth: {
        current: caller ? clerkUser(caller) : null,
        initiator: owner ? clerkUser(owner) : null,
      },
      id: "wrun_test",
      turn: { id: "turn_1", sequence: 1 },
    },
  }) as unknown as ToolContext;

/** Fields a model might slip in to act as another User. */
export const userIdFields = {
  user: "user_mallory",
  user_id: "user_mallory",
  userId: "user_mallory",
};

/**
 * A tool's zod input schema, typed with the input its `execute` takes, to
 * parse a model's input the way eve does before calling `execute`.
 */
export const inputSchemaOf = <Input>(tool: {
  execute: (input: Input, ctx: ToolContext) => unknown;
  inputSchema: unknown;
}) => tool.inputSchema as ZodType<Input>;
