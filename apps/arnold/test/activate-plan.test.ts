import type { PlanSummary } from "@fitme/services/plans";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";

type ActivatedPlan = Pick<PlanSummary, "id" | "is_active"> | null;

const db = vi.hoisted(() => ({
  asUser:
    vi.fn<
      (
        userId: string,
        fn: (transaction: typeof tx) => Promise<ActivatedPlan>
      ) => Promise<ActivatedPlan>
    >(),
}));

const services = vi.hoisted(() => ({
  activatePlan:
    vi.fn<
      (
        transaction: typeof tx,
        userId: string,
        planId: string
      ) => Promise<ActivatedPlan>
    >(),
}));

vi.mock<object>(import("@fitme/db"), () => db);

vi.mock<object>(import("@fitme/services/plans"), () => services);

const { default: activatePlan } = await import("../agent/tools/activate_plan");

const tx = { fake: "transaction" };
const planId = "f2a00000-0000-4000-8000-000000000001";

describe("activate_plan", () => {
  beforeEach(() => {
    db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
    services.activatePlan.mockResolvedValue({ id: planId, is_active: true });
  });

  it("activates the Plan as the session's User", async () => {
    const result = await activatePlan.execute(
      { plan_id: planId },
      contextFor("user_alice")
    );

    expect(result).toStrictEqual({ plan_id: planId, success: true });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(services.activatePlan).toHaveBeenCalledWith(
      tx,
      "user_alice",
      planId
    );
  });

  it("ignores any User id in its input", async () => {
    const input = inputSchemaOf(activatePlan).parse({
      ...userIdFields,
      plan_id: planId,
    });

    await activatePlan.execute(input, contextFor("user_alice"));

    expect(input).toStrictEqual({ plan_id: planId });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(
      JSON.stringify([db.asUser.mock.calls, services.activatePlan.mock.calls])
    ).not.toContain("user_mallory");
  });

  it("rejects a plan_id that isn't a Plan id", () => {
    expect(
      inputSchemaOf(activatePlan).safeParse({ plan_id: "latest" }).success
    ).toBeFalsy();
  });

  it("tells the model when the User has no such Plan", async () => {
    services.activatePlan.mockResolvedValue(null);

    await expect(
      activatePlan.execute({ plan_id: planId }, contextFor("user_alice"))
    ).resolves.toStrictEqual({ error: "Plan not found" });
  });

  it("acts as the session's owner, never the turn's caller", async () => {
    await activatePlan.execute(
      { plan_id: planId },
      contextFor("user_alice", "user_mallory")
    );

    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(
      JSON.stringify([db.asUser.mock.calls, services.activatePlan.mock.calls])
    ).not.toContain("user_mallory");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      activatePlan.execute({ plan_id: planId }, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
