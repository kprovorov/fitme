import { describe, expect, it, vi } from "vitest";
import { admitTurn } from "../agent/lib/conversation";
import { conversationOwner, isOwnerTurn } from "../agent/lib/owner";

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
    expect(isOwnerTurn({ current: alice, initiator: alice })).toBe(true);
    expect(isOwnerTurn({ current: mallory, initiator: alice })).toBe(false);
    expect(isOwnerTurn({ current: null, initiator: alice })).toBe(false);
  });
});

describe("admitTurn", () => {
  const deps = () => ({
    record: vi.fn().mockResolvedValue(undefined),
    report: vi.fn().mockResolvedValue(undefined),
  });

  it("records the session for its owner and lets the turn run", async () => {
    const { record, report } = deps();

    expect(
      await admitTurn(
        { auth: { current: alice, initiator: alice }, sessionId: "wrun_1" },
        { record, report }
      )
    ).toBe(true);
    expect(record).toHaveBeenCalledWith("user_alice", "wrun_1");
    expect(report).not.toHaveBeenCalled();
  });

  it("refuses a turn someone else sends to the owner's session", async () => {
    const { record, report } = deps();

    expect(
      await admitTurn(
        { auth: { current: mallory, initiator: alice }, sessionId: "wrun_1" },
        { record, report }
      )
    ).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses the turn and reports when the session can't be recorded", async () => {
    const { record, report } = deps();
    const failure = new Error("pooler down");
    record.mockRejectedValue(failure);

    expect(
      await admitTurn(
        { auth: { current: alice, initiator: alice }, sessionId: "wrun_1" },
        { record, report }
      )
    ).toBe(false);
    expect(report).toHaveBeenCalledWith(failure, { sessionId: "wrun_1" });
  });
});
