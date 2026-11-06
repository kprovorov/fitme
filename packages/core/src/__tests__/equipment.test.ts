import { describe, expect, it } from "vitest";

import { equipment, isEquipment } from "../models";
import type { Equipment } from "../models";
import { equipmentToName } from "../utils";

describe("equipment catalog", () => {
  it("lists every Equipment in order", () => {
    expect(equipment).toStrictEqual([
      "barbell",
      "dumbbell",
      "cable",
      "machine",
      "smith_machine",
      "bench",
      "pull_up_bar",
      "landmine",
      "bodyweight",
    ]);
  });
});

describe("equipment validation", () => {
  it.each(equipment)("accepts %s", (value) => {
    expect(isEquipment(value)).toBeTruthy();
  });

  it.each([
    "kettlebell",
    "resistance_band",
    "Barbell",
    "pull-up-bar",
    "",
    " barbell",
    undefined,
    null,
    0,
    ["barbell"],
  ])("refuses %o", (value) => {
    expect(isEquipment(value)).toBeFalsy();
  });
});

describe("equipment display names", () => {
  const names: Record<Equipment, string> = {
    barbell: "Barbell",
    bench: "Bench",
    bodyweight: "Bodyweight",
    cable: "Cable",
    dumbbell: "Dumbbell",
    landmine: "Landmine",
    machine: "Machine",
    pull_up_bar: "Pull-up bar",
    smith_machine: "Smith machine",
  };

  it.each(equipment)("names %s", (value) => {
    expect(equipmentToName(value)).toBe(names[value]);
  });
});
