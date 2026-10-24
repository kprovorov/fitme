import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fetchPlanChanges,
  useApplyPlanChangesMutation,
} from "../workout-sessions";

const mockRpc =
  jest.fn<
    (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>
  >();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}));

const answer = {
  changes: [
    { exercise: { name: "Dips", slug: "dips" }, kind: "remove_exercise" },
  ],
  plan: { id: "plan-1", name: "PPL" },
  workout: { id: "workout-1", name: "Push Day" },
};

const applyPlanChanges = (sessionId: string) =>
  useApplyPlanChangesMutation.mutationFn({ sessionId });

describe("workout_session_plan_changes", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("previews without applying", async () => {
    mockRpc.mockResolvedValue({ data: answer, error: null });

    await expect(fetchPlanChanges("session-1")).resolves.toEqual(answer);
    expect(mockRpc).toHaveBeenCalledWith("workout_session_plan_changes", {
      apply: false,
      session_id: "session-1",
    });
  });

  it("applies through the mutation", async () => {
    mockRpc.mockResolvedValue({ data: answer, error: null });

    await expect(applyPlanChanges("session-1")).resolves.toEqual(answer);
    expect(mockRpc).toHaveBeenCalledWith("workout_session_plan_changes", {
      apply: true,
      session_id: "session-1",
    });
  });

  it("throws the RPC's error", async () => {
    const error = { message: "Session not found or not authorized" };
    mockRpc.mockResolvedValue({ data: null, error });

    await expect(fetchPlanChanges("session-1")).rejects.toBe(error);
  });
});
