import { describe, expect, it } from "vitest";

import { call, connect } from "./harness.js";

const EXERCISE_ID = /exercise_?id/iu;

describe("tool registry", () => {
  it("lists every tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toStrictEqual([
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
      "list_equipment",
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

  it("takes and describes Exercises by slug, never by exercise_id", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const listed = JSON.stringify(tools);

    expect(listed).not.toMatch(EXERCISE_ID);
    expect(listed).toContain("exercise_slug");
  });

  it("annotates reads, deletions and idempotency honestly", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const hints = new Map(tools.map((tool) => [tool.name, tool.annotations]));

    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
        readOnlyHint: expect.any(Boolean),
      });
    }

    for (const readOnlyTool of tools.filter(
      (tool) => tool.annotations?.readOnlyHint
    )) {
      expect(readOnlyTool.annotations?.destructiveHint).toBeFalsy();
    }

    expect(hints.get("get_plan")?.readOnlyHint).toBeTruthy();
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
    expect(hints.get("start_workout_session")?.idempotentHint).toBeFalsy();
  });
});

describe("catalog tools", () => {
  it("need no database", async () => {
    const client = await connect();

    const ping = await call(client, "ping");
    expect(ping.isError).toBeFalsy();
    expect(ping.json).toMatchObject({ ok: true, version: "0.2.0" });

    const group = await call(client, "describe_muscle_group", {
      muscleGroup: "lower-back",
    });

    expect(group.json).toStrictEqual({ id: "lower-back", name: "Lower Back" });
  });

  it("lists every Equipment in core's order with its English name", async () => {
    const client = await connect();

    const result = await call(client, "list_equipment");

    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual([
      { id: "barbell", name: "Barbell" },
      { id: "dumbbell", name: "Dumbbell" },
      { id: "cable", name: "Cable" },
      { id: "machine", name: "Machine" },
      { id: "smith_machine", name: "Smith machine" },
      { id: "bench", name: "Bench" },
      { id: "pull_up_bar", name: "Pull-up bar" },
      { id: "landmine", name: "Landmine" },
      { id: "bodyweight", name: "Bodyweight" },
    ]);
  });
});
