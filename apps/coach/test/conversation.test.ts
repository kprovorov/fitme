import { describe, expect, it, vi } from "vitest";
import { admitTurn } from "../agent/lib/conversation";
import { conversationOwner, ownerOfTurn } from "../agent/lib/owner";

const clerkUser = (principalId: string) => ({
  attributes: {},
  authenticator: "clerk",
  principalId,
  principalType: "user",
});

const alice = clerkUser("user_alice");
const mallory = clerkUser("user_mallory");

describe("conversation owner", () => {
  it("is the Clerk User who started the session", () => {
    expect(conversationOwner({ current: mallory, initiator: alice })).toBe(
      "user_alice"
    );
    expect(conversationOwner({ current: null, initiator: null })).toBeNull();
    expect(
      conversationOwner({
        current: null,
        initiator: { ...alice, authenticator: "local-dev" },
      })
    ).toBeNull();
  });

  it("only owns turns the owner sends", () => {
    expect(ownerOfTurn({ current: alice, initiator: alice })).toBe(
      "user_alice"
    );
    expect(ownerOfTurn({ current: mallory, initiator: alice })).toBeNull();
    expect(ownerOfTurn({ current: null, initiator: alice })).toBeNull();
  });
});

describe("admitTurn", () => {
  const deps = (owner: string | null = "user_alice") => ({
    claim: vi.fn().mockResolvedValue(owner),
    isEvalRun: () => false,
    report: vi.fn().mockResolvedValue(undefined),
  });

  it("records the session for its owner and lets the turn run", async () => {
    const { claim, isEvalRun, report } = deps();

    expect(
      await admitTurn(
        { auth: { current: alice, initiator: alice }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).toBe(true);
    expect(claim).toHaveBeenCalledWith("wrun_1", "user_alice");
    expect(report).not.toHaveBeenCalled();
  });

  it("refuses a turn someone else sends to the owner's session", async () => {
    const { claim, isEvalRun, report } = deps();

    expect(
      await admitTurn(
        { auth: { current: mallory, initiator: alice }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).toBe(false);
    expect(claim).not.toHaveBeenCalled();
  });

  it("refuses the turn when the session is recorded for someone else", async () => {
    const { claim, isEvalRun, report } = deps("user_mallory");

    expect(
      await admitTurn(
        { auth: { current: alice, initiator: alice }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).toBe(false);
    expect(report).toHaveBeenCalledWith(expect.any(Error), {
      sessionId: "wrun_1",
    });
  });

  it("refuses the turn and reports when the session can't be recorded", async () => {
    const { claim, isEvalRun, report } = deps();
    const failure = new Error("pooler down");
    claim.mockRejectedValue(failure);

    expect(
      await admitTurn(
        { auth: { current: alice, initiator: alice }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).toBe(false);
    expect(report).toHaveBeenCalledWith(failure, { sessionId: "wrun_1" });
  });
});
