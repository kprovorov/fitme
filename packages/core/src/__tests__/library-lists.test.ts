import { describe, expect, it } from "vitest";

import {
  difficulties,
  equipment,
  movementPatterns,
  muscleGroups,
} from "../models";
import {
  difficultyToName,
  equipmentToName,
  movementPatternToName,
  muscleGroupToName,
} from "../utils";

describe("Library Muscle groups", () => {
  it("lists every Muscle group in order", () => {
    expect(muscleGroups).toStrictEqual([
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "forearms",
      "core",
      "traps",
      "lower-back",
      "glutes",
      "quadriceps",
      "hamstrings",
      "adductors",
      "calves",
      "tibialis",
      "neck",
    ]);
  });

  it.each(muscleGroups)("names %s", (value) => {
    expect(muscleGroupToName(value)).toMatch(/^[A-Z]/u);
  });

  it("names lower-back in words", () => {
    expect(muscleGroupToName("lower-back")).toBe("Lower back");
  });
});

describe("Library Equipment", () => {
  it("lists every Equipment in order", () => {
    expect(equipment).toStrictEqual([
      "bodyweight",
      "dumbbell",
      "barbell",
      "machine",
      "cable",
      "kettlebell",
      "band",
      "bench",
      "pull_up_bar",
      "parallel_bars",
      "bicycle",
      "weight_plate",
      "box",
      "stability_ball",
      "backpack",
      "medicine_ball",
      "sled",
      "towel",
      "trx",
      "battle_ropes",
      "dowel",
      "slider",
      "foam_roller",
      "wrist_roller",
    ]);
  });

  it.each(equipment)("names %s", (value) => {
    expect(equipmentToName(value)).toMatch(/^[A-Z]/u);
  });

  it.each([
    ["pull_up_bar", "Pull-up bar"],
    ["trx", "TRX"],
    ["wrist_roller", "Wrist roller"],
  ] as const)("names %s as %s", (value, name) => {
    expect(equipmentToName(value)).toBe(name);
  });
});

describe("Library movement patterns", () => {
  it("lists every movement pattern in order", () => {
    expect(movementPatterns).toStrictEqual([
      "isolation",
      "push",
      "pull",
      "hinge",
      "squat",
      "mobility",
      "cardio",
      "core",
      "lunge",
      "plyometric",
      "rotation",
      "stretch",
      "hip_abduction",
      "carry",
    ]);
  });

  it.each(movementPatterns)("names %s", (value) => {
    expect(movementPatternToName(value)).toMatch(/^[A-Z]/u);
  });

  it("names hip_abduction in words", () => {
    expect(movementPatternToName("hip_abduction")).toBe("Hip abduction");
  });
});

describe("Library Difficulties", () => {
  it("lists every Difficulty in order", () => {
    expect(difficulties).toStrictEqual([
      "beginner",
      "intermediate",
      "advanced",
    ]);
  });

  it.each([
    ["beginner", "Beginner"],
    ["intermediate", "Intermediate"],
    ["advanced", "Advanced"],
  ] as const)("names %s as %s", (value, name) => {
    expect(difficultyToName(value)).toBe(name);
  });
});
