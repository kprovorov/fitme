import { describe, expect, it } from "@jest/globals";
import { numberInRange } from "../form-schemas";

const age = numberInRange(4, 150, "Age is required");

const errorOf = (input: unknown) =>
  age.safeParse(input).error?.issues.map((issue) => issue.message);

describe("numberInRange", () => {
  it("coerces a number in range", () => {
    expect(age.parse("30")).toBe(30);
    expect(age.parse(4)).toBe(4);
  });

  it("shows the required message for a missing value", () => {
    expect(errorOf(undefined)).toEqual(["Age is required"]);
  });

  it("shows zod 3's range messages", () => {
    expect(errorOf(3)).toEqual(["Number must be greater than or equal to 4"]);
    expect(errorOf(151)).toEqual(["Number must be less than or equal to 150"]);
  });
});
