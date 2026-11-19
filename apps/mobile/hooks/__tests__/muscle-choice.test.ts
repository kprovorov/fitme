import { describe, expect, it } from "@jest/globals";

import { isMuscleGroup } from "~/hooks/muscle-choice";

describe("isMuscleGroup", () => {
  it("takes every one of the new Library's Muscle groups", () => {
    expect(isMuscleGroup("core")).toBe(true);
    expect(isMuscleGroup("adductors")).toBe(true);
    expect(isMuscleGroup("neck")).toBe(true);
  });

  it("refuses a legacy group the new list folds in, and a missing param", () => {
    expect(isMuscleGroup("abs")).toBe(false);
    expect(isMuscleGroup("lats")).toBe(false);
    expect(isMuscleGroup(undefined)).toBe(false);
  });
});
