import { describe, expect, it } from "vitest";
import { call, connect } from "./harness.js";

describe("tool registry", () => {
  it("lists every tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "activate_plan",
      "create_plan",
      "delete_plan",
      "delete_workout_session",
      "describe_muscle_group",
      "finish_workout_session",
      "get_exercise",
      "get_exercise_history",
      "get_plan",
      "get_profile",
      "get_workout_session",
      "list_exercises",
      "list_muscle_groups",
      "list_plan_options",
      "list_plans",
      "list_workout_sessions",
      "log_set",
      "ping",
      "start_workout_session",
      "update_plan",
    ]);
  });

  it("annotates reads, deletions and idempotency honestly", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const hints = new Map(tools.map((tool) => [tool.name, tool.annotations]));

    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject({
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
        readOnlyHint: expect.any(Boolean),
      });
      if (tool.annotations?.readOnlyHint) {
        expect(tool.annotations.destructiveHint, tool.name).toBe(false);
      }
    }

    expect(hints.get("get_plan")?.readOnlyHint).toBe(true);
    expect(hints.get("log_set")).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(hints.get("delete_plan")).toMatchObject({
      destructiveHint: true,
      idempotentHint: true,
    });
    expect(hints.get("delete_workout_session")).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(hints.get("start_workout_session")?.idempotentHint).toBe(false);
  });
});

describe("catalog tools", () => {
  it("need no database", async () => {
    const client = await connect();

    const ping = await call(client, "ping");
    expect(ping.isError).toBe(false);
    expect(ping.json).toMatchObject({ ok: true, version: "0.2.0" });

    const group = await call(client, "describe_muscle_group", {
      muscleGroup: "lower-back",
    });
    expect(group.json).toEqual({ id: "lower-back", name: "Lower Back" });
  });
});
