import { describe, expect, it } from "vitest";

import { feetAndInchesToInches, inchesToFeetAndInches } from "../utils";

describe("converting inches to feet and inches", () => {
  it("splits total inches into feet and inches", () => {
    expect(inchesToFeetAndInches(71)).toStrictEqual({ feet: 5, inches: 11 });
  });

  it("handles zero inches", () => {
    expect(inchesToFeetAndInches(60)).toStrictEqual({ feet: 5, inches: 0 });
  });

  it("rounds fractional inches before splitting", () => {
    expect(inchesToFeetAndInches(71.6)).toStrictEqual({ feet: 6, inches: 0 });
  });

  it("rounds fractional inches down when below half", () => {
    expect(inchesToFeetAndInches(70.4)).toStrictEqual({ feet: 5, inches: 10 });
  });
});

describe("converting feet and inches to total inches", () => {
  it("combines feet and inches into total inches", () => {
    expect(feetAndInchesToInches(5, 11)).toBe(71);
  });

  it("round-trips with inchesToFeetAndInches", () => {
    const { feet, inches } = inchesToFeetAndInches(69);
    expect(feetAndInchesToInches(feet, inches)).toBe(69);
  });
});
