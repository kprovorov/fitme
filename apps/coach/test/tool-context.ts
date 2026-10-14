import type { ToolContext } from "eve/tools";

const clerkUser = (principalId: string) => ({
  attributes: {},
  authenticator: "clerk",
  principalId,
  principalType: "user",
});

/** A tool context whose session was started by `owner`. */
export const contextFor = (owner: string | null): ToolContext =>
  ({
    session: {
      auth: {
        current: owner ? clerkUser(owner) : null,
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
