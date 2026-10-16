import { describe, expect, it } from "vitest";
import agent from "../agent/agent";

describe("agent", () => {
  it("keeps an ended run's data for the plan's default period", () => {
    // Why: see the comment on `experimental` in agent/agent.ts.
    expect(agent.experimental?.workflow?.retention).toBe("default");
  });
});
