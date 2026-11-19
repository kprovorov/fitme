import { describe, expect, it } from "vitest";

import { legacyEquipment, isLegacyEquipment } from "../models";
import type { LegacyEquipment } from "../models";
import { legacyEquipmentToName } from "../utils";

describe("equipment catalog", () => {
  it("lists every Equipment in order", () => {
    expect(legacyEquipment).toStrictEqual([
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
  it.each(legacyEquipment)("accepts %s", (value) => {
    expect(isLegacyEquipment(value)).toBeTruthy();
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
    expect(isLegacyEquipment(value)).toBeFalsy();
  });
});

describe("equipment display names", () => {
  const names: Record<LegacyEquipment, string> = {
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

  it.each(legacyEquipment)("names %s", (value) => {
    expect(legacyEquipmentToName(value)).toBe(names[value]);
  });
});
