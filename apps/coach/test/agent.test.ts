import { describe, expect, it } from "vitest";
import agent from "../agent/agent";

describe("agent", () => {
  it("keeps an ended run's data for the World's default period", () => {
    // eve 0.80+ otherwise deletes a private session's run data when its run
    // ends, and account deletion relies on a reset session's stream outliving
    // the reset.
    expect(agent.experimental?.workflow?.retention).toBe("default");
  });
});
