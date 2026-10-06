import { describe, expect, it } from "vitest";
import { feetAndInchesToInches, inchesToFeetAndInches } from "../utils";

describe("inchesToFeetAndInches", () => {
  it("splits total inches into feet and inches", () => {
    expect(inchesToFeetAndInches(71)).toEqual({ feet: 5, inches: 11 });
  });

  it("handles zero inches", () => {
    expect(inchesToFeetAndInches(60)).toEqual({ feet: 5, inches: 0 });
  });

  it("rounds fractional inches before splitting", () => {
    expect(inchesToFeetAndInches(71.6)).toEqual({ feet: 6, inches: 0 });
  });

  it("rounds fractional inches down when below half", () => {
    expect(inchesToFeetAndInches(70.4)).toEqual({ feet: 5, inches: 10 });
  });
});

describe("feetAndInchesToInches", () => {
  it("combines feet and inches into total inches", () => {
    expect(feetAndInchesToInches(5, 11)).toBe(71);
  });

  it("round-trips with inchesToFeetAndInches", () => {
    const { feet, inches } = inchesToFeetAndInches(69);
    expect(feetAndInchesToInches(feet, inches)).toBe(69);
  });
});
