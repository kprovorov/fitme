import { describe, expect, it } from "@jest/globals";
import { isBelowMinimumVersion } from "../app-version";

describe("isBelowMinimumVersion", () => {
  it("compares each part as a number, not as text", () => {
    expect(isBelowMinimumVersion("1.9.3", "1.10.0")).toBe(true);
    expect(isBelowMinimumVersion("1.10.0", "1.9.3")).toBe(false);
  });

  it("blocks a build below the minimum by major, minor or patch", () => {
    expect(isBelowMinimumVersion("1.4.2", "2.0.0")).toBe(true);
    expect(isBelowMinimumVersion("1.4.2", "1.5.0")).toBe(true);
    expect(isBelowMinimumVersion("1.4.2", "1.4.3")).toBe(true);
  });

  it("lets a build at or above the minimum through", () => {
    expect(isBelowMinimumVersion("1.4.2", "1.4.2")).toBe(false);
    expect(isBelowMinimumVersion("1.4.3", "1.4.2")).toBe(false);
    expect(isBelowMinimumVersion("2.0.0", "1.99.99")).toBe(false);
  });

  it("never blocks the 0.0.0 development placeholder", () => {
    expect(isBelowMinimumVersion("0.0.0", "1.0.0")).toBe(false);
  });

  it("never blocks when there is no minimum", () => {
    expect(isBelowMinimumVersion("1.0.0", null)).toBe(false);
  });

  it("never blocks when either version can't be read", () => {
    expect(isBelowMinimumVersion(undefined, "1.0.0")).toBe(false);
    expect(isBelowMinimumVersion("dev", "1.0.0")).toBe(false);
    expect(isBelowMinimumVersion("1.0.0", "latest")).toBe(false);
  });
});
