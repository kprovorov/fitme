import { describe, expect, it } from "@jest/globals";
import {
  describeSetTarget,
  formatSetTarget,
  formatSetWeight,
  setRepsField,
  setWeightField,
} from "../set-inputs";

const errorOf = (field: typeof setWeightField, input: string) =>
  field.safeParse(input).error?.issues.map((issue) => issue.message);

describe("setWeightField", () => {
  it("parses a weight with either decimal separator", () => {
    expect(setWeightField.parse("1,5")).toBe(1.5);
    expect(setWeightField.parse("1.5")).toBe(1.5);
    expect(setWeightField.parse("80")).toBe(80);
    expect(setWeightField.parse(" 22,25 ")).toBe(22.25);
  });

  it("takes 0 and 10,000 as bounds", () => {
    expect(setWeightField.parse("0")).toBe(0);
    expect(setWeightField.parse("10000")).toBe(10_000);
  });

  it("leaves an empty field empty, for the recommended value", () => {
    expect(setWeightField.parse("")).toBeNull();
    expect(setWeightField.parse("  ")).toBeNull();
  });

  it("refuses a malformed number", () => {
    expect(errorOf(setWeightField, "4..5")).toEqual([
      "Weight must be a number",
    ]);
    expect(errorOf(setWeightField, "1,2,3")).toEqual([
      "Weight must be a number",
    ]);
    expect(errorOf(setWeightField, ",")).toEqual(["Weight must be a number"]);
  });

  it("refuses a negative weight", () => {
    expect(errorOf(setWeightField, "-1")).toEqual(["Weight can't be negative"]);
  });

  it("refuses a weight over 10,000", () => {
    expect(errorOf(setWeightField, "10001")).toEqual([
      "Weight must be at most 10000",
    ]);
    expect(errorOf(setWeightField, "12345678")).toEqual([
      "Weight must be at most 10000",
    ]);
  });

  it("refuses more than 2 decimals", () => {
    expect(errorOf(setWeightField, "1.234")).toEqual([
      "Weight can have at most 2 decimals",
    ]);
  });
});

describe("setRepsField", () => {
  it("parses whole reps, 0 included", () => {
    expect(setRepsField.parse("12")).toBe(12);
    expect(setRepsField.parse("0")).toBe(0);
    expect(setRepsField.parse("1000")).toBe(1000);
  });

  it("leaves an empty field empty, for the recommended value", () => {
    expect(setRepsField.parse("")).toBeNull();
  });

  it("refuses anything but a whole number from 0 to 1,000", () => {
    expect(errorOf(setRepsField, "4..5")).toEqual(["Reps must be a number"]);
    expect(errorOf(setRepsField, "1,5")).toEqual([
      "Reps must be a whole number",
    ]);
    expect(errorOf(setRepsField, "-1")).toEqual(["Reps can't be negative"]);
    expect(errorOf(setRepsField, "1001")).toEqual([
      "Reps must be at most 1000",
    ]);
  });
});

describe("formatSetWeight", () => {
  it("shows a weight as the field takes it, without trailing zeros", () => {
    expect(formatSetWeight(80)).toBe("80");
    expect(formatSetWeight(1.5)).toBe("1,5");
    expect(formatSetWeight(22.25)).toBe("22,25");
    expect(formatSetWeight(0)).toBe("0");
  });
});

describe("formatSetTarget", () => {
  it("shows the recommended reps × weight with the unit", () => {
    expect(
      formatSetTarget({ reps_recommended: 12, weight_recommended: 45 }, "kg")
    ).toBe("12×45kg");
    expect(
      formatSetTarget({ reps_recommended: 8, weight_recommended: 22.5 }, "lbs")
    ).toBe("8×22,5lbs");
  });

  it("shows reps alone without a weight", () => {
    expect(
      formatSetTarget({ reps_recommended: 12, weight_recommended: null }, "kg")
    ).toBe("12");
    expect(
      formatSetTarget({ reps_recommended: 12, weight_recommended: 0 }, "kg")
    ).toBe("12");
  });

  it("shows the weight alone without reps", () => {
    expect(
      formatSetTarget({ reps_recommended: null, weight_recommended: 40 }, "kg")
    ).toBe("40kg");
  });

  it("shows a dash without a recommendation", () => {
    expect(
      formatSetTarget(
        { reps_recommended: null, weight_recommended: null },
        "kg"
      )
    ).toBe("–");
    expect(
      formatSetTarget({ reps_recommended: 0, weight_recommended: 0 }, "kg")
    ).toBe("–");
  });
});

describe("describeSetTarget", () => {
  it("reads reps at weight, with the unit spelled as shown", () => {
    expect(
      describeSetTarget(
        { reps_recommended: 10, weight_recommended: 50.5 },
        "kg"
      )
    ).toBe("10 reps at 50.5 kg");
  });

  it("reads whichever of reps and weight there is", () => {
    expect(
      describeSetTarget({ reps_recommended: 12, weight_recommended: 0 }, "kg")
    ).toBe("12 reps");
    expect(
      describeSetTarget(
        { reps_recommended: null, weight_recommended: 45 },
        "lbs"
      )
    ).toBe("45 lbs");
    expect(
      describeSetTarget({ reps_recommended: 0, weight_recommended: null }, "kg")
    ).toBe("no target");
  });
});
