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
      "remove_set_from_workout_session",
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

    for (const name of [
      "delete_workout_session",
      "remove_set_from_workout_session",
    ]) {
      expect(hints.get(name)).toMatchObject({
        destructiveHint: true,
        idempotentHint: false,
      });
    }

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

    expect(group.json).toStrictEqual({ id: "lower-back", name: "Lower back" });
  });

  it("describes a new muscle group and refuses a legacy one", async () => {
    const client = await connect();

    const adductors = await call(client, "describe_muscle_group", {
      muscleGroup: "adductors",
    });

    expect(adductors.json).toStrictEqual({
      id: "adductors",
      name: "Adductors",
    });

    const abs = await call(client, "describe_muscle_group", {
      muscleGroup: "abs",
    });

    expect(abs.isError).toBeTruthy();
  });

  it("lists every muscle group in core's order with its English name", async () => {
    const client = await connect();

    const result = await call(client, "list_muscle_groups");

    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual([
      { id: "chest", name: "Chest" },
      { id: "back", name: "Back" },
      { id: "shoulders", name: "Shoulders" },
      { id: "biceps", name: "Biceps" },
      { id: "triceps", name: "Triceps" },
      { id: "forearms", name: "Forearms" },
      { id: "core", name: "Core" },
      { id: "traps", name: "Traps" },
      { id: "lower-back", name: "Lower back" },
      { id: "glutes", name: "Glutes" },
      { id: "quadriceps", name: "Quadriceps" },
      { id: "hamstrings", name: "Hamstrings" },
      { id: "adductors", name: "Adductors" },
      { id: "calves", name: "Calves" },
      { id: "tibialis", name: "Tibialis" },
      { id: "neck", name: "Neck" },
    ]);
  });

  it("lists every Equipment in core's order with its English name", async () => {
    const client = await connect();

    const result = await call(client, "list_equipment");

    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual([
      { id: "bodyweight", name: "Bodyweight" },
      { id: "dumbbell", name: "Dumbbell" },
      { id: "barbell", name: "Barbell" },
      { id: "machine", name: "Machine" },
      { id: "cable", name: "Cable" },
      { id: "kettlebell", name: "Kettlebell" },
      { id: "band", name: "Band" },
      { id: "bench", name: "Bench" },
      { id: "pull_up_bar", name: "Pull-up bar" },
      { id: "parallel_bars", name: "Parallel bars" },
      { id: "bicycle", name: "Bicycle" },
      { id: "weight_plate", name: "Weight plate" },
      { id: "box", name: "Box" },
      { id: "stability_ball", name: "Stability ball" },
      { id: "backpack", name: "Backpack" },
      { id: "medicine_ball", name: "Medicine ball" },
      { id: "sled", name: "Sled" },
      { id: "towel", name: "Towel" },
      { id: "trx", name: "TRX" },
      { id: "battle_ropes", name: "Battle ropes" },
      { id: "dowel", name: "Dowel" },
      { id: "slider", name: "Slider" },
      { id: "foam_roller", name: "Foam roller" },
      { id: "wrist_roller", name: "Wrist roller" },
    ]);
  });
});
