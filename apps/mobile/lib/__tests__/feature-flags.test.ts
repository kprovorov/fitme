/**
 * The notes flag: off unless the build turns it on, switched by a test with
 * its setter and put back after each test.
 */
import { describe, expect, it } from "@jest/globals";

import {
  isNotesEnabled,
  resetFeatureFlags,
  setNotesEnabled,
} from "~/lib/feature-flags";

describe("the notes flag", () => {
  it("is off by default", () => {
    expect(isNotesEnabled()).toBe(false);
  });

  it("is switched on and off by its setter", () => {
    setNotesEnabled(true);
    expect(isNotesEnabled()).toBe(true);

    setNotesEnabled(false);
    expect(isNotesEnabled()).toBe(false);
  });

  it("goes back to the build's value on reset", () => {
    setNotesEnabled(true);
    resetFeatureFlags();

    expect(isNotesEnabled()).toBe(false);
  });

  it("is switched on here, for the next test to find off", () => {
    setNotesEnabled(true);
    expect(isNotesEnabled()).toBe(true);
  });

  it("is off again after the last test switched it on", () => {
    expect(isNotesEnabled()).toBe(false);
  });
});
